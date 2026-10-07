import { axiosClient } from "./axiosClient";
import type { EducationCourse, EducationPartner, EducationCategory, University, UniversityProgram, UniversityClaim, UniversityApplication, UniversityPayment, UniversityAuthorization } from "../types/education";

const FALLBACK_CATEGORIES: EducationCategory[] = [
  "Universities", "Institutions",
  "Courses",
  "Tech Skills",
  "Business",
  "Exam Prep",
  "Tutors",
  "Certificates",
];

const FALLBACK_COURSES: EducationCourse[] = [
  {
    id: "web-foundations",
    title: "Web Development Foundations",
    provider: "SMAJ Digital Academy",
    category: "Tech Skills",
    level: "Beginner",
    duration: "6 weeks",
    priceUsdt: 120,
    rating: "4.8",
    enrollmentCount: 1240,
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85",
    description: "Learn HTML, CSS, and JavaScript from scratch with hands-on projects.",
  },
  {
    id: "business-growth",
    title: "Small Business Growth with Digital Tools",
    provider: "SMAJ Business School",
    category: "Business",
    level: "Intermediate",
    duration: "4 weeks",
    priceUsdt: 90,
    rating: "4.7",
    enrollmentCount: 856,
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=85",
    description: "Use digital marketing and analytics to grow a small business.",
  },
  {
    id: "english-exam-prep",
    title: "English Exam Preparation",
    provider: "Verified Tutor Network",
    category: "Exam Prep",
    level: "All levels",
    duration: "8 weeks",
    priceUsdt: 150,
    rating: "4.9",
    enrollmentCount: 684,
    image: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=85",
    description: "Prepare for IELTS, TOEFL, and PTE with guided practice.",
  },
];

const FALLBACK_PARTNERS: EducationPartner[] = [
  {
    id: "partner-university-portal",
    name: "Partner University Portal",
    type: "University Access",
    location: "Global",
    programs: "Admissions, programs, application fees",
    status: "Partner onboarding",
  },
  {
    id: "smaj-digital-academy",
    name: "SMAJ Digital Academy",
    type: "Online School",
    location: "Remote",
    programs: "Technology, business, creator skills",
    status: "Ready for pilot",
  },
  {
    id: "verified-tutor-network",
    name: "Verified Tutor Network",
    type: "Tutoring",
    location: "Remote and local",
    programs: "One-to-one lessons, exam prep",
    status: "Provider review",
  },
];

const FALLBACK_UNIVERSITIES: University[] = [
  {
    id: "global-institute-of-technology",
    slug: "global-institute-of-technology",
    official_name: "Global Institute of Technology",
    short_name: "GIT",
    description: "A demo institution for platform development and UI verification.",
    institution_type: "research",
    country: "United States",
    country_code: "US",
    city: "San Francisco",
    state_region: "California",
    official_website: "https://example.edu",
    contact_email: "info@example.edu",
    languages: ["English"],
    recognition_status: "directory",
    recognition_authority: "Demo Authority",
    external_ids: [{ provider: "demo", id: "git-001" }],
    partnership_status: "directory",
    pi_payments_enabled: false,
    applications_enabled: false,
    profile_claimed: false,
    data_last_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_demo: true,
  },
  {
    id: "pioneer-academy-of-sciences",
    slug: "pioneer-academy-of-sciences",
    official_name: "Pioneer Academy of Sciences",
    short_name: "PAS",
    description: "Another demo institution for UI development.",
    institution_type: "public",
    country: "United Kingdom",
    country_code: "GB",
    city: "London",
    official_website: "https://example.ac.uk",
    contact_email: "info@example.ac.uk",
    languages: ["English"],
    recognition_status: "recognition_verified",
    recognition_authority: "Demo UK Authority",
    external_ids: [{ provider: "demo", id: "pas-002" }],
    partnership_status: "directory",
    pi_payments_enabled: false,
    applications_enabled: false,
    profile_claimed: false,
    data_last_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_demo: true,
  },
];

export const getEducationCategories = async (): Promise<EducationCategory[]> => {
  try {
    const response = await axiosClient.get<{ categories: EducationCategory[] }>("/education/categories");
    const data = response.data.categories;
    return data.length ? data : FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
};

export const getEducationCourses = async (params?: { category?: string; query?: string }): Promise<EducationCourse[]> => {
  try {
    const response = await axiosClient.get<{ courses: EducationCourse[] }>("/education/courses", { params });
    const data = response.data.courses;
    return data.length ? data : FALLBACK_COURSES;
  } catch {
    return FALLBACK_COURSES;
  }
};

export const getEducationCourse = async (id: string): Promise<EducationCourse | undefined> => {
  try {
    const response = await axiosClient.get<{ course: EducationCourse }>(`/education/courses/${encodeURIComponent(id)}`);
    return response.data.course;
  } catch {
    return FALLBACK_COURSES.find((course) => course.id === id);
  }
};

export const getEducationPartners = async (): Promise<EducationPartner[]> => {
  try {
    const response = await axiosClient.get<{ partners: EducationPartner[] }>("/education/partners");
    const data = response.data.partners;
    return data.length ? data : FALLBACK_PARTNERS;
  } catch {
    return FALLBACK_PARTNERS;
  }
};

export const getUniversities = async (params?: { q?: string; country?: string; city?: string; institution_type?: string; partnership?: string; page?: number; limit?: number }): Promise<{ universities: University[]; total: number; page: number; pageSize: number; totalPages: number }> => {
  try {
    const response = await axiosClient.get<{ universities: University[]; total: number; page: number; pageSize: number; totalPages: number }>("/education/universities", { params });
    const data = response.data;
    if (data.universities.length === 0 && data.total === 0) {
      return { universities: FALLBACK_UNIVERSITIES, total: FALLBACK_UNIVERSITIES.length, page: 1, pageSize: 20, totalPages: 1 };
    }
    return data;
  } catch {
    return { universities: FALLBACK_UNIVERSITIES, total: FALLBACK_UNIVERSITIES.length, page: 1, pageSize: 20, totalPages: 1 };
  }
};

export const getUniversity = async (idOrSlug: string): Promise<{ university: University | null; programs: UniversityProgram[]; authorization: UniversityAuthorization }> => {
  try {
    const response = await axiosClient.get<{ university: University | null; programs: UniversityProgram[]; authorization: UniversityAuthorization }>(`/education/universities/${encodeURIComponent(idOrSlug)}`);
    return response.data;
  } catch {
    const uni = FALLBACK_UNIVERSITIES.find((u) => u.id === idOrSlug || u.slug === idOrSlug) || null;
    return { university: uni, programs: [], authorization: { applications_enabled: false, pi_payments_enabled: false, payment_categories: [] } };
  }
};

export const getUniversityPrograms = async (universityId: string): Promise<UniversityProgram[]> => {
  try {
    const response = await axiosClient.get<{ programs: UniversityProgram[] }>(`/education/universities/${encodeURIComponent(universityId)}/programs`);
    return response.data.programs;
  } catch {
    return [];
  }
};

export const createUniversityClaim = async (data: {
  university_id: string;
  university_slug: string;
  university_name: string;
  representative_full_name: string;
  job_title: string;
  institutional_email: string;
  department?: string;
  phone?: string;
  university_website?: string;
  proof_of_authority: string;
  supporting_documents?: string[];
  message?: string;
}): Promise<UniversityClaim> => {
  const response = await axiosClient.post<{ claim: UniversityClaim }>("/education/universities/claims", data);
  return response.data.claim;
};

export const getUniversityApplications = async (): Promise<UniversityApplication[]> => {
  try {
    const response = await axiosClient.get<{ applications: UniversityApplication[] }>("/education/applications");
    return response.data.applications;
  } catch {
    return [];
  }
};

export const createUniversityApplication = async (universityId: string, data: {
  program_id?: string;
  program_name?: string;
  intake?: string;
  personal_information?: Record<string, unknown>;
  education_history?: Record<string, unknown>[];
  required_documents?: Record<string, unknown>[];
  statement_essay?: string;
}): Promise<UniversityApplication> => {
  const response = await axiosClient.post<{ application: UniversityApplication }>(`/education/universities/${encodeURIComponent(universityId)}/applications`, data);
  return response.data.application;
};

export const approveUniversityPayment = async (universityId: string, data: {
  payment_purpose?: string;
  amount_display: number;
  currency_display?: string;
  application_id?: string;
  program_id?: string;
  program_name?: string;
}): Promise<UniversityPayment> => {
  const response = await axiosClient.post<{ payment: UniversityPayment }>(`/education/universities/${encodeURIComponent(universityId)}/payments/approve`, data);
  return response.data.payment;
};

export const completeUniversityPayment = async (paymentId: string, txid: string): Promise<{ message: string; payment_id: string; txid: string }> => {
  const response = await axiosClient.post<{ message: string; payment_id: string; txid: string }>(`/education/universities/payments/${encodeURIComponent(paymentId)}/complete`, { txid });
  return response.data;
};

export const cancelUniversityPayment = async (paymentId: string): Promise<{ message: string }> => {
  const response = await axiosClient.post<{ message: string }>(`/education/universities/payments/${encodeURIComponent(paymentId)}/cancel`);
  return response.data;
};

export type TeacherApplication = {
  id: string; applicant_role: "tutor" | "education_provider"; full_name: string; email: string; phone?: string; country: string; avatar_url?: string; headline: string; biography: string; subjects: string[]; experience_years: number; languages: string[]; education: string; certifications: string; proposed_course_title: string; proposed_category: string; proposed_level: string; delivery_method: string; proposed_price_pi: number; evidence_documents: Array<{ name: string; url: string }>; sample_lesson_url?: string; pi_username: string; identity_confirmed: boolean; quality_agreed: boolean; terms_agreed: boolean; status: "draft" | "submitted" | "under_review" | "changes_required" | "approved" | "rejected"; reviewer_notes?: string; submitted_at?: string; created_at: string; updated_at: string;
};
export const getMyTeacherApplication = async () => (await axiosClient.get<{ application: TeacherApplication | null }>("/education/teacher-applications/me")).data.application;
export const saveTeacherApplication = async (data: Record<string, unknown>) => (await axiosClient.post<{ application: TeacherApplication }>("/education/teacher-applications", data)).data.application;
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Could not read this file.")); reader.readAsDataURL(file); });
export const uploadTeacherEvidence = async (file: File) => { if (file.type !== "application/pdf") throw new Error("Upload a PDF document."); const document = await fileToDataUrl(file); const { data } = await axiosClient.post<{ url: string }>("/uploads/document", { document, name: file.name, purpose: "education-teacher-evidence" }); return { name: file.name, url: data.url }; };
export type TutorSummary = { id: string; name: string; avatar_url?: string; headline: string; biography?: string; subjects: string[]; languages: string[]; location: string; experience_years: number; education?: string; certifications?: string; ratePi: number; verified: boolean };
export const getVerifiedTutors = async () => (await axiosClient.get<{ tutors: TutorSummary[] }>("/education/tutors")).data.tutors;
export type TutorLessonRequestInput = { subject: string; preferred_date: string; preferred_time: string; timezone: string; delivery_mode: "video" | "audio" | "chat" | "in_person"; duration_minutes: number; message: string };
export const requestTutorLesson = async (tutorId: string, input: TutorLessonRequestInput) => (await axiosClient.post<{ request: { id: string }; message: string }>(`/education/tutors/${encodeURIComponent(tutorId)}/lesson-requests`, input)).data;
export const getVerifiedTutor = async (id: string) => (await axiosClient.get<{ tutor: TutorSummary }>(`/education/tutors/${encodeURIComponent(id)}`)).data.tutor;