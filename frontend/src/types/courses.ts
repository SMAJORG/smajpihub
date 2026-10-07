export type CourseType = "free" | "paid";
export type CourseLevel = "beginner" | "intermediate" | "advanced" | "all";
export type CourseStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "archived";
export type LessonType = "video" | "text" | "pdf" | "document" | "quiz" | "assignment" | "project" | "external";
export type EnrollmentStatus = "pending_payment" | "active" | "completed" | "cancelled" | "refunded" | "revoked";
export type CertificateStatus = "valid" | "revoked" | "replaced";
export type CertificateType = "enrollment" | "completion";
export type ProviderType = "smaj" | "individual" | "training_provider" | "university_partner" | "organization";

export interface Lesson {
  title: string;
  description?: string;
  order: number;
  type: LessonType;
  duration?: string;
  required: boolean;
  preview: boolean;
  content?: string;
  video_url?: string;
  video_provider?: string;
  video_asset_id?: string;
  video_playback_id?: string;
  document_url?: string;
  external_url?: string;
  resources?: string[];
  completion_rules?: Record<string, unknown>;
}

export interface CourseModule {
  title: string;
  description?: string;
  order: number;
  lessons: Lesson[];
}

export interface CompletionRules {
  required_lessons_percentage: number;
  require_all_required_lessons: boolean;
  require_quizzes: boolean;
  minimum_quiz_score?: number;
  require_final_assessment: boolean;
  minimum_final_score?: number;
  require_project: boolean;
}

export interface CourseProvenance {
  source_type: string;
  source_name: string;
  source_url?: string;
  external_id?: string;
  retrieved_at: string;
  last_verified_at: string;
  verification_status: string;
  confidence: number;
  is_official_source: boolean;
}

export type Course = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  short_description?: string;
  description: string;
  category: string;
  subcategory?: string;
  course_type: CourseType;
  price_pi: number;
  price_usdt: number;
  discount_price_pi?: number;
  discount_price_usdt?: number;
  instructor_id: string;
  provider_id?: string;
  institutionId?: string;
  institutionEnrollmentEnabled?: boolean;
  institutionCertificateEnabled?: boolean;
  programId?: string;
  piPaymentsEnabled?: boolean;
  provider_type?: ProviderType;
  language: string;
  level: CourseLevel;
  estimated_duration?: string;
  total_duration_minutes?: number;
  thumbnail_url?: string;
  cover_url?: string;
  promotional_video?: string;
  learning_objectives?: string[];
  requirements?: string[];
  target_audience?: string[];
  tags: string[];
  search_keywords?: string[];
  certificate_enabled: boolean;
  completion_rules: CompletionRules;
  modules: CourseModule[];
  status: CourseStatus;
  published_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  enrollment_count: number;
  rating_average: number;
  rating_count: number;
  provenance: CourseProvenance;
  copyright_agreed: boolean;
  copyright_agreed_at?: string;
  created_at: string;
  updated_at: string;
  is_demo: boolean;
};

export type Enrollment = {
  id: string;
  enrollment_id: string;
  institutionId?: string;
  institutionEnrollmentEnabled?: boolean;
  programId?: string;
  user_id: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  enrollment_type: "free" | "paid";
  payment_id?: string;
  status: EnrollmentStatus;
  progress_percentage: number;
  completed_lesson_ids: string[];
  current_lesson_id?: string;
  started_at?: string;
  completed_at?: string;
  certificate_id?: string;
  created_at: string;
  updated_at: string;
};

export type LessonProgress = {
  lesson_id: string;
  module_id: string;
  started_at?: string;
  completed_at?: string;
  video_progress_seconds?: number;
  quiz_score?: number;
  quiz_attempts: number;
  assignment_submitted: boolean;
};

export type Certificate = {
  id: string;
  certificate_id: string;
  enrollment_id: string;
  institutionId?: string;
  institutionEnrollmentEnabled?: boolean;
  programId?: string;
  user_id: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  instructor_name: string;
  provider_name?: string;
  learner_name: string;
  certificate_type: CertificateType;
  enrollment_date?: string;
  completion_date?: string;
  issue_date: string;
  final_score?: number;
  certificate_url?: string;
  qr_code_url?: string;
  verification_url: string;
  status: CertificateStatus;
  replaced_by?: string;
  revoked_at?: string;
  revocation_reason?: string;
  created_at: string;
  updated_at: string;
};

export type CoursePayment = {
  id: string;
  payment_id: string;
  user_id: string;
  course_id: string;
  course_slug: string;
  course_title: string;
  instructor_id: string;
  provider_id?: string;
  institutionId?: string;
  institutionEnrollmentEnabled?: boolean;
  programId?: string;
  piPaymentsEnabled?: boolean;
  amount_pi: number;
  amount_usdt: number;
  pi_payment_identifier?: string;
  transaction_identifier?: string;
  status: string;
  approved_at?: string;
  completed_at?: string;
  failed_at?: string;
  cancelled_at?: string;
  failure_reason?: string;
  audit_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type QuizQuestion = {
  id: string;
  type: "multiple_choice" | "true_false" | "multiple_answer" | "short_answer";
  question: string;
  choices?: string[];
  correct_answers: string[];
  points: number;
  order: number;
};

export type Quiz = {
  id: string;
  quiz_id: string;
  lesson_id?: string;
  course_id: string;
  title: string;
  description?: string;
  questions: QuizQuestion[];
  passing_score: number;
  attempts_allowed: number;
  time_limit_minutes?: number;
  created_at: string;
  updated_at: string;
};

export type QuizSubmission = {
  id: string;
  submission_id: string;
  quiz_id: string;
  user_id: string;
  course_id: string;
  answers: Record<string, unknown>;
  score: number;
  max_score: number;
  passed: boolean;
  attempt_number: number;
  submitted_at: string;
  graded_at?: string;
};

export type CourseSearchParams = {
  q?: string;
  category?: string;
  level?: CourseLevel;
  type?: CourseType;
  certificate?: string;
  sort?: string;
  page?: number;
  limit?: number;
};

export type CourseAuthorizePaymentResult = {
  payment: CoursePayment;
  message: string;
};
