import { useRef, useState, type FormEvent } from "react";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import YouTubeIcon from "@mui/icons-material/YouTube";
import { publishCreatorYoutubeVideo, uploadCreatorVideo } from "../../lib/streamCreator";
import { searchStreamCatalog, type StreamCatalogTitle } from "../../lib/streamCatalog";

const CreatorUploadForm = () => {
  const submitting = useRef(false);
  const [source, setSource] = useState<"youtube" | "upload">("youtube");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "error">("idle");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<StreamCatalogTitle[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<StreamCatalogTitle | null>(null);

  const findTmdbTitle = async () => {
    const query = tmdbQuery.trim();
    if (query.length < 2) { setStatus("error"); setMessage("Enter at least 2 letters to search TMDB."); return; }
    try {
      setTmdbSearching(true); setMessage(""); setStatus("idle");
      const result = await searchStreamCatalog(query);
      setTmdbResults(result.results.slice(0, 6));
      if (!result.results.length) setMessage("No TMDB movie or series matched that title.");
    } catch {
      setStatus("error"); setMessage("TMDB titles could not be searched. Please try again.");
    } finally { setTmdbSearching(false); }
  };

  const chooseTmdbTitle = (item: StreamCatalogTitle) => {
    setSelectedTitle(item); setTitle(item.title); setTmdbQuery(item.title); setTmdbResults([]); setMessage(""); setStatus("idle");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || status === "processing") return;
    if (source === "upload" && !file) { setStatus("error"); setMessage("Choose a video file first."); return; }
    const data = new FormData(event.currentTarget);
    const metadata = {
      title: title.trim(), description: String(data.get("description") || ""),
      category: String(data.get("category") || "Entertainment"), visibility: String(data.get("visibility") || "private"),
      rightsConfirmed: data.get("rightsConfirmed") === "on", uploadedBy: uploadedBy.trim(),
      tmdbId: selectedTitle?.tmdbId, mediaType: selectedTitle?.mediaType, tmdbTitle: selectedTitle?.title,
      posterUrl: selectedTitle?.posterUrl, backdropUrl: selectedTitle?.backdropUrl,
    };
    try {
      submitting.current = true;
      setStatus("uploading"); setMessage("");
      if (source === "youtube") await publishCreatorYoutubeVideo({ ...metadata, youtubeUrl: String(data.get("youtubeUrl") || "") });
      else await uploadCreatorVideo(file!, metadata, setProgress);
      setStatus("processing");
      setMessage(source === "youtube" ? "YouTube video added. It is ready for your preview and pending SMAJ moderation." : "Upload complete. Cloudflare is processing the video and SMAJ moderation is pending.");
    } catch (error) {
      setStatus("error");
      const responseMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setMessage(responseMessage || (error instanceof Error ? error.message : "Video publishing failed."));
    } finally { submitting.current = false; }
  };

  return <form className="sw-form" onSubmit={(event) => void submit(event)}>
    <div className="sw-source-tabs"><button className={source === "youtube" ? "active" : ""} type="button" onClick={() => setSource("youtube")}><YouTubeIcon /> YouTube link</button><button className={source === "upload" ? "active" : ""} type="button" onClick={() => setSource("upload")}><CloudUploadRoundedIcon /> Upload file</button></div>
    {source === "youtube" ? <label className="sw-youtube-field"><YouTubeIcon /><span><b>YouTube video URL</b><input name="youtubeUrl" required placeholder="https://www.youtube.com/watch?v=..." /><small>Use your own Public or Unlisted video with embedding enabled.</small></span></label> : <label className={`sw-drop ${file ? "selected" : ""}`}><CloudUploadRoundedIcon /><b>{file ? file.name : "Choose a video to upload"}</b><span>MP4, WebM or MOV - resumable upload up to 30 GB</span><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => { setFile(event.target.files?.[0] || null); setProgress(0); setStatus("idle"); setMessage(""); }} /></label>}

    <section className="sw-tmdb-picker">
      <label>Match a TMDB movie or series <small>Optional - search and select the official title and poster.</small></label>
      <div className="sw-tmdb-search"><input value={tmdbQuery} onChange={(event) => setTmdbQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void findTmdbTitle(); } }} placeholder="Search movie or series title" /><button type="button" onClick={() => void findTmdbTitle()} disabled={tmdbSearching}><SearchRoundedIcon />{tmdbSearching ? "Searching..." : "Search"}</button></div>
      {selectedTitle ? <div className="sw-tmdb-selected">{selectedTitle.posterUrl ? <img src={selectedTitle.posterUrl} alt="" /> : <span className="sw-tmdb-no-poster">No poster</span>}<div><small>Selected TMDB title</small><b>{selectedTitle.title}</b><span>{selectedTitle.mediaType === "movie" ? "Movie" : "Series"}{selectedTitle.releaseDate ? ` · ${selectedTitle.releaseDate.slice(0, 4)}` : ""}</span></div><button type="button" onClick={() => setSelectedTitle(null)}>Remove</button></div> : null}
      {tmdbResults.length ? <div className="sw-tmdb-results">{tmdbResults.map((item) => <button type="button" key={item.id} onClick={() => chooseTmdbTitle(item)}>{item.posterUrl ? <img src={item.posterUrl} alt="" /> : <span className="sw-tmdb-no-poster">No poster</span>}<span><b>{item.title}</b><small>{item.mediaType === "movie" ? "Movie" : "Series"}{item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ""}</small></span></button>)}</div> : null}
    </section>

    <label>Title<input name="title" required maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give your video a clear title" /></label>
    <label>Uploaded by <small>Shown to viewers as the uploader or channel credit.</small><input name="uploadedBy" maxLength={80} value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} placeholder="Channel or creator name" /></label>
    <label>Description <small>Optional</small><textarea name="description" maxLength={3000} rows={4} placeholder="Tell viewers about this video and who created it (optional)" /></label>
    <div><label>Category<select name="category"><option>Entertainment</option><option>Film</option><option>Series</option><option>Music</option><option>Learning</option><option>Sports</option></select></label><label>Visibility<select name="visibility" defaultValue="private"><option value="private">Private until approved</option><option value="unlisted">Unlisted</option><option value="public">Public after approval</option></select></label></div>
    <label className="sw-rights-confirm"><input name="rightsConfirmed" type="checkbox" required /><span><b>I own this video or have permission to publish it</b><small>I authorize SMAJ Stream to display this video according to the selected visibility and platform terms. A YouTube link does not transfer ownership to SMAJ.</small></span></label>
    {status === "uploading" && source === "upload" ? <div className="sw-upload-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% uploaded</span></div> : null}
    {message ? <p className={`sw-upload-message ${status === "error" ? "error" : "success"}`}>{status === "processing" ? <CheckCircleRoundedIcon /> : null}{message}</p> : null}
    {status === "processing" ? <a className="sw-upload-view-content" href="/app/services/stream/studio/content">View uploaded content</a> : null}
    <button type="submit" disabled={status === "processing" || status === "uploading" || (source === "upload" && (!file))}>{status === "processing" ? "Uploaded" : status === "uploading" ? "Publishing..." : source === "youtube" ? "Add YouTube video" : "Upload for review"}</button>
  </form>;
};

export default CreatorUploadForm;