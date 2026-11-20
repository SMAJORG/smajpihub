import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import CommunityPostCard from "../../components/CommunityPostCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { axiosClient } from "../../lib/axiosClient";
import { getCommunityFeed, type CommunityPost } from "../../lib/communityApi";
import "./community.css";

const CommunityPage = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<"all" | "following">("all");
  const [searchText, setSearchText] = useState("");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage = 1, keep = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await getCommunityFeed({ scope, page: nextPage });
      setPosts(current => keep ? [...current, ...result.posts] : result.posts);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (reason) {
      setError(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 401
        ? "Sign in to view the community feed."
        : "Community posts could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);
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

  const filteredPosts = posts.filter(post => {
    const search = searchText.trim().toLocaleLowerCase();
    if (!search) return true;
    const target = post.originalPost || post;
    return `${target.content} ${target.author.displayName} ${target.author.username} ${target.author.piUsername}`
      .toLocaleLowerCase()
      .includes(search);
  });

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
        {loading && !posts.length ? <PrivateSkeleton variant="list" count={4} /> : null}
        {!loading && !error && !filteredPosts.length ? <div className="private-state compact"><h2>{searchText.trim() ? "No matching community posts" : scope === "following" ? "No posts from people you follow" : "No community posts yet"}</h2><p>{searchText.trim() ? "Try another search or clear the search field." : scope === "following" ? "Follow people from Search or their public profiles to see their posts here." : "Be the first to share something with the community."}</p>{scope === "following" && !searchText.trim() ? <Link to="/search">Search people</Link> : null}</div> : null}
        {filteredPosts.map(post => <CommunityPostCard key={post._id} post={post} viewerId={user?.uid} onChange={() => void load()} />)}
      </section>
      {hasMore ? <button className="community-load-more" type="button" disabled={loading} onClick={() => void load(page + 1, true)}>{loading ? "Loading…" : "Load more"}</button> : null}
      {!loading && error ? <button className="community-load-more" type="button" onClick={() => void load()}>Retry</button> : null}
    </main>
  );
};

export default CommunityPage;
