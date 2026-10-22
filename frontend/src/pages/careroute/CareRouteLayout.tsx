import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import CareRouteHeartIcon from "./CareRouteHeartIcon";
import { getHospitalStaff, STAFF_CHANGED } from "../../lib/careRouteStaffSession";
import { ConnectionBanner } from "./CareRouteUI";
import "./careroute.css";
import "./careroute-modern.css";
import "./careroute-dashboard.css";

type CareRouteLayoutProps = { children: ReactNode; embedded?: boolean };
export const CareRouteLayout = ({ children, embedded = false }: CareRouteLayoutProps) => {
  const location = useLocation();
  const [staff, setStaff] = useState(getHospitalStaff);
  useEffect(() => {
    const update = () => setStaff(getHospitalStaff());
    window.addEventListener(STAFF_CHANGED, update);
    return () => window.removeEventListener(STAFF_CHANGED, update);
  }, []);
  const staffPage = location.pathname.includes("hospital-dashboard");
  const homePage = location.pathname === "/careroute" || location.pathname === "/app/services/health";
  return (
    <div className={`careroute-portal cr-product cr-reference-design${embedded ? " careroute-embedded" : ""}`}>
      <header className="cr-header">
        <div className="cr-header-inner">
          <Link to="/careroute" className="cr-brand" aria-label="CareRoute home">
            <span className="cr-health-card-icon">
              <CareRouteHeartIcon />
            </span>
            <div>
              <strong>CareRoute</strong>
              <small>SMAJ PI HEALTH</small>
            </div>
          </Link>
          <div className="cr-header-links">
            {staff && (
              <NavLink to="/careroute/hospital-dashboard" className="cr-staff-link">
                ER desk
              </NavLink>
            )}
            <Link to="/notifications" className="cr-notification-link" aria-label="Notifications">
              <NotificationsNoneRoundedIcon />
            </Link>
          </div>
        </div>
      </header>
      <main className="careroute-main cr-main">
        <ConnectionBanner quiet={homePage} />
        {children}
      </main>
      <footer className="cr-footer">
        <Link to="/app/services">Back to SMAJ PI HUB</Link>
        <Link to="/careroute/hospital-dashboard">Hospital staff sign-in</Link>
      </footer>
      {!staffPage && (
        <nav className="cr-bottom-nav" aria-label="CareRoute navigation">
          <NavLink to="/careroute" end className={({ isActive }) => (isActive || homePage ? "active" : "")}>
            <HomeOutlinedIcon />
            <span>Home</span>
          </NavLink>
          <NavLink to="/careroute/request">
            <CareRouteHeartIcon />
            <span>Emergency</span>
          </NavLink>
          <NavLink
            to="/careroute/my-requests"
            className={({ isActive }) => (isActive || location.pathname.startsWith("/careroute/track") ? "active" : "")}
          >
            <AssignmentOutlinedIcon />
            <span>Requests</span>
          </NavLink>
          <NavLink to="/profile">
            <PersonOutlineRoundedIcon />
            <span>Profile</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
};
export default CareRouteLayout;
