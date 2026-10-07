import type { ObjectId } from "mongodb";
export const institutionTypes = {
  online_academy: "Online Academy",
  online_school: "Online School",
  primary_school: "Primary School",
  secondary_school: "High School / Secondary School",
  training_institute: "Training Institute",
  professional_institute: "Professional Institute",
  language_school: "Language School",
  religious_education: "Religious Education Institution",
  technical_vocational: "Technical/Vocational School",
  coding_bootcamp: "Coding Bootcamp",
  learning_center: "Learning Center",
  other: "Other",
} as const;
export type InstitutionType = keyof typeof institutionTypes;
export type InstitutionApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected";
export interface InstitutionCapabilities {
  apply: boolean;
  enroll: boolean;
  certificates: boolean;
}
export interface InstitutionData {
  _id: ObjectId;
  name: string;
  slug: string;
  institutionType: InstitutionType;
  logo: string;
  coverImage: string;
  description: string;
  country: string;
  city: string;
  location: string;
  deliveryMode: "online" | "physical" | "hybrid";
  website: string;
  email: string;
  phone: string;
  socialLinks: string[];
  languages: string[];
  categories: string[];
  subjects: string[];
  admissionInformation: string;
  partnerStatus: "directory" | "smaj_verified_partner";
  verificationStatus: "unverified" | "verified";
  piPaymentsEnabled: boolean;
  capabilities: InstitutionCapabilities;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}
export interface InstitutionProgramData {
  _id: ObjectId;
  institutionId: string;
  name: string;
  description: string;
  courseIds: string[];
  status: "draft" | "approved" | "archived";
  enrollmentEnabled: boolean;
  piPaymentsEnabled: boolean;
  certificateEnabled: boolean;
  priceUsdt: number;
  pricePi: number;
  learningInstructions: string;
  learningUrl: string;
  createdAt: string;
  updatedAt: string;
}
