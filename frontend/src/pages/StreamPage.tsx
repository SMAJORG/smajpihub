import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FavoriteBorderRoundedIcon from "@mui/icons-material/FavoriteBorderRounded";
import "./StreamPage.css";
import StreamHeader from "./stream/StreamHeader";
import { getStreamCatalog, getStreamCategory, getStreamDownloads, saveStreamDownload, searchStreamCatalog, type StreamCatalogTitle } from "../lib/streamCatalog";
import { getStreamCreators, getStreamSubscriptionStatus, subscribeToStreamChannel, unsubscribeFromStreamChannel, type StreamCreatorDirectoryItem } from "../lib/streamChannel";
import { getPublishedLiveInputs, publishedLivePlaybackPath, type PublishedLiveInput } from "../lib/streamLive";
import { getPopularStreamReviews, toggleStreamReviewLike, type StreamReview } from "../lib/streamReviews";

type StreamItem = {
  id: number;
  title: string;
  creator: string;
  category: string;
  viewers: string;
  live?: boolean;
  duration?: string;
  tone: string;
  initials: string;
};

const streams: StreamItem[] = [
  { id: 1, title: "Building the future with Pi", creator: "SMAJ Studio", category: "Technology", viewers: "12.8K", live: true, tone: "violet", initials: "SS" },
  { id: 2, title: "Afrobeats sunset session", creator: "Maya Live", category: "Music", viewers: "8.2K", live: true, tone: "sunset", initials: "ML" },
  { id: 3, title: "Championship watch party", creator: "Sport Central", category: "Sports", viewers: "6.7K", live: true, tone: "pitch", initials: "SC" },
  { id: 4, title: "Street food across Lagos", creator: "Taste Journey", category: "Lifestyle", viewers: "142K views", duration: "18:24", tone: "food", initials: "TJ" },
  { id: 5, title: "The creator economy, explained", creator: "Build Better", category: "Learning", viewers: "89K views", duration: "12:08", tone: "blue", initials: "BB" },
  { id: 6, title: "Indie films you should know", creator: "Frame by Frame", category: "Film", viewers: "51K views", duration: "24:31", tone: "cinema", initials: "FF" },
  { id: 7, title: "Morning movement & balance", creator: "Nia Wellness", category: "Wellness", viewers: "34K views", duration: "16:42", tone: "mint", initials: "NW" },
  { id: 8, title: "Designing products people love", creator: "Made Simple", category: "Technology", viewers: "76K views", duration: "20:15", tone: "coral", initials: "MS" },
];

const onDemand = streams.filter((item) => !item.live);

const fallbackMovieRows = [
  { title: "Trending now", id: "movies", items: onDemand },
  { title: "SMAJ Original movies", id: "originals", items: [...onDemand].reverse() },
  { title: "Series worth watching", id: "series", items: [...onDemand.slice(2), ...onDemand.slice(0, 2)] },
];

const StreamHomeSkeleton = () => (
  <div className="stream-home-skeleton" role="status" aria-label="Loading Stream catalogue">
    <section className="stream-skeleton-hero"><i /><div><b /><b /><b /><span /></div></section>
    <section className="stream-skeleton-row"><header><b /><i /></header><div>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div></section>
    <section className="stream-skeleton-row live"><header><b /><i /></header><div>{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div></section>
    <section className="stream-skeleton-row"><header><b /><i /></header><div>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div></section>
  </div>
);

type StreamPageProps = {
  embedded?: boolean;
  categorySlug?: string;
};

const categoryLabels: Record<string, string> = { trending: "Trending", movies: "Movies", series: "Series", "tv-channels": "TV Shows", hollywood: "Hollywood", bollywood: "Bollywood", nollywood: "Nollywood", kannywood: "Kannywood", anime: "Anime", "k-drama": "K-Drama", "chinese-drama": "Chinese Drama", "african-movies": "African Movies", documentaries: "Documentaries", kids: "Kids & Family", action: "Action", comedy: "Comedy", romance: "Romance", horror: "Horror", sports: "Sports", wwe: "WWE / Wrestling" };

const catalogKey = (item: StreamCatalogTitle) => `${item.mediaType}-${item.id}`;
const uniqueCatalogTitles = (items: StreamCatalogTitle[], excluded = new Set<string>()) => {
  const identities = new Set(excluded);
  const posters = new Set<string>();
  return items.filter((item) => {
    const identity = catalogKey(item);
    if (!item.posterUrl || identities.has(identity) || posters.has(item.posterUrl)) return false;
    identities.add(identity);
    posters.add(item.posterUrl);
    return true;
  });
};

const StreamPage = ({ categorySlug }: StreamPageProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [showEntryLoader] = useState(() => location.state?.streamEntry === true || navigationType === "PUSH");
  const params = useParams();
  const activeSlug = categorySlug || params.slug || "trending";
  const categoryLabel = categoryLabels[activeSlug] || activeSlug.split("-").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ");
  const categoryMode = activeSlug !== "trending";
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<StreamItem | null>(null);
  const [catalog, setCatalog] = useState<Record<"trending" | "movies" | "series", StreamCatalogTitle[]>>({ trending: [], movies: [], series: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [creators, setCreators] = useState<StreamCreatorDirectoryItem[]>([]);
  const [followedCreators, setFollowedCreators] = useState<Set<string>>(() => new Set());
  const [savingFollow, setSavingFollow] = useState("");
  const [reviews, setReviews] = useState<StreamReview[]>([]);
  const [anime, setAnime] = useState<StreamCatalogTitle[]>([]);
  const [downloadingId, setDownloadingId] = useState("");
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(() => new Set());
  const [downloadError, setDownloadError] = useState("");
  const [liveNow, setLiveNow] = useState<PublishedLiveInput[]>([]);
  const [streamReady, setStreamReady] = useState(() => navigationType !== "PUSH");
  const loadStartTime = useRef(Date.now());

  useEffect(() => { setFeatureIndex(0); }, [activeSlug]);

  useEffect(() => {
    let active = true;
    setCatalog({ trending: [], movies: [], series: [] });
    setCatalogError(false);
    setCatalogLoading(true);
    const requests = activeSlug === "trending"
      ? [getStreamCatalog("trending"), getStreamCatalog("movies"), getStreamCatalog("series")]
      : activeSlug === "movies" || activeSlug === "series"
        ? [getStreamCatalog(activeSlug), getStreamCatalog(activeSlug, 1, "primary_release_date.desc"), getStreamCatalog(activeSlug, 1, "vote_average.desc")]
        : [getStreamCategory(activeSlug), getStreamCategory(activeSlug, 1, "primary_release_date.desc"), getStreamCategory(activeSlug, 1, "vote_average.desc")];
    Promise.all(requests)
      .then(([trending, movies, series]) => {
        if (!active) return;
        setCatalog({ trending: trending.results, movies: movies.results, series: series.results });
        setCatalogError(false);
      })
      .catch(() => active && setCatalogError(true))
      .finally(() => active && setCatalogLoading(false));
    return () => { active = false; };
  }, [activeSlug]);

  useEffect(() => {
    if (!catalogLoading) {
      const elapsed = Date.now() - loadStartTime.current;
      const remaining = Math.max(0, 800 - elapsed);
      const timer = window.setTimeout(() => setStreamReady(true), remaining);
      return () => window.clearTimeout(timer);
    }
  }, [catalogLoading]);

  useEffect(() => {
    void searchStreamCatalog("Anime").then((data) => setAnime(data.results)).catch(() => setAnime([]));
    void getStreamCreators().then(async (items) => {
      setCreators(items);
      const statuses = await Promise.all(items.slice(0, 6).map(async creator => [creator.channel.handle, await getStreamSubscriptionStatus(creator.channel.handle).catch(() => false)] as const));
      setFollowedCreators(new Set(statuses.filter(([, followed]) => followed).map(([handle]) => handle)));
    }).catch(() => setCreators([]));
    void getPopularStreamReviews().then(setReviews).catch(() => setReviews([]));
  }, []);
  useEffect(() => { void getPublishedLiveInputs().then(items => setLiveNow(items.filter(item => item.processingStatus === "live"))).catch(() => setLiveNow([])); }, []);
  useEffect(() => {
    void getStreamDownloads()
      .then((items) => setDownloadedIds(new Set(items.map(catalogKey))))
      .catch(() => undefined);
  }, []);

  const featuredTitles = useMemo(() => {
    const identities = new Set<string>();
    const backdrops = new Set<string>();
    return catalog.trending.filter((item) => {
      const identity = catalogKey(item);
      if (!item.backdropUrl || identities.has(identity) || backdrops.has(item.backdropUrl)) return false;
      identities.add(identity);
      backdrops.add(item.backdropUrl);
      return true;
    }).slice(0, 6);
  }, [catalog.trending]);
  useEffect(() => { if (featuredTitles.length < 2) return; const timer = window.setInterval(() => setFeatureIndex((index) => (index + 1) % featuredTitles.length), 7000); return () => window.clearInterval(timer); }, [featuredTitles.length]);

  const featured = featuredTitles[featureIndex] ?? catalog.movies.find((item) => item.backdropUrl);
  const rankedSeries = categoryMode ? catalog.trending : catalog.series;
  const toggleCreatorFollow = async (handle: string) => {
    if (savingFollow) return;
    setSavingFollow(handle);
    try {
      if (followedCreators.has(handle)) await unsubscribeFromStreamChannel(handle);
      else await subscribeToStreamChannel(handle);
      setFollowedCreators(current => {
        const next = new Set(current);
        if (next.has(handle)) next.delete(handle); else next.add(handle);
        return next;
      });
    } finally { setSavingFollow(""); }
  };
  const likeReview = async (reviewId: string) => {
    try {
      const result = await toggleStreamReviewLike(reviewId);
      setReviews(current => current.map(review => review._id === reviewId ? { ...review, likes: result.likes } : review));
    } catch { /* Keep the review readable if a guest cannot react. */ }
  };
  const downloadFeatured = async () => {
    if (!featured || downloadedIds.has(catalogKey(featured))) return;
    const key = catalogKey(featured);
    setDownloadingId(key);
    setDownloadError("");
    try {
      await saveStreamDownload(featured);
      setDownloadedIds((current) => new Set(current).add(key));
    } catch {
      setDownloadError("Download could not be saved. Please try again.");
    } finally {
      setDownloadingId("");
    }
  };
  const catalogRows = useMemo(() => {
    if (!catalog.trending.length) return categoryMode ? [] : fallbackMovieRows;
    const definitions = categoryMode ? [
      { title: `Popular ${categoryLabel}`, id: "popular", items: catalog.trending },
      { title: `New ${categoryLabel} Releases`, id: "new", items: catalog.movies },
      { title: `Top Rated ${categoryLabel}`, id: "top-rated", items: catalog.series },
    ] : [
      { title: "Trending Movies", id: "trending", items: catalog.trending.filter((item) => item.mediaType === "movie") },
      { title: "Popular movies", id: "movies", items: catalog.movies },
      { title: "Popular series", id: "series", items: catalog.series },
      { title: "New Releases", id: "new", items: [...catalog.movies].sort((a,b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""))) },
      { title: "Top Rated", id: "top-rated", items: [...catalog.movies, ...catalog.series].sort((a,b) => (b.rating || 0) - (a.rating || 0)) },
      { title: "Anime", id: "anime", items: anime },
    ];
    const heroIds = new Set(featuredTitles.map(catalogKey));
    let previousRowIds = new Set<string>();
    return definitions.map((row) => {
      const items = uniqueCatalogTitles(row.items, new Set([...heroIds, ...previousRowIds])).slice(0, 20);
      previousRowIds = new Set(items.map(catalogKey));
      return { ...row, items };
    }).filter((row) => row.items.length);
  }, [anime, catalog.movies, catalog.series, catalog.trending, categoryLabel, categoryMode, featuredTitles]);

  useEffect(() => {
    if (location.state?.streamEntry === true) {
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const experience = (
    <>
      {!streamReady ? <div className="store-loading-overlay" aria-label="Opening SMAJ Stream" aria-live="polite"><div className="store-loading-spinner" /><span>Opening stream...</span></div> : null}
      {showEntryLoader && catalogLoading && activeSlug === "trending" ? (
        <div className="stream-opening-loader" role="status" aria-live="polite" aria-label="Opening SMAJ Stream">
          <div className="stream-opening-loader-content">
            <div className="stream-opening-mark"><i /><i /><span><PlayArrowRoundedIcon /></span></div>
            <h1>SMAJ STREAM</h1>
            <strong>Watch differently. Create freely.</strong>
            <p>Discover movies, live channels, and original creators.</p>
            <small>Preparing your Stream…</small>
            <div className="stream-opening-progress"><i /></div>
          </div>
        </div>
      ) : null}
      <main className="stream-page">
        <StreamHeader query={query} onQueryChange={setQuery} />

        {catalogLoading ? <StreamHomeSkeleton /> : <>
        <section className="stream-hero compact" id="discover" onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)} onTouchEnd={(event) => { if (touchStart === null || featuredTitles.length < 2) return; const delta = (event.changedTouches[0]?.clientX || 0) - touchStart; if (Math.abs(delta) > 45) setFeatureIndex((index) => (index + (delta < 0 ? 1 : featuredTitles.length - 1)) % featuredTitles.length); setTouchStart(null); }} style={featured?.backdropUrl ? { backgroundImage: `url(${featured.backdropUrl})` } : undefined}>
          <div className="stream-hero-content">
            <span className="stream-eyebrow">{categoryLabel.toUpperCase()} FEATURED · {featured?.mediaType === "tv" ? "SERIES" : "MOVIE"}</span>
            <h1>{featured?.title ?? (catalogLoading ? `Loading ${categoryLabel}…` : `${categoryLabel} is unavailable`)}</h1>
            <p>{featured?.overview || (catalogLoading ? "Finding the best titles for this category." : "We could not load this category right now. Please try again shortly.")}</p>
            <div className="stream-hero-actions">
              {featured ? <Link className="stream-primary-action" to={`/app/services/stream/${featured.mediaType === "tv" ? "series" : "title"}/${featured.id}?autoplay=1`}><PlayArrowRoundedIcon /> Watch now</Link> : null}
              {featured ? <button type="button" disabled={downloadingId === catalogKey(featured) || downloadedIds.has(catalogKey(featured))} onClick={() => void downloadFeatured()}><DownloadRoundedIcon /> {downloadingId === catalogKey(featured) ? "Downloading…" : downloadedIds.has(catalogKey(featured)) ? "Downloaded" : "Download"}</button> : null}
            </div>
            {downloadError ? <small className="stream-download-error" role="alert">{downloadError}</small> : null}
            <div className="stream-hero-meta"><span><b>{featured?.rating ? `${Math.round(featured.rating * 10)}% rating` : "Featured"}</b></span><span>{featured?.releaseDate?.slice(0, 4) || "New"}</span><span>{featured?.mediaType === "tv" ? "Series" : "Movie"}</span><span>TMDB</span></div>
          </div>
          <div className="stream-hero-dots" aria-label="Featured titles">{featuredTitles.map((item, index) => <button key={item.id} type="button" className={index === featureIndex ? "active" : ""} onClick={() => setFeatureIndex(index)} aria-label={`Show ${item.title}`} />)}</div>
        </section>

        <section className="stream-rankings"><div className="stream-row-heading"><h2>{categoryMode ? `${categoryLabel} Rankings` : "Series Rankings"}</h2><Link to="/app/services/stream/categories">See all →</Link></div><div className="stream-ranking-rail">{rankedSeries.slice(0, 10).map((item, index) => <Link to={`/app/services/stream/${item.mediaType === "tv" ? "series" : "title"}/${item.id}`} key={`${item.mediaType}-${item.id}`}><b>{index + 1}</b><img loading="lazy" src={item.posterUrl || ""} alt=""/><span>{item.title}</span><small>{item.rating ? `★ ${item.rating}` : item.releaseDate?.slice(0,4) || "New"}</small></Link>)}</div></section>

        {!categoryMode ? <section className="stream-live-now-row"><div className="stream-row-heading"><div><h2>What's On Now</h2><p>Live TV</p></div><Link to="/app/services/stream/live/now">See more ›</Link></div>{liveNow.length ? <div className="stream-live-now-rail">{liveNow.slice(0, 12).map(item => <Link to={publishedLivePlaybackPath(item)} key={item.liveInputUid}><div style={item.thumbnailUrl ? { backgroundImage: `url(${item.thumbnailUrl})` } : undefined}><PlayArrowRoundedIcon/><b>LIVE</b><span><i/></span></div><h3>{item.title}</h3><p>{item.creatorName || "SMAJ Live"} · Live now</p></Link>)}</div> : <div className="stream-live-now-empty">No channels are live right now. Official broadcasts will appear here automatically.</div>}</section> : null}

        <section className="stream-movie-catalog" aria-label="Movie and series catalogue">
          {!catalogLoading && catalogError ? <p className="stream-catalog-notice">Live catalogue is unavailable. Showing SMAJ previews.</p> : null}
          {catalogRows.map((row) => (
            <section className="stream-movie-row" id={row.id} key={row.title}>
              <div className="stream-row-heading"><h2>{row.title}</h2><Link to={categoryMode ? `/app/services/stream/category/${activeSlug}` : row.id === "series" ? "/app/services/stream/series" : row.id === "anime" ? "/app/services/stream/category/anime" : "/app/services/stream/movies"}>Explore all →</Link></div>
              <div className="stream-rail">
                {row.items.slice(0, 20).map((item, index) => {
                  const tmdbItem = "mediaType" in item;
                  const detailUrl = tmdbItem ? `/app/services/stream/${item.mediaType === "tv" ? "series" : "title"}/${item.id}` : null;
                  const posterUrl = tmdbItem ? item.posterUrl : null;
                  return <article className={`stream-movie-tile ${tmdbItem ? "has-poster" : item.tone}`} key={`${row.id}-${item.id}`}>
                    {detailUrl ? <Link to={detailUrl} aria-label={`View ${item.title}`}>
                      {posterUrl ? <img loading="lazy" src={posterUrl} alt="" /> : null}
                      <span className="stream-movie-rank">{index + 1}</span><span className="stream-movie-play"><PlayArrowRoundedIcon /></span>
                    </Link> : <button type="button" onClick={() => setPlaying(item as StreamItem)} aria-label={`Play ${item.title}`}>
                      <span className="stream-movie-rank">{index + 1}</span>
                      <span className="stream-movie-logo">{(item as StreamItem).initials}</span>
                      <span className="stream-movie-play"><PlayArrowRoundedIcon /></span>
                    </button>}
                    <div><h3>{item.title}</h3><p>{tmdbItem ? `${item.mediaType === "tv" ? "Series" : "Movie"} · ${item.rating ? `★ ${item.rating}` : item.releaseDate?.slice(0, 4) || "New"}` : index % 2 ? "Series · 8 episodes" : "Movie · SMAJ Original"}</p></div>
                  </article>;
                })}
              </div>
            </section>
          ))}
        </section>

        {creators.length ? <section className="stream-fans-section"><div className="stream-row-heading"><div><h2>More Fans to Follow</h2><p>Discover</p></div><Link to="/app/services/stream/creators">Explore all →</Link></div><div className="stream-fans-rail">{creators.slice(0, 6).map((creator) => <article key={creator.creatorId}><Link to={`/app/services/stream/channel/${creator.channel.handle}`}><img loading="lazy" src={creator.channel.avatarUrl || creator.latestVideos[0]?.thumbnailUrl || ""} alt=""/><span><b>{creator.channel.name}</b><small>@{creator.channel.handle}</small><small>{Number(creator.stats?.followers || 0).toLocaleString()} followers</small></span></Link><button type="button" className={followedCreators.has(creator.channel.handle) ? "following" : ""} disabled={savingFollow === creator.channel.handle} onClick={() => void toggleCreatorFollow(creator.channel.handle)}>{followedCreators.has(creator.channel.handle) ? "Following" : "+ Follow"}</button></article>)}</div></section> : null}

        {reviews.length ? <section className="stream-popular-reviews"><div className="stream-row-heading"><div><h2>Popular Reviews</h2><p>Discover</p></div></div><div className="stream-reviews-rail">{reviews.map(review => <article key={review._id}><div className="stream-review-main"><Link to={`/app/services/stream/${review.mediaType === "tv" ? "series" : "title"}/${review.tmdbId}`}>{review.posterUrl ? <img loading="lazy" src={review.posterUrl} alt=""/> : <span/>}</Link><div><div className="stream-review-stars" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}<i>{"☆".repeat(5-review.rating)}</i></div><p>{review.body}</p><Link to={`/app/services/stream/${review.mediaType === "tv" ? "series" : "title"}/${review.tmdbId}`}>{review.title}</Link></div></div><footer><span>{review.reviewer.avatarUrl ? <img src={review.reviewer.avatarUrl} alt=""/> : review.reviewer.name.slice(0,1).toUpperCase()}<b>{review.reviewer.name}</b></span><button type="button" onClick={() => void likeReview(review._id)} aria-label="Like review">♡ {review.likes}</button><small>💬 {review.comments}</small></footer></article>)}</div></section> : null}

        <footer className="stream-footer"><a className="stream-brand" href="#discover"><span><PlayArrowRoundedIcon /></span><strong>SMAJ STREAM</strong></a><p>Watch differently. Create freely.</p><small>Discover movies, live channels, and original creators.</small></footer>
        </>}
      </main>

      {playing ? <div className="stream-player-overlay" role="dialog" aria-modal="true" aria-label={`Playing ${playing.title}`} onClick={() => setPlaying(null)}><div className={`stream-player ${playing.tone}`} onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setPlaying(null)} aria-label="Close player"><CloseRoundedIcon /></button><div className="stream-player-mark"><PlayArrowRoundedIcon /></div><span>{playing.live ? "LIVE · " : "NOW PLAYING · "}{playing.viewers}</span><h2>{playing.title}</h2><p>{playing.creator}</p><aside><FavoriteBorderRoundedIcon /> This interactive preview is ready for video API integration.</aside></div></div> : null}
    </>
  );

  return experience;
};

export default StreamPage;
