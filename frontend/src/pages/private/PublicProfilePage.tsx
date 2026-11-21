import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import CommunityPostCard from "../../components/CommunityPostCard";
import CommunitySkeleton from "../../components/CommunitySkeleton";
import TrustBadge from "../../components/TrustBadge";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { getCommunityFeed, getPublicProfile, toggleCommunityFollow, type CommunityPost, type PublicProfileResponse } from "../../lib/communityApi";
import "./community.css";

const PublicProfilePage = () => {
  const { uid = "" } = useParams();
  const { user, requireAuth } = useAuthContext();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [postsLoadedForUid, setPostsLoadedForUid] = useState<string | null>(null);
  const postsLoadedForUidRef = useRef<string | null>(null);
  const [postsError, setPostsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setPostsError("");
    try {
      const profile = await getPublicProfile(uid);
      setData(profile);
      try {
        const feed = await getCommunityFeed({ authorId: uid });
        setPosts(feed.posts);
        postsLoadedForUidRef.current = uid;
        setPostsLoadedForUid(uid);
      } catch {
        const message = "This profile is available, but its posts could not be loaded.";
        setPostsError(message);
        setError(message);
        if (postsLoadedForUidRef.current !== uid) setPosts([]);
        postsLoadedForUidRef.current = uid;
        setPostsLoadedForUid(uid);
      }
    } catch (reason) {
      const status = reason && typeof reason === "object" && "response" in reason
        ? (reason as { response?: { status?: number } }).response?.status
        : undefined;
      setError(status === 404 ? "This profile is private or unavailable." : "Profile could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { void load(); }, [load]);

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
  return (
    <main className="private-page public-profile-page">
      {error ? <div className="private-alert error" role="alert">{error}</div> : null}
      {!data.isPublic && data.viewer.isSelf ? <p className="public-profile-private-note">This profile is hidden from other people. You can still preview it here.</p> : null}
      <header className="public-profile-hero">
        {profile.coverImage ? <img className="public-profile-cover" src={profile.coverImage} alt="" /> : <div className="public-profile-cover-placeholder" />}
        <div className="public-profile-main">
          <UserAvatarFrame
            name={profile.displayName}
            image={profile.avatar}
            frame={profile.uid === user?.uid ? user.activeAvatarFrame : profile.activeAvatarFrame}
            size={104}
          />
          <div className="public-profile-identity">
            <p className="private-kicker">PUBLIC PROFILE</p>
            <h1>{profile.displayName}<TrustBadge userId={profile.uid} /></h1>
            <p className="public-profile-username">@{profile.piUsername || profile.username}</p>
            {profile.bio ? <p className="public-profile-bio">{profile.bio}</p> : <p className="public-profile-bio muted">No biography added yet.</p>}
            <div className="public-profile-actions">
              {data.viewer.isSelf ? <Link className="private-secondary-button" to="/profile">Edit profile</Link> : <>
                <button type="button" className="private-primary-button" disabled={busy} onClick={() => void toggleFollow()}>{data.viewer.following ? "Following" : "Follow"}</button>
                {profile.allowContact ? <Link className="private-secondary-button" to={messageHref}>Message</Link> : <span className="public-profile-contact-disabled">Messages are turned off.</span>}
              </>}
            </div>
          </div>
          <div className="public-profile-stats">
            <div><strong>{data.stats.posts}</strong><span>Posts</span></div>
            <div><strong>{data.stats.followers}</strong><span>Followers</span></div>
            <div><strong>{data.stats.following}</strong><span>Following</span></div>
          </div>
        </div>
      </header>

      <div className="public-profile-grid">
        <section className="public-profile-panel">
          <div className="community-section-heading"><div><h2>Professional information</h2><p>{data.professional.headline || "Professional details shared by this member."}</p></div></div>
          {data.professional.company ? <p className="public-profile-company">{data.professional.company.logoUrl ? <img src={data.professional.company.logoUrl} alt="" /> : null}<strong>{data.professional.company.name}</strong></p> : null}
          {profile.openToWork ? <span className="public-profile-open-work">Open to work</span> : null}
          {data.professional.skills.length ? <div className="public-profile-skills">{data.professional.skills.map(skill => <span key={skill}>{skill}</span>)}</div> : null}
        </section>
        <section className="public-profile-panel">
          <div className="community-section-heading"><div><h2>Service activity</h2><p>Current public activity across SMAJ PI HUB.</p></div></div>
          <div className="public-profile-activity-stats">
            <span><strong>{data.activities.marketplaceListings.length}</strong>Recent listings</span>
            <span><strong>{data.activities.jobs}</strong>Active jobs</span>
            <span><strong>{data.activities.streamVideos}</strong>Videos</span>
          </div>
          {data.activities.marketplaceListings.length ? <div className="public-profile-listings">{data.activities.marketplaceListings.map(item => <Link key={item.id} to={`/product/${encodeURIComponent(item.id)}`}>{item.image ? <img src={item.image} alt="" /> : null}<strong>{item.title}</strong></Link>)}</div> : null}
        </section>
      </div>

      <section className="public-profile-posts">
        <div className="community-section-heading"><div><h2>Posts</h2><p>Posts shared by {profile.displayName}.</p></div></div>
        {postsLoadedForUid !== uid ? <CommunitySkeleton variant="profilePosts" count={2} />
          : posts.length ? posts.map(post => <CommunityPostCard key={post._id} post={post} viewerId={user?.uid} onChange={() => void load()} />)
            : postsError ? null
              : <div className="private-state compact"><p>No community posts yet.</p></div>}
      </section>
    </main>
  );
};

export default PublicProfilePage;
