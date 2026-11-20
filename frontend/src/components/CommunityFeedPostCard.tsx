import { memo, useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { Link } from "react-router-dom";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import BookmarkOutlinedIcon from "@mui/icons-material/BookmarkOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import ReplyOutlinedIcon from "@mui/icons-material/ReplyOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import ThumbDownAltOutlinedIcon from "@mui/icons-material/ThumbDownAltOutlined";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import CommunitySkeleton from "./CommunitySkeleton";
import UserAvatarFrame, { type AvatarFrameId } from "./UserAvatarFrame";
import TrustBadge from "./TrustBadge";
import CommunityVideoPreview from "./CommunityVideoPreview";
import {
  createCommunityComment,
  deleteCommunityPost,
  getCommunityComments,
  hideCommunityAuthor,
  markCommunityPostNotInterested,
  recordCommunityPostShare,
  reportCommunityPost,
  repostCommunityPost,
  setCommunityReaction,
  setCommunityFollow,
  setCommunityPostSaved,
  toggleCommunityFollow,
  updateCommunityPost,
  voteOnCommunityPoll,
  type CommunityComment,
  type CommunityMedia,
  type CommunityPost,
  type CommunityReaction,
  type CommunityReactionCounts,
} from "../lib/communityApi";

type Props = {
  post: CommunityPost;
  viewerId?: string;
  viewerAvatarFrame?: AvatarFrameId | null;
  onChange?: () => void;
  onDismiss?: (postId: string) => void;
  onOpenVideo?: (post: CommunityPost, media: CommunityMedia) => void;
};

const reactionOptions: Array<{ type: CommunityReaction; emoji: string; label: string }> = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "celebrate", emoji: "🎉", label: "Celebrate" },
  { type: "support", emoji: "🙌", label: "Support" },
  { type: "insightful", emoji: "💡", label: "Insightful" },
];
const reportReasons = ["Harassment or bullying", "Hate or harmful content", "Spam or scam", "Privacy violation", "Other"];
const when = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
};
const errorMessage = (reason: unknown, fallback: string) => {
  if (reason && typeof reason === "object" && "response" in reason) {
    const response = (reason as { response?: { status?: number; data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
    if (response?.status) return `${fallback} (HTTP ${response.status}).`;
  }
  return fallback;
};

const linkedText = (text: string): ReactNode[] => text.split(/(https?:\/\/[^\s]+|#[\w]+|@[\w.-]+)/g).map((part, index) => {
  if (/^https?:\/\//i.test(part)) return <a key={`${index}-${part}`} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
  if (/^[#@]/.test(part)) return <Link key={`${index}-${part}`} to={`/search?q=${encodeURIComponent(part.slice(1))}`}>{part}</Link>;
  return part;
});

const AudienceIcon = ({ audience }: { audience?: CommunityPost["audience"] }) => audience === "followers"
  ? <GroupsOutlinedIcon aria-label="Followers" />
  : audience === "only_me" ? <LockOutlinedIcon aria-label="Only me" /> : <PublicOutlinedIcon aria-label="Public" />;

const CommunityFeedImage = ({ media, index }: { media: CommunityMedia; index: number }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(() => typeof IntersectionObserver === "undefined");
  const width = media.width || 16;
  const height = media.height || 9;
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || shouldLoad) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "700px 0px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [shouldLoad]);
  return (
    <div ref={frameRef} className={`community-feed-image-frame${loaded ? " is-loaded" : ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {shouldLoad ? <img
        loading="lazy"
        decoding="async"
        width={media.width || 16}
        height={media.height || 9}
        src={media.url}
        alt={media.altText || `Community post image ${index + 1}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      /> : null}
    </div>
  );
};

function CommunityFeedPostCard({ post, viewerId, viewerAvatarFrame, onChange, onDismiss, onOpenVideo }: Props) {
  const original = post.originalPost;
  const content: CommunityPost = original ? { ...post, ...original } : post;
  const author = content.author || post.author;
  const [reaction, setReaction] = useState<CommunityReaction | null>(content.myReaction || (content.likedByMe ? "like" : null));
  const [reactionCounts, setReactionCounts] = useState<CommunityReactionCounts>(content.reactionCounts || { like: content.likeCount || 0 });
  const [likeCount, setLikeCount] = useState(content.likeCount || 0);
  const [commentCount, setCommentCount] = useState(content.commentCount || 0);
  const [repostCount, setRepostCount] = useState(content.repostCount || 0);
  const [following, setFollowing] = useState(content.isFollowedByMe === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoadError, setCommentsLoadError] = useState("");
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [saved, setSaved] = useState(post.savedByMe === true);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [poll, setPoll] = useState(content.poll);
  const [myVote, setMyVote] = useState(content.myVote || null);
  const reactionPressTimer = useRef<number | null>(null);
  const menuCloseTimer = useRef<number | null>(null);
  const menuTouchStartY = useRef<number | null>(null);
  const longPressOpenedReactions = useRef(false);
  const isOwnPost = viewerId === post.authorId;
  const menuAuthor = isOwnPost ? post.author : author;

  useEffect(() => () => {
    if (reactionPressTimer.current !== null) window.clearTimeout(reactionPressTimer.current);
    if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
  }, []);

  useEffect(() => {
    setReaction(content.myReaction || (content.likedByMe ? "like" : null));
    setReactionCounts(content.reactionCounts || { like: content.likeCount || 0 });
    setLikeCount(content.likeCount || 0);
    setCommentCount(content.commentCount || 0);
    setRepostCount(content.repostCount || 0);
    setFollowing(content.isFollowedByMe === true);
    setSaved(post.savedByMe === true);
    setPoll(content.poll);
    setMyVote(content.myVote || null);
  }, [content.canComment, content.commentCount, content.isFollowedByMe, content.likeCount, content.likedByMe, content.myReaction, content.poll, content.reactionCounts, content.repostCount, content.myVote, post]);

  const openOptionsMenu = () => {
    if (menuCloseTimer.current !== null) {
      window.clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
    setMenuClosing(false);
    setMenuOpen(true);
  };
  const closeOptionsMenu = (afterClose?: () => void) => {
    if (!menuOpen) {
      afterClose?.();
      return;
    }
    if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
    setMenuClosing(true);
    menuCloseTimer.current = window.setTimeout(() => {
      menuCloseTimer.current = null;
      setMenuOpen(false);
      setMenuClosing(false);
      afterClose?.();
    }, 180);
  };
  const beginMenuSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    menuTouchStartY.current = event.touches[0]?.clientY ?? null;
  };
  const finishMenuSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = menuTouchStartY.current;
    menuTouchStartY.current = null;
    if (start !== null && (event.changedTouches[0]?.clientY ?? start) - start > 70) closeOptionsMenu();
  };

  const chooseReaction = async (type: CommunityReaction) => {
    if (busy) return;
    const next = reaction === type ? null : type;
    const previousReaction = reaction;
    const previousCounts = reactionCounts;
    const previousLikeCount = likeCount;
    setReaction(next);
    setReactionCounts(current => {
      const updated = { ...current };
      if (previousReaction) updated[previousReaction] = Math.max(0, Number(updated[previousReaction] || 0) - 1);
      if (next) updated[next] = Number(updated[next] || 0) + 1;
      return updated;
    });
    setLikeCount(current => Math.max(0, current + (next ? 1 : 0) - (previousReaction ? 1 : 0)));
    setBusy(true);
    setError("");
    try {
      const saved = await setCommunityReaction(content._id, next);
      setReaction(saved.myReaction);
      setReactionCounts(saved.reactionCounts);
      setLikeCount(saved.likeCount);
      setReactionMenuOpen(false);
      onChange?.();
    } catch (reason) {
      setReaction(previousReaction);
      setReactionCounts(previousCounts);
      setLikeCount(previousLikeCount);
      setError(errorMessage(reason, "Your reaction could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const startReactionPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || busy) return;
    if (reactionPressTimer.current !== null) window.clearTimeout(reactionPressTimer.current);
    longPressOpenedReactions.current = false;
    reactionPressTimer.current = window.setTimeout(() => {
      reactionPressTimer.current = null;
      longPressOpenedReactions.current = true;
      setReactionMenuOpen(true);
    }, 450);
  };
  const finishReactionPress = () => {
    if (reactionPressTimer.current !== null) {
      window.clearTimeout(reactionPressTimer.current);
      reactionPressTimer.current = null;
    }
  };
  const openReactionsFromContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    longPressOpenedReactions.current = true;
    setReactionMenuOpen(true);
  };
  const handleLikeClick = () => {
    if (longPressOpenedReactions.current) {
      longPressOpenedReactions.current = false;
      return;
    }
    void chooseReaction("like");
  };

  const toggleComments = async () => {
    if (content.canComment === false) return;
    if (commentsOpen) {
      setCommentsOpen(false);
      return;
    }
    setCommentsOpen(true);
    setCommentsLoading(true);
    setCommentsLoadError("");
    setBusy(true);
    setError("");
    try {
      setComments(await getCommunityComments(content._id));
      setCommentsLoaded(true);
    } catch {
      setCommentsLoadError("Comments could not be loaded. Please try again.");
    } finally {
      setCommentsLoading(false);
      setBusy(false);
    }
  };

  const vote = async (optionId: string) => {
    if (busy || myVote || !viewerId) return;
    setBusy(true);
    setError("");
    try {
      const result = await voteOnCommunityPoll(content._id, optionId);
      setMyVote(result.myVote);
      setPoll(current => current ? { ...current, options: result.options } : current);
    } catch {
      setError("Your vote could not be saved. The poll may have closed.");
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const comment = await createCommunityComment(content._id, text, replyTo?._id);
      setComments(current => [...current, comment]);
      setCommentsLoaded(true);
      setCommentsLoadError("");
      setCommentText("");
      setReplyTo(null);
      setCommentCount(current => current + 1);
    } catch {
      setError("Comment could not be posted. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const renderComment = (comment: CommunityComment, isReply = false) => (
    <article className={`community-comment${isReply ? " community-comment-reply" : ""}`} key={comment._id}>
      <Link to={`/people/${encodeURIComponent(comment.author.uid)}`} aria-label={`View ${comment.author.displayName}'s public profile`}>
        <UserAvatarFrame name={comment.author.displayName} image={comment.author.avatar} frame={comment.author.uid === viewerId && viewerAvatarFrame !== undefined ? viewerAvatarFrame : comment.author.activeAvatarFrame} size={34} />
      </Link>
      <div>
        <Link className="community-comment-author" to={`/people/${encodeURIComponent(comment.author.uid)}`}>{comment.author.displayName}</Link>
        <p>{comment.content}</p>
        <small title={new Date(comment.createdAt).toLocaleString()}>{when(comment.createdAt)}</small>
        {viewerId && content.canComment !== false ? <button type="button" className="community-comment-reply-button" onClick={() => {
          const parent = comment.parentId ? comments.find(item => item._id === comment.parentId) : comment;
          setReplyTo(parent || comment);
        }}><ReplyOutlinedIcon /> Reply</button> : null}
      </div>
    </article>
  );

  const followAuthor = async () => {
    if (busy || author.uid === viewerId) return;
    setBusy(true);
    setError("");
    try {
      const next = await toggleCommunityFollow(author.uid);
      setFollowing(next);
      onChange?.();
    } catch {
      setError("Follow status could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const unfollowAuthor = async () => {
    if (busy || !following) return;
    setBusy(true);
    setError("");
    try {
      setFollowing(await setCommunityFollow(author.uid, false));
      onChange?.();
    } catch {
      setError("Follow status could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSavedPost = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const nextSaved = await setCommunityPostSaved(post._id, !saved);
      setSaved(nextSaved);
      setNotice(nextSaved ? "Post saved." : "Post removed from saved posts.");
      onChange?.();
    } catch {
      setError("Post could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const hideAuthorPosts = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await hideCommunityAuthor(author.uid);
      onDismiss?.(post._id);
      onChange?.();
    } catch {
      setError("Posts by this user could not be hidden. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const markNotInterested = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await markCommunityPostNotInterested(post._id);
      onDismiss?.(post._id);
      onChange?.();
    } catch {
      setError("This post could not be removed from your feed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const repost = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await repostCommunityPost(content._id);
      setRepostCount(current => current + 1);
      setNotice("Reposted to your community feed.");
      onChange?.();
    } catch (reason) {
      setError(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 409
        ? "You have already reposted this."
        : "Could not repost. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (busy) return;
    const url = `${window.location.origin}/community/feed?post=${encodeURIComponent(post._id)}`;
    let copied = false;
    setBusy(true);
    setError("");
    try {
      try {
        if (navigator.share) await navigator.share({ title: "SMAJ PI HUB community post", text: post.content || content.content, url });
        else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        } else {
          setError("Sharing is not available in this browser.");
          return;
        }
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Post could not be shared.");
        return;
      }
      try {
        await recordCommunityPostShare(post._id);
        setNotice(copied ? "Post link copied." : "Post shared.");
      } catch {
        setError("The post was shared, but the share could not be recorded.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitPostEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateCommunityPost(post._id, editText);
      setEditOpen(false);
      setNotice("Post updated.");
      onChange?.();
    } catch (reason) {
      setError(errorMessage(reason, "Post could not be updated. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await reportCommunityPost(content._id, reportReason);
      setReportOpen(false);
      setNotice("Report sent for review.");
    } catch (reason) {
      setError(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 409
        ? "You have already reported this post."
        : "Report could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const removePost = async () => {
    if (busy || !window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteCommunityPost(post._id);
      onDismiss?.(post._id);
      onChange?.();
    } catch {
      setError("Post could not be deleted. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = useCallback(() => onDismiss?.(post._id), [onDismiss, post._id]);

  const activityText = post.socialActivity
    ? post.socialActivity.kind === "likes" ? "likes this"
      : post.socialActivity.kind === "commented" ? "commented on this"
        : post.socialActivity.kind === "reposted" ? "reposted this"
          : "follows this page"
    : "";
  const counts = reactionCounts || { like: likeCount };

  return (
    <article className="community-feed-post" id={`community-post-${post._id}`}>
      {post.socialActivity ? <div className="community-social-context"><ThumbUpAltOutlinedIcon /> <strong>{post.socialActivity.displayName}</strong> {activityText}</div> : null}
      {post.type === "repost" ? <p className="community-feed-repost-label">Reposted by <Link to={`/people/${encodeURIComponent(post.author.uid)}`}>{post.author.displayName}</Link></p> : null}
      <header className="community-feed-post-header">
        <Link to={`/people/${encodeURIComponent(author.uid)}`} aria-label={`View ${author.displayName}'s public profile`}>
          <UserAvatarFrame
            name={author.displayName}
            image={author.avatar}
            frame={author.uid === viewerId && viewerAvatarFrame !== undefined ? viewerAvatarFrame : author.activeAvatarFrame}
            size={50}
          />
        </Link>
        <div className="community-feed-author-details">
          <Link to={`/people/${encodeURIComponent(author.uid)}`} className="community-feed-author-name">{author.displayName}<TrustBadge userId={author.uid} /></Link>
          {author.headline ? <span className="community-feed-headline">{author.headline}</span> : null}
          <span className="community-feed-post-meta" title={new Date(content.createdAt || post.createdAt).toLocaleString()}>{when(content.createdAt || post.createdAt)} · <AudienceIcon audience={content.audience} /></span>
        </div>
        {author.uid !== viewerId ? <button type="button" className={`community-follow-button${following ? " following" : ""}`} onClick={() => void followAuthor()} disabled={busy}>
          {following ? "Following" : <><AddOutlinedIcon /> Follow</>}
        </button> : null}
        <div className="community-feed-post-menu-wrap">
          <button type="button" className="community-feed-icon-button" aria-label="Post options" aria-expanded={menuOpen && !menuClosing} onClick={() => menuOpen ? closeOptionsMenu() : openOptionsMenu()}><MoreVertOutlinedIcon /></button>
        </div>
        <button type="button" className="community-feed-icon-button" aria-label="Dismiss post" onClick={dismiss}><CloseOutlinedIcon /></button>
      </header>
      {post.type === "repost" && post.content ? <p className="community-feed-repost-note">{post.content}</p> : null}
      <div className="community-feed-post-body">
        {content.content ? <p className={content.content.length > 300 && !expanded ? "collapsed" : ""}>{linkedText(expanded ? content.content : content.content.slice(0, 300))}{content.content.length > 300 && !expanded ? "…" : ""}</p> : null}
        {content.content.length > 300 ? <button type="button" className="community-feed-more" onClick={() => setExpanded(value => !value)}>{expanded ? "less" : "more"}</button> : null}
        {content.brandPartnership ? <p className="community-post-partnership">Paid partnership</p> : null}
        {content.event ? <aside className="community-structured-post"><strong>{content.event.title}</strong><span>{when(content.event.startsAt)} · {content.event.location}</span></aside> : null}
        {content.celebration ? <aside className="community-structured-post"><strong>Celebrating {content.celebration.replaceAll("_", " ")}</strong></aside> : null}
        {content.job ? <aside className="community-structured-post"><strong>{content.job.title}</strong><span>{content.job.company} · {content.job.location}</span><Link to={`/services/jobs/job/${encodeURIComponent(content.job.id)}`}>View SMAJ Jobs listing</Link></aside> : null}
        {content.document ? <a className="community-structured-document" href={content.document.url} target="_blank" rel="noopener noreferrer"><span>{content.document.name}</span><span>Open PDF</span></a> : null}
        {poll ? <section className="community-post-poll" aria-label="Poll">
          <strong>{poll.question}</strong>
          {poll.options.map(option => {
            const totalVotes = poll.options.reduce((total, item) => total + item.votes, 0);
            const percentage = totalVotes ? Math.round(option.votes / totalVotes * 100) : 0;
            return <button key={option.id} type="button" disabled={busy || Boolean(myVote) || !viewerId || Boolean(poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now())} aria-pressed={myVote === option.id} onClick={() => void vote(option.id)}>
              <span>{option.label}{myVote ? ` · ${percentage}%` : ""}</span><span>{myVote ? `${option.votes} vote${option.votes === 1 ? "" : "s"}` : "Vote"}</span>
            </button>;
          })}
          <small>{poll.options.reduce((total, option) => total + option.votes, 0)} votes{poll.expiresAt ? ` · ${new Date(poll.expiresAt).getTime() <= Date.now() ? "Poll closed" : `Closes ${when(poll.expiresAt)}`}` : ""}</small>
        </section> : null}
        {content.media?.length ? <div className={`community-feed-media${content.media.length > 1 ? " multiple" : ""}`}>
          {content.media.map((media, index) => media.type === "video"
            ? <CommunityVideoPreview
              key={`${media.url}-${index}`}
              media={media}
              author={author}
              content={content.content}
              following={following}
              canFollow={author.uid !== viewerId}
              onOpen={() => onOpenVideo?.(content, media)}
              onMore={openOptionsMenu}
              onDismiss={dismiss}
              onFollow={() => void followAuthor()}
            />
            : <CommunityFeedImage key={`${media.url}-${index}`} media={media} index={index} />)}
        </div> : null}
      </div>
      <div className="community-feed-actions">
        <div className="community-reaction-control">
          <button
            type="button"
            className="community-feed-action"
            aria-label={`${reaction === "like" ? "Unlike" : "Like"}, ${likeCount}`}
            aria-pressed={reaction === "like"}
            aria-expanded={reactionMenuOpen}
            disabled={busy}
            onPointerDown={startReactionPress}
            onPointerUp={finishReactionPress}
            onPointerLeave={finishReactionPress}
            onPointerCancel={finishReactionPress}
            onContextMenu={openReactionsFromContextMenu}
            onClick={handleLikeClick}
          ><ThumbUpAltOutlinedIcon /> <span>{likeCount}</span></button>
          {reactionMenuOpen ? <div className="community-reaction-picker" role="group" aria-label="Reactions">
            {reactionOptions.map(option => <button key={option.type} type="button" aria-label={option.label} aria-pressed={reaction === option.type} onClick={() => void chooseReaction(option.type)}>{option.emoji}</button>)}
          </div> : null}
        </div>
        <button type="button" className="community-feed-action" aria-label={`Comments, ${commentCount}`} disabled={busy || content.canComment === false} onClick={() => void toggleComments()}><ChatBubbleOutlineOutlinedIcon /> <span>{commentCount}</span></button>
        <button type="button" className="community-feed-action" aria-label={`Repost, ${repostCount}`} disabled={busy} onClick={() => void repost()}><RepeatOutlinedIcon /> <span>{repostCount}</span></button>
        <button type="button" className="community-feed-action" aria-label="Share" onClick={() => void share()}><ShareOutlinedIcon /></button>
        <div className="community-reaction-summary" aria-label="Reaction counts">
          {reactionOptions.filter(option => Number(counts[option.type] || 0) > 0).map(option => <span key={option.type} title={`${option.label}: ${counts[option.type]}`}><span aria-hidden="true">{option.emoji}</span>{counts[option.type]}</span>)}
        </div>
      </div>
      {notice ? <p className="community-post-notice" role="status">{notice}</p> : null}
      {error ? <p className="community-post-error" role="alert">{error}</p> : null}
      {reportOpen ? <form className="community-report-form" onSubmit={event => void submitReport(event)}>
        <label>Why are you reporting this post?<select value={reportReason} onChange={event => setReportReason(event.target.value)}>{reportReasons.map(reason => <option key={reason}>{reason}</option>)}</select></label>
        <button type="submit" disabled={busy}>Send report</button>
      </form> : null}
      {commentsOpen ? <section className="community-comments" aria-label="Comments">
        {commentsLoading && !commentsLoaded ? <CommunitySkeleton variant="comments" count={3} /> : null}
        {comments.filter(comment => !comment.parentId).map(comment => <div className="community-comment-thread" key={comment._id}>
          {renderComment(comment)}
          {comments.filter(reply => reply.parentId === comment._id).map(reply => renderComment(reply, true))}
        </div>)}
        {commentsLoadError ? <p className="community-post-error" role="alert">{commentsLoadError}</p> : null}
        {commentsLoaded && !commentsLoadError && !comments.length ? <p className="community-empty-comments">Be the first to comment.</p> : null}
        <form onSubmit={event => void submitComment(event)}>
          <input aria-label={replyTo ? `Reply to ${replyTo.author.displayName}` : "Write a comment"} id={`community-comment-${post._id}`} value={commentText} onChange={event => setCommentText(event.target.value)} maxLength={1000} placeholder={replyTo ? `Reply to ${replyTo.author.displayName}…` : "Write a comment…"} />
          {replyTo ? <button type="button" className="community-comment-cancel-reply" onClick={() => setReplyTo(null)}>Cancel reply</button> : null}
          <button type="submit" className="community-comment-send" aria-label="Send comment" disabled={busy || !commentText.trim()}><SendOutlinedIcon /></button>
        </form>
      </section> : null}
      {menuOpen ? <div
        className={`community-post-options-backdrop${menuClosing ? " is-closing" : ""}`}
        onClick={event => {
          if (event.target === event.currentTarget) closeOptionsMenu();
        }}
      >
        <section
          className={`community-post-options-sheet${menuClosing ? " is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={`Post options for ${menuAuthor.displayName}`}
          onTouchStart={beginMenuSwipe}
          onTouchEnd={finishMenuSwipe}
        >
          <div className="community-post-options-handle" aria-hidden="true" />
          <div className="community-post-options-heading">
            <UserAvatarFrame
              name={menuAuthor.displayName}
              image={menuAuthor.avatar}
              frame={menuAuthor.uid === viewerId && viewerAvatarFrame !== undefined ? viewerAvatarFrame : menuAuthor.activeAvatarFrame}
              size={38}
            />
            <strong>{menuAuthor.displayName}</strong>
          </div>
          <div className="community-post-options-list">
            {isOwnPost ? <>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => {
                setEditText(post.content || "");
                setEditOpen(true);
              })}><EditOutlinedIcon /> <span>Edit post</span></button>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void removePost())}><DeleteOutlineOutlinedIcon /> <span>Delete post</span></button>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void toggleSavedPost())}>
                {saved ? <BookmarkOutlinedIcon /> : <BookmarkBorderOutlinedIcon />}
                <span>{saved ? "Remove from saved posts" : "Save post"}</span>
              </button>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void share())}><ShareOutlinedIcon /> <span>Share via</span></button>
            </> : <>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void toggleSavedPost())}>
                {saved ? <BookmarkOutlinedIcon /> : <BookmarkBorderOutlinedIcon />}
                <span>{saved ? "Remove from saved posts" : "Save post"}</span>
              </button>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void share())}><ShareOutlinedIcon /> <span>Share via</span></button>
              {following ? <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void unfollowAuthor())}><PersonRemoveOutlinedIcon /> <span>Unfollow</span></button> : null}
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void hideAuthorPosts())}><VisibilityOffOutlinedIcon /> <span>Hide posts by {menuAuthor.displayName}</span></button>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => void markNotInterested())}><ThumbDownAltOutlinedIcon /> <span>Not interested</span></button>
              <button type="button" disabled={busy} onClick={() => closeOptionsMenu(() => setReportOpen(true))}><FlagOutlinedIcon /> <span>Report post</span></button>
            </>}
          </div>
        </section>
      </div> : null}
      {editOpen ? <div className="community-post-edit-backdrop" onClick={event => {
        if (event.target === event.currentTarget) setEditOpen(false);
      }}>
        <form className="community-post-edit-sheet" onSubmit={event => void submitPostEdit(event)}>
          <div className="community-post-options-handle" aria-hidden="true" />
          <h2>Edit post</h2>
          <textarea aria-label="Post text" value={editText} onChange={event => setEditText(event.target.value)} maxLength={2000} rows={6} />
          <div className="community-post-edit-footer">
            <span>{editText.length}/2000</span>
            <button type="button" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" disabled={busy || editText === (post.content || "")}>Save</button>
          </div>
        </form>
      </div> : null}
    </article>
  );
}

export default memo(CommunityFeedPostCard);
