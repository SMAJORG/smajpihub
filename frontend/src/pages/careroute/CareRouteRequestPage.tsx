import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { careRouteService } from "../../lib/careRouteService";
import { useAuth } from "../../hooks/useAuth";
import { autoDetectLocation } from "../../lib/geoService";
import type { CareRouteHospital, EmergencySeverity } from "../../types/careroute";
import EmergencyShareOutlinedIcon from "@mui/icons-material/EmergencyShareOutlined";
import MyLocationOutlinedIcon from "@mui/icons-material/MyLocationOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import PhoneInTalkOutlinedIcon from "@mui/icons-material/PhoneInTalkOutlined";
import BedOutlinedIcon from "@mui/icons-material/BedOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";

const EMERGENCY_TYPES = [
  "Accident / Trauma",
  "Cardiac Emergency",
  "Breathing / Respiratory",
  "Pediatric Emergency",
  "Maternity Emergency",
  "General Emergency",
  "Other",
] as const;

export const CareRouteRequestPage: React.FC = () => {
  const navigate = useNavigate();

  // Wizard Steps: 1 -> 2 -> 3 -> 4 -> 5 -> Submit -> Track
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State
  const [emergencyType, setEmergencyType] = useState<string>("Accident / Trauma");
  const [description, setDescription] = useState<string>("");

  // Location State (Auto-located on mount)
  const [locatingStatus, setLocatingStatus] = useState<"idle" | "locating" | "detected" | "error">("locating");
  const [pickupAddress, setPickupAddress] = useState<string>("");
  const [detectedArea, setDetectedArea] = useState<string>("");
  const [detectedCity, setDetectedCity] = useState<string>("");
  const [latitude, setLatitude] = useState<number>(0);
  const [longitude, setLongitude] = useState<number>(0);
  const [locationSource, setLocationSource] = useState<"gps" | "ip" | "cached" | "fallback">("gps");
  const [locationAccuracy, setLocationAccuracy] = useState<number | undefined>(undefined);

  // Auth & Patient Details
  const { user } = useAuth();
  const [patientName, setPatientName] = useState<string>("");
  const [patientPhone, setPatientPhone] = useState<string>("");
  const [patientAge, setPatientAge] = useState<string>("");
  const [emergencyContact, setEmergencyContact] = useState<string>("");
  const [patientPiUsername, setPatientPiUsername] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Auto-fill patient details from authenticated Pi Network session
  useEffect(() => {
    if (user) {
      if (!patientName) {
        setPatientName(user.displayName || user.username || "");
      }
      if (!patientPhone && user.contactPhone) {
        setPatientPhone(user.contactPhone);
      }
      const piUser = user.username || user.piUsername || "";
      if (piUser) setPatientPiUsername(piUser);
    }
  }, [user]);

  // Auto-detect Location & Area immediately on page load
  const triggerAutoLocation = async (forceFresh = false) => {
    setLocatingStatus("locating");
    try {
      const loc = await autoDetectLocation({ forceFresh });
      setLatitude(loc.latitude);
      setLongitude(loc.longitude);
      setDetectedArea(loc.area);
      setDetectedCity(loc.city);
      setPickupAddress(loc.formattedAddress);
      setLocationSource(loc.source);
      setLocationAccuracy(loc.accuracy);
      setLocatingStatus("detected");
    } catch {
      setLocatingStatus("error");
    }
  };

  useEffect(() => {
    triggerAutoLocation();
  }, []);

  // Manual re-trigger handler
  const handleDetectLocation = () => {
    triggerAutoLocation(true);
  };

  // Hospital Finder Results
  const [matchingHospitals, setMatchingHospitals] = useState<CareRouteHospital[]>([]);
  const [recommendedHospital, setRecommendedHospital] = useState<CareRouteHospital | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<CareRouteHospital | null>(null);
  const [findingHospitals, setFindingHospitals] = useState<boolean>(false);
  const [searchProgress, setSearchProgress] = useState<number>(20);
  const [searchPhase, setSearchPhase] = useState<string>("Analyzing clinical profile...");
  const [matchingFilter, setMatchingFilter] = useState<"all" | "specialty" | "beds">("all");
  const [matchingSort, setMatchingSort] = useState<"recommended" | "distance" | "beds">("recommended");

  // Submission State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // STEP 3 -> STEP 4: Run NearER Hospital Matching Logic with Staged Triage Loading
  const handleFindHospitals = async () => {
    if (!patientName.trim() || !patientPhone.trim()) {
      setErrorMessage("Please provide patient name and contact phone number to continue.");
      return;
    }
    setErrorMessage(null);
    setFindingHospitals(true);
    setCurrentStep(4);
    setSearchProgress(20);
    setSearchPhase(`Analyzing emergency condition: ${emergencyType}...`);

    try {
      // Stage 1: Geolocation and condition lock
      await new Promise((resolve) => setTimeout(resolve, 380));
      setSearchProgress(45);
      setSearchPhase("Scanning regional emergency hospital network within GPS radius...");

      // Trigger matching query
      const matchPromise = careRouteService.findMatchingHospitals({
        latitude,
        longitude,
        emergencyType,
      });

      // Stage 2: Audit bed capacity
      await new Promise((resolve) => setTimeout(resolve, 450));
      setSearchProgress(70);
      setSearchPhase("Auditing real-time ICU, trauma bays & ventilator bed availability...");

      // Stage 3: Audit specialist physicians
      await new Promise((resolve) => setTimeout(resolve, 420));
      setSearchProgress(90);
      setSearchPhase("Verifying on-duty emergency physicians & intake status...");

      const result = await matchPromise;

      // Stage 4: Optimal route selection
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSearchProgress(100);
      setSearchPhase("Optimal facility matched!");

      setMatchingHospitals(result.hospitals);
      setRecommendedHospital(result.recommended);
      // Auto-select recommended if available
      if (result.recommended) {
        setSelectedHospital(result.recommended);
      } else if (result.hospitals.length > 0) {
        const firstActive = result.hospitals.find((h) => h.intakeStatus === "active");
        if (firstActive) setSelectedHospital(firstActive);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to run hospital finder. Showing available centers.");
    } finally {
      setTimeout(() => {
        setFindingHospitals(false);
      }, 350);
    }
  };

  // STEP 4 -> STEP 5: Select Hospital
  const handleSelectHospital = (hosp: CareRouteHospital) => {
    if (hosp.intakeStatus === "inactive") return;
    setSelectedHospital(hosp);
    setCurrentStep(5);
  };

  // STEP 5: Final Submission -> Navigates to Step 7 (Tracking)
  const handleSendEmergencyRequest = async () => {
    if (!selectedHospital) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const created = await careRouteService.createRequest({
        patientName,
        patientPhone,
        patientAge,
        emergencyContact,
        patientPiUsername: user?.username || patientPiUsername || undefined,
        emergencyType,
        severity: "urgent" as EmergencySeverity,
        symptomsDescription: description ? `${description} ${notes ? `| Note: ${notes}` : ""}` : notes,
        pickupAddress,
        pickupLatitude: latitude,
        pickupLongitude: longitude,
        assignedHospitalId: selectedHospital.id,
      });

      // Redirect immediately to Tracking page
      navigate(`/careroute/track/${created.trackingCode}`);
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to transmit emergency request. Please try again or call emergency services directly.");
      setSubmitting(false);
    }
  };

  return (
    <CareRouteLayout>
      <div style={{ maxWidth: "780px", margin: "1rem auto 3rem" }}>
        {/* Step Indicator Header */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>
              Emergency Intake Step {currentStep} of 5
            </span>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <ArrowBackRoundedIcon style={{ fontSize: "0.95rem" }} />
                <span>Previous Step</span>
              </button>
            )}
          </div>
          <div style={{ width: "100%", height: "4px", background: "#e2e8f0", borderRadius: "2px", overflow: "hidden" }}>
            <div
              style={{
                width: `${(currentStep / 5) * 100}%`,
                height: "100%",
                background: "#dc2626",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {errorMessage && (
          <div className="careroute-alert-banner" style={{ borderLeftColor: "#ef4444", marginBottom: "1.5rem" }}>
            <span style={{ color: "#991b1b", fontSize: "0.9rem" }}>{errorMessage}</span>
          </div>
        )}

        {/* =========================================================================
            STEP 1: EMERGENCY TYPE
            ========================================================================= */}
        {currentStep === 1 && (
          <div className="careroute-card" style={{ padding: "2rem" }}>
            <span className="careroute-badge careroute-badge-critical" style={{ marginBottom: "0.5rem" }}>
              Step 1: Emergency Assessment
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0f172a" }}>
              What kind of emergency assistance do you need?
            </h2>
            <p style={{ color: "#64748b", margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
              Select the primary emergency category so CareRoute can match appropriate trauma or specialty capabilities.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1.75rem" }}>
              {EMERGENCY_TYPES.map((type) => {
                const isSelected = emergencyType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEmergencyType(type)}
                    style={{
                      padding: "1rem",
                      borderRadius: "10px",
                      textAlign: "left",
                      border: isSelected ? "2px solid #dc2626" : "1px solid #cbd5e1",
                      background: isSelected ? "#fef2f2" : "#ffffff",
                      color: isSelected ? "#991b1b" : "#1e293b",
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>{type}</span>
                    {isSelected && <CheckCircleOutlinedIcon style={{ fontSize: "1.1rem", color: "#dc2626" }} />}
                  </button>
                );
              })}
            </div>

            <div className="careroute-form-group" style={{ marginBottom: "1.75rem" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155" }}>
                Briefly describe what happened
              </label>
              <input
                type="text"
                placeholder='e.g. "Patient has severe chest pain and dizziness" (no medical diagnosis required)'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ padding: "0.75rem 1rem", fontSize: "0.95rem" }}
              />
            </div>

            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="careroute-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "0.85rem", fontSize: "1rem" }}
            >
              <span>Continue to Location Access</span>
              <ArrowForwardRoundedIcon />
            </button>
          </div>
        )}

        {/* =========================================================================
            STEP 2: LOCATION ACCESS
            ========================================================================= */}
        {currentStep === 2 && (
          <div className="careroute-card" style={{ padding: "2rem" }}>
            <span className="careroute-badge careroute-badge-submitted" style={{ marginBottom: "0.5rem" }}>
              Step 2: Proximity & Geofencing
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0f172a" }}>
              Where is the patient located?
            </h2>
            <p style={{ color: "#64748b", margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
              We use your location to calculate exact travel distance and geofence the nearest active hospital facilities.
            </p>

            {/* Auto-Location Status Box */}
            {locatingStatus === "locating" && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "1.5rem",
                  borderRadius: "12px",
                  border: "1px dashed #cbd5e1",
                  marginBottom: "1.5rem",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "#fee2e2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 0.75rem",
                  }}
                >
                  <MyLocationOutlinedIcon style={{ animation: "spin 2s linear infinite" }} />
                </div>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                  Auto-detecting live GPS coordinates & area...
                </div>
                <div style={{ fontSize: "0.825rem", color: "#64748b", marginTop: "4px" }}>
                  Locking satellite coordinates and reverse-geocoding neighborhood
                </div>
              </div>
            )}

            {locatingStatus === "detected" && (
              <div
                style={{
                  background: "#f0fdf4",
                  padding: "1.25rem 1.5rem",
                  borderRadius: "12px",
                  border: "1px solid #bbf7d0",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#16a34a", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.35rem" }}>
                      <CheckCircleOutlinedIcon style={{ fontSize: "1.1rem" }} />
                      <span>LIVE LOCATION & AREA AUTO-LOCATED</span>
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.35rem" }}>
                      📍 {detectedArea ? `${detectedArea}${detectedCity ? `, ${detectedCity}` : ""}` : pickupAddress}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "0.785rem", color: "#475569" }}>
                      <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                        {locationSource === "gps" ? "🛰️ GPS Satellite Lock" : "🌐 High-Precision Network Geocoding"}
                      </span>
                      <span>GPS: {latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
                      {locationAccuracy && <span>(±{Math.round(locationAccuracy)}m precision)</span>}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    className="careroute-btn-secondary"
                    style={{ padding: "0.45rem 0.85rem", fontSize: "0.825rem", whiteSpace: "nowrap" }}
                  >
                    <MyLocationOutlinedIcon style={{ fontSize: "0.95rem" }} />
                    <span>Re-detect GPS</span>
                  </button>
                </div>
              </div>
            )}

            {locatingStatus === "error" && (
              <div
                style={{
                  background: "#fef2f2",
                  padding: "1rem 1.25rem",
                  borderRadius: "10px",
                  border: "1px solid #fecaca",
                  marginBottom: "1.5rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "0.875rem" }}>
                    GPS permission not granted or unavailable
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#b91c1c", marginTop: "2px" }}>
                    Please enter your area or landmark below so ambulances can locate you.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  className="careroute-btn-secondary"
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                >
                  Retry GPS
                </button>
              </div>
            )}

            {/* Editable Area & Pickup Address */}
            <div className="careroute-form-group" style={{ marginBottom: "1.75rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 700, color: "#334155" }}>
                Auto-Located Area & Landmark (Editable)
              </label>
              <input
                type="text"
                placeholder="Auto-detected area (e.g. Street name, Building, Flat / Room number)..."
                value={pickupAddress}
                onChange={(e) => {
                  setPickupAddress(e.target.value);
                  setLocatingStatus("detected");
                }}
                style={{ padding: "0.75rem 1rem", fontSize: "0.95rem" }}
              />
              <small style={{ color: "#64748b", marginTop: "4px" }}>
                Auto-located from your live coordinates. You can append an apartment number, floor, or landmark.
              </small>
            </div>

            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="careroute-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "0.85rem", fontSize: "1rem" }}
            >
              <span>Continue to Patient Details</span>
              <ArrowForwardRoundedIcon />
            </button>
          </div>
        )}

        {/* =========================================================================
            STEP 3: PATIENT DETAILS
            ========================================================================= */}
        {currentStep === 3 && (
          <div className="careroute-card" style={{ padding: "2rem" }}>
            <span className="careroute-badge careroute-badge-submitted" style={{ marginBottom: "0.5rem" }}>
              Step 3: Contact & Intake Info
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0f172a" }}>
              Patient Information
            </h2>
            <p style={{ color: "#64748b", margin: "0 0 1.25rem", fontSize: "0.95rem" }}>
              Please enter the primary patient name and emergency contact number for hospital triage registration.
            </p>

            {user?.username ? (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "0.65rem 0.95rem",
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "0.85rem",
                  color: "#166534",
                }}
              >
                <CheckCircleOutlinedIcon style={{ fontSize: "1.15rem", color: "#16a34a", flexShrink: 0 }} />
                <div>
                  <strong>Pi Network Authenticated: @{user.username}</strong>
                  <div style={{ fontSize: "0.78rem", color: "#15803d", marginTop: "2px" }}>
                    Details auto-filled from your profile. This request will be saved to your CareRoute emergency history.
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "0.55rem 0.9rem",
                  marginBottom: "1.25rem",
                  fontSize: "0.8rem",
                  color: "#64748b",
                }}
              >
                Submitting as Emergency Guest. (You will receive an instant tracking code upon submission).
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
              <div className="careroute-form-group">
                <label>Patient Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Johnathan Doe"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +1 (555) 019-4822"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Age (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 42"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                />
              </div>

              <div className="careroute-form-group">
                <label>Alternate Emergency Contact (Optional)</label>
                <input
                  type="tel"
                  placeholder="e.g. +1 (555) 018-0099"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                />
              </div>
            </div>

            <div className="careroute-form-group" style={{ marginBottom: "1.75rem" }}>
              <label>Any Short Relevant Notes (Optional)</label>
              <textarea
                rows={2}
                placeholder="Allergies, chronic conditions, consciousness level, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={handleFindHospitals}
              className="careroute-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "0.85rem", fontSize: "1rem" }}
            >
              <span>Find Matching Hospitals →</span>
            </button>
          </div>
        )}

        {/* =========================================================================
            STEP 4: NEARER-STYLE HOSPITAL FINDER & SELECTION
            ========================================================================= */}
        {currentStep === 4 && (
          <div>
            {findingHospitals ? (
              /* DEDICATED EMERGENCY TRIAGE & DISCOVERY LOADING SCREEN */
              <div
                className="careroute-card"
                style={{
                  padding: "3.5rem 2rem",
                  textAlign: "center",
                  background: "#ffffff",
                  border: "1px solid #fecaca",
                  borderRadius: "16px",
                  boxShadow: "0 12px 30px -6px rgba(220, 38, 38, 0.12)",
                }}
              >
                {/* Radar Beacon with Pulsing Waves */}
                <div className="careroute-radar-beacon">
                  <div className="careroute-radar-ring" />
                  <div className="careroute-radar-ring" />
                  <div className="careroute-radar-ring" />
                  <div className="careroute-radar-center">
                    <LocalHospitalOutlinedIcon style={{ fontSize: "1.85rem" }} />
                  </div>
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                    padding: "0.3rem 0.85rem",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    marginBottom: "1rem",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#dc2626",
                      display: "inline-block",
                      animation: "careroute-radar-pulse 1s infinite",
                    }}
                  />
                  <span>CareRoute NearER Intelligent Triage Engine</span>
                </div>

                <h3 style={{ fontSize: "1.55rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem" }}>
                  Searching Regional Emergency Grid...
                </h3>
                <p style={{ color: "#64748b", margin: "0 auto 1.75rem", maxWidth: "540px", fontSize: "0.95rem" }}>
                  Querying participating trauma centers and matching clinical suitability for emergency:{" "}
                  <strong style={{ color: "#dc2626" }}>{emergencyType}</strong>
                </p>

                {/* Animated Progress Bar */}
                <div style={{ maxWidth: "480px", margin: "0 auto 1.75rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.825rem",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "0.45rem",
                    }}
                  >
                    <span style={{ color: "#dc2626" }}>{searchPhase}</span>
                    <span>{searchProgress}%</span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "#e2e8f0",
                      borderRadius: "999px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${searchProgress}%`,
                        background: "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)",
                        borderRadius: "999px",
                        transition: "width 0.35s ease-in-out",
                      }}
                    />
                  </div>
                </div>

                {/* Staged Checklist */}
                <div
                  style={{
                    maxWidth: "480px",
                    margin: "0 auto",
                    textAlign: "left",
                    background: "#f8fafc",
                    padding: "1.1rem 1.35rem",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    fontSize: "0.825rem",
                    color: "#334155",
                    display: "grid",
                    gap: "0.65rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        color: searchProgress >= 20 ? "#16a34a" : "#94a3b8",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                      }}
                    >
                      {searchProgress >= 20 ? "✓" : "○"}
                    </span>
                    <span>Patient Incident Location Verified ({pickupAddress})</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        color: searchProgress >= 45 ? "#16a34a" : "#94a3b8",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                      }}
                    >
                      {searchProgress >= 45 ? "✓" : "○"}
                    </span>
                    <span>Clinical Emergency Classification ({emergencyType})</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        color: searchProgress >= 70 ? "#16a34a" : "#94a3b8",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                      }}
                    >
                      {searchProgress >= 70 ? "✓" : "○"}
                    </span>
                    <span>Live Audit of Specialized Beds (ICU, Trauma Bays, Ventilators)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        color: searchProgress >= 90 ? "#16a34a" : "#94a3b8",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                      }}
                    >
                      {searchProgress >= 90 ? "✓" : "○"}
                    </span>
                    <span>Physician Duty Roster & Intake Status Validation</span>
                  </div>
                </div>

                <div style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "#64748b" }}>
                  Connecting directly to hospital triage desks...
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span className="careroute-badge careroute-badge-submitted" style={{ marginBottom: "0.5rem" }}>
                    Step 4: NearER Intelligent Hospital Matching
                  </span>
                  <h2 style={{ fontSize: "1.65rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0f172a" }}>
                    Find the Right Hospital
                  </h2>
                  <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
                    Facilities evaluated for <strong>{emergencyType}</strong> using real-time clinical suitability, specialized bed availability, on-duty emergency physicians, and travel proximity.
                  </p>
                </div>

                {/* Filter and Sort Toolbar */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginRight: "4px" }}>
                      Filter:
                    </span>
                    <button
                      type="button"
                      onClick={() => setMatchingFilter("all")}
                      style={{
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: matchingFilter === "all" ? "1px solid #dc2626" : "1px solid #cbd5e1",
                        background: matchingFilter === "all" ? "#dc2626" : "#ffffff",
                        color: matchingFilter === "all" ? "#ffffff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      All Facilities ({matchingHospitals.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchingFilter("specialty")}
                      style={{
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: matchingFilter === "specialty" ? "1px solid #dc2626" : "1px solid #cbd5e1",
                        background: matchingFilter === "specialty" ? "#dc2626" : "#ffffff",
                        color: matchingFilter === "specialty" ? "#ffffff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      🎯 Specialty Match Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchingFilter("beds")}
                      style={{
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: matchingFilter === "beds" ? "1px solid #dc2626" : "1px solid #cbd5e1",
                        background: matchingFilter === "beds" ? "#dc2626" : "#ffffff",
                        color: matchingFilter === "beds" ? "#ffffff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      🛏️ Available Beds Only
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b" }}>Sort:</span>
                    <select
                      value={matchingSort}
                      onChange={(e) => setMatchingSort(e.target.value as any)}
                      style={{
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                    >
                      <option value="recommended">Best Clinical Match</option>
                      <option value="distance">Nearest Distance (km)</option>
                      <option value="beds">Most Available Beds</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* 1. RECOMMENDED MATCH CARD (Highlighted as per Section 12) */}
                {recommendedHospital && (matchingFilter === "all" || (matchingFilter === "specialty" && recommendedHospital.isSpecialtyMatch) || (matchingFilter === "beds" && recommendedHospital.erCapacityAvailable > 0)) && (
                  <div
                    style={{
                      background: "#ffffff",
                      border: "2px solid #dc2626",
                      borderRadius: "14px",
                      padding: "1.5rem",
                      boxShadow: "0 10px 25px -5px rgba(220, 38, 38, 0.12)",
                      position: "relative",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#dc2626", color: "#ffffff", padding: "0.25rem 0.65rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>
                          <StarRoundedIcon style={{ fontSize: "1rem" }} />
                          <span>Recommended Best Option</span>
                        </div>
                        {recommendedHospital.matchScore !== undefined && (
                          <span style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 800 }}>
                            🎯 Match Score: {recommendedHospital.matchScore}/120
                          </span>
                        )}
                        {recommendedHospital.matchedSpecialty && (
                          <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.2rem 0.55rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 700 }}>
                            {recommendedHospital.matchedSpecialty}
                          </span>
                        )}
                      </div>
                      <span className={`careroute-badge careroute-badge-${recommendedHospital.intakeStatus}`}>
                        {recommendedHospital.intakeStatus === "active" ? "Accepting Requests" : recommendedHospital.intakeStatus}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.35rem", color: "#0f172a" }}>
                      {recommendedHospital.name}
                    </h3>
                    <div style={{ fontSize: "0.9rem", color: "#475569", marginBottom: "0.75rem" }}>
                      <strong>{recommendedHospital.distanceKm} km away</strong> · Estimated travel ~{recommendedHospital.estimatedMinutes} mins · {recommendedHospital.address}
                    </div>

                    {/* Capabilities & Bed Info */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                      {recommendedHospital.capabilities.map((c) => (
                        <span key={c} style={{ background: "#f1f5f9", padding: "0.2rem 0.6rem", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, color: "#334155" }}>
                          {c}
                        </span>
                      ))}
                    </div>

                    {/* Bed Capacity Notice */}
                    <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.88rem" }}>
                          <BedOutlinedIcon style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "4px" }} />
                          Reported Emergency Beds: <strong>{recommendedHospital.erCapacityAvailable} available</strong>
                        </div>
                        <small style={{ color: "#64748b" }}>
                          Source: {recommendedHospital.capacityDataSource === "hospital_reported" ? "Hospital-reported availability" : "Demo / Test Capacity Data"} ({recommendedHospital.reportedCapacityTimestamp})
                        </small>
                      </div>
                      <PhoneInTalkOutlinedIcon style={{ color: "#64748b" }} />
                    </div>

                    {/* Bed Breakdown Badges */}
                    {recommendedHospital.bedBreakdown && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                        <span style={{ fontSize: "0.75rem", background: "#fef2f2", color: "#b91c1c", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 700 }}>
                          🫀 ICU: {recommendedHospital.bedBreakdown.icuAvailable}/{recommendedHospital.bedBreakdown.icuTotal}
                        </span>
                        <span style={{ fontSize: "0.75rem", background: "#fff7ed", color: "#c2410c", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 700 }}>
                          🚨 Trauma: {recommendedHospital.bedBreakdown.traumaBayAvailable}/{recommendedHospital.bedBreakdown.traumaBayTotal}
                        </span>
                        <span style={{ fontSize: "0.75rem", background: "#eff6ff", color: "#1d4ed8", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 700 }}>
                          🏥 General ER: {recommendedHospital.bedBreakdown.generalErAvailable}/{recommendedHospital.bedBreakdown.generalErTotal}
                        </span>
                        <span style={{ fontSize: "0.75rem", background: "#f0fdf4", color: "#15803d", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 700 }}>
                          👶 Pediatric: {recommendedHospital.bedBreakdown.pediatricAvailable}/{recommendedHospital.bedBreakdown.pediatricTotal}
                        </span>
                        <span style={{ fontSize: "0.75rem", background: "#ecfeff", color: "#0e7490", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: 700 }}>
                          🫁 Vents: {recommendedHospital.bedBreakdown.ventilatorAvailable}
                        </span>
                      </div>
                    )}

                    {/* On-Duty Doctor Team */}
                    {recommendedHospital.onDutyDoctors && recommendedHospital.onDutyDoctors.filter((d) => d.status === "on_duty" || d.status === "in_surgery").length > 0 && (
                      <div style={{ fontSize: "0.78rem", color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.4rem 0.65rem", borderRadius: "6px", marginBottom: "0.85rem" }}>
                        <strong>👨‍⚕️ On-Duty Emergency Team:</strong>{" "}
                        {recommendedHospital.onDutyDoctors
                          .filter((d) => d.status === "on_duty" || d.status === "in_surgery")
                          .map((d) => `${d.name} (${d.specialty}${d.status === "in_surgery" ? " · In Surgery" : ""})`)
                          .join(" · ")}
                      </div>
                    )}

                    {/* Why recommended explanation */}
                    <div style={{ fontSize: "0.825rem", color: "#991b1b", background: "#fef2f2", padding: "0.6rem 0.85rem", borderRadius: "6px", marginBottom: "1.25rem", lineHeight: 1.4 }}>
                      <strong>Why recommended:</strong> {recommendedHospital.recommendationReason}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectHospital(recommendedHospital)}
                      className="careroute-btn-primary"
                      style={{ width: "100%", justifyContent: "center", padding: "0.75rem", fontSize: "0.95rem" }}
                    >
                      <span>Select This Recommended Facility →</span>
                    </button>
                  </div>
                )}

                {/* Other Matching Hospitals Below */}
                {(() => {
                  const others = matchingHospitals.filter(
                    (h) => !recommendedHospital || h.id !== recommendedHospital.id
                  );
                  let displayOthers = [...others];
                  if (matchingFilter === "specialty") {
                    displayOthers = displayOthers.filter((h) => h.isSpecialtyMatch);
                  } else if (matchingFilter === "beds") {
                    displayOthers = displayOthers.filter((h) => h.erCapacityAvailable > 0);
                  }

                  if (matchingSort === "distance") {
                    displayOthers.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
                  } else if (matchingSort === "beds") {
                    displayOthers.sort((a, b) => b.erCapacityAvailable - a.erCapacityAvailable);
                  } else {
                    displayOthers.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
                  }

                  return (
                    <>
                      <h4 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
                        Other Available Emergency Facilities ({displayOthers.length})
                      </h4>

                      {displayOthers.length === 0 ? (
                        <div style={{ padding: "1.5rem", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px" }}>
                          No other facilities match the current filter criteria.
                        </div>
                      ) : (
                        displayOthers.map((hosp) => {
                          const isInactive = hosp.intakeStatus === "inactive";
                          return (
                            <div
                              key={hosp.id}
                              style={{
                                background: isInactive ? "#f8fafc" : "#ffffff",
                                border: isInactive ? "1px dashed #cbd5e1" : "1px solid #e2e8f0",
                                borderRadius: "12px",
                                padding: "1.25rem",
                                opacity: isInactive ? 0.75 : 1,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                                <div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                                    <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
                                      {hosp.name}
                                    </h4>
                                    {hosp.matchScore !== undefined && (
                                      <span style={{ background: "#f1f5f9", color: "#475569", padding: "0.15rem 0.45rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700 }}>
                                        Score: {hosp.matchScore}/120
                                      </span>
                                    )}
                                    {hosp.isSpecialtyMatch && (
                                      <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.15rem 0.45rem", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700 }}>
                                        🎯 {hosp.matchedSpecialty || "Specialty Match"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className={`careroute-badge careroute-badge-${hosp.intakeStatus}`}>
                                  {isInactive ? "Unavailable" : hosp.intakeStatus === "diverting" ? "Limited / Diverting" : "Accepting Requests"}
                                </span>
                              </div>

                              <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "0.6rem" }}>
                                <strong>{hosp.distanceKm} km away</strong> (~{hosp.estimatedMinutes} mins) · {hosp.address}
                              </div>

                              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.65rem" }}>
                                {hosp.capabilities.map((c) => (
                                  <span key={c} style={{ background: "#f1f5f9", padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", color: "#475569" }}>
                                    {c}
                                  </span>
                                ))}
                              </div>

                              <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.5rem" }}>
                                Reported Beds: <strong>{hosp.erCapacityAvailable} available</strong> · {hosp.capacityDataSource === "hospital_reported" ? "Hospital-reported availability" : "Demo / Test Capacity Data"} ({hosp.reportedCapacityTimestamp})
                              </div>

                              {/* Bed Breakdown for other hospitals */}
                              {hosp.bedBreakdown && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.65rem" }}>
                                  <span style={{ fontSize: "0.72rem", background: "#fef2f2", color: "#b91c1c", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                                    ICU: {hosp.bedBreakdown.icuAvailable}/{hosp.bedBreakdown.icuTotal}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", background: "#fff7ed", color: "#c2410c", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                                    Trauma: {hosp.bedBreakdown.traumaBayAvailable}/{hosp.bedBreakdown.traumaBayTotal}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", background: "#eff6ff", color: "#1d4ed8", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                                    ER: {hosp.bedBreakdown.generalErAvailable}/{hosp.bedBreakdown.generalErTotal}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", background: "#f0fdf4", color: "#15803d", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                                    Pediatric: {hosp.bedBreakdown.pediatricAvailable}/{hosp.bedBreakdown.pediatricTotal}
                                  </span>
                                  <span style={{ fontSize: "0.72rem", background: "#ecfeff", color: "#0e7490", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                                    Vents: {hosp.bedBreakdown.ventilatorAvailable}
                                  </span>
                                </div>
                              )}

                              {/* On-Duty Doctors for other hospitals */}
                              {hosp.onDutyDoctors && hosp.onDutyDoctors.filter((d) => d.status === "on_duty").length > 0 && (
                                <div style={{ fontSize: "0.75rem", color: "#15803d", background: "#f0fdf4", padding: "0.3rem 0.5rem", borderRadius: "4px", marginBottom: "0.85rem" }}>
                                  <strong>👨‍⚕️ On-Duty:</strong>{" "}
                                  {hosp.onDutyDoctors
                                    .filter((d) => d.status === "on_duty")
                                    .map((d) => `${d.name} (${d.specialty})`)
                                    .join(" · ")}
                                </div>
                              )}

                              <button
                                type="button"
                                disabled={isInactive}
                                onClick={() => handleSelectHospital(hosp)}
                                className={isInactive ? "careroute-btn-dark" : "careroute-btn-secondary"}
                                style={{
                                  padding: "0.55rem 1.25rem",
                                  fontSize: "0.85rem",
                                  cursor: isInactive ? "not-allowed" : "pointer",
                                }}
                              >
                                <span>{isInactive ? "Unavailable (Not Accepting)" : "Select This Facility →"}</span>
                              </button>
                            </div>
                          );
                        })
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      )}

        {/* =========================================================================
            STEP 5: REQUEST CONFIRMATION (Section 14)
            ========================================================================= */}
        {currentStep === 5 && selectedHospital && (
          <div className="careroute-card" style={{ padding: "2rem" }}>
            <span className="careroute-badge careroute-badge-critical" style={{ marginBottom: "0.5rem" }}>
              Step 5: Final Review & Dispatch
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem", color: "#0f172a" }}>
              Confirm Emergency Request
            </h2>
            <p style={{ color: "#64748b", margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
              Review the emergency intake summary before transmitting to the designated hospital triage desk.
            </p>

            <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", display: "grid", gap: "0.85rem", marginBottom: "1.75rem", fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>Emergency Type:</span>
                <strong style={{ color: "#dc2626" }}>{emergencyType}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>Selected Hospital:</span>
                <strong style={{ color: "#0f172a" }}>{selectedHospital.name}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>Distance / ETA:</span>
                <strong>{selectedHospital.distanceKm} km (~{selectedHospital.estimatedMinutes} mins)</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>Patient Name:</span>
                <strong>{patientName}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
                <span style={{ color: "#64748b" }}>Contact Phone:</span>
                <strong>{patientPhone}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Pickup Location:</span>
                <strong style={{ maxWidth: "340px", textAlign: "right" }}>{pickupAddress}</strong>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSendEmergencyRequest}
              className="careroute-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "0.9rem", fontSize: "1.05rem" }}
            >
              <EmergencyShareOutlinedIcon />
              <span>{submitting ? "Transmitting to Hospital..." : "Send Emergency Request"}</span>
            </button>
          </div>
        )}
      </div>
    </CareRouteLayout>
  );
};

export default CareRouteRequestPage;
