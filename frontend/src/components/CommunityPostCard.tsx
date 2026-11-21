import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import CommunitySkeleton from "./CommunitySkeleton";
import UserAvatarFrame, { type AvatarFrameId } from "./UserAvatarFrame";
import TrustBadge from "./TrustBadge";
import CommunityShareFallback from "./CommunityShareFallback";
import { openCommunityNativeShare } from "./communityNativeShare";
import { showFeedback } from "../lib/feedback";
import {
  createCommunityComment,
  deleteCommunityPost,
  getCommunityComments,
  reportCommunityPost,
  recordCommunityPostShare,
  repostCommunityPost,
  toggleCommunityLike,
  voteOnCommunityPoll,
  type CommunityComment,
  type CommunityPost,
} from "../lib/communityApi";

type Props = { post: CommunityPost; viewerId?: string; viewerAvatarFrame?: AvatarFrameId | null; onChange?: () => void };
const reportReasons = ["Harassment or bullying", "Hate or harmful content", "Spam or scam", "Privacy violation", "Other"];
const when = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function CommunityPostCard({ post, viewerId, viewerAvatarFrame, onChange }: Props) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [busy, setBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(reportReasons[0]);
  const [shareFallbackOpen, setShareFallbackOpen] = useState(false);
  const shareInProgress = useRef(false);
  const [poll, setPoll] = useState(post.originalPost?.poll || post.poll);
  const [myVote, setMyVote] = useState(post.originalPost?.myVote || post.myVote || null);
  const original = post.originalPost;
  const content: CommunityPost = original ? { ...post, ...original } : post;
  const author = content.author || post.author;

  useEffect(() => {
    setLiked(post.likedByMe);
    setLikeCount(post.likeCount || 0);
    setCommentCount(post.commentCount || 0);
    setRepostCount(post.repostCount || 0);
    setPoll(post.originalPost?.poll || post.poll);
    setMyVote(post.originalPost?.myVote || post.myVote || null);
  }, [post]);

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await toggleCommunityLike(post._id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
      showFeedback(result.liked ? "Post liked." : "Like removed.", "success");
    } catch {
      showFeedback("Like could not be saved. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleComments = async () => {
    if (post.canComment === false) return;
    if (commentsOpen) {
      setCommentsOpen(false);
      return;
    }
    setCommentsOpen(true);
    setCommentsLoading(true);
    setBusy(true);
    try {
      setComments(await getCommunityComments(post._id));
      setCommentsLoaded(true);
    } catch {
      showFeedback("Comments could not be loaded. Please try again.", "error");
    } finally {
      setCommentsLoading(false);
      setBusy(false);
    }
  };

  const vote = async (optionId: string) => {
    if (busy || myVote || !viewerId) return;
    setBusy(true);
    try {
      const result = await voteOnCommunityPoll(original?.poll ? original._id : post._id, optionId);
      setMyVote(result.myVote);
      setPoll(current => current ? { ...current, options: result.options } : current);
      showFeedback("Your vote was submitted.", "success");
    } catch {
      showFeedback("Your vote could not be saved. The poll may have closed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const comment = await createCommunityComment(post._id, text);
      setComments(current => [...current, comment]);
      setCommentsLoaded(true);
      setCommentText("");
      setCommentCount(current => current + 1);
      showFeedback("Comment posted.", "success");
    } catch {
      showFeedback("Comment could not be posted. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const repost = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await repostCommunityPost(post._id);
      setRepostCount(current => current + 1);
      showFeedback("Reposted to your community feed.", "success");
      onChange?.();
    } catch (reason) {
      showFeedback(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 409
        ? "You have already reposted this."
        : "Could not repost. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (busy || shareInProgress.current) return;
    shareInProgress.current = true;
    const url = new URL("/community/feed", window.location.origin);
    url.searchParams.set("post", post._id);
    const text = [...new Set([
      ...(post.type === "repost" && post.content?.trim() ? [post.content.trim()] : []),
      ...(content.content?.trim() ? [content.content.trim()] : []),
    ])].join("\n\n");
    try {
      const result = await openCommunityNativeShare({ title: "SMAJ PI HUB community post", text, url: url.toString() });
      if (result === "shared") {
        showFeedback("Post shared.", "success");
        void recordCustomShare();
      } else if (result === "fallback") {
        setShareFallbackOpen(true);
      } else if (result === "failed") {
        showFeedback("Post could not be shared.", "error");
      }
    } finally {
      shareInProgress.current = false;
    }
  };

  const recordCustomShare = async () => {
    try {
      await recordCommunityPostShare(post._id);
    } catch {
      showFeedback("The post was shared, but the share could not be recorded.", "warning");
    }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await reportCommunityPost(post._id, reportReason);
      setReportOpen(false);
      showFeedback("Report sent for review.", "success");
    } catch (reason) {
      showFeedback(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 409
        ? "You have already reported this post."
        : "Report could not be sent. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removePost = async () => {
    if (busy || !window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteCommunityPost(post._id);
      onChange?.();
      showFeedback("Post deleted.", "success");
    } catch {
      showFeedback("Post could not be deleted. Please try again.", "error");
      setBusy(false);
    }
  };

  return (
    <article className="community-post-card" id={`community-post-${post._id}`}>
      {post.type === "repost" ? <p className="community-repost-label">Reposted by <Link to={`/people/${encodeURIComponent(post.author.uid)}`}>{post.author.displayName}</Link></p> : null}
      <header className="community-post-author">
        <Link to={`/people/${encodeURIComponent(author.uid)}`} aria-label={`View ${author.displayName}'s public profile`}>
          <UserAvatarFrame
            name={author.displayName}
            image={author.avatar}
            frame={author.uid === viewerId && viewerAvatarFrame !== undefined ? viewerAvatarFrame : author.activeAvatarFrame}
            size={56}
          />
        </Link>
        <div>
          <Link to={`/people/${encodeURIComponent(author.uid)}`} className="community-post-author-name">{author.displayName}<TrustBadge userId={author.uid} /></Link>
          <span>@{author.piUsername || author.username} · {when(content.createdAt || post.createdAt)}</span>
        </div>
        {viewerId === post.authorId ? <button type="button" className="community-post-delete" disabled={busy} onClick={() => void removePost()} aria-label="Delete post">Delete</button>
          : <button type="button" className="community-post-report" disabled={busy} onClick={() => setReportOpen(value => !value)}>Report</button>}
      </header>
      {post.type === "repost" && post.content ? <p className="community-repost-note">{post.content}</p> : null}
      <div className="community-post-body">
        {content.content ? <p>{content.content}</p> : null}
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
        {content.media?.length ? <div className={`community-post-media${content.media.length > 1 ? " multiple" : ""}`}>
          {content.media.map((media, index) => media.type === "video"
            ? <video key={`${media.url}-${index}`} controls preload="metadata" src={media.url} />
            : <img key={`${media.url}-${index}`} loading="lazy" src={media.url} alt={media.altText || `Community post image ${index + 1}`} />)}
        </div> : null}
      </div>
      <div className="community-post-counts"><span>{likeCount} likes</span><span>{commentCount} comments</span><span>{repostCount} reposts</span></div>
      <div className="community-post-actions">
        <button type="button" aria-pressed={liked} disabled={busy} onClick={() => void toggleLike()}>{liked ? "Liked" : "Like"}</button>
        <button type="button" disabled={busy || post.canComment === false} onClick={() => void toggleComments()}>{post.canComment === false ? "Comments restricted" : commentsOpen ? "Hide comments" : "Comment"}</button>
        <button type="button" disabled={busy} onClick={() => void repost()}>Repost</button>
        <button type="button" disabled={busy} onClick={() => void share()}>Share</button>
      </div>
      {shareFallbackOpen ? <CommunityShareFallback
        url={new URL(`/community/feed?post=${encodeURIComponent(post._id)}`, window.location.origin).toString()}
        onClose={() => setShareFallbackOpen(false)}
        onCopied={recordCustomShare}
      /> : null}
      {reportOpen ? <form className="community-report-form" onSubmit={event => void submitReport(event)}>
        <label>Why are you reporting this post?<select value={reportReason} onChange={event => setReportReason(event.target.value)}>{reportReasons.map(reason => <option key={reason}>{reason}</option>)}</select></label>
        <button type="submit" disabled={busy}>Send report</button>
      </form> : null}
      {commentsOpen ? <section className="community-comments" aria-label="Comments">
        {commentsLoading && !commentsLoaded ? <CommunitySkeleton variant="comments" count={3} /> : null}
        {comments.map(comment => <article className="community-comment" key={comment._id}>
          <Link to={`/people/${encodeURIComponent(comment.author.uid)}`} aria-label={`View ${comment.author.displayName}'s public profile`}>
            <UserAvatarFrame
              name={comment.author.displayName}
              image={comment.author.avatar}
              frame={comment.author.uid === viewerId && viewerAvatarFrame !== undefined ? viewerAvatarFrame : comment.author.activeAvatarFrame}
              size={34}
            />
          </Link>
          <div><Link className="community-comment-author" to={`/people/${encodeURIComponent(comment.author.uid)}`}>{comment.author.displayName}</Link><p>{comment.content}</p><small>{when(comment.createdAt)}</small></div>
        </article>)}
        {commentsLoaded && !comments.length ? <p className="community-empty-comments">Be the first to comment.</p> : null}
        <form onSubmit={event => void submitComment(event)}>
          <label className="visually-hidden" htmlFor={`community-comment-${post._id}`}>Write a comment</label>
          <input id={`community-comment-${post._id}`} value={commentText} onChange={event => setCommentText(event.target.value)} maxLength={1000} placeholder="Write a comment…" />
          <button type="submit" disabled={busy || !commentText.trim()}>Post</button>
        </form>
      </section> : null}
    </article>
  );
}
