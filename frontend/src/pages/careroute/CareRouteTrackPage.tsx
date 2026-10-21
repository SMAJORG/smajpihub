import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { CareDialog, formatCareDate, PageHeading, StatusBadge } from "./CareRouteUI";
import { careRouteService } from "../../lib/careRouteService";
import type { CareRouteRequest, PatientRequestStatus } from "../../types/careroute";

const TIMELINE_STEPS: { status: PatientRequestStatus; label: string; desc: string }[] = [
  { status: "submitted", label: "Submitted", desc: "Your request was created." },
  { status: "dispatched", label: "Sent to Hospital", desc: "Sent for review by the hospital." },
  { status: "accepted", label: "Accepted", desc: "The hospital accepted your request." },
  { status: "completed", label: "Completed", desc: "The hospital marked care as completed." },
  { status: "closed", label: "Closed / Finalized", desc: "Emergency episode finalized or cancelled." },
];

// Synthesized audio notification for live updates (no external audio files needed)
const playStatusTone = (type: "accepted" | "rejected" | "cancel") => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "accepted") {
      // Pleasant double chime: 587Hz -> 880Hz
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } else if (type === "rejected") {
      // Alert tone: 440Hz -> 330Hz
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(329.63, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } else if (type === "cancel") {
      // Muted neutral tone
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // ignore audio block
  }
};

const CANCEL_REASONS = [
  "Arranged private transport / family driving",
  "Patient condition improved / stabilized",
  "Selected wrong hospital / want another facility",
  "Submitted by mistake",
  "Other reason",
];

export const CareRouteTrackPage: React.FC = () => {
  const { requestId } = useParams();
  const [searchInput, setSearchInput] = useState(requestId || "");
  const [currentRequest, setCurrentRequest] = useState<CareRouteRequest | null>(null);
  const currentRequestRef = useRef<CareRouteRequest | null>(null);
  currentRequestRef.current = currentRequest;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<{ message: string; type: "success" | "warning" | "info" } | null>(null);

  // Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState(CANCEL_REASONS[0]);
  const [customReasonText, setCustomReasonText] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const loadTrackingData = async (code: string, silent = false) => {
    if (!code.trim()) return;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const found = await careRouteService.getRequestByTrackingCode(code.trim());
      if (found) {
        handleStateUpdate(found);
      } else if (!silent) {
        setError(`No active request found with tracking code "${code}". Please check your code.`);
      }
    } catch {
      setError("Unable to refresh this request. Saved details may be out of date.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleStateUpdate = (fresh: CareRouteRequest) => {
    const prev = currentRequestRef.current;
    if (prev && prev.status !== fresh.status) {
      if (fresh.status === "accepted") {
        playStatusTone("accepted");
        setLiveToast({
          type: "success",
          message: `Intake ACCEPTED by ${fresh.assignedHospitalName || "Hospital"}! Check the hospital response below.`,
        });
      } else if (fresh.status === "rejected") {
        playStatusTone("rejected");
        setLiveToast({
          type: "warning",
          message: `Request DIVERTED by ${fresh.assignedHospitalName || "Hospital"}. Please select another facility.`,
        });
      } else if (fresh.status === "closed") {
        playStatusTone("cancel");
        setLiveToast({
          type: "info",
          message: "Emergency request has been finalized or cancelled.",
        });
      }
    }
    setCurrentRequest(fresh);
  };

  const isSameRequest = (a?: CareRouteRequest | null, b?: CareRouteRequest | null) => {
    if (!a || !b) return false;
    const aId = (a.id || "").trim().toLowerCase();
    const aCode = (a.trackingCode || "").trim().toLowerCase();
    const bId = (b.id || "").trim().toLowerCase();
    const bCode = (b.trackingCode || "").trim().toLowerCase();
    return (aId && (aId === bId || aId === bCode)) || (aCode && (aCode === bCode || aCode === bId));
  };

  // Setup initial data and live listeners
  useEffect(() => {
    if (requestId) {
      setSearchInput(requestId);
      loadTrackingData(requestId);
    } else {
      // Pick up latest request from storage & refresh immediately from MongoDB backend
      let all: CareRouteRequest[] = [];
      try {
        all = JSON.parse(localStorage.getItem("smaj_careroute_requests_v2") || "[]");
      } catch {
        /* Corrupt cache: tracking by code remains available. */
      }
      if (all.length > 0) {
        setCurrentRequest(all[0]);
        const targetCode = all[0].trackingCode || all[0].id;
        setSearchInput(targetCode);
        loadTrackingData(targetCode, true);
      }
    }
  }, [requestId]);

  // Live real-time multi-channel synchronization
  useEffect(() => {
    // 1. Same-window custom event
    const handleCustomEvent = (e: Event) => {
      const updated = (e as CustomEvent).detail as CareRouteRequest;
      if (isSameRequest(updated, currentRequestRef.current)) {
        handleStateUpdate(updated);
      }
    };
    window.addEventListener("careroute_request_updated", handleCustomEvent);

    // 2. Cross-tab BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel("careroute_emergency_channel");
        bc.onmessage = event => {
          const data = event.data;
          if (data && (data.type === "REQUEST_UPDATED" || data.type === "REQUEST_CANCELLED") && data.request) {
            const req = data.request as CareRouteRequest;
            if (isSameRequest(req, currentRequestRef.current)) {
              handleStateUpdate(req);
            }
          }
        };
      }
    } catch {
      // ignore
    }

    // 3. Cross-tab localStorage storage event (supporting broadcast signal + direct list update)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "smaj_careroute_broadcast_signal" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.request && isSameRequest(parsed.request, currentRequestRef.current)) {
            handleStateUpdate(parsed.request);
          }
        } catch {
          // ignore
        }
      }
      if (e.key === "smaj_careroute_requests_v2" && e.newValue) {
        try {
          const list: CareRouteRequest[] = JSON.parse(e.newValue);
          const current = currentRequestRef.current;
          if (current) {
            const match = list.find(r => isSameRequest(r, current));
            if (match) {
              handleStateUpdate(match);
            }
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    // 4. Active short-polling (every 1.5s directly queries MongoDB backend)
    const interval = window.setInterval(() => {
      const current = currentRequestRef.current;
      const code = current?.trackingCode || current?.id;
      if (code) {
        careRouteService.getRequestByTrackingCode(code).then(fresh => {
          if (fresh && isSameRequest(fresh, currentRequestRef.current)) {
            handleStateUpdate(fresh);
          }
        });
      }
    }, 1500);

    return () => {
      window.removeEventListener("careroute_request_updated", handleCustomEvent);
      window.removeEventListener("storage", handleStorage);
      if (bc) bc.close();
      clearInterval(interval);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput) loadTrackingData(searchInput);
  };

  const handleConfirmCancel = async () => {
    if (!currentRequest) return;
    setIsSubmittingCancel(true);

    const finalReason =
      selectedReason === "Other reason" && customReasonText.trim() ? customReasonText.trim() : selectedReason;

    try {
      const updated = await careRouteService.cancelRequest(
        currentRequest.trackingCode || currentRequest.id,
        finalReason
      );
      if (updated) {
        handleStateUpdate(updated);
        setShowCancelModal(false);
        setLiveToast({
          type: "info",
          message: `Cancellation recorded for ${currentRequest.trackingCode}. Check the connection status for server confirmation.`,
        });
      }
    } catch {
      setError("Failed to cancel request. Please try again or call the emergency desk.");
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const getStepStatus = (stepStatus: PatientRequestStatus) => {
    if (!currentRequest) return "pending";

    if (currentRequest.status === "rejected") {
      if (stepStatus === "submitted" || stepStatus === "dispatched") return "completed";
      if (stepStatus === "accepted") return "rejected";
      return "pending";
    }

    if (currentRequest.status === "closed") {
      if (stepStatus === "submitted" || stepStatus === "dispatched") return "completed";
      if (stepStatus === "closed") return "current";
      return "pending";
    }

    const order: PatientRequestStatus[] = ["submitted", "dispatched", "accepted", "completed", "closed"];
    const currentIndex = order.indexOf(currentRequest.status);
    const stepIndex = order.indexOf(stepStatus);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "pending";
  };

  const statusDisplayMap: Record<PatientRequestStatus, string> = {
    submitted: "Submitted",
    dispatched: "Sent to Hospital",
    accepted: "Accepted",
    rejected: "Rejected / Diverted",
    completed: "Completed",
    closed: "Cancelled / Closed",
  };

  const canCancel =
    currentRequest &&
    (currentRequest.status === "submitted" ||
      currentRequest.status === "dispatched" ||
      currentRequest.status === "accepted");

  const timelineSteps =
    currentRequest?.status === "closed"
      ? [TIMELINE_STEPS[0], TIMELINE_STEPS[4]]
      : TIMELINE_STEPS.filter(step => step.status !== "closed");
  return (
    <CareRouteLayout>
      <PageHeading
        eyebrow="Request tracking"
        title="Follow your care"
        description="Check the hospital response and the latest recorded status."
        actions={
          <Link className="careroute-btn-primary" to="/careroute/request">
            New emergency request
          </Link>
        }
      />
      <form className="cr-panel cr-code-form" onSubmit={handleSearch}>
        <label htmlFor="tracking-code">Tracking code</label>
        <div>
          <input
            id="tracking-code"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Enter your request code"
            required
            autoCapitalize="characters"
          />
          <button className="careroute-btn-primary" type="submit" disabled={loading}>
            {loading ? "Finding request..." : "Track request"}
          </button>
        </div>
      </form>
      {liveToast && (
        <div className={`cr-message cr-message-${liveToast.type}`} role="status">
          <span>{liveToast.message}</span>
          <button className="cr-icon-button" onClick={() => setLiveToast(null)} aria-label="Dismiss update">
            &times;
          </button>
        </div>
      )}
      {error && (
        <div className="cr-message cr-message-error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="cr-loading" role="status">
          Loading request details...
        </div>
      )}
      {!currentRequest && !loading && !error && (
        <div className="cr-panel cr-empty">
          <h2>Your request, at a glance</h2>
          <p>Enter the code from your request confirmation to view its status and hospital response.</p>
          <Link className="cr-text-link" to="/careroute/my-requests">
            Find my requests
          </Link>
        </div>
      )}
      {currentRequest && (
        <div className="cr-tracking-grid">
          <section className="cr-panel cr-tracking-summary">
            <div className="cr-card-top">
              <span className="cr-eyebrow">{currentRequest.trackingCode || currentRequest.id}</span>
              <StatusBadge status={currentRequest.status} />
            </div>
            <h2>{currentRequest.emergencyType}</h2>
            <p>{currentRequest.assignedHospitalName || "Hospital name not available"}</p>
            <div className={`cr-response cr-response-${currentRequest.status}`}>
              <strong>{statusDisplayMap[currentRequest.status]}</strong>
              <p>
                {currentRequest.responseNote ||
                  (currentRequest.status === "accepted"
                    ? "The hospital has accepted your request."
                    : currentRequest.status === "rejected"
                      ? "The hospital diverted this request. You can look for another hospital below."
                      : currentRequest.status === "closed"
                        ? "This request is closed. No further updates are expected."
                        : currentRequest.status === "completed"
                          ? "The hospital marked this request as completed."
                          : "Waiting for the hospital to review your request.")}
              </p>
            </div>
            <dl className="cr-detail-grid">
              <div>
                <dt>Patient</dt>
                <dd>{currentRequest.patientName || "Not provided"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{currentRequest.patientPhone || "Not provided"}</dd>
              </div>
              <div>
                <dt>Pickup location</dt>
                <dd>{currentRequest.pickupAddress || "Not provided"}</dd>
              </div>
              <div>
                <dt>Hospital ETA</dt>
                <dd>
                  {typeof currentRequest.etaMinutes === "number" ? currentRequest.etaMinutes + " min" : "Not provided"}
                </dd>
              </div>
              {currentRequest.ambulanceAssigned && (
                <div>
                  <dt>Assigned ambulance</dt>
                  <dd>{currentRequest.ambulanceAssigned}</dd>
                </div>
              )}
              <div>
                <dt>Last recorded update</dt>
                <dd>{formatCareDate(currentRequest.updatedAt)}</dd>
              </div>
            </dl>
            <div className="cr-card-footer">
              <button
                className="careroute-btn-secondary"
                disabled={loading}
                onClick={() => loadTrackingData(currentRequest.trackingCode || currentRequest.id)}
              >
                Refresh status
              </button>
              {currentRequest.assignedHospitalPhone && (
                <a className="careroute-btn-secondary" href={`tel:${currentRequest.assignedHospitalPhone}`}>
                  Call hospital
                </a>
              )}
              {canCancel && (
                <button className="cr-text-button cr-danger" onClick={() => setShowCancelModal(true)}>
                  Cancel request
                </button>
              )}
              {currentRequest.status === "rejected" && (
                <Link
                  className="careroute-btn-primary"
                  to={`/careroute/hospitals?emergencyType=${encodeURIComponent(currentRequest.emergencyType)}`}
                >
                  Find another hospital
                </Link>
              )}
            </div>
          </section>
          <section className="cr-panel cr-progress-panel" aria-labelledby="request-progress-title">
            <h2 id="request-progress-title">Request progress</h2>
            <ol className="cr-progress-list">
              {timelineSteps.map(step => {
                const state = getStepStatus(step.status);
                const diverted = step.status === "accepted" && currentRequest.status === "rejected";
                const current = step.status === currentRequest.status || diverted;
                return (
                  <li
                    key={step.status}
                    className={`cr-progress-step cr-progress-${state}`}
                    aria-current={current ? "step" : undefined}
                  >
                    <i aria-hidden="true">{state === "completed" ? "\u2713" : diverted ? "!" : ""}</i>
                    <div>
                      <strong>{diverted ? "Diverted by hospital" : step.label}</strong>
                      <p>{diverted ? "Review the hospital response before requesting another facility." : step.desc}</p>
                      {(step.status === "submitted" || current) && (
                        <time>
                          {formatCareDate(
                            step.status === "submitted" ? currentRequest.createdAt : currentRequest.updatedAt
                          )}
                        </time>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="cr-caption">Times are shown only when provided by the request record.</p>
          </section>
        </div>
      )}
      {showCancelModal && currentRequest && (
        <CareDialog title="Cancel this request?" busy={isSubmittingCancel} onClose={() => setShowCancelModal(false)}>
          <p>
            This will close request <strong>{currentRequest.trackingCode}</strong>. If your connection is interrupted,
            contact the hospital to confirm.
          </p>
          <fieldset className="cr-reasons">
            <legend>Reason for cancellation</legend>
            {CANCEL_REASONS.map(reason => (
              <label key={reason}>
                <input
                  type="radio"
                  name="cancel-reason"
                  checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)}
                />
                {reason}
              </label>
            ))}
          </fieldset>
          {selectedReason === "Other reason" && (
            <label className="cr-field">
              Your reason
              <input
                value={customReasonText}
                onChange={e => setCustomReasonText(e.target.value)}
                placeholder="Tell us why"
              />
            </label>
          )}
          <div className="cr-actions">
            <button
              className="careroute-btn-secondary"
              disabled={isSubmittingCancel}
              onClick={() => setShowCancelModal(false)}
            >
              Keep request
            </button>
            <button className="cr-button-danger" disabled={isSubmittingCancel} onClick={handleConfirmCancel}>
              {isSubmittingCancel ? "Cancelling..." : "Confirm cancellation"}
            </button>
          </div>
        </CareDialog>
      )}
    </CareRouteLayout>
  );
};
export default CareRouteTrackPage;
