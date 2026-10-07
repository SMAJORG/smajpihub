import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import AppLayout from "../../layouts/AppLayout";
import EducationHeader from "./EducationHeader";
import {
  approveCoursePayment,
  completeCoursePayment,
  enrollInCourse,
  getCourse,
  getCourseEnrollments,
  requestEnrollmentCertificate,
} from "../../lib/coursesApi";
import type { Course, Enrollment, CoursePayment } from "../../types/courses";
import { formatPiAmount } from "../../lib/formatters";
import { isPiPaymentAvailable } from "../../lib/soloHost";
import "../../pages/EducationPage.css";
import "../../components/education/courses.css";

const CourseDetailPage = () => {
  const { slug } = useParams();
  const [course, setCourse] = useState<Course | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [payment, setPayment] = useState<CoursePayment | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setError("Course not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getCourse(slug)
      .then(async data => {
        if (cancelled) return;
        setCourse(data);
        if (data?.id) {
          try {
            const enrollments = await getCourseEnrollments(data.id);
            if (!cancelled)
              setEnrollment(
                enrollments.find(item => !["cancelled", "refunded", "revoked"].includes(item.status)) || null
              );
          } catch {
            // Public visitors can view the course without signing in.
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load course details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleEnroll = async () => {
    if (!course) return;
    setEnrolling(true);
    setMessage("");
    try {
      const result = await enrollInCourse(course.id);
      setEnrollment(result.enrollment);
      if (result.payment) {
        setPayment(result.payment);
        setMessage("Payment required. Complete payment to access the course.");
      } else {
        setMessage("Enrolled successfully! Start learning now.");
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  const handlePayment = async () => {
    if (!course || !payment) return;
    setMessage("");
    if (!isPiPaymentAvailable()) {
      setMessage("Open this course in Pi Browser to complete payment.");
      return;
    }
    try {
      await window.Pi!.authenticate(["payments"]);
      await window.Pi!.createPayment(
        {
          amount: payment.amount_pi,
          memo: `Enrollment: ${course.title}`,
          metadata: { courseId: course.id, coursePaymentId: payment.id },
        },
        {
          onReadyForServerApproval: async piPaymentId => {
            await approveCoursePayment(payment.id, piPaymentId);
          },
          onReadyForServerCompletion: async (_piPaymentId, txid) => {
            await completeCoursePayment(payment.id, txid);
            setEnrollment(current => (current ? { ...current, status: "active" } : current));
            setMessage("Payment completed. Your course is ready.");
            setPayment(null);
          },
          onCancel: () => setMessage("Payment was cancelled. You can try again."),
          onError: paymentError => setMessage(paymentError.message || "Payment failed"),
        }
      );
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Payment failed");
    }
  };

  const handleEnrollmentCertificate = async () => {
    if (!course) return;
    setMessage("");
    try {
      const result = await requestEnrollmentCertificate(course.id);
      window.location.assign(`/verify/certificate/${encodeURIComponent(result.certificate.certificate_id)}`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Could not issue enrollment certificate");
    }
  };

  if (loading) {
    return (
      <AppLayout showHeader={false} showFooter={false}>
        <main className="courses-page">
          <EducationHeader query={query} onQueryChange={setQuery} />
          <div className="courses-loading">Loading course...</div>
        </main>
      </AppLayout>
    );
  }

  if (error || !course) {
    return (
      <AppLayout showHeader={false} showFooter={false}>
        <main className="courses-page">
          <EducationHeader query={query} onQueryChange={setQuery} />
          <div className="courses-error">
            <p>{error || "Course not found."}</p>
            <Link to="/services/education/courses" className="courses-primary-btn">
              <ArrowBackOutlinedIcon />
              Back to Courses
            </Link>
          </div>
        </main>
      </AppLayout>
    );
  }

  const isEnrolled = enrollment?.status === "active" || enrollment?.status === "completed";
  const isPaid = course.course_type === "paid";
  const institutionEnrollmentAllowed = !course.institutionId || course.institutionEnrollmentEnabled === true;
  const needsPayment = institutionEnrollmentAllowed && isPaid && !isEnrolled && payment && payment.status === "pending";

  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="courses-page">
        <EducationHeader query={query} onQueryChange={setQuery} />
        <div className="course-detail">
          <Link to="/services/education/courses" className="course-back-link">
            <ArrowBackOutlinedIcon />
            Back to Courses
          </Link>
          <div className="course-detail-hero">
            {course.cover_url && <img src={course.cover_url} alt="" className="course-detail-cover" />}
            <div className="course-detail-hero-content">
              {course.thumbnail_url && (
                <img src={course.thumbnail_url} alt={course.title} className="course-detail-thumbnail" />
              )}
              <div>
                <span className="course-kicker">{course.category}</span>
                <h1>{course.title}</h1>
                {course.subtitle && <p className="course-detail-subtitle">{course.subtitle}</p>}
                <div className="course-detail-meta">
                  <span>Level: {course.level}</span>
                  {course.estimated_duration && <span>Duration: {course.estimated_duration}</span>}
                  <span>Language: {course.language}</span>
                  {course.certificate_enabled && (!course.institutionId || course.institutionCertificateEnabled) && <span>Certificate Available</span>}
                </div>
                <footer className="course-detail-actions">
                  <strong className={course.course_type === "free" ? "course-price-free" : "course-price-paid"}>
                    {course.course_type === "free" ? "FREE" : `${formatPiAmount(course.price_pi)} Pi`}
                  </strong>
                  {!isEnrolled && institutionEnrollmentAllowed && (
                    <button className="course-primary-btn" onClick={handleEnroll} disabled={enrolling}>
                      {enrolling ? "Enrolling..." : course.course_type === "free" ? "Enroll Free" : "Enroll with Pi"}
                      {isPaid && <AccountBalanceWalletOutlinedIcon />}
                    </button>
                  )}
                  {isEnrolled && (
                    <>
                      <Link to={`/services/education/courses/learn/${enrollment.id}`} className="course-primary-btn">
                        Continue Learning
                      </Link>
                      <button type="button" className="course-secondary-btn" disabled={Boolean(course.institutionId) && (enrollment?.status !== "completed" || !course.institutionCertificateEnabled)} onClick={handleEnrollmentCertificate}>
                        Enrollment Certificate
                      </button>
                    </>
                  )}
                </footer>
              </div>
            </div>
          </div>

          {message && (
            <div
              className={`course-alert ${message.includes("success") || message.includes("activated") ? "success" : "error"}`}
            >
              {message}
            </div>
          )}
          {needsPayment && (
            <div className="course-payment-pending">
              <p>Payment of {formatPiAmount(payment.amount_pi)} Pi required.</p>
              <button className="course-primary-btn" onClick={handlePayment}>
                Complete Payment
                <AccountBalanceWalletOutlinedIcon />
              </button>
            </div>
          )}

          <section className="course-section">
            <h2>About This Course</h2>
            <p>{course.description}</p>
          </section>

          {course.learning_objectives && course.learning_objectives.length > 0 && (
            <section className="course-section">
              <h2>What You'll Learn</h2>
              <ul>
                {course.learning_objectives.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </section>
          )}

          {course.requirements && course.requirements.length > 0 && (
            <section className="course-section">
              <h2>Requirements</h2>
              <ul>
                {course.requirements.map((req, i) => (
                  <li key={i}>{req}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="course-section">
            <h2>Course Content</h2>
            <p>{course.modules.length} modules</p>
            {course.modules.length === 0 && <p>No content published yet.</p>}
          </section>
        </div>
      </main>
    </AppLayout>
  );
};

export default CourseDetailPage;
