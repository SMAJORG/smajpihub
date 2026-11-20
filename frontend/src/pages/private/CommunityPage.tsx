import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import CommunityFeedPostCard from "../../components/CommunityFeedPostCard";
import CommunityVideoViewer, { type CommunityVideoItem } from "../../components/CommunityVideoViewer";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { axiosClient } from "../../lib/axiosClient";
import { getCommunityFeed, type CommunityPost } from "../../lib/communityApi";
import {
  emptyCommunityFeed,
  getCachedCommunityFeed,
  preloadCommunityMedia,
  readCommunityFeedCache,
  writeCommunityFeedCache,
  type CommunityFeedScope,
  type CommunityFeedSnapshot,
} from "../../lib/communityFeedCache";
import { setCommunityVideoViewerOpen } from "../../components/communityVideoPlayback";
import "./community.css";

type FeedScope = CommunityFeedScope;
type FeedSnapshot = CommunityFeedSnapshot;
type FeedSnapshots = Record<FeedScope, FeedSnapshot>;

const CommunityPage = () => {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const incomingPublishedPost = (location.state as { communityPublishedPost?: CommunityPost } | null)?.communityPublishedPost;
  const [scope, setScope] = useState<FeedScope>("all");
  const [searchText, setSearchText] = useState("");
  const [feeds, setFeeds] = useState<FeedSnapshots>(() => ({
    all: readCommunityFeedCache(user?.uid, "all")?.snapshot || (incomingPublishedPost
      ? { posts: [incomingPublishedPost], hasMore: false, page: 1, loaded: true }
      : emptyCommunityFeed()),
    following: readCommunityFeedCache(user?.uid, "following")?.snapshot || emptyCommunityFeed(),
  }));
  const feedsRef = useRef(feeds);
  const [feedOwner, setFeedOwner] = useState(user?.uid);
  const activeFeed = feedOwner === user?.uid ? feeds[scope] : emptyCommunityFeed();
  const posts = activeFeed.posts;
  const hasMore = activeFeed.hasMore;
  const page = activeFeed.page;
  const [loading, setLoading] = useState(!activeFeed.loaded);
  const activeScopeRef = useRef(scope);
  activeScopeRef.current = scope;
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [feedError, setFeedError] = useState<{ scope: FeedScope; message: string } | null>(null);
  const error = feedError?.scope === scope ? feedError.message : "";
  const [publishedNotice, setPublishedNotice] = useState(Boolean(incomingPublishedPost));
  const [videoViewerIndex, setVideoViewerIndex] = useState<number | null>(null);
  const feedScrollPosition = useRef<{ element: HTMLElement | null; top: number; windowTop: number } | null>(null);
  const scrollRestore = useRef<{ element: HTMLElement; isRoot: boolean; top: number; pending: boolean } | null>(null);
  const pendingPublishedPost = useRef(incomingPublishedPost || null);

  const updateFeed = useCallback((targetScope: FeedScope, update: (snapshot: FeedSnapshot) => FeedSnapshot) => {
    const nextFeed = update(feedsRef.current[targetScope]);
    const nextFeeds = { ...feedsRef.current, [targetScope]: nextFeed };
    feedsRef.current = nextFeeds;
    setFeeds(nextFeeds);
    writeCommunityFeedCache(user?.uid, targetScope, nextFeed);
  }, [user?.uid]);

  useEffect(() => {
    if (feedOwner === user?.uid) return;
    const all = readCommunityFeedCache(user?.uid, "all")?.snapshot || (pendingPublishedPost.current
      ? { posts: [pendingPublishedPost.current], hasMore: false, page: 1, loaded: true }
      : emptyCommunityFeed());
    const following = readCommunityFeedCache(user?.uid, "following")?.snapshot || emptyCommunityFeed();
    const nextFeeds = { all, following };
    feedsRef.current = nextFeeds;
    setFeeds(nextFeeds);
    setFeedOwner(user?.uid);
  }, [feedOwner, user?.uid]);

  useEffect(() => {
    setLoading(!activeFeed.loaded);
  }, [scope, feedOwner, activeFeed.loaded]);

  const load = useCallback(async (nextPage = 1, keep = false, forceRefresh = false) => {
    const existing = feedsRef.current[scope];
    if (!existing.loaded && !existing.posts.length) setLoading(true);
    setFeedError(null);
    try {
      const result = nextPage === 1
        ? await getCachedCommunityFeed(user?.uid, scope, forceRefresh)
        : { ...await getCommunityFeed({ scope, page: nextPage }), page: nextPage, loaded: true };
      const feedPosts = result.posts;
      const pending = pendingPublishedPost.current;
      if (scope === "all" && pending && !feedPosts.some(post => post._id === pending._id)) feedPosts.unshift(pending);
      if (pending && feedPosts.some(post => post._id === pending._id)) pendingPublishedPost.current = null;
      updateFeed(scope, current => ({
        posts: keep ? [...current.posts, ...feedPosts.filter(post => !current.posts.some(item => item._id === post._id))] : feedPosts,
        hasMore: result.hasMore,
        page: nextPage,
        loaded: true,
      }));
    } catch (reason) {
      if (!existing.loaded && !existing.posts.length) {
        const message = reason && typeof reason === "object" && "response" in reason
          && (reason as { response?: { status?: number } }).response?.status === 401
          ? "Sign in to view the community feed."
          : "Community posts could not be loaded. Please try again.";
        setFeedError({ scope, message });
      }
    } finally {
      if (activeScopeRef.current === scope) setLoading(false);
    }
  }, [scope, updateFeed, user?.uid]);
  const refreshFeed = useCallback(() => { void load(1, false, true); }, [load]);
  const dismissPost = useCallback((postId: string) => {
    updateFeed(scope, current => ({ ...current, posts: current.posts.filter(post => post._id !== postId) }));
  }, [scope, updateFeed]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const userId = user?.uid;
    const feed = document.querySelector<HTMLElement>(".community-private-shell .community-feed");
    const rootScroller = document.scrollingElement as HTMLElement | null;
    if (!userId || !feed || !rootScroller) return;
    let scroller = rootScroller;
    for (let element = feed.parentElement; element; element = element.parentElement) {
      const overflowY = window.getComputedStyle(element).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll")
        && (element.matches(".private-content") || element.scrollHeight > element.clientHeight + 2)) {
        scroller = element;
        break;
      }
    }
    const isRoot = scroller === rootScroller;
    const key = `smaj-community-scroll-v1:${userId}`;
    let savedTop = 0;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) || "null") as { top?: number; isRoot?: boolean } | null;
      if (saved && saved.isRoot === isRoot && Number.isFinite(saved.top)) savedTop = Math.max(0, Number(saved.top));
    } catch {
      window.sessionStorage.removeItem(key);
    }
    scrollRestore.current = { element: scroller, isRoot, top: savedTop, pending: savedTop > 0 };
    const persistPosition = () => {
      const top = isRoot ? window.scrollY || rootScroller.scrollTop : scroller.scrollTop;
      try {
        window.sessionStorage.setItem(key, JSON.stringify({ top, isRoot }));
      } catch {
        // The feed remains usable when session storage is unavailable.
      }
    };
    const target: Window | HTMLElement = isRoot ? window : scroller;
    target.addEventListener("scroll", persistPosition, { passive: true });
    return () => {
      persistPosition();
      target.removeEventListener("scroll", persistPosition);
      scrollRestore.current = null;
    };
  }, [user?.uid]);
  useEffect(() => {
    const position = scrollRestore.current;
    if (!activeFeed.loaded || !position?.pending) return;
    const frame = window.requestAnimationFrame(() => {
      if (!position.element.isConnected) return;
      if (position.isRoot) window.scrollTo({ top: position.top });
      else position.element.scrollTop = position.top;
      position.pending = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeFeed.loaded, feedOwner, scope]);
  useEffect(() => { preloadCommunityMedia(posts); }, [posts]);
  useEffect(() => () => setCommunityVideoViewerOpen(false), []);
  useEffect(() => {
    const post = pendingPublishedPost.current;
    if (!post) return;
    updateFeed("all", current => ({
      ...current,
      posts: [post, ...current.posts.filter(item => item._id !== post._id)],
      loaded: true,
    }));
    setPublishedNotice(true);
    const timer = window.setTimeout(() => setPublishedNotice(false), 4500);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, navigate, updateFeed]);
  useEffect(() => {
    const target = params.get("post");
    if (!target || loading) return;
    document.getElementById(`community-post-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, params, posts]);

  useEffect(() => {
    const userId = user?.uid;
    if (!userId) return;
    let active = true;
    let cursor = "";
    let generation = 0;
    let request: AbortController | null = null;
    let retryTimer: number | null = null;
    const updateCount = (conversations: Array<{ _id: string; unreadBy?: string[]; unreadCount?: number }>) => {
      const unread = new Map(conversations.map(conversation => [conversation._id, conversation]));
      const count = [...unread.values()]
        .filter(conversation => conversation.unreadBy?.includes(userId))
        .reduce((total, conversation) => total + Math.max(1, conversation.unreadCount || 0), 0);
      setUnreadMessageCount(count);
    };
    const synchronize = async (run = generation) => {
      if (!active || run !== generation || document.hidden || !navigator.onLine) return;
      const controller = new AbortController();
      request = controller;
      try {
        const { data } = await axiosClient.get<{ cursor: string; conversations: Array<{ _id: string; unreadBy?: string[]; unreadCount?: number }> }>("/messages/sync", {
          params: { cursor, context: "all" },
          timeout: 30000,
          signal: controller.signal,
          headers: { "X-SMAJ-Chat-Owner": userId, "X-SMAJ-Silent": "true" },
        });
        if (!active || run !== generation) return;
        cursor = data.cursor;
        updateCount(data.conversations);
        retryTimer = window.setTimeout(() => void synchronize(run), 0);
      } catch {
        if (active && run === generation && !controller.signal.aborted) {
          retryTimer = window.setTimeout(() => void synchronize(run), 3000);
        }
      }
    };
    const reconnect = () => {
      generation++;
      cursor = "";
      request?.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (!document.hidden && navigator.onLine) void synchronize();
    };
    void synchronize();
    window.addEventListener("focus", reconnect);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      active = false;
      request?.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener("focus", reconnect);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", reconnect);
    };
  }, [user?.uid]);

  const filteredPosts = useMemo(() => posts.filter(post => {
    const search = searchText.trim().toLocaleLowerCase();
    if (!search) return true;
    const target = post.originalPost || post;
    return `${target.content} ${target.author.displayName} ${target.author.username} ${target.author.piUsername}`
      .toLocaleLowerCase()
      .includes(search);
  }), [posts, searchText]);
  const videoItems = useMemo<CommunityVideoItem[]>(() => filteredPosts.flatMap(post => {
    const target = post.originalPost ? { ...post, ...post.originalPost } as CommunityPost : post;
    return target.media.filter(media => media.type === "video").map(media => ({
      post: target,
      media,
      author: target.author,
      content: target.content,
    }));
  }), [filteredPosts]);
  const openVideo = useCallback((post: CommunityPost, media: { url: string }) => {
    const index = videoItems.findIndex(item => item.post._id === post._id && item.media.url === media.url);
    if (index < 0) return;
    const rootScroller = document.scrollingElement as HTMLElement | null;
    const feed = document.querySelector<HTMLElement>(".community-private-shell .community-feed");
    let element: HTMLElement | null = null;
    for (let candidate = feed?.parentElement || null; candidate; candidate = candidate.parentElement) {
      const overflowY = window.getComputedStyle(candidate).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && candidate.scrollHeight > candidate.clientHeight + 2) {
        element = candidate;
        break;
      }
    }
    element ||= rootScroller;
    feedScrollPosition.current = { element, top: element?.scrollTop || 0, windowTop: window.scrollY };
    setCommunityVideoViewerOpen(true);
    setVideoViewerIndex(index);
  }, [videoItems]);
  const closeVideo = useCallback(() => {
    setCommunityVideoViewerOpen(false);
    setVideoViewerIndex(null);
    requestAnimationFrame(() => {
      const position = feedScrollPosition.current;
      if (!position) return;
      if (position.element === document.scrollingElement) window.scrollTo({ top: position.windowTop });
      else if (position.element) position.element.scrollTop = position.top;
    });
  }, []);

  return (
    <main className="private-page community-page">
      <div className="community-feed-chrome">
        <header className="community-feed-header">
          <Link
            className="community-feed-avatar"
            to={user?.uid ? `/people/${encodeURIComponent(user.uid)}` : "/profile"}
            aria-label="View your profile"
          >
            <UserAvatarFrame name={user?.displayName || user?.username || "Pi user"} image={user?.avatar} frame={user?.activeAvatarFrame} size={42} />
          </Link>
          <label className="community-search">
            <SearchOutlinedIcon aria-hidden="true" />
            <input
              type="search"
              aria-label="Search posts and authors in the community feed"
              placeholder="Search community"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
            />
          </label>
          <button
            className="community-header-action"
            type="button"
            aria-label="Create a post"
            onClick={() => navigate("/community/create")}
          >
            <AddOutlinedIcon />
          </button>
          <Link
            className="community-header-action community-messages-action notification-icon"
            to="/messages"
            aria-label={unreadMessageCount ? `Messages, ${unreadMessageCount > 99 ? "99+" : unreadMessageCount} unread messages` : "Messages"}
            title="Messages"
          >
            <ChatOutlinedIcon />
            {unreadMessageCount ? <span className="community-message-badge">{unreadMessageCount > 99 ? "99+" : unreadMessageCount}</span> : null}
          </Link>
        </header>
        <nav className="community-feed-tabs" aria-label="Community feed">
          <button type="button" className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>For you</button>
          <button type="button" className={scope === "following" ? "active" : ""} onClick={() => setScope("following")}>Following</button>
        </nav>
      </div>
      {error ? <p className="community-error" role="alert">{error}</p> : null}
      <section className="community-feed" aria-label="Community posts" aria-busy={loading}>
        {!activeFeed.loaded && !filteredPosts.length && !error ? <p className="community-feed-loading" role="status">Loading community posts…</p> : null}
        {!error && !filteredPosts.length && activeFeed.loaded ? <div className="private-state compact"><h2>{searchText.trim() ? "No matching community posts" : scope === "following" ? "No posts from people you follow" : "No community posts yet"}</h2><p>{searchText.trim() ? "Try another search or clear the search field." : scope === "following" ? "Follow people from Search or their public profiles to see their posts here." : "Be the first to share something with the community."}</p>{scope === "following" && !searchText.trim() ? <Link to="/search">Search people</Link> : null}</div> : null}
        {filteredPosts.map(post => <CommunityFeedPostCard
          key={post._id}
          post={post}
          viewerId={user?.uid}
          viewerAvatarFrame={user?.activeAvatarFrame}
          onChange={refreshFeed}
          onDismiss={dismissPost}
          onOpenVideo={openVideo}
        />)}
      </section>
      {hasMore ? <button className="community-load-more" type="button" disabled={loading} onClick={() => void load(page + 1, true)}>{loading ? "Loading…" : "Load more"}</button> : null}
      {!loading && error ? <button className="community-load-more" type="button" onClick={() => void load()}>Retry</button> : null}
      {videoViewerIndex !== null ? <CommunityVideoViewer
        items={videoItems}
        index={videoViewerIndex}
        viewerId={user?.uid}
        onClose={closeVideo}
        onChange={refreshFeed}
      /> : null}
      {publishedNotice ? <div className="community-published-toast" role="status">Post published successfully.</div> : null}
    </main>
  );
};

export default CommunityPage;
