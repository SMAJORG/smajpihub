import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import LiveTvOutlinedIcon from "@mui/icons-material/LiveTvOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { useAuthContext } from "../contexts/AuthContext";
import { axiosClient } from "../lib/axiosClient";
import ConfirmSignOutModal from "../components/ConfirmSignOutModal";
import WelcomeTour from "../components/WelcomeTour";
import logoImage from "/logo.png";
import { serviceAppPath, serviceCatalog } from "../content/serviceCatalog";
import useRouteScrollTop from "../hooks/useRouteScrollTop";
import CommunityFollowPrompt from "../components/CommunityFollowPrompt";
import { getStreamDownloads, STREAM_DOWNLOADS_CHANGED_EVENT } from "../lib/streamCatalog";

type PrivateLayoutProps = { children: ReactNode; fullScreen?: boolean };
type LiveConversation = {
  _id: string;
  participantName?: string;
  sellerName?: string;
  buyerName?: string;
  sellerId?: string;
  lastMessage?: string;
  productTitle?: string;
  unreadBy?: string[];
};
const SIDEBAR_STORAGE_KEY = "smaj_private_sidebar_collapsed";
const LAST_PRIVATE_ROUTE_KEY = "smaj_last_private_route";
const PROFILE_VERIFY_REMINDER_KEY = "smaj_profile_verify_reminder_completed";
const PROFILE_VERIFY_REMINDER_INTERVAL_MS = 60 * 1000;
const PROFILE_VERIFY_REMINDER_VISIBLE_MS = 10 * 1000;
const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/store": "Store",
  "/add-product": "Add Product",
  "/orders": "Orders",
  "/seller": "Seller Dashboard",
  "/profile": "Profile",
  "/settings": "Settings",
  "/settings/devices": "Devices & Sessions",
  "/search": "Search",
  "/messages": "Messages",
  "/notifications": "Notifications",
  "/saved": "Saved Products",
  "/app/services": "Services",
  "/trending": "Trending",
  "/lifestyle": "Lifestyle",
  "/categories": "Categories",
  "/app/help-center": "Help Center",
  "/app/tutorials": "App Guide",
  "/app/wallet": "SMAJ PI Activity",
};

const links = [
  { to: "/dashboard", label: "Home", icon: <DashboardOutlinedIcon /> },
  { to: "/app/services", label: "Services", icon: <AppsOutlinedIcon /> },
  { to: "/store", label: "Marketplace", icon: <StorefrontOutlinedIcon /> },
  { to: "/messages", label: "Messages", icon: <ChatOutlinedIcon /> },
];

const mainTabs = [
  { to: "/dashboard", label: "Home", icon: <DashboardOutlinedIcon /> },
  { to: "/app/services", label: "Services", icon: <AppsOutlinedIcon /> },
  { to: "/search", label: "Search", icon: <SearchOutlinedIcon /> },
  { to: "/messages", label: "Messages", icon: <ChatOutlinedIcon /> },
  { to: "/settings", label: "You", icon: <PersonOutlineIcon /> },
];

const backFallbackForPath = (pathname: string) => {
  if (pathname.startsWith("/product/")) return "/store";
  if (pathname.startsWith("/edit-product/")) return "/seller";
  if (pathname.startsWith("/orders/") && pathname.endsWith("/track")) return "/orders";
  if (pathname.startsWith("/seller/")) return "/store";
  if (pathname === "/add-product") return "/seller";
  if (pathname === "/cart" || pathname === "/checkout" || pathname === "/payment-method") return "/store";
  if (pathname === "/profile" || pathname === "/app/wallet" || pathname === "/settings/preferences") return "/settings";
  if (pathname === "/saved" || pathname === "/orders" || pathname === "/seller") return "/settings";
  if (pathname === "/notifications" || pathname === "/app/help-center" || pathname === "/app/tutorials" || pathname === "/help") return "/dashboard";
  if (pathname === "/trending" || pathname === "/lifestyle" || pathname === "/categories") return "/dashboard";
  return "";
};

const readLastPrivateRoute = () => {
  try {
    return window.sessionStorage.getItem(LAST_PRIVATE_ROUTE_KEY)
      || window.localStorage.getItem(LAST_PRIVATE_ROUTE_KEY)
      || "";
  } catch {
    return "";
  }
};

const isRestorablePrivateRoute = (route: string) => {
  if (!route.startsWith("/") || route.startsWith("//")) return false;

  try {
    const { pathname } = new URL(route, window.location.origin);
    return [
      "/dashboard", "/store", "/add-product", "/orders", "/seller", "/profile", "/settings",
      "/search", "/messages", "/notifications", "/saved", "/cart", "/checkout", "/payment-method",
      "/trending", "/lifestyle", "/categories", "/help", "/seller-agreement", "/app/services",
      "/app/help-center", "/app/wallet",
    ].some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`))
      || pathname.startsWith("/product/")
      || pathname.startsWith("/edit-product/");
  } catch {
    return false;
  }
};

const wasBrowserReload = () => {
  const navigation = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type === "reload";
};

const PrivateLayout = ({ children, fullScreen }: PrivateLayoutProps) => {
  useRouteScrollTop();
  const { signOut, isLoading, user, updateSettings } = useAuthContext();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  const [unreadCount, setUnreadCount] = useState(0);
  const [streamDownloadCount, setStreamDownloadCount] = useState(0);
  const [liveFeedOpen, setLiveFeedOpen] = useState(false);
  const [liveConversations, setLiveConversations] = useState<LiveConversation[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => window.localStorage.getItem("smaj_private_theme_mode") === "dark" ? "dark" : "light");
  const [showSignOut, setShowSignOut] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showProfileReminder, setShowProfileReminder] = useState(false);
  const profileAvatarRef = useRef<HTMLButtonElement | null>(null);
  const [profileMenuPosition, setProfileMenuPosition] = useState<{ top: number; left: number }>({ top: 64, left: 16 });
  const notificationBadgeLabel = unreadCount > 99 ? "99+" : unreadCount;
  const navigate = useNavigate();
  const location = useLocation();
  const [restoreDestination, setRestoreDestination] = useState(() => {
    const savedRoute = readLastPrivateRoute();
    return location.pathname === "/dashboard" && wasBrowserReload() && isRestorablePrivateRoute(savedRoute) && savedRoute !== "/dashboard"
      ? savedRoute
      : "";
  });
  const isStoreShell = location.pathname === "/store";
  const isHeaderHiddenPage = location.pathname === "/app/services" || location.pathname === "/search" || location.pathname === "/messages";
  const dashboardTab = new URLSearchParams(location.search).get("tab");
  const isDashboardDiscovery = location.pathname === "/dashboard" && ["trending", "lifestyle", "categories"].includes(dashboardTab || "");
  const backFallback = backFallbackForPath(location.pathname);
  const profileReminderStorageKey = user?.uid ? `${PROFILE_VERIFY_REMINDER_KEY}:${user.uid}` : PROFILE_VERIFY_REMINDER_KEY;
  const profileReadyForVerification = Boolean(user?.displayName?.trim() && (user?.piUsername || user?.username) && user?.country?.trim() && user?.contactPhone?.trim() && user?.avatar && user?.bio?.trim());
  const hasPublicVerification = user?.verificationStatus === "approved" && user?.verificationLevel !== "basic";
  const needsProfileVerificationReminder = Boolean(user?.uid && !hasPublicVerification && !profileReadyForVerification);
  const pageTitle = location.pathname.startsWith("/product/") ? "Product Details"
    : location.pathname.startsWith("/app/services/") ? "Service"
    : location.pathname.startsWith("/edit-product/") ? "Edit Product"
      : pageTitles[location.pathname] || "SMAJ PI HUB";

  useEffect(() => {
    const route = `${location.pathname}${location.search}${location.hash}`;
    if (restoreDestination) {
      if (route !== restoreDestination) {
        navigate(restoreDestination, { replace: true });
        return;
      }
      setRestoreDestination("");
      return;
    }
    try {
      window.sessionStorage.setItem(LAST_PRIVATE_ROUTE_KEY, route);
      window.localStorage.setItem(LAST_PRIVATE_ROUTE_KEY, route);
    } catch {
      // Ignore storage failures in constrained browsers.
    }
    if (location.pathname === "/dashboard") return;
    try {
      const current = JSON.parse(window.localStorage.getItem("smaj_recent_pages") || "[]");
      const items = Array.isArray(current) ? current : [];
      const next = [{ label: pageTitle, to: `${location.pathname}${location.search}`, meta: "Recent page" }, ...items.filter((item) => item?.to !== `${location.pathname}${location.search}`)].slice(0, 8);
      window.localStorage.setItem("smaj_recent_pages", JSON.stringify(next));
    } catch {
      window.localStorage.removeItem("smaj_recent_pages");
    }
  }, [location.hash, location.pathname, location.search, navigate, pageTitle, restoreDestination]);

  useEffect(() => {
    document.documentElement.dataset.privateTheme = themeMode;
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("smaj_private_theme_mode", themeMode);
    window.localStorage.setItem("smaj_public_theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const theme = (event as CustomEvent<"light" | "dark">).detail;
      if (theme === "light" || theme === "dark") setThemeMode(theme);
    };
    window.addEventListener("smaj:theme-change", onThemeChange);
    return () => window.removeEventListener("smaj:theme-change", onThemeChange);
  }, []);

  const loadUnreadCount = useCallback(() => {
    axiosClient.get("/notifications").then(({ data }) => setUnreadCount(data.unreadCount || 0)).catch(() => undefined);
  }, []);

  const loadLiveConversations = useCallback(() => {
    axiosClient.get<{ conversations?: LiveConversation[] }>("/messages")
      .then(({ data }) => setLiveConversations(data.conversations || []))
      .catch(() => setLiveConversations([]));
  }, []);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount, location.pathname]);

  useEffect(() => {
    let resumeTimer = 0;
    const onRefresh = () => {
      if (!document.hidden) loadUnreadCount();
    };
    const onVisibilityChange = () => {
      window.clearTimeout(resumeTimer);
      if (!document.hidden) resumeTimer = window.setTimeout(loadUnreadCount, 300);
    };
    const timer = window.setInterval(onRefresh, 15000);
    window.addEventListener("smaj:notifications-refresh", onRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(resumeTimer);
      window.removeEventListener("smaj:notifications-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    loadLiveConversations();
    let resumeTimer = 0;
    const refreshWhenVisible = () => {
      if (!document.hidden) loadLiveConversations();
    };
    const onVisibilityChange = () => {
      window.clearTimeout(resumeTimer);
      if (!document.hidden) resumeTimer = window.setTimeout(loadLiveConversations, 900);
    };
    const timer = window.setInterval(refreshWhenVisible, 15000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadLiveConversations]);
  useEffect(() => { document.body.style.overflow = mobileSidebarOpen ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [mobileSidebarOpen]);
  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const logout = async () => {
    await signOut();
    setShowSignOut(false);
    navigate("/home", { replace: true });
  };

  const toggleTheme = async () => {
    const settings = user?.settings || { theme: "light" as const, language: "English", notifications: true };
    const next = themeMode === "light" ? "dark" : "light";
    setThemeMode(next);
    await updateSettings({ ...settings, theme: next }).catch(() => undefined);
  };
  const themeIcon = themeMode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />;
  const headerResults = useMemo(() => { const query = headerSearch.trim().toLowerCase(); if (!query) return []; const services = serviceCatalog.filter((item) => [item.name, item.experience, item.description, ...item.items].join(" ").toLowerCase().includes(query)).map((item) => ({ group: "Services", label: item.name, to: item.live ? serviceAppPath(item.slug) : `/app/services/${item.slug}` })); const pages = [{ group: "Account", label: "Profile", to: "/profile" }, { group: "Account", label: "Wallet", to: "/wallet" }, { group: "Account", label: "Settings", to: "/settings" }, { group: "Support", label: "Help Center", to: "/help" }, { group: "Marketplace", label: "Products and sellers", to: `/store?search=${encodeURIComponent(query)}` }].filter((item) => item.label.toLowerCase().includes(query) || ["products", "stores", "sellers", "help", "settings"].some((term) => query.includes(term))); return [...services, ...pages].slice(0, 10); }, [headerSearch]);
  const submitHeaderSearch = (event: FormEvent) => { event.preventDefault(); if (headerResults[0]) { navigate(headerResults[0].to); setSearchOpen(false); setHeaderSearch(""); } else if (headerSearch.trim()) { const target = `/store?search=${encodeURIComponent(headerSearch.trim())}`; navigate(target); } };
  const positionProfileMenu = () => {
    const avatar = profileAvatarRef.current;
    if (!avatar) return;
    const rect = avatar.getBoundingClientRect();
    const width = 220;
    const gutter = 16;
    const top = Math.max(gutter, Math.min(window.innerHeight - gutter, rect.bottom + 10));
    const preferredLeft = rect.right - width;
    const maxLeft = window.innerWidth - width - gutter;
    const left = Math.max(gutter, Math.min(maxLeft, preferredLeft));
    setProfileMenuPosition({ top, left });
  };

  useEffect(() => {
    if (!profileMenuOpen) return;
    positionProfileMenu();
    window.addEventListener("resize", positionProfileMenu);
    window.addEventListener("scroll", positionProfileMenu, true);
    return () => {
      window.removeEventListener("resize", positionProfileMenu);
      window.removeEventListener("scroll", positionProfileMenu, true);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    setShowProfileReminder(false);
    if (!needsProfileVerificationReminder || location.pathname === "/profile") return undefined;
    if (window.localStorage.getItem(profileReminderStorageKey) === "true") return undefined;

    let hideTimer: number | null = null;
    const openReminder = () => {
      if (window.localStorage.getItem(profileReminderStorageKey) === "true") return;
      setShowProfileReminder(true);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setShowProfileReminder(false), PROFILE_VERIFY_REMINDER_VISIBLE_MS);
    };

    const startTimer = window.setTimeout(openReminder, 800);
    const repeatTimer = window.setInterval(openReminder, PROFILE_VERIFY_REMINDER_INTERVAL_MS);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(repeatTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, [location.pathname, needsProfileVerificationReminder, profileReminderStorageKey]);

  const completeProfileFromReminder = () => {
    window.localStorage.setItem(profileReminderStorageKey, "true");
    setShowProfileReminder(false);
    navigate("/profile?edit=1");
  };
  const unreadLiveConversations = liveConversations.filter((conversation) => Boolean(user?.uid && conversation.unreadBy?.includes(user.uid)));
  const isStreamShell = location.pathname.startsWith("/app/services/stream");
  const isStreamImmersive = location.pathname === "/app/services/stream/search" || /^\/app\/services\/stream\/(?:title|series|watch|live)\/[^/]+$/.test(location.pathname);
  const streamDownloadBadgeLabel = streamDownloadCount > 99 ? "99+" : streamDownloadCount;
  useEffect(() => {
    if (!isStreamShell) return;
    let active = true;
    const loadDownloadCount = () => {
      void getStreamDownloads()
        .then((items) => {
          if (active) setStreamDownloadCount(items.length);
        })
        .catch(() => {
          if (active) setStreamDownloadCount(0);
        });
    };
    loadDownloadCount();
    window.addEventListener(STREAM_DOWNLOADS_CHANGED_EVENT, loadDownloadCount);
    return () => {
      active = false;
      window.removeEventListener(STREAM_DOWNLOADS_CHANGED_EVENT, loadDownloadCount);
    };
  }, [isStreamShell]);
  const liveMessageCount = unreadLiveConversations.length;
  const liveBadgeLabel = liveMessageCount > 99 ? "99+" : liveMessageCount;
  const liveActivityItems = (unreadLiveConversations.length ? unreadLiveConversations : liveConversations).slice(0, 3);
  const liveConversationName = (conversation: LiveConversation) => conversation.participantName || (conversation.sellerId === user?.uid ? conversation.buyerName : conversation.sellerName) || "SMAJ user";
  const openLiveConversation = (conversationId: string) => {
    setLiveFeedOpen(false);
    navigate(`/messages?conversation=${encodeURIComponent(conversationId)}`);
  };

  return (
    <div className={`private-shell ${isStoreShell ? "store-private-shell" : ""} ${isStreamShell ? "stream-private-shell" : ""} ${isStreamImmersive ? "stream-title-immersive-shell" : ""} ${location.pathname === "/dashboard" ? "mobile-home-shell" : ""} ${isDashboardDiscovery ? "mobile-discovery-shell" : ""} ${location.pathname === "/categories" ? "mobile-category-shell" : ""} ${isHeaderHiddenPage ? "hide-mobile-header" : ""} ${fullScreen ? "full-screen-page" : ""}`}>
      {fullScreen ? null : (
        <header className="private-header">
          <div className="mobile-private-header-content">
            <Link to="/dashboard" className="mobile-private-brand" aria-label="SMAJ PI HUB Home"><img src={logoImage} alt="SMAJ PI HUB" /></Link>
            <span className="environment-badge mobile-environment-badge" aria-label="Testnet beta environment">Beta</span>
            <div className="mobile-private-header-actions">
              <Link className="mobile-private-icon notification-icon" to="/notifications" aria-label="Notifications"><NotificationsNoneOutlinedIcon />{unreadCount ? <span>{notificationBadgeLabel}</span> : null}</Link>
              <button className="mobile-private-icon" type="button" onClick={() => void toggleTheme()} aria-label="Toggle theme" title="Toggle light or dark mode">
                {themeIcon}
              </button>
            </div>
          </div>
          <button className="private-menu-toggle" type="button" onClick={() => setMobileSidebarOpen((open) => !open)} aria-label={mobileSidebarOpen ? "Close sidebar" : "Open sidebar"}>
            {mobileSidebarOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <Link to="/dashboard" className="private-header-brand" aria-label="SMAJ PI HUB Home"><img src={logoImage} alt="" /></Link>
          <span className="environment-badge" aria-label="Testnet beta environment">Testnet / Beta</span>
          <form className="private-global-search" data-tour="search" onSubmit={submitHeaderSearch}><SearchOutlinedIcon /><input value={headerSearch} onFocus={() => setSearchOpen(true)} onChange={(event) => { setHeaderSearch(event.target.value); setSearchOpen(true); }} placeholder="Search SMAJ PI HUB..." />{searchOpen && headerSearch.trim() ? <div className="private-search-results">{headerResults.length ? Object.entries(headerResults.reduce<Record<string, typeof headerResults>>((groups, item) => { (groups[item.group] ||= []).push(item); return groups; }, {})).map(([group, items]) => <section key={group}><strong>{group}</strong>{items.map((item) => <button type="button" key={`${group}-${item.label}`} onClick={() => { navigate(item.to); setHeaderSearch(""); setSearchOpen(false); }}>{item.label}</button>)}</section>) : <button type="submit">Search Marketplace for “{headerSearch}”</button>}</div> : null}</form>
          <div className="private-header-title"><span>Workspace</span><strong>{pageTitle}</strong></div>
          <div className="private-header-actions">
            <Link className="private-header-icon notification-icon" to="/notifications" aria-label="Notifications" title="Notifications"><NotificationsNoneOutlinedIcon />{unreadCount ? <span>{notificationBadgeLabel}</span> : null}</Link>
            <button className="private-header-icon" type="button" onClick={() => void toggleTheme()} aria-label="Toggle theme" title="Toggle light or dark mode">
              {themeIcon}
            </button>
            <div className="private-header-profile">
              {profileMenuOpen ? <div className="private-profile-menu private-header-profile-menu" style={profileMenuPosition}><Link to="/settings" onClick={() => setProfileMenuOpen(false)}><PersonOutlineIcon />Account</Link><Link to="/app/wallet" onClick={() => setProfileMenuOpen(false)}><AccountBalanceWalletOutlinedIcon />Wallet</Link><Link to="/settings/preferences" onClick={() => setProfileMenuOpen(false)}><SettingsOutlinedIcon />Settings</Link><Link to="/app/help-center" onClick={() => setProfileMenuOpen(false)}><HelpOutlineOutlinedIcon />Help Center</Link><button type="button" className="profile-menu-logout" onClick={() => { setProfileMenuOpen(false); setShowSignOut(true); }}><LogoutIcon />Logout</button></div> : null}
              <button ref={profileAvatarRef} data-tour="you" type="button" className="private-header-avatar" title="Account" aria-label="Open account menu" aria-expanded={profileMenuOpen} onClick={() => { positionProfileMenu(); setProfileMenuOpen((open) => !open); }}>{user?.avatar ? <img src={user.avatar} alt="" /> : (user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}</button>
            </div>
          </div>
        </header>
      )}
      <div className={`private-body ${sidebarCollapsed ? "private-body-collapsed" : ""}`}>
        {fullScreen ? null : (
          <aside className={`private-sidebar ${sidebarCollapsed ? "private-sidebar-collapsed" : ""} ${mobileSidebarOpen ? "private-sidebar-open" : ""}`}>
            <div className="private-sidebar-top">
              <Link to="/dashboard" className="private-sidebar-brand" title="SMAJ PI HUB"><img src={logoImage} alt="" /></Link>
              <button className="private-sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                {sidebarCollapsed ? <KeyboardDoubleArrowRightIcon /> : <KeyboardDoubleArrowLeftIcon />}
              </button>
            </div>
            <nav aria-label="Private navigation">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} data-tour={link.label.toLowerCase()} onClick={() => setMobileSidebarOpen(false)} title={sidebarCollapsed ? link.label : undefined} aria-label={link.label}>
                  {link.icon}
                  <span className="private-nav-label">{link.label}</span>
                  {link.to === "/notifications" && unreadCount ? <b className="sidebar-count">{notificationBadgeLabel}</b> : null}
                </NavLink>
              ))}
            </nav>
            <section className="private-service-menu">
              <button type="button" onClick={() => setServiceMenuOpen(open => !open)} aria-expanded={serviceMenuOpen} title={sidebarCollapsed ? "All service apps" : undefined}>
                <GridViewOutlinedIcon />
                <span className="private-nav-label">All service apps</span>
                <KeyboardArrowUpIcon className={serviceMenuOpen ? "open" : ""} />
              </button>
              {serviceMenuOpen && !sidebarCollapsed ? <div>{serviceCatalog.map(service => (
                <Link key={service.slug} to={service.live ? serviceAppPath(service.slug) : `/app/services/${service.slug}`} onClick={() => setMobileSidebarOpen(false)}>
                  <span>{service.name.replace("SMAJ ", "")}</span><small>{service.live ? "Open" : "Soon"}</small>
                </Link>
              ))}</div> : null}
            </section>
            <div className="private-sidebar-account">
              {profileMenuOpen ? <div className="private-profile-menu"><Link to="/settings" onClick={() => setProfileMenuOpen(false)}><PersonOutlineIcon />Account</Link><Link to="/app/wallet" onClick={() => setProfileMenuOpen(false)}><AccountBalanceWalletOutlinedIcon />Wallet</Link><Link to="/settings/preferences" onClick={() => setProfileMenuOpen(false)}><SettingsOutlinedIcon />Settings</Link><Link to="/app/help-center" onClick={() => setProfileMenuOpen(false)}><HelpOutlineOutlinedIcon />Help Center</Link><button type="button" className="profile-menu-logout" onClick={() => { setProfileMenuOpen(false); setShowSignOut(true); }}><LogoutIcon />Logout</button></div> : null}
              <button type="button" className="private-sidebar-profile" onClick={() => setProfileMenuOpen((open) => !open)} aria-expanded={profileMenuOpen} title={sidebarCollapsed ? (user?.displayName || user?.username) : undefined}>
                <span className="private-profile-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : (user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}</span><span className="private-profile-copy"><strong>{user?.displayName || user?.username}</strong><small>{user?.role || "buyer"} account</small></span><KeyboardArrowUpIcon className="private-profile-chevron" />
              </button>
            </div>
          </aside>
        )}
        {mobileSidebarOpen && !fullScreen ? <button className="private-overlay" onClick={() => setMobileSidebarOpen(false)} aria-label="Close menu" /> : null}
        <div className="private-content">
          {backFallback ? (
            <button
              className="private-route-back"
              type="button"
              onClick={() => {
                navigate(backFallback, { replace: true });
              }}
            >
              <ArrowBackIosNewOutlinedIcon />
              <span>Back</span>
            </button>
          ) : null}
          <div className={`private-tab-page${fullScreen ? " full-screen-tab-page" : ""}`}>
            {children}
          </div>
        </div>
      </div>
      {!fullScreen && !isStreamImmersive ? <nav className="mobile-bottom-nav" aria-label="Mobile private navigation">
        {(isStreamShell ? [
          { to: "/app/services/stream", label: "Home", icon: <PlayArrowRoundedIcon /> },
          { to: "/app/services/stream/search", label: "Browse", icon: <SearchOutlinedIcon /> },
          { to: "/app/services/stream/live/now", label: "Live", icon: <LiveTvOutlinedIcon /> },
          { to: "/app/services/stream/downloads", label: "Downloads", icon: <DownloadOutlinedIcon /> },
          { to: "/app/services/stream/studio/channel", label: "Account", icon: <PersonOutlineIcon /> },
        ] : mainTabs).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-tour={tab.label.toLowerCase()}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.to === "/app/services/stream/downloads" && streamDownloadCount ? <b className="mobile-bottom-nav-badge">{streamDownloadBadgeLabel}</b> : null}
          </NavLink>
        ))}
      </nav> : null}
      {!fullScreen && !isStreamImmersive ? <CommunityFollowPrompt /> : null}
      {!fullScreen && !isStreamShell && !isStreamImmersive && location.pathname !== "/messages" && location.pathname !== "/add-product" ? (
        <aside className={`live-activity-float ${liveFeedOpen ? "open" : ""}`} aria-label="Live activity">
          {liveFeedOpen ? (
            <section className="live-activity-panel" aria-live="polite">
              <header>
                <span><i />Live activity</span>
                <button type="button" onClick={() => setLiveFeedOpen(false)} aria-label="Close live activity"><CloseOutlinedIcon /></button>
              </header>
              <p>New messages and marketplace updates.</p>
              <div className="live-activity-items">
                {liveActivityItems.length ? liveActivityItems.map((conversation) => (
                  <button type="button" key={conversation._id} onClick={() => openLiveConversation(conversation._id)}>
                    <span className="live-activity-message-icon"><ChatOutlinedIcon /></span>
                    <span><strong>{liveConversationName(conversation)}</strong><small>{conversation.lastMessage || `Message about ${conversation.productTitle || "your listing"}`}</small></span>
                    {user?.uid && conversation.unreadBy?.includes(user.uid) ? <b>1</b> : null}
                  </button>
                )) : <div className="live-activity-empty">You are all caught up.</div>}
              </div>
              <button className="live-activity-inbox" type="button" onClick={() => { setLiveFeedOpen(false); navigate("/messages"); }}>Open Messages</button>
            </section>
          ) : null}
          <button className="live-activity-trigger" type="button" onClick={() => setLiveFeedOpen((open) => !open)} aria-expanded={liveFeedOpen} aria-label="Open live activity">
            <ForumOutlinedIcon />
            {liveMessageCount ? <b>{liveBadgeLabel}</b> : <i className="live-activity-status" />}
          </button>
        </aside>
      ) : null}
      {showProfileReminder && !isStreamImmersive && !fullScreen ? (
        <aside className="profile-verify-reminder" role="alert" aria-live="polite">
          <span><VerifiedUserOutlinedIcon /></span>
          <div>
            <strong>Complete your profile</strong>
            <p>Add your profile info to unlock Real Pi User verification.</p>
          </div>
          <button type="button" onClick={completeProfileFromReminder}>Go Complete</button>
        </aside>
      ) : null}
      {!fullScreen && !isStreamImmersive ? <WelcomeTour /> : null}
      <ConfirmSignOutModal open={showSignOut} busy={isLoading} onCancel={() => setShowSignOut(false)} onConfirm={() => void logout()} />
    </div>
  );
};

export default PrivateLayout;
