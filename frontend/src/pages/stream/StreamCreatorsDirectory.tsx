import StreamSkeleton from "./StreamSkeleton";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import {
  getStreamCreators,
  getStreamSubscriptions,
  subscribeToStreamChannel,
  unsubscribeFromStreamChannel,
  type StreamCreatorDirectoryItem,
} from "../../lib/streamChannel";

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .map(word => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const StreamCreatorsDirectory = () => {
  const [creators, setCreators] = useState<StreamCreatorDirectoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"recommended" | "popular" | "new" | "live" | "following">("recommended");
  const [sort, setSort] = useState<"recommended" | "followers" | "active" | "videos">("recommended");
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  const [savingFollow, setSavingFollow] = useState("");
  const [followError, setFollowError] = useState("");

  useEffect(() => {
    void Promise.all([getStreamCreators(), getStreamSubscriptions().catch(() => [])])
      .then(([items, subscriptions]) => {
        setCreators(items);
        setFollowing(new Set(subscriptions.map(item => item.channel.handle)));
      })
      .catch(() => {
        setCreators([]);
        setError("Creator channels could not load. Check your connection and retry.");
      });
  }, []);

  const filteredCreators = (creators || []).filter(creator => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const matchesQuery = [creator.channel.name, creator.channel.handle, creator.channel.description, ...creator.latestVideos.map(video => video.category || "")]
      .join(" ")
      .toLowerCase()
      .includes(needle);
    if (!matchesQuery) return false;
    if (filter === "live") return (creator.stats?.live || 0) > 0;
    if (filter === "following") return following.has(creator.channel.handle);
    return true;
  }).sort((left, right) => {
    if (filter === "new") return String(right.stats?.latestAt || "").localeCompare(String(left.stats?.latestAt || ""));
    if (filter === "popular" || sort === "followers") return (right.stats?.followers || 0) - (left.stats?.followers || 0);
    if (sort === "videos") return (right.stats?.videos || 0) - (left.stats?.videos || 0);
    if (sort === "active") return String(right.stats?.latestAt || "").localeCompare(String(left.stats?.latestAt || ""));
    return ((right.stats?.followers || 0) + (right.stats?.videos || 0) * 3 + (right.stats?.live || 0) * 8) - ((left.stats?.followers || 0) + (left.stats?.videos || 0) * 3 + (left.stats?.live || 0) * 8);
  });

  const toggleFollow = async (creator: StreamCreatorDirectoryItem) => {
    const handle = creator.channel.handle;
    if (savingFollow) return;
    setSavingFollow(handle);
    setFollowError("");
    try {
      if (following.has(handle)) await unsubscribeFromStreamChannel(handle);
      else await subscribeToStreamChannel(handle);
      setFollowing(current => {
        const next = new Set(current);
        if (next.has(handle)) next.delete(handle); else next.add(handle);
        return next;
      });
      setCreators(current => current?.map(item => item.creatorId === creator.creatorId ? { ...item, stats: { videos: item.stats?.videos || 0, live: item.stats?.live || 0, latestAt: item.stats?.latestAt || null, followers: Math.max(0, (item.stats?.followers || 0) + (following.has(handle) ? -1 : 1)) } } : item) || []);
    } catch {
      setFollowError("This channel could not be followed. You may be viewing your own channel.");
    } finally { setSavingFollow(""); }
  };

  return (
    <>
      <header className="sw-page-head sw-creators-head">
        <span>
          <GroupsRoundedIcon /> SMAJ CREATORS
        </span>
        <h1>Discover Creators</h1>
        <p>Find channels, follow creators, and watch their latest videos and live broadcasts.</p>
        <Link to="/app/services/stream/studio">Become a Creator</Link>
      </header>
      {creators === null ? <StreamSkeleton variant="channel" label="Loading creator channels..." /> : null}
      {error ? <div className="sw-catalog-status warning">{error}</div> : null}
      {creators?.length ? (
        <div className="sw-creator-discovery-tools">
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search creators, handles, or topics…" />
          <div>{(["recommended", "popular", "new", "live", "following"] as const).map(item => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "live" ? "Live Now" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Sort creators"><option value="recommended">Recommended</option><option value="followers">Most followed</option><option value="active">Recently active</option><option value="videos">Most videos</option></select>
          <span>{filteredCreators.length} channels</span>
        </div>
      ) : null}
      {followError ? <div className="sw-creator-follow-error">{followError}</div> : null}
      {creators?.length && filteredCreators.length ? (
        <section className="sw-creators-directory">
          {filteredCreators.map(creator => (
            <article key={creator.creatorId}>
              <Link className="sw-creator-banner" to={`/app/services/stream/channel/${creator.channel.handle}`} style={creator.channel.bannerUrl ? { backgroundImage: `url("${creator.channel.bannerUrl}")` } : undefined}>
                <span className="sw-creator-avatar">
                  {creator.channel.avatarUrl ? <img src={creator.channel.avatarUrl} alt="" /> : initialsFor(creator.channel.name)}
                </span>
                {creator.stats?.live ? <b>LIVE</b> : null}
              </Link>
              <div className="sw-creator-card-body">
                <Link to={`/app/services/stream/channel/${creator.channel.handle}`}>
                  <h2>{creator.channel.name}</h2>
                  <p>@{creator.channel.handle}</p>
                </Link>
                <button type="button" className={following.has(creator.channel.handle) ? "following" : ""} disabled={savingFollow === creator.channel.handle} onClick={() => void toggleFollow(creator)}>{savingFollow === creator.channel.handle ? "Saving…" : following.has(creator.channel.handle) ? "Following" : "+ Follow"}</button>
              </div>
              <p>{creator.channel.description || "This creator has not added a channel description yet."}</p>
              <div className="sw-creator-stats">
                <span><b>{Number(creator.stats?.followers || 0).toLocaleString()}</b> followers</span>
                <span><b>{creator.stats?.videos || 0}</b> videos</span>
                <span><b>{creator.stats?.live || 0}</b> live</span>
                {creator.stats?.latestAt ? <span>Latest {new Date(creator.stats.latestAt).toLocaleDateString()}</span> : null}
              </div>
              {creator.latestVideos.length ? (
                <div className="sw-creator-latest">
                  {creator.latestVideos.slice(0, 2).map(video => (
                    <Link
                      key={video._id}
                      to={`/app/services/stream/watch/${video.youtubeVideoId ? `yt-${video.youtubeVideoId}` : video.cloudflareUid}`}
                    >
                      <span style={video.thumbnailUrl ? { backgroundImage: `url("${video.thumbnailUrl}")` } : undefined}>
                        <PlayArrowRoundedIcon />
                      </span>
                      <b>{video.title}</b>
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {creators?.length && !filteredCreators.length ? (
        <div className="sw-list-empty">
          <GroupsRoundedIcon />
          <h2>No channels found</h2>
          <p>Try another name or topic, or change the selected filter.</p>
          <button type="button" onClick={() => { setQuery(""); setFilter("recommended"); }}>Show all creators</button>
        </div>
      ) : null}
      {creators && !creators.length && !error ? (
        <div className="sw-list-empty">
          <GroupsRoundedIcon />
          <h2>No creator channels yet</h2>
          <p>Creator channels appear here after the creator saves a channel name and handle.</p>
          <Link to="/app/services/stream/studio">Set up your channel</Link>
        </div>
      ) : null}
    </>
  );
};

export default StreamCreatorsDirectory;
