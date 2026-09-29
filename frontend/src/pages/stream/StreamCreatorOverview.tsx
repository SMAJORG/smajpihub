import { useEffect, useState } from "react";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import { getCreatorOverview, type CreatorOverview } from "../../lib/streamCreator";

const duration = (seconds: number) => !seconds ? "0m" : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`;

const StreamCreatorOverview = ({ mode }: { mode: "overview" | "analytics" | "earnings" }) => {
  const [data, setData] = useState<CreatorOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void getCreatorOverview().then(setData).catch(() => setError(true)); }, []);
  if (!data) return <div className={`sw-catalog-status${error ? " warning" : ""}`}>{error ? "Creator statistics could not be loaded." : "Loading real creator statistics..."}</div>;
  if (mode === "earnings") {
    const steps = [
      ["Complete your creator channel profile", data.monetization.eligibility.channelProfile],
      ["Confirm distribution rights on an upload", data.monetization.eligibility.rightsConfirmed],
      ["Publish at least one approved public video", data.monetization.eligibility.publishedVideo],
      ["Reach 1,000 recorded views", data.monetization.eligibility.minimumViews],
      ["Reach 10 hours of recorded watch time", data.monetization.eligibility.minimumWatchSeconds],
      ["Keep the channel in good standing", data.monetization.eligibility.goodStanding],
    ] as const;
    return <><div className="sw-balance sw-monetization-disabled"><span><PaymentsRoundedIcon /></span><div><small>Creator Pi eligibility</small><strong>{data.monetization.eligible ? "Eligibility steps complete" : `${steps.filter(([, complete]) => complete).length} of ${steps.length} steps complete`}</strong><p>{data.monetization.reason}</p></div></div><section className="sw-panel sw-eligibility-panel"><h2>Steps to become eligible</h2><ol>{steps.map(([label, complete]) => <li className={complete ? "complete" : ""} key={label}><b>{complete ? "✓" : "○"}</b><span>{label}</span></li>)}</ol><p>Completing these steps does not guarantee payment. Pi payouts begin only after SMAJ publishes the creator reward terms and enables a compliant funded payout system.</p></section></>;
  }
  const metrics = mode === "analytics" ? [
    ["Views", data.stats.totalViews.toLocaleString(), "Recorded"],
    ["Watch time", duration(data.stats.watchSeconds), "Recorded"],
    ["Average view", duration(data.stats.averageViewSeconds), "Per view"],
    ["Published", String(data.stats.publishedVideos), "Videos"],
  ] : [
    ["Total videos", String(data.stats.totalVideos), "All uploads"],
    ["Published", String(data.stats.publishedVideos), "Public"],
    ["Pending review", String(data.stats.pendingVideos), "Moderation"],
    ["Live streams", String(data.stats.liveStreams), "Created"],
  ];
  return <><div className="sw-metrics">{metrics.map(([label,value,note]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div><div className="sw-panel"><h2>{mode === "analytics" ? "Analytics status" : "Channel status"}</h2><p>{mode === "analytics" ? data.stats.totalViews ? "Totals use recorded SMAJ playback events." : "No playback events have been recorded yet." : data.stats.latestUploadAt ? `Latest upload: ${new Date(data.stats.latestUploadAt).toLocaleDateString()}` : "No uploads yet."}</p>{mode === "overview" ? <p>{data.stats.rejectedVideos} rejected  -  {data.stats.totalViews.toLocaleString()} recorded views</p> : null}</div></>;
};

export default StreamCreatorOverview;
