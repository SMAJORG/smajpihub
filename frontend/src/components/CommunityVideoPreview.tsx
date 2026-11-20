import { useEffect, useRef, useState } from "react";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import ClosedCaptionOutlinedIcon from "@mui/icons-material/ClosedCaptionOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import UserAvatarFrame from "./UserAvatarFrame";
import CommunityCaptionTrack from "./CommunityCaptionTrack";
import type { CommunityIdentity, CommunityMedia } from "../lib/communityApi";
import { claimCommunityVideo, communityVideoReleaseEvent, releaseCommunityVideo } from "./communityVideoPlayback";

type Props = {
  media: CommunityMedia;
  author: CommunityIdentity;
  following: boolean;
  canFollow: boolean;
  onOpen: () => void;
  onMore: () => void;
  onDismiss: () => void;
  onFollow: () => void;
};

export default function CommunityVideoPreview({ media, author, following, canFollow, onOpen, onMore, onDismiss, onFollow }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(() => typeof IntersectionObserver === "undefined");
  const [muted, setMuted] = useState(true);
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const portrait = media.width && media.height
    ? media.height > media.width
    : true;
  const width = media.width || (portrait ? 9 : 16);
  const height = media.height || (portrait ? 16 : 9);
  const poster = media.url
    .replace("/video/upload/", "/video/upload/so_0/")
    .replace(/\.(mp4|webm|mov)(\?.*)?$/i, ".jpg$2");

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || shouldLoad) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "700px 0px" });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    const video = videoRef.current;
    if (!video) return;
    const updateVisibility = () => {
      const bounds = video.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
      const ratio = bounds.height ? visibleHeight / bounds.height : 0;
      if (ratio >= 0.6 && !document.hidden) {
        claimCommunityVideo(video);
        video.muted = true;
        setMuted(true);
        if (video.paused) void video.play().catch(() => undefined);
      } else {
        releaseCommunityVideo(video);
      }
    };
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(entries => {
        if (entries.some(entry => entry.target === video)) updateVisibility();
      }, { threshold: [0, 0.6, 1] })
      : null;
    observer?.observe(video);
    if (!observer) updateVisibility();
    document.addEventListener(communityVideoReleaseEvent, updateVisibility);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener(communityVideoReleaseEvent, updateVisibility);
      document.removeEventListener("visibilitychange", updateVisibility);
      releaseCommunityVideo(video);
    };
  }, [shouldLoad]);

  const setCaptionTrack = (enabled: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach(track => { track.mode = enabled ? "showing" : "disabled"; });
    setCaptionsEnabled(enabled);
  };

  return (
    <div
      ref={wrapperRef}
      className={`community-video-preview ${portrait ? "portrait" : "landscape"}${videoReady ? " is-ready" : ""}${videoError ? " has-error" : ""}`}
      style={{ aspectRatio: portrait ? "9 / 16" : `${width} / ${height}` }}
      onClick={onOpen}
    >
      {!videoError ? <video
        ref={videoRef}
        src={shouldLoad ? media.url : undefined}
        poster={shouldLoad ? poster : undefined}
        width={width}
        height={height}
        muted
        playsInline
        preload="none"
        aria-label="Community video"
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          setCaptionsAvailable(Boolean(media.captionsVtt) || video.textTracks.length > 0);
          if (video.textTracks.length) setCaptionTrack(captionsEnabled);
        }}
        onLoadedData={() => setVideoReady(true)}
        onError={() => setVideoError(true)}
      >{media.captionsVtt ? <CommunityCaptionTrack vtt={media.captionsVtt} onLoad={() => {
        setCaptionsAvailable(true);
        if (captionsEnabled) setCaptionTrack(true);
      }} /> : null}</video> : <div className="community-video-fallback">This video could not be loaded.</div>}
      {portrait ? <div className="community-video-author-overlay">
        <UserAvatarFrame name={author.displayName} image={author.avatar} frame={author.activeAvatarFrame} size={34} />
        <span><strong>{author.displayName}</strong>{author.headline ? <small>{author.headline}</small> : null}
          {following ? <small>Following</small> : canFollow ? <button type="button" className="community-video-follow" onClick={event => { event.stopPropagation(); onFollow(); }}>+ Follow</button> : null}
        </span>
        <div className="community-video-author-actions">
          <button type="button" aria-label="Video post options" onClick={event => { event.stopPropagation(); onMore(); }}><MoreVertOutlinedIcon /></button>
          <button type="button" aria-label="Dismiss video post" onClick={event => { event.stopPropagation(); onDismiss(); }}><CloseOutlinedIcon /></button>
        </div>
      </div> : null}
      <div className="community-video-controls" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label={muted ? "Unmute video" : "Mute video"} onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          video.muted = !muted;
          setMuted(!muted);
        }}>{muted ? <VolumeOffOutlinedIcon /> : <VolumeUpOutlinedIcon />}</button>
        <button type="button" aria-label={captionsEnabled ? "Turn captions off" : captionsAvailable ? "Turn captions on" : "Captions unavailable"} disabled={!captionsAvailable} aria-pressed={captionsEnabled} onClick={() => setCaptionTrack(!captionsEnabled)}>
          <ClosedCaptionOutlinedIcon />
        </button>
      </div>
    </div>
  );
}
