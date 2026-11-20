import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import CommunityFeedPostCard from "../../components/CommunityFeedPostCard";
import CommunitySkeleton from "../../components/CommunitySkeleton";
import CommunityVideoViewer, { type CommunityVideoItem } from "../../components/CommunityVideoViewer";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { axiosClient } from "../../lib/axiosClient";
import { getCommunityFeed, type CommunityPost } from "../../lib/communityApi";
import { setCommunityVideoViewerOpen } from "../../components/communityVideoPlayback";
import "./community.css";

const CommunityPage = () => {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const incomingPublishedPost = (location.state as { communityPublishedPost?: CommunityPost } | null)?.communityPublishedPost;
  const [scope, setScope] = useState<"all" | "following">("all");
  const [searchText, setSearchText] = useState("");
  const [posts, setPosts] = useState<CommunityPost[]>(() => incomingPublishedPost ? [incomingPublishedPost] : []);
  const [loading, setLoading] = useState(true);
  const [loadedScope, setLoadedScope] = useState<"all" | "following" | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [error, setError] = useState("");
  const [publishedNotice, setPublishedNotice] = useState(Boolean(incomingPublishedPost));
  const [videoViewerIndex, setVideoViewerIndex] = useState<number | null>(null);
  const feedScrollPosition = useRef<{ element: HTMLElement | null; top: number; windowTop: number } | null>(null);
  const pendingPublishedPost = useRef(incomingPublishedPost || null);

  const load = useCallback(async (nextPage = 1, keep = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await getCommunityFeed({ scope, page: nextPage });
      const feedPosts = result.posts;
      const pending = pendingPublishedPost.current;
      if (scope === "all" && pending && !feedPosts.some(post => post._id === pending._id)) feedPosts.unshift(pending);
      if (pending && feedPosts.some(post => post._id === pending._id)) pendingPublishedPost.current = null;
      setPosts(current => keep ? [...current, ...feedPosts.filter(post => !current.some(item => item._id === post._id))] : feedPosts);
      setHasMore(result.hasMore);
      setPage(nextPage);
      setLoadedScope(scope);
    } catch (reason) {
      setError(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 401
        ? "Sign in to view the community feed."
        : "Community posts could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [scope]);
  const refreshFeed = useCallback(() => { void load(); }, [load]);
  const dismissPost = useCallback((postId: string) => {
    setPosts(current => current.filter(post => post._id !== postId));
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => setCommunityVideoViewerOpen(false), []);
  useEffect(() => {
    const post = pendingPublishedPost.current;
    if (!post) return;
    setPosts(current => [post, ...current.filter(item => item._id !== post._id)]);
    setPublishedNotice(true);
    const timer = window.setTimeout(() => setPublishedNotice(false), 4500);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search, navigate]);
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
        {loading && loadedScope !== scope && !filteredPosts.length ? <CommunitySkeleton variant="feed" count={4} /> : null}
        {!error && !filteredPosts.length && (!loading || loadedScope === scope) ? <div className="private-state compact"><h2>{searchText.trim() ? "No matching community posts" : scope === "following" ? "No posts from people you follow" : "No community posts yet"}</h2><p>{searchText.trim() ? "Try another search or clear the search field." : scope === "following" ? "Follow people from Search or their public profiles to see their posts here." : "Be the first to share something with the community."}</p>{scope === "following" && !searchText.trim() ? <Link to="/search">Search people</Link> : null}</div> : null}
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
