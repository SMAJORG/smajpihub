import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import CastConnectedRoundedIcon from "@mui/icons-material/CastConnectedRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import BookmarkBorderRoundedIcon from "@mui/icons-material/BookmarkBorderRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import SubscriptionsOutlinedIcon from "@mui/icons-material/SubscriptionsOutlined";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import VideoCallRoundedIcon from "@mui/icons-material/VideoCallRounded";
import FamilyRestroomRoundedIcon from "@mui/icons-material/FamilyRestroomRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import "./StreamHeader.css";

type StreamHeaderProps = {
  query?: string;
  onQueryChange?: (value: string) => void;
  showCategoryNav?: boolean;
};

const links = [
  ["Trending", "/app/services/stream"],
  ["Movies", "/app/services/stream/movies"],
  ["Series", "/app/services/stream/series"],
  ["TV Shows", "/app/services/stream/category/tv-channels"],
  ["Hollywood", "/app/services/stream/category/hollywood"],
  ["Bollywood", "/app/services/stream/category/bollywood"],
  ["Nollywood", "/app/services/stream/category/nollywood"],
  ["Kannywood", "/app/services/stream/category/kannywood"],
  ["Anime", "/app/services/stream/category/anime"],
  ["K-Drama", "/app/services/stream/category/k-drama"],
  ["Chinese Drama", "/app/services/stream/category/chinese-drama"],
  ["African Movies", "/app/services/stream/category/african-movies"],
  ["Documentaries", "/app/services/stream/category/documentaries"],
  ["Kids", "/app/services/stream/category/kids"],
  ["Action", "/app/services/stream/category/action"],
  ["Comedy", "/app/services/stream/category/comedy"],
  ["Romance", "/app/services/stream/category/romance"],
  ["Horror", "/app/services/stream/category/horror"],
  ["Sports", "/app/services/stream/category/sports"],
  ["Creators", "/app/services/stream/creators"],
] as const;

const StreamHeader = ({ showCategoryNav = true }: StreamHeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();

  useEffect(() => {
    // Route changes dismiss transient header layers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    setCastOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen && !castOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); setCastOpen(false); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [castOpen, menuOpen]);

  return (
    <>
      <header className="stream-global-header">
        <div className="stream-global-row">
          <Link className="stream-global-back" to="/app/services">
            &lt;- Hub
          </Link>
          <Link className="stream-global-title" to="/app/services/stream">
            Stream
          </Link>
          <button className="stream-global-cast-button" type="button" onClick={() => setCastOpen(true)} aria-label="Find casting devices">
            <CastConnectedRoundedIcon />
          </button>
          <button
            className="stream-global-menu-button"
            type="button"
            aria-label="Open Stream menu"
            aria-expanded={menuOpen}
            aria-controls="stream-side-menu"
            onClick={() => setMenuOpen(true)}
          >
            <MenuRoundedIcon />
          </button>
        </div>
        {showCategoryNav ? <nav ref={navRef} aria-label="SMAJ Stream categories">
          {links.map(([label, to]) => {
            const current = `${location.pathname}${location.search}`;
            const active = to === "/app/services/stream" ? location.pathname === to : current === to;
            return (
              <Link key={`${label}-${to}`} className={active ? "active" : ""} aria-current={active ? "page" : undefined} to={to}>
                {label}
              </Link>
            );
          })}
        </nav> : null}
      </header>
      {menuOpen ? (
        <div className="stream-menu-layer">
          <button className="stream-menu-overlay" type="button" onClick={() => setMenuOpen(false)} aria-label="Close Stream menu" />
          <aside id="stream-side-menu" className="stream-side-menu" aria-label="Stream account and creator menu">
            <header>
              <div>
                <span>
                  <PlayArrowRoundedIcon />
                </span>
                <b>SMAJ Stream</b>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <CloseRoundedIcon />
              </button>
            </header>
            <section>
              <b>YOUR STREAM</b>
              <Link to="/app/services/stream/my-list">
                <BookmarkBorderRoundedIcon /> My List
              </Link>
              <Link to="/app/services/stream/history">
                <HistoryRoundedIcon /> Watch History
              </Link>
            </section>
            <section className="stream-payment-menu-section">
              <b>PI PLANS &amp; PAYMENTS</b>
              <Link to="/app/services/stream/plans">
                <PaymentsRoundedIcon /> View Stream Plans
              </Link>
              <Link to="/app/services/stream/subscriptions">
                <SubscriptionsOutlinedIcon /> Manage Subscription
              </Link>
            </section>
            <section>
              <b>CREATOR</b>
              <Link to="/app/services/stream/creators">
                <VideoCallRoundedIcon /> Creators
              </Link>
              <Link to="/app/services/stream/studio">
                <VideoCallRoundedIcon /> Creator Dashboard
              </Link>
            </section>
            <section>
              <b>SETTINGS & HELP</b>
              <Link to="/app/services/stream/parental">
                <FamilyRestroomRoundedIcon /> Parental Controls
              </Link>
              <Link to="/app/help-center">
                <HelpOutlineRoundedIcon /> Help Center
              </Link>
            </section>
          </aside>
        </div>
      ) : null}
      {castOpen ? (
        <div
          className="stream-cast-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setCastOpen(false)}
        >
          <section className="stream-cast-sheet" role="dialog" aria-modal="true" aria-labelledby="stream-cast-title">
            <button className="stream-cast-close" type="button" onClick={() => setCastOpen(false)} aria-label="Close casting panel">
              <CloseRoundedIcon />
            </button>
            <CastConnectedRoundedIcon className="stream-cast-mark" />
            <h2 id="stream-cast-title">No Devices Found</h2>
            <p>
              Make sure your smart TV, streaming device, and mobile device are all on the same WiFi network. If you need help,
              please visit our Help Center.
            </p>
            <Link to="/app/help-center" onClick={() => setCastOpen(false)}>
              Need Help?
            </Link>
          </section>
        </div>
      ) : null}
    </>
  );
};

export default StreamHeader;
