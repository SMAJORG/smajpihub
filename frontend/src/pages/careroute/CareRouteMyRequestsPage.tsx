import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService } from "../../lib/careRouteService";
import { useAuth } from "../../hooks/useAuth";
import type { CareRouteRequest } from "../../types/careroute";
import { CareDialog, formatCareDate, isActiveRequest, PageHeading, StatusBadge } from "./CareRouteUI";

export const CareRouteMyRequestsPage = () => {
  const { user, loginWithPi, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<CareRouteRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [tab, setTab] = useState<"active" | "history">("active");
  const [cancelTarget, setCancelTarget] = useState<CareRouteRequest | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const generation = useRef(0);
  const loadRequests = async (username: string) => {
    const version = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const data = await careRouteService.getPatientRequests(username);
      if (version === generation.current)
        setRequests([...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    } catch {
      if (version === generation.current) setError("We couldn't load your requests. Please try again.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    setRequests([]);
    if (user?.username) void loadRequests(user.username);
    else {
      generation.current++;
      setLoading(false);
    }
    return () => {
      generation.current++;
    };
  }, [user?.username]);
  const active = requests.filter(r => isActiveRequest(r.status));
  const history = requests.filter(r => !isActiveRequest(r.status));
  const visible = tab === "active" ? active : history;
  const cancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await careRouteService.cancelRequest(
        cancelTarget.trackingCode || cancelTarget.id,
        "Cancelled from patient request portal"
      );
      if (!result) throw new Error("Not saved");
      setRequests(previous => previous.map(r => (r.id === cancelTarget.id ? result : r)));
      setCancelTarget(null);
      if (user?.username) await loadRequests(user.username);
    } catch {
      setError("Cancellation could not be confirmed. Please refresh or contact your hospital.");
    } finally {
      setCancelling(false);
    }
  };
  return (
    <CareRouteLayout>
      <PageHeading
        eyebrow="Your care"
        title="My requests"
        description="Your ongoing requests and previous hospital responses."
        actions={
          <>
            <Link className="careroute-btn-primary" to="/careroute/request">
              New request
            </Link>
            {user?.username && (
              <button
                className="careroute-btn-secondary"
                disabled={loading}
                onClick={() => {
                  if (user.username) void loadRequests(user.username);
                }}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            )}
          </>
        }
      />
      {error && (
        <div role="alert" className="cr-message cr-message-error">
          {error}
        </div>
      )}
      {isAuthLoading ? (
        <div className="cr-loading" role="status">
          Checking your Pi account...
        </div>
      ) : !user?.username ? (
        <section className="cr-panel cr-signin">
          <div className="cr-eyebrow">Private request history</div>
          <h2>Keep your care in one place</h2>
          <p>Sign in with Pi to see requests linked to your account. You can also track a request using its code.</p>
          <button
            className="careroute-btn-primary"
            onClick={async () => {
              try {
                await loginWithPi();
              } catch {
                setError("Pi sign-in couldn't be completed. Please try again.");
              }
            }}
          >
            Sign in with Pi
          </button>
        </section>
      ) : (
        <>
          <div className="cr-account-line">
            Requests for <strong>@{user.username}</strong>
          </div>
          <div className="cr-segments" role="group" aria-label="Request categories">
            <button aria-pressed={tab === "active"} onClick={() => setTab("active")}>
              Active <span>{active.length}</span>
            </button>
            <button aria-pressed={tab === "history"} onClick={() => setTab("history")}>
              History <span>{history.length}</span>
            </button>
          </div>
          {loading ? (
            <div className="cr-loading" role="status">
              Loading your requests...
            </div>
          ) : visible.length === 0 ? (
            <div className="cr-panel cr-empty">
              <h2>{tab === "active" ? "No active requests" : "No previous requests"}</h2>
              <p>
                {tab === "active"
                  ? "Your ongoing requests will appear here."
                  : "Completed, closed and diverted requests will appear here."}
              </p>
              <Link className="cr-text-link" to="/careroute/request">
                Start a request
              </Link>
            </div>
          ) : (
            <div className="cr-request-list">
              {visible.map(request => (
                <article className="cr-panel cr-history-card" key={request.id}>
                  <div className="cr-card-top">
                    <span className="cr-eyebrow">{request.trackingCode || request.id}</span>
                    <StatusBadge status={request.status} />
                  </div>
                  <h2>{request.emergencyType}</h2>
                  <p>{request.assignedHospitalName || "Hospital name not available"}</p>
                  <dl className="cr-inline-details">
                    <div>
                      <dt>Submitted</dt>
                      <dd>{formatCareDate(request.createdAt)}</dd>
                    </div>
                    {isActiveRequest(request.status) && (
                      <div>
                        <dt>Hospital ETA</dt>
                        <dd>{typeof request.etaMinutes === "number" ? `${request.etaMinutes} min` : "Not provided"}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="cr-card-footer">
                    <Link
                      to={`/careroute/track/${encodeURIComponent(request.trackingCode || request.id)}`}
                      className="careroute-btn-secondary"
                    >
                      View details
                    </Link>
                    {request.assignedHospitalPhone && (
                      <a className="cr-text-link" href={`tel:${request.assignedHospitalPhone}`}>
                        Call hospital
                      </a>
                    )}
                    {isActiveRequest(request.status) && (
                      <button className="cr-text-button cr-danger" onClick={() => setCancelTarget(request)}>
                        Cancel request
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <form
        className="cr-panel cr-code-form"
        onSubmit={e => {
          e.preventDefault();
          if (manualCode.trim()) navigate(`/careroute/track/${encodeURIComponent(manualCode.trim())}`);
        }}
      >
        <label htmlFor="history-code">Have a tracking code?</label>
        <div>
          <input
            id="history-code"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            placeholder="Enter your request code"
            required
            autoCapitalize="characters"
          />
          <button className="careroute-btn-secondary" type="submit">
            Track request
          </button>
        </div>
      </form>
      {cancelTarget && (
        <CareDialog title="Cancel this request?" busy={cancelling} onClose={() => setCancelTarget(null)}>
          <p>
            Cancel request <strong>{cancelTarget.trackingCode}</strong> with{" "}
            {cancelTarget.assignedHospitalName || "your hospital"}? Confirm the change with the hospital if your
            connection is interrupted.
          </p>
          <div className="cr-actions">
            <button className="careroute-btn-secondary" disabled={cancelling} onClick={() => setCancelTarget(null)}>
              Keep request
            </button>
            <button className="cr-button-danger" disabled={cancelling} onClick={cancel}>
              {cancelling ? "Cancelling..." : "Cancel request"}
            </button>
          </div>
        </CareDialog>
      )}
    </CareRouteLayout>
  );
};
export default CareRouteMyRequestsPage;
