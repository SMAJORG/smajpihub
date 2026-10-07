import { useSearchParams } from "react-router-dom";
import StreamSkeleton from "./StreamSkeleton";
import { STREAM_ACTIVITY_EVENT } from "../../lib/streamPlaybackTracking";
import { useEffect, useState } from "react";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import { getCreatorOverview, type CreatorOverview } from "../../lib/streamCreator";

const duration = (seconds: number) => seconds < 60 ? `${Math.floor(seconds)}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s` : `${(seconds / 3600).toFixed(1)}h`;

const StreamCreatorOverview = ({ mode }: { mode: "overview" | "analytics" | "earnings" }) => {
  const [searchParams] = useSearchParams();
  const videoUid = mode === "analytics" ? searchParams.get("video") || undefined : undefined;
  const [data, setData] = useState<CreatorOverview | null>(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setData(null);
    setError(false);
    let active = true;
    let running = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const result = await getCreatorOverview(controller.signal, videoUid);
        if (active) { setData(result); setError(false); setUpdatedAt(new Date()); }
      } catch { if (active) setError(true); }
      finally { running = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener(STREAM_ACTIVITY_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(STREAM_ACTIVITY_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [retry, videoUid]);
  if (!data) return error ? <div className="sw-catalog-status warning">Creator statistics could not be loaded. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : <StreamSkeleton variant="metrics" label="Loading creator statistics" />;
  if (mode === "earnings") {
    const eligibility = data.monetization?.eligibility ?? {
      channelProfile: false,
      rightsConfirmed: false,
      publishedVideo: data.stats.publishedVideos > 0,
      minimumViews: data.stats.totalViews >= 1_000,
      minimumWatchSeconds: data.stats.watchSeconds >= 36_000,
      goodStanding: data.stats.rejectedVideos === 0,
    };
    const steps = [
      ["Complete your creator channel profile", eligibility.channelProfile],
      ["Confirm distribution rights on an upload", eligibility.rightsConfirmed],
      ["Publish at least one approved public video", eligibility.publishedVideo],
      ["Reach 1,000 recorded views", eligibility.minimumViews],
      ["Reach 10 hours of recorded watch time", eligibility.minimumWatchSeconds],
      ["Keep the channel in good standing", eligibility.goodStanding],
    ] as const;
    return <><div className="sw-balance sw-monetization-disabled"><span><PaymentsRoundedIcon /></span><div><small>Creator Pi eligibility</small><strong>{data.monetization?.eligible ? "Eligibility steps complete" : `${steps.filter(([, complete]) => complete).length} of ${steps.length} steps complete`}</strong><p>{data.monetization?.reason || "Creator Pi payouts are not live yet. Complete the eligibility steps so your channel is ready when compliant payouts launch."}</p></div></div><section className="sw-panel sw-eligibility-panel"><h2>Steps to become eligible</h2><ol>{steps.map(([label, complete]) => <li className={complete ? "complete" : ""} key={label}><b>{complete ? "Done" : "Next"}</b><span>{label}</span></li>)}</ol><p>Completing these steps does not guarantee payment. Pi payouts begin only after SMAJ publishes the creator reward terms and enables a compliant funded payout system.</p></section></>;
  }
  const metrics = mode === "analytics" ? [
    ["Views", data.stats.totalViews.toLocaleString(), "Live totals"],
    ["Watch time", duration(data.stats.watchSeconds), "Recorded"],
    ["Average view", duration(data.stats.averageViewSeconds), "Per view"],
    ["Published", String(data.stats.publishedVideos), "Videos"],
    ...(!videoUid ? [["Followers", String(data.stats.followers ?? 0), "Current followers"], ["Posts", String(data.stats.posts ?? 0), "Channel posts"]] : []),
    ["Live streams", String(data.stats.liveStreams), "Created"],
    ["Pending review", String(data.stats.pendingVideos), "Uploads"],
  ] : [
    ["Total videos", String(data.stats.totalVideos), "All uploads"],
    ["Published", String(data.stats.publishedVideos), "Public"],
    ["Pending review", String(data.stats.pendingVideos), "Moderation"],
    ["Live streams", String(data.stats.liveStreams), "Created"],
  ];
  return <>{data.videoTitle ? <p className="sw-video-analytics-title">{data.videoTitle}</p> : null}<div className="sw-metrics">{metrics.map(([label,value,note]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div><div className="sw-panel"><h2>{mode === "analytics" ? "Live analytics" : "Channel status"}</h2>{error ? <p role="status">Updates are temporarily unavailable. Showing the last synchronized totals.</p> : updatedAt ? <small>Updated {updatedAt.toLocaleTimeString()} - Refreshes every 5 seconds</small> : null}<p>{mode === "analytics" ? data.stats.totalViews ? "Views and watch time update as viewers play your videos. Followers, uploads and posts use current channel activity." : "No playback events have been recorded yet." : data.stats.latestUploadAt ? `Latest upload: ${new Date(data.stats.latestUploadAt).toLocaleDateString()}` : "No uploads yet."}</p>{mode === "overview" ? <p>{data.stats.rejectedVideos} rejected  -  {data.stats.totalViews.toLocaleString()} recorded views</p> : null}</div></>;
};

export default StreamCreatorOverview;
