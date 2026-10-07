import StreamSkeleton from "./StreamSkeleton";
import { useCallback, useEffect, useState } from "react";
import { getCreatorVideos, refreshCreatorVideoStatus, type CreatorVideo } from "../../lib/streamCreator";
import { Link } from "react-router-dom";

const CreatorContentList = () => {
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const items = await getCreatorVideos();
      const refreshed = await Promise.all(items.map(async (video) => {
        if (video.contentSource === "youtube" || video.processingStatus === "ready" || video.processingStatus === "error") return video;
        try { return await refreshCreatorVideoStatus(video.cloudflareUid); } catch { return video; }
      }));
      setVideos(refreshed);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (state === "loading") return <StreamSkeleton variant="cards" label="Loading your videos..." />;
  if (state === "error") return <div className="sw-catalog-status warning">Creator content could not be loaded. Check the backend connection and sign-in.</div>;
  if (!videos.length) return <div className="sw-catalog-status">No creator videos yet. Upload your first video to begin processing.</div>;
  return <><p className="sw-catalog-status">Uploads refresh automatically while Cloudflare processes them. Approved public videos appear in Stream after an admin selects Approve &amp; Publish.</p><div className="sw-table"><header><b>Video</b><b>Source</b><b>Moderation</b><b>Visibility</b></header>{videos.map((video) => <div key={video._id}><span>{(video.thumbnailUrl || video.posterUrl) ? <img className="sw-content-thumb" src={video.thumbnailUrl || video.posterUrl || ""} alt={`${video.title} poster`} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <i className="purple"/>}<b>{video.youtubeVideoId || video.cloudflareUid ? <Link to={`/app/services/stream/watch/${video.youtubeVideoId ? `yt-${video.youtubeVideoId}` : video.cloudflareUid}`}>{video.title}</Link> : video.title}</b></span><em>{video.contentSource === "youtube" ? "YouTube" : video.processingStatus}</em><span>{video.moderationStatus}</span><span>{video.visibility}</span></div>)}</div></>;
};

export default CreatorContentList;
