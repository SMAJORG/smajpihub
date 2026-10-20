import React from "react";
import { Link, useLocation } from "react-router-dom";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import { useAuth } from "../../hooks/useAuth";
import "./careroute.css";

type CareRouteLayoutProps = {
  children: React.ReactNode;
};

export const CareRouteLayout: React.FC<CareRouteLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();

  const isHospitalDashboard = location.pathname.startsWith("/careroute/hospital-dashboard");

  return (
    <div className="careroute-portal">
      <header className="careroute-header">
        <div className="careroute-header-inner">
          <div className="careroute-brand-group">
            <Link to="/services/health" className="careroute-back-hub" title="Return to SMAJ PI HUB Health">
              <ArrowBackRoundedIcon style={{ fontSize: "1rem" }} />
              <span>Back to Health</span>
            </Link>
            <Link to="/careroute" className="careroute-brand">
              <div className="careroute-brand-icon">
                <LocalHospitalOutlinedIcon />
              </div>
              <div className="careroute-brand-text">
                Care<span>Route</span>
              </div>
            </Link>
          </div>

          {/* Right side: Adaptive nav based on staff auth state */}
          <nav className="careroute-nav" aria-label="CareRoute portal navigation" style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link
              to="/careroute/track"
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: location.pathname.startsWith("/careroute/track") ? "#dc2626" : "#475569",
                textDecoration: "none",
                padding: "0.4rem 0.75rem",
                borderRadius: "6px",
              }}
            >
              Track Request
            </Link>

            <Link
              to="/careroute/my-requests"
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: location.pathname.startsWith("/careroute/my-requests") ? "#dc2626" : "#475569",
                textDecoration: "none",
                padding: "0.4rem 0.75rem",
                borderRadius: "6px",
                background: location.pathname.startsWith("/careroute/my-requests") ? "#fef2f2" : "transparent",
              }}
            >
              My Requests
            </Link>

            {user?.username && (
              <Link
                to="/careroute/my-requests"
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "#15803d",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "0.3rem 0.65rem",
                  borderRadius: "20px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Pi Network Authenticated Session"
              >
                <PersonOutlineOutlinedIcon style={{ fontSize: "0.95rem" }} />
                <span>π @{user.username}</span>
              </Link>
            )}

            {!isHospitalDashboard ? (
              <Link
                to="/careroute/hospital-dashboard"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#1d4ed8",
                  textDecoration: "none",
                  padding: "0.4rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Open Hospital Emergency Triage Desk"
              >
                <DashboardOutlinedIcon style={{ fontSize: "0.95rem" }} />
                <span>Hospital ER Desk</span>
              </Link>
            ) : (
              <Link
                to="/services/health"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#475569",
                  textDecoration: "none",
                  padding: "0.4rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <ArrowBackRoundedIcon style={{ fontSize: "0.95rem" }} />
                <span>Health Hub</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="careroute-main">
        {children}
      </main>

      <footer className="careroute-footer">
        <div>
          CareRoute Emergency Coordination Portal · Built for the Pi Network Ecosystem · Strict Hospital Data Isolation
        </div>
      </footer>
    </div>
  );
};

export default CareRouteLayout;
