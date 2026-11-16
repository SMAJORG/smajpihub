import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AppLayout from "../../layouts/AppLayout";
import { homeSectionDefaults } from "../../content/homeContentDefaults";
import { refreshSiteContent, useSiteContent, type ContentCard } from "../../lib/siteContent";
import { openChatUrl, safeChatUrl } from "../../lib/chatLinks";
import "./EventsPage.css";

export type EventsPageKind =
  | "home"
  | "search"
  | "saved"
  | "tickets"
  | "organizer"
  | "create"
  | "detail"
  | "checkout"
  | "ticket"
  | "venue";
const SAVED = "smaj_event_saved";
const readSaved = () => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED) || "[]");
    return new Set<string>(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
};
const registrationUrl = (event: ContentCard) =>
  event.registrationUrl?.startsWith("https://") ? safeChatUrl(event.registrationUrl) : null;
const validEvent = (event: ContentCard) =>
  registrationUrl(event) &&
  Number.isFinite(Date.parse(event.startsAt || "")) &&
  Date.parse(event.endsAt || "") > Date.parse(event.startsAt || "");
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
const Dates = ({ event }: { event: ContentCard }) => (
  <p className="event-dates">
    <CalendarMonthOutlinedIcon />
    <span>
      <time dateTime={event.startsAt}>{formatDate(event.startsAt!)}</time> –{" "}
      <time dateTime={event.endsAt}>{formatDate(event.endsAt!)}</time> UTC
    </span>
  </p>
);

function Register({ event, ended }: { event: ContentCard; ended: boolean }) {
  const url = registrationUrl(event);
  if (ended) return <p className="events-empty">This event has ended. Registration is closed.</p>;
  if (!url) return null;
  return (
    <a
      className="event-register"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Register for ${event.title} on the organizer website`}
      onClick={e => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const opened = openChatUrl(url);
        if (opened) {
          e.preventDefault();
          void opened.catch(() => window.location.assign(url));
        }
      }}
    >
      Register ↗
    </a>
  );
}
const Header = () => (
  <header className="events-header">
    <Link to="/app/services">← Hub</Link>
    <Link className="events-brand" to="/services/events">
      Events
    </Link>
    <nav>
      <NavLink end to="/services/events">
        Discover
      </NavLink>
      <NavLink to="/services/events/search">Browse</NavLink>
      <NavLink to="/services/events/saved">Saved</NavLink>
      <NavLink to="/services/events/tickets">Registration help</NavLink>
    </nav>
    <details
      className="events-menu"
      onKeyDown={e => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Open SMAJ Events menu">
        <MenuRoundedIcon />
      </summary>
      <nav aria-label="SMAJ Events navigation">
        {[
          { label: "Discover", to: "/services/events" },
          { label: "Browse events", to: "/services/events/search" },
          { label: "Saved", to: "/services/events/saved" },
          { label: "Registration help", to: "/services/events/tickets" },
        ].map(item => (
          <Link
            key={item.to}
            to={item.to}
            onClick={e => {
              const menu = e.currentTarget.closest("details");
              if (menu) menu.open = false;
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </details>
  </header>
);
function Card({ event, saved, onSave, now }: { event: ContentCard; saved: boolean; onSave: () => void; now: number }) {
  return (
    <article className="event-card">
      <Link to={`/services/events/event/${event.id}`}>
        {event.image ? <img src={event.image} alt="" /> : null}
        <div>
          {event.badge ? <small className="event-price">{event.badge}</small> : null}
          <h2>{event.title}</h2>
          <Dates event={event} />
          <p>{event.text.split("\n")[0]}</p>
          <span className="event-info-link">View event information →</span>
        </div>
      </Link>
      <button
        className={saved ? "saved" : ""}
        aria-label={`${saved ? "Unsave" : "Save"} ${event.title}`}
        aria-pressed={saved}
        onClick={onSave}
      >
        <BookmarkBorderOutlinedIcon />
      </button>
      <div className="event-card-registration">
        <Register event={event} ended={Date.parse(event.endsAt!) <= now} />
      </div>
    </article>
  );
}
const EventsPage = ({ kind = "home" }: { kind?: EventsPageKind }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { sections } = useSiteContent();
  const [query, setQuery] = useState(params.get("q") || "");
  const [category, setCategory] = useState("All");
  const [saved, setSaved] = useState(readSaved);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    void refreshSiteContent().catch(() => undefined);
  }, []);
  useEffect(() => {
    setQuery(params.get("q") || "");
  }, [params]);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const section =
    sections.find(item => item.id === "events") || homeSectionDefaults.find(item => item.id === "events")!;
  const events = section.cards.filter(validEvent);
  const event = events.find(item => item.id === id);
  const upcoming = events
    .filter(item => Date.parse(item.endsAt!) > now)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  const visible = upcoming.filter(
    item =>
      (kind !== "saved" || saved.has(item.id)) &&
      (category !== "Free" || item.badge.trim().toLowerCase() === "free") &&
      (category !== "Online" || /online|livestream|virtual/i.test(item.text)) &&
      `${item.title} ${item.text}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const toggleSaved = (eventId: string) =>
    setSaved(current => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      localStorage.setItem(SAVED, JSON.stringify([...next]));
      return next;
    });
  let content;
  if (kind === "detail" || kind === "checkout") {
    content = (
      <section className="event-detail">
        <Link to="/services/events">← Back to events</Link>
        {event ? (
          <>
            <div className="event-detail-hero">
              {event.image ? <img src={event.image} alt="" /> : null}
              <div>
                {event.badge ? <small className="event-price">{event.badge}</small> : null}
                <h1>{event.title}</h1>
                <Dates event={event} />
                <p className="event-description">{event.text}</p>
              </div>
            </div>
            <div className="event-detail-grid">
              <article>
                <h2>Event information</h2>
                <p>
                  Dates and times above are shown in UTC. Check the organizer’s website for the latest schedule and
                  attendance requirements.
                </p>
                <a href={registrationUrl(event)!} target="_blank" rel="noopener noreferrer">
                  Official event website ↗
                </a>
              </article>
              <aside>
                <h2>Register with the organizer</h2>
                <p>Registration and attendance confirmation are handled on the official event website.</p>
                <Register event={event} ended={Date.parse(event.endsAt!) <= now} />
              </aside>
            </div>
          </>
        ) : (
          <div className="events-empty">
            <h1>Event unavailable</h1>
            <p>This event is not currently listed. Browse upcoming events for available registration.</p>
          </div>
        )}
      </section>
    );
  } else if (kind === "tickets" || kind === "ticket") {
    content = (
      <section className="events-inner">
        <h1>Registration and tickets</h1>
        <div className="events-empty">
          <p>
            Register through the official website shown on each event. The organizer provides your confirmation, joining
            instructions and any tickets.
          </p>
          <p>
            SMAJ does not issue tickets for these external events. Previous browser-only demo tickets are not valid
            registrations.
          </p>
          <Link to="/services/events">Browse upcoming events</Link>
        </div>
      </section>
    );
  } else if (kind === "create" || (kind === "organizer" && !id)) {
    content = (
      <section className="events-inner">
        <h1>Event publishing</h1>
        <div className="events-empty">
          <p>
            The events directory contains administrator-managed listings with official registration websites. Local demo
            drafts are not published events.
          </p>
          <Link to="/services/events">Browse upcoming events</Link>
        </div>
      </section>
    );
  } else {
    content = (
      <>
        <section className={kind === "home" ? "events-hero" : "events-search-hero"}>
          <div>
            <small>REAL EVENTS. OFFICIAL REGISTRATION.</small>
            <h1>
              {kind === "home"
                ? "Find your next unforgettable moment."
                : kind === "saved"
                  ? "Your saved events."
                  : "Discover upcoming events."}
            </h1>
            <p>Explore event details and register directly with the organizer.</p>
            <form
              onSubmit={e => {
                e.preventDefault();
                navigate(`/services/events/search?q=${encodeURIComponent(query)}`);
              }}
            >
              <SearchOutlinedIcon />
              <input
                aria-label="Search events"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Event, topic, or organizer"
              />
              <button>Search events</button>
            </form>
          </div>
        </section>
        <section className="events-inner">
          <div className="event-categories">
            {["All", "Free", "Online"].map(item => (
              <button
                className={category === item ? "active" : ""}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="events-heading">
            <div>
              <small>UPCOMING EVENTS</small>
              <h1>{kind === "saved" ? "Saved events" : "Upcoming experiences"}</h1>
            </div>
            <span>{visible.length} events</span>
          </div>
          {visible.length ? (
            <div className="events-grid">
              {visible.map(item => (
                <Card
                  key={item.id}
                  event={item}
                  saved={saved.has(item.id)}
                  onSave={() => toggleSaved(item.id)}
                  now={now}
                />
              ))}
            </div>
          ) : (
            <div className="events-empty">No upcoming events match your selection.</div>
          )}
        </section>
      </>
    );
  }
  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="events-page">
        <Header />
        {content}
        <nav className="events-mobile-nav">
          <NavLink end to="/services/events">
            Discover
          </NavLink>
          <NavLink to="/services/events/search">Browse</NavLink>
          <NavLink to="/services/events/saved">Saved</NavLink>
          <NavLink to="/services/events/tickets">Registration</NavLink>
        </nav>
      </main>
    </AppLayout>
  );
};
export default EventsPage;
