import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import { CareDialog, formatCareDate, PageHeading, StatusBadge, isActiveRequest } from "./CareRouteUI";
import { getHospitalStaff, setHospitalStaff } from "../../lib/careRouteStaffSession";
import { axiosClient } from "../../lib/axiosClient";
import { careRouteService, getStoredRequests } from "../../lib/careRouteService";
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

const EMPTY_BEDS: HospitalBedBreakdown = {
  icuAvailable: 0,
  icuTotal: 0,
  traumaBayAvailable: 0,
  traumaBayTotal: 0,
  generalErAvailable: 0,
  generalErTotal: 0,
  pediatricAvailable: 0,
  pediatricTotal: 0,
  ventilatorAvailable: 0,
  ventilatorTotal: 0,
};

export const CareRouteHospitalDashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthContext();

  const [activeStaff, setActiveStaff] = useState<CareRouteStaff | null>(getHospitalStaff);
  const [currentStaff, setCurrentStaff] = useState<CareRouteStaff | null>(activeStaff);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"pending" | "active" | "all">("pending");
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [diversionReason, setDiversionReason] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  const [hospital, setHospital] = useState<CareRouteHospital>({
    id: "",
    name: "",
    address: "",
    city: "",
    country: "",
    phone: "",
    latitude: 0,
    longitude: 0,
    intakeStatus: "inactive",
    capabilities: [],
    erCapacityTotal: 0,
    erCapacityAvailable: 0,
  });
  const [requests, setRequests] = useState<CareRouteRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"triage" | "beds" | "doctors" | "fleet">("triage");

  const [capacityUpdatedMsg, setCapacityUpdatedMsg] = useState<string | null>(null);
  const [bedBreakdown, setBedBreakdown] = useState<HospitalBedBreakdown>({
    icuAvailable: 0,
    icuTotal: 0,
    traumaBayAvailable: 0,
    traumaBayTotal: 0,
    generalErAvailable: 0,
    generalErTotal: 0,
    pediatricAvailable: 0,
    pediatricTotal: 0,
    ventilatorAvailable: 0,
    ventilatorTotal: 0,
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
  const [acceptNote, setAcceptNote] = useState<string>("");

  // Siren alert state (ONLY inside this dashboard and ONLY for this hospital)
  const hospitalReadyRef = useRef<boolean>(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [newIncomingRequest, setNewIncomingRequest] = useState<CareRouteRequest | null>(null);

  // Pre-seed alerted requests on load so existing requests NEVER ring the siren when tab opens!
  const alertedRequestIdsRef = useRef<Set<string>>(new Set(getStoredRequests().map(r => r.id)));
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
      setCurrentStaff(activeStaff);
    }
  }, [activeStaff]);

  useEffect(() => {
    hospitalReadyRef.current = !!activeStaff && hospital.id === activeStaff.hospitalId;
  }, [activeStaff, hospital.id]);

  // Load hospital & emergency requests with real-time updates and graceful background sync
  useEffect(() => {
    let isMounted = true;
    if (!activeStaff) return;
    let pollInterval: number | null = null;
    let broadcastChannel: BroadcastChannel | null = null;

    const syncRemoteData = async () => {
      try {
        const rawHospitals = await careRouteService.getHospitals();
        const cleanHospitals: CareRouteHospital[] = rawHospitals.filter(
          (h: CareRouteHospital) => h && h.name && h.name.trim().toLowerCase() !== "test" && h.name.trim().length >= 3
        );
        const hospitalsList = cleanHospitals;
        if (isMounted) {
          const found = hospitalsList.find(h => h.id === activeStaff.hospitalId);
          if (found) {
            setHospital(found);
            setBedBreakdown(found.bedBreakdown || EMPTY_BEDS);
            setDoctors(found.onDutyDoctors || []);
          }
        }

        const targetId = activeStaff.hospitalId;
        const freshReqs = await careRouteService.getHospitalRequests(targetId);
        if (isMounted && Array.isArray(freshReqs)) {
          setRequests(freshReqs.filter(r => r.assignedHospitalId === activeStaff.hospitalId));
          // Seed all existing requests silently so opening tab never triggers sirens
          freshReqs.forEach(r => alertedRequestIdsRef.current.add(r.id));
        }
      } catch (err) {
        if (isMounted) setOperationError("Hospital details could not be refreshed. Please try again.");
        console.warn("[careroute] Background sync error:", err);
      }
    };

    if (activeStaff) {
      void syncRemoteData();
    }

    // Central incoming request processor
    const processIncomingRequest = (req: CareRouteRequest) => {
      const staff = getHospitalStaff();
      // SECURITY & ISOLATION RULE: Audio and siren alert trigger ONLY if dashboard is authenticated & ready, and request belongs to THIS hospital!
      if (!staff || req.assignedHospitalId !== staff.hospitalId) {
        return;
      }

      setRequests(prev => [req, ...prev.filter(r => r.id !== req.id)]);

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
        broadcastChannel.onmessage = event => {
          if (event.data?.type === "NEW_REQUEST" && event.data?.request) {
            processIncomingRequest(event.data.request);
          } else if (
            (event.data?.type === "REQUEST_CANCELLED" || event.data?.type === "REQUEST_UPDATED") &&
            event.data?.request
          ) {
            const updated = event.data.request as CareRouteRequest;
            if (updated.assignedHospitalId !== activeStaff.hospitalId) return;
            setRequests(prev =>
              prev.map(r => (r.id === updated.id || r.trackingCode === updated.trackingCode ? { ...r, ...updated } : r))
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
      if (updated && updated.assignedHospitalId === activeStaff.hospitalId) {
        setRequests(prev =>
          prev.map(r => (r.id === updated.id || r.trackingCode === updated.trackingCode ? { ...r, ...updated } : r))
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
      const staff = getHospitalStaff();
      if (!staff || !hospitalReadyRef.current) return;

      careRouteService
        .getHospitalRequests(staff.hospitalId)
        .then(freshReqs => {
          if (!isMounted) return;
          setRequests(freshReqs.filter(r => r.assignedHospitalId === staff.hospitalId));
          const ackSet = getAcknowledgedIds();
          const pending = freshReqs.find(
            r =>
              (r.status === "submitted" || r.status === "dispatched") &&
              !ackSet.has(r.id) &&
              !alertedRequestIdsRef.current.has(r.id)
          );
          if (pending) {
            processIncomingRequest(pending);
          }
        })
        .catch(() => setOperationError("The request queue could not be refreshed."));
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
  }, [activeStaff]);

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
          .catch(err => {
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
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      setRequests(data.filter(r => r.assignedHospitalId === hospitalId));

      // Only evaluate siren alert if dashboard is authenticated & ready!
      if (hospitalReadyRef.current) {
        const ackSet = getAcknowledgedIds();
        const pending = data.find(
          r =>
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
    if (!currentStaff || hospital.id !== currentStaff.hospitalId) return;
    const updated = await careRouteService.updateHospitalIntakeStatus(hospital.id, newStatus);
    if (updated) {
      setHospital({ ...hospital, intakeStatus: newStatus });
    }
  };

  // Enhanced: Multi-Category Bed Breakdown Update
  const handleBedBreakdownChange = (field: keyof HospitalBedBreakdown, value: number) => {
    setBedBreakdown(prev => ({
      ...prev,
      [field]: Math.max(0, value),
    }));
  };

  const adjustBedAvailable = (field: keyof HospitalBedBreakdown, delta: number) => {
    setBedBreakdown(prev => {
      const currentVal = Number(prev[field]) || 0;
      const nextVal = Math.max(0, currentVal + delta);
      return { ...prev, [field]: nextVal };
    });
  };

  const handleSaveBedBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStaff || hospital.id !== currentStaff.hospitalId) return;
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
    if (!currentStaff || hospital.id !== currentStaff.hospitalId) return;
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
    if (!currentStaff || hospital.id !== currentStaff.hospitalId || !newDoctorName.trim()) return;
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
    if (!currentStaff || hospital.id !== currentStaff.hospitalId) return;
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
    if (
      !currentStaff ||
      hospital.id !== currentStaff.hospitalId ||
      !requests.some(
        r => (r.id === requestId || r.trackingCode === requestId) && r.assignedHospitalId === currentStaff.hospitalId
      )
    )
      return;
    const activeHospId = currentStaff.hospitalId;
    try {
      const updated = await careRouteService.updateRequestStatus(requestId, activeHospId, "accepted", {
        etaMinutes: Number(acceptEta) || 10,
        responseNote: acceptNote,
      });
      if (updated) {
        setRequests(prev => prev.map(r => (r.id === requestId || r.trackingCode === requestId ? updated : r)));
      } else {
        setRequests(prev =>
          prev.map(r =>
            r.id === requestId || r.trackingCode === requestId
              ? { ...r, status: "accepted", etaMinutes: Number(acceptEta) || 10, responseNote: acceptNote }
              : r
          )
        );
      }
    } catch (err) {
      console.error("[careroute] accept error", err);
      setRequests(prev =>
        prev.map(r =>
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
  const handleReject = async (requestId: string, reason: string) => {
    if (
      !currentStaff ||
      hospital.id !== currentStaff.hospitalId ||
      !requests.some(
        r => (r.id === requestId || r.trackingCode === requestId) && r.assignedHospitalId === currentStaff.hospitalId
      )
    )
      return;
    const activeHospId = currentStaff.hospitalId;
    try {
      const updated = await careRouteService.updateRequestStatus(requestId, activeHospId, "rejected", {
        responseNote: reason || "Facility diverted",
      });
      if (updated) {
        setRequests(prev => prev.map(r => (r.id === requestId || r.trackingCode === requestId ? updated : r)));
      } else {
        setRequests(prev =>
          prev.map(r =>
            r.id === requestId || r.trackingCode === requestId
              ? { ...r, status: "rejected", responseNote: reason || "Facility diverted" }
              : r
          )
        );
      }
    } catch {
      setRequests(prev =>
        prev.map(r =>
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
    if (
      !currentStaff ||
      hospital.id !== currentStaff.hospitalId ||
      !requests.some(
        r => (r.id === requestId || r.trackingCode === requestId) && r.assignedHospitalId === currentStaff.hospitalId
      )
    )
      return;
    const activeHospId = currentStaff.hospitalId;
    try {
      const updated = await careRouteService.updateRequestStatus(requestId, activeHospId, status);
      if (updated) {
        setRequests(prev => prev.map(r => (r.id === requestId || r.trackingCode === requestId ? updated : r)));
      } else {
        setRequests(prev => prev.map(r => (r.id === requestId || r.trackingCode === requestId ? { ...r, status } : r)));
      }
    } catch {
      setRequests(prev => prev.map(r => (r.id === requestId || r.trackingCode === requestId ? { ...r, status } : r)));
    }
  };

  const signInStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginBusy(true);
    setOperationError(null);
    try {
      const response = await axiosClient.post("/careroute/hospital/login", {
        emailOrUsername: identifier.trim(),
        password,
      });
      const staff = response.data?.staff as CareRouteStaff | undefined;
      if (!staff?.id || !staff.hospitalId) throw new Error("Invalid staff session");
      setHospitalStaff(staff);
      setHospital(previous => ({ ...previous, id: "", name: "" }));
      setRequests([]);
      setDoctors([]);
      setBedBreakdown(EMPTY_BEDS);
      setSelectedRequest(null);
      setNewIncomingRequest(null);
      setCurrentStaff(staff);
      setActiveStaff(staff);
      setPassword("");
    } catch {
      setOperationError("Staff sign-in could not be verified. Check your hospital credentials and connection.");
    } finally {
      setLoginBusy(false);
    }
  };
  const runOperation = async (action: () => Promise<void>) => {
    setOperationBusy(true);
    setOperationError(null);
    try {
      await action();
    } catch {
      setOperationError("The change could not be completed. Refresh and try again.");
    } finally {
      setOperationBusy(false);
    }
  };
  const confirmAction = (title: string, description: string, action: () => Promise<void>) =>
    setConfirmation({ title, description, action });
  const refreshHospital = async () => {
    if (!activeStaff) return;
    await runOperation(async () => {
      const hospitals = await careRouteService.getHospitals();
      const found = hospitals.find(h => h.id === activeStaff.hospitalId);
      if (found) {
        setHospital(found);
        setBedBreakdown(found.bedBreakdown || EMPTY_BEDS);
        setDoctors(found.onDutyDoctors || []);
      } else setOperationError("Your hospital details are not available. Contact your hospital administrator.");
      await loadHospitalRequests(activeStaff.hospitalId);
    });
  };
  const selected = requests.find(r => r.id === selectedRequest);
  const pending = requests.filter(r => r.status === "submitted" || r.status === "dispatched");
  const queue = (
    queueFilter === "pending"
      ? pending
      : queueFilter === "active"
        ? requests.filter(r => isActiveRequest(r.status))
        : requests
  )
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const bedCategories: { title: string; available: keyof HospitalBedBreakdown; total: keyof HospitalBedBreakdown }[] = [
    { title: "ICU", available: "icuAvailable", total: "icuTotal" },
    { title: "Trauma bays", available: "traumaBayAvailable", total: "traumaBayTotal" },
    { title: "General ER", available: "generalErAvailable", total: "generalErTotal" },
    { title: "Pediatric", available: "pediatricAvailable", total: "pediatricTotal" },
    { title: "Ventilators", available: "ventilatorAvailable", total: "ventilatorTotal" },
  ];
  const specialties = [
    "Emergency Physician",
    "Chief ER Physician & Triage Lead",
    "Chief Trauma Surgeon",
    "Interventional Cardiologist",
    "Critical Care & Anesthesiologist",
    "Neurotrauma Specialist",
    "Orthopedic & Trauma Specialist",
    "Pediatric Emergency Specialist",
    "Obstetric & Maternity Lead",
    "General Emergency Practitioner",
  ];
  const dutyLabels: Record<DoctorStatus, string> = {
    on_duty: "On duty",
    on_call: "On call",
    in_surgery: "In surgery",
    off_duty: "Off duty",
  };
  if (!activeStaff)
    return (
      <CareRouteLayout>
        <PageHeading
          eyebrow="Hospital operations"
          title="Hospital staff access"
          description="This workspace is reserved for authorized staff at your hospital."
        />
        <section className="cr-panel cr-staff-signin">
          <div className="cr-eyebrow">Secure staff workspace</div>
          <h2>Sign in to your ER desk</h2>
          <p>
            A patient Pi account does not grant hospital access. Use the staff credentials provided by your hospital.
          </p>
          {isAuthLoading && (
            <div role="status" className="cr-loading">
              Checking your Pi session...
            </div>
          )}
          {!isAuthenticated && (
            <div className="cr-pi-signin">
              <LoginWithPiButton className="careroute-btn-secondary">Connect Pi account</LoginWithPiButton>
              <p>Use your SMAJ PI HUB Pi identity. Hospital permissions require provider verification.</p>
            </div>
          )}
          <form className="cr-form" onSubmit={signInStaff}>
            <label className="cr-field">
              Staff email or username
              <input
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="cr-field">
              Password
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {operationError && (
              <div className="cr-message cr-message-error" role="alert">
                {operationError}
              </div>
            )}
            <button className="careroute-btn-primary" type="submit" disabled={loginBusy}>
              {loginBusy ? "Verifying access..." : "Sign in to hospital"}
            </button>
          </form>
          <Link className="cr-text-link" to="/careroute">
            Return to patient care
          </Link>
        </section>
      </CareRouteLayout>
    );

  return (
    <CareRouteLayout>
      <PageHeading
        eyebrow="Clinical operations"
        title="Hospital ER desk"
        description={hospital.id === activeStaff.hospitalId ? hospital.name : "Loading your assigned hospital..."}
        actions={
          <button className="careroute-btn-secondary" disabled={operationBusy || loading} onClick={refreshHospital}>
            {operationBusy || loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />
      <div className="cr-account-line">
        Signed in as <strong>{currentStaff?.fullName}</strong>
        {user?.username && <span>Pi account @{user.username}</span>}
      </div>
      {operationError && (
        <div className="cr-message cr-message-error" role="alert">
          {operationError}
        </div>
      )}
      {!hospital.id || hospital.id !== activeStaff.hospitalId ? (
        <div className="cr-panel cr-empty">
          <h2>Loading hospital details</h2>
          <p>If the server is unavailable, your hospital workspace cannot be loaded. Please retry.</p>
          <button className="careroute-btn-secondary" disabled={operationBusy} onClick={refreshHospital}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {sirenActive && newIncomingRequest && (
            <div className="cr-message cr-message-warning" role="alert">
              <div>
                <strong>New emergency request</strong>
                <p>
                  {newIncomingRequest.trackingCode}: {newIncomingRequest.emergencyType}
                </p>
              </div>
              <div className="cr-actions">
                {audioBlocked && (
                  <button
                    className="careroute-btn-secondary"
                    onClick={() => {
                      void sirenAudioRef.current?.play().then(() => setAudioBlocked(false));
                    }}
                  >
                    Enable sound
                  </button>
                )}
                <button className="careroute-btn-secondary" onClick={stopSirenAlert}>
                  Acknowledge &amp; mute
                </button>
              </div>
            </div>
          )}
          <section className="cr-panel cr-intake-panel">
            <div>
              <div className="cr-eyebrow">Intake availability</div>
              <h2>
                {hospital.intakeStatus === "active"
                  ? "Accepting requests"
                  : hospital.intakeStatus === "diverting"
                    ? "Limited availability"
                    : "Currently unavailable"}
              </h2>
              <p>Changes affect new requests for your hospital.</p>
            </div>
            <div className="cr-segments" role="group" aria-label="Hospital intake availability">
              {(["active", "diverting", "inactive"] as HospitalIntakeStatus[]).map(status => (
                <button
                  disabled={operationBusy}
                  aria-pressed={hospital.intakeStatus === status}
                  key={status}
                  onClick={() => {
                    if (hospital.intakeStatus !== status)
                      confirmAction(
                        "Change intake availability?",
                        "Confirm that your hospital's intake availability should change. This affects incoming patients.",
                        () => handleIntakeChange(status)
                      );
                  }}
                >
                  {status === "active" ? "Accepting" : status === "diverting" ? "Limited" : "Unavailable"}
                </button>
              ))}
            </div>
          </section>
          <div className="cr-metrics">
            <div className="cr-panel">
              <span>Pending review</span>
              <strong>{pending.length}</strong>
            </div>
            <div className="cr-panel">
              <span>Accepted requests</span>
              <strong>{requests.filter(r => r.status === "accepted").length}</strong>
            </div>
            <div className="cr-panel">
              <span>Available ER beds</span>
              <strong>{hospital.erCapacityAvailable ?? "Not reported"}</strong>
            </div>
            <div className="cr-panel">
              <span>Care completed</span>
              <strong>{requests.filter(r => r.status === "completed").length}</strong>
            </div>
          </div>
          <div className="cr-workspace-tabs" role="group" aria-label="Hospital workspace">
            {(["triage", "beds", "doctors", "fleet"] as const).map(tab => (
              <button key={tab} aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>
                {tab === "triage"
                  ? "Requests"
                  : tab === "beds"
                    ? "Bed capacity"
                    : tab === "doctors"
                      ? "Staff roster"
                      : "Facility & transport"}
              </button>
            ))}
          </div>
          {activeTab === "triage" && (
            <div className="cr-operations-grid">
              <section className="cr-panel cr-queue">
                <div className="cr-section-heading">
                  <div>
                    <h2>Request queue</h2>
                    <p>Requests assigned to your hospital.</p>
                  </div>
                  <span className="cr-count">{queue.length}</span>
                </div>
                <div className="cr-segments" role="group" aria-label="Filter queue">
                  {(["pending", "active", "all"] as const).map(filter => (
                    <button key={filter} aria-pressed={queueFilter === filter} onClick={() => setQueueFilter(filter)}>
                      {filter === "pending" ? "Pending" : filter === "active" ? "Active" : "All requests"}
                    </button>
                  ))}
                </div>
                {loading ? (
                  <div role="status" className="cr-loading">
                    Loading the request queue...
                  </div>
                ) : queue.length === 0 ? (
                  <div className="cr-empty">
                    <h3>No requests in this view</h3>
                    <p>New requests assigned to your hospital will appear here.</p>
                  </div>
                ) : (
                  <div className="cr-queue-list">
                    {queue.map(request => (
                      <button
                        key={request.id}
                        className={`cr-queue-item${selectedRequest === request.id ? " is-selected" : ""}`}
                        aria-pressed={selectedRequest === request.id}
                        onClick={() => setSelectedRequest(request.id)}
                      >
                        <div className="cr-card-top">
                          <strong>{request.patientName || "Patient name not provided"}</strong>
                          <StatusBadge status={request.status} />
                        </div>
                        <p>{request.emergencyType}</p>
                        <div className="cr-queue-meta">
                          <span>{request.trackingCode || request.id}</span>
                          <time>{formatCareDate(request.createdAt)}</time>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section className="cr-panel cr-request-details">
                {selected ? (
                  <>
                    <div className="cr-card-top">
                      <div className="cr-eyebrow">Request details</div>
                      <StatusBadge status={selected.status} />
                    </div>
                    <h2>{selected.patientName || "Patient name not provided"}</h2>
                    <p>{selected.emergencyType}</p>
                    <dl className="cr-detail-grid">
                      <div>
                        <dt>Tracking code</dt>
                        <dd>{selected.trackingCode || selected.id}</dd>
                      </div>
                      <div>
                        <dt>Severity</dt>
                        <dd>{selected.severity}</dd>
                      </div>
                      <div>
                        <dt>Patient phone</dt>
                        <dd>
                          {selected.patientPhone ? (
                            <a href={`tel:${selected.patientPhone}`}>{selected.patientPhone}</a>
                          ) : (
                            "Not provided"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Age</dt>
                        <dd>{selected.patientAge || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Pickup location</dt>
                        <dd>{selected.pickupAddress || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Symptoms</dt>
                        <dd>{selected.symptomsDescription || "Not provided"}</dd>
                      </div>
                      {selected.emergencyContact && (
                        <div>
                          <dt>Emergency contact</dt>
                          <dd>{selected.emergencyContact}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Hospital response</dt>
                        <dd>{selected.responseNote || "No response recorded"}</dd>
                      </div>
                      {typeof selected.etaMinutes === "number" && (
                        <div>
                          <dt>ETA</dt>
                          <dd>{selected.etaMinutes} min</dd>
                        </div>
                      )}
                      {selected.ambulanceAssigned && (
                        <div>
                          <dt>Ambulance</dt>
                          <dd>{selected.ambulanceAssigned}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Last updated</dt>
                        <dd>{formatCareDate(selected.updatedAt)}</dd>
                      </div>
                    </dl>
                    <div className="cr-actions">
                      {(selected.status === "submitted" || selected.status === "dispatched") && (
                        <>
                          <button
                            className="careroute-btn-primary"
                            disabled={operationBusy}
                            onClick={() => setAcceptingRequestId(selected.id)}
                          >
                            Accept request
                          </button>
                          <button
                            className="cr-button-danger"
                            disabled={operationBusy}
                            onClick={() => {
                              setRejectTarget(selected.id);
                              setDiversionReason("");
                            }}
                          >
                            Divert request
                          </button>
                        </>
                      )}
                      {selected.status === "accepted" && (
                        <button
                          className="careroute-btn-primary"
                          disabled={operationBusy}
                          onClick={() =>
                            confirmAction(
                              "Mark care as completed?",
                              "Confirm that the patient has arrived and care is completed for this request.",
                              () => handleStatusTransition(selected.id, "completed")
                            )
                          }
                        >
                          Mark completed
                        </button>
                      )}
                      {selected.status === "completed" && (
                        <button
                          className="careroute-btn-secondary"
                          disabled={operationBusy}
                          onClick={() =>
                            confirmAction("Close this request?", "The request will be marked as closed.", () =>
                              handleStatusTransition(selected.id, "closed")
                            )
                          }
                        >
                          Close request
                        </button>
                      )}
                      <Link
                        className="cr-text-link"
                        to={`/careroute/track/${encodeURIComponent(selected.trackingCode || selected.id)}`}
                      >
                        Open tracking
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="cr-empty">
                    <h2>Select a request</h2>
                    <p>Review the patient details and choose the appropriate action.</p>
                  </div>
                )}
              </section>
            </div>
          )}
          {activeTab === "beds" && (
            <section className="cr-panel">
              <div className="cr-section-heading">
                <div>
                  <h2>Bed capacity</h2>
                  <p>Update available spaces and total capacity for each care area.</p>
                </div>
              </div>
              {capacityUpdatedMsg && (
                <div className="cr-message" role="status">
                  Capacity recorded. Check the connection status for server confirmation.
                </div>
              )}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  confirmAction(
                    "Save bed availability?",
                    "These numbers will be shared as your hospital's reported capacity.",
                    async () => {
                      await handleSaveBedBreakdown(e);
                    }
                  );
                }}
              >
                <div className="cr-bed-grid">
                  {bedCategories.map(category => (
                    <div className="cr-bed-card" key={category.available}>
                      <h3>{category.title}</h3>
                      <div className="cr-bed-fields">
                        <label className="cr-field">
                          Available
                          <div className="cr-stepper">
                            <button
                              type="button"
                              aria-label={`Decrease ${category.title} available`}
                              onClick={() => adjustBedAvailable(category.available, -1)}
                            >
                              -
                            </button>
                            <input
                              aria-label={`${category.title} available`}
                              type="number"
                              min="0"
                              max={bedBreakdown[category.total]}
                              value={bedBreakdown[category.available]}
                              onChange={e => handleBedBreakdownChange(category.available, Number(e.target.value))}
                            />
                            <button
                              type="button"
                              aria-label={`Increase ${category.title} available`}
                              onClick={() => adjustBedAvailable(category.available, 1)}
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <label className="cr-field">
                          Total
                          <input
                            type="number"
                            min={bedBreakdown[category.available]}
                            value={bedBreakdown[category.total]}
                            onChange={e => handleBedBreakdownChange(category.total, Number(e.target.value))}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="careroute-btn-primary" type="submit" disabled={operationBusy}>
                  Save capacity
                </button>
              </form>
            </section>
          )}
          {activeTab === "doctors" && (
            <section className="cr-panel">
              <div className="cr-section-heading">
                <div>
                  <h2>Staff roster</h2>
                  <p>{doctors.filter(d => d.status === "on_duty").length} on duty in your hospital roster.</p>
                </div>
                <button className="careroute-btn-secondary" onClick={() => setShowAddDoctorModal(true)}>
                  Add doctor
                </button>
              </div>
              {doctorUpdatedMsg && (
                <div className="cr-message" role="status">
                  {doctorUpdatedMsg} Check the connection status for server confirmation.
                </div>
              )}
              <div className="cr-doctor-list">
                {doctors.length === 0 ? (
                  <div className="cr-empty">
                    <p>No doctors have been added to this roster.</p>
                  </div>
                ) : (
                  doctors.map(doctor => (
                    <article className="cr-doctor-card" key={doctor.id}>
                      <div>
                        <h3>{doctor.name}</h3>
                        <p>{doctor.specialty}</p>
                        <p>
                          {doctor.shift}
                          {doctor.contact ? " / " + doctor.contact : ""}
                        </p>
                      </div>
                      <label className="cr-field">
                        Duty status
                        <select
                          value={doctor.status}
                          disabled={operationBusy}
                          onChange={e => {
                            const value = e.target.value as DoctorStatus;
                            confirmAction(
                              "Update duty status?",
                              "Confirm the new duty status for " + doctor.name + ".",
                              () => handleDoctorStatusChange(doctor.id, value)
                            );
                          }}
                        >
                          {Object.entries(dutyLabels).map(([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="cr-text-button cr-danger"
                        disabled={operationBusy}
                        onClick={() =>
                          confirmAction(
                            "Remove doctor from roster?",
                            doctor.name + " will be removed from this hospital's duty roster.",
                            () => handleRemoveDoctor(doctor.id)
                          )
                        }
                      >
                        Remove
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}
          {activeTab === "fleet" && (
            <div className="cr-tracking-grid">
              <section className="cr-panel">
                <h2>Facility details</h2>
                <dl className="cr-detail-grid">
                  <div>
                    <dt>Hospital</dt>
                    <dd>{hospital.name}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>
                      {hospital.address}, {hospital.city}
                    </dd>
                  </div>
                  <div>
                    <dt>Emergency contact</dt>
                    <dd>{hospital.emergencyContact || hospital.phone || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>Capabilities</dt>
                    <dd>{hospital.capabilities?.join(", ") || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>Trauma level</dt>
                    <dd>{hospital.traumaLevel || "Not reported"}</dd>
                  </div>
                </dl>
                <button
                  className="careroute-btn-secondary"
                  onClick={() => (sirenActive ? stopSirenAlert() : startSirenAlert())}
                >
                  {sirenActive ? "Stop sound test" : "Test alert sound"}
                </button>
              </section>
              <section className="cr-panel">
                <h2>Assigned transport</h2>
                <p>Ambulance assignments recorded on your hospital's requests.</p>
                <div className="cr-request-list">
                  {requests
                    .filter(r => r.ambulanceAssigned && isActiveRequest(r.status))
                    .map(request => (
                      <div className="cr-bed-card" key={request.id}>
                        <strong>{request.ambulanceAssigned}</strong>
                        <p>
                          {request.trackingCode} / {request.emergencyType}
                        </p>
                        <StatusBadge status={request.status} />
                      </div>
                    ))}
                  {!requests.some(r => r.ambulanceAssigned && isActiveRequest(r.status)) && (
                    <div className="cr-empty">
                      <p>No active ambulance assignments recorded.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
      {acceptingRequestId && (
        <CareDialog title="Accept emergency request" busy={operationBusy} onClose={() => setAcceptingRequestId(null)}>
          <p>
            Review your response before accepting request{" "}
            <strong>{requests.find(r => r.id === acceptingRequestId)?.trackingCode}</strong>.
          </p>
          <label className="cr-field">
            Estimated arrival / preparation time (minutes)
            <input
              type="number"
              min="1"
              max="120"
              value={acceptEta}
              onChange={e => setAcceptEta(Number(e.target.value))}
            />
          </label>
          <label className="cr-field">
            Hospital response
            <textarea
              value={acceptNote}
              onChange={e => setAcceptNote(e.target.value)}
              placeholder="Add information the patient needs"
            />
          </label>
          <div className="cr-actions">
            <button
              className="careroute-btn-secondary"
              disabled={operationBusy}
              onClick={() => setAcceptingRequestId(null)}
            >
              Go back
            </button>
            <button
              className="careroute-btn-primary"
              disabled={operationBusy || acceptEta < 1 || acceptEta > 120}
              onClick={() => runOperation(() => handleConfirmAccept(acceptingRequestId))}
            >
              {operationBusy ? "Saving..." : "Confirm acceptance"}
            </button>
          </div>
        </CareDialog>
      )}
      {rejectTarget && (
        <CareDialog title="Divert this request?" busy={operationBusy} onClose={() => setRejectTarget(null)}>
          <p>The patient will see that your hospital cannot accept this request.</p>
          <label className="cr-field">
            Reason for diversion
            <textarea
              value={diversionReason}
              onChange={e => setDiversionReason(e.target.value)}
              placeholder="Explain why the request is being diverted"
            />
          </label>
          <div className="cr-actions">
            <button className="careroute-btn-secondary" disabled={operationBusy} onClick={() => setRejectTarget(null)}>
              Go back
            </button>
            <button
              className="cr-button-danger"
              disabled={operationBusy}
              onClick={() =>
                runOperation(async () => {
                  await handleReject(rejectTarget, diversionReason);
                  setRejectTarget(null);
                })
              }
            >
              {operationBusy ? "Saving..." : "Confirm diversion"}
            </button>
          </div>
        </CareDialog>
      )}
      {confirmation && (
        <CareDialog title={confirmation.title} busy={operationBusy} onClose={() => setConfirmation(null)}>
          <p>{confirmation.description}</p>
          <div className="cr-actions">
            <button className="careroute-btn-secondary" disabled={operationBusy} onClick={() => setConfirmation(null)}>
              Go back
            </button>
            <button
              className="careroute-btn-primary"
              disabled={operationBusy}
              onClick={() =>
                runOperation(async () => {
                  await confirmation.action();
                  setConfirmation(null);
                })
              }
            >
              {operationBusy ? "Saving..." : "Confirm"}
            </button>
          </div>
        </CareDialog>
      )}
      {showAddDoctorModal && (
        <CareDialog title="Add doctor to roster" busy={operationBusy} onClose={() => setShowAddDoctorModal(false)}>
          <form className="cr-form" onSubmit={e => runOperation(() => handleAddDoctor(e))}>
            <label className="cr-field">
              Doctor name
              <input value={newDoctorName} onChange={e => setNewDoctorName(e.target.value)} required />
            </label>
            <label className="cr-field">
              Specialty
              <select value={newDoctorSpecialty} onChange={e => setNewDoctorSpecialty(e.target.value)}>
                {specialties.map(specialty => (
                  <option key={specialty}>{specialty}</option>
                ))}
              </select>
            </label>
            <label className="cr-field">
              Shift
              <input value={newDoctorShift} onChange={e => setNewDoctorShift(e.target.value)} required />
            </label>
            <label className="cr-field">
              Duty status
              <select value={newDoctorStatus} onChange={e => setNewDoctorStatus(e.target.value as DoctorStatus)}>
                {Object.entries(dutyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cr-field">
              Contact / extension
              <input value={newDoctorContact} onChange={e => setNewDoctorContact(e.target.value)} />
            </label>
            <button className="careroute-btn-primary" disabled={operationBusy} type="submit">
              {operationBusy ? "Saving..." : "Add doctor"}
            </button>
          </form>
        </CareDialog>
      )}
    </CareRouteLayout>
  );
};
export default CareRouteHospitalDashboard;
