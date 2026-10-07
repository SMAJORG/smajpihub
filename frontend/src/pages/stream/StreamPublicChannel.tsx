import StreamSkeleton from "./StreamSkeleton";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import {
  getPublicStreamChannel,
  getStreamSubscriptionStatus,
  subscribeToStreamChannel,
  unsubscribeFromStreamChannel,
  type PublicStreamChannel,
} from "../../lib/streamChannel";

const StreamPublicChannel = () => {
  const { handle = "" } = useParams();
  const [data, setData] = useState<PublicStreamChannel | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<"posts" | "videos" | "live" | "about">("posts");
  const [following, setFollowing] = useState(false);
  const [followState, setFollowState] = useState<"loading" | "ready" | "saving" | "error">("loading");

  useEffect(() => {
    setState("loading");
    void Promise.all([getPublicStreamChannel(handle), getStreamSubscriptionStatus(handle)])
      .then(([result, subscribed]) => {
        setData(result);
        setFollowing(subscribed);
        setFollowState("ready");
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [handle]);

  const toggleFollow = async () => {
    try {
      setFollowState("saving");
      if (following) await unsubscribeFromStreamChannel(handle);
      else await subscribeToStreamChannel(handle);
      setFollowing(value => !value);
      setFollowState("ready");
    } catch {
      setFollowState("error");
    }
  };

  if (state === "loading") return <StreamSkeleton variant="channel" label="Loading creator channel..." />;
  if (state === "error" || !data)
    return (
      <section className="sw-detail-error">
        <h1>Channel unavailable</h1>
        <p>This creator channel could not be found or requires you to sign in.</p>
        <Link to="/app/services/stream">Back to Stream</Link>
      </section>
    );
  const initials = data.channel.name
    .split(/\s+/)
    .map(word => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const channelStats = data.stats || { followers: 0, videos: data.videos.length, live: data.live.length, joinedAt: null };
  return (
    <section className="sw-public-channel">
      <div
        className="sw-public-channel-banner"
        style={data.channel.bannerUrl ? { backgroundImage: `url("${data.channel.bannerUrl}")` } : undefined}
      />
      <header>
        <div className="sw-public-channel-avatar">
          {data.channel.avatarUrl ? <img src={data.channel.avatarUrl} alt="" /> : initials}
        </div>
        <div>
          <h1>{data.channel.name}</h1>
          <p>
            @{data.channel.handle}
            {followState === "error" ? "  -  Subscription could not update" : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={followState === "saving" || followState === "loading"}
          className={following ? "following" : ""}
          onClick={() => void toggleFollow()}
        >
          {followState === "saving" ? "Saving..." : following ? "Following" : "Follow"}
        </button>
      </header>
      <div className="sw-public-channel-stats"><span><b>{Number(channelStats.followers || 0).toLocaleString()}</b> followers</span><span><b>{channelStats.videos}</b> videos</span><span><b>{channelStats.live}</b> live</span>{channelStats.joinedAt ? <span><b>{new Date(channelStats.joinedAt).getFullYear()}</b> joined</span> : null}</div>
      <nav aria-label="Channel sections">
        {(["posts", "videos", "live", "about"] as const).map(item => (
          <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>
            {item === "live" ? "Live" : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "posts" ? (
        data.posts.length ? (
          <div className="sw-public-post-feed">
            {data.posts.map(post => (
              <article key={post._id}>
                <header>
                  <strong>{data.channel.name}</strong>
                  <small>{post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}</small>
                </header>
                <p>{post.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="sw-channel-empty">No channel posts yet.</p>
        )
      ) : null}
      {tab === "videos" ? (
        data.videos.length ? (
          <div className="sw-public-channel-grid">
            {data.videos.map(video => (
              <Link
                key={video._id}
                to={`/app/services/stream/watch/${video.youtubeVideoId ? `yt-${video.youtubeVideoId}` : video.cloudflareUid}`}
              >
                <div style={video.thumbnailUrl ? { backgroundImage: `url("${video.thumbnailUrl}")` } : undefined}>
                  <PlayArrowRoundedIcon />
                </div>
                <h2>{video.title}</h2>
                <p>{video.category || "Entertainment"}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="sw-channel-empty">No published videos yet.</p>
        )
      ) : null}
      {tab === "live" ? (
        data.live.length ? (
          <div className="sw-public-channel-grid">
            {data.live.map(item => (
              <Link key={item.liveInputUid} to={`/app/services/stream/live/${item.liveInputUid}`}>
                <div style={item.thumbnailUrl ? { backgroundImage: `url("${item.thumbnailUrl}")` } : undefined}>
                  <PlayArrowRoundedIcon />
                </div>
                <h2>{item.title}</h2>
                <p>{item.processingStatus === "live" ? "Live now" : "Scheduled"}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="sw-channel-empty">No published live broadcasts.</p>
        )
      ) : null}
      {tab === "about" ? (
        <div className="sw-public-channel-about">
          <h2>About</h2>
          <p>{data.channel.description || "This creator has not added a channel description yet."}</p>
        </div>
      ) : null}
    </section>
  );
};

export default StreamPublicChannel;
