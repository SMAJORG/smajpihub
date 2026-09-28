import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Hls from "hls.js";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ServiceArt from "../../components/ServiceArt";
import { serviceLaunchNavigationState } from "../../components/ServiceLaunchGate";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import TrustBadge from "../../components/TrustBadge";
import LanguageSoonButton from "../../components/LanguageSoonButton";
import { useAuthContext } from "../../contexts/AuthContext";
import { getHeroBanners } from "../../lib/heroBanners";
import { getServiceLaunchLabel, getServiceLaunchStatus, serviceCatalog, type ServiceDefinition } from "../../content/serviceCatalog";
import { axiosClient } from "../../lib/axiosClient";
import { countryDisplayName, countryFlag, formatPiAmount } from "../../lib/formatters";
import { getStreamCatalog, type StreamCatalogTitle } from "../../lib/streamCatalog";
import { getTitleAvailability } from "../../lib/streamAdmin";
import { getStreamPlayback, type StreamPlaybackVideo } from "../../lib/streamPlayback";
import type { Product, VerificationLevel, VerificationStatus } from "../../types/marketplace";
import useSportsCatalog from "../../hooks/useSportsCatalog";
import type { SportsCatalog } from "../../types/sports";

type DiscoveryTab = "for-you" | "trending" | "lifestyle" | "categories";

const why = [[PublicOutlinedIcon, "Access anywhere", "Access multiple digital services from anywhere you are."], [LockOutlinedIcon, "Simple access", "One account for your everyday needs."], [HubOutlinedIcon, "Connect everyone", "People, businesses, and opportunities connected together."], [RocketLaunchOutlinedIcon, "Built for the future", "A growing ecosystem designed for everyday life."]] as const;
const discoveryTabs = [["For you", "for-you"], ["Trending", "trending"], ["Lifestyle", "lifestyle"], ["Categories", "categories"]] as const;
const serviceHints: Record<string, string> = { store: "Shopping - Deals", food: "Eat - Delivery", jobs: "Work - Hire", education: "Learn - Skills", health: "Care - Doctors", transport: "Ride - Move", agro: "Farm - Trade", energy: "Power - Bills", charity: "Give - Help", housing: "Rent - Buy", events: "Tickets - Fun", swap: "Trade - Exchange", stream: "Watch - Videos", sports: "Play - Scores", token: "Rewards - Utility" };
const lifestyleSlugs = ["food", "health", "housing", "transport", "education", "charity", "events", "agro"];
const trendingSlugs = ["store", "stream", "sports", "events", "food", "jobs", "education", "health", "housing", "transport"];
const categoryGroups = [
  { title: "Shopping & Entertainment", description: "Shop, watch, play, and discover experiences.", slugs: ["store", "stream", "sports", "events"] },
  { title: "Daily Life", description: "Handle food, care, travel, and your home.", slugs: ["food", "health", "transport", "housing"] },
  { title: "Work & Learning", description: "Find opportunities, build skills, and grow.", slugs: ["jobs", "education", "agro"] },
  { title: "Community & Utilities", description: "Support communities and power everyday life.", slugs: ["charity", "energy"] },
  { title: "Finance & Rewards", description: "Exchange value and access ecosystem rewards.", slugs: ["swap", "token"] },
] as const;
const lifestyleGroups = [
  { title: "Food & errands", description: "Order what you need and get where you are going.", slugs: ["food", "store", "transport"] },
  { title: "Home & care", description: "Look after your home, health, and essential utilities.", slugs: ["housing", "health", "energy"] },
  { title: "Learning & growth", description: "Build skills and find your next opportunity.", slugs: ["education", "jobs", "agro"] },
  { title: "Entertainment & community", description: "Watch, play, attend, and support causes.", slugs: ["stream", "sports", "events", "charity"] },
] as const;
const serviceGroups = Array.from({ length: 5 }, (_, index) => serviceCatalog.slice(index * 3, index * 3 + 3));
const popularSearches = ["Electronics", "Phones", "Food", "Cars", "Jobs", "Housing", "Health", "Education", "Transport"];
const trustedFallbackSellers = [
  { id: "beta-seller-1", name: "SMAJ Verified Market", location: "Global", rating: "4.8", listings: 12 },
  { id: "beta-seller-2", name: "Pi Community Deals", location: "UAE", rating: "4.7", listings: 8 },
  { id: "beta-seller-3", name: "Trusted Local Seller", location: "Africa", rating: "4.6", listings: 6 },
];
const betaActivity = [
  "New product listed in SMAJ Store",
  "New trusted seller joined the beta",
  "SMAJ Health service preview added",
  "Pi users are exploring services globally",
];
const trustIndicators = ["Pi verified users", "Reviewed listings", "Buyer/seller chat", "Safer marketplace support"];
const fallbackHeroImages = [
  "/assets/smaj-mobile-hero-v2.png",
  "/assets/smaj-mobile-hero-business.jpg",
  "/assets/smaj-mobile-hero-work.jpg",
];

const featureCards = [
  { title: "Take care of your health", text: "Find doctors, pharmacies and health services", slug: "health", image: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=900&q=85" },
  { title: "Find your next home", text: "Discover houses, apartments and properties", slug: "housing", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=85" },
  { title: "Build your skills", text: "Courses, training and certifications", slug: "education", image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=85" },
  { title: "Discover new products", text: "Shop from sellers and stores", slug: "store", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=85" },
];

const mediaSections = [
  { title: "Live sports", slug: "sports", image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=900&q=85", items: ["Live matches", "Latest scores", "Top teams", "Tournament highlights"] },
  { title: "Events happening now", slug: "events", image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=85", items: ["Concerts", "Conferences", "Shows", "Experiences"], badges: ["Live now", "Starts today", "This weekend", "Ends on 7/8/26"] },
];

const servicePath = (service: ServiceDefinition) => {
  if (service.slug === "store") return "/store";
  if (service.slug === "stream") return "/app/services/stream";
  if (service.slug === "sports") return "/services/sports";
  return `/app/services/${service.slug}`;
};
type RecentItem = { label: string; to: string; meta?: string };
type SellerCard = { id: string; name: string; location: string; rating: string; listings: number; avatar?: string; verificationLevel?: VerificationLevel; verificationStatus?: VerificationStatus };
type DashboardStreamRow = { title: string; description: string; seeAll: string; items: StreamCatalogTitle[] };
let dashboardProductsCache: Product[] | null = null;
let dashboardStreamRowsCache: DashboardStreamRow[] | null = null;
let dashboardStartupComplete = false;

const readRecentItems = (key: string) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.label && item?.to).slice(0, 6) as RecentItem[] : [];
  } catch {
    return [];
  }
};

const sortNewestProducts = (products: Product[]) => [...products].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
const recommendedServicesForCountry = (country?: string) => {
  const normalized = countryDisplayName(country || "").toLowerCase();
  const localSlugs = normalized.includes("united arab emirates") || normalized.includes("uae") ? ["store", "stream", "sports", "transport", "food", "jobs", "housing", "health"] : ["store", "stream", "sports", "jobs", "education", "health", "transport", "housing"];
  return localSlugs.map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[];
};

const SectionState = ({ loading, error, empty, children, skeleton = "grid" }: { loading?: boolean; error?: string; empty?: string; children: ReactNode; skeleton?: "grid" | "list" | "stats" }) => {
  if (loading) return <PrivateSkeleton variant={skeleton} count={skeleton === "list" ? 3 : 4} />;
  if (error) return <div className="private-state compact error"><h3>Could not load this section</h3><p>{error}</p></div>;
  if (empty) return <div className="private-state compact"><h3>{empty}</h3><p>As beta activity grows, this area will update automatically.</p></div>;
  return <>{children}</>;
};

const TeamMark = ({ name, logoUrl, color }: { name: string; logoUrl?: string; color: string }) => logoUrl
  ? <img className="dashboard-sports-team-logo" src={logoUrl} alt="" />
  : <span className="dashboard-sports-team-logo fallback" style={{ background: color }}>{name.slice(0, 2).toUpperCase()}</span>;

const DashboardSportsSection = ({ catalog, loading, compact }: { catalog: SportsCatalog; loading: boolean; compact: boolean }) => {
  const match = catalog.matches.find((item) => item.status === "live") || catalog.matches.find((item) => item.status === "finished") || catalog.matches[0];
  const standing = [...catalog.standings].sort((a, b) => b.points - a.points)[0];
  const story = catalog.stories[0];
  const target = "/services/sports";
  return <section className={`${compact ? "mobile-feed-section" : "desktop-feed-section"} dashboard-sports`}>
    <div className={compact ? "mobile-section-heading" : "desktop-feed-section-head"}><div><h2>Live sports</h2>{!compact ? <p>Scores, leading teams, and tournament stories from SMAJ Sports.</p> : null}</div><Link to={target}>See all</Link></div>
    {loading ? <PrivateSkeleton variant="grid" count={3} /> : <div className="dashboard-sports-grid">
      {match ? <Link className="dashboard-sports-card score-card" to={target}>
        <div className="dashboard-sports-card-head"><span>Latest score</span><b className={match.status === "live" ? "is-live" : ""}>{match.status === "live" ? "Live" : match.status === "finished" ? "Full time" : match.dateLabel}</b></div>
        <small>{match.competition}</small>
        <div className="dashboard-score-row"><div><TeamMark {...match.home} /><strong>{match.home.shortName}</strong></div><em>{match.homeScore ?? "–"} <span>:</span> {match.awayScore ?? "–"}</em><div><TeamMark {...match.away} /><strong>{match.away.shortName}</strong></div></div>
        <p>{match.minute || match.dateLabel} · {match.venue}</p>
      </Link> : null}
      {standing ? <Link className="dashboard-sports-card team-card" to={target}>
        <div className="dashboard-sports-card-head"><span>Top team</span><b>#1</b></div>
        <div className="dashboard-top-team"><TeamMark {...standing.team} /><div><strong>{standing.team.name}</strong><small>{standing.team.city} · {catalog.competitions[0]?.name || "League"}</small></div></div>
        <div className="dashboard-team-stats"><span><b>{standing.points}</b>Points</span><span><b>{standing.won}</b>Wins</span><span><b>{standing.played}</b>Played</span></div>
        <div className="dashboard-team-form">{standing.team.form.slice(-5).map((result, index) => <i className={`form-${result.toLowerCase()}`} key={`${result}-${index}`}>{result}</i>)}</div>
      </Link> : null}
      {story ? <Link className="dashboard-sports-card highlight-card" to={target}>
        <div className="dashboard-highlight-image"><img src="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=900&q=80" alt="" /><span><PlayArrowRoundedIcon /></span><b>{story.category}</b></div>
        <div className="dashboard-highlight-copy"><span>Tournament highlight</span><strong>{story.title}</strong><small>{story.time} · Open in SMAJ Sports</small></div>
      </Link> : null}
    </div>}
    <small className="dashboard-sports-updated">{catalog.meta?.source === "thesportsdb" ? "Live provider data" : "Preview data · live provider unavailable"}</small>
  </section>;
};

const recentItemIcon = (to: string) => {
  if (to.startsWith("/app/services")) return <AppsOutlinedIcon />;
  if (to.startsWith("/search")) return <SearchOutlinedIcon />;
  if (to.startsWith("/messages")) return <ChatOutlinedIcon />;
  if (to.startsWith("/settings")) return <SettingsOutlinedIcon />;
  if (to.startsWith("/wallet") || to.startsWith("/app/wallet")) return <AccountBalanceWalletOutlinedIcon />;
  return <HistoryOutlinedIcon />;
};

const ContinueSection = ({ items, compact = false }: { items: RecentItem[]; compact?: boolean }) => {
  const [showAll, setShowAll] = useState(false);
  const usefulItems = items.filter((item) => item.to !== "/dashboard" && item.label.toLowerCase() !== "smaj pi hub");
  const visibleItems = compact && !showAll ? usefulItems.slice(0, 3) : usefulItems;
  return <section className={compact ? "mobile-feed-section beta-home-section mobile-continue-section" : "desktop-feed-section beta-home-section"}>
    <div className="desktop-feed-section-head mobile-section-heading"><div><h2>{compact ? "Pick up where you left off" : "Continue Where You Left Off"}</h2><p>{compact ? "Jump back into your recent activity." : "Recent services, products, and pages."}</p></div>{compact && usefulItems.length > 3 ? <button className="mobile-section-link" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show less" : "See all"}</button> : null}</div>
    <SectionState empty={!usefulItems.length ? "No history yet" : ""} skeleton="list">
      {compact ? <div className="mobile-recent-strip">{visibleItems.map((item) => <Link className="mobile-recent-card" to={item.to} key={`${item.to}-${item.label}`}><span className="mobile-recent-icon">{recentItemIcon(item.to)}</span><ChevronRightOutlinedIcon className="mobile-recent-arrow" /><strong>{item.label}</strong><small>{item.meta && item.meta !== "Recent page" ? item.meta : "Recently viewed"}</small></Link>)}</div> : <div className="beta-recent-list">{visibleItems.map((item) => <Link to={item.to} key={`${item.to}-${item.label}`}><strong>{item.label}</strong><span>{item.meta || "Open again"}</span></Link>)}</div>}
    </SectionState>
  </section>;
};

const PopularSearchSection = ({ compact = false }: { compact?: boolean }) => (
  <section className={compact ? "mobile-feed-section beta-home-section" : "desktop-feed-section beta-home-section"}>
    <div className="desktop-feed-section-head mobile-section-heading"><div><h2>Popular Searches</h2><p>Fast paths into marketplace and services.</p></div></div>
    <SectionState empty={!popularSearches.length ? "No popular searches yet" : ""}>
      <div className="beta-search-chips">{popularSearches.map((term) => <Link to={`/store?search=${encodeURIComponent(term)}`} key={term}>{term}</Link>)}</div>
    </SectionState>
  </section>
);

const RecentlyAddedSection = ({ products, loading, error, compact = false }: { products: Product[]; loading: boolean; error: string; compact?: boolean }) => (
  <section className={compact ? "mobile-feed-section beta-home-section" : "desktop-feed-section beta-home-section"}>
    <div className="desktop-feed-section-head mobile-section-heading"><div><h2>Recently Added</h2><p>Newest live listings and services.</p></div><Link to="/store">See all</Link></div>
    <SectionState loading={loading} error={error} empty={!products.length ? "No recent listings yet" : ""}>
      <div className="beta-product-strip">{products.slice(0, 6).map((product) => { const country = countryDisplayName(product.country || product.location?.split(" - ")[0]); const flag = countryFlag(country); const city = product.city || product.stateRegion?.replace(" Emirate", "") || product.location?.split(" - ")[1]?.replace(" Emirate", "") || ""; return <Link to={`/product/${product._id}`} className={`beta-product-card${compact ? " mobile-recent-product-card" : ""}`} key={product._id}>{product.image ? <img src={product.image} alt="" /> : <span className="beta-product-placeholder" /> }<strong>{product.title}</strong>{compact ? <><span className="mobile-product-category">{product.category}</span><span className="mobile-product-details"><b>{formatPiAmount(product.pricePi)}</b><small>{flag ? <span role="img" aria-label={country}>{flag}</span> : "📍"} {city || country || "Global"}</small></span></> : <small>{product.category} - {product.location || "Global"}</small>}</Link>; })}</div>
    </SectionState>
  </section>
);

const FeaturedSellersSection = ({ sellers, loading, error, compact = false }: { sellers: SellerCard[]; loading: boolean; error: string; compact?: boolean }) => (
  <section className={compact ? "mobile-feed-section beta-home-section" : "desktop-feed-section beta-home-section"}>
    <div className="desktop-feed-section-head mobile-section-heading"><div><h2>Featured Sellers</h2><p>{compact ? "Marketplace sellers with active listings." : "Trusted sellers active in beta."}</p></div></div>
    <SectionState loading={loading} error={error} empty={!sellers.length ? "No featured sellers yet" : ""}>
      <div className="beta-seller-grid">{sellers.map((seller) => compact ? <Link className="beta-seller-card mobile-seller-card" to={`/seller/${seller.id}`} key={seller.id}><div className="mobile-seller-identity"><span className="mobile-seller-avatar">{seller.avatar ? <img src={seller.avatar} alt="" /> : seller.name.slice(0, 1).toUpperCase()}</span><div><strong>{seller.name}<TrustBadge level={seller.verificationLevel} status={seller.verificationStatus} /></strong><span>{seller.location.toLowerCase().includes("united arab emirates") ? `${seller.location.split(" - ")[1]?.replace(" Emirate", "") || "UAE"}, UAE` : seller.location.split(" - ").slice(0, 2).join(", ")}</span></div></div><div className="mobile-seller-meta"><span><StarRoundedIcon /> {seller.rating}</span><small>{seller.listings} listings</small><ChevronRightOutlinedIcon /></div></Link> : <article className="beta-seller-card" key={seller.id}><div><strong>{seller.name}</strong><span>{seller.location}</span></div><b>Trusted</b><small>{seller.rating} star - {seller.listings} listings</small></article>)}</div>
    </SectionState>
  </section>
);

const ActivityFeedSection = ({ products, loading, error, compact = false }: { products: Product[]; loading: boolean; error: string; compact?: boolean }) => {
  const [showAll, setShowAll] = useState(false);
  const relativeTime = (date?: string) => {
    if (!date) return "Recently";
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago`;
  };
  const productActivity = products.slice(0, 6).map((product) => ({ title: product.title, meta: `New ${product.category || "marketplace"} listing · ${relativeTime(product.createdAt)}`, to: `/product/${product._id}`, image: product.image }));
  const activity = productActivity.length ? productActivity : betaActivity.slice(0, 3).map((title) => ({ title, meta: "Beta update", to: "", image: "" }));
  const visibleActivity = compact && !showAll ? activity.slice(0, 3) : activity;
  return <section className={compact ? "mobile-feed-section beta-home-section mobile-activity-section" : "desktop-feed-section beta-home-section"}>
    <div className="desktop-feed-section-head mobile-section-heading"><div><h2>Live Activity</h2><p>{compact ? "Latest updates across SMAJ PI HUB." : "What is moving across SMAJ PI HUB."}</p></div>{compact && activity.length > 3 ? <button className="mobile-section-link" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show less" : "See all"}</button> : null}</div>
    <SectionState loading={loading} error={error} empty={!activity.length ? "No live activity yet" : ""} skeleton="list">
      {compact ? <div className="mobile-activity-list">{visibleActivity.map((item) => { const content = <><span className="mobile-activity-media">{item.image ? <img src={item.image} alt="" /> : <Inventory2OutlinedIcon />}</span><span className="mobile-activity-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>{item.to ? <ChevronRightOutlinedIcon className="mobile-activity-arrow" /> : null}</>; return item.to ? <Link to={item.to} className="mobile-activity-row" key={`${item.to}-${item.title}`}>{content}</Link> : <article className="mobile-activity-row" key={item.title}>{content}</article>; })}</div> : <div className="beta-activity-list">{activity.slice(0, 5).map((item) => <article key={item.title}><span />{item.title}</article>)}</div>}
    </SectionState>
  </section>;
};

const TrustSection = ({ compact = false }: { compact?: boolean }) => (
  <section className={compact ? "mobile-feed-section beta-home-section" : "desktop-feed-section beta-home-section"}>
    <div className="desktop-feed-section-head mobile-section-heading"><div><h2>Trust Indicators</h2><p>Signals that help keep beta safer.</p></div></div>
    <SectionState empty={!trustIndicators.length ? "No trust indicators yet" : ""} skeleton="stats">
      <div className="beta-trust-grid">{trustIndicators.map((item) => <article key={item}><ShieldOutlinedIcon /><strong>{item}</strong></article>)}</div>
    </SectionState>
  </section>
);

const DiscoveryTabButtons = ({ activeTab, onTabChange, className }: { activeTab: DiscoveryTab; onTabChange: (tab: DiscoveryTab) => void; className: string }) => (
  <nav className={className} aria-label="Discover SMAJ PI HUB">
    {discoveryTabs.map(([label, tab]) => (
      <button type="button" key={tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>
        {label}
      </button>
    ))}
  </nav>
);

const serviceBadgeClass = (service: ServiceDefinition, kind: "card" | "rating" = "card") => {
  const status = getServiceLaunchStatus(service.slug);
  if (status === "live") return `${kind === "rating" ? "live-rating-badge" : "live-card-badge"} service-live-boil`;
  return status === "coming-soon" ? "service-coming-soon-badge" : "service-in-progress-badge";
};

const ServiceList = ({ services, mode }: { services: ServiceDefinition[]; mode: "desktop" | "mobile" }) => (mode === "desktop" ? (
    <div className="desktop-suggested-grid">
      {services.map((service) => (
        <Link to={servicePath(service)} state={serviceLaunchNavigationState(service.slug)} className={`desktop-service-app ${service.inProgress ? "service-in-progress-card" : ""}`} key={service.slug} aria-disabled={service.inProgress || undefined} onClick={service.inProgress ? (event) => event.preventDefault() : undefined}>
          <ServiceArt index={service.atlasIndex} />
          <div><strong>{service.name}</strong><span>{service.items.slice(0, 2).join(" - ")}</span></div>
          <small className={serviceBadgeClass(service, "rating")}>{getServiceLaunchLabel(service.slug)}</small>
        </Link>
      ))}
    </div>
  ) : (
    <div className="mobile-services-grid">
      {services.map((service) => (
        <Link key={service.slug} to={servicePath(service)} state={serviceLaunchNavigationState(service.slug)} className={service.inProgress ? "service-in-progress-card" : undefined} aria-disabled={service.inProgress || undefined} onClick={service.inProgress ? (event) => event.preventDefault() : undefined}>
          <ServiceArt index={service.atlasIndex} />
          <em className={serviceBadgeClass(service)}>{getServiceLaunchLabel(service.slug)}</em>
          <strong>{service.name.replace("SMAJ ", "")}</strong>
          <span>{serviceHints[service.slug] || service.items.slice(0, 2).join(" - ")}</span>
        </Link>
      ))}
    </div>
  )
);


const TrendingMobileContent = ({ products, productsLoading, productsError, streamRows, streamLoading, sportsCatalog, sportsLoading }: { products: Product[]; productsLoading: boolean; productsError: string; sellers: SellerCard[]; recentItems: RecentItem[]; recommendedServices: ServiceDefinition[]; streamRows: DashboardStreamRow[]; streamLoading: boolean; sportsCatalog: SportsCatalog; sportsLoading: boolean }) => (
  <>
    <section className="mobile-feed-section discovery-tab-intro"><span>POPULAR NOW</span><h1>See what is happening across SMAJ</h1><p>Popular services, searches, entertainment, sports, and events in one live view.</p></section>
    <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Popular in SMAJ</h2><Link to="/app/services">See all</Link></div><p className="discovery-section-note">Beta ranking based on the services people explore most.</p><ServiceList services={trendingSlugs.slice(0, 6).map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[]} mode="mobile" /></section>
    <DashboardStreamSections rows={streamRows.filter((row) => row.title === "Trending now")} loading={streamLoading} compact />
    <DashboardSportsSection catalog={sportsCatalog} loading={sportsLoading} compact />
    <RecentlyAddedSection compact products={products.slice(0, 3)} loading={productsLoading} error={productsError} />
    <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Events happening now</h2><Link to="/app/services/events">See all</Link></div><div className="mobile-media-strip">{mediaSections.filter((section) => section.slug === "events").map((section) => section.items.slice(0, 3).map((item, index) => <Link to={`/app/services/${section.slug}`} className="mobile-media-card" key={item}><img src={section.image} alt="" /><div>{section.badges ? <b>{section.badges[index]}</b> : null}<span>{item}</span><small>SMAJ Events</small></div></Link>))}</div></section>
  </>
);

const LifestyleMobileContent = ({ sellers, recentItems }: { products: Product[]; productsLoading: boolean; productsError: string; sellers: SellerCard[]; recentItems: RecentItem[]; recommendedServices: ServiceDefinition[]; streamRows: DashboardStreamRow[]; streamLoading: boolean; sportsCatalog: SportsCatalog; sportsLoading: boolean }) => (
  <>
    <section className="mobile-feed-section discovery-tab-intro"><span>EVERYDAY LIFE</span><h1>What would you like to do?</h1><p>Services organized around real needs instead of popularity.</p></section>
    {lifestyleGroups.map((group) => <section className="mobile-feed-section discovery-service-group" key={group.title}><div className="mobile-section-heading"><div><h2>{group.title}</h2><p>{group.description}</p></div></div><ServiceList services={group.slugs.map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[]} mode="mobile" /></section>)}
    <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Pick up where you left off</h2></div><div className="mobile-recent-strip">{recentItems.filter((item) => lifestyleSlugs.some((slug) => item.to.includes(slug))).slice(0, 3).map((item) => <Link className="mobile-recent-card" to={item.to} key={`${item.to}-${item.label}`}><span className="mobile-recent-icon">{recentItemIcon(item.to)}</span><ChevronRightOutlinedIcon className="mobile-recent-arrow" /><strong>{item.label}</strong><small>{item.meta && item.meta !== "Recent page" ? item.meta : "Recently viewed"}</small></Link>)}</div></section>
    <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Featured providers</h2></div><div className="mobile-services-grid">{sellers.slice(0, 3).map((seller) => <Link to={`/seller/${seller.id}`} key={seller.id}><div><strong>{seller.name}</strong><small>{seller.location}</small></div><small>{seller.rating} star • {seller.listings} listings</small></Link>)}</div></section>
    <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Health & education</h2></div><div className="mobile-feature-strip">{featureCards.filter((card) => card.slug === "health" || card.slug === "education").map((card) => <Link className="mobile-feature-card" to={card.slug === "store" ? "/store" : `/app/services/${card.slug}`} key={card.slug}><img src={card.image} alt="" /><div><h3>{card.title}</h3><p>{card.text}</p><span>Explore <ArrowForwardOutlinedIcon /></span></div></Link>)}</div></section>
  </>
);

const CategoriesMobileContent = (_props: { products: Product[]; productsLoading: boolean; productsError: string; sellers: SellerCard[]; recentItems: RecentItem[]; recommendedServices: ServiceDefinition[]; streamRows: DashboardStreamRow[]; streamLoading: boolean; sportsCatalog: SportsCatalog; sportsLoading: boolean }) => (
  <>
    <section className="mobile-feed-section discovery-tab-intro"><span>ALL SERVICES</span><h1>Explore by category</h1><p>Every SMAJ service, organized so you can find the right one quickly.</p></section>
    {categoryGroups.map((group) => <section className="mobile-feed-section discovery-service-group" key={group.title}><div className="mobile-section-heading"><div><h2>{group.title}</h2><p>{group.description} · {group.slugs.length} services</p></div></div><ServiceList services={group.slugs.map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[]} mode="mobile" /></section>)}
  </>
);

const DesktopDiscoveryContent = ({ activeTab, products, productsLoading, productsError, streamRows, streamLoading, sportsCatalog, sportsLoading }: { activeTab: Exclude<DiscoveryTab, "for-you">; products: Product[]; productsLoading: boolean; productsError: string; streamRows: DashboardStreamRow[]; streamLoading: boolean; sportsCatalog: SportsCatalog; sportsLoading: boolean }) => {
  if (activeTab === "trending") return <>
    <section className="desktop-feed-section discovery-tab-intro"><span>POPULAR NOW</span><h1>See what is happening across SMAJ</h1><p>Popular services, searches, entertainment, sports, and events in one live view.</p></section>
    <section className="desktop-feed-section"><div className="desktop-feed-section-head"><div><h2>Popular in SMAJ</h2><p>Beta ranking based on the services people explore most.</p></div><Link to="/app/services">See all</Link></div><ServiceList services={trendingSlugs.slice(0, 6).map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[]} mode="desktop" /></section>
    <DashboardStreamSections rows={streamRows.filter((row) => row.title === "Trending now")} loading={streamLoading} compact={false} />
    <DashboardSportsSection catalog={sportsCatalog} loading={sportsLoading} compact={false} />
    <RecentlyAddedSection products={products.slice(0, 6)} loading={productsLoading} error={productsError} />
  </>;
  const groups = activeTab === "lifestyle" ? lifestyleGroups : categoryGroups;
  return <>
    <section className="desktop-feed-section discovery-tab-intro"><span>{activeTab === "lifestyle" ? "EVERYDAY LIFE" : "ALL SERVICES"}</span><h1>{activeTab === "lifestyle" ? "What would you like to do?" : "Explore by category"}</h1><p>{activeTab === "lifestyle" ? "Services organized around real needs instead of popularity." : "Every SMAJ service, organized so you can find the right one quickly."}</p></section>
    {groups.map((group) => <section className="desktop-feed-section discovery-service-group" key={group.title}><div className="desktop-feed-section-head"><div><h2>{group.title}</h2><p>{group.description}{activeTab === "categories" ? ` · ${group.slugs.length} services` : ""}</p></div></div><ServiceList services={group.slugs.map((slug) => serviceCatalog.find((service) => service.slug === slug)).filter(Boolean) as ServiceDefinition[]} mode="desktop" /></section>)}
  </>;
};

const DashboardStreamCard = ({ item, compact }: { item: StreamCatalogTitle; compact: boolean }) => {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<StreamPlaybackVideo | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(
      entries => setVisible(Boolean(entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.65)),
      { threshold: [0, 0.65, 1] }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || attemptedRef.current) return;
    attemptedRef.current = true;
    let active = true;
    void getTitleAvailability(item.mediaType === "tv" ? "tv" : "movie", item.id)
      .then(availability => availability.available && availability.playbackId ? getStreamPlayback(availability.playbackId) : null)
      .then(playback => {
        if (active && playback?.playbackUrl && ["mp4", "hls"].includes(playback.sourceType)) setPreview(playback);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [item.id, item.mediaType, visible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !preview?.playbackUrl) return;
    let hls: Hls | null = null;
    if (preview.sourceType === "mp4") video.src = preview.playbackUrl;
    else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(preview.playbackUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = preview.playbackUrl;
    return () => hls?.destroy();
  }, [preview]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (visible) void video.play().catch(() => undefined);
    else video.pause();
  }, [preview, visible]);

  return <Link ref={cardRef} to={`/app/services/stream/${item.mediaType === "tv" ? "series" : "title"}/${item.id}`} className={compact ? "mobile-media-card" : "desktop-media-card"}>
    {preview ? <video ref={videoRef} muted playsInline loop preload="metadata" poster={item.backdropUrl || item.posterUrl || "/logo.png"} aria-label={`${item.title} autoplay preview`} /> : <img loading="lazy" src={item.backdropUrl || item.posterUrl || "/logo.png"} alt={`${item.title} artwork`} onError={(event) => { event.currentTarget.src = "/logo.png"; }} />}
    <div><b>{item.mediaType === "tv" ? "SERIES" : "MOVIE"}</b><span>{item.title}</span><small>{item.rating ? `★ ${item.rating.toFixed(1)}` : "New"}{item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ""}</small></div>
  </Link>;
};

const DashboardStreamSections = ({ rows, loading, compact }: { rows: DashboardStreamRow[]; loading: boolean; compact: boolean }) => {
  if (loading) return <section className={compact ? "mobile-feed-section" : "desktop-feed-section"}><div className={compact ? "mobile-section-heading" : "desktop-feed-section-head"}><div><h2>Watch anytime</h2><p>Loading movies and series...</p></div></div><PrivateSkeleton variant="grid" count={4} /></section>;
  if (!rows.length) return <section className={compact ? "mobile-feed-section" : "desktop-feed-section"}><div className={compact ? "mobile-section-heading" : "desktop-feed-section-head"}><div><h2>Watch anytime</h2><p>The live entertainment catalogue is temporarily unavailable.</p></div><Link to="/app/services/stream">Open Stream</Link></div></section>;
  return <>{rows.map((row) => <section className={compact ? "mobile-feed-section" : "desktop-feed-section"} key={row.title}>
    <div className={compact ? "mobile-section-heading" : "desktop-feed-section-head"}><div><h2>{row.title}</h2>{compact ? null : <p>{row.description}</p>}</div><Link to={row.seeAll}>See all</Link></div>
    <div className={compact ? "mobile-media-strip" : "desktop-media-grid"}>{row.items.map((item) => <DashboardStreamCard item={item} compact={compact} key={`${row.title}-${item.mediaType}-${item.id}`} />)}</div>
  </section>)}</>;
};
const MobileHome = ({ activeTab, onTabChange, products, productsLoading, productsError, sellers, recentItems, recommendedServices, streamRows, streamLoading, sportsCatalog, sportsLoading }: { activeTab: DiscoveryTab; onTabChange: (tab: DiscoveryTab) => void; products: Product[]; productsLoading: boolean; productsError: string; sellers: SellerCard[]; recentItems: RecentItem[]; recommendedServices: ServiceDefinition[]; streamRows: DashboardStreamRow[]; streamLoading: boolean; sportsCatalog: SportsCatalog; sportsLoading: boolean }) => {
  const [tabsPinned, setTabsPinned] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroImages, setHeroImages] = useState(fallbackHeroImages);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroReducedMotion, setHeroReducedMotion] = useState(false);
  const tabsAnchorRef = useRef<HTMLDivElement>(null);
  const heroTouchStartRef = useRef<number | null>(null);
  useEffect(() => {
    const updatePinnedState = () => {
      const anchor = tabsAnchorRef.current;
      if (anchor) setTabsPinned(anchor.getBoundingClientRect().top <= 0);
    };
    updatePinnedState();
    window.addEventListener("scroll", updatePinnedState, { passive: true });
    window.addEventListener("resize", updatePinnedState);
    return () => {
      window.removeEventListener("scroll", updatePinnedState);
      window.removeEventListener("resize", updatePinnedState);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setHeroReducedMotion(mediaQuery.matches);
    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);
    return () => mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (heroPaused || heroReducedMotion) return;
    const timer = window.setInterval(() => setHeroSlide((current) => (current + 1) % heroImages.length), 5500);
    return () => window.clearInterval(timer);
  }, [heroImages.length, heroPaused, heroReducedMotion]);

  useEffect(() => {
    void getHeroBanners("dashboard").then((banners) => {
      if (banners.length) { setHeroImages(banners.map((banner) => banner.image)); setHeroSlide(0); }
    }).catch(() => undefined);
  }, []);

  const handleHeroTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1 || (event.target instanceof Element && Boolean(event.target.closest("a, button")))) return;
    heroTouchStartRef.current = event.touches[0].clientX;
    setHeroPaused(true);
  };

  const handleHeroTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startX = heroTouchStartRef.current;
    heroTouchStartRef.current = null;
    setHeroPaused(false);
    if (startX === null || event.changedTouches.length !== 1) return;
    const distance = event.changedTouches[0].clientX - startX;
    if (Math.abs(distance) < 45) return;
    setHeroSlide((current) => (current + (distance < 0 ? 1 : heroImages.length - 1)) % heroImages.length);
  };

  const handleTabChange = (tab: DiscoveryTab) => {
    setTabsPinned(false);
    onTabChange(tab);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  return <div className="mobile-super-home">
    {activeTab === "for-you" ? <section className="mobile-home-hero" onTouchStart={handleHeroTouchStart} onTouchEnd={handleHeroTouchEnd}>
      <div className="mobile-home-hero-track" style={{ transform: `translateX(-${heroSlide * 100}%)`, transition: heroReducedMotion ? "none" : undefined }} aria-hidden="true">
        {heroImages.map((image) => <div className="mobile-home-hero-slide" style={{ backgroundImage: `url("${image}")` }} key={image} />)}
      </div>
      <div className="mobile-home-hero-copy"><span>WELCOME TO</span><h1>SMAJ PI HUB</h1><p>Everything you need. One place.</p><div className="mobile-hero-icons">{serviceCatalog.slice(0, 3).map((service) => <ServiceArt key={service.slug} index={service.atlasIndex} />)}<b>+12</b></div><Link to="/app/services">Explore <ArrowForwardOutlinedIcon /></Link></div>
      <div className="mobile-home-hero-dots" aria-label="Hero slides">{heroImages.map((_, index) => <button type="button" className={index === heroSlide ? "active" : ""} aria-label={`Show hero image ${index + 1}`} aria-current={index === heroSlide ? "true" : undefined} onClick={() => setHeroSlide(index)} key={index} />)}</div>
    </section> : null}
    <div ref={tabsAnchorRef} className={`mobile-home-tabs-anchor ${tabsPinned ? "is-pinned" : ""}`}><DiscoveryTabButtons className="mobile-home-tabs" activeTab={activeTab} onTabChange={handleTabChange} /></div>
    {activeTab === "for-you" ? <>
      <RecentlyAddedSection compact products={products} loading={productsLoading} error={productsError} />
      <FeaturedSellersSection compact sellers={sellers} loading={productsLoading} error={productsError} />
      <ActivityFeedSection compact products={products} loading={productsLoading} error={productsError} />
      <TrustSection compact />
      <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Suggested for you</h2><Link to="/app/services">See all</Link></div><div className="mobile-service-groups">{serviceGroups.map((group, index) => <div className="mobile-service-group" key={index}>{group.map((service) => <Link to={servicePath(service)} state={serviceLaunchNavigationState(service.slug)} className="mobile-service-app" key={service.slug}><ServiceArt index={service.atlasIndex} /><div><strong>{service.name}</strong><span>{service.items.slice(0, 2).join(" - ")}</span><small className={serviceBadgeClass(service, "rating")}>{getServiceLaunchLabel(service.slug)}</small></div></Link>)}</div>)}</div></section>
      <section className="mobile-feed-section"><div className="mobile-section-heading"><h2>Discover what's new</h2></div><div className="mobile-feature-strip">{featureCards.map((card) => <Link className="mobile-feature-card" to={card.slug === "store" ? "/store" : `/app/services/${card.slug}`} key={card.slug}><img src={card.image} alt="" />{card.slug === "store" ? <b className="live-card-badge feature-live-badge">LIVE</b> : null}<div><h3>{card.title}</h3><p>{card.text}</p><span>Explore <ArrowForwardOutlinedIcon /></span></div></Link>)}</div></section>
      <DashboardStreamSections rows={streamRows} loading={streamLoading} compact />
      <DashboardSportsSection catalog={sportsCatalog} loading={sportsLoading} compact />
      {mediaSections.filter((section) => section.slug !== "sports").map((section) => <section className="mobile-feed-section" key={section.slug}><div className="mobile-section-heading"><h2>{section.title}</h2></div><div className="mobile-media-strip">{section.items.map((item, index) => <Link to={`/app/services/${section.slug}`} className="mobile-media-card" key={item}><img src={section.image} alt="" /><div>{section.badges ? <b>{section.badges[index]}</b> : null}<span>{item}</span><small>SMAJ Events</small></div></Link>)}</div></section>)}
    </> : activeTab === "trending" ? <TrendingMobileContent products={products} productsLoading={productsLoading} productsError={productsError} sellers={sellers} recentItems={recentItems} recommendedServices={recommendedServices} streamRows={streamRows} streamLoading={streamLoading} sportsCatalog={sportsCatalog} sportsLoading={sportsLoading} /> : activeTab === "lifestyle" ? <LifestyleMobileContent products={products} productsLoading={productsLoading} productsError={productsError} sellers={sellers} recentItems={recentItems} recommendedServices={recommendedServices} streamRows={streamRows} streamLoading={streamLoading} sportsCatalog={sportsCatalog} sportsLoading={sportsLoading} /> : <CategoriesMobileContent products={products} productsLoading={productsLoading} productsError={productsError} sellers={sellers} recentItems={recentItems} recommendedServices={recommendedServices} streamRows={streamRows} streamLoading={streamLoading} sportsCatalog={sportsCatalog} sportsLoading={sportsLoading} />}
    <footer className="mobile-private-footer"><small>Part of the SMAJ Ecosystem</small><small>© 2026 SMAJ PI HUB. All rights reserved.</small></footer>
  </div>;
};

const DesktopFeedHome = ({ activeTab, onTabChange, products, productsLoading, productsError, sellers, recentItems, streamRows, streamLoading, sportsCatalog, sportsLoading }: { activeTab: DiscoveryTab; onTabChange: (tab: DiscoveryTab) => void; products: Product[]; productsLoading: boolean; productsError: string; sellers: SellerCard[]; recentItems: RecentItem[]; streamRows: DashboardStreamRow[]; streamLoading: boolean; sportsCatalog: SportsCatalog; sportsLoading: boolean }) => <div className="desktop-private-home desktop-feed-home">
  <section className="desktop-feed-hero"><div><p className="private-kicker">SMAJ PI HUB</p><h1>Everything you need.<br />One place.</h1><p>Discover services, products, media, support, and everyday tools from one connected dashboard.</p><div className="desktop-feed-hero-actions"><Link className="private-primary-button" to="/app/services">Explore Services <ArrowForwardOutlinedIcon /></Link><Link className="private-secondary-button" to="/store">Open SMAJ Store</Link></div></div><div className="desktop-feed-hero-icons">{serviceCatalog.slice(0, 6).map((service) => <Link key={service.slug} to={servicePath(service)} state={serviceLaunchNavigationState(service.slug)} title={service.name}><ServiceArt index={service.atlasIndex} /><em className={serviceBadgeClass(service)}>{getServiceLaunchLabel(service.slug)}</em></Link>)}</div></section>
  <DiscoveryTabButtons className="desktop-feed-tabs" activeTab={activeTab} onTabChange={onTabChange} />
  {activeTab === "for-you" ? <>
    <div className="desktop-feed-priority-grid">
      <ContinueSection items={recentItems} />
      <PopularSearchSection />
    </div>
    <RecentlyAddedSection products={products} loading={productsLoading} error={productsError} />
    <div className="desktop-feed-priority-grid">
      <FeaturedSellersSection sellers={sellers} loading={productsLoading} error={productsError} />
      <TrustSection />
    </div>
    <div className="desktop-feed-layout"><div className="desktop-feed-main">
      <ActivityFeedSection products={products} loading={productsLoading} error={productsError} />
      <section className="desktop-feed-section"><div className="desktop-feed-section-head"><div><h2>Suggested for you</h2><p>Fast access to the core SMAJ services.</p></div><Link to="/app/services">See all</Link></div><ServiceList services={serviceCatalog.slice(0, 6)} mode="desktop" /></section>
      <section className="desktop-feed-section"><div className="desktop-feed-section-head"><div><h2>Discover what's new</h2><p>Fresh entry points into useful services.</p></div></div><div className="desktop-feature-grid">{featureCards.map((card) => <Link className="desktop-feature-card" to={card.slug === "store" ? "/store" : `/app/services/${card.slug}`} key={card.slug}><img src={card.image} alt="" />{card.slug === "store" ? <b className="live-card-badge feature-live-badge">LIVE</b> : null}<div><h3>{card.title}</h3><p>{card.text}</p><span>Explore <ArrowForwardOutlinedIcon /></span></div></Link>)}</div></section>
      <DashboardStreamSections rows={streamRows} loading={streamLoading} compact={false} />
      <DashboardSportsSection catalog={sportsCatalog} loading={sportsLoading} compact={false} />
      {mediaSections.filter((section) => section.slug !== "sports").map((section) => <section className="desktop-feed-section" key={section.slug}><div className="desktop-feed-section-head"><div><h2>{section.title}</h2><p>Tickets, events, and local experiences.</p></div></div><div className="desktop-media-grid">{section.items.map((item, index) => <Link to={`/app/services/${section.slug}`} className="desktop-media-card" key={item}><img src={section.image} alt="" /><div>{section.badges ? <b>{section.badges[index]}</b> : null}<span>{item}</span><small>SMAJ Events</small></div></Link>)}</div></section>)}
    </div><aside className="desktop-feed-side"><section><strong>Why SMAJ PI HUB?</strong><div>{why.map(([Icon, title, text]) => <article key={title}><Icon /><span><b>{title}</b><small>{text}</small></span></article>)}</div></section></aside></div>
  </> : <div className="desktop-discovery-content"><DesktopDiscoveryContent activeTab={activeTab} products={products} productsLoading={productsLoading} productsError={productsError} streamRows={streamRows} streamLoading={streamLoading} sportsCatalog={sportsCatalog} sportsLoading={sportsLoading} /></div>}
  <section className="desktop-feed-experience"><div><p className="private-kicker">ONE SIMPLE EXPERIENCE</p><h2>Experience SMAJ PI HUB</h2><p>Everything connected in one simple experience.</p></div><div>{[["Discover", "Explore services in one place"], ["Connect", "Use services and manage activities"], ["Manage", "Your profile, wallet, and settings"]].map(([title, text], index) => <article key={title}><ServiceArt index={[0, 8, 14][index]} /><h3>{title}</h3><p>{text}</p></article>)}</div></section>
  <footer className="private-home-footer"><span>Part of the SMAJ Ecosystem</span><span>(c) 2026 SMAJ PI HUB. All rights reserved.</span></footer>
</div>;

const DashboardPage = () => {
  const { user } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const initialTab = discoveryTabs.some(([, tab]) => tab === params.get("tab")) ? params.get("tab") as DiscoveryTab : "for-you";
  const [activeTab, setActiveTabState] = useState<DiscoveryTab>(initialTab);
  const [products, setProducts] = useState<Product[]>(() => dashboardProductsCache || []);
  const [productsLoading, setProductsLoading] = useState(dashboardProductsCache === null);
  const [productsError, setProductsError] = useState("");
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [streamRows, setStreamRows] = useState<DashboardStreamRow[]>(() => dashboardStreamRowsCache || []);
  const [streamLoading, setStreamLoading] = useState(dashboardStreamRowsCache === null);
  const { catalog: sportsCatalog, loading: sportsLoading } = useSportsCatalog();
  const setActiveTab = useCallback((tab: DiscoveryTab) => {
    setActiveTabState(tab);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === "for-you") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true });
  }, [setParams]);
  const loadProducts = useCallback(async (showSkeleton = false) => {
    if (showSkeleton && dashboardProductsCache === null) setProductsLoading(true);
    try {
      const { data } = await axiosClient.get<{ products: Product[] }>("/marketplace/products");
      const nextProducts = sortNewestProducts(data.products || []);
      dashboardProductsCache = nextProducts;
      setProducts(nextProducts);
      setProductsError("");
    } catch {
      if (dashboardProductsCache === null) {
        setProducts([]);
        setProductsError("Live marketplace data is not available right now.");
      }
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    setRecentItems([
      ...readRecentItems("smaj_recent_products"),
      ...readRecentItems("smaj_recent_services"),
      ...readRecentItems("smaj_recent_pages"),
    ].filter((item, index, items) => items.findIndex((candidate) => candidate.to === item.to) === index).slice(0, 6));
  }, []);

  useEffect(() => {
    const nextTab = discoveryTabs.some(([, tab]) => tab === params.get("tab")) ? params.get("tab") as DiscoveryTab : "for-you";
    setActiveTabState(nextTab);
  }, [params]);

  useEffect(() => {
    void loadProducts(true);
  }, [loadProducts]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getStreamCatalog("trending"),
      getStreamCatalog("series"),
      getStreamCatalog("movies", 1, "primary_release_date.desc"),
    ]).then(([trending, series, releases]) => {
      if (!active) return;
      const usable = (items: StreamCatalogTitle[]) => items.filter((item) => item.posterUrl || item.backdropUrl).slice(0, 8);
      const nextRows = [
        { title: "Trending now", description: "Movies and series people are watching now.", seeAll: "/app/services/stream", items: usable(trending.results) },
        { title: "Popular series", description: "Popular shows ready to discover.", seeAll: "/app/services/stream/series", items: usable(series.results) },
        { title: "New releases", description: "Recently released entertainment.", seeAll: "/app/services/stream/movies", items: usable(releases.results) },
      ].filter((row) => row.items.length);
      dashboardStreamRowsCache = nextRows;
      setStreamRows(nextRows);
    }).catch(() => {
      if (active && dashboardStreamRowsCache === null) setStreamRows([]);
    }).finally(() => active && setStreamLoading(false));
    return () => { active = false; };
  }, []);

  const sellers = useMemo(() => {
    const map = new Map<string, SellerCard>();
    products.forEach((product) => {
      if (!product.sellerId) return;
      const existing = map.get(product.sellerId);
      if (existing) {
        existing.listings += 1;
        return;
      }
      map.set(product.sellerId, {
        id: product.sellerId,
        name: product.sellerName || product.piUsername || "Pi seller",
        location: product.location || product.country || "Global",
        rating: (product.rating || 4.6).toFixed(1),
        listings: 1,
        avatar: product.sellerAvatar,
        verificationLevel: product.verificationLevel,
        verificationStatus: product.verificationStatus,
      });
    });
    const realSellers = Array.from(map.values()).sort((a, b) => b.listings - a.listings).slice(0, 4);
    return realSellers.length ? realSellers : trustedFallbackSellers;
  }, [products]);

  const recommendedServices = useMemo(() => recommendedServicesForCountry(user?.country), [user?.country]);
  const dashboardLoading = productsLoading || streamLoading || sportsLoading;

  useEffect(() => {
    if (!dashboardLoading) dashboardStartupComplete = true;
  }, [dashboardLoading]);

  if (!dashboardStartupComplete && dashboardLoading) return <main className="dashboard-circle-loading" role="status" aria-live="polite" aria-label="Opening dashboard"><span /></main>;

  return <main className="private-home"><LanguageSoonButton dashboardPrompt /><PullToRefresh onRefresh={() => loadProducts(false)} /><DesktopFeedHome activeTab={activeTab} onTabChange={setActiveTab} products={products} productsLoading={productsLoading} productsError={productsError} sellers={sellers} recentItems={recentItems} streamRows={streamRows} streamLoading={streamLoading} sportsCatalog={sportsCatalog} sportsLoading={sportsLoading} /><MobileHome activeTab={activeTab} onTabChange={setActiveTab} products={products} productsLoading={productsLoading} productsError={productsError} sellers={sellers} recentItems={recentItems} recommendedServices={recommendedServices} streamRows={streamRows} streamLoading={streamLoading} sportsCatalog={sportsCatalog} sportsLoading={sportsLoading} /></main>;
};

export default DashboardPage;
