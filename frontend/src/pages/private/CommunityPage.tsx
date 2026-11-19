import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import CommunityPostCard from "../../components/CommunityPostCard";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import { axiosClient } from "../../lib/axiosClient";
import { getCommunityFeed, createCommunityPost, type CommunityMedia, type CommunityPost } from "../../lib/communityApi";
import { uploadImage } from "../../lib/uploadImage";
import "./community.css";

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read the selected media."));
  reader.readAsDataURL(file);
});

const CommunityPage = () => {
  const { user } = useAuthContext();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<"all" | "following">("all");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (nextPage = 1, keep = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await getCommunityFeed({ scope, page: nextPage });
      setPosts(current => keep ? [...current, ...result.posts] : result.posts);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (reason) {
      setError(reason && typeof reason === "object" && "response" in reason
        && (reason as { response?: { status?: number } }).response?.status === 401
        ? "Sign in to view the community feed."
        : "Community posts could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const target = params.get("post");
    if (!target || loading) return;
    document.getElementById(`community-post-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, params, posts]);

  const chooseFiles = (selected: FileList | null) => {
    const next = Array.from(selected || []);
    if (next.length > 4) {
      setError("Choose up to four photos or videos.");
      return;
    }
    if (next.some(file => !file.type.startsWith("image/") && !["video/mp4", "video/webm", "video/quicktime"].includes(file.type))) {
      setError("Choose photos or MP4, WebM, or MOV videos.");
      return;
    }
    if (next.some(file => file.size > (file.type.startsWith("video/") ? 5 : 4) * 1024 * 1024)) {
      setError("Photos must be 4 MB or smaller and videos 5 MB or smaller.");
      return;
    }
    setError("");
    setFiles(next);
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (posting || (!content.trim() && !files.length)) return;
    setPosting(true);
    setError("");
    setNotice("");
    try {
      const media: CommunityMedia[] = await Promise.all(files.map(async file => {
        const dataUrl = await fileToDataUrl(file);
        if (file.type.startsWith("image/")) {
          const result = await uploadImage(dataUrl, "community-post");
          return { type: "image", url: result };
        }
        const { data } = await axiosClient.post<{ url: string }>("/uploads/video", { video: dataUrl, name: file.name });
        return { type: "video", url: data.url };
      }));
      const created = await createCommunityPost(content, media);
      setPosts(current => [created, ...current]);
      setContent("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      setNotice("Your post is published.");
    } catch (reason) {
      const status = reason && typeof reason === "object" && "response" in reason
        ? (reason as { response?: { status?: number } }).response?.status
        : undefined;
      setError(status === 503
        ? "Media upload is unavailable. Try again later or publish a text-only post."
        : "Your post could not be published. Check the media and try again.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <main className="private-page community-page">
      <header className="community-page-header">
        <div><p className="private-kicker">SMAJ PI HUB</p><h1>Community</h1><p>Share updates, discover people, and join the conversation.</p></div>
        <Link className="private-secondary-button" to="/search">Find people</Link>
      </header>
      <form className="community-composer" onSubmit={event => void publish(event)}>
        <label htmlFor="community-post-content">Create a post</label>
        <textarea id="community-post-content" value={content} maxLength={2000} onChange={event => setContent(event.target.value)} placeholder="What would you like to share?" />
        <div className="community-composer-footer">
          <label className="community-media-picker">
            Add photos or videos
            <input ref={fileInput} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple onChange={event => chooseFiles(event.target.files)} />
          </label>
          <span>{content.length}/2000 · {files.length}/4 media</span>
          <button type="submit" className="private-primary-button" disabled={posting || (!content.trim() && !files.length)}>{posting ? "Publishing…" : "Post"}</button>
        </div>
        {files.length ? <ul className="community-selected-files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter((_, fileIndex) => fileIndex !== index))}>Remove</button></li>)}</ul> : null}
      </form>
      {notice ? <p className="community-status" role="status">{notice}</p> : null}
      {error ? <p className="community-error" role="alert">{error}</p> : null}
      <nav className="community-feed-tabs" aria-label="Community feed">
        <button type="button" className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>For everyone</button>
        <button type="button" className={scope === "following" ? "active" : ""} onClick={() => setScope("following")}>Following</button>
      </nav>
      <section className="community-feed" aria-label="Community posts" aria-busy={loading}>
        {loading && !posts.length ? <PrivateSkeleton variant="list" count={4} /> : null}
        {!loading && !error && !posts.length ? <div className="private-state compact"><h2>{scope === "following" ? "No posts from people you follow" : "No community posts yet"}</h2><p>{scope === "following" ? "Follow people from Search or their public profiles to see their posts here." : "Be the first to share something with the community."}</p>{scope === "following" ? <Link to="/search">Search people</Link> : null}</div> : null}
        {posts.map(post => <CommunityPostCard key={post._id} post={post} viewerId={user?.uid} onChange={() => void load()} />)}
      </section>
      {hasMore ? <button className="community-load-more" type="button" disabled={loading} onClick={() => void load(page + 1, true)}>{loading ? "Loading…" : "Load more"}</button> : null}
      {!loading && error ? <button className="community-load-more" type="button" onClick={() => void load()}>Retry</button> : null}
    </main>
  );
};

export default CommunityPage;
