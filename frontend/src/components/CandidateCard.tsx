import { Link } from "react-router-dom";
import type { JobsCandidateSearchResult } from "../lib/jobsApi";

type CandidateCardProps = {
  candidate: JobsCandidateSearchResult;
};

const CandidateCard = ({ candidate }: CandidateCardProps) => (
  <article className="jobs-candidate-card">
    <Link to={`/services/jobs/candidates/${encodeURIComponent(candidate.userId)}`}>
      <div className="jobs-candidate-card-header">
        {candidate.avatar ? (
          <img src={candidate.avatar} alt={candidate.displayName} loading="lazy" />
        ) : (
          <span className="jobs-candidate-card-avatar">{candidate.displayName.slice(0, 2).toUpperCase()}</span>
        )}
        <div>
          <h3>{candidate.displayName}</h3>
          <p>{candidate.title || "Candidate"}</p>
        </div>
      </div>
      <div className="jobs-candidate-card-body">
        <div className="jobs-candidate-card-meta">
          {candidate.location ? <small>⌖ {candidate.location}</small> : null}
          {candidate.availability ? <small className="jobs-candidate-availability">{candidate.availability}</small> : null}
        </div>
        <div className="jobs-candidate-card-skills">
          {candidate.skills.slice(0, 3).map(skill => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
        {candidate.summary ? <p>{candidate.summary}</p> : null}
      </div>
      <footer>
        <span>View profile →</span>
        {candidate.cv ? <small>CV available</small> : null}
      </footer>
    </Link>
  </article>
);

export default CandidateCard;
