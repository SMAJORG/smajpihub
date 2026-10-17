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
};
export default function ChatMessageAttachment({
  message,
  owner,
  onImage,
  onLoad,
}: Props) {
  const [src, setSrc] = useState(
    () => cachedPhotoUrl(owner, message) || message.attachmentUrl || "",
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
    if (message.messageType !== "image" || src || !node) return;
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
