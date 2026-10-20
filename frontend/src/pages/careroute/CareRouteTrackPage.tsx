import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService } from "../../lib/careRouteService";
import type { CareRouteRequest, PatientRequestStatus } from "../../types/careroute";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

const TIMELINE_STEPS: { status: PatientRequestStatus; label: string; desc: string }[] = [
  { status: "submitted", label: "Submitted", desc: "Emergency request initiated by patient." },
  { status: "dispatched", label: "Sent to Hospital", desc: "Transmitted to hospital ER triage desk." },
  { status: "accepted", label: "Accepted", desc: "Hospital confirmed patient intake and reserved ER bay." },
  { status: "completed", label: "Completed", desc: "Patient arrived and admitted into emergency care." },
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
      if (!silent) setError("Failed to load tracking data from server.");
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
          message: `Intake ACCEPTED by ${fresh.assignedHospitalName || "Hospital"}! ER space reserved.`,
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
    return (
      (aId && (aId === bId || aId === bCode)) ||
      (aCode && (aCode === bCode || aCode === bId))
    );
  };

  // Setup initial data and live listeners
  useEffect(() => {
    if (requestId) {
      setSearchInput(requestId);
      loadTrackingData(requestId);
    } else {
      // Pick up latest request from storage & refresh immediately from MongoDB backend
      const all = JSON.parse(localStorage.getItem("smaj_careroute_requests_v2") || "[]");
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
        bc.onmessage = (event) => {
          const data = event.data;
          if (
            data &&
            (data.type === "REQUEST_UPDATED" || data.type === "REQUEST_CANCELLED") &&
            data.request
          ) {
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
            const match = list.find((r) => isSameRequest(r, current));
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
        careRouteService.getRequestByTrackingCode(code).then((fresh) => {
          if (fresh && currentRequestRef.current) {
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

    const finalReason = selectedReason === "Other reason" && customReasonText.trim()
      ? customReasonText.trim()
      : selectedReason;

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
          message: `Request ${currentRequest.trackingCode} has been cancelled successfully.`,
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

  return (
    <CareRouteLayout>
      <div style={{ maxWidth: "800px", margin: "1rem auto 3rem" }}>
        {/* Page Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span className="careroute-badge careroute-badge-submitted">
              Patient Tracking Portal
            </span>
            <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a", display: "inline-block", boxShadow: "0 0 0 3px rgba(22, 163, 74, 0.25)" }}></span>
              Live Telemetry Active (MongoDB Synchronized)
            </span>
          </div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0.4rem 0 0.3rem", color: "#0f172a" }}>
            Track Your Emergency Request
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
            Live dynamic updates as the hospital ER desk reviews, accepts, or diverts your dispatch.
          </p>
        </div>

        {/* Code Input Search Bar */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <input
            type="text"
            placeholder="Enter tracking code (e.g. CR-123456)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              flex: 1,
              padding: "0.8rem 1rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.95rem",
              outline: "none",
            }}
          />
          <button type="submit" className="careroute-btn-primary" style={{ padding: "0.8rem 1.6rem" }}>
            <SearchOutlinedIcon />
            <span>Track</span>
          </button>
        </form>

        {/* Live Event Toast Banner */}
        {liveToast && (
          <div
            style={{
              padding: "0.9rem 1.25rem",
              borderRadius: "8px",
              marginBottom: "1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background:
                liveToast.type === "success"
                  ? "#dcfce7"
                  : liveToast.type === "warning"
                  ? "#fee2e2"
                  : "#f1f5f9",
              border: `1px solid ${
                liveToast.type === "success"
                  ? "#86efac"
                  : liveToast.type === "warning"
                  ? "#fca5a5"
                  : "#cbd5e1"
              }`,
              color:
                liveToast.type === "success"
                  ? "#14532d"
                  : liveToast.type === "warning"
                  ? "#991b1b"
                  : "#334155",
              fontWeight: 600,
              fontSize: "0.925rem",
            }}
          >
            <span>{liveToast.message}</span>
            <button
              onClick={() => setLiveToast(null)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}
            >
              <CloseOutlinedIcon style={{ fontSize: "1rem" }} />
            </button>
          </div>
        )}

        {loading && <p style={{ color: "#64748b" }}>Loading CareRoute telemetry...</p>}
        {error && (
          <div className="careroute-alert-banner" style={{ borderLeftColor: "#ef4444", marginBottom: "1.25rem" }}>
            <span style={{ color: "#b91c1c" }}>{error}</span>
          </div>
        )}

        {currentRequest && (
          <div className="careroute-card" style={{ padding: "1.75rem" }}>
            {/* Header: Tracking code, Status badge, and Cancel Request Button */}
            <div
              style={{
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color:
                      currentRequest.status === "accepted"
                        ? "#16a34a"
                        : currentRequest.status === "rejected"
                        ? "#dc2626"
                        : currentRequest.status === "closed"
                        ? "#64748b"
                        : "#f59e0b",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    textTransform: "uppercase",
                    marginBottom: "0.25rem",
                  }}
                >
                  {currentRequest.status === "accepted" ? (
                    <CheckCircleOutlinedIcon style={{ fontSize: "1.1rem" }} />
                  ) : currentRequest.status === "rejected" ? (
                    <WarningAmberOutlinedIcon style={{ fontSize: "1.1rem" }} />
                  ) : (
                    <CheckCircleOutlinedIcon style={{ fontSize: "1.1rem" }} />
                  )}
                  <span>
                    {currentRequest.status === "accepted"
                      ? "Intake Confirmed"
                      : currentRequest.status === "rejected"
                      ? "Facility Diverted"
                      : currentRequest.status === "closed"
                      ? "Request Cancelled"
                      : "Request Sent to Hospital"}
                  </span>
                </span>
                <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                  Tracking Code: {currentRequest.trackingCode}
                </h2>
                <div style={{ fontSize: "0.825rem", color: "#64748b", marginTop: "4px" }}>
                  Dispatched: {new Date(currentRequest.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Telemetry updated: {new Date(currentRequest.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.6rem" }}>
                <span
                  className={`careroute-badge careroute-badge-${currentRequest.status}`}
                  style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem", fontWeight: 700 }}
                >
                  {statusDisplayMap[currentRequest.status]}
                </span>

                {/* Cancel Feature Button - Prominent Top Location */}
                {canCancel ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    style={{
                      background: "#fef2f2",
                      border: "1.5px solid #ef4444",
                      color: "#dc2626",
                      borderRadius: "8px",
                      padding: "0.45rem 0.95rem",
                      fontSize: "0.85rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 1px 3px rgba(220, 38, 38, 0.12)",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fee2e2";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fef2f2";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <CancelOutlinedIcon style={{ fontSize: "1.05rem" }} />
                    <span>Cancel Request</span>
                  </button>
                ) : currentRequest.status === "closed" ? (
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>
                    ✕ Cancelled / Finalized
                  </span>
                ) : null}
              </div>
            </div>

            {/* DYNAMIC STATUS BANNERS */}
            {/* 1. Accepted Banner */}
            {currentRequest.status === "accepted" && (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1.5px solid #86efac",
                  borderRadius: "10px",
                  padding: "1.25rem",
                  margin: "1.25rem 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      background: "#16a34a",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CheckCircleOutlinedIcon style={{ fontSize: "1.5rem" }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#14532d" }}>
                      Intake Confirmed by ER Desk!
                    </h3>
                    <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#166534" }}>
                      The hospital has reserved ER capacity for you.{" "}
                      {currentRequest.ambulanceAssigned && `Assigned Fleet: ${currentRequest.ambulanceAssigned}.`}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    style={{
                      background: "#dcfce7",
                      padding: "0.5rem 1rem",
                      borderRadius: "8px",
                      fontWeight: 800,
                      color: "#15803d",
                      fontSize: "1rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <AccessTimeOutlinedIcon style={{ fontSize: "1.15rem" }} />
                    <span>ETA: ~{currentRequest.etaMinutes || 10} Mins</span>
                  </div>
                  {currentRequest.assignedHospitalPhone && (
                    <a
                      href={`tel:${currentRequest.assignedHospitalPhone}`}
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "0.55rem 1rem",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <PhoneOutlinedIcon style={{ fontSize: "1rem" }} />
                      <span>Call Hospital</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 2. Rejected / Diverted Banner */}
            {currentRequest.status === "rejected" && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1.5px solid #fca5a5",
                  borderRadius: "10px",
                  padding: "1.25rem",
                  margin: "1.25rem 0",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      background: "#dc2626",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <WarningAmberOutlinedIcon style={{ fontSize: "1.5rem" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#991b1b" }}>
                      Intake Diverted: Facility at Capacity
                    </h3>
                    <p style={{ margin: "4px 0 0.75rem", fontSize: "0.875rem", color: "#b91c1c" }}>
                      {currentRequest.assignedHospitalName || "The selected hospital"} is currently diverting incoming emergency cases.
                      {currentRequest.responseNote && (
                        <span style={{ display: "block", marginTop: "4px", fontStyle: "italic", fontWeight: 600 }}>
                          Hospital Desk Note: "{currentRequest.responseNote}"
                        </span>
                      )}
                    </p>

                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                      <Link
                        to={`/careroute/hospitals?emergencyType=${encodeURIComponent(currentRequest.emergencyType)}`}
                        className="careroute-btn-primary"
                        style={{ padding: "0.6rem 1.25rem", fontSize: "0.85rem", textDecoration: "none" }}
                      >
                        <span>Find Alternate Hospital Now</span>
                      </Link>
                      <Link
                        to="/careroute/request"
                        style={{
                          background: "#fff",
                          border: "1px solid #cbd5e1",
                          color: "#334155",
                          borderRadius: "8px",
                          padding: "0.6rem 1.25rem",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        <span>Re-Submit Emergency Request</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Closed / Cancelled Banner */}
            {currentRequest.status === "closed" && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "1.25rem",
                  margin: "1.25rem 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#334155" }}>
                    Emergency Episode Finalized / Cancelled
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                    {currentRequest.responseNote || "This emergency request has been closed."}
                  </p>
                </div>
                <Link
                  to="/careroute/request"
                  className="careroute-btn-primary"
                  style={{ padding: "0.55rem 1.15rem", fontSize: "0.85rem", textDecoration: "none" }}
                >
                  <span>Need Care? New Request</span>
                </Link>
              </div>
            )}

            {/* 4. Pending / Dispatched Banner */}
            {(currentRequest.status === "submitted" || currentRequest.status === "dispatched") && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1.5px solid #fde68a",
                  borderRadius: "10px",
                  padding: "1rem 1.25rem",
                  margin: "1.25rem 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#f59e0b",
                    boxShadow: "0 0 0 4px rgba(245, 158, 11, 0.25)",
                    flexShrink: 0,
                  }}
                ></div>
                <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <span style={{ fontWeight: 800, color: "#92400e", fontSize: "0.95rem" }}>
                      Waiting for Hospital Intake Confirmation...
                    </span>
                    <div style={{ fontSize: "0.825rem", color: "#b45309", marginTop: "2px" }}>
                      Your emergency request is live on {currentRequest.assignedHospitalName}'s ER Triage Desk. Average response time: &lt; 30 seconds.
                    </div>
                  </div>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      style={{
                        background: "#fff",
                        border: "1px solid #f59e0b",
                        color: "#b45309",
                        borderRadius: "6px",
                        padding: "0.35rem 0.75rem",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Cancel Request
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Hospital & Dispatch Details Highlights */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                background: "#f8fafc",
                padding: "1.25rem",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                margin: "1.25rem 0",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  Designated Facility
                </span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1rem", marginTop: "2px" }}>
                  {currentRequest.assignedHospitalName}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "2px" }}>
                  <PhoneOutlinedIcon style={{ fontSize: "0.9rem", verticalAlign: "middle", marginRight: "3px" }} />
                  {currentRequest.assignedHospitalPhone || "+1 (555) 911-0000"}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  Patient & Emergency
                </span>
                <div style={{ fontWeight: 800, color: "#dc2626", fontSize: "1rem", marginTop: "2px" }}>
                  {currentRequest.emergencyType}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                  Patient: {currentRequest.patientName} {currentRequest.patientPhone ? `(${currentRequest.patientPhone})` : ""}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  Response & Dispatch
                </span>
                <div style={{ fontWeight: 800, color: currentRequest.status === "accepted" ? "#16a34a" : "#0f172a", fontSize: "1rem", marginTop: "2px" }}>
                  {currentRequest.status === "accepted" ? (
                    <span>
                      <DirectionsCarOutlinedIcon style={{ fontSize: "1.05rem", verticalAlign: "middle", marginRight: "4px" }} />
                      ETA: {currentRequest.etaMinutes ? `${currentRequest.etaMinutes} mins` : "10 minutes"}
                    </span>
                  ) : currentRequest.status === "rejected" ? (
                    <span style={{ color: "#dc2626" }}>Diverted by facility</span>
                  ) : currentRequest.status === "closed" ? (
                    <span style={{ color: "#64748b" }}>Closed</span>
                  ) : (
                    <span>Review in progress</span>
                  )}
                </div>
                {currentRequest.responseNote && (
                  <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "2px", fontStyle: "italic" }}>
                    "{currentRequest.responseNote}"
                  </div>
                )}
              </div>
            </div>

            {/* Status Timeline */}
            <h4 style={{ margin: "1.5rem 0 0.85rem", fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
              Patient Request Timeline
            </h4>
            <div className="careroute-timeline">
              {TIMELINE_STEPS.map((step) => {
                const state = getStepStatus(step.status);
                return (
                  <div key={step.status} className={`careroute-timeline-step ${state}`}>
                    <div className="careroute-timeline-marker">
                      {state === "completed" ? "✓" : state === "rejected" ? "✕" : "•"}
                    </div>
                    <div>
                      <strong
                        style={{
                          fontSize: "0.92rem",
                          color:
                            state === "rejected"
                              ? "#dc2626"
                              : state === "pending"
                              ? "#94a3b8"
                              : "#0f172a",
                        }}
                      >
                        {step.status === "accepted" && currentRequest.status === "rejected"
                          ? "Intake Diverted (Facility Full)"
                          : step.status === "closed" && currentRequest.status === "closed"
                          ? "Cancelled by Patient"
                          : step.label}
                      </strong>
                      <p style={{ margin: "0.15rem 0 0", fontSize: "0.825rem", color: "#64748b" }}>
                        {step.status === "accepted" && currentRequest.status === "rejected"
                          ? currentRequest.responseNote || "Hospital triage is diverting incoming requests due to ER capacity."
                          : step.status === "closed" && currentRequest.status === "closed"
                          ? currentRequest.responseNote || "Emergency dispatch episode closed."
                          : step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Pickup Details & Manual Refresh */}
            <div
              style={{
                borderTop: "1px solid #f1f5f9",
                paddingTop: "1rem",
                marginTop: "1rem",
                fontSize: "0.85rem",
                color: "#64748b",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <strong>Pickup Location:</strong> {currentRequest.pickupAddress}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    style={{
                      background: "#fff",
                      border: "1.5px solid #fca5a5",
                      color: "#dc2626",
                      borderRadius: "6px",
                      padding: "0.4rem 0.85rem",
                      fontSize: "0.825rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <CancelOutlinedIcon style={{ fontSize: "1rem" }} />
                    <span>Cancel Request</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadTrackingData(currentRequest.trackingCode)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontSize: "0.825rem",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <RefreshOutlinedIcon style={{ fontSize: "0.95rem" }} />
                  <span>Refresh Telemetry</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CANCEL REQUEST CONFIRMATION MODAL */}
        {showCancelModal && currentRequest && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                width: "100%",
                maxWidth: "480px",
                padding: "1.75rem",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "1rem" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    background: "#fee2e2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <CancelOutlinedIcon style={{ fontSize: "1.5rem" }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
                    Cancel Emergency Request?
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "#64748b" }}>
                    Tracking Code: <strong>{currentRequest.trackingCode}</strong>
                  </p>
                </div>
              </div>

              <p style={{ fontSize: "0.875rem", color: "#475569", lineHeight: 1.5, marginBottom: "1.25rem" }}>
                Are you sure you want to cancel this emergency dispatch? {currentRequest.assignedHospitalName} ER desk will be notified immediately.
              </p>

              {/* Cancellation Reason Selection */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "0.5rem", textTransform: "uppercase" }}>
                  Reason for Cancellation
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {CANCEL_REASONS.map((reason) => (
                    <label
                      key={reason}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "0.875rem",
                        color: "#334155",
                        cursor: "pointer",
                        padding: "0.4rem 0.5rem",
                        borderRadius: "6px",
                        background: selectedReason === reason ? "#f1f5f9" : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="cancelReason"
                        checked={selectedReason === reason}
                        onChange={() => setSelectedReason(reason)}
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>

                {selectedReason === "Other reason" && (
                  <input
                    type="text"
                    placeholder="Please specify reason..."
                    value={customReasonText}
                    onChange={(e) => setCustomReasonText(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: "0.5rem",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                    }}
                  />
                )}
              </div>

              {/* Modal Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={isSubmittingCancel}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    color: "#475569",
                    padding: "0.65rem 1.25rem",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Keep Request Active
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isSubmittingCancel}
                  style={{
                    background: "#dc2626",
                    border: "none",
                    color: "#ffffff",
                    padding: "0.65rem 1.25rem",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    cursor: isSubmittingCancel ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <CancelOutlinedIcon style={{ fontSize: "1rem" }} />
                  <span>{isSubmittingCancel ? "Cancelling..." : "Confirm Cancellation"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CareRouteLayout>
  );
};

export default CareRouteTrackPage;
