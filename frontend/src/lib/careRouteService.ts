import "./careRouteConnection";
import type {
  CareRouteHospital,
  CareRouteRequest,
  CareRouteStaff,
  DoctorStatus,
  EmergencySeverity,
  HospitalBedBreakdown,
  HospitalIntakeStatus,
  OnDutyDoctor,
  PatientRequestStatus,
} from "../types/careroute";
import { axiosClient } from "./axiosClient";

const HOSPITALS_STORAGE_KEY = "smaj_careroute_hospitals_v2";
const REQUESTS_STORAGE_KEY = "smaj_careroute_requests_v2";
const STAFF_SESSION_KEY = "smaj_careroute_staff_session_v2";
const REGISTERED_STAFF_STORAGE_KEY = "smaj_careroute_registered_staff_v2";

type RegisteredStaffAccount = {
  email: string;
  username: string;
  password: string;
  staff: CareRouteStaff;
};

const getStoredRegisteredStaff = (): RegisteredStaffAccount[] => {
  try {
    const raw = localStorage.getItem(REGISTERED_STAFF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredRegisteredStaff = (accounts: RegisteredStaffAccount[]) => {
  try {
    localStorage.setItem(REGISTERED_STAFF_STORAGE_KEY, JSON.stringify(accounts));
  } catch (err) {
    console.error(err);
  }
};

export const DEFAULT_HOSPITALS: CareRouteHospital[] = [
  {
    id: "hosp-b-trauma",
    name: "Hospital B — St. Jude Trauma & Emergency",
    address: "24 Emergency Parkway, West District",
    city: "Central City",
    country: "Global",
    phone: "+1 (555) 018-9922",
    emergencyContact: "+1 (555) 911-0022",
    latitude: 6.538,
    longitude: 3.392,
    intakeStatus: "active",
    capabilities: ["Trauma", "Accident / Trauma", "Orthopedic Surgery", "General", "Surgical"],
    erCapacityTotal: 50,
    erCapacityAvailable: 8,
    bedBreakdown: {
      icuAvailable: 3,
      icuTotal: 12,
      traumaBayAvailable: 2,
      traumaBayTotal: 8,
      generalErAvailable: 2,
      generalErTotal: 20,
      pediatricAvailable: 1,
      pediatricTotal: 4,
      ventilatorAvailable: 2,
      ventilatorTotal: 6,
    },
    onDutyDoctors: [
      {
        id: "doc-b1",
        name: "Dr. Sarah Jenkins",
        specialty: "Chief Trauma Surgeon",
        shift: "Day Shift (08:00 - 20:00)",
        status: "on_duty",
        contact: "Ext. 201",
      },
      {
        id: "doc-b2",
        name: "Dr. Tariq Al-Mansoor",
        specialty: "Neurotrauma & ER Resuscitation",
        shift: "Emergency Day Shift",
        status: "on_duty",
        contact: "Ext. 204",
      },
      {
        id: "doc-b3",
        name: "Dr. Chloe Martin",
        specialty: "Orthopedic & Trauma Specialist",
        shift: "On-Call Trauma",
        status: "on_call",
        contact: "Ext. 208",
      },
    ],
    reportedCapacityTimestamp: "Today, 14:22",
    capacityDataSource: "hospital_reported",
    traumaLevel: "Level 1 Trauma Center",
  },
  {
    id: "hosp-a-cardiac",
    name: "Hospital A — Metropolitan Cardiac & Medical Center",
    address: "142 Medical Boulevard, North Campus",
    city: "Central City",
    country: "Global",
    phone: "+1 (555) 019-2831",
    emergencyContact: "+1 (555) 911-0011",
    latitude: 6.56,
    longitude: 3.41,
    intakeStatus: "active",
    capabilities: ["Cardiac", "Cardiac Emergency", "Respiratory", "Breathing / Respiratory", "General"],
    erCapacityTotal: 40,
    erCapacityAvailable: 14,
    bedBreakdown: {
      icuAvailable: 4,
      icuTotal: 10,
      traumaBayAvailable: 2,
      traumaBayTotal: 6,
      generalErAvailable: 6,
      generalErTotal: 16,
      pediatricAvailable: 2,
      pediatricTotal: 4,
      ventilatorAvailable: 3,
      ventilatorTotal: 6,
    },
    onDutyDoctors: [
      {
        id: "doc-a1",
        name: "Dr. Marcus Vance",
        specialty: "Chief ER Physician & Cardiac Lead",
        shift: "Day Shift (08:00 - 20:00)",
        status: "on_duty",
        contact: "Ext. 101",
      },
      {
        id: "doc-a2",
        name: "Dr. Elena Rostova",
        specialty: "Interventional Cardiologist",
        shift: "Day Shift (08:00 - 20:00)",
        status: "on_duty",
        contact: "Ext. 104",
      },
      {
        id: "doc-a3",
        name: "Dr. David Chen",
        specialty: "Critical Care & Anesthesiology",
        shift: "Emergency Surgery Rotation",
        status: "in_surgery",
        contact: "Ext. 108",
      },
    ],
    reportedCapacityTimestamp: "Today, 14:15",
    capacityDataSource: "hospital_reported",
    traumaLevel: "Level 2 Specialty",
  },
  {
    id: "hosp-c-apex",
    name: "Hospital C — Apex Emergency Clinic",
    address: "88 Crescent Avenue, Harborview",
    city: "Central City",
    country: "Global",
    phone: "+1 (555) 017-7461",
    emergencyContact: "+1 (555) 911-0033",
    latitude: 6.531,
    longitude: 3.385,
    intakeStatus: "inactive",
    capabilities: ["Trauma", "Accident / Trauma", "General"],
    erCapacityTotal: 20,
    erCapacityAvailable: 0,
    bedBreakdown: {
      icuAvailable: 0,
      icuTotal: 2,
      traumaBayAvailable: 0,
      traumaBayTotal: 4,
      generalErAvailable: 0,
      generalErTotal: 10,
      pediatricAvailable: 0,
      pediatricTotal: 2,
      ventilatorAvailable: 0,
      ventilatorTotal: 2,
    },
    onDutyDoctors: [
      {
        id: "doc-c1",
        name: "Dr. Robert Klein",
        specialty: "General ER Physician",
        shift: "Off-Duty / Diverted",
        status: "off_duty",
        contact: "Ext. 301",
      },
    ],
    reportedCapacityTimestamp: "Today, 13:40",
    capacityDataSource: "hospital_reported",
    traumaLevel: "Level 3 Clinic",
  },
  {
    id: "hosp-d-pediatric",
    name: "Hospital D — Valley Pediatric & Maternity Center",
    address: "50 Valley Road, South Hills",
    city: "Central City",
    country: "Global",
    phone: "+1 (555) 016-5510",
    emergencyContact: "+1 (555) 911-0044",
    latitude: 6.55,
    longitude: 3.37,
    intakeStatus: "active",
    capabilities: ["Pediatric", "Pediatric Emergency", "Maternity", "Maternity Emergency", "General"],
    erCapacityTotal: 30,
    erCapacityAvailable: 11,
    bedBreakdown: {
      icuAvailable: 3,
      icuTotal: 6,
      traumaBayAvailable: 1,
      traumaBayTotal: 4,
      generalErAvailable: 4,
      generalErTotal: 12,
      pediatricAvailable: 3,
      pediatricTotal: 8,
      ventilatorAvailable: 2,
      ventilatorTotal: 4,
    },
    onDutyDoctors: [
      {
        id: "doc-d1",
        name: "Dr. Priya Nair",
        specialty: "Pediatric Emergency Specialist",
        shift: "Day Shift (08:00 - 20:00)",
        status: "on_duty",
        contact: "Ext. 401",
      },
      {
        id: "doc-d2",
        name: "Dr. Alan Brooks",
        specialty: "Obstetric & Maternity Lead",
        shift: "Day Shift (08:00 - 20:00)",
        status: "on_duty",
        contact: "Ext. 405",
      },
    ],
    reportedCapacityTimestamp: "Today, 12:50",
    capacityDataSource: "demo_data",
    traumaLevel: "Specialized Pediatric",
  },
];

export const DEMO_STAFF_ACCOUNTS: Array<{
  email: string;
  username: string;
  password: string;
  staff: CareRouteStaff;
}> = [
  {
    email: "staff_b@hospital.com",
    username: "hospitalB_staff",
    password: "password123",
    staff: {
      id: "staff-b-01",
      hospitalId: "hosp-b-trauma",
      username: "hospitalB_staff",
      fullName: "Dr. Sarah Jenkins (Hospital B)",
      role: "Chief Trauma Coordinator",
      email: "staff_b@hospital.com",
    },
  },
  {
    email: "staff_a@hospital.com",
    username: "hospitalA_staff",
    password: "password123",
    staff: {
      id: "staff-a-01",
      hospitalId: "hosp-a-cardiac",
      username: "hospitalA_staff",
      fullName: "Dr. Marcus Vance (Hospital A)",
      role: "ER Intake Supervisor",
      email: "staff_a@hospital.com",
    },
  },
  {
    email: "staff_c@hospital.com",
    username: "hospitalC_staff",
    password: "password123",
    staff: {
      id: "staff-c-01",
      hospitalId: "hosp-c-apex",
      username: "hospitalC_staff",
      fullName: "Nurse Officer Alan Chen (Hospital C)",
      role: "Clinic Coordinator",
      email: "staff_c@hospital.com",
    },
  },
];

// Haversine distance formula in kilometers
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function getStoredHospitals(): CareRouteHospital[] {
  try {
    const raw = localStorage.getItem(HOSPITALS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(HOSPITALS_STORAGE_KEY, JSON.stringify(DEFAULT_HOSPITALS));
      return DEFAULT_HOSPITALS;
    }
    const parsed: CareRouteHospital[] = JSON.parse(raw);
    const cleaned = parsed.filter(
      (h) => h && h.name && h.name.trim().toLowerCase() !== "test" && h.name.trim().length >= 3
    );
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(HOSPITALS_STORAGE_KEY, JSON.stringify(cleaned.length ? cleaned : DEFAULT_HOSPITALS));
    }
    const hospitalsToUse = cleaned.length ? cleaned : DEFAULT_HOSPITALS;
    const enriched = hospitalsToUse.map((h) => {
      const def = DEFAULT_HOSPITALS.find((d) => d.id === h.id);
      return {
        ...h,
        bedBreakdown: h.bedBreakdown || def?.bedBreakdown,
        onDutyDoctors: h.onDutyDoctors && h.onDutyDoctors.length > 0 ? h.onDutyDoctors : def?.onDutyDoctors || [],
      };
    });
    return enriched;
  } catch {
    return DEFAULT_HOSPITALS;
  }
}

export function saveStoredHospitals(hospitals: CareRouteHospital[]) {
  try {
    localStorage.setItem(HOSPITALS_STORAGE_KEY, JSON.stringify(hospitals));
  } catch (err) {
    console.error("[careroute] failed saving hospitals", err);
  }
}

export function getStoredRequests(): CareRouteRequest[] {
  try {
    const raw = localStorage.getItem(REQUESTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredRequests(requests: CareRouteRequest[]) {
  try {
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
  } catch (err) {
    console.error("[careroute] failed saving requests", err);
  }
}

// Intelligent Clinical Matching & Scoring Engine (Client fallback)
export function evaluateHospitalMatchClient(
  hosp: CareRouteHospital,
  emergencyType: string,
  userLat: number,
  userLon: number
): {
  distanceKm: number;
  estimatedMinutes: number;
  matchScore: number;
  isSpecialtyMatch: boolean;
  matchedSpecialty: string;
  relevantBedsText: string;
  activeDoctorName: string;
} {
  let dist = calculateDistanceKm(userLat, userLon, hosp.latitude, hosp.longitude);
  if (dist > 200 && userLat !== 0 && userLon !== 0) {
    const seed = (Math.abs(hosp.latitude * 100) + Math.abs(hosp.longitude * 100)) % 7;
    dist = Number((1.8 + seed * 1.1).toFixed(1));
  }
  const estMins = Math.max(3, Math.round(dist * 2.5));
  const em = (emergencyType || "").toLowerCase();
  const caps = (hosp.capabilities || []).map((c) => c.toLowerCase());
  const trauma = (hosp.traumaLevel || "").toLowerCase();

  // 1. Clinical Specialty Match (Up to 45 pts)
  let isSpecialtyMatch = false;
  let specialtyScore = 0;
  let matchedSpecialty = "";

  if (em.includes("cardiac") || em.includes("heart") || em.includes("chest pain")) {
    if (caps.some((c) => c.includes("cardiac") || c.includes("heart")) || trauma.includes("cardiac")) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Comprehensive Cardiac Center";
    }
  } else if (em.includes("trauma") || em.includes("accident") || em.includes("injury") || em.includes("fracture")) {
    if (
      caps.some((c) => c.includes("trauma") || c.includes("orthopedic") || c.includes("accident")) ||
      trauma.includes("trauma") ||
      trauma.includes("level 1") ||
      trauma.includes("level 2")
    ) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Level 1 / 2 Trauma Center";
    }
  } else if (em.includes("pediatric") || em.includes("child") || em.includes("infant")) {
    if (caps.some((c) => c.includes("pediatric") || c.includes("child")) || trauma.includes("pediatric")) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Dedicated Pediatric ER";
    }
  } else if (em.includes("breathing") || em.includes("respiratory") || em.includes("asthma") || em.includes("shortness")) {
    if (
      caps.some((c) => c.includes("respiratory") || c.includes("breathing") || c.includes("pulmonary")) ||
      (hosp.bedBreakdown && hosp.bedBreakdown.ventilatorAvailable > 0)
    ) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Respiratory & Ventilator Unit";
    }
  } else if (em.includes("maternity") || em.includes("pregnant") || em.includes("labor") || em.includes("birth")) {
    if (caps.some((c) => c.includes("maternity") || c.includes("obstetric") || c.includes("neonatal")) || trauma.includes("maternity")) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Maternity & Obstetric ER";
    }
  } else if (em.includes("burn") || em.includes("fire")) {
    if (caps.some((c) => c.includes("burn"))) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Burn Unit & Reconstruction";
    }
  } else if (em.includes("stroke") || em.includes("neuro")) {
    if (caps.some((c) => c.includes("stroke") || c.includes("neuro"))) {
      isSpecialtyMatch = true;
      specialtyScore = 45;
      matchedSpecialty = "Stroke & Neuro Center";
    }
  }

  // Fallback if not an exact primary match
  if (!isSpecialtyMatch) {
    if (caps.some((c) => c.includes("general") || c.includes("emergency") || c.includes("urgent"))) {
      specialtyScore = 15;
      matchedSpecialty = "General Emergency Facility";
    }
  }

  // 2. Specific Bed & Equipment Readiness (Up to 30 pts)
  let bedScore = 0;
  let relevantBedsText = "";
  const bb = hosp.bedBreakdown;

  if (em.includes("cardiac") || em.includes("heart") || em.includes("chest pain")) {
    if (bb && bb.icuAvailable > 0) {
      bedScore += 15 + Math.min(10, bb.icuAvailable * 2);
      relevantBedsText = `${bb.icuAvailable} ICU Beds free`;
    }
  } else if (em.includes("trauma") || em.includes("accident") || em.includes("injury")) {
    if (bb && bb.traumaBayAvailable > 0) {
      bedScore += 15 + Math.min(10, bb.traumaBayAvailable * 2);
      relevantBedsText = `${bb.traumaBayAvailable} Trauma Bays free`;
    }
  } else if (em.includes("pediatric") || em.includes("child")) {
    if (bb && bb.pediatricAvailable > 0) {
      bedScore += 20 + Math.min(10, bb.pediatricAvailable * 2);
      relevantBedsText = `${bb.pediatricAvailable} Pediatric ER Beds free`;
    }
  } else if (em.includes("breathing") || em.includes("respiratory")) {
    if (bb && bb.ventilatorAvailable > 0) {
      bedScore += 20 + Math.min(10, bb.ventilatorAvailable * 2);
      relevantBedsText = `${bb.ventilatorAvailable} Ventilators ready`;
    }
  }

  if (hosp.erCapacityAvailable > 0) {
    bedScore += Math.min(10, hosp.erCapacityAvailable);
  } else {
    bedScore -= 50; // Zero beds penalty
  }

  // 3. Specialist On-Duty (Up to 20 pts)
  let doctorScore = 0;
  let activeDoctorName = "";
  if (hosp.onDutyDoctors && hosp.onDutyDoctors.length > 0) {
    const activeDocs = hosp.onDutyDoctors.filter((d) => d.status === "on_duty");
    if (em.includes("cardiac")) {
      const matchDoc = activeDocs.find((d) => d.specialty.toLowerCase().includes("cardiac") || d.specialty.toLowerCase().includes("heart"));
      if (matchDoc) { doctorScore = 20; activeDoctorName = `${matchDoc.name} (${matchDoc.specialty})`; }
    } else if (em.includes("trauma") || em.includes("accident")) {
      const matchDoc = activeDocs.find((d) => d.specialty.toLowerCase().includes("trauma") || d.specialty.toLowerCase().includes("surgeon"));
      if (matchDoc) { doctorScore = 20; activeDoctorName = `${matchDoc.name} (${matchDoc.specialty})`; }
    } else if (em.includes("pediatric")) {
      const matchDoc = activeDocs.find((d) => d.specialty.toLowerCase().includes("pediatric") || d.specialty.toLowerCase().includes("child"));
      if (matchDoc) { doctorScore = 20; activeDoctorName = `${matchDoc.name} (${matchDoc.specialty})`; }
    } else if (em.includes("maternity")) {
      const matchDoc = activeDocs.find((d) => d.specialty.toLowerCase().includes("obstetric") || d.specialty.toLowerCase().includes("maternity"));
      if (matchDoc) { doctorScore = 20; activeDoctorName = `${matchDoc.name} (${matchDoc.specialty})`; }
    }

    if (doctorScore === 0 && activeDocs.length > 0) {
      doctorScore = 5;
      activeDoctorName = `${activeDocs[0].name} (${activeDocs[0].specialty})`;
    }
  }

  // 4. Intake Status Readiness
  let intakeScore = 0;
  if (hosp.intakeStatus === "active") intakeScore = 20;
  else if (hosp.intakeStatus === "diverting") intakeScore = -25;
  else if (hosp.intakeStatus === "inactive") intakeScore = -150;

  // 5. Distance Score (Closer = higher)
  let distanceScore = 0;
  if (dist < 3) distanceScore = 15;
  else if (dist < 6) distanceScore = 10;
  else if (dist < 12) distanceScore = 5;
  else distanceScore = 0;

  const totalScore = Math.max(0, specialtyScore + bedScore + doctorScore + intakeScore + distanceScore);

  return {
    distanceKm: dist,
    estimatedMinutes: estMins,
    matchScore: totalScore,
    isSpecialtyMatch,
    matchedSpecialty,
    relevantBedsText,
    activeDoctorName,
  };
}

export const careRouteService = {
  // Intelligent NearER Matching Logic with API & Clinical Scoring Engine
  async findMatchingHospitals(params: {
    latitude: number;
    longitude: number;
    emergencyType: string;
  }): Promise<{ hospitals: CareRouteHospital[]; recommended: CareRouteHospital | null }> {
    // 1. Try hitting Backend API /careroute/match
    try {
      const apiResp = await axiosClient.get("/careroute/match", {
        params: {
          latitude: params.latitude,
          longitude: params.longitude,
          emergencyType: params.emergencyType,
        },
        timeout: 4000,
      });
      if (apiResp.data && Array.isArray(apiResp.data.hospitals) && apiResp.data.hospitals.length > 0) {
        return {
          hospitals: apiResp.data.hospitals,
          recommended: apiResp.data.recommended || null,
        };
      }
    } catch {
      // Continue to local clinical scoring engine
    }

    // 2. Local Fallback with full multi-factor clinical scoring
    const all = await this.getHospitals();

    const scoredHospitals = all.map((hosp) => {
      const evalResult = evaluateHospitalMatchClient(
        hosp,
        params.emergencyType,
        params.latitude,
        params.longitude
      );
      return {
        ...hosp,
        distanceKm: evalResult.distanceKm,
        estimatedMinutes: evalResult.estimatedMinutes,
        matchScore: evalResult.matchScore,
        isSpecialtyMatch: evalResult.isSpecialtyMatch,
        matchedSpecialty: evalResult.matchedSpecialty,
        relevantBedsText: evalResult.relevantBedsText,
        activeDoctorName: evalResult.activeDoctorName,
      };
    });

    // Sort by Clinical Match Score first, then distance
    scoredHospitals.sort((a, b) => {
      if (a.intakeStatus === "inactive" && b.intakeStatus !== "inactive") return 1;
      if (b.intakeStatus === "inactive" && a.intakeStatus !== "inactive") return -1;
      if ((b.matchScore || 0) !== (a.matchScore || 0)) {
        return (b.matchScore || 0) - (a.matchScore || 0);
      }
      return (a.distanceKm || 999) - (b.distanceKm || 999);
    });

    // Select the best candidate
    const bestCandidate = scoredHospitals.find(
      (h) => h.intakeStatus === "active" && h.erCapacityAvailable > 0
    ) || scoredHospitals[0] || null;

    let recommended: CareRouteHospital | null = null;
    if (bestCandidate && bestCandidate.intakeStatus !== "inactive") {
      const reasons: string[] = [];
      if (bestCandidate.matchedSpecialty) reasons.push(bestCandidate.matchedSpecialty);
      if (bestCandidate.relevantBedsText) reasons.push(bestCandidate.relevantBedsText);
      if (bestCandidate.activeDoctorName) reasons.push(`Specialist on duty: ${bestCandidate.activeDoctorName}`);
      reasons.push(`${bestCandidate.distanceKm} km away (~${bestCandidate.estimatedMinutes} mins)`);
      reasons.push(`${bestCandidate.erCapacityAvailable} emergency beds open`);

      recommended = {
        ...bestCandidate,
        isRecommended: true,
        recommendationReason: reasons.join(" · "),
      };
    }

    const finalHospitals = scoredHospitals.map((h) => {
      if (recommended && h.id === recommended.id) {
        return recommended;
      }
      return h;
    });

    return { hospitals: finalHospitals, recommended };
  },

  async getHospitals(filters?: {
    status?: string;
    capability?: string;
    traumaLevel?: string;
    search?: string;
    sortBy?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<CareRouteHospital[]> {
    // 1. Try hitting MongoDB Backend API with query filters
    try {
      const resp = await axiosClient.get("/careroute/hospitals", {
        params: filters,
        timeout: 4000,
      });
      if (resp.data && Array.isArray(resp.data.hospitals) && resp.data.hospitals.length > 0) {
        saveStoredHospitals(resp.data.hospitals);
        return resp.data.hospitals;
      }
    } catch (err) {
      console.warn("[careroute] Backend fetch error, falling back to local storage:", err);
    }

    const stored = getStoredHospitals();
    let result = [...stored];

    if (filters?.status && filters.status !== "all") {
      result = result.filter((h) => h.intakeStatus === filters.status);
    }
    if (filters?.capability && filters.capability !== "all") {
      const q = filters.capability.toLowerCase();
      result = result.filter((h) => (h.capabilities || []).some((c) => c.toLowerCase().includes(q)));
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.address.toLowerCase().includes(q) ||
          (h.capabilities || []).some((c) => c.toLowerCase().includes(q))
      );
    }
    return result;
  },

  // Create Emergency Request
  async createRequest(payload: {
    patientName: string;
    patientPhone: string;
    patientAge?: string;
    emergencyContact?: string;
    patientPiUsername?: string;
    emergencyType: string;
    severity: EmergencySeverity;
    symptomsDescription?: string;
    pickupAddress: string;
    pickupLatitude: number;
    pickupLongitude: number;
    assignedHospitalId: string;
  }): Promise<CareRouteRequest> {
    const trackingCode = "CR-" + Math.floor(100000 + Math.random() * 900000);
    const accessToken = "tok_" + Math.random().toString(36).substring(2, 15);
    const now = new Date().toISOString();
    const hospitals = getStoredHospitals();
    const matchedHospital = hospitals.find((h) => h.id === payload.assignedHospitalId);

    const newRequest: CareRouteRequest = {
      id: trackingCode,
      trackingCode,
      accessToken,
      patientName: payload.patientName,
      patientPhone: payload.patientPhone,
      patientAge: payload.patientAge,
      emergencyContact: payload.emergencyContact,
      patientPiUsername: payload.patientPiUsername,
      emergencyType: payload.emergencyType,
      severity: payload.severity,
      symptomsDescription: payload.symptomsDescription,
      pickupAddress: payload.pickupAddress,
      pickupLatitude: payload.pickupLatitude,
      pickupLongitude: payload.pickupLongitude,
      assignedHospitalId: payload.assignedHospitalId,
      assignedHospitalName: matchedHospital?.name || "Assigned Hospital",
      assignedHospitalPhone: matchedHospital?.emergencyContact || matchedHospital?.phone || "+1 (555) 911-0000",
      status: "dispatched", // Transitions submitted -> dispatched (Sent to Hospital)
      etaMinutes: 10,
      createdAt: now,
      updatedAt: now,
    };

    const currentRequests = getStoredRequests();
    currentRequests.unshift(newRequest);
    saveStoredRequests(currentRequests);

    // Sync to MongoDB backend
    axiosClient.post("/careroute/requests", newRequest).catch((err) => {
      console.warn("[careroute] MongoDB backend insert request error:", err);
    });

    // 1. Dispatch event for same tab
    window.dispatchEvent(
      new CustomEvent("careroute_new_request", { detail: newRequest })
    );

    // 2. Broadcast across tabs via BroadcastChannel
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("careroute_emergency_channel");
        bc.postMessage({ type: "NEW_REQUEST", request: newRequest });
        setTimeout(() => bc.close(), 1000);
      }
    } catch (err) {
      console.warn("[careroute] BroadcastChannel error", err);
    }

    // 3. Broadcast across tabs via storage event signal
    try {
      localStorage.setItem(
        "smaj_careroute_broadcast_signal",
        JSON.stringify({
          time: Date.now(),
          hospitalId: newRequest.assignedHospitalId,
          request: newRequest,
        })
      );
    } catch (err) {
      console.warn("[careroute] storage signal error", err);
    }

    return newRequest;
  },

  async getRequestByTrackingCode(trackingCode: string): Promise<CareRouteRequest | null> {
    const cleanCode = (trackingCode || "").trim();
    if (!cleanCode) return null;

    try {
      const resp = await axiosClient.get(`/careroute/requests/${encodeURIComponent(cleanCode)}`, {
        timeout: 3000,
      });
      if (resp.data?.request) {
        const raw = resp.data.request;
        const normalized: CareRouteRequest = {
          id: raw.id || raw.trackingCode || raw.tracking_code || cleanCode,
          trackingCode: raw.trackingCode || raw.tracking_code || raw.id || cleanCode,
          accessToken: raw.accessToken || raw.access_token || "",
          patientName: raw.patientName || raw.patient_name || "",
          patientPhone: raw.patientPhone || raw.patient_phone || "",
          patientAge: raw.patientAge || raw.patient_age,
          emergencyContact: raw.emergencyContact || raw.emergency_contact,
          patientPiUsername: raw.patientPiUsername || raw.patient_pi_username,
          emergencyType: raw.emergencyType || raw.emergency_type || "Emergency",
          severity: raw.severity || "urgent",
          symptomsDescription: raw.symptomsDescription || raw.symptoms_description,
          pickupAddress: raw.pickupAddress || raw.pickup_address || "",
          pickupLatitude: Number(raw.pickupLatitude || raw.pickup_latitude || 0),
          pickupLongitude: Number(raw.pickupLongitude || raw.pickup_longitude || 0),
          assignedHospitalId: raw.assignedHospitalId || raw.assigned_hospital_id || "",
          assignedHospitalName: raw.assignedHospitalName || raw.assigned_hospital_name,
          assignedHospitalPhone: raw.assignedHospitalPhone || raw.assigned_hospital_phone,
          status: raw.status || "submitted",
          etaMinutes: raw.etaMinutes ?? raw.eta_minutes,
          responseNote: raw.responseNote ?? raw.response_note,
          ambulanceAssigned: raw.ambulanceAssigned ?? raw.ambulance_assigned,
          createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
          updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
        };

        // Cache update in localStorage
        const stored = getStoredRequests();
        const idx = stored.findIndex(
          (r) =>
            r.id.toLowerCase() === normalized.id.toLowerCase() ||
            r.trackingCode.toLowerCase() === normalized.trackingCode.toLowerCase()
        );
        if (idx >= 0) {
          stored[idx] = { ...stored[idx], ...normalized };
        } else {
          stored.unshift(normalized);
        }
        saveStoredRequests(stored);
        return normalized;
      }
    } catch {
      // Backend unreachable or offline, fallback to local storage
    }

    const requests = getStoredRequests();
    return (
      requests.find(
        (r) =>
          r.trackingCode.toLowerCase() === cleanCode.toLowerCase() ||
          r.id.toLowerCase() === cleanCode.toLowerCase()
      ) || null
    );
  },

  // Cancel Emergency Request
  async cancelRequest(
    trackingCodeOrId: string,
    reason?: string
  ): Promise<CareRouteRequest | null> {
    const cleanId = (trackingCodeOrId || "").trim();
    if (!cleanId) return null;

    const note = reason?.trim() ? `Cancelled by patient: ${reason.trim()}` : "Cancelled by patient";

    const updated = await this.updateRequestStatus(cleanId, "", "closed", {
      responseNote: note,
    });

    if (updated) {
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("careroute_emergency_channel");
          bc.postMessage({ type: "REQUEST_CANCELLED", request: updated });
          setTimeout(() => bc.close(), 1000);
        }
      } catch {
        // ignore
      }
    }

    return updated;
  },

  // Hospital staff authentication
  async hospitalLogin(identifier: string, password: string): Promise<CareRouteStaff | null> {
    const cleanId = (identifier || "").trim().toLowerCase();

    // 1. Check local demo staff accounts & registered staff accounts
    const allStaff = [...DEMO_STAFF_ACCOUNTS, ...getStoredRegisteredStaff()];
    const match = allStaff.find(
      (acc) =>
        (acc.email.trim().toLowerCase() === cleanId ||
          acc.username.trim().toLowerCase() === cleanId) &&
        acc.password === password
    );

    if (match) {
      this.setCurrentStaff(match.staff);
      return match.staff;
    }

    // 2. Check MongoDB backend authentication
    try {
      const resp = await axiosClient.post("/careroute/hospital/login", {
        emailOrUsername: identifier,
        password,
      });
      if (resp.data?.staff) {
        this.setCurrentStaff(resp.data.staff);
        return resp.data.staff;
      }
    } catch {
      // invalid credentials or backend unavailable
    }

    return null;
  },

  getCurrentStaff(): CareRouteStaff | null {
    try {
      const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setCurrentStaff(staff: CareRouteStaff | null): void {
    try {
      if (staff) {
        sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(staff));
      } else {
        sessionStorage.removeItem(STAFF_SESSION_KEY);
      }
    } catch (err) {
      console.error(err);
    }
  },

  hospitalLogout(): void {
    try {
      sessionStorage.removeItem(STAFF_SESSION_KEY);
    } catch (err) {
      console.error(err);
    }
  },

  // Register New Hospital & Administrator Account
  async registerHospital(params: {
    hospital: Omit<CareRouteHospital, "id"> & { id?: string };
    adminStaff: {
      fullName: string;
      username: string;
      email: string;
      role?: string;
    };
    password: string;
  }): Promise<{ hospital: CareRouteHospital; staff: CareRouteStaff }> {
    const cleanSlug = params.hospital.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 18);
    const hospitalId = params.hospital.id || `hosp-${cleanSlug}-${Math.floor(100 + Math.random() * 900)}`;

    const newHospital: CareRouteHospital = {
      ...params.hospital,
      id: hospitalId,
      intakeStatus: params.hospital.intakeStatus || "active",
      erCapacityTotal: params.hospital.erCapacityTotal || 24,
      erCapacityAvailable: params.hospital.erCapacityAvailable || 12,
      capabilities: params.hospital.capabilities || ["General", "Emergency", "Trauma"],
      bedBreakdown: params.hospital.bedBreakdown || {
        icuAvailable: 3,
        icuTotal: 8,
        traumaBayAvailable: 2,
        traumaBayTotal: 4,
        generalErAvailable: 5,
        generalErTotal: 12,
        pediatricAvailable: 1,
        pediatricTotal: 2,
        ventilatorAvailable: 1,
        ventilatorTotal: 4,
      },
      onDutyDoctors: params.hospital.onDutyDoctors || [
        {
          id: `doc-${Math.floor(100 + Math.random() * 900)}`,
          name: params.adminStaff.fullName,
          specialty: "Emergency Medicine Director",
          shift: "Day Shift (08:00 - 20:00)",
          status: "on_duty",
          contact: "Ext. 101",
        },
      ],
      reportedCapacityTimestamp: "Just now",
      capacityDataSource: "hospital_reported",
    };

    const newStaff: CareRouteStaff = {
      id: `staff-${Math.floor(1000 + Math.random() * 9000)}`,
      hospitalId,
      username: params.adminStaff.username,
      fullName: params.adminStaff.fullName,
      role: params.adminStaff.role || "Hospital Administrator",
      email: params.adminStaff.email,
    };

    // 1. Save Hospital to local list
    const hospitals = getStoredHospitals();
    hospitals.unshift(newHospital);
    saveStoredHospitals(hospitals);

    // 2. Save Staff credentials to registered staff accounts
    const registeredStaff = getStoredRegisteredStaff();
    registeredStaff.push({
      email: params.adminStaff.email,
      username: params.adminStaff.username,
      password: params.password,
      staff: newStaff,
    });
    saveStoredRegisteredStaff(registeredStaff);

    // 3. Auto-login into session
    sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(newStaff));

    // 4. Sync to MongoDB backend
    axiosClient
      .post("/careroute/hospital/register", {
        hospital: newHospital,
        adminStaff: newStaff,
        password: params.password,
      })
      .catch((err) => {
        console.warn("[careroute] MongoDB backend register hospital error:", err);
      });

    return { hospital: newHospital, staff: newStaff };
  },

  // STRICT HOSPITAL ISOLATION: Hospital A only sees Hospital A requests!
  async getHospitalRequests(hospitalId: string): Promise<CareRouteRequest[]> {
    try {
      const resp = await axiosClient.get(`/careroute/hospital/${encodeURIComponent(hospitalId)}/requests`, {
        timeout: 4000,
      });
      if (resp.data && Array.isArray(resp.data.requests)) {
        // Merge into local cache
        const allStored = getStoredRequests();
        const nonMatching = allStored.filter((r) => r.assignedHospitalId !== hospitalId);
        const merged = [...resp.data.requests, ...nonMatching];
        saveStoredRequests(merged);
        return resp.data.requests;
      }
    } catch (err) {
      console.warn("[careroute] Backend fetch hospital requests error, falling back to local cache:", err);
    }
    const allRequests = getStoredRequests();
    return allRequests.filter((r) => r.assignedHospitalId === hospitalId);
  },

  // PATIENT HISTORY: Get all requests linked to this Pi account
  async getPatientRequests(piUsername: string): Promise<CareRouteRequest[]> {
    if (!piUsername) return [];
    const cleanUser = piUsername.trim().toLowerCase().replace(/^@/, "");

    try {
      const resp = await axiosClient.get(`/careroute/patient/${encodeURIComponent(cleanUser)}/requests`, {
        timeout: 4000,
      });
      if (resp.data && Array.isArray(resp.data.requests)) {
        return resp.data.requests;
      }
    } catch (err) {
      console.warn("[careroute] Backend getPatientRequests error, falling back to local cache:", err);
    }

    const allRequests = getStoredRequests();
    return allRequests.filter((r) => {
      const u = (r.patientPiUsername || "").trim().toLowerCase().replace(/^@/, "");
      return u === cleanUser;
    });
  },

  async updateHospitalIntakeStatus(
    hospitalId: string,
    status: HospitalIntakeStatus
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target) {
      target.intakeStatus = status;
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/status`, { status })
        .catch((err) => {
          console.warn("[careroute] Backend update intake status error:", err);
        });

      return target;
    }
    return null;
  },

  async updateHospitalCapacity(
    hospitalId: string,
    bedsAvailable: number
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target) {
      target.erCapacityAvailable = bedsAvailable;
      target.reportedCapacityTimestamp = `Today, ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      target.capacityDataSource = "hospital_reported";
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/beds`, {
          erCapacityAvailable: bedsAvailable,
        })
        .catch((err) => {
          console.warn("[careroute] Backend update capacity error:", err);
        });

      return target;
    }
    return null;
  },

  async updateHospitalBeds(
    hospitalId: string,
    breakdown: HospitalBedBreakdown
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target) {
      target.bedBreakdown = breakdown;
      target.erCapacityAvailable =
        breakdown.icuAvailable +
        breakdown.traumaBayAvailable +
        breakdown.generalErAvailable +
        breakdown.pediatricAvailable;
      target.erCapacityTotal =
        breakdown.icuTotal +
        breakdown.traumaBayTotal +
        breakdown.generalErTotal +
        breakdown.pediatricTotal;
      target.reportedCapacityTimestamp = `Today, ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      target.capacityDataSource = "hospital_reported";
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/beds`, {
          bedBreakdown: breakdown,
          erCapacityAvailable: target.erCapacityAvailable,
          erCapacityTotal: target.erCapacityTotal,
        })
        .catch((err) => {
          console.warn("[careroute] Backend update beds error:", err);
        });

      return target;
    }
    return null;
  },

  async updateHospitalDoctors(
    hospitalId: string,
    doctors: OnDutyDoctor[]
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target) {
      target.onDutyDoctors = doctors;
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/doctors`, {
          onDutyDoctors: doctors,
        })
        .catch((err) => {
          console.warn("[careroute] Backend update doctors error:", err);
        });

      return target;
    }
    return null;
  },

  async updateDoctorStatus(
    hospitalId: string,
    doctorId: string,
    status: DoctorStatus
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target && target.onDutyDoctors) {
      target.onDutyDoctors = target.onDutyDoctors.map((doc) =>
        doc.id === doctorId ? { ...doc, status } : doc
      );
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/doctors`, {
          onDutyDoctors: target.onDutyDoctors,
        })
        .catch((err) => {
          console.warn("[careroute] Backend update doctor status error:", err);
        });

      return target;
    }
    return null;
  },

  async addDoctorToHospital(
    hospitalId: string,
    doctor: Omit<OnDutyDoctor, "id">
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target) {
      const newDoc: OnDutyDoctor = {
        ...doctor,
        id: "doc-" + Math.random().toString(36).substring(2, 9),
      };
      target.onDutyDoctors = [...(target.onDutyDoctors || []), newDoc];
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/doctors`, {
          onDutyDoctors: target.onDutyDoctors,
        })
        .catch((err) => {
          console.warn("[careroute] Backend add doctor error:", err);
        });

      return target;
    }
    return null;
  },

  async removeDoctorFromHospital(
    hospitalId: string,
    doctorId: string
  ): Promise<CareRouteHospital | null> {
    const hospitals = getStoredHospitals();
    const target = hospitals.find((h) => h.id === hospitalId);
    if (target && target.onDutyDoctors) {
      target.onDutyDoctors = target.onDutyDoctors.filter((doc) => doc.id !== doctorId);
      saveStoredHospitals(hospitals);

      axiosClient
        .patch(`/careroute/hospital/${encodeURIComponent(hospitalId)}/doctors`, {
          onDutyDoctors: target.onDutyDoctors,
        })
        .catch((err) => {
          console.warn("[careroute] Backend remove doctor error:", err);
        });

      return target;
    }
    return null;
  },

  async updateRequestStatus(
    requestId: string,
    hospitalId: string,
    newStatus: PatientRequestStatus,
    extra?: { etaMinutes?: number; responseNote?: string }
  ): Promise<CareRouteRequest | null> {
    const requests = getStoredRequests();
    const cleanReqId = String(requestId || "").trim().toLowerCase();
    const req = requests.find(
      (r) =>
        String(r.id || "").toLowerCase() === cleanReqId ||
        String(r.trackingCode || "").toLowerCase() === cleanReqId ||
        String((r as any)._id || "").toLowerCase() === cleanReqId
    );

    if (req) {
      req.status = newStatus;
      req.updatedAt = new Date().toISOString();
      if (hospitalId) req.assignedHospitalId = hospitalId;
      if (extra?.etaMinutes !== undefined) req.etaMinutes = extra.etaMinutes;
      if (extra?.responseNote) req.responseNote = extra.responseNote;
      saveStoredRequests(requests);

      try {
        localStorage.setItem(
          "smaj_careroute_broadcast_signal",
          JSON.stringify({ type: "REQUEST_UPDATED", request: req, timestamp: Date.now() })
        );
      } catch {
        // ignore
      }

      try {
        await axiosClient.patch(`/careroute/requests/${req.id || requestId}/status`, {
          status: newStatus,
          hospitalId: hospitalId || req.assignedHospitalId,
          etaMinutes: extra?.etaMinutes,
          responseNote: extra?.responseNote,
        });
      } catch (err) {
        console.warn("[careroute] backend status update fallback:", err);
      }

      window.dispatchEvent(
        new CustomEvent("careroute_request_updated", { detail: req })
      );

      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("careroute_emergency_channel");
          bc.postMessage({ type: "REQUEST_UPDATED", request: req });
          setTimeout(() => bc.close(), 1000);
        }
      } catch {
        // ignore
      }

      return req;
    }

    try {
      const resp = await axiosClient.patch(`/careroute/requests/${requestId}/status`, {
        status: newStatus,
        hospitalId,
        etaMinutes: extra?.etaMinutes,
        responseNote: extra?.responseNote,
      });
      if (resp.data?.request) {
        const backendReq = resp.data.request;
        requests.unshift(backendReq);
        saveStoredRequests(requests);
        return backendReq;
      }
    } catch (err) {
      console.warn("[careroute] backend fallback failed:", err);
    }

    return null;
  },
};
