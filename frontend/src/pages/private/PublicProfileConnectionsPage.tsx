import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import AppLayout from "../../layouts/AppLayout";
import PrivateLayout from "../../layouts/PrivateLayout";
import TrustBadge from "../../components/TrustBadge";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { getCommunityConnections, setCommunityFollow, type CommunityConnectionRelation, type CommunityConnectionUser, type CommunityIdentity } from "../../lib/communityApi";
import { showFeedback } from "../../lib/feedback";
import "./community.css";
import "./PublicProfileConnectionsFullScreen.css";

const PublicProfileConnectionsContent = ({ relation }: { relation: CommunityConnectionRelation }) => {
  const { uid = "" } = useParams();
  const navigate = useNavigate();
  const { user, requireAuth } = useAuthContext();
  const [profile, setProfile] = useState<CommunityIdentity | null>(null);
  const [filter, setFilter] = useState<"all" | "verified" | "known">("all");
  const [people, setPeople] = useState<CommunityConnectionUser[]>([]);
  const [, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const busyIdsRef = useRef(new Set<string>());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setProfile(null);
    setPeople([]);
    setTotal(0);
    setPage(1);
    setHasMore(false);
    void getCommunityConnections(uid, relation).then(result => {
      if (!active) return;
      setProfile(result.profile);
      setPeople(result.users);
      setTotal(result.total);
      setPage(result.page);
      setHasMore(result.hasMore);
    }).catch(() => {
      if (active) setError("This list could not be loaded. Please try again.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [relation, reloadKey, uid]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await getCommunityConnections(uid, relation, page + 1);
      setPeople(current => {
        const seen = new Set(current.map(person => person.uid));
        return [...current, ...result.users.filter(person => !seen.has(person.uid))];
      });
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch {
      setError("More people could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const changeFollow = async (person: CommunityConnectionUser) => {
    if (person.isSelf || busyIdsRef.current.has(person.uid)) return;
    if (!user?.uid) {
      requireAuth();
      return;
    }
    busyIdsRef.current.add(person.uid);
    setBusyIds(new Set(busyIdsRef.current));
    try {
      const following = await setCommunityFollow(person.uid, !person.following);
      if (user.uid === uid && relation === "following" && !following) {
        setPeople(current => current.filter(item => item.uid !== person.uid));
      } else {
        setPeople(current => current.map(item => item.uid === person.uid ? { ...item, following } : item));
      }
      if (user.uid === uid && relation === "following") {
        setTotal(current => Math.max(0, current + Number(following) - Number(person.following)));
      }
    } catch {
      showFeedback("Follow status could not be changed. Please try again.", "error");
    } finally {
      busyIdsRef.current.delete(person.uid);
      setBusyIds(new Set(busyIdsRef.current));
    }
  };

  const title = relation === "followers" ? "Followers" : "Following";
  const visiblePeople = relation === "following" || filter === "all" ? people : people.filter(person => filter === "known" ? person.following : person.verificationStatus === "approved" || person.verificationLevel === "verified" || person.verificationLevel === "trusted");
  const profileHref = `/people/${encodeURIComponent(uid)}`;
  return (
    <main className="private-page public-profile-connections-page">
      <header className="public-profile-connections-header">
        <button type="button" aria-label="Back to profile" onClick={() => navigate(profileHref)}>
          <ArrowBackIcon />
        </button>
        <div>
          <h1>{profile ? <>{profile.displayName}<TrustBadge userId={profile.uid} /></> : title}</h1>

        </div>
      </header>
      <nav className="public-profile-connections-tabs" aria-label="Profile connections">
        <button type="button" className={relation === "followers" && filter === "verified" ? "active" : ""} onClick={() => { setFilter("verified"); if (relation === "following") navigate(`${profileHref}/followers`); }}>Verified followers</button>
        <button type="button" className={relation === "followers" && filter === "known" ? "active" : ""} onClick={() => { setFilter("known"); if (relation === "following") navigate(`${profileHref}/followers`); }}>Followers you know</button>
        <Link className={relation === "followers" && filter === "all" ? "active" : ""} onClick={() => setFilter("all")} to={`${profileHref}/followers`}>Followers</Link>
        <Link className={relation === "following" ? "active" : ""} onClick={() => setFilter("all")} to={`${profileHref}/following`}>Following</Link>
      </nav>
      {loading ? <p className="public-profile-connections-state" role="status">Loading {title.toLowerCase()}…</p>
        : error && !people.length ? <div className="public-profile-connections-state" role="alert"><p>{error}</p><button type="button" onClick={() => setReloadKey(current => current + 1)}>Try again</button></div>
          : visiblePeople.length ? <div className="public-profile-connections-list">
            {visiblePeople.map(person => (
              <article key={person.uid}>
                <Link className="public-profile-connection-identity" to={`/people/${encodeURIComponent(person.uid)}`}>
                  <UserAvatarFrame name={person.displayName} image={person.avatar} frame={person.activeAvatarFrame} size={48} />
                  <span>
                    <strong>{person.displayName}<TrustBadge userId={person.uid} /></strong>
                    <small>@{person.piUsername || person.username}</small>
                  </span>
                </Link>
                {person.isSelf ? <span className="public-profile-connection-you">You</span>
                  : <button
                    type="button"
                    className={person.following ? "following" : ""}
                    disabled={busyIds.has(person.uid)}
                    aria-pressed={person.following}
                    onClick={() => void changeFollow(person)}
                   aria-label={person.following ? `Unfollow ${person.displayName}` : `Follow ${person.displayName}`} title={person.following ? "Following" : "Follow"}>{busyIds.has(person.uid) ? "…" : person.following ? <HowToRegOutlinedIcon /> : <PersonAddAltOutlinedIcon />}</button>}
              </article>
            ))}
            {error ? <p className="public-profile-connections-error" role="alert">{error}</p> : null}
            {hasMore ? <button className="public-profile-connections-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more"}</button> : null}
          </div>
            : <p className="public-profile-connections-state">No {title.toLowerCase()} yet.</p>}
    </main>
  );
};

const PublicProfileConnectionsPage = ({ relation }: { relation: CommunityConnectionRelation }) => {
  const { isAuthenticated, isLoading } = useAuthContext();
  return isLoading || isAuthenticated
    ? <PrivateLayout fullScreen><PublicProfileConnectionsContent relation={relation} /></PrivateLayout>
    : <AppLayout showHeader={false} showFooter={false}><PublicProfileConnectionsContent relation={relation} /></AppLayout>;
};

export default PublicProfileConnectionsPage;
