import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService } from "../../lib/careRouteService";
import { useAuth } from "../../hooks/useAuth";
import type { CareRouteRequest } from "../../types/careroute";
import EmergencyShareOutlinedIcon from "@mui/icons-material/EmergencyShareOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import NavigationOutlinedIcon from "@mui/icons-material/NavigationOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";

export const CareRouteMyRequestsPage: React.FC = () => {
  const { user, loginWithPi, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<CareRouteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualCode, setManualCode] = useState("");

  const loadRequests = async (username?: string) => {
    if (!username) return;
    setLoading(true);
    try {
      const data = await careRouteService.getPatientRequests(username);
      setRequests(data);
    } catch (err) {
      console.warn("Failed to load patient requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      loadRequests(user.username);
    } else {
      setLoading(false);
    }
  }, [user]);

  const activeRequest = requests.find(
    (r) => r.status !== "completed" && r.status !== "closed" && r.status !== "rejected"
  );
  const pastRequests = requests.filter((r) => r.id !== activeRequest?.id);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "submitted":
        return "careroute-badge careroute-badge-submitted";
      case "dispatched":
        return "careroute-badge careroute-badge-diverting";
      case "accepted":
        return "careroute-badge careroute-badge-active";
      case "completed":
        return "careroute-badge careroute-badge-active";
      case "closed":
        return "careroute-badge careroute-badge-inactive";
      default:
        return "careroute-badge";
    }
  };

  return (
    <CareRouteLayout>
      <div style={{ maxWidth: "860px", margin: "1rem auto 3rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span className="careroute-badge careroute-badge-submitted" style={{ marginBottom: "0.5rem" }}>
                Patient Medical Portal
              </span>
              <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.4rem", color: "#0f172a" }}>
                My Emergency CareRoute Requests
              </h1>
              <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
                {user?.username ? (
                  <>
                    Logged in via Pi Network as <strong>@{user.username}</strong> · Tracking your live and historical medical episodes.
                  </>
                ) : (
                  <>Track your past and active emergency ambulance dispatches and hospital admissions.</>
                )}
              </p>
            </div>

            {user?.username && (
              <button
                type="button"
                onClick={() => loadRequests(user.username)}
                className="careroute-btn-secondary"
                style={{ padding: "0.5rem 0.9rem", fontSize: "0.85rem" }}
              >
                <RefreshOutlinedIcon style={{ fontSize: "1rem" }} />
                <span>Refresh History</span>
              </button>
            )}
          </div>
        </div>

        {/* Not Logged In State */}
        {!user?.username && !isAuthLoading && (
          <div className="careroute-card" style={{ padding: "2rem", textAlign: "center", marginBottom: "2rem" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#fef3c7",
                color: "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}
            >
              <EmergencyShareOutlinedIcon style={{ fontSize: "2rem" }} />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0f172a" }}>
              Sign in with your Pi Network Account
            </h3>
            <p style={{ color: "#64748b", maxWidth: "480px", margin: "0 auto 1.5rem", fontSize: "0.925rem" }}>
              Sign in to view all past emergency requests automatically linked to your Pi username, or enter a specific tracking code below.
            </p>

            <button
              type="button"
              onClick={loginWithPi}
              className="careroute-btn-primary"
              style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem", margin: "0 auto 1.5rem" }}
            >
              <span>Sign In with π Network</span>
              <ArrowForwardRoundedIcon />
            </button>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1.5rem", maxWidth: "420px", margin: "0 auto" }}>
              <span style={{ fontSize: "0.825rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                OR TRACK BY SINGLE CODE
              </span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) navigate(`/careroute/track/${manualCode.trim()}`);
                }}
                style={{ display: "flex", gap: "0.5rem" }}
              >
                <input
                  type="text"
                  placeholder="Enter Tracking Code (e.g. CR-102938)"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  style={{ flex: 1, padding: "0.6rem 0.85rem", fontSize: "0.9rem" }}
                />
                <button type="submit" className="careroute-btn-secondary" style={{ padding: "0.6rem 1rem" }}>
                  <SearchOutlinedIcon style={{ fontSize: "1.1rem" }} />
                  <span>Lookup</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
            Loading your emergency episode history...
          </div>
        )}

        {/* Logged in Content */}
        {!loading && user?.username && (
          <>
            {/* 1. ACTIVE REQUEST BANNER (If ongoing) */}
            {activeRequest && (
              <div
                style={{
                  background: "#fff1f2",
                  border: "2px solid #fecdd3",
                  borderRadius: "12px",
                  padding: "1.5rem",
                  marginBottom: "2rem",
                  boxShadow: "0 4px 12px rgba(225, 29, 72, 0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#e11d48",
                        display: "inline-block",
                        animation: "pulse 1.5s infinite",
                      }}
                    />
                    <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#be123c", textTransform: "uppercase" }}>
                      Live Emergency Episode in Progress
                    </span>
                  </div>
                  <span className={getStatusBadgeClass(activeRequest.status)}>
                    {activeRequest.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#881337", fontWeight: 700, display: "block" }}>
                      TRACKING CODE
                    </span>
                    <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>{activeRequest.trackingCode}</strong>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#881337", fontWeight: 700, display: "block" }}>
                      ASSIGNED HOSPITAL
                    </span>
                    <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                      {activeRequest.assignedHospitalName || "Assigned Medical Center"}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#881337", fontWeight: 700, display: "block" }}>
                      EMERGENCY TYPE
                    </span>
                    <span style={{ fontSize: "0.95rem", color: "#0f172a", fontWeight: 600 }}>
                      {activeRequest.emergencyType}
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", color: "#881337", fontWeight: 700, display: "block" }}>
                      ESTIMATED ETA
                    </span>
                    <strong style={{ fontSize: "1.05rem", color: "#be123c" }}>
                      ~{activeRequest.etaMinutes || 12} mins
                    </strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Link
                    to={`/careroute/track/${activeRequest.trackingCode}`}
                    className="careroute-btn-primary"
                    style={{ fontSize: "0.9rem", padding: "0.65rem 1.25rem" }}
                  >
                    <NavigationOutlinedIcon style={{ fontSize: "1rem" }} />
                    <span>Track Live Real-Time Status</span>
                  </Link>

                  <a
                    href="tel:911"
                    className="careroute-btn-secondary"
                    style={{ fontSize: "0.9rem", padding: "0.65rem 1.15rem", color: "#dc2626", borderColor: "#fca5a5" }}
                  >
                    <span>Emergency Call (911)</span>
                  </a>

                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`Are you sure you want to cancel emergency request ${activeRequest.trackingCode}? The hospital will be notified.`)) {
                        await careRouteService.cancelRequest(activeRequest.trackingCode, "Cancelled from patient request portal");
                        if (user?.username) loadRequests(user.username);
                      }
                    }}
                    style={{
                      background: "#fff",
                      border: "1.5px solid #fca5a5",
                      color: "#dc2626",
                      borderRadius: "8px",
                      padding: "0.65rem 1.15rem",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <CancelOutlinedIcon style={{ fontSize: "1rem" }} />
                    <span>Cancel Request</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. HISTORY LIST */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                  Emergency History Archive
                </h3>
                <Link
                  to="/careroute/request"
                  className="careroute-btn-primary"
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                >
                  <EmergencyShareOutlinedIcon style={{ fontSize: "0.95rem" }} />
                  <span>New Emergency Request</span>
                </Link>
              </div>

              {pastRequests.length === 0 && !activeRequest ? (
                <div className="careroute-card" style={{ padding: "3rem", textAlign: "center" }}>
                  <CheckCircleOutlinedIcon style={{ fontSize: "2.5rem", color: "#16a34a", marginBottom: "0.75rem" }} />
                  <h4 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
                    No Emergency Requests Found
                  </h4>
                  <p style={{ color: "#64748b", margin: "0 0 1.5rem", fontSize: "0.9rem" }}>
                    You have not submitted any emergency requests under @{user.username} yet.
                  </p>
                  <Link to="/careroute/request" className="careroute-btn-primary" style={{ padding: "0.65rem 1.25rem" }}>
                    <span>Request Emergency Assistance</span>
                  </Link>
                </div>
              ) : pastRequests.length === 0 && activeRequest ? (
                <div style={{ color: "#64748b", fontSize: "0.9rem", padding: "1rem 0" }}>
                  No prior completed episodes. Your active episode is shown above.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {pastRequests.map((req) => (
                    <div
                      key={req.id}
                      className="careroute-card"
                      style={{
                        padding: "1.25rem 1.5rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "10px",
                            background: "#f1f5f9",
                            color: "#475569",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <LocalHospitalOutlinedIcon style={{ fontSize: "1.4rem" }} />
                        </div>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                              {req.emergencyType}
                            </strong>
                            <span className={getStatusBadgeClass(req.status)}>
                              {req.status.toUpperCase()}
                            </span>
                          </div>

                          <div style={{ fontSize: "0.825rem", color: "#64748b", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <span>Hospital: <strong>{req.assignedHospitalName || "Facility"}</strong></span>
                            <span>Code: <code>{req.trackingCode}</code></span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                              <AccessTimeOutlinedIcon style={{ fontSize: "0.85rem" }} />
                              {new Date(req.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Link
                        to={`/careroute/track/${req.trackingCode}`}
                        className="careroute-btn-secondary"
                        style={{ fontSize: "0.825rem", padding: "0.45rem 0.9rem" }}
                      >
                        <span>View Details</span>
                        <ArrowForwardRoundedIcon style={{ fontSize: "0.9rem" }} />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </CareRouteLayout>
  );
};

export default CareRouteMyRequestsPage;
