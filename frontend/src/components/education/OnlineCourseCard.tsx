import { Link } from "react-router-dom";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import type { Course } from "../../types/courses";
import { formatPiAmount } from "../../lib/formatters";
import "./courses.css";

const formatStudents = (count: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);

const courseTypeBadge = (course: Course) => {
  if (course.institutionId && !course.institutionEnrollmentEnabled) return <span className="course-badge">Informational</span>;
  if (course.course_type === "free") {
    return <span className="course-badge free">FREE</span>;
  }
  return <span className="course-badge paid">{"p"} {formatPiAmount(course.price_pi)}</span>;
};

export const OnlineCourseCard = ({ course }: { course: Course }) => {
  return (
    <article className="course-card">
      <div className="course-card-image">
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt={course.title} />
        ) : (
          <div className="course-card-image-placeholder">Course</div>
        )}
        {course.certificate_enabled && (!course.institutionId || course.institutionCertificateEnabled) && <span className="course-card-certificate">Certificate</span>}
      </div>
      <div className="course-card-body">
        <span className="course-card-category">{course.category}</span>
        <h3>
          <Link to={`/services/education/courses/${course.slug}`}>{course.title}</Link>
        </h3>
        {course.subtitle && <p className="course-card-subtitle">{course.subtitle}</p>}
        <div className="course-card-popularity" aria-label={`${course.rating_average} rating, ${course.enrollment_count} students`}>
          <strong><StarRoundedIcon /> {course.rating_average ? course.rating_average.toFixed(1) : "New"}</strong>
          <span aria-hidden="true">&bull;</span>
          <span>{formatStudents(course.enrollment_count)} {course.enrollment_count === 1 ? "student" : "students"}</span>
        </div>
        <div className="course-card-meta">
          <span>{course.level}</span>
          {course.estimated_duration && <span>{course.estimated_duration}</span>}
        </div>
        <footer className="course-card-footer">
          {courseTypeBadge(course)}
          <Link to={`/services/education/courses/${course.slug}`} className="course-primary-btn">
            View Course
          </Link>
        </footer>
      </div>
    </article>
  );
};

export default OnlineCourseCard;
