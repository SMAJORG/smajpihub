import { useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import "./EducationHeader.css";

const primaryLinks = [
  ["/services/education/my-courses", "My Courses"],
  ["/services/education/universities", "Universities"],
  ["/education/institutions", "Institutions"],
  ["/services/education/courses", "Online Courses"],
  ["/services/education/tutors", "Tutors"],
  ["/services/education/certificates", "Certificates"],
] as const;

const topicLinks = [
  ["/services/education/courses?category=Technology", "Tech Skills"],
  ["/services/education/courses?category=Business", "Business"],
  ["/services/education/courses?category=Exam%20Prep", "Exam Prep"],
] as const;

const providerLinks = [
  ["/services/education/partners", "Partners"],
  ["/services/education/teach", "Teach on SMAJ"],
  ["/education/institution-portal", "Institution portal"],
] as const;

const EducationHeader = ({
  query,
  onQueryChange,
  searchPath = "/services/education/courses",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPath?: string;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMenuOpen(false);
    const term = query.trim();
    navigate(`${searchPath}${term ? `?q=${encodeURIComponent(term)}` : ""}`);
  };

  return (
    <header className="education-header">
      <Link to="/app/services" className="education-back-to-hub" aria-label="Back to SMAJ PI HUB services">
        <ArrowBackRoundedIcon />
        <span>Hub</span>
      </Link>
      <Link to="/services/education" className="education-brand">
        <img src="/assets/services/education.png" alt="" />
        <b>SMAJ Education</b>
      </Link>
      <nav className={menuOpen ? "open" : ""} aria-label="Education navigation">
        {primaryLinks.map(([to, label]) => (
          <NavLink key={label} to={to} onClick={() => setMenuOpen(false)}>
            {label}
          </NavLink>
        ))}
      </nav>
      <form className="education-header-search" role="search" onSubmit={submit}>
        <SearchRoundedIcon />
        <input
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder="Search courses, tutors, certificates"
          aria-label="Search SMAJ PI Education"
        />
      </form>
      <button
        className="education-menu-button"
        type="button"
        aria-label={menuOpen ? "Close Education menu" : "Open Education menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(value => !value)}
      >
        {menuOpen ? <CloseRoundedIcon /> : <MenuRoundedIcon />}
      </button>
      {menuOpen ? (
        <div className="education-mobile-menu open">
          <form className="education-mobile-search" role="search" onSubmit={submit}>
            <SearchRoundedIcon />
            <input
              type="search"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              placeholder="What do you want to learn?"
              aria-label="Search SMAJ PI Education"
            />
            <button type="submit">Search</button>
          </form>
          <section className="education-menu-group">
            <span>Discover</span>
            <div className="education-menu-primary">
              {primaryLinks.map(([to, label]) => (
                <NavLink key={label} to={to} onClick={() => setMenuOpen(false)}>
                  {label}
                </NavLink>
              ))}
            </div>
          </section>
          <section className="education-menu-group">
            <span>Popular topics</span>
            <div className="education-menu-topics">
              {topicLinks.map(([to, label]) => (
                <Link key={label} to={to} onClick={() => setMenuOpen(false)}>
                  {label}
                </Link>
              ))}
            </div>
          </section>
          <section className="education-menu-group">
            <span>For providers</span>
            <div className="education-menu-provider">
              {providerLinks.map(([to, label]) => (
                <NavLink key={label} to={to} onClick={() => setMenuOpen(false)}>
                  {label}
                </NavLink>
              ))}
            </div>
          </section>
          <section className="education-menu-group">
            <span>Account</span>
            <div className="education-menu-provider">
              <NavLink to="/services/education/profile" onClick={() => setMenuOpen(false)}>
                Profile
              </NavLink>
            </div>
          </section>
          <Link className="education-menu-help" to="/help" onClick={() => setMenuOpen(false)}>
            Help & support
          </Link>
        </div>
      ) : null}
    </header>
  );
};

export default EducationHeader;
