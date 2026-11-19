import { useEffect, useRef, useState } from "react";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import IosShareOutlinedIcon from "@mui/icons-material/IosShareOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import RedeemOutlinedIcon from "@mui/icons-material/RedeemOutlined";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { useAuthContext } from "../../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import "./ReferralPage.css";

type ReferralToast = { id: number; type: "success" | "info" | "error"; message: string; dismissing: boolean };

const createInvitationUrl = (userId?: string) => {
  if (!userId) return "";
  const url = new URL("/", window.location.origin);
  url.searchParams.set("invite", userId);
  return url.toString();
};

const ReferralPage = () => {
  const { user } = useAuthContext();
  const { t } = useTranslation();
  const [toast, setToast] = useState<ReferralToast | null>(null);
  const toastSequence = useRef(0);
  const invitationUrl = createInvitationUrl(user?.uid);
  const toastId = toast?.id;

  useEffect(() => {
    if (toastId === undefined) return;
    const fadeTimer = window.setTimeout(() => {
      setToast((current) => current?.id === toastId ? { ...current, dismissing: true } : current);
    }, 2700);
    const dismissTimer = window.setTimeout(() => {
      setToast((current) => current?.id === toastId ? null : current);
    }, 3000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [toastId]);

  const showToast = (type: ReferralToast["type"], message: string) => {
    setToast({ id: ++toastSequence.current, type, message, dismissing: false });
  };

  const copyLink = async () => {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      showToast("success", "Link copied successfully.");
    } catch {
      showToast("error", "Could not copy the invitation link. Please copy it manually.");
    }
  };

  const shareLink = async () => {
    if (!invitationUrl) return;
    const title = t("Invite to SMAJ PI HUB", { ns: "ui" });
    const message = `${t("Join me on SMAJ PI HUB:", { ns: "ui" })} ${invitationUrl}`;
    if (window.Pi?.openShareDialog) {
      showToast("info", "Opening share dialog…");
      try {
        window.Pi.openShareDialog(title, message);
      } catch {
        showToast("error", "Sharing is unavailable. Copy the invitation link instead.");
      }
      return;
    }
    if (navigator.share) {
      showToast("info", "Opening share dialog…");
      try {
        await navigator.share({ title, text: message });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        showToast("error", "Sharing is unavailable. Copy the invitation link instead.");
      }
      return;
    }
    await copyLink();
  };

  return (
    <main className="private-page referral-page">
      <header className="referral-heading">
        <span className="referral-heading-icon"><LinkOutlinedIcon /></span>
        <div>
          <p className="private-kicker">SMAJ PI HUB</p>
          <h1>Invite &amp; Earn</h1>
          <p>Share your invitation link. Tracking is not enabled and rewards are not confirmed.</p>
        </div>
      </header>

      <section className="referral-link-panel" aria-labelledby="referral-link-title">
        <div className="referral-section-title">
          <LinkOutlinedIcon />
          <h2 id="referral-link-title">Your invitation link</h2>
        </div>
        {invitationUrl ? (
          <>
            <div className="referral-link-row">
              <input aria-label="Your invitation link" readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" onClick={copyLink}><ContentCopyOutlinedIcon />Copy link</button>
              <button type="button" className="referral-share-button" onClick={shareLink}><IosShareOutlinedIcon />Share</button>
            </div>
            <p className="referral-note">This link includes your invite ID. SMAJ PI HUB does not track visits or sign-ups.</p>
          </>
        ) : <p className="referral-note">Not available</p>}
      </section>

      <section className="referral-stats-panel" aria-labelledby="referral-stats-title">
        <div className="referral-section-title">
          <QueryStatsOutlinedIcon />
          <h2 id="referral-stats-title">Referral statistics</h2>
        </div>
        <div className="referral-stat-grid">
          <article><span>Invitations sent</span><strong>—</strong></article>
          <article><span>Verified sign-ups</span><strong>—</strong></article>
        </div>
        <p className="referral-note">The Pi SDK does not track referrals, and SMAJ PI HUB has no referral tracking system.</p>
      </section>

      <section className="referral-history-panel" aria-labelledby="referral-history-title">
        <div className="referral-section-title">
          <HistoryOutlinedIcon />
          <h2 id="referral-history-title">Invitation history</h2>
        </div>
        <p className="referral-empty-state">No verified invitation activity is available.</p>
      </section>

      <section className="referral-reward-panel" aria-labelledby="referral-reward-title">
        <div className="referral-section-title">
          <RedeemOutlinedIcon />
          <h2 id="referral-reward-title">Reward status</h2>
        </div>
        <p>No referral reward program is confirmed by Pi Network or SMAJ PI HUB.</p>
      </section>
      {toast ? (
        <div className={`referral-toast ${toast.type}${toast.dismissing ? " is-dismissing" : ""}`} role="status" aria-live="polite" key={toast.id}>
          {toast.type === "success" ? <CheckCircleRoundedIcon aria-hidden="true" /> : toast.type === "error" ? <ErrorOutlineRoundedIcon aria-hidden="true" /> : <IosShareOutlinedIcon aria-hidden="true" />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </main>
  );
};

export default ReferralPage;
