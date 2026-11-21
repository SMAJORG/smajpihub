import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Clipboard } from "@capacitor/clipboard";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { showFeedback } from "../lib/feedback";

export type CommunitySharePayload = {
  title: string;
  text: string;
  url: string;
};

export type CommunityNativeShareResult = "shared" | "cancelled" | "fallback" | "failed";

export const openCommunityNativeShare = async (
  payload: CommunitySharePayload,
): Promise<CommunityNativeShareResult> => {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share(payload);
      return "shared";
    }
    if (typeof navigator.share !== "function") return "fallback";
    await navigator.share(payload);
    return "shared";
  } catch (reason) {
    if ((reason instanceof DOMException && reason.name === "AbortError")
      || (reason instanceof Error && /cancel|dismiss/i.test(reason.message))) return "cancelled";
    if (Capacitor.isNativePlatform()) return "fallback";
    if (reason instanceof TypeError || (reason instanceof DOMException && ["NotAllowedError", "NotSupportedError"].includes(reason.name))) {
      return "fallback";
    }
    return "failed";
  }
};

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

type Props = CommunitySharePayload & {
  copySuccessMessage?: string;
  onClose: () => void;
  onShared: () => Promise<void>;
};

export default function CommunityShareSheet({ title, text, url, copySuccessMessage = "Post link copied.", onClose, onShared }: Props) {
  const [busy, setBusy] = useState(false);
  const actionInProgress = useRef(false);
  const message = [text.trim(), url].filter(Boolean).join("\n\n");

  const runAction = async (action: () => Promise<void>) => {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  };

  const destinationFor = (target: "whatsapp" | "telegram" | "email") => {
    const destination = target === "whatsapp"
      ? `https://wa.me/?text=${encodeURIComponent(message)}`
      : target === "telegram"
        ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
        : `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;
    return destination;
  };

  const openApp = (target: "whatsapp" | "telegram" | "email") => {
    void runAction(async () => {
      try {
        window.open(destinationFor(target), "_blank", "noopener,noreferrer");
        onClose();
        void onShared();
      } catch {
        showFeedback("Could not open the sharing app.", "error");
      }
    });
  };

  const openMoreOptions = () => {
    if (!Capacitor.isNativePlatform() && typeof navigator.share !== "function") {
      openApp("email");
      return;
    }
    void runAction(async () => {
      const result = await openCommunityNativeShare({ title, text, url });
      if (result === "shared") {
        onClose();
        void onShared();
      } else if (result === "fallback") {
        window.open(destinationFor("email"), "_blank", "noopener,noreferrer");
        onClose();
        void onShared();
      } else if (result === "failed") {
        showFeedback("Post could not be shared.", "error");
      }
    });
  };

  const copyLink = () => {
    void runAction(async () => {
      try {
        await copyText(url);
        showFeedback(copySuccessMessage, "success");
        onClose();
        void onShared();
      } catch {
        showFeedback("Link could not be copied. Please try again.", "error");
      }
    });
  };

  return (
    <div className="community-share-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="community-share-sheet" role="dialog" aria-modal="true" aria-label="Share post">
        <div className="community-share-handle" aria-hidden="true" />
        <header>
          <h2>Share post</h2>
          <button type="button" onClick={onClose} aria-label="Close share options" disabled={busy}><CloseRoundedIcon /></button>
        </header>
        <div className="community-share-actions">
          <button type="button" disabled={busy} onClick={() => openApp("whatsapp")}><span className="community-share-brand whatsapp">W</span><span>WhatsApp</span></button>
          <button type="button" disabled={busy} onClick={() => openApp("telegram")}><span className="community-share-brand telegram"><SendOutlinedIcon /></span><span>Telegram</span></button>
          <button type="button" disabled={busy} onClick={openMoreOptions}><EmailOutlinedIcon /><span>More options</span></button>
          <button type="button" disabled={busy} onClick={copyLink}><ContentCopyOutlinedIcon /><span>Copy link</span></button>
        </div>
      </section>
    </div>
  );
}
