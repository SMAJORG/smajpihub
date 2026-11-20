import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import UserAvatarFrame, { type AvatarFrameId } from "./UserAvatarFrame";
import TrustBadge from "./TrustBadge";
import {
  createCommunityComment,
  deleteCommunityPost,
  getCommunityComments,
  reportCommunityPost,
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(reportReasons[0]);
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
    setError("");
    try {
      const result = await toggleCommunityLike(post._id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      setError("Like could not be saved. Please try again.");
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
    setBusy(true);
    setError("");
    try {
      setComments(await getCommunityComments(post._id));
      setCommentsOpen(true);
    } catch {
      setError("Comments could not be loaded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const vote = async (optionId: string) => {
    if (busy || myVote || !viewerId) return;
    setBusy(true);
    setError("");
    try {
      const result = await voteOnCommunityPoll(original?.poll ? original._id : post._id, optionId);
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
      const comment = await createCommunityComment(post._id, text);
      setComments(current => [...current, comment]);
      setCommentText("");
      setCommentCount(current => current + 1);
    } catch {
      setError("Comment could not be posted. Please try again.");
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
      await repostCommunityPost(post._id);
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
    const url = `${window.location.origin}/community/feed?post=${encodeURIComponent(post._id)}`;
    try {
      if (navigator.share) await navigator.share({ title: "SMAJ PI HUB community post", text: content.content, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setNotice("Post link copied.");
      } else {
        setError("Sharing is not available in this browser.");
      }
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Post could not be shared.");
    }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await reportCommunityPost(post._id, reportReason);
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
      onChange?.();
    } catch {
      setError("Post could not be deleted. Please try again.");
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
            : <img key={`${media.url}-${index}`} loading="lazy" src={media.url} alt={`Community post image ${index + 1}`} />)}
        </div> : null}
      </div>
      <div className="community-post-counts"><span>{likeCount} likes</span><span>{commentCount} comments</span><span>{repostCount} reposts</span></div>
      <div className="community-post-actions">
        <button type="button" aria-pressed={liked} disabled={busy} onClick={() => void toggleLike()}>{liked ? "Liked" : "Like"}</button>
        <button type="button" disabled={busy || post.canComment === false} onClick={() => void toggleComments()}>{post.canComment === false ? "Comments restricted" : commentsOpen ? "Hide comments" : "Comment"}</button>
        <button type="button" disabled={busy} onClick={() => void repost()}>Repost</button>
        <button type="button" onClick={() => void share()}>Share</button>
      </div>
      {notice ? <p className="community-post-notice" role="status">{notice}</p> : null}
      {error ? <p className="community-post-error" role="alert">{error}</p> : null}
      {reportOpen ? <form className="community-report-form" onSubmit={event => void submitReport(event)}>
        <label>Why are you reporting this post?<select value={reportReason} onChange={event => setReportReason(event.target.value)}>{reportReasons.map(reason => <option key={reason}>{reason}</option>)}</select></label>
        <button type="submit" disabled={busy}>Send report</button>
      </form> : null}
      {commentsOpen ? <section className="community-comments" aria-label="Comments">
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
        {!comments.length ? <p className="community-empty-comments">Be the first to comment.</p> : null}
        <form onSubmit={event => void submitComment(event)}>
          <label className="visually-hidden" htmlFor={`community-comment-${post._id}`}>Write a comment</label>
          <input id={`community-comment-${post._id}`} value={commentText} onChange={event => setCommentText(event.target.value)} maxLength={1000} placeholder="Write a comment…" />
          <button type="submit" disabled={busy || !commentText.trim()}>Post</button>
        </form>
      </section> : null}
    </article>
  );
}
