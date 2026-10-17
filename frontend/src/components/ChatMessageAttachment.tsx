import "./ChatMessageMedia.css";
import { useEffect, useRef, useState } from "react";
import {
  getMessageBlob,
  cachedPhotoUrl,
  retainPhotoUrl,
  photoRatio,
} from "../lib/chatMedia";
import type { ChatMessage } from "../types/marketplace";

type Props = {
  message: ChatMessage;
  owner: string;
  onImage: (url: string) => void;
  onLoad: () => void;
  uploadPercent?: number;
  onRetry?: () => void;
  onCancel?: () => void;
};
export default function ChatMessageAttachment({
  message,
  owner,
  onImage,
  onLoad,
  uploadPercent,
  onRetry,
  onCancel,
}: Props) {
  const [src, setSrc] = useState(
    () => cachedPhotoUrl(owner, message) || message.attachmentUrl || message.attachmentDataUrl || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | null>(null);
  const lease = useRef<ReturnType<typeof retainPhotoUrl>>(null);
  const [ratio, setRatio] = useState(() => photoRatio(owner, message));
  const load = async () => {
    if (src || busy) return;
    setBusy(true);
    setError("");
    const request = new AbortController();
    controller.current = request;
    try {
      const blob = await getMessageBlob(owner, message, request.signal);
      if (!request.signal.aborted) {
        lease.current = retainPhotoUrl(owner, message, blob);
        setSrc(lease.current?.url || "");
      }
    } catch {
      if (!request.signal.aborted)
        setError(
          navigator.onLine
            ? "File unavailable. Tap to retry."
            : "Connect to download this file.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    const node = root.current;
    if (message.deliveryState || message.messageType !== "image" || src || !node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // Loading is tied to this immutable message, not unrelated parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message._id]);
  useEffect(() => {
    if (cachedPhotoUrl(owner, message))
      lease.current = retainPhotoUrl(owner, message);
    return () => {
      controller.current?.abort();
      lease.current?.release();
    };
    // The parent keys this component by immutable message ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const image = message.messageType === "image";
  const video = message.attachmentMimeType?.startsWith("video/");
  return (
    <figure
      ref={root}
      className={`chat-attachment ${image ? "chat-photo-message" : video ? "chat-video-message" : "chat-document-message"}`}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div className="chat-upload-frame">
      {src ? (
        image ? (
          <button
            type="button"
            className="chat-photo-frame"
            style={{ aspectRatio: ratio }}
            aria-label="Open photo"
            onClick={() => onImage(src)}
          >
            <img
              src={src}
              alt={message.attachmentName || "Shared photo"}
              onLoad={(event) => {
                const image = event.currentTarget;
                setRatio(
                  photoRatio(
                    owner,
                    message,
                    image.naturalWidth / image.naturalHeight,
                  ),
                );
                onLoad();
              }}
            />
          </button>
        ) : video ? (
          <video
            controls
            playsInline
            preload="metadata"
            src={src}
            onLoadedMetadata={onLoad}
          />
        ) : (
          <a href={src} download={message.attachmentName || "document"}>
            Save {message.attachmentName || "file"}
          </a>
        )
      ) : (
        <button
          className={image ? "chat-photo-frame" : undefined}
          style={image ? { aspectRatio: ratio } : undefined}
          type="button"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy
            ? "Downloading..."
            : image
              ? "Load photo"
              : `Download ${message.attachmentName || "file"}`}
        </button>
      )}
      {message.deliveryState ? <div className="chat-upload-overlay">
        <button type="button" className="chat-upload-action" aria-label={message.deliveryState === "failed" ? "Retry uploading attachment" : "Cancel uploading attachment"} onClick={message.deliveryState === "failed" ? onRetry : onCancel}>
          {message.deliveryState === "failed" ? <><span aria-hidden="true">&#8593;</span> Retry</> : <><span className="chat-upload-spinner" aria-hidden="true"/><span aria-hidden="true">&#215;</span>{uploadPercent !== undefined && uploadPercent < 100 ? <small>{uploadPercent}%</small> : null}</>}
        </button>
      </div> : null}
      </div>
      {src && video ? (
        <a href={src} download={message.attachmentName || "video"}>
          Save video
        </a>
      ) : null}
      <figcaption>
        {message.message || message.attachmentName || "Attachment"}
      </figcaption>
      {error ? <small role="status">{error}</small> : null}
    </figure>
  );
}
