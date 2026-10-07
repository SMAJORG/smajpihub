import StreamVideoActions from "./StreamVideoActions";
import StreamSkeleton from "./StreamSkeleton";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SubscriptionsOutlinedIcon from "@mui/icons-material/SubscriptionsOutlined";
import { getStreamSubscriptions, type StreamSubscription } from "../../lib/streamChannel";

const StreamSubscriptions = () => {
  const [channels, setChannels] = useState<StreamSubscription[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getStreamSubscriptions()
      .then(setChannels)
      .catch(() => {
        setChannels([]);
        setError("Subscriptions could not load. Check your connection and sign-in.");
      });
  }, []);

  return (
    <>
      <header className="sw-page-head">
        <span>YOUR STREAM</span>
        <h1>Subscriptions</h1>
        <p>New videos and live broadcasts from creators you follow.</p>
      </header>
      {channels === null ? <StreamSkeleton variant="channel" label="Loading subscriptions..." /> : null}
      {error ? <div className="sw-catalog-status warning">{error}</div> : null}
      {channels?.length ? (
        <section className="sw-subscriptions-list">
          {channels.map(subscription => {
            const initials = subscription.channel.name
              .split(/\s+/)
              .map(word => word[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <article key={subscription.creatorId}>
                <header>
                  <Link
                    className="sw-subscription-avatar"
                    to={`/app/services/stream/channel/${subscription.channel.handle}`}
                  >
                    {subscription.channel.avatarUrl ? <img src={subscription.channel.avatarUrl} alt="" /> : initials}
                  </Link>
                  <div>
                    <h2>{subscription.channel.name}</h2>
                    <p>@{subscription.channel.handle}</p>
                  </div>
                  <Link to={`/app/services/stream/channel/${subscription.channel.handle}`}>View channel</Link>
                </header>
                {subscription.posts.length ? (
                  <div className="sw-subscription-posts">
                    {subscription.posts.map(post => (
                      <article key={post._id}>
                        <p>{post.body}</p>
                        <small>{post.createdAt ? new Date(post.createdAt).toLocaleString() : "Channel update"}</small>
                      </article>
                    ))}
                  </div>
                ) : null}
                {subscription.videos.length ? (
                  <div className="sw-public-channel-grid">
                    {subscription.videos.map(video => {
                      const target =
                        video.contentType === "live"
                          ? `/app/services/stream/live/${video.liveInputUid}`
                          : `/app/services/stream/watch/${video.youtubeVideoId ? `yt-${video.youtubeVideoId}` : video.cloudflareUid}`;
                      return (
                        <article className="sw-channel-video-card" key={video._id}><Link to={target}>
                          <div
                            style={video.thumbnailUrl ? { backgroundImage: `url("${video.thumbnailUrl}")` } : undefined}
                          >
                            <PlayArrowRoundedIcon />
                          </div>
                          <h2>{video.title}</h2>
                          <p>
                            {video.contentType === "live" && video.processingStatus === "live"
                              ? "Live now"
                              : video.category || "Entertainment"}
                          </p>
                        </Link><StreamVideoActions video={video} watchPath={target} /></article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="sw-channel-empty">This creator has no published videos yet.</p>
                )}
              </article>
            );
          })}
        </section>
      ) : null}
      {channels && !channels.length && !error ? (
        <div className="sw-list-empty">
          <SubscriptionsOutlinedIcon />
          <h2>No subscriptions yet</h2>
          <p>Open a creator channel and tap Follow. New releases will appear here on every signed-in device.</p>
          <Link to="/app/services/stream">Discover creators</Link>
        </div>
      ) : null}
    </>
  );
};

export default StreamSubscriptions;
