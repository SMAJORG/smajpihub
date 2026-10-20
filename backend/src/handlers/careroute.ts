import { Router, Request, Response } from "express";

type OnDutyDoctor = {
  id: string;
  name: string;
  specialty: string;
  shift: string;
  status: "on_duty" | "on_call" | "in_surgery" | "off_duty";
  contact?: string;
};

type HospitalBedBreakdown = {
  icuAvailable: number;
  icuTotal: number;
  traumaBayAvailable: number;
  traumaBayTotal: number;
  generalErAvailable: number;
  generalErTotal: number;
  pediatricAvailable: number;
  pediatricTotal: number;
  ventilatorAvailable: number;
  ventilatorTotal: number;
};

type CareRouteHospital = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  emergencyContact?: string;
  latitude: number;
  longitude: number;
  intakeStatus: "active" | "diverting" | "inactive";
  capabilities: string[];
  erCapacityTotal: number;
  erCapacityAvailable: number;
  traumaLevel?: string;
  bedBreakdown?: HospitalBedBreakdown;
  onDutyDoctors?: OnDutyDoctor[];
  reportedCapacityTimestamp?: string;
  capacityDataSource?: "hospital_reported" | "demo_data";
  distanceKm?: number;
  estimatedMinutes?: number;
  isRecommended?: boolean;
  recommendationReason?: string;
  matchScore?: number;
  isSpecialtyMatch?: boolean;
  matchedSpecialty?: string;
};

type CareRouteRequest = {
  id: string;
  patientName: string;
  patientPhone: string;
  patientPiUsername?: string;
  emergencyType: string;
  severity: "critical" | "urgent" | "moderate" | "low";
  symptomsDescription?: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  assignedHospitalId: string;
  assignedHospitalName?: string;
  status: "submitted" | "dispatched" | "accepted" | "rejected" | "completed" | "closed";
  ambulanceAssigned?: string;
  etaMinutes?: number;
  createdAt: string;
  updatedAt: string;
};

// Haversine distance formula in kilometers
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// In-memory initial store (also synchronized with DB when available)
const inMemoryHospitals: CareRouteHospital[] = [
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
    traumaLevel: "Level 1 Trauma Center",
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
    capabilities: ["Cardiac", "Comprehensive Cardiac Center", "Respiratory", "Breathing / Respiratory", "General"],
    erCapacityTotal: 40,
    erCapacityAvailable: 14,
    traumaLevel: "Level 2 Specialty",
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
    traumaLevel: "Level 3 Clinic",
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
    capabilities: ["Pediatric", "Pediatric ER", "Maternity", "Maternity ER", "General"],
    erCapacityTotal: 30,
    erCapacityAvailable: 11,
    traumaLevel: "Specialized Pediatric",
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
  },
];

// Intelligent Clinical Matching & Scoring Engine
function evaluateHospitalMatch(
  hosp: CareRouteHospital,
  emergencyType: string,
  userLat: number,
  userLon: number
) {
  const dist = calculateDistanceKm(userLat, userLon, hosp.latitude, hosp.longitude);
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
    totalScore,
    isSpecialtyMatch,
    matchedSpecialty,
    relevantBedsText,
    activeDoctorName,
  };
}

const inMemoryRequests: CareRouteRequest[] = [];

// Helper to ensure MongoDB collection is auto-seeded with default hospital profiles
async function ensureHospitalsSeeded(hospitalCol: any) {
  if (!hospitalCol) return;
  try {
    const count = await hospitalCol.countDocuments({});
    if (count === 0) {
      const now = new Date();
      await hospitalCol.insertMany(
        inMemoryHospitals.map((h) => ({
          ...h,
          created_at: now,
          updated_at: now,
        }))
      );
      console.log(`[careroute-mongo] Auto-seeded ${inMemoryHospitals.length} default hospitals into MongoDB.`);
    }
  } catch (err) {
    console.warn("[careroute-mongo] Auto-seed warning:", err);
  }
}

export default function mountCareRouteEndpoints(router: Router) {
  // 0. Intelligent NearER Hospital Matching & Clinical Scoring API
  router.get("/careroute/match", async (req: Request, res: Response) => {
    try {
      const latitude = Number(req.query.latitude) || 6.5244;
      const longitude = Number(req.query.longitude) || 3.3792;
      const emergencyType = String(req.query.emergencyType || "Urgent Emergency");

      let allHospitals: CareRouteHospital[] = [];
      const hospitalCol = req.app?.locals?.careRouteHospitalCollection;
      if (hospitalCol) {
        await ensureHospitalsSeeded(hospitalCol);
        allHospitals = await hospitalCol.find({}).toArray();
      }
      if (!allHospitals || allHospitals.length === 0) {
        allHospitals = [...inMemoryHospitals];
      }

      // Run intelligent clinical scoring on each facility
      const scoredHospitals = allHospitals.map((hosp) => {
        const evalResult = evaluateHospitalMatch(hosp, emergencyType, latitude, longitude);
        return {
          ...hosp,
          distanceKm: evalResult.distanceKm,
          estimatedMinutes: evalResult.estimatedMinutes,
          matchScore: evalResult.totalScore,
          isSpecialtyMatch: evalResult.isSpecialtyMatch,
          matchedSpecialty: evalResult.matchedSpecialty,
          relevantBedsText: evalResult.relevantBedsText,
          activeDoctorName: evalResult.activeDoctorName,
        };
      });

      // Sort: Highest Match Score first, then distance
      scoredHospitals.sort((a, b) => {
        if (a.intakeStatus === "inactive" && b.intakeStatus !== "inactive") return 1;
        if (b.intakeStatus === "inactive" && a.intakeStatus !== "inactive") return -1;
        if ((b.matchScore || 0) !== (a.matchScore || 0)) {
          return (b.matchScore || 0) - (a.matchScore || 0);
        }
        return (a.distanceKm || 999) - (b.distanceKm || 999);
      });

      // Pick top candidate that is active and has available beds
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
        if (recommended && h.id === recommended.id) return recommended;
        return h;
      });

      return res.status(200).json({
        emergencyType,
        recommended,
        hospitals: finalHospitals,
        totalFound: finalHospitals.length,
      });
    } catch (err) {
      console.error("[careroute] match error:", err);
      return res.status(500).json({ error: "Failed to evaluate hospital match" });
    }
  });

  // 1. Get all hospitals with filtering & sorting API
  router.get("/careroute/hospitals", async (req: Request, res: Response) => {
    try {
      const { status, capability, traumaLevel, search, sortBy, latitude, longitude } = req.query;
      let hospitals: CareRouteHospital[] = [];

      const hospitalCol = req.app?.locals?.careRouteHospitalCollection;
      if (hospitalCol) {
        await ensureHospitalsSeeded(hospitalCol);
        hospitals = await hospitalCol.find({}).toArray();
      }
      if (!hospitals || hospitals.length === 0) {
        hospitals = [...inMemoryHospitals];
      }

      // Add distance if user location is provided
      if (latitude && longitude) {
        const uLat = Number(latitude);
        const uLon = Number(longitude);
        hospitals = hospitals.map((h) => ({
          ...h,
          distanceKm: calculateDistanceKm(uLat, uLon, h.latitude, h.longitude),
        }));
      }

      // Filtering conditions
      let filtered = hospitals;

      if (status && status !== "all") {
        filtered = filtered.filter((h) => h.intakeStatus === status);
      }

      if (capability && capability !== "all") {
        const capQuery = String(capability).toLowerCase();
        filtered = filtered.filter((h) =>
          (h.capabilities || []).some((c) => c.toLowerCase().includes(capQuery))
        );
      }

      if (traumaLevel && traumaLevel !== "all") {
        const tlQuery = String(traumaLevel).toLowerCase();
        filtered = filtered.filter((h) =>
          (h.traumaLevel || "").toLowerCase().includes(tlQuery)
        );
      }

      if (search) {
        const q = String(search).toLowerCase().trim();
        filtered = filtered.filter(
          (h) =>
            h.name.toLowerCase().includes(q) ||
            h.address.toLowerCase().includes(q) ||
            h.city.toLowerCase().includes(q) ||
            (h.capabilities || []).some((c) => c.toLowerCase().includes(q))
        );
      }

      // Sorting
      if (sortBy === "distance" && latitude && longitude) {
        filtered.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
      } else if (sortBy === "beds") {
        filtered.sort((a, b) => b.erCapacityAvailable - a.erCapacityAvailable);
      } else if (sortBy === "name") {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      }

      return res.status(200).json({ hospitals: filtered, total: filtered.length });
    } catch (err) {
      console.warn("[careroute-mongo] error fetching hospitals:", err);
      return res.status(200).json({ hospitals: inMemoryHospitals, total: inMemoryHospitals.length });
    }
  });

  // 2. Submit emergency medical request
  router.post("/careroute/requests", async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.patientName || !body.patientPhone || !body.assignedHospitalId) {
      return res.status(400).json({ error: "Missing required patient details or hospital ID" });
    }

    const id = body.id || "CR-" + Math.floor(100000 + Math.random() * 900000);
    const trackingCode = body.trackingCode || id;
    const now = new Date().toISOString();
    const matchedHospital = inMemoryHospitals.find((h) => h.id === body.assignedHospitalId);

    const newRequest: CareRouteRequest = {
      id,
      patientName: body.patientName,
      patientPhone: body.patientPhone,
      patientPiUsername: body.patientPiUsername || "",
      emergencyType: body.emergencyType || "Urgent Medical",
      severity: body.severity || "urgent",
      symptomsDescription: body.symptomsDescription || "",
      pickupAddress: body.pickupAddress || "Detected Coordinates",
      pickupLatitude: Number(body.pickupLatitude) || 6.5244,
      pickupLongitude: Number(body.pickupLongitude) || 3.3792,
      assignedHospitalId: body.assignedHospitalId,
      assignedHospitalName: matchedHospital?.name || "Assigned Facility",
      status: "submitted",
      ambulanceAssigned: body.ambulanceAssigned || "Unit " + Math.floor(10 + Math.random() * 90),
      etaMinutes: Number(body.etaMinutes) || 12,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryRequests.unshift(newRequest);

    // Save to MongoDB if connected
    try {
      const requestCol = req.app?.locals?.careRouteRequestCollection;
      if (requestCol) {
        await requestCol.insertOne({
          ...newRequest,
          tracking_code: trackingCode,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    } catch (err) {
      console.warn("[careroute-mongo] error inserting request:", err);
    }

    return res.status(201).json({ request: newRequest });
  });

  // 3. Track request by ID / tracking code
  router.get("/careroute/requests/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const requestCol = req.app?.locals?.careRouteRequestCollection;
      if (requestCol) {
        const doc = await requestCol.findOne({
          $or: [{ id }, { tracking_code: id }, { trackingCode: id }],
        });
        if (doc) return res.status(200).json({ request: doc });
      }
    } catch (err) {
      console.warn("[careroute-mongo] error finding request:", err);
    }

    const found = inMemoryRequests.find(
      (r) => r.id === id || (r as any).trackingCode === id || (r as any).tracking_code === id
    );
    if (!found) {
      return res.status(404).json({ error: "Emergency request not found" });
    }
    return res.status(200).json({ request: found });
  });

  // 4. Hospital Requests Queue (STRICT HOSPITAL ISOLATION)
  router.get("/careroute/hospital/:hospitalId/requests", async (req: Request, res: Response) => {
    const { hospitalId } = req.params;
    try {
      const requestCol = req.app?.locals?.careRouteRequestCollection;
      if (requestCol) {
        const hospitalRequests = await requestCol
          .find({
            $or: [{ assignedHospitalId: hospitalId }, { assigned_hospital_id: hospitalId }],
          })
          .sort({ createdAt: -1, created_at: -1 })
          .toArray();
        if (hospitalRequests && hospitalRequests.length > 0) {
          return res.status(200).json({ requests: hospitalRequests });
        }
      }
    } catch (err) {
      console.warn("[careroute-mongo] error finding hospital requests:", err);
    }

    // Strictly filter by assignedHospitalId in memory
    const hospitalRequests = inMemoryRequests.filter((r) => r.assignedHospitalId === hospitalId);
    return res.status(200).json({ requests: hospitalRequests });
  });

  // 4b. Patient Requests History (Pi Network User History)
  router.get("/careroute/patient/:piUsername/requests", async (req: Request, res: Response) => {
    const { piUsername } = req.params;
    const cleanUser = piUsername.trim().toLowerCase().replace(/^@/, "");
    try {
      const requestCol = req.app?.locals?.careRouteRequestCollection;
      if (requestCol) {
        const patientRequests = await requestCol
          .find({
            $or: [
              { patientPiUsername: cleanUser },
              { patientPiUsername: `@${cleanUser}` },
              { patient_pi_username: cleanUser },
              { patient_pi_username: `@${cleanUser}` },
            ],
          })
          .sort({ createdAt: -1, created_at: -1 })
          .toArray();
        if (patientRequests && patientRequests.length > 0) {
          return res.status(200).json({ requests: patientRequests });
        }
      }
    } catch (err) {
      console.warn("[careroute-mongo] error finding patient requests:", err);
    }

    const patientRequests = inMemoryRequests.filter(
      (r) => (r.patientPiUsername || "").trim().toLowerCase().replace(/^@/, "") === cleanUser
    );
    return res.status(200).json({ requests: patientRequests });
  });

  // 5. Update Hospital Intake Status
  router.patch("/careroute/hospital/:hospitalId/status", async (req: Request, res: Response) => {
    const { hospitalId } = req.params;
    const { status } = req.body || {};

    if (!["active", "diverting", "inactive"].includes(status)) {
      return res.status(400).json({ error: "Invalid intake status" });
    }

    try {
      const hospitalCol = req.app?.locals?.careRouteHospitalCollection;
      if (hospitalCol) {
        await hospitalCol.updateOne(
          { id: hospitalId },
          { $set: { intake_status: status, intakeStatus: status, updated_at: new Date() } }
        );
      }
    } catch (err) {
      console.warn("[careroute-mongo] error updating hospital intake status:", err);
    }

    const hosp = inMemoryHospitals.find((h) => h.id === hospitalId);
    if (hosp) hosp.intakeStatus = status;

    return res.status(200).json({ hospital: hosp });
  });

  // 6. Update Hospital Bed Breakdown
  router.patch("/careroute/hospital/:hospitalId/beds", async (req: Request, res: Response) => {
    const { hospitalId } = req.params;
    const { bedBreakdown, erCapacityAvailable, erCapacityTotal } = req.body || {};

    try {
      const hospitalCol = req.app?.locals?.careRouteHospitalCollection;
      if (hospitalCol) {
        await hospitalCol.updateOne(
          { id: hospitalId },
          {
            $set: {
              bed_breakdown: bedBreakdown,
              bedBreakdown,
              er_capacity_available: erCapacityAvailable,
              erCapacityAvailable,
              er_capacity_total: erCapacityTotal,
              erCapacityTotal,
              reported_capacity_timestamp: `Today, ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
              updated_at: new Date(),
            },
          }
        );
      }
    } catch (err) {
      console.warn("[careroute-mongo] error updating bed breakdown:", err);
    }

    return res.status(200).json({ success: true });
  });

  // 7. Update Hospital Doctor Roster
  router.patch("/careroute/hospital/:hospitalId/doctors", async (req: Request, res: Response) => {
    const { hospitalId } = req.params;
    const { onDutyDoctors } = req.body || {};

    try {
      const hospitalCol = req.app?.locals?.careRouteHospitalCollection;
      if (hospitalCol) {
        await hospitalCol.updateOne(
          { id: hospitalId },
          {
            $set: {
              on_duty_doctors: onDutyDoctors,
              onDutyDoctors,
              updated_at: new Date(),
            },
          }
        );
      }
    } catch (err) {
      console.warn("[careroute-mongo] error updating doctor roster:", err);
    }

    return res.status(200).json({ success: true });
  });

  // 8. Update Request Status (Accept, Dispatch, Complete, Divert)
  router.patch("/careroute/requests/:id/status", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, hospitalId, etaMinutes, ambulanceAssigned, responseNote } = req.body || {};

    const reqItem = inMemoryRequests.find((r) => r.id === id || (r as any).trackingCode === id || (r as any).tracking_code === id);
    if (reqItem) {
      if (status) reqItem.status = status;
      if (typeof etaMinutes === "number") reqItem.etaMinutes = etaMinutes;
      if (ambulanceAssigned) reqItem.ambulanceAssigned = ambulanceAssigned;
      if (responseNote) reqItem.responseNote = responseNote;
      reqItem.updatedAt = new Date().toISOString();
    }

    try {
      const requestCol = req.app?.locals?.careRouteRequestCollection;
      if (requestCol) {
        const updateDoc: Record<string, any> = {
          status,
          updatedAt: new Date().toISOString(),
          updated_at: new Date(),
        };
        if (typeof etaMinutes === "number") updateDoc.etaMinutes = etaMinutes;
        if (ambulanceAssigned) updateDoc.ambulanceAssigned = ambulanceAssigned;
        if (responseNote) updateDoc.responseNote = responseNote;

        await requestCol.updateOne(
          { $or: [{ id }, { tracking_code: id }, { trackingCode: id }] },
          { $set: updateDoc }
        );
      }
    } catch (err) {
      console.warn("[careroute-mongo] error updating request status:", err);
    }

    return res.status(200).json({ request: reqItem });
  });

  // 9. Register a New Hospital & Administrator Account
  router.post("/careroute/hospital/register", async (req: Request, res: Response) => {
    const { hospital, adminStaff, password } = req.body || {};
    if (!hospital?.name || !adminStaff?.username || !password) {
      return res.status(400).json({ error: "Missing required hospital or administrator details" });
    }

    const hospitalId =
      hospital.id ||
      "hosp-" +
        hospital.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 18) +
        "-" +
        Math.floor(100 + Math.random() * 900);

    const newHospital = {
      ...hospital,
      id: hospitalId,
      intakeStatus: hospital.intakeStatus || "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const newStaff = {
      id: adminStaff.id || "staff-" + Math.floor(1000 + Math.random() * 9000),
      hospitalId,
      username: adminStaff.username,
      fullName: adminStaff.fullName || adminStaff.username,
      role: adminStaff.role || "Hospital Administrator",
      email: adminStaff.email || `${adminStaff.username}@hospital.com`,
    };

    inMemoryHospitals.unshift(newHospital as any);

    try {
      const hospitalCol = req.app?.locals?.careRouteHospitalCollection;
      const staffCol = req.app?.locals?.careRouteStaffCollection;

      if (hospitalCol) {
        await hospitalCol.insertOne({
          ...newHospital,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
      if (staffCol) {
        await staffCol.insertOne({
          ...newStaff,
          password,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    } catch (err) {
      console.warn("[careroute-mongo] error registering hospital:", err);
    }

    return res.status(201).json({ hospital: newHospital, staff: newStaff });
  });

  // 10. Hospital Staff Login via MongoDB
  router.post("/careroute/hospital/login", async (req: Request, res: Response) => {
    const { emailOrUsername, password } = req.body || {};
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: "Missing email/username or password" });
    }

    try {
      const staffCol = req.app?.locals?.careRouteStaffCollection;
      if (staffCol) {
        const cleanIdent = String(emailOrUsername).trim().toLowerCase();
        const doc = await staffCol.findOne({
          $or: [
            { email: { $regex: `^${cleanIdent}$`, $options: "i" } },
            { username: { $regex: `^${cleanIdent}$`, $options: "i" } },
          ],
          password,
        });

        if (doc) {
          const staff: CareRouteStaff = {
            id: doc.id || String(doc._id),
            hospitalId: doc.hospitalId || doc.hospital_id,
            username: doc.username,
            fullName: doc.fullName || doc.full_name || doc.username,
            role: doc.role || "Hospital Staff",
            email: doc.email,
          };
          return res.status(200).json({ staff });
        }
      }
    } catch (err) {
      console.warn("[careroute-mongo] error during hospital staff login:", err);
    }

    return res.status(401).json({ error: "Invalid hospital staff credentials" });
  });
}
