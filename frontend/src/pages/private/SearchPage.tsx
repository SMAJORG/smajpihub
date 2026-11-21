import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import LiveTvOutlinedIcon from "@mui/icons-material/LiveTvOutlined";
import SportsSoccerOutlinedIcon from "@mui/icons-material/SportsSoccerOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import VolunteerActivismOutlinedIcon from "@mui/icons-material/VolunteerActivismOutlined";
import { privateSearchItems, privateSearchPopular } from "../../content/privateSearch";
import { serviceCatalog } from "../../content/serviceCatalog";
import { axiosClient } from "../../lib/axiosClient";
import type { Product } from "../../types/marketplace";
import CommunitySkeleton from "../../components/CommunitySkeleton";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import TrustBadge from "../../components/TrustBadge";
import { useAuthContext } from "../../contexts/AuthContext";
import { toggleCommunityFollow } from "../../lib/communityApi";
import "./community.css";

const explore = [
  ["Shopping", ShoppingBagOutlinedIcon, "/store"], ["Stream", LiveTvOutlinedIcon, "/app/services/stream"], ["Sports", SportsSoccerOutlinedIcon, "/app/services/sports"], ["Food", RestaurantOutlinedIcon, "/app/services/food"],
  ["Jobs", WorkOutlineOutlinedIcon, "/app/services/jobs"], ["Education", SchoolOutlinedIcon, "/app/services/education"], ["Health", HealthAndSafetyOutlinedIcon, "/app/services/health"], ["Transport", DirectionsCarOutlinedIcon, "/app/services/transport"],
  ["Events", EventOutlinedIcon, "/app/services/events"], ["Wallet", AccountBalanceWalletOutlinedIcon, "/app/wallet"], ["Housing", HomeWorkOutlinedIcon, "/app/services/housing"], ["Charity", VolunteerActivismOutlinedIcon, "/app/services/charity"],
] as const;
const suggestions = ["Mobile payments", "Sports tickets", "Food delivery", "Online shopping", "Find jobs", "Health services", "Movies", "Property rentals"];
const RECENT_SEARCHES_KEY = "smaj_recent_searches";
type SearchUser = { uid: string; username?: string; piUsername?: string; displayName: string; country?: string; role?: string; sellerActive?: boolean; avatar?: string; activeAvatarFrame?: "ambassador" | "open_to_work" | "seller" | "hiring" | null; allowContact?: boolean; following?: boolean };
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void;
  onerror: () => void;
  start: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const readLocalRecentSearches = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => typeof item === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
};

const SearchPage = () => {
  const { user: viewer } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") || "";
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedSearch, setHasLoadedSearch] = useState(false);
  const [resultsQuery, setResultsQuery] = useState("");
  const [error, setError] = useState("");
  const [followError, setFollowError] = useState("");
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  useEffect(() => {
    setRecentSearches(readLocalRecentSearches());
    axiosClient.get<{ searches: string[] }>("/user/recent-searches").then(({ data }) => {
      const searches = data.searches || [];
      setRecentSearches(searches);
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const next = params.get("q") || "";
    if (next !== query) {
      setInput(next);
      setQuery(next);
    }
  }, [params]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const term = input.trim();
      setQuery(term);
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (term) next.set("q", term);
        else next.delete("q");
        return next;
      }, { replace: true });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [input, setParams]);

  useEffect(() => {
    if (!query) {
      setProducts([]);
      setUsers([]);
      setError("");
      setLoading(false);
      setHasLoadedSearch(false);
      setResultsQuery("");
      return;
    }

    let mounted = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      axiosClient.get<{ products: Product[] }>("/marketplace/products", { params: { search: query, sort: "newest" }, signal: controller.signal }),
      axiosClient.get<{ users: SearchUser[] }>("/user/search", { params: { q: query }, signal: controller.signal }),
    ]).then(([productResponse, userResponse]) => {
      if (!mounted) return;
      setProducts(productResponse.data.products || []);
      setUsers(userResponse.data.users || []);
      setResultsQuery(query);
      setHasLoadedSearch(true);
    }).catch(() => {
      if (!mounted) return;
      setError("Search is not available right now. Please try again.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; controller.abort(); };
  }, [query]);

  const saveRecentSearch = (value: string) => {
    const term = value.trim();
    if (!term) return;
    const searches = [term, ...recentSearches.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 10);
    setRecentSearches(searches);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
    axiosClient.post<{ searches: string[] }>("/user/recent-searches", { query: term }).then(({ data }) => {
      const next = data.searches || searches;
      setRecentSearches(next);
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    }).catch(() => undefined);
  };

  const runSearch = (value: string) => {
    const term = value.trim();
    setInput(term);
    setQuery(term);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (term) next.set("q", term);
      else next.delete("q");
      return next;
    }, { replace: true });
    saveRecentSearch(term);
  };

  const updateSearchInput = (value: string) => {
    setInput(value);
    setQuery(value.trim());
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
    axiosClient.delete("/user/recent-searches").catch(() => undefined);
  };

  const toggleFollow = async (target: SearchUser) => {
    if (followBusy || target.uid === viewer?.uid) return;
    setFollowBusy(target.uid);
    setFollowError("");
    try {
      const following = await toggleCommunityFollow(target.uid);
      setUsers(current => current.map(item => item.uid === target.uid ? { ...item, following } : item));
    } catch {
      setFollowError("Follow status could not be changed. Please try again.");
    } finally {
      setFollowBusy(null);
    }
  };

  const startVoiceSearch = () => {
    const speechWindow = window as unknown as { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice search is not available in this browser yet.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) runSearch(transcript);
    };
    recognition.onerror = () => setError("Voice search could not start. Please type your search.");
    recognition.start();
  };

  const submit = (event: FormEvent) => { event.preventDefault(); runSearch(input); };
  const displayedQuery = hasLoadedSearch ? resultsQuery : query;
  const grouped = useMemo(() => {
    if (!displayedQuery) return [];
    const needle = displayedQuery.toLowerCase();
    const services = serviceCatalog.filter((item) => [item.name, item.description, ...item.items].join(" ").toLowerCase().includes(needle)).map((item) => ({ label:item.name, to:item.live ? "/store" : `/app/services/${item.slug}` }));
    const productResults = products.map((product) => ({ label: product.title, to: `/product/${product._id}` }));
    const sellers = users.filter((user) => user.sellerActive || user.role === "seller").map((user) => ({ label: `${user.displayName}${user.country ? ` - ${user.country}` : ""}`, to: `/seller/${user.uid}` }));
    return [
      ["Services", services],
      ["Products", productResults.length ? productResults : [{ label:`Search products for “${displayedQuery}”`, to:`/store?search=${encodeURIComponent(displayedQuery)}` }]],
      ["Sellers", sellers],
      ["Help", privateSearchItems.filter((item) => [item.label,...item.keywords].join(" ").toLowerCase().includes(needle)).map(({ label,to }) => ({ label,to }))],
    ] as const;
  }, [displayedQuery, products, users]);
  const hasResults = grouped.some(([, items]) => items.length);

  return <main className="private-page mobile-search-page">
    <form className="mobile-search-box" onSubmit={submit}><SearchOutlinedIcon /><input autoFocus value={input} onChange={(event) => updateSearchInput(event.target.value)} placeholder="Search or ask SMAJ PI HUB" /><button type="button" aria-label="Voice search" onClick={startVoiceSearch}><MicNoneOutlinedIcon /></button></form>
    {!query ? <>
      <section className="mobile-search-section"><h1>Explore services</h1><div className="mobile-explore-grid">{explore.map(([label,Icon,to]) => <Link to={to} key={label}><span>{label}</span><Icon /></Link>)}</div></section>
      {recentSearches.length ? <section className="mobile-search-section"><div className="mobile-search-result-head"><h2>Recent searches</h2><button type="button" onClick={clearRecentSearches}>Clear All</button></div><div className="mobile-suggestion-grid">{recentSearches.map((item) => <button type="button" key={item} onClick={() => runSearch(item)}><span>{item}</span><SearchOutlinedIcon /></button>)}</div></section> : null}
      <section className="mobile-search-section"><h2>Trending searches</h2><div className="mobile-suggestion-grid">{suggestions.map((item) => <button type="button" key={item} onClick={() => runSearch(item)}><span>{item}</span><SearchOutlinedIcon /></button>)}</div></section>
    </> : <section className="mobile-search-results" aria-busy={loading}>
      <div className="mobile-search-result-head"><h1>Results for “{displayedQuery || query}”</h1><button onClick={() => runSearch("")}>Clear</button></div>
      {loading && !hasLoadedSearch ? <CommunitySkeleton variant="search" count={5} /> : <>
        {loading ? <p className="community-search-refresh" role="status">Updating results for “{query}”…</p> : null}
        {error ? <section className="community-error" role="alert"><h2>Search error</h2><p>{error}</p></section> : null}
        {hasResults || users.length ? <>{grouped.map(([group,items]) => items.length ? <section key={group}><h2>{group}</h2>{items.map((item) => <Link key={`${group}-${item.label}`} to={item.to} onClick={() => saveRecentSearch(displayedQuery)}>{item.label}</Link>)}</section> : null)}{users.length ? <section className="people-search-results"><h2>People</h2>{followError ? <p className="community-error" role="alert">{followError}</p> : null}{users.map(person => <article className="people-search-card" key={person.uid}><Link to={`/people/${encodeURIComponent(person.uid)}`} className="people-search-identity" onClick={() => saveRecentSearch(displayedQuery)}><UserAvatarFrame name={person.displayName} image={person.avatar} frame={person.uid === viewer?.uid ? viewer.activeAvatarFrame : person.activeAvatarFrame} size={56} /><span><strong>{person.displayName}<TrustBadge userId={person.uid} /></strong><small>@{person.piUsername || person.username}{person.country ? ` · ${person.country}` : ""}</small></span></Link><div className="people-search-actions"><button type="button" disabled={followBusy === person.uid || person.uid === viewer?.uid} onClick={() => void toggleFollow(person)}>{person.uid === viewer?.uid ? "You" : person.following ? "Following" : "Follow"}</button>{person.uid !== viewer?.uid && person.allowContact ? <Link to={`/messages?${new URLSearchParams({ recipient: person.uid, name: person.displayName, avatar: person.avatar || "" })}`}>Message</Link> : person.uid !== viewer?.uid ? <span>Messages off</span> : null}</div></article>)}</section> : null}</> : error ? null : <section><h2>No results</h2><Link to="/categories">No results found. Try another keyword or browse categories.</Link></section>}
      </>}
    </section>}
    <div className="search-desktop-fallback"><h2>Popular</h2>{privateSearchPopular.map((item) => <Link key={item.label} to={item.to}>{item.label}</Link>)}</div>
  </main>;
};

export default SearchPage;
