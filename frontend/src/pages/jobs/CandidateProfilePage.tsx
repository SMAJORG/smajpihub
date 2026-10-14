import { downloadJobsCv } from "../../lib/jobsApi";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import { getCandidateProfile } from "../../lib/jobsApi";
import type { JobsCandidateSearchResult } from "../../lib/jobsApi";

const CandidateProfileContent = ({ candidateId, onBack }: { candidateId: string; onBack: () => void }) => {
  const [candidate, setCandidate] = useState<JobsCandidateSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getCandidateProfile(candidateId)
      .then((data) => { if (active) setCandidate(data); })
      .catch(() => { if (active) setError("Could not load candidate profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [candidateId]);

  if (loading) return <div className="jobs-candidate-profile-page">Loading...</div>;
  if (error) return <div className="jobs-candidate-profile-page error">{error}</div>;
  if (!candidate) return <div className="jobs-candidate-profile-page">Candidate not found.</div>;

  return (
    <div className="jobs-candidate-profile-page">
      <button type="button" className="jobs-candidate-profile-back" onClick={onBack} aria-label="Back to search results">
        <ArrowBackOutlinedIcon />
      </button>
      <header>
        <div className="jobs-candidate-profile-header">
          {candidate.avatar ? (
            <img src={candidate.avatar} alt={candidate.displayName} />
          ) : (
            <span className="jobs-candidate-profile-avatar">{candidate.displayName.slice(0, 2).toUpperCase()}</span>
          )}
          <div>
            <h1>{candidate.displayName}</h1>
            <p>{candidate.title || "Candidate"}</p>
            {candidate.location ? <small>{candidate.location}</small> : null}
          </div>
        </div>
        <div className="jobs-candidate-profile-actions">
          <button type="button" className="private-primary-button">Contact candidate</button>
          <button type="button" className="private-secondary-button">Save for later</button>
        </div>
      </header>

      <section className="jobs-candidate-profile-section">
        <h2>About</h2>
        <p>{candidate.summary || "No summary provided."}</p>
      </section>

      <section className="jobs-candidate-profile-section">
        <h2>Skills</h2>
        <div className="jobs-candidate-profile-skills">
          {candidate.skills.map((skill: string) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
      </section>

      <section className="jobs-candidate-profile-section">
        <h2>Experience</h2>
        {candidate.employment.length ? (
          <div className="jobs-candidate-profile-experience">
            {candidate.employment.map((job: JobsCandidateSearchResult["employment"][number]) => (
              <article key={job.id}>
                <h3>{job.position}</h3>
                <p>{job.employer} {job.current ? "· Current" : ""}</p>
                <small>{job.location} · {job.startMonth} {job.startYear}{job.endYear ? `–${job.endMonth} ${job.endYear}` : ""}</small>
                {job.description ? <p>{job.description}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p>No experience added yet.</p>
        )}
      </section>

      {candidate.cv ? (
        <section className="jobs-candidate-profile-section">
          <h2>Resume / CV</h2>
          <a href="#" onClick={event => { event.preventDefault(); void downloadJobsCv(candidate.userId, candidate.cv?.name).catch(() => undefined); }}>
            {candidate.cv.name} ({Math.round(candidate.cv.size / 1024)} KB)
          </a>
        </section>
      ) : null}
    </div>
  );
};

const CandidateProfilePage = () => {
  const { candidateId } = useParams();
  const navigate = useNavigate();

  if (!candidateId) return <div className="jobs-candidate-profile-page error">No candidate selected.</div>;

  return <CandidateProfileContent key={candidateId} candidateId={candidateId} onBack={() => navigate(-1)} />;
};

export default CandidateProfilePage;
