import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import { Link } from "react-router-dom";
import type { EducationCategory } from "../../types/education";
import { toEducationCategorySlug } from "../../utils/education";

type CategoryGridProps = {
  categories: EducationCategory[];
  selected?: string;
};

const CategoryGrid = ({ categories, selected }: CategoryGridProps) => (
  <div className="education-category-grid">
    {categories.map(category => {
      const slug = toEducationCategorySlug(category);
      const isUniversities = category.toLowerCase() === "universities";
      const courseCategory =
        category === "Tech Skills"
          ? "Technology"
          : category === "Business"
            ? "Business"
            : category === "Exam Prep"
              ? "Exam Prep"
              : null;
      const directDestination = category === "Institutions" ? "/education/institutions" : category === "Courses" || category === "Online Courses" ? "/services/education/courses" :
        category === "Tutors"
          ? "/services/education/tutors"
          : category === "Certificates"
            ? "/services/education/certificates"
            : null;
      const destination = isUniversities
        ? "/services/education/universities"
        : directDestination
          ? directDestination
          : courseCategory
            ? `/services/education/courses?category=${encodeURIComponent(courseCategory)}`
            : `/services/education/categories/${slug}`;
      return (
        <Link
          key={category}
          to={destination}
          className={`education-category-tile${selected === category ? " selected" : ""}`}
        >
          <SchoolOutlinedIcon />
          <span>{category}</span>
        </Link>
      );
    })}
  </div>
);

export default CategoryGrid;
