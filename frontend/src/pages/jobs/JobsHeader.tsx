import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

const candidateLinks = [
  ["activity", "Activity on profile"],
  ["activity?tab=actions", "Employer invites"],
  ["companies", "Companies"],
  ["my-earnings", "My Earnings"],
  ["settings", "Settings"],
] as const;

const employerLinks = [
  ["employer#jobs", "Manage jobs"],
  ["payments-billing", "Payments & Billing"],
] as const;

type WorkspaceMode = "candidate" | "employer";

const JobsHeader = ({
  query,
  onQueryChange,
  workspaceMode,
  onWorkspaceModeChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMenuOpen(false);
    const term = query.trim();
    navigate(`/services/jobs/search${term ? `?q=${encodeURIComponent(term)}` : ""}`);
  };

  return (
    <header className="jobs-header" ref={headerRef}>
      <Link to="/app/services" className="jobs-hub-link" onClick={() => setMenuOpen(false)}>
        ← Hub
      </Link>
      <NavLink end to="/services/jobs" className="jobs-brand" onClick={() => setMenuOpen(false)}>
        <img src="/assets/services/jobs.png" alt="" />
        <span>SMAJ Jobs</span>
      </NavLink>
      <nav className={menuOpen ? "open" : ""} aria-label="Jobs navigation">
        <div className="jobs-workspace-switch" aria-label="Choose Jobs workspace">
          <button
            className={workspaceMode === "candidate" ? "active" : ""}
            type="button"
            onClick={() => {
              onWorkspaceModeChange("candidate");
              setMenuOpen(false);
            }}
          >
            Find work
          </button>
          <button
            className={workspaceMode === "employer" ? "active" : ""}
            type="button"
            onClick={() => {
              onWorkspaceModeChange("employer");
              setMenuOpen(false);
            }}
          >
            Hire talent
          </button>
        </div>
        {(workspaceMode === "candidate" ? candidateLinks : employerLinks).map(([path, label]) => (
          <NavLink
            key={label}
            end={!path}
            to={`/services/jobs${path ? `/${path}` : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </NavLink>
        ))}
        {workspaceMode === "employer" ? (
          <NavLink className="jobs-mobile-post" to="/services/jobs/post" onClick={() => setMenuOpen(false)}>
            Post a job
          </NavLink>
        ) : null}
      </nav>
      <form className="jobs-header-search" role="search" onSubmit={submit}>
        <SearchRoundedIcon />
        <input
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder="Search jobs or skills"
          aria-label="Search SMAJ PI Jobs"
        />
      </form>
      <NavLink
        className="jobs-notification"
        to="/notifications"
        aria-label="Notifications"
        onClick={() => setMenuOpen(false)}
      >
        <NotificationsNoneRoundedIcon />
      </NavLink>
      {workspaceMode === "employer" ? (
        <NavLink className="jobs-post-button" to="/services/jobs/post" onClick={() => setMenuOpen(false)}>
          Post a job
        </NavLink>
      ) : null}
      <button
        className="jobs-menu-button"
        type="button"
        aria-label={menuOpen ? "Close Jobs menu" : "Open Jobs menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(value => !value)}
      >
        {menuOpen ? <CloseRoundedIcon /> : <MenuRoundedIcon />}
      </button>
      {menuOpen ? (
        <button
          className="jobs-menu-backdrop"
          type="button"
          aria-label="Close Jobs menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </header>
  );
};

export default JobsHeader;
