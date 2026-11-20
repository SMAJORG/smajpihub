import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import ClosedCaptionOutlinedIcon from "@mui/icons-material/ClosedCaptionOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import ReplyOutlinedIcon from "@mui/icons-material/ReplyOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import CommunitySkeleton from "./CommunitySkeleton";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";
import CommunityCaptionTrack from "./CommunityCaptionTrack";
import UserAvatarFrame from "./UserAvatarFrame";
import {
  createCommunityComment,
  deleteCommunityPost,
  getCommunityComments,
  reportCommunityPost,
  repostCommunityPost,
  setCommunityReaction,
  toggleCommunityFollow,
  type CommunityComment,
  type CommunityIdentity,
  type CommunityMedia,
  type CommunityPost,
  type CommunityReaction,
} from "../lib/communityApi";
import { claimCommunityVideo, releaseCommunityVideo } from "./communityVideoPlayback";

export type CommunityVideoItem = {
  post: CommunityPost;
  media: CommunityMedia;
  author: CommunityIdentity;
  content: string;
};

type Props = {
  items: CommunityVideoItem[];
  index: number;
  viewerId?: string;
  onClose: () => void;
  onChange?: () => void;
};

export default function CommunityVideoViewer({ items, index, viewerId, onClose, onChange }: Props) {
  const [activeIndex, setActiveIndex] = useState(index);
  const [muted, setMuted] = useState(true);
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [reaction, setReaction] = useState<CommunityReaction | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [repostCount, setRepostCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoadError, setCommentsLoadError] = useState("");
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number | null>(null);
  const dirty = useRef(false);
  const current = items[activeIndex];
  const closeViewer = useCallback(() => {
    if (dirty.current) {
      dirty.current = false;
      onChange?.();
    }
    onClose();
  }, [onChange, onClose]);

  useEffect(() => {
    if (!current) return;
    const video = videoRef.current;
    if (!video) return;
    claimCommunityVideo(video);
    setMuted(true);
    video.muted = true;
    setCurrentTime(0);
    setDuration(0);
    setCaptionsAvailable(false);
    setCaptionsEnabled(false);
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    return () => releaseCommunityVideo(video);
  }, [activeIndex, current]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowDown") setActiveIndex(value => Math.min(items.length - 1, value + 1));
      if (event.key === "ArrowUp") setActiveIndex(value => Math.max(0, value - 1));
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [items.length, closeViewer]);

  useEffect(() => {
    if (!current) return;
    setReaction(current.post.myReaction || (current.post.likedByMe ? "like" : null));
    setLikeCount(current.post.likeCount || 0);
    setCommentCount(current.post.commentCount || 0);
    setRepostCount(current.post.repostCount || 0);
    setFollowing(current.post.isFollowedByMe === true);
    setCommentsOpen(false);
    setCommentsLoading(false);
    setCommentsLoaded(false);
    setCommentsLoadError("");
    setComments([]);
    setReplyTo(null);
    setExpanded(false);
    setError("");
  }, [current]);

  const move = (offset: number) => setActiveIndex(value => Math.max(0, Math.min(items.length - 1, value + offset)));

  const toggleReaction = async () => {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = reaction === "like" ? null : "like";
      const result = await setCommunityReaction(current.post._id, next);
      setReaction(result.myReaction);
      setLikeCount(result.likeCount);
      dirty.current = true;
    } catch {
      setError("Reaction could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const toggleCommentPanel = async () => {
    if (!current || current.post.canComment === false) return;
    if (commentsOpen) {
      setCommentsOpen(false);
      return;
    }
    setCommentsOpen(true);
    setCommentsLoading(true);
    setCommentsLoadError("");
    setBusy(true);
    try {
      setComments(await getCommunityComments(current.post._id));
      setCommentsLoaded(true);
    } catch {
      setCommentsLoadError("Comments could not be loaded.");
    } finally {
      setCommentsLoading(false);
      setBusy(false);
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!current || !commentText.trim() || busy) return;
    setBusy(true);
    try {
      const comment = await createCommunityComment(current.post._id, commentText.trim(), replyTo?._id);
      setComments(value => [...value, comment]);
      setCommentsLoaded(true);
      setCommentsLoadError("");
      setCommentText("");
      setReplyTo(null);
      setCommentCount(value => value + 1);
      dirty.current = true;
    } catch {
      setError("Comment could not be posted.");
    } finally {
      setBusy(false);
    }
  };

  const repost = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await repostCommunityPost(current.post._id);
      setRepostCount(value => value + 1);
      dirty.current = true;
    } catch {
      setError("This post could not be reposted.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!current) return;
    const url = `${window.location.origin}/community/feed?post=${encodeURIComponent(current.post._id)}`;
    try {
      if (navigator.share) await navigator.share({ title: "SMAJ PI HUB community video", text: current.content, url });
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else setError("Sharing is not available in this browser.");
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Video could not be shared.");
    }
  };

  const followAuthor = async () => {
    if (!current || !viewerId || current.author.uid === viewerId || busy) return;
    setBusy(true);
    try {
      setFollowing(await toggleCommunityFollow(current.author.uid));
      dirty.current = true;
    } catch {
      setError("Follow status could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const setCaptionMode = (enabled: boolean) => {
    const video = videoRef.current;
    if (!video || (enabled && !video.textTracks.length)) return;
    Array.from(video.textTracks).forEach(track => { track.mode = enabled ? "showing" : "disabled"; });
    setCaptionsEnabled(enabled);
  };
  const toggleCaptions = () => setCaptionMode(!captionsEnabled);

  const removeOrReport = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (viewerId === current.author.uid) {
        if (window.confirm("Delete this post? This cannot be undone.")) {
          await deleteCommunityPost(current.post._id);
          dirty.current = true;
          closeViewer();
        }
      } else {
        await reportCommunityPost(current.post._id, "Other");
        setError("Report sent for review.");
      }
    } catch {
      setError("The post action could not be completed.");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  if (!current) return null;
  const progress = duration ? currentTime / duration * 100 : 0;
  const description = current.content || "";
  const renderComment = (comment: CommunityComment, isReply = false) => (
    <article className={isReply ? "community-video-comment-reply" : ""} key={comment._id}>
      <UserAvatarFrame name={comment.author.displayName} image={comment.author.avatar} frame={comment.author.activeAvatarFrame} size={32} />
      <div>
        <p><strong>{comment.author.displayName}</strong>{comment.content}</p>
        {viewerId && current.post.canComment !== false ? <button type="button" className="community-video-comment-reply-button" onClick={() => {
          const parent = comment.parentId ? comments.find(item => item._id === comment.parentId) : comment;
          setReplyTo(parent || comment);
        }}><ReplyOutlinedIcon /> Reply</button> : null}
      </div>
    </article>
  );

  return (
    <div
      className="community-video-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen community video"
      onTouchStart={event => { touchStartY.current = event.touches[0]?.clientY ?? null; }}
      onTouchEnd={event => {
        if (touchStartY.current === null) return;
        const difference = touchStartY.current - (event.changedTouches[0]?.clientY ?? touchStartY.current);
        if (Math.abs(difference) > 60) move(difference > 0 ? 1 : -1);
        touchStartY.current = null;
      }}
    >
      <video
        key={`${current.post._id}-${current.media.url}`}
        ref={videoRef}
        src={current.media.url}
        playsInline
        autoPlay
        muted
        preload="auto"
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          else { video.pause(); setPlaying(false); }
        }}
        onLoadedMetadata={event => {
          setDuration(event.currentTarget.duration || 0);
          setCaptionsAvailable(Boolean(current.media.captionsVtt) || event.currentTarget.textTracks.length > 0);
        }}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => move(1)}
        onError={() => setError("This video could not be loaded.")}
      >{current.media.captionsVtt ? <CommunityCaptionTrack vtt={current.media.captionsVtt} onLoad={() => {
        setCaptionsAvailable(true);
        if (captionsEnabled) setCaptionMode(true);
      }} /> : null}</video>
      <button type="button" className="community-video-viewer-back" onClick={closeViewer} aria-label="Return to community feed"><ArrowBackOutlinedIcon /></button>
      <div className="community-video-viewer-top-actions">
        <button type="button" aria-label={muted ? "Unmute video" : "Mute video"} onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          video.muted = !muted;
          setMuted(!muted);
        }}>{muted ? <VolumeOffOutlinedIcon /> : <VolumeUpOutlinedIcon />}</button>
        <button type="button" aria-label={captionsAvailable ? (captionsEnabled ? "Turn captions off" : "Turn captions on") : "Captions unavailable"} disabled={!captionsAvailable} aria-pressed={captionsEnabled} onClick={toggleCaptions}><ClosedCaptionOutlinedIcon /></button>
      </div>
      <div className="community-video-viewer-engagement" aria-label="Post engagement">
        <button type="button" aria-pressed={Boolean(reaction)} disabled={busy} onClick={() => void toggleReaction()}><ThumbUpAltOutlinedIcon /><span>{likeCount}</span></button>
        <button type="button" disabled={busy || current.post.canComment === false} onClick={() => void toggleCommentPanel()}><ChatBubbleOutlineOutlinedIcon /><span>{commentCount}</span></button>
        <button type="button" disabled={busy} onClick={() => void repost()}><RepeatOutlinedIcon /><span>{repostCount}</span></button>
        <button type="button" onClick={() => void share()}><ShareOutlinedIcon /></button>
      </div>
      <div className="community-video-viewer-description">
        <div className="community-video-viewer-author">
          <Link to={`/people/${encodeURIComponent(current.author.uid)}`} onClick={closeViewer}>
            <UserAvatarFrame name={current.author.displayName} image={current.author.avatar} frame={current.author.activeAvatarFrame} size={44} />
          </Link>
          <span>
            <Link to={`/people/${encodeURIComponent(current.author.uid)}`} onClick={closeViewer}>{current.author.displayName}</Link>
            {current.author.headline ? <small>{current.author.headline}</small> : null}
          </span>
          {current.author.uid !== viewerId ? <button type="button" disabled={busy} onClick={() => void followAuthor()}>{following ? "Following" : "+ Follow"}</button> : null}
        </div>
        {description ? <p>{expanded || description.length <= 180 ? description : `${description.slice(0, 180).trimEnd()}…`} {description.length > 180 ? <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "less" : "more"}</button> : null}</p> : null}
        <div className="community-video-viewer-menu-wrap">
          <button type="button" aria-label="Video post options" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreVertOutlinedIcon /></button>
          {menuOpen ? <div role="menu"><button type="button" role="menuitem" disabled={busy} onClick={() => void removeOrReport()}>{viewerId === current.author.uid ? "Delete post" : "Report post"}</button></div> : null}
        </div>
      </div>
      <div className="community-video-viewer-progress">
        <input aria-label="Video playback position" type="range" min={0} max={duration || 0} step="0.1" value={currentTime} onChange={event => {
          const value = Number(event.target.value);
          if (videoRef.current) videoRef.current.currentTime = value;
          setCurrentTime(value);
        }} style={{ "--video-progress": `${progress}%` } as CSSProperties} />
        <span>{playing ? "Playing" : "Paused"} · {activeIndex + 1}/{items.length}</span>
      </div>
      {commentsOpen ? <section className="community-video-comments" aria-label="Video comments">
        <button type="button" className="community-video-comments-close" onClick={() => setCommentsOpen(false)} aria-label="Close comments">×</button>
        <h2>Comments</h2>
        <div className="community-video-comments-list">
          {commentsLoading && !commentsLoaded ? <CommunitySkeleton variant="videoComments" count={3} /> : null}
          {comments.filter(comment => !comment.parentId).map(comment => <div className="community-video-comment-thread" key={comment._id}>
            {renderComment(comment)}
            {comments.filter(reply => reply.parentId === comment._id).map(reply => renderComment(reply, true))}
          </div>)}
          {commentsLoadError ? <p className="community-post-error" role="alert">{commentsLoadError}</p> : null}
          {commentsLoaded && !commentsLoadError && !comments.length ? <p className="community-empty-comments">Be the first to comment.</p> : null}
        </div>
        <form onSubmit={event => void submitComment(event)}>
          <input aria-label={replyTo ? `Reply to ${replyTo.author.displayName}` : "Write a comment"} value={commentText} onChange={event => setCommentText(event.target.value)} maxLength={1000} placeholder={replyTo ? `Reply to ${replyTo.author.displayName}…` : "Write a comment…"} />
          {replyTo ? <button type="button" className="community-video-comment-cancel-reply" onClick={() => setReplyTo(null)}>Cancel reply</button> : null}
          <button type="submit" className="community-video-comment-send" aria-label="Send comment" disabled={busy || !commentText.trim()}><SendOutlinedIcon /></button>
        </form>
      </section> : null}
      {error ? <p className="community-video-viewer-error" role="status">{error}</p> : null}
    </div>
  );
}
