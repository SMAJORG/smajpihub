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
export interface Institution {
  id: string;
  name: string;
  slug: string;
  institutionType: keyof typeof institutionTypes;
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
  subjects: string[];
  categories: string[];
  admissionInformation: string;
  partnerStatus: "directory" | "smaj_verified_partner";
  partnerBadge: string;
  status: "active" | "suspended";
  piPaymentsEnabled: boolean;
  capabilities: { apply: boolean; enroll: boolean; certificates: boolean };
}
export interface InstitutionProgram {
  id: string;
  name: string;
  description: string;
  institutionId: string;
  courseIds: string[];
  status: "draft" | "approved" | "archived";
  enrollmentEnabled: boolean;
  certificateEnabled: boolean;
  piPaymentsEnabled: boolean;
  pricePi: number;
  priceUsdt: number;
  learningUrl?: string;
  learningInstructions?: string;
}
export interface InstitutionApplication {
  id: string;
  profile: Institution;
  status: "draft" | "submitted" | "under_review" | "needs_information" | "approved" | "rejected";
  applicantName: string;
  applicantRole: string;
  evidenceUrl: string;
  programs: string[];
  courses: string[];
  piPaymentInterest: boolean;
  additionalInformation: string;
  reviewNotes?: string;
  institutionId?: string;
}
export interface InstitutionRecord {
  id: string;
  user_id?: string;
  userId?: string;
  applicantName?: string;
  statement?: string;
  course_title?: string;
  course_id?: string;
  programId?: string;
  status: string;
  payment_id?: string;
  certificate_id?: string;
  learningInstructions?: string;
  learningUrl?: string;
  amount_pi?: number;
  title?: string;
  body?: string;
  action?: string;
  at?: string;
}
export interface InstitutionProfileResponse {
  institution: Institution;
  programs: InstitutionProgram[];
  courses: { id: string; title: string; slug: string }[];
  announcements: InstitutionRecord[];
}
export interface InstitutionPortalResponse extends InstitutionProfileResponse {
  applications: InstitutionRecord[];
  enrollments: InstitutionRecord[];
  payments: InstitutionRecord[];
  certificates: InstitutionRecord[];
  auditHistory: InstitutionRecord[];
  summary: Record<string, number>;
}
