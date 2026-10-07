import { axiosClient } from "./axiosClient";
import axios from "axios";
import type {
  Course,
  Enrollment,
  Certificate,
  CoursePayment,
  QuizSubmission,
  CourseSearchParams,
  CourseAuthorizePaymentResult,
} from "../types/courses";

const FALLBACK_COURSES: Course[] = [
  {
    id: "demo-web-foundations",
    slug: "demo-web-foundations",
    title: "Web Development Foundations",
    subtitle: "Learn HTML, CSS, and JavaScript from scratch",
    short_description: "Build modern websites with core web technologies.",
    description:
      "This comprehensive course takes you from zero to building real websites using HTML, CSS, and JavaScript.",
    category: "Technology",
    course_type: "paid",
    price_pi: 0.05,
    price_usdt: 15707,
    instructor_id: "demo-instructor",
    language: "en",
    level: "beginner",
    estimated_duration: "6 weeks",
    thumbnail_url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=85",
    tags: ["html", "css", "javascript", "web"],
    certificate_enabled: true,
    completion_rules: {
      required_lessons_percentage: 100,
      require_all_required_lessons: true,
      require_quizzes: false,
      require_final_assessment: false,
      require_project: false,
    },
    modules: [],
    status: "published",
    enrollment_count: 1240,
    rating_average: 4.8,
    rating_count: 320,
    provenance: {
      source_type: "creator",
      source_name: "SMAJ Digital Academy",
      retrieved_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      verification_status: "unverified",
      confidence: 0.8,
      is_official_source: true,
    },
    copyright_agreed: true,
    copyright_agreed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_demo: true,
  },
  {
    id: "demo-pi-business-growth",
    slug: "demo-pi-business-growth",
    title: "Small Business Growth with Pi",
    subtitle: "Use digital tools to grow your business",
    short_description: "Practical business skills for the Pi economy.",
    description: "Learn how to leverage digital tools and the Pi ecosystem to grow a small business.",
    category: "Business",
    course_type: "free",
    price_pi: 0,
    price_usdt: 0,
    instructor_id: "demo-instructor-2",
    language: "en",
    level: "intermediate",
    estimated_duration: "4 weeks",
    thumbnail_url: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=85",
    tags: ["business", "pi", "growth"],
    certificate_enabled: true,
    completion_rules: {
      required_lessons_percentage: 100,
      require_all_required_lessons: true,
      require_quizzes: false,
      require_final_assessment: false,
      require_project: false,
    },
    modules: [],
    status: "published",
    enrollment_count: 856,
    rating_average: 4.6,
    rating_count: 210,
    provenance: {
      source_type: "creator",
      source_name: "SMAJ Business School",
      retrieved_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      verification_status: "unverified",
      confidence: 0.8,
      is_official_source: true,
    },
    copyright_agreed: true,
    copyright_agreed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_demo: true,
  },
];

export const getCourses = async (
  params?: CourseSearchParams
): Promise<{ courses: Course[]; total: number; page: number; pageSize: number; totalPages: number }> => {
  try {
    const response = await axiosClient.get<{
      courses: Course[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>("/courses", { params });
    const data = response.data;
    if (data.courses.length === 0 && data.total === 0) {
      const filtered =
        params?.q || params?.category || params?.level || params?.type
          ? FALLBACK_COURSES.filter(c => {
              const q = (params.q || "").toLowerCase();
              if (
                q &&
                !c.title.toLowerCase().includes(q) &&
                !c.description.toLowerCase().includes(q) &&
                !c.tags.some(t => t.includes(q))
              )
                return false;
              if (params.category && c.category !== params.category) return false;
              if (params.level && c.level !== params.level) return false;
              if (params.type && c.course_type !== params.type) return false;
              return true;
            })
          : FALLBACK_COURSES;
      return { courses: filtered, total: filtered.length, page: 1, pageSize: 20, totalPages: 1 };
    }
    return data;
  } catch {
    const filtered =
      params?.q || params?.category || params?.level || params?.type
        ? FALLBACK_COURSES.filter(c => {
            const q = (params.q || "").toLowerCase();
            if (
              q &&
              !c.title.toLowerCase().includes(q) &&
              !c.description.toLowerCase().includes(q) &&
              !c.tags.some(t => t.includes(q))
            )
              return false;
            if (params.category && c.category !== params.category) return false;
            if (params.level && c.level !== params.level) return false;
            if (params.type && c.course_type !== params.type) return false;
            return true;
          })
        : FALLBACK_COURSES;
    return { courses: filtered, total: filtered.length, page: 1, pageSize: 20, totalPages: 1 };
  }
};

export const getCourse = async (idOrSlug: string): Promise<Course | undefined> => {
  try {
    const response = await axiosClient.get<{ course: Course }>(`/courses/${encodeURIComponent(idOrSlug)}`);
    return response.data.course;
  } catch {
    return FALLBACK_COURSES.find(c => c.id === idOrSlug || c.slug === idOrSlug);
  }
};

export const createCourse = async (data: Record<string, unknown>): Promise<Course> => {
  const response = await axiosClient.post<{ course: Course }>("/courses", data);
  return response.data.course;
};

export const updateCourse = async (idOrSlug: string, data: Record<string, unknown>): Promise<Course> => {
  const response = await axiosClient.patch<{ course: Course }>(`/courses/${encodeURIComponent(idOrSlug)}`, data);
  return response.data.course;
};

export const uploadCourseVideo = async (
  file: File,
  rightsConfirmed: boolean,
  onProgress?: (percentage: number) => void,
  institutionId?: string
): Promise<{ uid: string; playbackUrl: string }> => {
  const session = await axiosClient.post<{ uid: string; uploadURL: string; playbackUrl: string }>(
    "/course-video-uploads",
    { fileSize: file.size, contentType: file.type, rightsConfirmed, institutionId }
  );
  const body = new FormData();
  body.append("file", file);
  await axios.post(session.data.uploadURL, body, {
    withCredentials: false,
    timeout: 0,
    onUploadProgress: event => {
      if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
    },
  });
  return { uid: session.data.uid, playbackUrl: session.data.playbackUrl };
};
export const submitCourseForReview = async (idOrSlug: string): Promise<{ message: string }> => {
  const response = await axiosClient.post<{ message: string }>(`/courses/${encodeURIComponent(idOrSlug)}/submit`);
  return response.data;
};

export const getMyLearning = async (): Promise<Enrollment[]> => {
  try {
    const response = await axiosClient.get<{ enrollments: Enrollment[] }>("/my-learning");
    return response.data.enrollments;
  } catch {
    return [];
  }
};

export const getEnrollment = async (enrollmentId: string): Promise<Enrollment | undefined> => {
  try {
    const response = await axiosClient.get<{ enrollment: Enrollment }>(
      `/my-learning/${encodeURIComponent(enrollmentId)}`
    );
    return response.data.enrollment;
  } catch {
    return undefined;
  }
};

export const enrollInCourse = async (
  courseId: string
): Promise<{ enrollment: Enrollment; payment?: CoursePayment; message: string }> => {
  const response = await axiosClient.post<{ enrollment: Enrollment; payment?: CoursePayment; message: string }>(
    `/courses/${encodeURIComponent(courseId)}/enroll`,
    {}
  );
  return response.data;
};

export const completeLesson = async (enrollmentId: string, lessonId: string): Promise<{ enrollment: Enrollment }> => {
  const response = await axiosClient.post<{ enrollment: Enrollment }>(
    `/my-learning/${encodeURIComponent(enrollmentId)}/lessons/${encodeURIComponent(lessonId)}/complete`,
    {}
  );
  return response.data;
};

export const submitQuiz = async (courseId: string, answers: Record<string, unknown>): Promise<QuizSubmission> => {
  const response = await axiosClient.post<{ submission: QuizSubmission }>(
    `/courses/${encodeURIComponent(courseId)}/quiz/submit`,
    { answers }
  );
  return response.data.submission;
};

export const requestCertificate = async (courseId: string): Promise<{ certificate: Certificate; message: string }> => {
  const response = await axiosClient.post<{ certificate: Certificate; message: string }>(
    `/courses/${encodeURIComponent(courseId)}/certificate`,
    {}
  );
  return response.data;
};

export const requestEnrollmentCertificate = async (
  courseId: string
): Promise<{ certificate: Certificate; message: string }> => {
  const response = await axiosClient.post<{ certificate: Certificate; message: string }>(
    `/courses/${encodeURIComponent(courseId)}/enrollment-certificate`,
    {}
  );
  return response.data;
};

export const getCourseEnrollments = async (courseId: string): Promise<Enrollment[]> => {
  const response = await axiosClient.get<{ enrollments: Enrollment[] }>(
    `/courses/${encodeURIComponent(courseId)}/enrollments`
  );
  return response.data.enrollments;
};
export const getMyCertificates = async (): Promise<Certificate[]> => {
  const response = await axiosClient.get<{ certificates: Certificate[] }>("/my-certificates");
  return response.data.certificates;
};
export const verifyCertificate = async (certificateId: string): Promise<{ certificate: Record<string, unknown> }> => {
  const response = await axiosClient.get<{ certificate: Record<string, unknown> }>(
    `/certificates/${encodeURIComponent(certificateId)}`
  );
  return response.data;
};

export const authorizeCoursePayment = async (
  courseId: string,
  data: { amount_display: number; currency_display?: string }
): Promise<CourseAuthorizePaymentResult> => {
  const response = await axiosClient.post<CourseAuthorizePaymentResult>(
    `/courses/${encodeURIComponent(courseId)}/payments/approve`,
    data
  );
  return response.data;
};

export const approveCoursePayment = async (
  paymentRecordId: string,
  piPaymentId: string
): Promise<{ message: string }> => {
  const response = await axiosClient.post<{ message: string }>(
    `/courses/payments/${encodeURIComponent(paymentRecordId)}/approve`,
    { pi_payment_identifier: piPaymentId }
  );
  return response.data;
};
export const completeCoursePayment = async (
  paymentId: string,
  txid: string
): Promise<{ message: string; payment_id: string; txid: string }> => {
  const response = await axiosClient.post<{ message: string; payment_id: string; txid: string }>(
    `/courses/payments/${encodeURIComponent(paymentId)}/complete`,
    { txid }
  );
  return response.data;
};

export const getAdminCourses = async (): Promise<Course[]> => {
  const response = await axiosClient.get<{ courses: Course[] }>("/admin/courses");
  return response.data.courses;
};

export const getAdminCourseStats = async (): Promise<Record<string, number>> => {
  const response = await axiosClient.get<{ stats: Record<string, number> }>("/admin/courses/stats");
  return response.data.stats;
};

export const updateAdminCourse = async (idOrSlug: string, data: Record<string, unknown>): Promise<Course> => {
  const response = await axiosClient.patch<{ course: Course }>(`/admin/courses/${encodeURIComponent(idOrSlug)}`, data);
  return response.data.course;
};
