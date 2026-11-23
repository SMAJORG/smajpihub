import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import CommunityFeedPostCard from "../../components/CommunityFeedPostCard";
import CommunitySkeleton from "../../components/CommunitySkeleton";
import CommunityVideoViewer, { type CommunityVideoItem } from "../../components/CommunityVideoViewer";
import TrustBadge from "../../components/TrustBadge";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { getCommunityFeed, getPublicProfile, toggleCommunityFollow, type CommunityMedia, type CommunityPost, type PublicProfileResponse } from "../../lib/communityApi";
import "./community.css";
import "./PublicProfileBack.css";

type ProfileTab = "posts" | "about" | "activity" | "media";

const PublicProfilePage = () => {
  const { uid = "" } = useParams();
  const navigate = useNavigate();
  const { user, requireAuth } = useAuthContext();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postsLoadedForUid, setPostsLoadedForUid] = useState<string | null>(null);
  const postsLoadedForUidRef = useRef<string | null>(null);
  const loadRequest = useRef(0);
  const loadMoreRequest = useRef(0);
  const loadMoreInProgress = useRef(false);
  const [postsError, setPostsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [activityFilter, setActivityFilter] = useState<"All" | "Posts" | "Listings" | "Jobs" | "Videos">("All");
  const [videoViewer, setVideoViewer] = useState<{ items: CommunityVideoItem[]; index: number } | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    loadMoreRequest.current += 1;
    loadMoreInProgress.current = false;
    setLoadingMorePosts(false);
    setLoading(true);
    setError("");
    setPostsError("");
    try {
      const profile = await getPublicProfile(uid);
      if (requestId !== loadRequest.current) return;
      setData(profile);
      try {
        const feed = await getCommunityFeed({ authorId: uid });
        if (requestId !== loadRequest.current) return;
        setPosts(feed.posts);
        setPostsHasMore(feed.hasMore);
        setPostsPage(1);
        postsLoadedForUidRef.current = uid;
        setPostsLoadedForUid(uid);
      } catch {
        if (requestId !== loadRequest.current) return;
        const message = "This profile is available, but its posts could not be loaded.";
        setPostsError(message);
        setError(message);
        setPostsHasMore(false);
        if (postsLoadedForUidRef.current !== uid) setPosts([]);
        postsLoadedForUidRef.current = uid;
        setPostsLoadedForUid(uid);
      }
    } catch (reason) {
      if (requestId !== loadRequest.current) return;
      const status = reason && typeof reason === "object" && "response" in reason
        ? (reason as { response?: { status?: number } }).response?.status
        : undefined;
      setError(status === 404 ? "This profile is private or unavailable." : "Profile could not be loaded. Please try again.");
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    setActiveTab("posts");
    setPostsHasMore(false);
    setPostsPage(1);
    setLoadingMorePosts(false);
    loadMoreRequest.current += 1;
    loadMoreInProgress.current = false;
    void load();
    return () => { loadRequest.current += 1; };
  }, [load]);

  const profileVideoItems = useMemo(() => posts.flatMap(post => {
    const content = post.originalPost ? { ...post, ...post.originalPost } : post;
    return content.media
      .filter(media => media.type === "video")
      .map(media => ({ post, media, author: content.author || post.author, content: content.content }));
  }), [posts]);

  const mediaItems = useMemo(() => posts.flatMap(post => {
    const content = post.originalPost ? { ...post, ...post.originalPost } : post;
    return content.media.map(media => ({ post, media }));
  }), [posts]);

  const openVideo = useCallback((post: CommunityPost, media: CommunityMedia) => {
    let index = profileVideoItems.findIndex(item => item.media.url === media.url
      && (item.post._id === post._id || item.post.originalPost?._id === post._id));
    if (index < 0) index = profileVideoItems.findIndex(item => item.media.url === media.url);
    if (index >= 0) setVideoViewer({ items: profileVideoItems, index });
  }, [profileVideoItems]);

  const loadMorePosts = async () => {
    if (loadMoreInProgress.current || loadingMorePosts || !postsHasMore || postsLoadedForUid !== uid) return;
    loadMoreInProgress.current = true;
    const requestId = ++loadMoreRequest.current;
    const profileRequestId = loadRequest.current;
    setLoadingMorePosts(true);
    setPostsError("");
    try {
      const nextPage = postsPage + 1;
      const feed = await getCommunityFeed({ authorId: uid, page: nextPage });
      if (profileRequestId !== loadRequest.current || requestId !== loadMoreRequest.current) return;
      setPosts(current => {
        const existingIds = new Set(current.map(post => post._id));
        return [...current, ...feed.posts.filter(post => !existingIds.has(post._id))];
      });
      setPostsPage(nextPage);
      setPostsHasMore(feed.hasMore);
    } catch {
      if (profileRequestId === loadRequest.current && requestId === loadMoreRequest.current) setPostsError("More posts could not be loaded. Please try again.");
    } finally {
      if (requestId === loadMoreRequest.current) {
        loadMoreInProgress.current = false;
        setLoadingMorePosts(false);
      }
    }
  };

  const toggleFollow = async () => {
    if (!data || busy || data.viewer.isSelf) return;
    if (!user?.uid) {
      requireAuth();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const following = await toggleCommunityFollow(uid);
      setData(current => current ? {
        ...current,
        viewer: { ...current.viewer, following },
        stats: { ...current.stats, followers: Math.max(0, current.stats.followers + (following ? 1 : -1)) },
      } : current);
    } catch {
      setError("Follow status could not be changed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!data || data.profile.uid !== uid) {
    if (loading) return <main className="private-page public-profile-page"><CommunitySkeleton variant="profile" /></main>;
    return <main className="private-page public-profile-page"><div className="private-state error"><h1>Profile unavailable</h1><p>{error}</p><Link to="/search">Search people</Link></div></main>;
  }

  const profile = data.profile;
  const messageHref = `/messages?${new URLSearchParams({ recipient: profile.uid, name: profile.displayName, avatar: profile.avatar })}`;
  const joinedDate = profile.createdAt ? new Date(profile.createdAt) : null;
  return (
    <main className="private-page public-profile-page">
      {error ? <div className="private-alert error" role="alert">{error}</div> : null}
      {!data.isPublic && data.viewer.isSelf ? <p className="public-profile-private-note">This profile is hidden from other people. You can still preview it here.</p> : null}
      <header className="public-profile-hero">
        <button type="button" className="public-profile-cover-back" aria-label="Back" onClick={() => { navigate("/dashboard", { replace: true }); }}><ArrowBackRoundedIcon /></button>
        {profile.coverImage ? <img className="public-profile-cover" src={profile.coverImage} alt="" /> : <div className="public-profile-cover-placeholder" />}
        <div className="public-profile-main">
          <div className="public-profile-top-row">
            <UserAvatarFrame
              className="public-profile-avatar"
              name={profile.displayName}
              image={profile.avatar}
              frame={profile.uid === user?.uid ? user.activeAvatarFrame : profile.activeAvatarFrame}
              size={112}
            />
            <div className="public-profile-actions">
              {data.viewer.isSelf ? <Link className="private-secondary-button" to="/profile">Edit profile</Link> : <>
                <button type="button" className="private-primary-button" disabled={busy} onClick={() => void toggleFollow()}>{data.viewer.following ? "Unfollow" : "Follow"}</button>
                {profile.allowContact ? <Link className="private-secondary-button" to={messageHref}>Message</Link> : <span className="public-profile-contact-disabled">Messages are turned off.</span>}
              </>}
            </div>
          </div>
          <div className="public-profile-identity">
            <p className="private-kicker">PUBLIC PROFILE</p>
            <h1>{profile.displayName}<TrustBadge userId={profile.uid} /></h1>
            <p className="public-profile-username">@{profile.piUsername || profile.username}</p>
            {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : <p className="public-profile-bio muted">No biography added yet.</p>}
          </div>
          <div className="public-profile-stats">
            <div><strong>{data.stats.posts}</strong><span>Posts</span></div>
            <Link to={`/people/${encodeURIComponent(profile.uid)}/followers`}><strong>{data.stats.followers}</strong><span>Followers</span></Link>
            <Link to={`/people/${encodeURIComponent(profile.uid)}/following`}><strong>{data.stats.following}</strong><span>Following</span></Link>
          </div>
        </div>
      </header>

      <div className="public-profile-sticky-stack">
        <nav className="public-profile-tabs" role="tablist" aria-label="Profile sections">
          {(["posts", "about", "activity", "media"] as const).map(tab => (
            <button
              key={tab}
              id={`public-profile-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls="public-profile-panel"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >{tab[0].toUpperCase()}{tab.slice(1)}</button>
          ))}
        </nav>
      </div>

      <section className="public-profile-tab-panel" id="public-profile-panel" role="tabpanel" aria-labelledby={`public-profile-tab-${activeTab}`}>
        {activeTab === "posts" ? <div className="public-profile-posts">
          <div className="community-section-heading"><div><h2>Posts</h2><p>Posts shared by {profile.displayName}.</p></div></div>
          {postsLoadedForUid !== uid ? <CommunitySkeleton variant="profilePosts" count={2} />
            : posts.length ? posts.map(post => <CommunityFeedPostCard
              key={post._id}
              post={post}
              viewerId={user?.uid}
              viewerAvatarFrame={user?.activeAvatarFrame}
              onChange={() => void load()}
              onDismiss={postId => setPosts(current => current.filter(item => item._id !== postId))}
              onOpenVideo={openVideo}
            />)
              : postsError ? <p className="public-profile-tab-error" role="alert">{postsError}</p>
                : <div className="private-state compact"><p>No community posts yet.</p></div>}
          {postsError && posts.length ? <p className="public-profile-tab-error" role="alert">{postsError}</p> : null}
          {postsHasMore ? <button className="community-load-more" type="button" disabled={loadingMorePosts} onClick={() => void loadMorePosts()}>{loadingMorePosts ? "Loading…" : postsError ? "Try again" : "Load more posts"}</button> : null}
        </div> : null}

        {activeTab === "about" ? <section className="public-profile-panel">
          <div className="community-section-heading"><div><h2>Professional information</h2><p>{data.professional.headline || profile.headline || "Professional details shared by this member."}</p></div></div>
          {data.professional.company ? <p className="public-profile-company">{data.professional.company.logoUrl ? <img src={data.professional.company.logoUrl} alt="" /> : null}<strong>{data.professional.company.name}</strong></p> : null}
          {profile.openToWork ? <span className="public-profile-open-work">Open to work</span> : null}
          {data.professional.skills.length ? <div className="public-profile-skills">{data.professional.skills.map(skill => <span key={skill}>{skill}</span>)}</div> : null}
          <dl className="public-profile-details">
            {profile.role ? <div><dt>Role</dt><dd>{profile.role}</dd></div> : null}
            {profile.country ? <div><dt>Location</dt><dd>{profile.country}</dd></div> : null}
            {joinedDate && !Number.isNaN(joinedDate.getTime()) ? <div><dt>Member since</dt><dd>{joinedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</dd></div> : null}
          </dl>
        </section> : null}

        {activeTab === "activity" ? <section className="public-profile-panel public-profile-activity-redesign" style={{ padding: "18px 16px", display: "grid", gap: 16 }}>
          <div className="community-section-heading" style={{ margin: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div><h2 style={{ margin: 0 }}>Activity</h2><p style={{ margin: "4px 0 0", fontSize: 13 }}>Public activity across SMAJ PI HUB</p></div>
            <span style={{ background: "#f2edff", color: "#7134ff", padding: 10, borderRadius: 12 }}><ShieldOutlinedIcon /></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {([
              { label: "Posts", count: data.stats.posts, icon: <ArticleOutlinedIcon /> },
              { label: "Listings", count: data.activities.marketplaceListings.length, icon: <StorefrontOutlinedIcon /> },
              { label: "Jobs", count: data.activities.jobs, icon: <WorkOutlineOutlinedIcon /> }
            ]).map(stat => <div key={stat.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "14px 6px", background: "#f7f6fa", borderRadius: 14, color: "#7134ff" }}>
              {stat.icon}<strong style={{ fontSize: 23, color: "#141c2c" }}>{stat.count}</strong><span style={{ color: "#667285", fontSize: 12 }}>{stat.label}</span>
            </div>)}
          </div>
          <div role="group" aria-label="Filter public activity" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {(["All", "Posts", "Listings", "Jobs", "Videos"] as const).map(filter =>
              <button key={filter} type="button" aria-pressed={activityFilter === filter} onClick={() => setActivityFilter(filter)}
                style={{ flexShrink: 0, border: activityFilter === filter ? "1px solid #7134ff" : "1px solid #e5e7eb", background: activityFilter === filter ? "#7134ff" : "#fff", color: activityFilter === filter ? "#fff" : "#586579", padding: "8px 13px", borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{filter}</button>)}
          </div>
          <div style={{ display: "grid", gap: 0 }}>
            {([
              { label: "Posts", title: "Community posts", detail: `${data.stats.posts} posts shared with the community`, count: data.stats.posts, icon: <ArticleOutlinedIcon />, href: "#public-profile-posts" },
              { label: "Listings", title: "Store listings", detail: data.activities.marketplaceListings.length ? "Public store listings" : "No public listings yet", count: data.activities.marketplaceListings.length, icon: <StorefrontOutlinedIcon />, href: "" },
              { label: "Jobs", title: "Job activity", detail: data.activities.jobs ? "Active public jobs" : "No active public jobs yet", count: data.activities.jobs, icon: <WorkOutlineOutlinedIcon />, href: "" },
              { label: "Videos", title: "Videos", detail: data.activities.streamVideos ? "Public videos" : "No public videos yet", count: data.activities.streamVideos, icon: <VideocamOutlinedIcon />, href: "" }
            ]).filter(item => activityFilter === "All" || item.label === activityFilter).map(item =>
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", minHeight: 68 }}>
                <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: "#f2edff", color: "#7134ff" }}>{item.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", fontSize: 15 }}>{item.title}</strong><span style={{ fontSize: 12, color: "#667285" }}>{item.detail}</span></div>
                <strong>{item.count}</strong><ChevronRightRoundedIcon sx={{ color: "#98a0ad" }} />
              </div>)}
          </div>
          {data.activities.marketplaceListings.length && (activityFilter === "All" || activityFilter === "Listings") ? <div className="public-profile-listings">{data.activities.marketplaceListings.map(item => <Link key={item.id} to={`/product/${encodeURIComponent(item.id)}`}>{item.image ? <img src={item.image} alt="" /> : null}<strong>{item.title}</strong></Link>)}</div> : null}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, borderTop: "1px solid #f0f0f2", paddingTop: 12, color: "#758092", fontSize: 12 }}><ShieldOutlinedIcon fontSize="small" />Only public activity is displayed</div>
        </section> : null}

        {activeTab === "media" ? <section className="public-profile-panel">
          <div className="community-section-heading"><div><h2>Media</h2><p>Images and videos from {profile.displayName}’s posts.</p></div></div>
          {postsLoadedForUid !== uid ? <CommunitySkeleton variant="profilePosts" count={2} />
            : mediaItems.length ? <div className="public-profile-media-grid">{mediaItems.map(({ post, media }, index) => {
              const aspectRatio = media.width && media.height ? `${media.width} / ${media.height}` : "16 / 9";
              const postHref = `/community/feed?post=${encodeURIComponent(post._id)}`;
              return media.type === "video"
                ? <article className="public-profile-media-item" key={`${post._id}:${media.url}`}>
                  <video controls playsInline preload="metadata" src={media.url} style={{ aspectRatio }} />
                  <Link to={postHref}>View post</Link>
                </article>
                : <Link className="public-profile-media-item" key={`${post._id}:${media.url}`} to={postHref} aria-label={`View image post ${index + 1}`}>
                  <img loading="lazy" decoding="async" src={media.url} alt={media.altText || `Post image ${index + 1}`} style={{ aspectRatio }} />
                  <span>View post</span>
                </Link>;
            })}</div>
              : postsError ? <p className="public-profile-tab-error" role="alert">{postsError}</p>
                : <p className="public-profile-empty">No media posts yet.</p>}
          {postsHasMore ? <button className="community-load-more" type="button" disabled={loadingMorePosts} onClick={() => void loadMorePosts()}>{loadingMorePosts ? "Loading…" : "Load more media"}</button> : null}
        </section> : null}
      </section>
      {videoViewer ? <CommunityVideoViewer
        items={videoViewer.items}
        index={videoViewer.index}
        viewerId={user?.uid}
        onClose={() => setVideoViewer(null)}
        onChange={() => void load()}
        returnLabel="Return to profile"
      /> : null}
    </main>
  );
};

export default PublicProfilePage;
