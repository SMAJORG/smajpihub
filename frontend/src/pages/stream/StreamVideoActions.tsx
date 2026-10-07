import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { Capacitor } from "@capacitor/core";
import { SmajMedia } from "../../native/smajMedia";
import { deleteCreatorVideo, editCreatorVideo, type CreatorVideo } from "../../lib/streamCreator";
import { requestStreamDownload } from "../../lib/streamPlayback";
import { STREAM_ACTIVITY_EVENT } from "../../lib/streamPlaybackTracking";
import "./StreamVideoActions.css";

export type ActionVideo = Pick<CreatorVideo, "title" | "cloudflareUid"> & Partial<CreatorVideo>;
type Props = { video: ActionVideo; owner?: boolean; watchPath?: string; onUpdated?: (video: CreatorVideo) => void; onDeleted?: () => void };
const StreamVideoActions = ({ video, owner = false, watchPath, onUpdated, onDeleted }: Props) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"menu" | "edit" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description || "");
  const [category, setCategory] = useState(video.category || "Entertainment");
  const [visibility, setVisibility] = useState<CreatorVideo["visibility"]>(video.visibility || "private");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    if (!mode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("[data-initial-focus]") || panelRef.current?.querySelector<HTMLElement>("input") || panelRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    first?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { setMode(null); return; }
      if (event.key !== "Tab") return;
      const targets = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])') || []);
      const firstTarget = targets[0];
      const lastTarget = targets[targets.length - 1];
      if (!firstTarget) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === firstTarget) { event.preventDefault(); lastTarget.focus(); }
      else if (!event.shiftKey && document.activeElement === lastTarget) { event.preventDefault(); firstTarget.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
      triggerRef.current?.focus();
    };
  }, [mode]);
  const path = watchPath || `/app/services/stream/${video.contentType === "live" && video.liveInputUid ? `live/${video.liveInputUid}` : `watch/${video.cloudflareUid || `yt-${video.youtubeVideoId}`}`}`;
  const playable = !owner || (video.visibility === "public" && video.moderationStatus === "approved" && video.playbackAllowed !== false);
  const fail = (error: unknown) => setMessage((error as { response?: { data?: { message?: string } } }).response?.data?.message || "This action could not be completed. Please try again.");
  const share = async () => {
    setBusy(true); setMessage("");
    try {
      const url = new URL(path, Capacitor.isNativePlatform() ? "https://smajpihub.com" : window.location.origin).href;
      if (navigator.share) { await navigator.share({ title: video.title, url }); setMode(null); }
      else { await navigator.clipboard.writeText(url); setMessage("Link copied."); }
    } catch (error) { if ((error as { name?: string }).name !== "AbortError") fail(error); }
    finally { setBusy(false); }
  };
  const saveToDevice = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await requestStreamDownload(video.cloudflareUid);
      if (result.status !== "ready" || !result.downloadUrl) { setMessage("Your download is being prepared. Try again shortly."); return; }
      const fileName = `${video.title.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 100) || "SMAJ-video"}.mp4`;
      if (Capacitor.isNativePlatform()) {
        await SmajMedia.startDownload({ url: result.downloadUrl, fileName, title: video.title, location: "downloads" });
        setMessage("Download started. Check your phone's Downloads folder.");
      } else {
        const link = document.createElement("a");
        link.href = result.downloadUrl; link.download = fileName; link.rel = "noopener";
        document.body.appendChild(link); link.click(); link.remove(); setMessage("Download started.");
      }
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const updated = await editCreatorVideo(video.cloudflareUid || video._id || "", { title: title.trim(), description: description.trim(), category: category.trim(), visibility });
      setMode(null); onUpdated?.(updated); window.dispatchEvent(new Event(STREAM_ACTIVITY_EVENT));
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setMessage("");
    try {
      await deleteCreatorVideo(video.cloudflareUid || video._id || "");
      setMode(null); onDeleted?.(); window.dispatchEvent(new Event(STREAM_ACTIVITY_EVENT));
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };
  return <>
    <button ref={triggerRef} type="button" className="sw-video-more" aria-label={`More options for ${video.title}`} aria-haspopup="dialog" aria-expanded={Boolean(mode)} onClick={() => { setMessage(""); setMode("menu"); }}><MoreVertRoundedIcon /></button>
    {mode ? createPortal(
      <div className={`sw-video-modal-layer ${mode === "menu" ? "menu" : "centered"}`} onMouseDown={event => { if (event.target === event.currentTarget && !busy) setMode(null); }}>
        <section ref={panelRef} className="sw-video-action-panel" role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Edit video" : mode === "delete" ? "Delete video" : `Options for ${video.title}`}>
          <header><div><h2>{mode === "edit" ? "Edit video" : mode === "delete" ? "Delete video?" : "Video options"}</h2><p>{video.title}</p></div><button type="button" disabled={busy} aria-label="Close video options" onClick={() => setMode(null)}><CloseRoundedIcon /></button></header>
          {mode === "menu" ? <div className="sw-video-action-list">
            <button type="button" disabled={busy || !playable} onClick={() => { setMode(null); navigate(path); }}><PlayArrowRoundedIcon /><span>Watch video</span></button>
            <button type="button" disabled={busy || !playable} onClick={() => void share()}><ShareRoundedIcon /><span>Share</span></button>
            {video.downloadAllowed && playable ? <button type="button" disabled={busy} onClick={() => void saveToDevice()}><DownloadRoundedIcon /><span>Save to device</span></button> : null}
            {owner ? <>
              <button type="button" disabled={busy || !video.cloudflareUid} onClick={() => { setMode(null); navigate(`/app/services/stream/studio/analytics?video=${encodeURIComponent(video.cloudflareUid)}`); }}><BarChartRoundedIcon /><span>View analytics</span></button>
              <button type="button" disabled={busy} onClick={() => { setTitle(video.title); setDescription(video.description || ""); setCategory(video.category || "Entertainment"); setVisibility(video.visibility || "private"); setMessage(""); setMode("edit"); }}><EditRoundedIcon /><span>Edit details</span></button>
              <button type="button" className="danger" disabled={busy} onClick={() => { setMessage(""); setMode("delete"); }}><DeleteOutlineRoundedIcon /><span>Delete</span></button>
            </> : null}
          </div> : null}
          {mode === "edit" ? <form className="sw-video-edit-form" onSubmit={event => void save(event)}>
            <label>Title<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={140} disabled={busy} /></label>
            <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} rows={3} disabled={busy} /></label>
            <div><label>Category<input value={category} onChange={event => setCategory(event.target.value)} required maxLength={60} disabled={busy} /></label><label>Visibility<select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)} disabled={busy}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label></div>
            <footer><button type="button" disabled={busy} onClick={() => setMode(null)}>Cancel</button><button className="primary" type="submit" disabled={busy || !title.trim() || !category.trim()}>{busy ? "Saving..." : "Save changes"}</button></footer>
          </form> : null}
          {mode === "delete" ? <div className="sw-video-delete-confirm"><p>This video will be removed from your channel and will no longer be available to watch on Stream.</p><footer><button type="button" data-initial-focus disabled={busy} onClick={() => setMode(null)}>Cancel</button><button type="button" className="danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting..." : "Delete video"}</button></footer></div> : null}
          {message ? <p className="sw-video-action-message" role="status">{message}</p> : null}
        </section>
      </div>, document.body
    ) : null}
  </>;
};
export default StreamVideoActions;
