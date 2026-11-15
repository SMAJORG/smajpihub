import SmajVerifiedBadge from "../../components/SmajVerifiedBadge";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import AppLayout from "../../layouts/AppLayout";
import EducationHeader from "./EducationHeader";
import EducationBackBar from "../../components/education/EducationBackBar";
import "../../pages/EducationPage.css";
import "../../components/education/courses.css";
import { getVerifiedTutors, type TutorSummary } from "../../lib/educationApi";

const TutorsPage = () => {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("");
  const [verifiedTutors, setVerifiedTutors] = useState<TutorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getVerifiedTutors().then(setVerifiedTutors).catch(() => setVerifiedTutors([])).finally(() => setLoading(false));
  }, []);

  const subjects = useMemo(() => [...new Set(verifiedTutors.flatMap(tutor => tutor.subjects))].sort(), [verifiedTutors]);
  const languages = useMemo(() => [...new Set(verifiedTutors.flatMap(tutor => tutor.languages))].sort(), [verifiedTutors]);
  const hasFilters = Boolean(query || subject || language);
  const tutors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return verifiedTutors.filter(tutor => {
      if (!tutor.verified) return false;
      if (subject && !tutor.subjects.includes(subject)) return false;
      if (language && !tutor.languages.includes(language)) return false;
      return !normalizedQuery || tutor.name.toLowerCase().includes(normalizedQuery) || tutor.headline.toLowerCase().includes(normalizedQuery) || tutor.subjects.some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [language, query, subject, verifiedTutors]);

  const clearFilters = () => { setQuery(""); setSubject(""); setLanguage(""); };

  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="courses-page">
        <EducationHeader query={query} onQueryChange={setQuery} searchPath="/services/education/tutors" />
        <EducationBackBar current="Tutors" />
        <section className="courses-hero">
          <span className="courses-kicker">VERIFIED TUTORS</span>
          <h1>Find the right tutor for your goals</h1>
          <p>Search approved tutors by subject and language. Review their profile before requesting a lesson.</p>
        </section>
        <section className="tutors-search-panel" aria-label="Find a tutor">
          <div className="tutors-search-title"><span><TuneRoundedIcon /><b>Find your tutor</b></span>{hasFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
          <div className="tutors-toolbar">
            <label className="tutors-search-input"><SearchOutlinedIcon /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tutor, subject, or skill" aria-label="Search verified tutors" /></label>
            <label><span>Subject</span><select value={subject} onChange={event => setSubject(event.target.value)}><option value="">All subjects</option>{subjects.map(value => <option key={value}>{value}</option>)}</select></label>
            <label><span>Language</span><select value={language} onChange={event => setLanguage(event.target.value)}><option value="">All languages</option>{languages.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <p className="tutors-results-count">{loading ? "Loading verified tutors…" : `${tutors.length} verified ${tutors.length === 1 ? "tutor" : "tutors"} found`}</p>
        </section>
        {loading ? <section className="tutors-empty tutors-loading"><span /><h2>Finding verified tutors</h2><p>Please wait while we load approved profiles.</p></section> : tutors.length > 0 ? (
          <section className="tutors-grid">
            {tutors.map(tutor => (
              <article className="tutor-card" key={tutor.id}>
                <div className="tutor-card-profile">
                  <div className="tutor-card-avatar">{tutor.avatar_url ? <img src={tutor.avatar_url} alt={`${tutor.name} profile`} /> : <span>{tutor.name.slice(0, 1).toUpperCase()}</span>}</div>
                  <div className="tutor-card-identity">
                    <div className="tutor-card-name"><h2>{tutor.name}<SmajVerifiedBadge userId={tutor.userId} /></h2><span className="tutor-verified-badge"><VerifiedOutlinedIcon /> Tutor approved</span></div>
                    <p>{tutor.headline}</p>
                  </div>
                </div>
                <div className="tutor-card-tags">{tutor.subjects.slice(0, 4).map(value => <span key={value}>{value}</span>)}</div>
                <div className="tutor-card-meta"><span><b>Languages</b>{tutor.languages.join(", ")}</span><span><b>Location</b>{tutor.location}</span><span><b>Experience</b>{tutor.experience_years} {tutor.experience_years === 1 ? "year" : "years"}</span></div>
                <footer className="tutor-card-footer"><strong>{tutor.ratePi === 0 ? "Free introduction" : `${tutor.ratePi} Pi / lesson`}</strong><Link className="course-primary-btn" to={`/services/education/tutors/${tutor.id}`}>View Profile</Link></footer>
              </article>
            ))}
          </section>
        ) : (
          <section className="tutors-empty"><SchoolOutlinedIcon /><h2>{hasFilters ? "No tutors match these filters" : "No verified tutors available yet"}</h2><p>We only publish tutors after identity, qualification, pricing, and service checks. No demo profiles are shown as real providers.</p><div className="tutors-empty-actions"><Link className="course-primary-btn" to="/services/education/courses?category=Exam%20Prep">Browse Exam Prep Courses</Link><Link className="course-secondary-btn" to="/services/education/teach">Become a Tutor</Link></div></section>
        )}
      </main>
    </AppLayout>
  );
};

export default TutorsPage;