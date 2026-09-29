import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { createStreamChannelPost, getMyStreamChannelPosts, type PublicChannelPost } from "../../lib/streamChannel";
import { getStreamProfile, saveStreamProfile, type StreamProfile } from "../../lib/streamProfile";
import { uploadImage } from "../../lib/uploadImage";

type CropTarget = "avatar" | "banner";
type CropFrame = { x: number; y: number; w: number; h: number };
type CropHandle = "move" | "nw" | "ne" | "se" | "sw";
type CropState = { target: CropTarget; source: string; frame: CropFrame };

const cropConfig: Record<CropTarget, { width: number; height: number; label: string }> = {
  avatar: { width: 512, height: 512, label: "channel avatar" },
  banner: { width: 1600, height: 520, label: "channel banner" },
};

const initialCropFrame = (target: CropTarget): CropFrame => target === "banner"
  ? { x: 6, y: 14, w: 88, h: 54 }
  : { x: 12, y: 12, w: 76, h: 76 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readImageFile = (file: File, onLoad: (value: string) => void, onError: (message: string) => void) => {
  if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) {
    onError("Choose an image up to 4 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ""));
  reader.onerror = () => onError("Could not read that image.");
  reader.readAsDataURL(file);
};

const cropImage = (crop: CropState) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const { target, frame } = crop;
    const { width, height } = cropConfig[target];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas not available"));
    ctx.fillStyle = "#110b16";
    ctx.fillRect(0, 0, width, height);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const dx = (width - renderedWidth) / 2;
    const dy = (height - renderedHeight) / 2;
    const sx = clamp(((frame.x / 100) * width - dx) / scale, 0, image.naturalWidth);
    const sy = clamp(((frame.y / 100) * height - dy) / scale, 0, image.naturalHeight);
    const sw = clamp(((frame.w / 100) * width) / scale, 1, image.naturalWidth - sx);
    const sh = clamp(((frame.h / 100) * height) / scale, 1, image.naturalHeight - sy);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    resolve(canvas.toDataURL("image/jpeg", 0.9));
  };
  image.onerror = reject;
  image.src = crop.source;
});

const StreamChannelPanel = () => {
  const [profile, setProfile] = useState<StreamProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState<PublicChannelPost[]>([]);
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [crop, setCrop] = useState<CropState | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const cropPreviewRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ handle: CropHandle; startX: number; startY: number; startFrame: CropFrame } | null>(null);

  useEffect(() => {
    void Promise.all([getStreamProfile(), getMyStreamChannelPosts().catch(() => [])])
      .then(([{ profile: next }, nextPosts]) => {
        setProfile(next);
        setPosts(nextPosts);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Your channel could not be loaded.");
      });
  }, []);

  const change = <K extends keyof StreamProfile>(key: K, value: StreamProfile[K]) => setProfile(current => current ? { ...current, [key]: value } : current);

  const beginCrop = (target: CropTarget, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    readImageFile(file, (source) => {
      setCrop({ target, source, frame: initialCropFrame(target) });
      setMessage("");
      setStatus("ready");
    }, (text) => {
      setStatus("error");
      setMessage(text);
    });
  };

  const updateCropFrame = (handle: CropHandle, event: PointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    const preview = cropPreviewRef.current;
    if (!drag || !preview) return;
    const rect = preview.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    const minSize = crop?.target === "banner" ? 28 : 34;
    const start = drag.startFrame;

    setCrop((current) => {
      if (!current) return current;
      if (handle === "move") {
        return { ...current, frame: { ...start, x: clamp(start.x + dx, 0, 100 - start.w), y: clamp(start.y + dy, 0, 100 - start.h) } };
      }
      if (current.target === "banner") {
        let x = start.x;
        let y = start.y;
        let width = start.w;
        let height = start.h;
        if (handle === "nw" || handle === "sw") {
          width = clamp(start.w - dx, minSize, 96);
          x = start.x + start.w - width;
        }
        if (handle === "ne" || handle === "se") width = clamp(start.w + dx, minSize, 96 - start.x);
        if (handle === "nw" || handle === "ne") {
          height = clamp(start.h - dy, minSize, 90);
          y = start.y + start.h - height;
        }
        if (handle === "sw" || handle === "se") height = clamp(start.h + dy, minSize, 90 - start.y);
        x = clamp(x, 0, 100 - width);
        y = clamp(y, 0, 100 - height);
        return { ...current, frame: { x, y, w: width, h: height } };
      }
      let x = start.x;
      let y = start.y;
      const changeAmount = handle === "nw" ? Math.max(-dx, -dy)
        : handle === "ne" ? Math.max(dx, -dy)
          : handle === "sw" ? Math.max(-dx, dy)
            : Math.max(dx, dy);
      const size = clamp(start.w + changeAmount, minSize, 96);
      if (handle === "nw" || handle === "sw") x = start.x + start.w - size;
      if (handle === "nw" || handle === "ne") y = start.y + start.h - size;
      x = clamp(x, 0, 100 - size);
      y = clamp(y, 0, 100 - size);
      return { ...current, frame: { x, y, w: size, h: size } };
    });
  };

  const startCropDrag = (handle: CropHandle, event: PointerEvent<HTMLElement>) => {
    if (!crop) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { handle, startX: event.clientX, startY: event.clientY, startFrame: crop.frame };
  };

  const dragCropFrame = (event: PointerEvent<HTMLElement>) => {
    const handle = cropDragRef.current?.handle;
    if (!handle) return;
    updateCropFrame(handle, event);
  };

  const stopCropDrag = (event: PointerEvent<HTMLElement>) => {
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const applyCrop = async () => {
    if (!crop) return;
    try {
      const cropped = await cropImage(crop);
      setProfile((current) => current ? { ...current, [crop.target === "avatar" ? "avatarUrl" : "channelBannerUrl"]: cropped } : current);
      setCrop(null);
      setStatus("ready");
      setMessage(`${cropConfig[crop.target].label} ready. Save channel to publish it.`);
    } catch {
      setStatus("error");
      setMessage("Could not crop image. Please try another file.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    try {
      setStatus("saving");
      setMessage("");
      const [avatarUrl, channelBannerUrl] = await Promise.all([
        uploadImage(profile.avatarUrl, "stream-channel-avatar"),
        uploadImage(profile.channelBannerUrl, "stream-channel-banner"),
      ]);
      const result = await saveStreamProfile({ ...profile, avatarUrl, channelBannerUrl });
      setProfile(result.profile);
      setStatus("ready");
      setMessage("Channel saved and synchronized.");
    } catch (error: unknown) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : (error as { response?: { data?: { message?: string } } }).response?.data?.message || "Channel could not be saved.");
    }
  };

  const publishPost = async () => {
    const body = postBody.trim();
    if (!body) return;
    try {
      setPosting(true);
      setMessage("");
      const post = await createStreamChannelPost(body);
      setPosts(current => [post, ...current].slice(0, 20));
      setPostBody("");
      setStatus("ready");
      setMessage("Post published to your channel feed.");
    } catch (error: unknown) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : (error as { response?: { data?: { message?: string } } }).response?.data?.message || "Post could not be published.");
    } finally {
      setPosting(false);
    }
  };

  if (!profile) return <div className="sw-catalog-status">{status === "loading" ? "Loading your channel..." : message}</div>;
  const initials = (profile.channelName || profile.displayName || "SC").split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();

  return <form className="sw-channel-editor" onSubmit={submit}>
    <input className="sw-channel-file-input" ref={avatarInputRef} type="file" accept="image/*" onChange={(event) => beginCrop("avatar", event)} />
    <input className="sw-channel-file-input" ref={bannerInputRef} type="file" accept="image/*" onChange={(event) => beginCrop("banner", event)} />
    <div className="sw-channel-banner" style={profile.channelBannerUrl ? { backgroundImage: `url(${profile.channelBannerUrl})` } : undefined}>
      {!profile.channelBannerUrl ? <span>{initials}</span> : null}
      <button className="sw-channel-banner-camera" type="button" onClick={() => bannerInputRef.current?.click()}><CameraAltOutlinedIcon /> Change banner</button>
    </div>
    <div className="sw-channel-identity">
      <button className="sw-channel-avatar" type="button" onClick={() => avatarInputRef.current?.click()} aria-label="Change channel avatar">
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
        <span><CameraAltOutlinedIcon /></span>
      </button>
      <div><h2>{profile.channelName || "My channel"}</h2><p>@{profile.channelHandle || "channel"}</p></div>
    </div>
    <div className="sw-channel-fields">
      <label>Channel name<input required minLength={2} maxLength={80} value={profile.channelName} onChange={event => change("channelName", event.target.value)} /></label>
      <label>Channel handle<div className="sw-handle-input"><span>@</span><input required maxLength={40} value={profile.channelHandle} onChange={event => change("channelHandle", event.target.value.replace(/[^a-zA-Z0-9_.-]/g, ""))} /></div></label>
      <label className="wide">Description<textarea maxLength={500} rows={4} value={profile.channelDescription} onChange={event => change("channelDescription", event.target.value)} /></label>
    </div>
    <section className="sw-channel-post-composer">
      <header>
        <div>
          <h3>Channel feed</h3>
          <p>Post updates for followers, like a Facebook page for your Stream channel.</p>
        </div>
        <span>{posts.length} posts</span>
      </header>
      <textarea maxLength={800} rows={3} placeholder="Share an update with your followers..." value={postBody} onChange={event => setPostBody(event.target.value)} />
      <div>
        <small>{800 - postBody.length} characters left</small>
        <button type="button" disabled={posting || !postBody.trim()} onClick={() => void publishPost()}>{posting ? "Posting..." : "Post update"}</button>
      </div>
      {posts.length ? (
        <div className="sw-channel-post-list">
          {posts.slice(0, 3).map(post => (
            <article key={post._id}>
              <p>{post.body}</p>
              <small>{post.createdAt ? new Date(post.createdAt).toLocaleString() : "Just now"}</small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
    {message ? <p className={`sw-profile-message ${status === "error" ? "error" : "success"}`}>{message}</p> : null}
    <div className="sw-channel-editor-actions"><button className="sw-profile-save" type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving..." : "Save channel"}</button>{profile.channelHandle ? <Link to={`/app/services/stream/channel/${profile.channelHandle}`}>View public channel</Link> : null}</div>
    {crop ? (
      <div className="sw-channel-crop-overlay">
        <section className="sw-channel-crop-dialog">
          <h2>Crop {cropConfig[crop.target].label}</h2>
          <div ref={cropPreviewRef} className={`sw-channel-crop-preview ${crop.target}`}>
            <img src={crop.source} alt="" />
            <span
              className="sw-channel-crop-frame"
              style={{ left: `${crop.frame.x}%`, top: `${crop.frame.y}%`, width: `${crop.frame.w}%`, height: `${crop.frame.h}%` }}
              onPointerDown={(event) => startCropDrag("move", event)}
              onPointerMove={dragCropFrame}
              onPointerUp={stopCropDrag}
              onPointerCancel={stopCropDrag}
              role="presentation"
            >
              <i onPointerDown={(event) => startCropDrag("nw", event)} onPointerMove={dragCropFrame} onPointerUp={stopCropDrag} onPointerCancel={stopCropDrag} />
              <i onPointerDown={(event) => startCropDrag("ne", event)} onPointerMove={dragCropFrame} onPointerUp={stopCropDrag} onPointerCancel={stopCropDrag} />
              <i onPointerDown={(event) => startCropDrag("se", event)} onPointerMove={dragCropFrame} onPointerUp={stopCropDrag} onPointerCancel={stopCropDrag} />
              <i onPointerDown={(event) => startCropDrag("sw", event)} onPointerMove={dragCropFrame} onPointerUp={stopCropDrag} onPointerCancel={stopCropDrag} />
            </span>
          </div>
          <p>Drag the frame or pull a corner, then save the selected area.</p>
          <div className="sw-channel-crop-actions">
            <button type="button" className="sw-profile-save" onClick={() => void applyCrop()}>Use image</button>
            <button type="button" onClick={() => (crop.target === "banner" ? bannerInputRef.current : avatarInputRef.current)?.click()}>Choose another</button>
            <button type="button" onClick={() => setCrop(null)}>Cancel</button>
          </div>
        </section>
      </div>
    ) : null}
  </form>;
};

export default StreamChannelPanel;
