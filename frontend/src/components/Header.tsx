import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import LoginIcon from "@mui/icons-material/Login";
import SearchIcon from "@mui/icons-material/Search";
import LanguageIcon from "@mui/icons-material/Language";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { useAuthContext } from "../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import LoginWithPiButton from "./LoginWithPiButton";
import logoImage from "/logo.png";

const navItems = [
  { to: "/white-paper", label: "White Paper" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/onboarding", label: "Apply to Join" },
  { to: "/contact", label: "Contact" },
];

const serviceMenuItems = [
  { to: "/services/store", label: "Commerce" },
  { to: "/services/jobs", label: "Jobs" },
  { to: "/services/health", label: "Health" },
  { to: "/services/education", label: "Education" },
  { to: "/services/transport", label: "Transport" },
  { to: "/services/stream", label: "Entertainment" },
  { to: "/services", label: "More Services \u2192" },
];

const publicSearchItems = [
  { label: "Services", to: "/services", keywords: ["services", "platform", "directory"] },
  { label: "Products Preview", to: "/services/store", keywords: ["product", "store", "commerce", "buy"] },
  { label: "Jobs Preview", to: "/services/jobs", keywords: ["jobs", "freelance", "apply"] },
  { label: "Courses", to: "/services/education", keywords: ["courses", "education", "learn"] },
  { label: "Health Services", to: "/services/health", keywords: ["health", "clinic", "care", "book"] },
  { label: "Events", to: "/services/events", keywords: ["events", "tickets"] },
  { label: "Help / FAQ", to: "/faq", keywords: ["help", "faq", "support"] },
  { label: "Apply to Join", to: "/onboarding", keywords: ["seller", "provider", "partner", "join", "apply"] },
  { label: "White Paper Topics", to: "/white-paper", keywords: ["white paper", "token", "roadmap", "ecosystem"] },
];

const rotatingSearchPhrases = [
  "Search jobs...",
  "Search products...",
  "Search transport...",
  "Search housing...",
  "Search Pi services...",
  "Search freelancers...",
  "Search healthcare...",
  "Search courses...",
  "Search events...",
  "Search sports...",
  "Search movies...",
  "Search charity...",
];

const trendingSearches = ["Jobs", "Phones", "Apartments", "Sports", "Food Delivery"];

const readRecentSearches = () => {
  try {
    const stored = window.localStorage.getItem("smaj_recent_searches");
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
};

const readPublicTheme = (): "light" | "dark" => window.localStorage.getItem("smaj_public_theme") === "dark" ? "dark" : "light";

const UtilityIcons = ({
  theme,
  language,
  onLanguageChange,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  language: string;
  onLanguageChange: (language: string) => void;
  onToggleTheme: () => void;
}) => (
  <div className="smaj-utility-icons" aria-label="Utility actions">
    <label className="smaj-language-picker" aria-label="Language and region">
      <LanguageIcon fontSize="small" />
      <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
        <option value="en">EN</option>
        <option value="fr">FR</option>
      </select>
    </label>
    <button type="button" className="smaj-utility-icon-btn" aria-label="Toggle display mode" onClick={onToggleTheme}>
      {theme === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
    </button>
  </div>
);

const Header = () => {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading } = useAuthContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isServicesMenuOpen, setIsServicesMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchPhraseIndex, setSearchPhraseIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecentSearches);
  const [mobileThemeMode, setMobileThemeMode] = useState<"light" | "dark">(readPublicTheme);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchPanelRef = useRef<HTMLDivElement | null>(null);
  const selectTheme = (theme: "light" | "dark") => {
    setMobileThemeMode(theme);
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("smaj_public_theme", theme);
  };
  const language = i18n.resolvedLanguage === "fr" ? "fr" : "en";
  const selectLanguage = (nextLanguage: string) => {
    void i18n.changeLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
  };
  useEffect(() => {
    document.documentElement.dataset.theme = mobileThemeMode;
  }, [mobileThemeMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsServicesMenuOpen(false);
      setIsSearchModalOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        setIsServicesMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSearchPhraseIndex((index) => (index + 1) % rotatingSearchPhrases.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isSearchModalOpen) {
      window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 120);
    }
  }, [isSearchModalOpen]);

  useEffect(() => {
    if (!isSearchModalOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSearchModalOpen(false);
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!searchPanelRef.current) {
        return;
      }
      const target = event.target as Node;
      if (!searchPanelRef.current.contains(target)) {
        setIsSearchModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [isSearchModalOpen]);

  const saveRecentSearch = (term: string) => {
    const normalized = term.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    const next = [normalized, ...recentSearches.filter((item) => item !== normalized)].slice(0, 3);
    setRecentSearches(next);
    try {
      window.localStorage.setItem("smaj_recent_searches", JSON.stringify(next));
    } catch {
      // ignore local storage errors
    }
  };

  const openSearchModal = () => {
    setSearchQuery("");
    setIsSearchModalOpen((open) => !open);
  };

  const closeSearchModal = () => {
    setIsSearchModalOpen(false);
  };

  const handleSearchSelect = (term: string, to?: string) => {
    saveRecentSearch(term);
    setIsSearchModalOpen(false);
    if (to) {
      navigate(to);
    }
  };

  const modalResults = publicSearchItems.filter((item) =>
    [item.label, ...item.keywords].join(" ").toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <header className="smaj-header">
      <div className="smaj-header-inner">
        <NavLink to="/home" className="smaj-logo-link" aria-label="SMAJ PI HUB Home">
          <img src={logoImage} alt="SMAJ PI HUB Logo" className="smaj-logo" />
        </NavLink>
        <button
          type="button"
          className="smaj-public-search-mobile-toggle"
          aria-label="Open search"
          onClick={openSearchModal}
        >
          <SearchIcon fontSize="small" />
        </button>
        <button
          type="button"
          className="smaj-menu-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          <span className="smaj-menu-toggle-icon" aria-hidden="true">
            {isMobileMenuOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
          </span>
        </button>
        <nav className={`smaj-nav ${isMobileMenuOpen ? "smaj-nav-open" : ""}`} aria-label="Primary">
          <button
            type="button"
            className="smaj-drawer-close"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span>Close</span>
            <CloseIcon fontSize="small" />
          </button>
          <NavLink to="/home">{t("nav.home")}</NavLink>
          <NavLink to="/about">{t("nav.about")}</NavLink>
          <div
            className={`smaj-services-menu ${isServicesMenuOpen ? "smaj-services-menu-open" : ""}`}
            onMouseEnter={() => setIsServicesMenuOpen(true)}
            onMouseLeave={() => setIsServicesMenuOpen(false)}
          >
            <button
              type="button"
              className="smaj-services-trigger"
              onClick={() => setIsServicesMenuOpen((open) => !open)}
              aria-expanded={isServicesMenuOpen}
              aria-label="Toggle services menu"
            >
              <span>{t("nav.services")}</span>
              {isServicesMenuOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
            </button>
            <div className="smaj-services-dropdown" role="menu" aria-label="Services categories">
              {serviceMenuItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => {
                    setIsServicesMenuOpen(false);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          {navItems.map((item, index) => (
            <NavLink key={item.to} to={item.to}>
              {t(["nav.whitePaper", "nav.howItWorks", "nav.join", "nav.contact"][index])}
            </NavLink>
          ))}
          <NavLink to="/download">Download App</NavLink>
          <div className="smaj-mobile-auth-sheet">
            <div className="smaj-mobile-pref-list" aria-label="Mobile preferences">
              <div className="smaj-mobile-pref-item">
                <div className="smaj-mobile-pref-label">
                  <LightModeOutlinedIcon fontSize="small" />
                  <span>Theme</span>
                </div>
                <div className="smaj-mobile-theme-switch" role="group" aria-label="Theme mode">
                  <button
                    type="button"
                    className={`smaj-mobile-theme-btn ${mobileThemeMode === "light" ? "active" : ""}`}
                    aria-label="Light mode"
                    onClick={() => selectTheme("light")}
                  >
                    <LightModeOutlinedIcon fontSize="small" />
                  </button>
                  <button
                    type="button"
                    className={`smaj-mobile-theme-btn ${mobileThemeMode === "dark" ? "active" : ""}`}
                    aria-label="Dark mode"
                    onClick={() => selectTheme("dark")}
                  >
                    <DarkModeOutlinedIcon fontSize="small" />
                  </button>
                </div>
              </div>
              <div className="smaj-mobile-pref-item">
                <div className="smaj-mobile-pref-label smaj-mobile-pref-lang-btn" aria-label="Language">
                  <LanguageIcon fontSize="small" />
                  <select
                    className="smaj-mobile-language-select"
                    value={language}
                    onChange={(event) => selectLanguage(event.target.value)}
                    aria-label={t("language.label")}
                  >
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
              </div>
            </div>
            {isAuthenticated ? (
              <NavLink to="/dashboard" className="smaj-login-btn" onClick={() => setIsMobileMenuOpen(false)}>{t("nav.dashboard")}</NavLink>
            ) : (
              <LoginWithPiButton className="smaj-login-btn">
                <span className="smaj-login-icon" aria-hidden="true">
                  <LoginIcon fontSize="small" />
                </span>
                <span className="smaj-login-text">{isLoading ? t("nav.signingIn") : t("nav.login")}</span>
              </LoginWithPiButton>
            )}
          </div>
        </nav>
        {isMobileMenuOpen ? (
          <button
            type="button"
            aria-label="Close navigation menu"
            className="smaj-nav-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        ) : null}
        <div className="smaj-auth-section">
          <button type="button" className="smaj-auth-search-btn" aria-label="Open search" onClick={openSearchModal}>
            <SearchIcon fontSize="small" />
          </button>
          {isAuthenticated ? (
            <NavLink to="/dashboard" className="smaj-login-btn">{t("nav.dashboard")}</NavLink>
          ) : (
            <>
              <LoginWithPiButton className="smaj-login-btn">
                <span className="smaj-login-icon" aria-hidden="true">
                  <LoginIcon fontSize="small" />
                </span>
                <span className="smaj-login-text">{isLoading ? t("nav.signingIn") : t("nav.login")}</span>
              </LoginWithPiButton>
              <UtilityIcons
                theme={mobileThemeMode}
                language={language}
                onLanguageChange={selectLanguage}
                onToggleTheme={() => selectTheme(mobileThemeMode === "dark" ? "light" : "dark")}
              />
            </>
          )}
        </div>
      </div>
      {isSearchModalOpen ? (
        <div className="smaj-search-panel-anchor">
          <div ref={searchPanelRef} className="smaj-public-search-mobile-card smaj-search-card-enter">
            <div className="smaj-public-search-mobile-form">
              <div className="smaj-public-search-input-wrap">
                <span className="smaj-public-search-inline-icon" aria-hidden="true">
                  <SearchIcon fontSize="small" />
                </span>
                <input
                  type="search"
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={rotatingSearchPhrases[searchPhraseIndex]}
                />
              </div>
              <button type="button" className="smaj-public-search-cancel" onClick={closeSearchModal}>
                Cancel
              </button>
            </div>
            <p className="smaj-public-search-mobile-popular-title">Trending</p>
            <div className="smaj-public-search-mobile-popular">
              {trendingSearches.map((trend) => (
                <button key={trend} type="button" onClick={() => setSearchQuery(trend.toLowerCase())}>
                  • {trend}
                </button>
              ))}
            </div>
            <p className="smaj-public-search-mobile-popular-title">Popular Services</p>
            <div className="smaj-public-search-mobile-popular">
              <button type="button" onClick={() => handleSearchSelect("SMAJ STORE", "/services/store")}>• SMAJ STORE</button>
              <button type="button" onClick={() => handleSearchSelect("SMAJ PI JOBS", "/services/jobs")}>• SMAJ PI JOBS</button>
              <button type="button" onClick={() => handleSearchSelect("SMAJ PI STREAM", "/services/stream")}>• SMAJ PI STREAM</button>
            </div>
            <p className="smaj-public-search-mobile-popular-title">Recent Searches</p>
            <div className="smaj-public-search-mobile-popular">
              {recentSearches.length ? recentSearches.map((recent) => (
                <button key={recent} type="button" onClick={() => setSearchQuery(recent)}>
                  • {recent}
                </button>
              )) : <p className="smaj-public-search-empty">No recent searches yet.</p>}
            </div>
            <p className="smaj-public-search-mobile-popular-title">Popular:</p>
            <div className="smaj-public-search-mobile-popular">
              {(searchQuery.trim() ? modalResults : publicSearchItems).slice(0, 6).map((item) => (
                <button key={item.label} type="button" onClick={() => handleSearchSelect(item.label, item.to)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default Header;
