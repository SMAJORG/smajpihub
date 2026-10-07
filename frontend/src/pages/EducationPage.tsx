import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import PersonSearchOutlinedIcon from "@mui/icons-material/PersonSearchOutlined";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import DomainOutlinedIcon from "@mui/icons-material/DomainOutlined";
import AppLayout from "../layouts/AppLayout";
import EducationHeader from "./education/EducationHeader";
import { getEducationCategories, getEducationCourses, getEducationPartners } from "../lib/educationApi";
import type { EducationCourse, EducationPartner } from "../types/education";
import CategoryGrid from "../components/education/CategoryGrid";
import CourseCard from "../components/education/CourseCard";
import PartnerCard from "../components/education/PartnerCard";
import "./EducationPage.css";

const EducationPage = () => {
  const [searchParams] = useSearchParams();
  const [categories, setCategories] = useState<string[]>([]);
  const [courses, setCourses] = useState<EducationCourse[]>([]);
  const [partners, setPartners] = useState<EducationPartner[]>([]);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cats, initialCourses, initialPartners] = await Promise.all([
          getEducationCategories(),
          getEducationCourses(),
          getEducationPartners(),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setCourses(initialCourses);
          setPartners(initialPartners);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load education data. Showing saved preview.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      controller.abort();
      cancelled = true;
    };
  }, []);

  const secondaryCategories = categories.filter(
    category => !["Universities", "Institutions", "Courses", "Online Courses", "Tutors", "Certificates"].includes(category)
  );

  const filteredCourses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter(course => {
      const matchesQuery =
        !q ||
        course.title.toLowerCase().includes(q) ||
        course.provider.toLowerCase().includes(q) ||
        course.category.toLowerCase().includes(q);
      return matchesQuery;
    });
  }, [courses, query]);

  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="education-page">
        <EducationHeader query={query} onQueryChange={setQuery} />
        <section className="education-hero">
          <div className="education-hero-copy">
            <span className="education-kicker">SMAJ PI EDUCATION</span>
            <h1>Learn, apply and grow with Pi.</h1>
            <p>Courses, universities, institutions, tutors, and verified learning credentials in one place.</p>
            <div className="education-search" role="search">
              <SearchOutlinedIcon />
              <input
                type="search"
                placeholder="Search courses, universities, or tutors"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <Link to={`/services/education/courses${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`}>
                Explore courses
              </Link>
            </div>
            <nav className="education-quick-services" aria-label="Main education services">
              <Link to="/services/education/universities">
                <SchoolOutlinedIcon />
                <span>Universities</span>
              </Link>
              <Link to="/education/institutions"><DomainOutlinedIcon /><span>Institutions</span></Link>
              <Link to="/services/education/courses">
                <MenuBookOutlinedIcon />
                <span>Courses</span>
              </Link>
              <Link to="/services/education/tutors">
                <PersonSearchOutlinedIcon />
                <span>Tutors</span>
              </Link>
              <Link to="/services/education/certificates">
                <WorkspacePremiumOutlinedIcon />
                <span>Certificates</span>
              </Link>
            </nav>
            <div className="education-hero-trust" aria-label="Learning benefits">
              <span>
                <CheckCircleOutlineOutlinedIcon /> Verified providers
              </span>
              <span>
                <AccountBalanceWalletOutlinedIcon /> Pi payments
              </span>
              <span>
                <WorkspacePremiumOutlinedIcon /> Verified certificates
              </span>
            </div>
            <nav className="education-popular-links" aria-label="Popular education categories">
              <b>Popular</b>
              <Link to="/services/education/courses?category=Technology">Technology</Link>
              <Link to="/services/education/courses?category=Business">Business</Link>
              <Link to="/services/education/courses?category=Exam%20Prep">Exam Prep</Link>
              <Link to="/services/education/courses?category=Languages">Languages</Link>
            </nav>
          </div>
          <aside className="education-hero-panel" aria-label="Education payment preview">
            <div className="education-live-class">
              <img
                src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=85"
                alt=""
              />
              <span>Verified learning</span>
            </div>
            <div className="education-payment-card">
              <div>
                <strong>Course Enrollment</strong>
                <small>Web Development Foundations</small>
              </div>
              <b>12 Pi</b>
              <Link to="/dashboard">
                Pay with Pi
                <AccountBalanceWalletOutlinedIcon />
              </Link>
            </div>
          </aside>
        </section>

        <section id="courses" className="education-section">
          <div className="education-section-head">
            <span className="education-kicker">EXPLORE MORE</span>
            <h2>Build the learning path that fits you.</h2>
            <p>
              Payments are enabled for SMAJ-verified schools and providers, so users only see Pi checkout where an
              education partner is approved.
            </p>
          </div>
          <CategoryGrid categories={secondaryCategories} />
        </section>

        <section className="education-section">
          <div className="education-section-head compact">
            <span className="education-kicker">FEATURED COURSES</span>
            <h2>Start with practical skills.</h2>
          </div>
          {loading ? (
            <div className="education-loading">Loading courses...</div>
          ) : error ? (
            <div className="education-error">
              <p>{error}</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="education-empty">
              <p>No courses match your search.</p>
            </div>
          ) : (
            <div className="education-course-grid">
              {filteredCourses.map(course => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>

        <section id="partners" className="education-section education-partners">
          <div className="education-section-head compact">
            <span className="education-kicker">PARTNER ACCESS</span>
            <h2>Verified providers before Pi checkout.</h2>
          </div>
          {loading ? (
            <div className="education-loading">Loading partners...</div>
          ) : (
            <div className="education-partner-list">
              {partners.map(partner => (
                <PartnerCard key={partner.id} partner={partner} />
              ))}
            </div>
          )}
        </section>

        <section className="education-trust">
          <article>
            <CheckCircleOutlineOutlinedIcon />
            <h3>Verified Providers</h3>
            <p>Universities, tutors, and course creators go through SMAJ review before they can collect Pi.</p>
          </article>
          <article>
            <AccountBalanceWalletOutlinedIcon />
            <h3>Pi Payments</h3>
            <p>Course fees, applications, tutoring, and certificates can use Pi where the provider is approved.</p>
          </article>
          <article>
            <SchoolOutlinedIcon />
            <h3>Learning Records</h3>
            <p>
              Users can track courses, certificates, saved schools, and education payment history from their account.
            </p>
          </article>
        </section>
      </main>
    </AppLayout>
  );
};

export default EducationPage;
