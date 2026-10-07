import StreamSkeleton from "./StreamSkeleton";
import StreamVideoActions from "./StreamVideoActions";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCreatorVideos, refreshCreatorVideoStatus, type CreatorVideo } from "../../lib/streamCreator";
import { Link } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";

const contentStatus = (video: CreatorVideo) => {
  if (video.processingStatus === "error") return "Processing failed";
  if (video.moderationStatus === "rejected") return "Not approved";
  if (video.processingStatus === "live") return "Live now";
  if (video.contentType === "live" && video.processingStatus === "idle") return "Offline";
  if (video.moderationStatus === "approved" && video.visibility === "public" && video.playbackAllowed) return "Published";
  if (video.processingStatus === "ready") return video.moderationStatus === "approved" ? "Ready" : "In review";
  return "Processing";
};
const sourceLabel = (video: CreatorVideo) => video.contentSource === "youtube" ? "YouTube" : video.contentType === "live" ? "Live stream" : video.contentSource === "internet_archive" ? "Archive" : "Cloudflare";
const CreatorContentList = () => {
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const revision = useRef(0);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    const request = ++revision.current;
    try {
      const items = await getCreatorVideos();
      const refreshed = await Promise.all(items.map(async video => {
        if (video.contentSource === "youtube" || ["ready", "error"].includes(video.processingStatus)) return video;
        try { return await refreshCreatorVideoStatus(video.cloudflareUid); } catch { return video; }
      }));
      if (!mounted.current || request !== revision.current) return;
      setVideos(refreshed);
      setState("ready");
    } catch {
      if (mounted.current && request === revision.current) setState("error");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = window.setInterval(() => void load(), 12000);
    return () => { mounted.current = false; window.clearInterval(interval); };
  }, [load]);
  const updated = (video: CreatorVideo) => {
    revision.current += 1;
    setVideos(current => current.map(item => item._id === video._id ? video : item));
  };
  const removed = (id: string) => {
    revision.current += 1;
    setVideos(current => current.filter(item => item._id !== id));
  };
  if (state === "loading") return <StreamSkeleton variant="cards" label="Loading your videos" />;
  if (state === "error" && !videos.length) return <div className="sw-catalog-status warning">Content could not load. <button type="button" onClick={() => void load()}>Retry</button></div>;
  return <section className="sw-content-manager" aria-label="Your content">
    <header className="sw-content-list-head"><span>{videos.length} {videos.length === 1 ? "video" : "videos"}</span><Link to="/app/services/stream/studio/upload">Upload video</Link></header>
    {state === "error" ? <p className="sw-content-refresh-error" role="status">Could not refresh. Showing your last loaded content.</p> : null}
    {videos.length ? <div className="sw-content-list">{videos.map(video => {
      const playable = video.visibility === "public" && video.moderationStatus === "approved" && video.playbackAllowed;
      const path = `/app/services/stream/${video.contentType === "live" && video.liveInputUid ? `live/${video.liveInputUid}` : `watch/${video.cloudflareUid}`}`;
      const thumbnail = video.thumbnailUrl || video.posterUrl;
      return <article className="sw-content-row" key={video._id}>
        {playable ? <Link className="sw-content-thumbnail" to={path} aria-label={`Watch ${video.title}`}>{thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <PlayArrowRoundedIcon />}</Link> : <div className="sw-content-thumbnail">{thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <PlayArrowRoundedIcon />}</div>}
        <div className="sw-content-copy">{playable ? <Link to={path}>{video.title}</Link> : <strong>{video.title}</strong>}<div><span className="sw-content-source">{sourceLabel(video)}</span><span>{video.visibility[0].toUpperCase() + video.visibility.slice(1)}</span></div><small className={video.processingStatus === "error" || video.moderationStatus === "rejected" ? "needs-attention" : ""}>{contentStatus(video)}</small></div>
        <StreamVideoActions video={video} owner watchPath={path} onUpdated={updated} onDeleted={() => removed(video._id)} />
      </article>;
    })}</div> : <div className="sw-content-empty"><PlayArrowRoundedIcon /><h2>No content yet</h2><Link to="/app/services/stream/studio/upload">Upload your first video</Link></div>}
  </section>;
};
export default CreatorContentList;
