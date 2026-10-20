import React from "react";
import { Link } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import EmergencyShareOutlinedIcon from "@mui/icons-material/EmergencyShareOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import NearMeOutlinedIcon from "@mui/icons-material/NearMeOutlined";

export const CareRouteHomePage: React.FC = () => {
  return (
    <CareRouteLayout>
      <div className="careroute-home">
        {/* Emergency Notice */}
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fef3c7",
            borderLeft: "4px solid #f59e0b",
            padding: "0.85rem 1.25rem",
            borderRadius: "8px",
            marginBottom: "2rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.85rem",
          }}
        >
          <WarningAmberOutlinedIcon style={{ color: "#d97706", fontSize: "1.35rem", flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.875rem", color: "#92400e", lineHeight: 1.5 }}>
            <strong>Important Emergency Notice:</strong> If you are in immediate danger, contact your local emergency service directly. CareRoute helps connect patients with participating hospitals and does not replace official emergency services.
          </div>
        </div>

        {/* Hero Section */}
        <section className="careroute-hero" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <div className="careroute-hero-eyebrow">
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />
            <span>SMAJ Health · Emergency Hospital Finder</span>
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", fontWeight: 800, margin: "0 0 1rem", color: "#ffffff", letterSpacing: "-0.03em" }}>
            Find the Right Hospital During an Emergency
          </h1>
          <p style={{ fontSize: "1.1rem", color: "#cbd5e1", maxWidth: "620px", margin: "0 auto 2rem", lineHeight: 1.6 }}>
            Share your emergency and location, and CareRoute will help identify suitable participating hospitals nearby.
          </p>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <Link
              to="/careroute/request"
              className="careroute-btn-primary"
              style={{ fontSize: "1.05rem", padding: "0.85rem 2rem" }}
            >
              <EmergencyShareOutlinedIcon />
              <span>Start Emergency Request</span>
            </Link>
            <Link
              to="/careroute/track"
              className="careroute-btn-secondary"
              style={{ fontSize: "1rem", padding: "0.85rem 1.75rem" }}
            >
              <LocalShippingOutlinedIcon />
              <span>Track Existing Request</span>
            </Link>
          </div>
        </section>

        {/* 3 Step Breakdown */}
        <div style={{ marginTop: "2.5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--smaj-text-secondary, #64748b)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              How CareRoute Coordinates Emergency Care
            </span>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0.25rem 0 0", color: "var(--smaj-text, #0f172a)" }}>
              Find care in three steps
            </h2>
          </div>

          <div className="careroute-grid-3">
            <div className="careroute-card" style={{ padding: "1.5rem" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <EmergencyShareOutlinedIcon />
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--smaj-text, #0f172a)" }}>
                1. Specify Emergency
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--smaj-text-secondary, #64748b)", lineHeight: 1.5 }}>
                Select the incident type (Accident/Trauma, Cardiac, Respiratory, Pediatric, etc.) and your current location.
              </p>
            </div>

            <div className="careroute-card" style={{ padding: "1.5rem" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <NearMeOutlinedIcon />
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--smaj-text, #0f172a)" }}>
                2. Right Hospital Match
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--smaj-text-secondary, #64748b)", lineHeight: 1.5 }}>
                CareRoute matches emergency capability, proximity distance, intake status, and reported bed capacity.
              </p>
            </div>

            <div className="careroute-card" style={{ padding: "1.5rem" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <LocalHospitalOutlinedIcon />
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--smaj-text, #0f172a)" }}>
                3. Direct Triage Dispatch
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--smaj-text-secondary, #64748b)", lineHeight: 1.5 }}>
                Your request is sent directly to the selected hospital's emergency desk for acceptance and real-time tracking.
              </p>
            </div>
          </div>
        </div>

        {/* Dedicated Hospital & ER Staff Operations Portal Banner */}
        <div
          className="careroute-card careroute-staff-banner"
          style={{
            marginTop: "2.5rem",
            padding: "1.75rem 2rem",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#ffffff",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1.5rem",
            flexWrap: "wrap",
            border: "1px solid #334155",
            boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.4)",
          }}
        >
          <div style={{ flex: "1 1 360px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(220, 38, 38, 0.2)",
                color: "#fca5a5",
                padding: "0.25rem 0.75rem",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: "0.6rem",
              }}
            >
              <LocalHospitalOutlinedIcon style={{ fontSize: "0.95rem" }} />
              <span>Hospital Staff & ER Operations Portal</span>
            </div>
            <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.3rem", fontWeight: 800, color: "#ffffff" }}>
              Dedicated Hospital Management Desk
            </h3>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
              On-duty at a partner hospital? Access your centralized ER operations desk to receive incoming emergency patient sirens, accept triage dispatches with ETAs, update live ICU bed counts, and assign duty doctor rosters.
            </p>
          </div>
          <Link
            to="/careroute/hospital-dashboard"
            style={{
              background: "var(--smaj-primary, #6f35ff)",
              color: "#ffffff",
              padding: "0.85rem 1.65rem",
              borderRadius: "10px",
              fontWeight: 800,
              fontSize: "0.925rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(111, 53, 255, 0.25)",
              transition: "transform 0.15s ease, background 0.15s ease",
            }}
          >
            <span>Enter Hospital ER Desk →</span>
          </Link>
        </div>
      </div>
    </CareRouteLayout>
  );
};

export default CareRouteHomePage;
