import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService, DEMO_STAFF_ACCOUNTS } from "../../lib/careRouteService";
import { useAuth } from "../../hooks/useAuth";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";

export const CareRouteHospitalLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const staff = careRouteService.getCurrentStaff();
    if (staff) {
      navigate("/careroute/hospital-dashboard");
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const staff = await careRouteService.hospitalLogin(emailOrUsername, password);
      if (staff) {
        navigate("/careroute/hospital-dashboard");
      } else {
        setError("This account is not linked to a participating CareRoute hospital. Please contact SMAJ support.");
      }
    } catch {
      setError("Login failed due to a server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCentralizedLogin = () => {
    if (!user) return;
    const staff = {
      id: (user as any)?._id || (user as any)?.id || "staff-centralized",
      hospitalId: (user as any)?.hospitalId || "hosp-b-trauma",
      fullName: user?.displayName || user?.username || "Verified Hospital Staff",
      username: user?.username || "hospital_staff",
      email: (user as any)?.email || `${user?.username}@smajpihub.com`,
      role: "hospital_admin",
    };
    careRouteService.setCurrentStaff(staff);
    navigate("/careroute/hospital-dashboard");
  };

  const handleSelectDemo = (email: string) => {
    setEmailOrUsername(email);
    setPassword("password123");
  };

  return (
    <CareRouteLayout>
      <div style={{ maxWidth: "520px", margin: "2rem auto 3rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              background: "#0f172a",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "0.75rem",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)",
            }}
          >
            <LocalHospitalOutlinedIcon style={{ fontSize: "2rem" }} />
          </div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 0.4rem", color: "#0f172a" }}>
            Hospital ER Desk Login
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.925rem" }}>
            Authorized portal access for participating CareRoute hospital emergency departments.
          </p>
        </div>

        <div className="careroute-card" style={{ padding: "2rem" }}>
          {error && (
            <div className="careroute-alert-banner" style={{ borderLeftColor: "#ef4444", marginBottom: "1.25rem" }}>
              <span style={{ color: "#991b1b", fontSize: "0.85rem" }}>{error}</span>
            </div>
          )}

          {/* Centralized Pi Account Single Sign-On (if logged in to SMAJ PI HUB) */}
          {user?.username && (
            <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.5rem" }}>
                <PersonOutlineOutlinedIcon style={{ color: "#16a34a", fontSize: "1.1rem" }} />
                <span style={{ fontSize: "0.825rem", fontWeight: 800, color: "#15803d", textTransform: "uppercase" }}>
                  Active SMAJ PI Session Detected
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "#166534", margin: "0 0 0.75rem" }}>
                Signed in as <strong>@{user.username}</strong>. You can enter the hospital operations desk using your centralized account.
              </p>
              <button
                type="button"
                onClick={handleCentralizedLogin}
                className="careroute-btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "0.75rem", background: "#16a34a", borderColor: "#16a34a" }}
              >
                <span>Continue as @{user.username} (Hospital Staff)</span>
                <ArrowForwardRoundedIcon style={{ fontSize: "1rem" }} />
              </button>
            </div>
          )}

          {user?.username && (
            <div style={{ textAlign: "center", margin: "1rem 0", position: "relative" }}>
              <span style={{ background: "#ffffff", padding: "0 0.75rem", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase" }}>
                OR SIGN IN WITH HOSPITAL CREDENTIALS
              </span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="careroute-form-group">
              <label>Hospital Staff Email or Username</label>
              <input
                type="text"
                required
                placeholder="e.g. staff_b@hospital.com or admin"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
              />
            </div>

            <div className="careroute-form-group">
              <label>Password</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="careroute-btn-dark"
              style={{ width: "100%", justifyContent: "center", padding: "0.85rem", marginTop: "0.5rem" }}
            >
              <LockOutlinedIcon style={{ fontSize: "1rem" }} />
              <span>{loading ? "Verifying Credentials..." : "Sign In to Hospital Operations Desk"}</span>
            </button>
          </form>

          {/* 1-Click Quick Demo Staff Accounts */}
          <div style={{ marginTop: "1.75rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Quick Hospital Staff Logins (Hospital A, B, C):
            </span>
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.6rem" }}>
              {DEMO_STAFF_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleSelectDemo(acc.email)}
                  style={{
                    background: emailOrUsername === acc.email ? "#fee2e2" : "#f8fafc",
                    border: emailOrUsername === acc.email ? "1px solid #dc2626" : "1px solid #e2e8f0",
                    color: emailOrUsername === acc.email ? "#991b1b" : "#334155",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    padding: "0.65rem 0.85rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <strong>{acc.staff.fullName}</strong>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{acc.email} · {acc.staff.hospitalId}</div>
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 700 }}>
                    Select →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 0.35rem" }}>
            Need to register a new emergency hospital facility?
          </p>
          <Link
            to="/careroute/hospital-register"
            style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}
          >
            + Register New Hospital Facility →
          </Link>
        </div>

        <div style={{ textAlign: "center", marginTop: "1.25rem", color: "#64748b", fontSize: "0.8rem" }}>
          <ShieldOutlinedIcon style={{ fontSize: "0.95rem", verticalAlign: "middle", marginRight: "4px" }} />
          Hospital records and patient telemetry are strictly isolated to the authenticated department.
        </div>
      </div>
    </CareRouteLayout>
  );
};

export default CareRouteHospitalLoginPage;
