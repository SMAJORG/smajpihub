import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CareRouteLayout from "./CareRouteLayout";
import { StatusBadge } from "./CareRouteUI";
import { useAuth } from "../../hooks/useAuth";
import { careRouteService } from "../../lib/careRouteService";
import type { CareRouteRequest } from "../../types/careroute";

export const CareRouteHomePage = ({ embedded = false }: { embedded?: boolean }) => {
  const { user, isLoading: authLoading } = useAuth();
  const [recent, setRecent] = useState<CareRouteRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted = true;
    let generation = 0;
    setRecent(null);
    setError(false);
    if (!user?.username) {
      setLoading(false);
      return;
    }
    const username = user.username;
    const refresh = async () => {
      const version = ++generation;
      setLoading(true);
      try {
        const requests = await careRouteService.getPatientRequests(username);
        if (mounted && version === generation) {
          setRecent(
            [...requests].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))[0] || null
          );
          setError(false);
        }
      } catch {
        if (mounted && version === generation) setError(true);
      } finally {
        if (mounted && version === generation) setLoading(false);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("careroute_request_updated", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("careroute_request_updated", refresh);
    };
  }, [user?.username]);

  return (
    <CareRouteLayout embedded={embedded}>
      <div className="cr-patient-dashboard">
        <section className="cr-dashboard-hero" aria-labelledby="careroute-home-title">
          <div className="cr-dashboard-eyebrow">Patient dashboard</div>
          <h1 id="careroute-home-title">Emergency Care, Made Simple.</h1>
          <p>Find care, send emergency requests, and track hospital responses in one place.</p>
          <Link to="/careroute/request" className="cr-emergency-action">
            <AddRoundedIcon />
            <span>New Emergency Request</span>
          </Link>
        </section>

        <div className="cr-dashboard-shortcuts">
          <Link to="/careroute/track">
            <MonitorHeartOutlinedIcon />
            <h2>Track Request</h2>
            <p>Check status updates</p>
          </Link>
          <Link to="/careroute/my-requests">
            <AssignmentOutlinedIcon />
            <h2>My Requests</h2>
            <p>Emergency history</p>
          </Link>
        </div>

        <section className="cr-recent-card" aria-labelledby="recent-request-title" aria-busy={loading || authLoading}>
          <div className="cr-recent-heading">
            <h2 id="recent-request-title">Recent Emergency</h2>
            {recent && <StatusBadge status={recent.status} />}
          </div>
          {authLoading || loading ? (
            <p role="status">Loading your recent request...</p>
          ) : error ? (
            <p role="alert">Unable to load your recent request. Check your connection and try My Requests.</p>
          ) : recent ? (
            <>
              <h3>{recent.emergencyType}</h3>
              <p>{recent.assignedHospitalName || "Hospital name not available"}</p>
              <div className="cr-recent-footer">
                <span>Request {recent.trackingCode || recent.id}</span>
                <Link to={`/careroute/track/${encodeURIComponent(recent.trackingCode || recent.id)}`}>
                  View details <ArrowForwardRoundedIcon />
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3>{user?.username ? "No recent requests" : "Your care, in one place"}</h3>
              <p>
                {user?.username
                  ? "Your latest available request will appear here."
                  : "Sign in with your Pi account to view your request history."}
              </p>
              <div className="cr-recent-footer">
                <Link to="/careroute/my-requests">
                  {user?.username ? "View my requests" : "Open My Requests"}
                  <ArrowForwardRoundedIcon />
                </Link>
              </div>
            </>
          )}
        </section>
        <Link className="cr-dashboard-browse" to="/careroute/hospitals">
          Browse participating hospitals <ArrowForwardRoundedIcon />
        </Link>
        <p className="cr-dashboard-notice">
          In immediate danger? Call your local emergency service. CareRoute does not replace emergency services.
        </p>
      </div>
    </CareRouteLayout>
  );
};
export default CareRouteHomePage;
