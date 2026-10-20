export type HospitalIntakeStatus = "active" | "diverting" | "inactive";

export type PatientRequestStatus =
  | "submitted"
  | "dispatched"
  | "accepted"
  | "rejected"
  | "completed"
  | "closed";

export type EmergencySeverity = "critical" | "urgent" | "moderate" | "low";

export type DoctorStatus = "on_duty" | "on_call" | "in_surgery" | "off_duty";

export type OnDutyDoctor = {
  id: string;
  name: string;
  specialty: string;
  shift: string;
  status: DoctorStatus;
  contact?: string;
};

export type HospitalBedBreakdown = {
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

export type CareRouteHospital = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  emergencyContact?: string;
  latitude: number;
  longitude: number;
  intakeStatus: HospitalIntakeStatus;
  capabilities: string[];
  erCapacityTotal: number;
  erCapacityAvailable: number;
  bedBreakdown?: HospitalBedBreakdown;
  onDutyDoctors?: OnDutyDoctor[];
  reportedCapacityTimestamp?: string;
  capacityDataSource?: "hospital_reported" | "demo_data";
  traumaLevel?: string;
  distanceKm?: number;
  estimatedMinutes?: number;
  isRecommended?: boolean;
  recommendationReason?: string;
  matchScore?: number;
  isSpecialtyMatch?: boolean;
  matchedSpecialty?: string;
  relevantBedsText?: string;
  activeDoctorName?: string;
};

export type CareRouteStaff = {
  id: string;
  hospitalId: string;
  username: string;
  fullName: string;
  role: string;
  email?: string;
};

export type CareRouteRequest = {
  id: string;
  trackingCode: string;
  accessToken: string;
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
  assignedHospitalName?: string;
  assignedHospitalPhone?: string;
  status: PatientRequestStatus;
  ambulanceAssigned?: string;
  etaMinutes?: number;
  responseNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type CareRouteEvent = {
  id: string;
  requestId: string;
  actorId?: string;
  actorType: "patient" | "staff" | "system";
  previousStatus?: PatientRequestStatus;
  newStatus: PatientRequestStatus;
  note?: string;
  createdAt: string;
};
