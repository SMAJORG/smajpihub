import React, { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import {
  careRouteService,
  DEFAULT_HOSPITALS,
  getStoredHospitals,
  getStoredRequests,
} from "../../lib/careRouteService";
import { useAuthContext } from "../../contexts/AuthContext";
import LoginWithPiButton from "../../components/LoginWithPiButton";
import type {
  CareRouteHospital,
  CareRouteRequest,
  CareRouteStaff,
  DoctorStatus,
  HospitalBedBreakdown,
  HospitalIntakeStatus,
  OnDutyDoctor,
  PatientRequestStatus,
} from "../../types/careroute";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import ExitToAppOutlinedIcon from "@mui/icons-material/ExitToAppOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import BedOutlinedIcon from "@mui/icons-material/BedOutlined";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import ChildCareOutlinedIcon from "@mui/icons-material/ChildCareOutlined";
import AirOutlinedIcon from "@mui/icons-material/AirOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";

export const CareRouteHospitalDashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading, signOut } = useAuthContext();

  // Local/demo staff session fallback for instant access in dev or standalone mode
  const [demoStaffUser, setDemoStaffUser] = useState<CareRouteStaff | null>(() => {
    return careRouteService.getCurrentStaff();
  });

  // Active staff derived using SMAJ PI HUB seller authentication logic
  const activeStaff: CareRouteStaff | null = useMemo(() => {
    if (isAuthenticated && user) {
      return {
        id: user.uid || (user as any)?._id || "staff-er-lead",
        hospitalId: "hosp-b-trauma",
        fullName: user.displayName || user.username || "Hospital ER Operations Lead",
        username: user.username || "hospital_admin",
        email: (user as any)?.email || `${user.username || "hospital"}@smajpi.network`,
        role: "hospital_admin",
      };
    }
    return demoStaffUser;
  }, [user, isAuthenticated, demoStaffUser]);

  const [currentStaff, setCurrentStaff] = useState<CareRouteStaff | null>(activeStaff);
  const [hospital, setHospital] = useState<CareRouteHospital>(() => {
    const stored = getStoredHospitals();
    return stored.find((h) => h.id === "hosp-b-trauma") || stored[0] || DEFAULT_HOSPITALS[0];
  });
  const [allHospitals, setAllHospitals] = useState<CareRouteHospital[]>(() => getStoredHospitals());
  const [requests, setRequests] = useState<CareRouteRequest[]>(() => {
    const all = getStoredRequests();
    return all.filter((r) => r.assignedHospitalId === "hosp-b-trauma");
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"triage" | "beds" | "doctors" | "fleet">("triage");

  const [capacityUpdatedMsg, setCapacityUpdatedMsg] = useState<string | null>(null);
  const [bedBreakdown, setBedBreakdown] = useState<HospitalBedBreakdown>({
    icuAvailable: 3,
    icuTotal: 10,
    traumaBayAvailable: 2,
    traumaBayTotal: 6,
    generalErAvailable: 6,
    generalErTotal: 16,
    pediatricAvailable: 2,
    pediatricTotal: 4,
    ventilatorAvailable: 2,
    ventilatorTotal: 6,
  });

  // Doctor roster state
  const [doctors, setDoctors] = useState<OnDutyDoctor[]>([]);
  const [doctorUpdatedMsg, setDoctorUpdatedMsg] = useState<string | null>(null);
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorSpecialty, setNewDoctorSpecialty] = useState("Emergency Physician");
  const [newDoctorShift, setNewDoctorShift] = useState("Day Shift (08:00 - 20:00)");
  const [newDoctorStatus, setNewDoctorStatus] = useState<DoctorStatus>("on_duty");
  const [newDoctorContact, setNewDoctorContact] = useState("");

  // Accept modal / form state (Section 30)
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [acceptEta, setAcceptEta] = useState<number>(10);
  const [acceptNote, setAcceptNote] = useState<string>("ER Trauma Team prepped and waiting.");

  // Siren alert state (ONLY inside this dashboard and ONLY for this hospital)
  const hospitalReadyRef = useRef<boolean>(true);
  const [sirenActive, setSirenActive] = useState(false);
  const [newIncomingRequest, setNewIncomingRequest] = useState<CareRouteRequest | null>(null);

  // Pre-seed alerted requests on load so existing requests NEVER ring the siren when tab opens!
  const alertedRequestIdsRef = useRef<Set<string>>(
    new Set(getStoredRequests().map((r) => r.id))
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorIntervalRef = useRef<number | null>(null);
  const sirenAudioRef = useRef<HTMLAudioElement | null>(null);

  const [audioBlocked, setAudioBlocked] = useState(false);

  const getAcknowledgedIds = (): Set<string> => {
    try {
      const raw = sessionStorage.getItem("smaj_careroute_ack_ids");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  };

  const saveAcknowledgedId = (id: string) => {
    try {
      const set = getAcknowledgedIds();
      set.add(id);
      sessionStorage.setItem("smaj_careroute_ack_ids", JSON.stringify(Array.from(set)));
    } catch (err) {
      console.warn(err);
    }
  };

  // Sync staff state when activeStaff changes
  useEffect(() => {
    if (activeStaff) {
      careRouteService.setCurrentStaff(activeStaff);
      setCurrentStaff(activeStaff);
    }
  }, [activeStaff]);

  // Load hospital & emergency requests with real-time updates and graceful background sync
  useEffect(() => {
    let isMounted = true;
    let pollInterval: number | null = null;
    let broadcastChannel: BroadcastChannel | null = null;

    const syncRemoteData = async () => {
      try {
        const rawHospitals = await careRouteService.getHospitals();
        const cleanHospitals: CareRouteHospital[] = rawHospitals.filter(
          (h: CareRouteHospital) => h && h.name && h.name.trim().toLowerCase() !== "test" && h.name.trim().length >= 3
        );
        const hospitalsList = cleanHospitals.length > 0 ? cleanHospitals : DEFAULT_HOSPITALS;
        if (isMounted) {
          setAllHospitals(hospitalsList);
          const found = hospitalsList.find((h) => h.id === (activeStaff?.hospitalId || "hosp-b-trauma")) || hospitalsList[0];
          if (found) {
            setHospital(found);
            if (found.bedBreakdown) setBedBreakdown(found.bedBreakdown);
            if (found.onDutyDoctors) setDoctors(found.onDutyDoctors);
          }
        }

        const targetId = activeStaff?.hospitalId || "hosp-b-trauma";
        const freshReqs = await careRouteService.getHospitalRequests(targetId);
        if (isMounted && Array.isArray(freshReqs)) {
          setRequests(freshReqs);
          // Seed all existing requests silently so opening tab never triggers sirens
          freshReqs.forEach((r) => alertedRequestIdsRef.current.add(r.id));
        }
      } catch (err) {
        console.warn("[careroute] Background sync error:", err);
      }
    };

    if (activeStaff) {
      void syncRemoteData();
    }

    // Central incoming request processor
    const processIncomingRequest = (req: CareRouteRequest) => {
      const staff = careRouteService.getCurrentStaff();
      // SECURITY & ISOLATION RULE: Audio and siren alert trigger ONLY if dashboard is authenticated & ready, and request belongs to THIS hospital!
      if (!staff || req.assignedHospitalId !== staff.hospitalId) {
        return;
      }

      setRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);

      // If not yet ready (still authenticating or on loading screen), do NOT trigger audio!
      if (!hospitalReadyRef.current) {
        console.log("[careroute] Queued incoming request silently: dashboard not ready yet");
        return;
      }

      const ackSet = getAcknowledgedIds();
      if (!ackSet.has(req.id) && !alertedRequestIdsRef.current.has(req.id)) {
        alertedRequestIdsRef.current.add(req.id);
        setNewIncomingRequest(req);
        startSirenAlert();
      }
    };

    // 1. Same-window custom event
    const handleNewRequest = (e: Event) => {
      const req = (e as CustomEvent).detail as CareRouteRequest;
      processIncomingRequest(req);
    };
    window.addEventListener("careroute_new_request", handleNewRequest);

    // 2. Cross-tab BroadcastChannel
    try {
      if (typeof BroadcastChannel !== "undefined") {
        broadcastChannel = new BroadcastChannel("careroute_emergency_channel");
        broadcastChannel.onmessage = (event) => {
          if (event.data?.type === "NEW_REQUEST" && event.data?.request) {
            processIncomingRequest(event.data.request);
          } else if (
            (event.data?.type === "REQUEST_CANCELLED" || event.data?.type === "REQUEST_UPDATED") &&
            event.data?.request
          ) {
            const updated = event.data.request as CareRouteRequest;
            setRequests((prev) =>
              prev.map((r) =>
                r.id === updated.id || r.trackingCode === updated.trackingCode ? { ...r, ...updated } : r
              )
            );
            setNewIncomingRequest((cur: CareRouteRequest | null) => {
              if (cur && (cur.id === updated.id || cur.trackingCode === updated.trackingCode)) {
                stopSirenAlert();
                return null;
              }
              return cur;
            });
          }
        };
      }
    } catch (err) {
      console.warn("[careroute] BroadcastChannel error", err);
    }

    // 2b. Same-window request update listener
    const handleReqUpdated = (e: Event) => {
      const updated = (e as CustomEvent).detail as CareRouteRequest;
      if (updated) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === updated.id || r.trackingCode === updated.trackingCode ? { ...r, ...updated } : r
          )
        );
        setNewIncomingRequest((cur: CareRouteRequest | null) => {
          if (cur && (cur.id === updated.id || cur.trackingCode === updated.trackingCode)) {
            stopSirenAlert();
            return null;
          }
          return cur;
        });
      }
    };
    window.addEventListener("careroute_request_updated", handleReqUpdated);

    // 3. Cross-tab Storage event fallback
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "smaj_careroute_broadcast_signal" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.request) {
            processIncomingRequest(parsed.request);
          }
        } catch (err) {
          console.warn("[careroute] parse storage signal error", err);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // 4. Polling check every 1500ms for incoming requests
    pollInterval = window.setInterval(() => {
      const staff = careRouteService.getCurrentStaff();
      if (!staff || !hospitalReadyRef.current) return;

      careRouteService.getHospitalRequests(staff.hospitalId).then((freshReqs) => {
        const ackSet = getAcknowledgedIds();
        const pending = freshReqs.find(
          (r) =>
            (r.status === "submitted" || r.status === "dispatched") &&
            !ackSet.has(r.id) &&
            !alertedRequestIdsRef.current.has(r.id)
        );
        if (pending) {
          processIncomingRequest(pending);
        }
      });
    }, 1500);

    // 5. Unlock audio on first user click/touch
    const handleUserGesture = () => {
      if (!sirenAudioRef.current) {
        sirenAudioRef.current = new Audio("/careroute-siren.mp3");
        sirenAudioRef.current.loop = true;
      }
      sirenAudioRef.current.load();
    };
    window.addEventListener("pointerdown", handleUserGesture, { once: true });

    return () => {
      isMounted = false;
      hospitalReadyRef.current = false;
      window.removeEventListener("careroute_new_request", handleNewRequest);
      window.removeEventListener("careroute_request_updated", handleReqUpdated);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("pointerdown", handleUserGesture);
      if (pollInterval) clearInterval(pollInterval);
      if (broadcastChannel) broadcastChannel.close();
      stopSirenAlert();
    };
  }, []);

  // Exact Emergency Siren Audio using the official uploaded siren audio
  const startSirenAlert = () => {
    // SECURITY GUARD: Siren MUST NEVER play if staff is unauthenticated or on the loading screen!
    if (!hospitalReadyRef.current) {
      console.log("[careroute] Suppressed siren alert: Dashboard is still loading or unauthenticated.");
      return;
    }

    setSirenActive(true);
    setActiveTab("triage");

    // Primary: Play official uploaded emergency siren MP3
    try {
      if (!sirenAudioRef.current) {
        sirenAudioRef.current = new Audio("/careroute-siren.mp3");
        sirenAudioRef.current.loop = true;
      }
      sirenAudioRef.current.currentTime = 0;
      const playPromise = sirenAudioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setAudioBlocked(false);
          })
          .catch((err) => {
            console.warn("[careroute] Autoplay blocked by browser policy, showing manual activate button:", err);
            setAudioBlocked(true);
            startSynthesizerFallback();
          });
      }
    } catch {
      setAudioBlocked(true);
      startSynthesizerFallback();
    }
  };

  const startSynthesizerFallback = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }

      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }

      let toggle = false;
      oscillatorIntervalRef.current = window.setInterval(() => {
        if (!audioContextRef.current) return;
        const osc = audioContextRef.current.createOscillator();
        const gain = audioContextRef.current.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(toggle ? 880 : 660, audioContextRef.current.currentTime);
        gain.gain.setValueAtTime(0.12, audioContextRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(audioContextRef.current.destination);

        osc.start();
        osc.stop(audioContextRef.current.currentTime + 0.35);
        toggle = !toggle;
      }, 500);
    } catch (err) {
      console.warn("[careroute] audio context playback blocked or unsupported", err);
    }
  };

  const stopSirenAlert = () => {
    setSirenActive(false);
    setAudioBlocked(false);

    if (newIncomingRequest) {
      saveAcknowledgedId(newIncomingRequest.id);
    }

    if (sirenAudioRef.current) {
      sirenAudioRef.current.pause();
      sirenAudioRef.current.currentTime = 0;
    }

    if (oscillatorIntervalRef.current) {
      clearInterval(oscillatorIntervalRef.current);
      oscillatorIntervalRef.current = null;
    }
  };

  const loadHospitalRequests = async (hospitalId: string) => {
    setLoading(true);
    try {
      const data = await careRouteService.getHospitalRequests(hospitalId);
      setRequests(data);

      // Only evaluate siren alert if dashboard is authenticated & ready!
      if (hospitalReadyRef.current) {
        const ackSet = getAcknowledgedIds();
        const pending = data.find(
          (r) =>
            (r.status === "submitted" || r.status === "dispatched") &&
            !ackSet.has(r.id) &&
            !alertedRequestIdsRef.current.has(r.id)
        );

        if (pending) {
          alertedRequestIdsRef.current.add(pending.id);
          setNewIncomingRequest(pending);
          startSirenAlert();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Section 22: Hospital Intake Control (Active / Diverting / Inactive)
  const handleIntakeChange = async (newStatus: HospitalIntakeStatus) => {
    if (!hospital || !currentStaff) return;
    const updated = await careRouteService.updateHospitalIntakeStatus(hospital.id, newStatus);
    if (updated) {
      setHospital({ ...hospital, intakeStatus: newStatus });
    }
  };

  // Enhanced: Multi-Category Bed Breakdown Update
  const handleBedBreakdownChange = (field: keyof HospitalBedBreakdown, value: number) => {
    setBedBreakdown((prev) => ({
      ...prev,
      [field]: Math.max(0, value),
    }));
  };

  const adjustBedAvailable = (field: keyof HospitalBedBreakdown, delta: number) => {
    setBedBreakdown((prev) => {
      const currentVal = Number(prev[field]) || 0;
      const nextVal = Math.max(0, currentVal + delta);
      return { ...prev, [field]: nextVal };
    });
  };

  const handleSaveBedBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospital || !currentStaff) return;
    const updated = await careRouteService.updateHospitalBeds(hospital.id, bedBreakdown);
    if (updated) {
      setHospital(updated);
      setCapacityUpdatedMsg(
        `All bed categories updated! Total Available: ${updated.erCapacityAvailable} beds (ICU: ${bedBreakdown.icuAvailable}, Trauma: ${bedBreakdown.traumaBayAvailable}, ER: ${bedBreakdown.generalErAvailable}, Peds: ${bedBreakdown.pediatricAvailable}, Vents: ${bedBreakdown.ventilatorAvailable}).`
      );
      setTimeout(() => setCapacityUpdatedMsg(null), 5000);
    }
  };

  // Doctor Roster Handlers
  const handleDoctorStatusChange = async (doctorId: string, newStatus: DoctorStatus) => {
    if (!hospital || !currentStaff) return;
    const updated = await careRouteService.updateDoctorStatus(hospital.id, doctorId, newStatus);
    if (updated && updated.onDutyDoctors) {
      setHospital(updated);
      setDoctors(updated.onDutyDoctors);
      setDoctorUpdatedMsg("Doctor duty status updated.");
      setTimeout(() => setDoctorUpdatedMsg(null), 3000);
    }
  };

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospital || !currentStaff || !newDoctorName.trim()) return;
    const updated = await careRouteService.addDoctorToHospital(hospital.id, {
      name: newDoctorName.trim(),
      specialty: newDoctorSpecialty,
      shift: newDoctorShift,
      status: newDoctorStatus,
      contact: newDoctorContact.trim() || undefined,
    });
    if (updated && updated.onDutyDoctors) {
      setHospital(updated);
      setDoctors(updated.onDutyDoctors);
      setShowAddDoctorModal(false);
      setNewDoctorName("");
      setNewDoctorContact("");
      setDoctorUpdatedMsg(`Added ${newDoctorName.trim()} to emergency duty roster.`);
      setTimeout(() => setDoctorUpdatedMsg(null), 3500);
    }
  };

  const handleRemoveDoctor = async (doctorId: string) => {
    if (!hospital || !currentStaff) return;
    if (!window.confirm("Remove this physician from the emergency duty roster?")) return;
    const updated = await careRouteService.removeDoctorFromHospital(hospital.id, doctorId);
    if (updated && updated.onDutyDoctors) {
      setHospital(updated);
      setDoctors(updated.onDutyDoctors);
      setDoctorUpdatedMsg("Physician removed from duty roster.");
      setTimeout(() => setDoctorUpdatedMsg(null), 3000);
    }
  };

  // Section 30: Confirm Accept Flow
  const handleConfirmAccept = async (requestId: string) => {
    const activeHospId = hospital?.id || currentStaff?.hospitalId || "hosp-b-trauma";
    try {
      const updated = await careRouteService.updateRequestStatus(requestId, activeHospId, "accepted", {
        etaMinutes: Number(acceptEta) || 10,
        responseNote: acceptNote,
      });
      if (updated) {
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId || r.trackingCode === requestId ? updated : r))
        );
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId || r.trackingCode === requestId
              ? { ...r, status: "accepted", etaMinutes: Number(acceptEta) || 10, responseNote: acceptNote }
              : r
          )
        );
      }
    } catch (err) {
      console.error("[careroute] accept error", err);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId || r.trackingCode === requestId
            ? { ...r, status: "accepted", etaMinutes: Number(acceptEta) || 10, responseNote: acceptNote }
            : r
        )
      );
    } finally {
      setAcceptingRequestId(null);
      if (sirenActive) stopSirenAlert();
    }
  };

  // Section 31: Reject Flow
  const handleReject = async (requestId: string) => {
    const activeHospId = hospital?.id || currentStaff?.hospitalId || "hosp-b-trauma";
    const reason = window.prompt("Reason for diversion / rejection (optional):", "ER at full capacity for this emergency specialty");
    try {
      const updated = await careRouteService.updateRequestStatus(requestId, activeHospId, "rejected", {
        responseNote: reason || "Facility diverted",
      });
      if (updated) {
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId || r.trackingCode === requestId ? updated : r))
        );
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId || r.trackingCode === requestId
              ? { ...r, status: "rejected", responseNote: reason || "Facility diverted" }
              : r
          )
        );
      }
    } catch {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId || r.trackingCode === requestId
            ? { ...r, status: "rejected", responseNote: reason || "Facility diverted" }
            : r
        )
      );
    } finally {
      if (sirenActive) stopSirenAlert();
    }
  };

  // Section 32: Mark Completed & Close Request
  const handleStatusTransition = async (requestId: string, status: PatientRequestStatus) => {
    const activeHospId = hospital?.id || currentStaff?.hospitalId || "hosp-b-trauma";
    try {
      const updated = await careRouteService.updateRequestStatus(requestId, activeHospId, status);
      if (updated) {
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId || r.trackingCode === requestId ? updated : r))
        );
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId || r.trackingCode === requestId ? { ...r, status } : r
          )
        );
      }
    } catch {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId || r.trackingCode === requestId ? { ...r, status } : r
        )
      );
    }
  };

  const switchHospital = async (newHospitalId: string) => {
    stopSirenAlert();
    setLoading(true);
    const target = allHospitals.find((h) => h.id === newHospitalId);
    if (!target) return;
    setHospital(target);
    if (target.bedBreakdown) setBedBreakdown(target.bedBreakdown);
    if (target.onDutyDoctors) setDoctors(target.onDutyDoctors);

    if (currentStaff) {
      const updatedStaff = { ...currentStaff, hospitalId: target.id };
      careRouteService.setCurrentStaff(updatedStaff);
      setCurrentStaff(updatedStaff);
    }
    const data = await careRouteService.getHospitalRequests(target.id);
    setRequests(data);
    setLoading(false);
  };
  void switchHospital;

  const handleLogout = async () => {
    stopSirenAlert();
    careRouteService.setCurrentStaff(null);
    setDemoStaffUser(null);
    setCurrentStaff(null);
    try {
      await signOut();
    } catch {
      // ignore
    }
  };

  // 1. If Pi Auth is actively resolving initial session
  if (isAuthLoading && !activeStaff) {
    return (
      <CareRouteLayout>
        <div className="careroute-card" style={{ maxWidth: "480px", margin: "4rem auto", textAlign: "center", padding: "3rem 2rem" }}>
          <div
            style={{
              display: "inline-block",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "3px solid #e2e8f0",
              borderTopColor: "#dc2626",
              animation: "careroute-scan-line 0.8s linear infinite",
              marginBottom: "1rem",
            }}
          />
          <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.35rem" }}>
            Connecting to SMAJ PI HUB...
          </h3>
          <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
            Verifying Pi Network credentials and operational desk access.
          </p>
        </div>
      </CareRouteLayout>
    );
  }

  // 2. If not authenticated (exact same seller login logic in SMAJ PI HUB)
  if (!activeStaff) {
    return (
      <CareRouteLayout>
        <div
          className="careroute-card"
          style={{
            maxWidth: "520px",
            margin: "3rem auto",
            textAlign: "center",
            padding: "2.75rem 2rem",
            border: "1px solid #fee2e2",
            boxShadow: "0 10px 25px -5px rgba(220, 38, 38, 0.08)",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#fef2f2",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1.25rem",
              border: "2px solid #fee2e2",
            }}
          >
            <MedicalServicesOutlinedIcon style={{ fontSize: "2.2rem", color: "#dc2626" }} />
          </div>

          <p style={{ color: "#dc2626", fontWeight: 800, letterSpacing: "1px", fontSize: "0.8rem", textTransform: "uppercase", marginBottom: "0.5rem" }}>
            OFFICIAL EMERGENCY OPERATIONS DESK
          </p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.6rem" }}>
            Sign In with π Network
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.95rem", lineHeight: 1.55, marginBottom: "2rem" }}>
            Hospital triage operators and emergency staff sign in with their verified Pi Network identity to manage bed intake, dispatch ambulances, and respond to incoming patient emergencies.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <LoginWithPiButton
              className="careroute-btn-primary"
              style={{
                padding: "0.9rem 1.5rem",
                fontSize: "1.05rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(220, 38, 38, 0.3)",
              }}
            >
              Sign In with π Network
            </LoginWithPiButton>

            <button
              type="button"
              className="careroute-btn-secondary"
              style={{
                padding: "0.8rem 1.25rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => {
                const demoStaff: CareRouteStaff = {
                  id: "staff-demo-er",
                  hospitalId: "hosp-b-trauma",
                  fullName: "Hospital ER Operations Lead (Demo)",
                  username: "er_operations_lead",
                  email: "er_lead@hospital.com",
                  role: "hospital_admin",
                };
                careRouteService.setCurrentStaff(demoStaff);
                setDemoStaffUser(demoStaff);
                setCurrentStaff(demoStaff);
              }}
            >
              Enter as Demo ER Operations Staff
            </button>
          </div>

          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              🔒 Secured by SMAJ PI HUB Decentralized Identity Verification
            </span>
          </div>
        </div>
      </CareRouteLayout>
    );
  }

  // Section 21: Count summaries
  const incomingCount = requests.filter((r) => r.status === "submitted" || r.status === "dispatched").length;
  const acceptedCount = requests.filter((r) => r.status === "accepted").length;
  const completedCount = requests.filter((r) => r.status === "completed").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  return (
    <CareRouteLayout>
      {/* SIREN ALERT BANNER - Section 25 & 28 */}
      {sirenActive && newIncomingRequest && (
        <div className="careroute-siren-alert" role="alert" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <span className="careroute-siren-badge">NEW INCOMING EMERGENCY</span>
            <span style={{ color: "#991b1b", fontWeight: 700, fontSize: "0.95rem" }}>
              <NotificationsActiveOutlinedIcon style={{ verticalAlign: "middle", marginRight: "4px" }} />
              Request {newIncomingRequest.trackingCode}: {newIncomingRequest.emergencyType} (Patient: {newIncomingRequest.patientName})
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            {audioBlocked && (
              <button
                type="button"
                className="careroute-siren-mute-btn"
                style={{ backgroundColor: "#dc2626", color: "#ffffff", borderColor: "#b91c1c", fontWeight: 700 }}
                onClick={() => {
                  if (!sirenAudioRef.current) {
                    sirenAudioRef.current = new Audio("/careroute-siren.mp3");
                    sirenAudioRef.current.loop = true;
                  }
                  sirenAudioRef.current.currentTime = 0;
                  sirenAudioRef.current.play().then(() => setAudioBlocked(false)).catch(console.warn);
                }}
              >
                🔊 Click to Play Siren Sound
              </button>
            )}
            <button
              type="button"
              className="careroute-siren-mute-btn"
              onClick={stopSirenAlert}
            >
              <VolumeOffOutlinedIcon style={{ fontSize: "0.95rem", verticalAlign: "middle", marginRight: "4px" }} />
              Acknowledge Alert & Mute Siren
            </button>
          </div>
        </div>
      )}

      {/* Header: Section 21 */}
      <div className="careroute-dashboard-header">
        <div className="careroute-hospital-info">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
            <span className="careroute-badge careroute-badge-submitted">SMAJ PI Health — ER Operations Desk</span>
            {currentStaff && (
              <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
                Staff: {currentStaff.fullName} ({currentStaff.role === "hospital_admin" ? "Hospital Admin" : "Triage Operator"}) • π @{user?.username || currentStaff.username}
              </span>
            )}
          </div>
          <h2>{hospital.name}</h2>
          <p>
            {hospital.address}, {hospital.city} · {hospital.traumaLevel || "Level 1 Trauma Facility"}
          </p>

          {/* Verified Hospital Facility Badge */}
          <div style={{ marginTop: "0.65rem", display: "inline-flex", alignItems: "center", gap: "6px", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: "6px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#15803d" }}>
              ✓ Verified Partner Facility Operations Desk
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          {/* Section 22: Hospital Intake Control */}
          <div>
            <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
              HOSPITAL INTAKE STATUS
            </span>
            <div className="careroute-intake-selector">
              <button
                type="button"
                className={`careroute-intake-btn ${hospital.intakeStatus === "active" ? "active status-active" : ""}`}
                onClick={() => handleIntakeChange("active")}
              >
                Accepting Requests
              </button>
              <button
                type="button"
                className={`careroute-intake-btn ${hospital.intakeStatus === "diverting" ? "active status-diverting" : ""}`}
                onClick={() => handleIntakeChange("diverting")}
              >
                Limited / Diverting
              </button>
              <button
                type="button"
                className={`careroute-intake-btn ${hospital.intakeStatus === "inactive" ? "active status-inactive" : ""}`}
                onClick={() => handleIntakeChange("inactive")}
              >
                Unavailable
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (sirenActive) stopSirenAlert();
              else startSirenAlert();
            }}
            className="careroute-btn-secondary"
            style={{
              padding: "0.5rem 0.85rem",
              fontSize: "0.825rem",
              color: sirenActive ? "#dc2626" : "#475569",
              borderColor: sirenActive ? "#dc2626" : "#cbd5e1",
            }}
            title="Preview the emergency siren sound"
          >
            <NotificationsActiveOutlinedIcon style={{ fontSize: "1rem" }} />
            <span>{sirenActive ? "Stop Siren Test" : "Test Siren"}</span>
          </button>

          <Link
            to="/services/health"
            className="careroute-btn-secondary"
            style={{
              padding: "0.5rem 0.85rem",
              fontSize: "0.825rem",
              color: "#475569",
              borderColor: "#cbd5e1",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Return to SMAJ PI Health Portal"
          >
            <ExitToAppOutlinedIcon style={{ fontSize: "1rem" }} />
            <span>Health Hub</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="careroute-btn-secondary"
            style={{
              padding: "0.5rem 0.85rem",
              fontSize: "0.825rem",
              color: "#dc2626",
              borderColor: "#fecaca",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
            }}
            title="Sign out of hospital emergency triage desk"
          >
            <ExitToAppOutlinedIcon style={{ fontSize: "1rem" }} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Section 21 Counters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="careroute-card" style={{ padding: "1.1rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>INCOMING REQUESTS</span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: incomingCount > 0 ? "#dc2626" : "#0f172a", margin: "0.25rem 0 0" }}>
            {incomingCount} Pending
          </div>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Requires triage action</span>
        </div>

        <div className="careroute-card" style={{ padding: "1.1rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>ACCEPTED</span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#16a34a", margin: "0.25rem 0 0" }}>
            {acceptedCount}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>En route / bed reserved</span>
        </div>

        <div className="careroute-card" style={{ padding: "1.1rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>COMPLETED</span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0284c7", margin: "0.25rem 0 0" }}>
            {completedCount}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Admitted to care</span>
        </div>

        <div className="careroute-card" style={{ padding: "1.1rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>REJECTED / DIVERTED</span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#64748b", margin: "0.25rem 0 0" }}>
            {rejectedCount}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Diverted to other care</span>
        </div>
      </div>

      {/* Dedicated Hospital ER Operations Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "2px solid #e2e8f0", marginBottom: "1.5rem", overflowX: "auto", paddingBottom: "2px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("triage")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 800,
            fontSize: "0.925rem",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: activeTab === "triage" ? "#dc2626" : "#64748b",
            borderBottom: activeTab === "triage" ? "3px solid #dc2626" : "3px solid transparent",
            marginBottom: "-4px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <NotificationsActiveOutlinedIcon style={{ fontSize: "1.1rem" }} />
          <span>Live ER Triage Queue</span>
          {incomingCount > 0 && (
            <span style={{ background: "#dc2626", color: "#ffffff", borderRadius: "999px", padding: "2px 8px", fontSize: "0.72rem", fontWeight: 800 }}>
              {incomingCount} New
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("beds")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 800,
            fontSize: "0.925rem",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: activeTab === "beds" ? "#1d4ed8" : "#64748b",
            borderBottom: activeTab === "beds" ? "3px solid #1d4ed8" : "3px solid transparent",
            marginBottom: "-4px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <BedOutlinedIcon style={{ fontSize: "1.1rem" }} />
          <span>Bed & ICU Capacity</span>
          <span style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: "999px", padding: "2px 8px", fontSize: "0.72rem", fontWeight: 800 }}>
            {hospital.erCapacityAvailable} Avail
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("doctors")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 800,
            fontSize: "0.925rem",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: activeTab === "doctors" ? "#16a34a" : "#64748b",
            borderBottom: activeTab === "doctors" ? "3px solid #16a34a" : "3px solid transparent",
            marginBottom: "-4px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <MedicalServicesOutlinedIcon style={{ fontSize: "1.1rem" }} />
          <span>Emergency Doctors & Staff</span>
          <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "999px", padding: "2px 8px", fontSize: "0.72rem", fontWeight: 800 }}>
            {doctors.filter((d) => d.status === "on_duty").length} On Duty
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fleet")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 800,
            fontSize: "0.925rem",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: activeTab === "fleet" ? "#7c3aed" : "#64748b",
            borderBottom: activeTab === "fleet" ? "3px solid #7c3aed" : "3px solid transparent",
            marginBottom: "-4px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <LocalShippingOutlinedIcon style={{ fontSize: "1.1rem" }} />
          <span>Facility & Dispatch Ops</span>
        </button>
      </div>

      {/* TAB 1: LIVE ER TRIAGE QUEUE */}
      {activeTab === "triage" && (
        <div>
          {/* Header & Refresh */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>
                {hospital.name} — Patient Requests Queue
              </h3>
              <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                Facility Data Isolation: Displaying only assigned_hospital_id = {hospital.id}
              </span>
            </div>

            <button
              type="button"
              onClick={() => loadHospitalRequests(hospital.id)}
              className="careroute-btn-secondary"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
            >
              <RefreshOutlinedIcon style={{ fontSize: "0.95rem" }} />
              <span>Refresh Queue</span>
            </button>
          </div>

          {/* Accept Modal / Drawer */}
          {acceptingRequestId && (() => {
            const activeReq = requests.find((r) => r.id === acceptingRequestId || r.trackingCode === acceptingRequestId);
            return (
              <div style={{ background: "#ffffff", border: "2px solid #16a34a", borderRadius: "12px", padding: "1.25rem", marginBottom: "1.5rem", boxShadow: "0 4px 16px rgba(22, 163, 74, 0.18)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <h4 style={{ margin: 0, color: "#15803d", fontSize: "1.1rem", fontWeight: 800 }}>
                      Accept Emergency Request — {activeReq?.patientName || "Patient"} ({activeReq?.emergencyType || "Emergency"})
                    </h4>
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      Tracking Code: <strong style={{ color: "#dc2626" }}>{activeReq?.trackingCode || acceptingRequestId}</strong> · Location: {activeReq?.pickupAddress || "Reported Location"}
                    </span>
                  </div>
                  <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 800 }}>
                    Incoming ER Dispatch
                  </span>
                </div>

                <p style={{ margin: "0.5rem 0 1rem", fontSize: "0.85rem", color: "#475569" }}>
                  Specify the estimated ambulance/preparation ETA and pre-arrival intake note for the patient's live tracking screen:
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                      ETA (Minutes):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={acceptEta}
                      onChange={(e) => setAcceptEta(Number(e.target.value))}
                      style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "4px" }}>
                      Hospital Response Note:
                    </label>
                    <input
                      type="text"
                      value={acceptNote}
                      onChange={(e) => setAcceptNote(e.target.value)}
                      placeholder="e.g. ER Trauma Team prepped and waiting."
                      style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.875rem" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setAcceptingRequestId(null)}
                    className="careroute-btn-secondary"
                    style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmAccept(acceptingRequestId)}
                    className="careroute-btn-primary"
                    style={{ background: "#16a34a", padding: "0.5rem 1.5rem", fontSize: "0.875rem", fontWeight: 800 }}
                  >
                    ✓ Confirm Accept & Notify Patient
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Queue Table */}
          <div className="careroute-table-wrapper">
            <table className="careroute-table">
              <thead>
                <tr>
                  <th>Tracking Code</th>
                  <th>Patient</th>
                  <th>Emergency Type</th>
                  <th>Pickup Location</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                      Loading patient intake queue...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                      No emergency requests currently assigned to {hospital.name}.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <Link
                          to={`/careroute/track/${req.trackingCode}`}
                          style={{ fontWeight: 800, color: "#dc2626", textDecoration: "none" }}
                        >
                          {req.trackingCode}
                        </Link>
                        <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                          {new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>

                      <td>
                        <strong>{req.patientName}</strong>
                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{req.patientPhone}</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600 }}>{req.emergencyType}</div>
                        {req.symptomsDescription && (
                          <div style={{ fontSize: "0.78rem", color: "#64748b", maxWidth: "220px" }}>
                            {req.symptomsDescription}
                          </div>
                        )}
                      </td>

                      <td style={{ maxWidth: "200px" }}>
                        <div style={{ fontSize: "0.825rem", color: "#334155" }}>{req.pickupAddress}</div>
                      </td>

                      <td>
                        <span className={`careroute-badge careroute-badge-${req.status}`}>
                          {req.status === "dispatched" ? "Sent to Hospital" : req.status}
                        </span>
                        {req.status === "accepted" && req.etaMinutes && (
                          <div style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, marginTop: "2px" }}>
                            ETA: {req.etaMinutes} mins
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="careroute-action-group">
                          {(req.status === "submitted" || req.status === "dispatched") && (
                            <>
                              <button
                                type="button"
                                className="careroute-action-btn btn-accept"
                                onClick={() => setAcceptingRequestId(req.id)}
                                title="Accept patient into hospital ER"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="careroute-action-btn"
                                style={{ color: "#dc2626" }}
                                onClick={() => handleReject(req.id)}
                                title="Reject and divert request"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {req.status === "accepted" && (
                            <button
                              type="button"
                              className="careroute-action-btn btn-accept"
                              onClick={() => handleStatusTransition(req.id, "completed")}
                              title="Mark patient arrived and admitted"
                            >
                              Mark Completed
                            </button>
                          )}

                          {req.status === "completed" && (
                            <button
                              type="button"
                              className="careroute-action-btn"
                              onClick={() => handleStatusTransition(req.id, "closed")}
                              title="Close emergency case"
                            >
                              Close Request
                            </button>
                          )}

                          {req.status === "closed" && (
                            <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>
                              Case Closed
                            </span>
                          )}

                          {req.status === "rejected" && (
                            <span style={{ fontSize: "0.8rem", color: "#dc2626", fontWeight: 700 }}>
                              Diverted
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: BED & ICU CAPACITY MANAGEMENT */}
      {activeTab === "beds" && (
        <div className="careroute-card" style={{ padding: "1.25rem", marginBottom: "1.5rem", background: "#f8fafc" }}>
          <form onSubmit={handleSaveBedBreakdown}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <strong style={{ fontSize: "1rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                  <BedOutlinedIcon style={{ fontSize: "1.2rem", color: "#1d4ed8" }} />
                  Emergency Bed Capacity by Category
                </strong>
                <small style={{ color: "#64748b", display: "block", marginTop: "2px" }}>
                  Total Available Beds: <strong>{hospital.erCapacityAvailable}</strong> of {hospital.erCapacityTotal} total · Last reported: <strong>{hospital.reportedCapacityTimestamp || "Recently"}</strong>
                </small>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="submit"
                  className="careroute-btn-primary"
                  style={{ padding: "0.45rem 1rem", fontSize: "0.85rem" }}
                >
                  <span>Save & Sync All Beds</span>
                </button>
              </div>
            </div>

            {capacityUpdatedMsg && (
              <div style={{ color: "#15803d", background: "#dcfce7", border: "1px solid #bbf7d0", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.825rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                ✓ {capacityUpdatedMsg}
              </div>
            )}

            {/* 5 Bed Types Grid with quick +/- buttons */}
            <div className="careroute-bed-grid">
              {/* ICU Beds */}
              <div className="careroute-bed-card">
                <div className="careroute-bed-card-header">
                  <MonitorHeartOutlinedIcon style={{ color: "#dc2626", fontSize: "1.1rem" }} />
                  <span>ICU Beds (Intensive Care)</span>
                </div>
                <div className="careroute-bed-inputs">
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Available</label>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("icuAvailable", -1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Decrease available beds by 1"
                      >-</button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="careroute-bed-input"
                        value={bedBreakdown.icuAvailable}
                        onChange={(e) => handleBedBreakdownChange("icuAvailable", Number(e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("icuAvailable", 1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Increase available beds by 1"
                      >+</button>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontWeight: 700, marginTop: "1rem" }}>/</span>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Total</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="careroute-bed-input"
                      value={bedBreakdown.icuTotal}
                      onChange={(e) => handleBedBreakdownChange("icuTotal", Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Trauma Bays */}
              <div className="careroute-bed-card">
                <div className="careroute-bed-card-header">
                  <HealingOutlinedIcon style={{ color: "#ea580c", fontSize: "1.1rem" }} />
                  <span>Trauma Resuscitation Bays</span>
                </div>
                <div className="careroute-bed-inputs">
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Available</label>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("traumaBayAvailable", -1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Decrease available beds by 1"
                      >-</button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="careroute-bed-input"
                        value={bedBreakdown.traumaBayAvailable}
                        onChange={(e) => handleBedBreakdownChange("traumaBayAvailable", Number(e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("traumaBayAvailable", 1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Increase available beds by 1"
                      >+</button>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontWeight: 700, marginTop: "1rem" }}>/</span>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Total</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="careroute-bed-input"
                      value={bedBreakdown.traumaBayTotal}
                      onChange={(e) => handleBedBreakdownChange("traumaBayTotal", Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* General ER Beds */}
              <div className="careroute-bed-card">
                <div className="careroute-bed-card-header">
                  <BedOutlinedIcon style={{ color: "#2563eb", fontSize: "1.1rem" }} />
                  <span>General Emergency Beds</span>
                </div>
                <div className="careroute-bed-inputs">
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Available</label>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("generalErAvailable", -1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Decrease available beds by 1"
                      >-</button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="careroute-bed-input"
                        value={bedBreakdown.generalErAvailable}
                        onChange={(e) => handleBedBreakdownChange("generalErAvailable", Number(e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("generalErAvailable", 1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Increase available beds by 1"
                      >+</button>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontWeight: 700, marginTop: "1rem" }}>/</span>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Total</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="careroute-bed-input"
                      value={bedBreakdown.generalErTotal}
                      onChange={(e) => handleBedBreakdownChange("generalErTotal", Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Pediatric / Maternity Beds */}
              <div className="careroute-bed-card">
                <div className="careroute-bed-card-header">
                  <ChildCareOutlinedIcon style={{ color: "#9333ea", fontSize: "1.1rem" }} />
                  <span>Pediatric & Maternity</span>
                </div>
                <div className="careroute-bed-inputs">
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Available</label>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("pediatricAvailable", -1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Decrease available beds by 1"
                      >-</button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="careroute-bed-input"
                        value={bedBreakdown.pediatricAvailable}
                        onChange={(e) => handleBedBreakdownChange("pediatricAvailable", Number(e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("pediatricAvailable", 1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Increase available beds by 1"
                      >+</button>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontWeight: 700, marginTop: "1rem" }}>/</span>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Total</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="careroute-bed-input"
                      value={bedBreakdown.pediatricTotal}
                      onChange={(e) => handleBedBreakdownChange("pediatricTotal", Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Ventilators / High-Flow O2 */}
              <div className="careroute-bed-card">
                <div className="careroute-bed-card-header">
                  <AirOutlinedIcon style={{ color: "#0891b2", fontSize: "1.1rem" }} />
                  <span>Ventilators / High-Flow O2</span>
                </div>
                <div className="careroute-bed-inputs">
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Available</label>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("ventilatorAvailable", -1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Decrease available beds by 1"
                      >-</button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="careroute-bed-input"
                        value={bedBreakdown.ventilatorAvailable}
                        onChange={(e) => handleBedBreakdownChange("ventilatorAvailable", Number(e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => adjustBedAvailable("ventilatorAvailable", 1)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "4px", width: "24px", height: "26px", cursor: "pointer", fontWeight: 800, fontSize: "0.85rem", color: "#475569" }}
                        title="Increase available beds by 1"
                      >+</button>
                    </div>
                  </div>
                  <span style={{ color: "#94a3b8", fontWeight: 700, marginTop: "1rem" }}>/</span>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>Total</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="careroute-bed-input"
                      value={bedBreakdown.ventilatorTotal}
                      onChange={(e) => handleBedBreakdownChange("ventilatorTotal", Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: EMERGENCY DOCTORS & SPECIALISTS ROSTER */}
      {activeTab === "doctors" && (
        <div className="careroute-card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <strong style={{ fontSize: "1rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                <MedicalServicesOutlinedIcon style={{ fontSize: "1.2rem", color: "#16a34a" }} />
                On-Duty Emergency Medical Staff & Specialists
              </strong>
              <small style={{ color: "#64748b" }}>
                {doctors.filter((d) => d.status === "on_duty").length} On Duty in ER ·{" "}
                {doctors.filter((d) => d.status === "in_surgery").length} In Surgery ·{" "}
                {doctors.filter((d) => d.status === "on_call").length} On Call
              </small>
            </div>

            <button
              type="button"
              onClick={() => setShowAddDoctorModal(!showAddDoctorModal)}
              className="careroute-btn-secondary"
              style={{ padding: "0.45rem 0.85rem", fontSize: "0.825rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <PersonAddOutlinedIcon style={{ fontSize: "1rem" }} />
              <span>{showAddDoctorModal ? "Close Form" : "+ Add Doctor to Roster"}</span>
            </button>
          </div>

          {doctorUpdatedMsg && (
            <div style={{ color: "#15803d", background: "#dcfce7", border: "1px solid #bbf7d0", padding: "0.45rem 0.75rem", borderRadius: "6px", fontSize: "0.825rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              ✓ {doctorUpdatedMsg}
            </div>
          )}

          {/* Add Doctor Form */}
          {showAddDoctorModal && (
            <form onSubmit={handleAddDoctor} style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", color: "#0f172a" }}>
                Add Physician / Specialist to Duty Roster
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "2px" }}>
                    Doctor Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Rajesh Kumar"
                    value={newDoctorName}
                    onChange={(e) => setNewDoctorName(e.target.value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "2px" }}>
                    Specialty / Role *
                  </label>
                  <select
                    value={newDoctorSpecialty}
                    onChange={(e) => setNewDoctorSpecialty(e.target.value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#ffffff" }}
                  >
                    <option value="Chief ER Physician & Triage Lead">Chief ER Physician & Triage Lead</option>
                    <option value="Chief Trauma Surgeon">Chief Trauma Surgeon</option>
                    <option value="Interventional Cardiologist">Interventional Cardiologist</option>
                    <option value="Critical Care & Anesthesiologist">Critical Care & Anesthesiologist</option>
                    <option value="Neurotrauma Specialist">Neurotrauma Specialist</option>
                    <option value="Orthopedic & Trauma Specialist">Orthopedic & Trauma Specialist</option>
                    <option value="Pediatric Emergency Specialist">Pediatric Emergency Specialist</option>
                    <option value="Obstetric & Maternity Lead">Obstetric & Maternity Lead</option>
                    <option value="General Emergency Practitioner">General Emergency Practitioner</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "2px" }}>
                    Shift Schedule *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Day Shift (08:00 - 20:00)"
                    value={newDoctorShift}
                    onChange={(e) => setNewDoctorShift(e.target.value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "2px" }}>
                    Current Duty Status
                  </label>
                  <select
                    value={newDoctorStatus}
                    onChange={(e) => setNewDoctorStatus(e.target.value as DoctorStatus)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#ffffff" }}
                  >
                    <option value="on_duty">On Duty (In ER)</option>
                    <option value="on_call">On Call (Available in 15m)</option>
                    <option value="in_surgery">In Surgery / Resuscitation</option>
                    <option value="off_duty">Off Duty</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: "2px" }}>
                    Contact / Extension (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ext. 109"
                    value={newDoctorContact}
                    onChange={(e) => setNewDoctorContact(e.target.value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="submit" className="careroute-btn-primary" style={{ padding: "0.4rem 0.85rem", fontSize: "0.825rem" }}>
                  <span>Add Physician</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(false)}
                  className="careroute-btn-secondary"
                  style={{ padding: "0.4rem 0.85rem", fontSize: "0.825rem" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Doctor Cards Grid */}
          <div className="careroute-doctor-grid">
            {doctors.map((doc) => (
              <div key={doc.id} className="careroute-doctor-card">
                <div className="careroute-doctor-info">
                  <div className="careroute-doctor-avatar">
                    <MedicalServicesOutlinedIcon style={{ fontSize: "1.25rem" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="careroute-doctor-name">{doc.name}</div>
                    <div className="careroute-doctor-specialty">{doc.specialty}</div>
                    <div className="careroute-doctor-shift">
                      {doc.shift} {doc.contact ? `· ${doc.contact}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDoctor(doc.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                    title="Remove from roster"
                  >
                    <DeleteOutlineOutlinedIcon style={{ fontSize: "1.1rem" }} />
                  </button>
                </div>

                {/* Status Selector Dropdown */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9" }}>
                  <span className={`careroute-status-pill status-${doc.status}`}>
                    {doc.status === "on_duty" && "● On Duty (In ER)"}
                    {doc.status === "on_call" && "◐ On Call (15m)"}
                    {doc.status === "in_surgery" && "⊕ In Surgery"}
                    {doc.status === "off_duty" && "○ Off Duty"}
                  </span>

                  <select
                    value={doc.status}
                    onChange={(e) => handleDoctorStatusChange(doc.id, e.target.value as DoctorStatus)}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.4rem",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    <option value="on_duty">Set: On Duty</option>
                    <option value="on_call">Set: On Call</option>
                    <option value="in_surgery">Set: In Surgery</option>
                    <option value="off_duty">Set: Off Duty</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FACILITY & DISPATCH OPERATIONS */}
      {activeTab === "fleet" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
          {/* Facility Info Card */}
          <div className="careroute-card" style={{ padding: "1.5rem" }}>
            <h4 style={{ margin: "0 0 0.75rem", color: "#0f172a", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <LocalShippingOutlinedIcon style={{ color: "#7c3aed" }} />
              Hospital Facility Credentials
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 700 }}>FACILITY NAME</span>
                <strong style={{ color: "#0f172a", fontSize: "1rem" }}>{hospital.name}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 700 }}>TRAUMA ACCREDITATION</span>
                <span style={{ color: "#1e293b", fontWeight: 600 }}>{hospital.traumaLevel || "Level 1 Comprehensive Trauma Center"}</span>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 700 }}>EMERGENCY INTAKE MODE</span>
                <div style={{ marginTop: "4px" }}>
                  <span className={`careroute-badge ${hospital.intakeStatus === "active" ? "careroute-badge-accepted" : "careroute-badge-rejected"}`}>
                    {hospital.intakeStatus === "active" ? "● Open & Accepting Emergency Requests" : "○ Diverting / Limited Operations"}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 700 }}>ADDRESS & LOCATION</span>
                <span style={{ color: "#334155" }}>{hospital.address}, {hospital.city}</span>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem", fontWeight: 700 }}>EMERGENCY CONTACT</span>
                <span style={{ color: "#dc2626", fontWeight: 800 }}>{hospital.emergencyContact || hospital.phone || "+91 1800-CARE-ROUTE"}</span>
              </div>
            </div>
          </div>

          {/* Ambulance Dispatch Stations */}
          <div className="careroute-card" style={{ padding: "1.5rem" }}>
            <h4 style={{ margin: "0 0 0.75rem", color: "#0f172a", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <LocalShippingOutlinedIcon style={{ color: "#dc2626" }} />
              Active Ambulance Dispatches
            </h4>
            <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
              Real-time emergency transport vehicles assigned to {hospital.name}:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a", display: "block" }}>🚑 ALS Unit 01 (Advanced Life Support)</strong>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Paramedic: Team Alpha · Ext. 101</span>
                </div>
                <span style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0", padding: "3px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 800 }}>
                  Standby at ER Bay
                </span>
              </div>

              <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a", display: "block" }}>🚑 ALS Unit 02 (Cardiac Resuscitation)</strong>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Paramedic: Team Bravo · Ext. 102</span>
                </div>
                <span style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", padding: "3px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 800 }}>
                  En Route (Dispatch Active)
                </span>
              </div>

              <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.9rem", color: "#0f172a", display: "block" }}>🚑 BLS Unit 03 (Basic Life Support)</strong>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Transport: Team Delta · Ext. 103</span>
                </div>
                <span style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "3px 8px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 800 }}>
                  Available in Sector
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </CareRouteLayout>
  );
};

export default CareRouteHospitalDashboard;
