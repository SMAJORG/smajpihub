import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import FavoriteBorderRoundedIcon from "@mui/icons-material/FavoriteBorderRounded";
import { getHospitalStaff, STAFF_CHANGED } from "../../lib/careRouteStaffSession";
import { ConnectionBanner } from "./CareRouteUI";
import "./careroute.css";
import "./careroute-modern.css";

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
  return (
    <div className={`careroute-portal cr-product${embedded ? " careroute-embedded" : ""}`}>
      <header className="cr-header">
        <div className="cr-header-inner">
          <Link to="/careroute" className="cr-brand" aria-label="CareRoute home">
            <i>
              <FavoriteBorderRoundedIcon />
            </i>
            <div>
              <strong>CareRoute</strong>
              <small>SMAJ PI HUB Health</small>
            </div>
          </Link>
          <div className="cr-header-links">
            <Link to="/app/services" className="cr-hub-link">
              <img src="/logo.png" alt="" />
              Back to hub
            </Link>
            {staff && (
              <NavLink to="/careroute/hospital-dashboard" className="cr-staff-link">
                ER desk
              </NavLink>
            )}
          </div>
        </div>
        {!staffPage && (
          <nav className="cr-patient-nav" aria-label="CareRoute navigation">
            <NavLink to="/careroute" end>
              Home
            </NavLink>
            <NavLink to="/careroute/request">Request help</NavLink>
            <NavLink to="/careroute/track">Track</NavLink>
            <NavLink to="/careroute/my-requests">My requests</NavLink>
          </nav>
        )}
      </header>
      <main className="careroute-main cr-main">
        <ConnectionBanner />
        {children}
      </main>
      <footer className="cr-footer">
        <span>CareRoute by SMAJ PI HUB</span>
        <Link to="/careroute/hospital-dashboard">Hospital staff sign-in</Link>
      </footer>
    </div>
  );
};
export default CareRouteLayout;
