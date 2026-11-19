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
import { axiosClient } from "../../lib/axiosClient";
import "./ReferralPage.css";

type ReferralToast = { id: number; type: "success" | "info" | "error"; message: string; dismissing: boolean };
type ReferralData = {
  referralCode: string;
  visits: number;
  successfulSignUps: number;
  invitations: Array<{ name: string; registeredAt: string | null }>;
};

const createInvitationUrl = (referralCode?: string) => {
  if (!referralCode) return "";
  const url = new URL("/", window.location.origin);
  url.searchParams.set("invite", referralCode);
  return url.toString();
};

const ReferralPage = () => {
  const { user } = useAuthContext();
  const { t } = useTranslation();
  const [toast, setToast] = useState<ReferralToast | null>(null);
  const [referralResponse, setReferralResponse] = useState<{
    uid: string;
    data?: ReferralData;
    error?: string;
  } | null>(null);
  const toastSequence = useRef(0);
  const currentResponse = referralResponse?.uid === user?.uid ? referralResponse : null;
  const referralData = currentResponse?.data || null;
  const referralError = currentResponse?.error || "";
  const invitationUrl = createInvitationUrl(referralData?.referralCode);
  const toastId = toast?.id;

  useEffect(() => {
    let active = true;
    const uid = user?.uid;
    if (!uid) return () => { active = false; };
    axiosClient.get<ReferralData>("/referrals")
      .then(({ data }) => { if (active) setReferralResponse({ uid, data }); })
      .catch(() => { if (active) setReferralResponse({ uid, error: "Referral data is temporarily unavailable. Please try again." }); });
    return () => { active = false; };
  }, [user?.uid]);

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
          <p>Invite friends and follow their registrations. Rewards are coming soon.</p>
        </div>
      </header>

      <section className="referral-link-panel" aria-labelledby="referral-link-title">
        <div className="referral-section-title">
          <LinkOutlinedIcon />
          <h2 id="referral-link-title">Your invitation link</h2>
        </div>
        {referralError ? <p className="referral-note" role="alert">{referralError}</p> : invitationUrl ? (
          <>
            <div className="referral-link-row">
              <input aria-label="Your invitation link" readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} />
              <button type="button" onClick={copyLink}><ContentCopyOutlinedIcon />Copy link</button>
              <button type="button" className="referral-share-button" onClick={shareLink}><IosShareOutlinedIcon />Share</button>
            </div>
            <p className="referral-note">Your invitation code is unique to your account. Registrations are counted only after Pi authentication.</p>
          </>
        ) : <p className="referral-note">{referralData ? "Not available" : "Loading your invitation link…"}</p>}
      </section>

      <section className="referral-stats-panel" aria-labelledby="referral-stats-title">
        <div className="referral-section-title">
          <QueryStatsOutlinedIcon />
          <h2 id="referral-stats-title">Referral statistics</h2>
        </div>
        <div className="referral-stat-grid">
          <article><span>Unique visits</span><strong>{referralData?.visits ?? "—"}</strong></article>
          <article><span>Successful registrations</span><strong>{referralData?.successfulSignUps ?? "—"}</strong></article>
        </div>
        <p className="referral-note">Visits are deduplicated by invitation link and network address. Registrations are recorded only for new Pi-authenticated accounts.</p>
      </section>

      <section className="referral-history-panel" aria-labelledby="referral-history-title">
        <div className="referral-section-title">
          <HistoryOutlinedIcon />
          <h2 id="referral-history-title">Invitation history</h2>
        </div>
        {referralError ? <p className="referral-empty-state" role="alert">{referralError}</p> : referralData?.invitations.length ? (
          <ul className="referral-history-list">
            {referralData.invitations.map((invitation, index) => (
              <li key={`${invitation.registeredAt || "registration"}-${index}`}>
                <span>{invitation.name}</span>
                <time dateTime={invitation.registeredAt || undefined}>
                  {invitation.registeredAt ? new Date(invitation.registeredAt).toLocaleDateString() : "Registration date unavailable"}
                </time>
              </li>
            ))}
          </ul>
        ) : <p className="referral-empty-state">{referralData ? "No registrations have been attributed to your invitation yet." : "Loading invitation history…"}</p>}
      </section>

      <section className="referral-reward-panel" aria-labelledby="referral-reward-title">
        <div className="referral-section-title">
          <RedeemOutlinedIcon />
          <h2 id="referral-reward-title">Reward status</h2>
        </div>
        <p>Rewards are coming soon. No reward policy has been approved, and no Pi payments are active.</p>
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
