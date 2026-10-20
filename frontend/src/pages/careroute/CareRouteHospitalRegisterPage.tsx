import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService } from "../../lib/careRouteService";
import { autoDetectLocation } from "../../lib/geoService";
import type { HospitalBedBreakdown } from "../../types/careroute";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import BedOutlinedIcon from "@mui/icons-material/BedOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import AirOutlinedIcon from "@mui/icons-material/AirOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";

const AVAILABLE_CAPABILITIES = [
  "Level 1 Comprehensive Trauma",
  "Level 2 Specialty Trauma",
  "Cardiac & Cath Lab Center",
  "Stroke & Neuro Critical Care",
  "Specialized Pediatric Emergency",
  "Maternity & Obstetric ER",
  "Burn & Critical Resuscitation",
  "Emergency Orthopedic & Surgery",
  "Level 3 Community Emergency",
  "Urgent Care Clinic",
] as const;

export const CareRouteHospitalRegisterPage: React.FC = () => {
  const navigate = useNavigate();

  // Facility Info
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([
    "Level 1 Comprehensive Trauma",
    "Cardiac & Cath Lab Center",
  ]);
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);

  // Auto-locate hospital facility on load
  useEffect(() => {
    autoDetectLocation().then((loc) => {
      setLatitude(Number(loc.latitude.toFixed(4)));
      setLongitude(Number(loc.longitude.toFixed(4)));
      if (loc.city) setCity(loc.city);
      if (loc.country) setCountry(loc.country);
      if (loc.formattedAddress) {
        setAddress((prev) => (prev ? prev : loc.formattedAddress));
      }
    });
  }, []);

  const toggleCapability = (cap: string) => {
    setSelectedCapabilities((prev) =>
      prev.includes(cap)
        ? prev.length > 1
          ? prev.filter((c) => c !== cap)
          : prev
        : [...prev, cap]
    );
  };

  // Bed Breakdown
  const [bedBreakdown, setBedBreakdown] = useState<HospitalBedBreakdown>({
    icuAvailable: 4,
    icuTotal: 10,
    traumaBayAvailable: 2,
    traumaBayTotal: 6,
    generalErAvailable: 8,
    generalErTotal: 20,
    pediatricAvailable: 2,
    pediatricTotal: 4,
    ventilatorAvailable: 3,
    ventilatorTotal: 6,
  });

  // Staff Account
  const [adminFullName, setAdminFullName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBedChange = (key: keyof HospitalBedBreakdown, value: number) => {
    setBedBreakdown((prev) => ({
      ...prev,
      [key]: Math.max(0, value),
    }));
  };

  const handleDetectCoordinates = async () => {
    const loc = await autoDetectLocation({ forceFresh: true });
    setLatitude(Number(loc.latitude.toFixed(4)));
    setLongitude(Number(loc.longitude.toFixed(4)));
    if (loc.city) setCity(loc.city);
    if (loc.country) setCountry(loc.country);
    if (loc.formattedAddress) setAddress(loc.formattedAddress);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      const totalAvailableBeds =
        bedBreakdown.icuAvailable +
        bedBreakdown.traumaBayAvailable +
        bedBreakdown.generalErAvailable +
        bedBreakdown.pediatricAvailable;

      const totalBeds =
        bedBreakdown.icuTotal +
        bedBreakdown.traumaBayTotal +
        bedBreakdown.generalErTotal +
        bedBreakdown.pediatricTotal;

      await careRouteService.registerHospital({
        hospital: {
          name,
          address,
          city,
          country,
          phone,
          emergencyContact: emergencyContact || phone,
          latitude,
          longitude,
          intakeStatus: "active",
          capabilities: selectedCapabilities,
          erCapacityTotal: totalBeds,
          erCapacityAvailable: totalAvailableBeds,
          bedBreakdown,
          traumaLevel: selectedCapabilities[0] || "General Emergency",
        },
        adminStaff: {
          fullName: adminFullName,
          username: adminUsername.trim().toLowerCase(),
          email: adminEmail.trim().toLowerCase(),
          role: "Chief Medical Officer / Administrator",
        },
        password,
      });

      // Redirect immediately to Hospital Dashboard
      navigate("/careroute/hospital-dashboard");
    } catch {
      setError("Registration failed. Please check details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <CareRouteLayout>
      <div style={{ maxWidth: "760px", margin: "2rem auto 3.5rem" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
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
            }}
          >
            <LocalHospitalOutlinedIcon style={{ fontSize: "2rem" }} />
          </div>
          <span className="careroute-badge careroute-badge-submitted" style={{ marginBottom: "0.4rem" }}>
            Network Onboarding
          </span>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: "0 0 0.4rem", color: "#0f172a" }}>
            Register New Hospital Facility
          </h1>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
            Onboard your emergency department to receive live matched ambulance dispatches and manage real-time bed rosters.
          </p>
        </div>

        {error && (
          <div className="careroute-alert-banner" style={{ borderLeftColor: "#ef4444", marginBottom: "1.5rem" }}>
            <span style={{ color: "#991b1b", fontSize: "0.9rem" }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister}>
          {/* Section 1: Facility Information */}
          <div className="careroute-card" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1.25rem" }}>
              <LocalHospitalOutlinedIcon style={{ color: "#dc2626", fontSize: "1.3rem" }} />
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                1. Hospital / Facility Information
              </h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div className="careroute-form-group">
                <label>Hospital / Facility Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Memorial Trauma & Emergency Hospital"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="careroute-form-group" style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span>Trauma Level & Facility Capabilities * (Select all that apply)</span>
                  <span style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 700 }}>
                    {selectedCapabilities.length} selected
                  </span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {AVAILABLE_CAPABILITIES.map((cap) => {
                    const isSelected = selectedCapabilities.includes(cap);
                    return (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleCapability(cap)}
                        style={{
                          padding: "0.5rem 0.85rem",
                          fontSize: "0.825rem",
                          fontWeight: 700,
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #dc2626" : "1px solid #cbd5e1",
                          background: isSelected ? "#fef2f2" : "#ffffff",
                          color: isSelected ? "#991b1b" : "#334155",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span
                          style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "4px",
                            background: isSelected ? "#dc2626" : "#f1f5f9",
                            color: "#ffffff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.7rem",
                            fontWeight: 900,
                          }}
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <span>{cap}</span>
                      </button>
                    );
                  })}
                </div>
                <small style={{ color: "#64748b", marginTop: "6px", display: "block" }}>
                  Hospitals can select multiple trauma levels and specialized emergency certifications.
                </small>
              </div>

              <div className="careroute-form-group">
                <label>Street Address *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 500 Medical Boulevard, North District"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>City & Country *</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    required
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <div className="careroute-form-group">
                <label>Hospital Telephone / Reception *</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +1 (555) 019-3388"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Emergency Department Direct Hotline</label>
                <input
                  type="tel"
                  placeholder="e.g. +1 (555) 911-3388"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                />
              </div>
            </div>

            {/* Coordinates */}
            <div style={{ marginTop: "1rem", background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>
                  GPS COORDINATES (FOR AMBULANCE ROUTING)
                </span>
                <button
                  type="button"
                  onClick={handleDetectCoordinates}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#dc2626",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <MyLocationOutlinedIcon style={{ fontSize: "0.95rem" }} />
                  <span>Detect My Location</span>
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="Latitude"
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}
                />
                <input
                  type="number"
                  step="0.0001"
                  placeholder="Longitude"
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Initial Bed Breakdown */}
          <div className="careroute-card" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.5rem" }}>
              <BedOutlinedIcon style={{ color: "#dc2626", fontSize: "1.3rem" }} />
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                2. Initial Emergency Bed Capacity
              </h3>
            </div>
            <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 1.25rem" }}>
              Specify your hospital's initial available and total capacity across the 5 critical emergency bed types. (You can update these anytime in your live dashboard).
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              {/* ICU */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1rem", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                  <MonitorHeartOutlinedIcon style={{ color: "#dc2626", fontSize: "1.15rem" }} />
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>ICU / Critical Care</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Available
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.icuAvailable}
                      onChange={(e) => handleBedChange("icuAvailable", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Total
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.icuTotal}
                      onChange={(e) => handleBedChange("icuTotal", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Trauma Bays */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1rem", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                  <HealingOutlinedIcon style={{ color: "#ea580c", fontSize: "1.15rem" }} />
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>Trauma Bays</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Available
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.traumaBayAvailable}
                      onChange={(e) => handleBedChange("traumaBayAvailable", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Total
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.traumaBayTotal}
                      onChange={(e) => handleBedChange("traumaBayTotal", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* General ER */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1rem", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                  <BedOutlinedIcon style={{ color: "#2563eb", fontSize: "1.15rem" }} />
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>General ER Beds</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Available
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.generalErAvailable}
                      onChange={(e) => handleBedChange("generalErAvailable", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Total
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.generalErTotal}
                      onChange={(e) => handleBedChange("generalErTotal", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Pediatric */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1rem", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                  <ChildCareOutlinedIcon style={{ color: "#059669", fontSize: "1.15rem" }} />
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>Pediatric / Maternity</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Available
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.pediatricAvailable}
                      onChange={(e) => handleBedChange("pediatricAvailable", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Total
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.pediatricTotal}
                      onChange={(e) => handleBedChange("pediatricTotal", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Ventilators */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1rem", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.75rem" }}>
                  <AirOutlinedIcon style={{ color: "#0891b2", fontSize: "1.15rem" }} />
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>Ventilators / O2</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Available
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.ventilatorAvailable}
                      onChange={(e) => handleBedChange("ventilatorAvailable", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                      Total
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bedBreakdown.ventilatorTotal}
                      onChange={(e) => handleBedChange("ventilatorTotal", Number(e.target.value))}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.5rem 0.6rem",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "center",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        background: "#ffffff",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Administrator Account */}
          <div className="careroute-card" style={{ padding: "1.75rem", marginBottom: "1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1.25rem" }}>
              <LockOutlinedIcon style={{ color: "#dc2626", fontSize: "1.3rem" }} />
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                3. Lead Administrator Credentials
              </h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              <div className="careroute-form-group">
                <label>Admin Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Alex Mercer"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Staff Username (for login) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. alex_admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Official Work Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. alex.mercer@hospital.org"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Confirm Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="careroute-btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "0.9rem", fontSize: "1.05rem" }}
          >
            <CheckCircleOutlinedIcon style={{ fontSize: "1.2rem" }} />
            <span>{loading ? "Registering Facility..." : "Complete Registration & Open Hospital Desk"}</span>
            <ArrowForwardRoundedIcon />
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.75rem" }}>
          <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 0.5rem" }}>
            Already registered with CareRoute?
          </p>
          <Link
            to="/careroute/hospital-login"
            style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}
          >
            ← Sign In to Hospital Staff Portal
          </Link>
        </div>

        <div style={{ textAlign: "center", marginTop: "1.5rem", color: "#64748b", fontSize: "0.8rem" }}>
          <ShieldOutlinedIcon style={{ fontSize: "0.95rem", verticalAlign: "middle", marginRight: "4px" }} />
          Protected under HIPAA & emergency triage coordination protocols. Strict facility data isolation.
        </div>
      </div>
    </CareRouteLayout>
  );
};

export default CareRouteHospitalRegisterPage;
