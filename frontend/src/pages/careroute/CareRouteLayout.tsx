import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import { useAuth } from "../../hooks/useAuth";
import "./careroute.css";

type CareRouteLayoutProps = {
  children: React.ReactNode;
  embedded?: boolean;
};

export const CareRouteLayout: React.FC<CareRouteLayoutProps> = ({ children, embedded = false }) => {
  const location = useLocation();
  const { user } = useAuth();

  const isHospitalDashboard = location.pathname.startsWith("/careroute/hospital-dashboard");

  return (
    <div className={`careroute-portal${embedded ? " careroute-embedded" : ""}`}>
      <header className="careroute-header">
        <div className="careroute-header-inner">
          <div className="careroute-brand-group">
            <Link to="/app/services" className="careroute-back-hub" title="Return to SMAJ PI HUB services">
              <ArrowBackRoundedIcon />
              <span>Back to Hub</span>
            </Link>
            <Link to="/careroute" className="careroute-brand" aria-label="SMAJ PI HUB Health — CareRoute">
              <div className="careroute-brand-icon">
                <img src="/logo.png" alt="SMAJ PI HUB" />
              </div>
              <div className="careroute-brand-text">
                <small>SMAJ PI HUB</small>
                Health <span> / CareRoute</span>
              </div>
            </Link>
          </div>

          {/* Right side: Adaptive nav based on staff auth state */}
          <nav className="careroute-nav" aria-label="CareRoute portal navigation">
            <NavLink to="/careroute/track"
            >
              Track Request
            </NavLink>

            <NavLink to="/careroute/my-requests"
            >
              My Requests
            </NavLink>

            {user?.username && (
              <NavLink to="/careroute/my-requests"
                title="Pi Network Authenticated Session"
              >
                <PersonOutlineOutlinedIcon />
                <span>π @{user.username}</span>
              </NavLink>
            )}

            {!isHospitalDashboard ? (
              <NavLink to="/careroute/hospital-dashboard"
                title="Open Hospital Emergency Triage Desk"
              >
                <DashboardOutlinedIcon />
                <span>Hospital ER Desk</span>
              </NavLink>
            ) : (
              <Link
                to="/services/health"
              >
                <ArrowBackRoundedIcon />
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
          SMAJ PI HUB &middot; Health &middot; CareRoute emergency coordination
        </div>
      </footer>
    </div>
  );
};

export default CareRouteLayout;
