import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import ClosedCaptionOutlinedIcon from "@mui/icons-material/ClosedCaptionOutlined";
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
import CommunityShareFallback from "./CommunityShareFallback";
import { openCommunityNativeShare } from "./communityNativeShare";
import {
  createCommunityComment,
  getCommunityComments,
  recordCommunityPostShare,
  repostCommunityPost,
  setCommunityReaction,
  type CommunityComment,
  type CommunityIdentity,
  type CommunityMedia,
  type CommunityPost,
  type CommunityReaction,
} from "../lib/communityApi";
import { claimCommunityVideo, releaseCommunityVideo } from "./communityVideoPlayback";
import { showFeedback } from "../lib/feedback";

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
  const [reaction, setReaction] = useState<CommunityReaction | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [repostCount, setRepostCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shareFallbackOpen, setShareFallbackOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number | null>(null);
  const dirty = useRef(false);
  const shareInProgress = useRef(false);
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
    setCommentsOpen(false);
    setCommentsLoading(false);
    setCommentsLoaded(false);
    setComments([]);
    setReplyTo(null);
  }, [current]);

  const move = (offset: number) => setActiveIndex(value => Math.max(0, Math.min(items.length - 1, value + offset)));

  const toggleReaction = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const next = reaction === "like" ? null : "like";
      const result = await setCommunityReaction(current.post._id, next);
      setReaction(result.myReaction);
      setLikeCount(result.likeCount);
      dirty.current = true;
      showFeedback(result.myReaction ? "Post liked." : "Like removed.", "success");
    } catch {
      showFeedback("Reaction could not be saved.", "error");
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
    setBusy(true);
    try {
      setComments(await getCommunityComments(current.post._id));
      setCommentsLoaded(true);
    } catch {
      showFeedback("Comments could not be loaded.", "error");
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
      setCommentText("");
      setReplyTo(null);
      setCommentCount(value => value + 1);
      dirty.current = true;
      showFeedback(replyTo ? "Reply posted." : "Comment posted.", "success");
    } catch {
      showFeedback("Comment could not be posted.", "error");
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
      showFeedback("Reposted to your community feed.", "success");
    } catch {
      showFeedback("This post could not be reposted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!current || busy || shareInProgress.current) return;
    shareInProgress.current = true;
    const url = new URL("/community/feed", window.location.origin);
    url.searchParams.set("post", current.post._id);
    try {
      const result = await openCommunityNativeShare({
        title: "SMAJ PI HUB community video",
        text: current.content,
        url: url.toString(),
      });
      if (result === "shared") {
        showFeedback("Video shared.", "success");
        void recordCustomShare();
      } else if (result === "fallback") {
        setShareFallbackOpen(true);
      } else if (result === "failed") {
        showFeedback("Video could not be shared.", "error");
      }
    } finally {
      shareInProgress.current = false;
    }
  };

  const recordCustomShare = async () => {
    if (!current) return;
    try {
      await recordCommunityPostShare(current.post._id);
    } catch {
      showFeedback("The post was shared, but the share could not be recorded.", "warning");
    }
  };

  const setCaptionMode = (enabled: boolean) => {
    const video = videoRef.current;
    if (!video || (enabled && !video.textTracks.length)) return;
    Array.from(video.textTracks).forEach(track => { track.mode = enabled ? "showing" : "disabled"; });
    setCaptionsEnabled(enabled);
  };
  const toggleCaptions = () => setCaptionMode(!captionsEnabled);

  if (!current) return null;
  const progress = duration ? currentTime / duration * 100 : 0;
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
      className={`community-video-viewer${commentsOpen ? " with-comments" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen community video"
      onTouchStart={event => { touchStartY.current = event.touches[0]?.clientY ?? null; }}
      onTouchEnd={event => {
        if (event.target instanceof Element && event.target.closest(".community-video-comments")) {
          touchStartY.current = null;
          return;
        }
        if (touchStartY.current === null) return;
        const difference = touchStartY.current - (event.changedTouches[0]?.clientY ?? touchStartY.current);
        if (Math.abs(difference) > 60) move(difference > 0 ? 1 : -1);
        touchStartY.current = null;
      }}
      onWheel={event => {
        event.stopPropagation();
        if (!(event.target instanceof Element) || !event.target.closest(".community-video-comments")) event.preventDefault();
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
        onError={() => showFeedback("This video could not be loaded.", "error")}
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
      <div className="community-video-viewer-author">
        <Link to={`/people/${encodeURIComponent(current.author.uid)}`} onClick={closeViewer}>
          <UserAvatarFrame name={current.author.displayName} image={current.author.avatar} frame={current.author.activeAvatarFrame} size={44} />
        </Link>
        <span>
          <Link to={`/people/${encodeURIComponent(current.author.uid)}`} onClick={closeViewer}>{current.author.displayName}</Link>
          {current.author.headline ? <small>{current.author.headline}</small> : null}
        </span>
      </div>
      <div className="community-video-viewer-progress">
        <input aria-label="Video playback position" type="range" min={0} max={duration || 0} step="0.1" value={currentTime} onChange={event => {
          const value = Number(event.target.value);
          if (videoRef.current) videoRef.current.currentTime = value;
          setCurrentTime(value);
        }} style={{ "--video-progress": `${progress}%` } as CSSProperties} />
        <span>{playing ? "Playing" : "Paused"} · {activeIndex + 1}/{items.length}</span>
      </div>
      {shareFallbackOpen ? <CommunityShareFallback
        url={new URL(`/community/feed?post=${encodeURIComponent(current.post._id)}`, window.location.origin).toString()}
        copySuccessMessage="Video link copied."
        onClose={() => setShareFallbackOpen(false)}
        onCopied={recordCustomShare}
      /> : null}
      {commentsOpen ? <section className="community-video-comments" aria-label="Video comments">
        <button type="button" className="community-video-comments-close" onClick={() => setCommentsOpen(false)} aria-label="Close comments">×</button>
        <h2>Comments</h2>
        <div className="community-video-comments-list">
          {commentsLoading && !commentsLoaded ? <CommunitySkeleton variant="videoComments" count={3} /> : null}
          {comments.filter(comment => !comment.parentId).map(comment => <div className="community-video-comment-thread" key={comment._id}>
            {renderComment(comment)}
            {comments.filter(reply => reply.parentId === comment._id).map(reply => renderComment(reply, true))}
          </div>)}
          {commentsLoaded && !comments.length ? <p className="community-empty-comments">Be the first to comment.</p> : null}
        </div>
        <form onSubmit={event => void submitComment(event)}>
          <input aria-label={replyTo ? `Reply to ${replyTo.author.displayName}` : "Write a comment"} value={commentText} onChange={event => setCommentText(event.target.value)} maxLength={1000} placeholder={replyTo ? `Reply to ${replyTo.author.displayName}…` : "Write a comment…"} />
          {replyTo ? <button type="button" className="community-video-comment-cancel-reply" onClick={() => setReplyTo(null)}>Cancel reply</button> : null}
          <button type="submit" className="community-video-comment-send" aria-label="Send comment" disabled={busy || !commentText.trim()}><SendOutlinedIcon /></button>
        </form>
      </section> : null}
    </div>
  );
}
