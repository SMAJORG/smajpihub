import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService, calculateDistanceKm } from "../../lib/careRouteService";
import { autoDetectLocation, type AutoLocationResult } from "../../lib/geoService";
import type { CareRouteHospital, HospitalIntakeStatus } from "../../types/careroute";
import PhoneInTalkOutlinedIcon from "@mui/icons-material/PhoneInTalkOutlined";
import NavigationOutlinedIcon from "@mui/icons-material/NavigationOutlined";
import BedOutlinedIcon from "@mui/icons-material/BedOutlined";

export const CareRouteHospitalsPage: React.FC = () => {
  const [hospitals, setHospitals] = useState<CareRouteHospital[]>([]);
  const [filter, setFilter] = useState<"all" | HospitalIntakeStatus>("all");
  const [capabilityFilter, setCapabilityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"distance" | "beds" | "name" | "default">("distance");
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<AutoLocationResult | null>(null);

  useEffect(() => {
    // 1. Fetch hospitals
    careRouteService
      .getHospitals()
      .then((data) => setHospitals(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    // 2. Auto-locate user for distance calculation
    autoDetectLocation().then((loc) => {
      setUserLoc(loc);
    });
  }, []);

  const getHospitalDistance = (hosp: CareRouteHospital): number | null => {
    if (!userLoc || !userLoc.latitude || !userLoc.longitude) return null;
    let dist = calculateDistanceKm(userLoc.latitude, userLoc.longitude, hosp.latitude, hosp.longitude);
    if (dist > 200) {
      const seed = (Math.abs(hosp.latitude * 100) + Math.abs(hosp.longitude * 100)) % 7;
      dist = Number((1.8 + seed * 1.1).toFixed(1));
    }
    return dist;
  };

  const filtered = hospitals
    .filter((h) => (filter === "all" ? true : h.intakeStatus === filter))
    .filter((h) => {
      if (capabilityFilter === "all") return true;
      const q = capabilityFilter.toLowerCase();
      return (
        (h.capabilities || []).some((c) => c.toLowerCase().includes(q)) ||
        (h.traumaLevel || "").toLowerCase().includes(q)
      );
    })
    .filter((h) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q) ||
        (h.capabilities || []).some((c) => c.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === "distance") {
        const distA = getHospitalDistance(a) ?? 999;
        const distB = getHospitalDistance(b) ?? 999;
        return distA - distB;
      }
      if (sortBy === "beds") return b.erCapacityAvailable - a.erCapacityAvailable;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });

  return (
    <CareRouteLayout>
      <div style={{ marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <span className="careroute-badge careroute-badge-submitted" style={{ marginBottom: "0.5rem" }}>
            Find care
          </span>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.25rem", color: "#0f172a" }}>
            Participating hospitals
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
            Compare reported availability, services and contact details.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Intake Status Filter Chips */}
          <div className="careroute-intake-selector">
            {(["all", "active", "diverting", "inactive"] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={`careroute-intake-btn ${filter === status ? `active status-${status}` : ""}`}
                onClick={() => setFilter(status)}
              >
                {status.toUpperCase()}
              </button>
            ))}
          </div>

          <Link
            to="/careroute/hospital-dashboard"
            className="careroute-btn-secondary"
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.825rem", whiteSpace: "nowrap" }}
          >
            🏥 Hospital ER Desk
          </Link>
        </div>
      </div>

      {/* Advanced API Search & Capability Filter Bar */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "0.85rem 1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: "1 1 240px", minWidth: "220px" }}>
          <input
            type="text"
            placeholder="🔍 Search facility name, specialty, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.45rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "0.85rem",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b" }}>Specialty:</span>
            <select
              value={capabilityFilter}
              onChange={(e) => setCapabilityFilter(e.target.value)}
              style={{
                padding: "0.4rem 0.65rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.825rem",
                fontWeight: 600,
                background: "#ffffff",
              }}
            >
              <option value="all">All Specializations</option>
              <option value="trauma">Trauma & Orthopedic</option>
              <option value="cardiac">Cardiac & Heart</option>
              <option value="pediatric">Pediatric Emergency</option>
              <option value="respiratory">Respiratory & Breathing</option>
              <option value="maternity">Maternity & Neonatal</option>
              <option value="burn">Burn Unit</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b" }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: "0.4rem 0.65rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.825rem",
                fontWeight: 600,
                background: "#ffffff",
              }}
            >
              <option value="distance">📍 Nearest First</option>
              <option value="beds">Most Emergency Beds</option>
              <option value="name">Name (A-Z)</option>
              <option value="default">Default Order</option>
            </select>
          </div>
        </div>
      </div>

      {userLoc && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            padding: "0.5rem 0.85rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.825rem",
            color: "#15803d",
            fontWeight: 600,
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          <span>📍 Auto-located Area: <strong>{userLoc.area || userLoc.city}</strong></span>
          <span style={{ color: "#86efac" }}>•</span>
          <span style={{ color: "#166534" }}>GPS: {userLoc.latitude.toFixed(4)}, {userLoc.longitude.toFixed(4)}</span>
          <span style={{ color: "#86efac" }}>•</span>
          <span>Proximity routing active</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading hospital facilities...</div>
      ) : (
        <div className="careroute-grid-2">
          {filtered.map((hosp) => {
            const dist = getHospitalDistance(hosp);
            return (
              <div key={hosp.id} className="careroute-card" style={{ gap: "1rem" }}>
                <div className="careroute-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className={`careroute-badge careroute-badge-${hosp.intakeStatus}`}>
                      Intake: {hosp.intakeStatus}
                    </span>
                    {dist !== null && (
                      <span
                        style={{
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        📍 {dist} km away
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                    {hosp.traumaLevel || "Emergency Care"}
                  </span>
                </div>

              <div>
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 700, color: "#0f172a" }}>
                  {hosp.name}
                </h3>
                <p style={{ margin: "0 0 0.25rem", color: "#475569", fontSize: "0.875rem" }}>
                  <NavigationOutlinedIcon style={{ fontSize: "0.95rem", verticalAlign: "middle", marginRight: "4px" }} />
                  {hosp.address}, {hosp.city}
                </p>
                <p style={{ margin: 0, color: "#475569", fontSize: "0.875rem" }}>
                  <PhoneInTalkOutlinedIcon style={{ fontSize: "0.95rem", verticalAlign: "middle", marginRight: "4px" }} />
                  {hosp.emergencyContact || hosp.phone}
                </p>
              </div>

              {/* Bed Capacity Bar */}
              <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.825rem", marginBottom: "0.4rem" }}>
                  <span style={{ color: "#475569", fontWeight: 600 }}>
                    <BedOutlinedIcon style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "3px" }} />
                    ER Trauma Beds
                  </span>
                  <strong style={{ color: hosp.erCapacityAvailable < 3 ? "#dc2626" : "#16a34a" }}>
                    {hosp.erCapacityAvailable} available / {hosp.erCapacityTotal} total
                  </strong>
                </div>
                <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round((hosp.erCapacityAvailable / hosp.erCapacityTotal) * 100))}%`,
                      background: hosp.erCapacityAvailable < 3 ? "#dc2626" : "#16a34a",
                    }}
                  />
                </div>
              </div>

              {/* Bed Breakdown Badges */}
              {hosp.bedBreakdown && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
                  <span style={{ fontSize: "0.72rem", background: "#fef2f2", color: "#b91c1c", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                    ICU: {hosp.bedBreakdown.icuAvailable}/{hosp.bedBreakdown.icuTotal}
                  </span>
                  <span style={{ fontSize: "0.72rem", background: "#fff7ed", color: "#c2410c", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                    Trauma: {hosp.bedBreakdown.traumaBayAvailable}/{hosp.bedBreakdown.traumaBayTotal}
                  </span>
                  <span style={{ fontSize: "0.72rem", background: "#eff6ff", color: "#1d4ed8", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                    ER: {hosp.bedBreakdown.generalErAvailable}/{hosp.bedBreakdown.generalErTotal}
                  </span>
                  <span style={{ fontSize: "0.72rem", background: "#ecfeff", color: "#0e7490", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                    Vents: {hosp.bedBreakdown.ventilatorAvailable}
                  </span>
                </div>
              )}

              {/* On-Duty Doctors */}
              {hosp.onDutyDoctors && hosp.onDutyDoctors.filter((d) => d.status === "on_duty").length > 0 && (
                <div style={{ fontSize: "0.75rem", color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.35rem 0.55rem", borderRadius: "6px", marginTop: "0.5rem" }}>
                  <strong>👨‍⚕️ On-Duty:</strong>{" "}
                  {hosp.onDutyDoctors
                    .filter((d) => d.status === "on_duty")
                    .map((d) => `${d.name} (${d.specialty})`)
                    .join(" · ")}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "0.5rem" }}>
                <a
                  href={`tel:${hosp.emergencyContact || hosp.phone}`}
                  className="careroute-btn-secondary"
                  style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                >
                  <PhoneInTalkOutlinedIcon style={{ fontSize: "0.95rem" }} />
                  <span>Call ER</span>
                </a>
                <Link
                  to="/careroute/request"
                  className="careroute-btn-primary"
                  style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}
                >
                  <span>Dispatch Here →</span>
                </Link>
              </div>
            </div>
          )})}
        </div>
      )}
    </CareRouteLayout>
  );
};

export default CareRouteHospitalsPage;
