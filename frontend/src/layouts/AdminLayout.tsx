import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import LiveTvOutlinedIcon from "@mui/icons-material/LiveTvOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useAuthContext } from "../contexts/AuthContext";
import logoImage from "/logo.png";
import ConfirmSignOutModal from "../components/ConfirmSignOutModal";
import useRouteScrollTop from "../hooks/useRouteScrollTop";
import { adminNavigation, searchableAdminNavigation, type AdminNavGroup } from "../content/adminNavigation";

const SIDEBAR_STORAGE_KEY = "smaj_private_sidebar_collapsed";
const LAST_PRIVATE_ROUTE_KEY = "smaj_last_private_route";
const ADMIN_THEME_STORAGE_KEY = "smaj_admin_theme_v3";
const groupIcon = (icon: AdminNavGroup["icon"]) => icon === "overview" ? <DashboardOutlinedIcon /> : icon === "users" ? <PeopleOutlineIcon /> : icon === "payments" ? <ReceiptLongOutlinedIcon /> : icon === "safety" ? <ShieldOutlinedIcon /> : icon === "system" ? <SettingsOutlinedIcon /> : <Inventory2OutlinedIcon />;

const adminSearchItems = [
  ...searchableAdminNavigation.map((item) => ({ to: item.to, label: item.label, icon: groupIcon(item.icon), keywords: [item.label, item.group, "admin"] })),
  { to: "/store", label: "SMAJ Store", icon: <Inventory2OutlinedIcon />, keywords: ["store", "shop", "products", "marketplace", "commerce"] },
  { to: "/seller", label: "Seller Dashboard", icon: <Inventory2OutlinedIcon />, keywords: ["seller", "vendor", "listings", "products"] },
  { to: "/add-product", label: "Add Product", icon: <Inventory2OutlinedIcon />, keywords: ["add", "new product", "listing"] },
  { to: "/orders", label: "User Orders", icon: <ReceiptLongOutlinedIcon />, keywords: ["orders", "buyer", "seller orders"] },
  { to: "/messages", label: "Messages", icon: <ReportProblemOutlinedIcon />, keywords: ["messages", "chat", "inbox"] },
  { to: "/notifications", label: "Notifications", icon: <ReportProblemOutlinedIcon />, keywords: ["notifications", "alerts"] },
  { to: "/profile", label: "Profile", icon: <PeopleOutlineIcon />, keywords: ["profile", "account", "user"] },
  { to: "/settings", label: "User Settings", icon: <SettingsOutlinedIcon />, keywords: ["settings", "verification", "privacy"] },
  { to: "/help", label: "Help Center", icon: <ReportProblemOutlinedIcon />, keywords: ["help", "support", "faq"] },
  { to: "/privacy", label: "Privacy Policy", icon: <SettingsOutlinedIcon />, keywords: ["privacy", "legal"] },
  { to: "/terms", label: "Terms", icon: <SettingsOutlinedIcon />, keywords: ["terms", "legal"] },
  { to: "/seller-agreement", label: "Seller Agreement", icon: <SettingsOutlinedIcon />, keywords: ["seller agreement", "legal"] },
] as const;

const AdminLayout = ({ children }: { children: ReactNode }) => {
  useRouteScrollTop();
  const { user, signOut } = useAuthContext();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  const [showSignOut, setShowSignOut] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<number[]>([1]);
  const [mobileUtilitiesOpen, setMobileUtilitiesOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [adminTheme, setAdminTheme] = useState<"light" | "dark">(() => window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === "dark" ? "dark" : "light");
  const navigate = useNavigate();
  const location = useLocation();
  const adminName = user?.displayName || user?.username || user?.piUsername || "Admin";
  const adminInitial = adminName.slice(0, 1).toUpperCase();

  useEffect(() => {
    const route = `${location.pathname}${location.search}${location.hash}`;
    try {
      window.sessionStorage.setItem(LAST_PRIVATE_ROUTE_KEY, route);
      window.localStorage.setItem(LAST_PRIVATE_ROUTE_KEY, route);
    } catch {
      // Ignore storage failures in constrained browsers.
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileSidebarOpen]);

  const logout = async () => {
    await signOut();
    navigate("/home", { replace: true });
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };
  const toggleAdminMenu = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) toggleSidebar();
    else setMobileSidebarOpen((open) => !open);
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
  };

  const toggleGroup = (number: number) => setExpandedGroups((groups) => groups.includes(number) ? groups.filter((item) => item !== number) : [...groups, number]);
  const toggleAdminTheme = () => setAdminTheme((theme) => {
    const next = theme === "light" ? "dark" : "light";
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
    return next;
  });

  const searchResults = useMemo(() => {
    const query = adminSearch.trim().toLowerCase();
    if (!query) return [];
    return adminSearchItems
      .filter((item) => [item.label, item.to, ...item.keywords].some((value) => value.toLowerCase().includes(query) || query.includes(value.toLowerCase())))
      .slice(0, 8);
  }, [adminSearch]);

  if (user?.role !== "admin") {
    return (
      <main className="private-page">
        <section className="private-state">
          <h2>You do not have admin access.</h2>
          <p>Use an authorized SMAJ PI HUB admin account to open this area.</p>
          <Link className="private-primary-button" to="/dashboard">Back to Home</Link>
        </section>
      </main>
    );
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const target = searchResults[0]?.to || "/admin";
    setAdminSearch("");
    setMobileSidebarOpen(false);
    navigate(target);
  };

  return (
    <div className={"private-shell admin-shell admin-theme-" + adminTheme + " " + (sidebarCollapsed ? "admin-sidebar-collapsed " : "") + (mobileUtilitiesOpen ? "admin-utilities-open" : "")}>
      <header className="private-header">
        <button className="private-menu-toggle admin-mobile-menu-toggle" type="button" onClick={toggleAdminMenu} aria-label={mobileSidebarOpen ? "Close admin menu" : "Toggle admin menu"}>
          {mobileSidebarOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <Link to="/admin" className="private-brand" aria-label="Admin dashboard"><img src={logoImage} alt="" /></Link>
        <form className="admin-header-search" onSubmit={submitSearch}>
          <SearchOutlinedIcon />
          <input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Search admin..." aria-label="Search admin pages" />
          {adminSearch.trim() ? (
            <div className="admin-search-results">
              {searchResults.length ? searchResults.map((item) => (
                <button type="button" key={item.to + "-" + item.label} onClick={() => { setAdminSearch(""); setMobileSidebarOpen(false); navigate(item.to); }}>
                  {item.icon}<span>{item.label}</span>
                </button>
              )) : <button type="submit">Open Admin Dashboard</button>}
            </div>
          ) : null}
        </form>
        <div className="admin-desktop-actions">
          <button type="button" onClick={toggleAdminTheme} aria-label={adminTheme === "dark" ? "Use light admin theme" : "Use dark admin theme"}><DarkModeOutlinedIcon /></button>
          <button className="admin-notification-trigger" type="button" onClick={() => { setNotificationsOpen((open) => !open); setProfileMenuOpen(false); }} aria-label="Open notifications" aria-expanded={notificationsOpen}><NotificationsNoneOutlinedIcon /><i /></button>
          <button className="private-user-pill admin-desktop-profile-trigger" type="button" onClick={() => { setProfileMenuOpen((open) => !open); setNotificationsOpen(false); }} aria-expanded={profileMenuOpen}>
            <span>{user.avatar ? <img src={user.avatar} alt="" /> : adminInitial}</span><b>{adminName}</b><ExpandMoreOutlinedIcon />
          </button>
        </div>
        <button className="admin-mobile-more" type="button" onClick={() => { setMobileUtilitiesOpen((open) => !open); setNotificationsOpen(false); }} aria-label="Toggle admin utilities" aria-expanded={mobileUtilitiesOpen}><MoreHorizOutlinedIcon /></button>
        <div className="admin-mobile-utilities">
          <button type="button" onClick={toggleAdminTheme} aria-label={adminTheme === "dark" ? "Use light admin theme" : "Use dark admin theme"}><DarkModeOutlinedIcon /></button>
          <button className="admin-notification-trigger" type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Open notifications" aria-expanded={notificationsOpen}><NotificationsNoneOutlinedIcon /><i /></button>
          <button className="admin-mobile-profile" type="button" onClick={() => setProfileMenuOpen((open) => !open)}><span>{user.avatar ? <img src={user.avatar} alt="" /> : adminInitial}</span><b>{adminName}</b><ExpandMoreOutlinedIcon /></button>
        </div>
        {profileMenuOpen ? <section className="admin-profile-menu">
          <header><strong>{adminName}</strong><small>@{user.piUsername || user.username}</small></header>
          <Link to="/admin/profile" onClick={() => setProfileMenuOpen(false)}><PersonOutlineOutlinedIcon /><span>Edit profile</span></Link>
          <Link to="/admin/settings" onClick={() => setProfileMenuOpen(false)}><TuneOutlinedIcon /><span>Account settings</span></Link>
          <Link to="/help" onClick={() => setProfileMenuOpen(false)}><InfoOutlinedIcon /><span>Support</span></Link>
          <button type="button" onClick={() => { setProfileMenuOpen(false); setShowSignOut(true); }}><LogoutIcon /><span>Sign out</span></button>
        </section> : null}
        {notificationsOpen ? <section className="admin-notification-popover" aria-label="Admin notifications">
          <header><h2>Notification</h2><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><CloseIcon /></button></header>
          <div>
            <Link to="/admin/onboarding" onClick={() => setNotificationsOpen(false)}><span>SV</span><p><strong>Seller verification requests need review</strong><small>Verification · 5 min ago</small></p></Link>
            <Link to="/admin/products" onClick={() => setNotificationsOpen(false)}><span>PR</span><p><strong>Products are waiting for approval</strong><small>Store · 8 min ago</small></p></Link>
            <Link to="/admin/reports" onClick={() => setNotificationsOpen(false)}><span>TS</span><p><strong>New Trust &amp; Safety report received</strong><small>Reports · 15 min ago</small></p></Link>
            <Link to="/admin/stream/moderation" onClick={() => setNotificationsOpen(false)}><span>ST</span><p><strong>Stream content entered moderation</strong><small>Stream · 1 hour ago</small></p></Link>
          </div>
          <Link className="admin-notification-all" to="/admin/modules/21-communications/notifications" onClick={() => setNotificationsOpen(false)}>View All Notification</Link>
        </section> : null}
      </header>
      <div className={`private-body ${sidebarCollapsed ? "private-body-collapsed" : ""}`}>
        <aside id="admin-mobile-sidebar" className={`private-sidebar ${sidebarCollapsed ? "private-sidebar-collapsed" : ""} ${mobileSidebarOpen ? "private-sidebar-open" : ""}`}>
          <div className="private-sidebar-top">
            <Link to="/admin" className="private-sidebar-brand" title="Admin dashboard" aria-label="Admin dashboard"><img src={logoImage} alt="" /></Link>
            <button className="private-sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {sidebarCollapsed ? <KeyboardDoubleArrowRightIcon /> : <KeyboardDoubleArrowLeftIcon />}
            </button>
          </div>
          <nav className="admin-navigation">
            {adminNavigation.map((group) => {
              const active = group.items.some((item) => item.to === location.pathname);
              const open = active || expandedGroups.includes(group.number);
              return <section className={"admin-nav-group " + (open ? "open " : "") + (active ? "active" : "")} key={group.number}>
                <button type="button" className="admin-nav-group-toggle" onClick={() => toggleGroup(group.number)} aria-expanded={open} title={sidebarCollapsed ? group.label : undefined}>
                  <span className="admin-nav-group-icon">{groupIcon(group.icon)}</span>
                  <span className="private-nav-label admin-nav-group-label"><b>{group.number}.</b> {group.label}</span>
                  <KeyboardArrowDownOutlinedIcon className="private-nav-label admin-nav-chevron" />
                </button>
                {open ? <div className="admin-nav-children">
                  {group.items.map((item, index) => item.to ? (
                    <Link className={location.pathname === item.to && group.items.findIndex((candidate) => candidate.to === item.to) === index ? "active" : ""} to={item.to} onClick={() => setMobileSidebarOpen(false)} key={group.number + "-" + item.label}>
                      <span>{item.label}</span>
                    </Link>
                  ) : (
                    <button type="button" className="planned" disabled title="Planned admin module" key={group.number + "-" + item.label}>
                      <span>{item.label}</span><small>Planned</small>
                    </button>
                  ))}
                </div> : null}
              </section>;
            })}
          </nav>
          <button className="private-sidebar-logout" type="button" onClick={() => setShowSignOut(true)} title={sidebarCollapsed ? "Logout" : undefined} aria-label="Logout"><LogoutIcon /><span className="private-nav-label">Logout</span></button>
        </aside>
        {mobileSidebarOpen ? <button className="private-overlay" onClick={() => setMobileSidebarOpen(false)} aria-label="Close menu" /> : null}
        <div className="private-content">{children}</div>
      </div>
      <nav className="admin-mobile-bottom-nav" aria-label="Mobile admin navigation">
        {[
          ["/admin", "Home", <DashboardOutlinedIcon />],
          ["/admin/orders", "Orders", <ReceiptLongOutlinedIcon />],
          ["/admin/products", "Review", <ShieldOutlinedIcon />],
          ["/admin/stream", "Stream", <LiveTvOutlinedIcon />],
        ].map(([to, label, icon]) => <NavLink key={String(to)} to={String(to)} end={to === "/admin"}>{icon}<span>{label}</span></NavLink>)}
        <button
          type="button"
          className={mobileSidebarOpen ? "active" : undefined}
          onClick={() => setMobileSidebarOpen((open) => !open)}
          aria-expanded={mobileSidebarOpen}
          aria-controls="admin-mobile-sidebar"
        >
          <MoreHorizOutlinedIcon /><span>More</span>
        </button>
      </nav>
      <ConfirmSignOutModal open={showSignOut} onCancel={() => setShowSignOut(false)} onConfirm={() => void logout()} />
    </div>
  );
};

export default AdminLayout;
