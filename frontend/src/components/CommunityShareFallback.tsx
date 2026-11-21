import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { showFeedback } from "../lib/feedback";

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
  copySuccessMessage?: string;
  onClose: () => void;
  onCopied: () => Promise<void>;
};

export default function CommunityShareFallback({ url, copySuccessMessage = "Post link copied.", onClose, onCopied }: Props) {
  const [busy, setBusy] = useState(false);
  const copyLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await copyText(url);
      showFeedback(copySuccessMessage, "success");
      onClose();
      void onCopied();
    } catch {
      showFeedback("Link could not be copied. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="community-share-fallback-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="community-share-fallback" role="dialog" aria-modal="true" aria-labelledby="community-share-fallback-title">
        <header>
          <div>
            <h2 id="community-share-fallback-title">Share post</h2>
            <p>This browser does not support native sharing. Copy the public link to share it from another app.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share options" disabled={busy}><CloseRoundedIcon /></button>
        </header>
        <label className="community-share-fallback-link">
          <span>Public post link</span>
          <input readOnly value={url} onFocus={event => event.currentTarget.select()} />
        </label>
        <button className="community-share-fallback-copy" type="button" disabled={busy} onClick={() => void copyLink()}>
          <ContentCopyOutlinedIcon /> Copy link
        </button>
      </section>
    </div>
  );
}
