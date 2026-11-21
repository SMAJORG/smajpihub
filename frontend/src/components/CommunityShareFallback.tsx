import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import XIcon from "@mui/icons-material/X";
import { showFeedback } from "../lib/feedback";
import { createCommunityShareTargets } from "./communityShareTargets";

const copyText = async (value: string) => {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: value });
    return;
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Try the legacy clipboard path when clipboard permissions are unavailable.
    }
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  let copied = false;
  try {
    field.select();
    copied = document.execCommand("copy");
  } finally {
    field.remove();
  }
  if (!copied) throw new Error("Copy is unavailable in this browser.");
};

type Props = {
  url: string;
  title: string;
  text: string;
  copySuccessMessage?: string;
  onClose: () => void;
  onShared: () => Promise<void>;
};

export default function CommunityShareFallback({
  url,
  title,
  text,
  copySuccessMessage = "Post link copied.",
  onClose,
  onShared,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const postUrl = useMemo(() => {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }, [url]);

  const closeSheet = useCallback(() => {
    if (closing || closeTimer.current !== null) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 180);
  }, [closing, onClose]);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!postUrl) showFeedback("This post link is invalid and cannot be shared.", "error");
  }, [postUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeSheet();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, closeSheet]);

  const destinations = postUrl ? createCommunityShareTargets(postUrl, title, text).map(destination => ({
    ...destination,
    icon: destination.name === "WhatsApp" ? <WhatsAppIcon />
      : destination.name === "Telegram" ? <TelegramIcon />
        : destination.name === "X" ? <XIcon /> : <EmailOutlinedIcon />,
  })) : [];

  const copyLink = async () => {
    if (busy || closing || closeTimer.current !== null) return;
    if (!postUrl) {
      showFeedback("This post link is invalid and cannot be copied.", "error");
      return;
    }
    setBusy(true);
    try {
      await copyText(postUrl);
      showFeedback(copySuccessMessage, "success");
      void onShared();
      closeSheet();
    } catch {
      showFeedback("Link could not be copied. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const selectDestination = (event: MouseEvent<HTMLAnchorElement>) => {
    if (busy || closing || closeTimer.current !== null || !postUrl) {
      event.preventDefault();
      if (!postUrl) showFeedback("This post link is invalid and cannot be shared.", "error");
      return;
    }
    void onShared();
    closeSheet();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`community-share-fallback-backdrop${closing ? " is-closing" : ""}`}
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) closeSheet();
      }}
    >
      <section
        className={`community-share-fallback${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-share-fallback-title"
        onTouchStart={event => { dragStartY.current = event.touches[0]?.clientY ?? null; }}
        onTouchEnd={event => {
          const endY = event.changedTouches[0]?.clientY;
          if (dragStartY.current !== null && endY !== undefined && endY - dragStartY.current > 80) closeSheet();
          dragStartY.current = null;
        }}
      >
        <div className="community-share-fallback-handle" aria-hidden="true" />
        <header>
          <div>
            <h2 id="community-share-fallback-title">Share post</h2>
            <p>Choose an app to share this post.</p>
          </div>
          <button type="button" onClick={closeSheet} aria-label="Close share options" disabled={busy}><CloseRoundedIcon /></button>
        </header>
        <div className="community-share-fallback-options">
          {destinations.map(destination => (
            <a
              key={destination.name}
              className="community-share-fallback-option"
              href={destination.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Share with ${destination.name}`}
              onClick={selectDestination}
            >
              <span className={`community-share-fallback-icon ${destination.className}`}>{destination.icon}</span>
              <span>{destination.name}</span>
            </a>
          ))}
        </div>
        <button className="community-share-fallback-copy" type="button" disabled={busy || closing || !postUrl} onClick={() => void copyLink()}>
          <ContentCopyOutlinedIcon />
          <span>Copy link</span>
        </button>
      </section>
    </div>,
    document.body,
  );
}
