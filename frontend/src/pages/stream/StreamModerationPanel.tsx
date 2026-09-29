import { useCallback, useEffect, useState } from "react";
import { getModerationVideos, updateModerationVideo, type ModerationVideo } from "../../lib/streamAdmin";
import { searchStreamCatalog, type StreamCatalogTitle } from "../../lib/streamCatalog";
import ActionDialog from "../../components/ActionDialog";

const StreamModerationPanel = () => {
  const [videos, setVideos] = useState<ModerationVideo[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [searchUid, setSearchUid] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StreamCatalogTitle[]>([]);
  const [rejectVideo, setRejectVideo] = useState<ModerationVideo | null>(null);
  const load = useCallback(() =>
    void getModerationVideos(filter)
      .then(setVideos)
      .catch(error => {
        setVideos([]);
        setMessageType("error");
        setMessage(error?.response?.data?.message || "The moderation queue could not be loaded.");
      }), [filter]);
  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);
  const act = async (video: ModerationVideo, body: Record<string, unknown>) => {
    try {
      setBusy(video.cloudflareUid);
      setMessage("");
      const updated = await updateModerationVideo(video.cloudflareUid, body);
      setVideos(current => current?.map(item => (item.cloudflareUid === updated.cloudflareUid ? updated : item)) || []);
      const action = String(body.action || "update");
      setMessageType("success");
      setMessage(
        action === "publish"
          ? `"${video.title}" is approved, public, and ready for playback.`
          : action === "approve"
          ? `"${video.title}" is approved.`
          : action === "reject"
            ? `"${video.title}" was rejected.`
            : action === "playback"
              ? `Playback ${body.enabled ? "enabled" : "disabled"} for "${video.title}".`
              : action === "visibility"
                ? `Visibility changed to ${body.visibility}.`
                : action === "attach"
                  ? `"${video.title}" is attached to the selected TMDB title.`
                  : "Video updated."
      );
    } catch (error) {
      setMessageType("error");
      setMessage(
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          "The video could not be updated."
      );
    } finally {
      setBusy("");
    }
  };
  const reject = (reason: string) => {
    if (!rejectVideo) return;
    const video = rejectVideo;
    setRejectVideo(null);
    void act(video, { action: "reject", reason });
  };
  const search = async () => {
    if (query.trim().length < 2) return;
    try {
      setResults((await searchStreamCatalog(query.trim())).results.slice(0, 8));
    } catch {
      setMessageType("error");
      setMessage("TMDB search is unavailable.");
    }
  };
  if (!videos) return <div className="sw-catalog-status">Loading moderation queue...</div>;
  return (
    <>
      <div className="sw-moderation-toolbar">
        <label>
          Status
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All videos</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <span>{videos.length} videos</span>
      </div>
      {message ? (
        <p className={`sw-profile-message ${messageType === "error" ? "error" : "success"}`}>{message}</p>
      ) : null}
      <div className="sw-moderation-list">
        {videos.map(video => (
          <article key={video.cloudflareUid}>
            <div className="sw-moderation-preview">
              {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span>VIDEO</span>}
            </div>
            <div className="sw-moderation-copy">
              <span className={`sw-moderation-status ${video.moderationStatus || "pending"}`}>
                {video.moderationStatus || "pending"}
              </span>
              <h2>{video.title}</h2>
              <p>
                {video.creatorName || "Creator"}  - {" "}
                {video.contentSource === "youtube" ? "YouTube" : video.processingStatus}
              </p>
              <small>Rights declaration: {video.rightsConfirmed ? "Confirmed" : "Missing"}</small>
              {video.moderationReason ? <em>{video.moderationReason}</em> : null}
              {video.catalogAttachment ? (
                <b>Attached to {video.catalogAttachment.title || `TMDB #${video.catalogAttachment.tmdbId}`}</b>
              ) : null}
            </div>
            <div className="sw-moderation-actions">
              <button
                className={video.moderationStatus === "approved" && video.visibility === "public" && video.playbackAllowed ? "approved" : ""}
                disabled={
                  busy === video.cloudflareUid ||
                  video.processingStatus !== "ready" ||
                  (video.moderationStatus === "approved" && video.visibility === "public" && video.playbackAllowed)
                }
                onClick={() => void act(video, { action: "publish" })}
              >
                {busy === video.cloudflareUid
                  ? "Saving..."
                  : video.processingStatus !== "ready"
                    ? "Processing..."
                    : video.moderationStatus === "approved" && video.visibility === "public" && video.playbackAllowed
                      ? "Published"
                      : "Approve & Publish"}
              </button>
              <button
                disabled={busy === video.cloudflareUid || video.moderationStatus === "rejected"}
                onClick={() => setRejectVideo(video)}
              >
                {video.moderationStatus === "rejected" ? "Rejected" : "Reject"}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={video.playbackAllowed === true}
                  disabled={busy === video.cloudflareUid || video.moderationStatus !== "approved"}
                  onChange={event => void act(video, { action: "playback", enabled: event.target.checked })}
                />{" "}
                Playback
              </label>
              <select
                value={video.visibility}
                disabled={busy === video.cloudflareUid}
                onChange={event => void act(video, { action: "visibility", visibility: event.target.value })}
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
              <button
                disabled={busy === video.cloudflareUid || video.moderationStatus !== "approved"}
                onClick={() => {
                  setSearchUid(video.cloudflareUid);
                  setQuery("");
                  setResults([]);
                }}
              >
                Attach TMDB
              </button>
            </div>
            {searchUid === video.cloudflareUid ? (
              <div className="sw-attach-panel">
                <div>
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search movie or series"
                  />
                  <button onClick={() => void search()}>Search</button>
                </div>
                {results.map(title => (
                  <button
                    key={`${title.mediaType}-${title.id}`}
                    onClick={() => {
                      void act(video, {
                        action: "attach",
                        tmdbId: title.tmdbId,
                        mediaType: title.mediaType,
                        title: title.title,
                      });
                      setSearchUid("");
                    }}
                  >
                    <span>{title.posterUrl ? <img src={title.posterUrl} alt="" /> : null}</span>
                    <b>{title.title}</b>
                    <small>
                      {title.mediaType === "tv" ? "Series" : "Movie"}  -  {title.releaseDate?.slice(0, 4) || "New"}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <ActionDialog
        open={Boolean(rejectVideo)}
        title={`Reject "${rejectVideo?.title || "video"}"?`}
        description="The creator will see this reason. Playback will be disabled automatically."
        confirmLabel="Reject video"
        danger
        busy={Boolean(rejectVideo && busy === rejectVideo.cloudflareUid)}
        inputLabel="Rejection reason"
        minLength={5}
        onCancel={() => setRejectVideo(null)}
        onConfirm={reject}
      />
    </>
  );
};

export default StreamModerationPanel;
