import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import ConfirmSignOutModal from "../../components/ConfirmSignOutModal";
import TrustBadge from "../../components/TrustBadge";
import LanguageSoonButton from "../../components/LanguageSoonButton";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import { WELCOME_REPLAY_EVENT } from "../../components/WelcomeTour";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { disablePushNotifications, enablePushNotifications, getPushState } from "../../lib/pushNotifications";
import { disableNativePushNotifications, enableNativePushNotifications, getNativePushState, supportsNativePushNotifications } from "../../lib/nativePushNotifications";

type SavedSettings = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  location: string;
  accountType: "Buyer" | "Seller" | "Both";
  theme: "light" | "dark";
  emailNotifications: boolean;
  productNotifications: boolean;
  messageNotifications: boolean;
  publicProfile: boolean;
  allowContact: boolean;
};

type VerificationStats = {
  totalProducts: number;
  approvedListings: number;
  successfulOrders: number;
  completedSales: number;
};

type VerificationLevel = "pi_verified" | "seller_verified" | "trusted_seller";

const STORAGE_KEY = "smaj_account_settings";

const readSavedSettings = (): Partial<SavedSettings> => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Partial<SavedSettings>) : {};
  } catch {
    return {};
  }
};

const clampPercent = (value: number, target: number) => `${Math.min(100, Math.round((value / target) * 100))}%`;

const levelRank = (level?: string) => {
  if (level === "trusted_seller") return 3;
  if (level === "seller_verified") return 2;
  if (level === "pi_verified" || level === "verified") return 1;
  return 0;
};

const SettingsPage = () => {
  const { user, updateProfile, updateSettings, signOut } = useAuthContext();
  const navigate = useNavigate();
  const saved = useMemo(() => readSavedSettings(), []);
  const [form, setForm] = useState<SavedSettings>({
    fullName: saved.fullName || user?.displayName || user?.username || "",
    username: saved.username || user?.piUsername || user?.username || "",
    email: saved.email || "",
    phone: saved.phone || user?.contactPhone || "",
    location: saved.location || user?.country || "",
    accountType: saved.accountType || (user?.role === "seller" ? "Seller" : "Buyer"),
    theme: saved.theme || (window.localStorage.getItem("smaj_private_theme_mode") === "dark" ? "dark" : "light"),
    emailNotifications: saved.emailNotifications ?? user?.settings?.notifications ?? true,
    productNotifications: saved.productNotifications ?? true,
    messageNotifications: saved.messageNotifications ?? true,
    publicProfile: saved.publicProfile ?? true,
    allowContact: saved.allowContact ?? true,
  });
  const [message, setMessage] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [verificationStats, setVerificationStats] = useState<VerificationStats>({ totalProducts: 0, approvedListings: 0, successfulOrders: 0, completedSales: 0 });

  useEffect(() => {
    document.documentElement.dataset.privateTheme = form.theme;
    document.documentElement.dataset.theme = form.theme;
    window.localStorage.setItem("smaj_private_theme_mode", form.theme);
    window.localStorage.setItem("smaj_public_theme", form.theme);
    window.dispatchEvent(new CustomEvent("smaj:theme-change", { detail: form.theme }));
  }, [form.theme]);

  useEffect(() => {
    axiosClient.get<{ stats: VerificationStats }>("/user/stats").then(({ data }) => {
      setVerificationStats({
        totalProducts: data.stats?.totalProducts || 0,
        approvedListings: data.stats?.approvedListings || 0,
        successfulOrders: data.stats?.successfulOrders || 0,
        completedSales: data.stats?.completedSales || 0,
      });
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const stateRequest = supportsNativePushNotifications() ? getNativePushState() : getPushState();
    stateRequest.then((state) => { setPushSupported(state.supported); setPushEnabled(state.subscribed); }).catch(() => setPushSupported(false));
  }, []);

  const togglePhoneNotifications = async () => {
    setPushBusy(true);
    setMessage("");
    try {
      if (supportsNativePushNotifications()) {
        if (pushEnabled) await disableNativePushNotifications();
        else await enableNativePushNotifications();
      } else if (pushEnabled) await disablePushNotifications();
      else await enablePushNotifications();
      setPushEnabled(!pushEnabled);
      setMessage(pushEnabled ? "Phone notifications disabled on this device." : "Phone notifications enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Phone notifications could not be changed.");
    } finally {
      setPushBusy(false);
    }
  };

  const setField = <Key extends keyof SavedSettings>(key: Key, value: SavedSettings[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    try {
      await Promise.all([
        updateSettings({ theme: form.theme, language: user?.language || user?.settings?.language || "English", notifications: form.emailNotifications }),
        updateProfile({
          displayName: form.fullName || form.username || "Pi user",
          country: form.location,
          contactPhone: form.phone,
          role: form.accountType === "Seller" ? "seller" : user?.role === "admin" ? "admin" : "buyer",
          avatar: user?.avatar,
          coverImage: user?.coverImage,
          bio: user?.bio,
          language: user?.language || user?.settings?.language || "English",
          sellerActive: form.accountType !== "Buyer",
        }),
      ]);
      setMessage("Settings saved.");
    } catch {
      setMessage("Settings could not be saved. Please try again.");
    }
  };

  const requestDeletion = async () => {
    if (deleteConfirmText !== "DELETE") return;
    await axiosClient.post("/support", {
      source: "account",
      topic: "Account deletion request",
      name: form.fullName || user?.displayName || user?.username || "Pi user",
      email: form.email,
      message: "User requested account deletion review from Settings.",
    });
    setDeleteRequested(false);
    setDeleteConfirmText("");
    setMessage("Account deletion request submitted for support review.");
  };

  const verificationLevel = user?.verificationLevel || "basic";
  const verificationStatus = user?.verificationStatus || "none";
  const hasRequestedVerification = verificationRequested || Boolean(user?.verificationRequested) || verificationStatus === "pending";
  const piAccount = user?.piUsername || user?.username ? `@${user.piUsername || user.username}` : "Not connected";
  const profileRequirements = [
    ["Display name", Boolean((form.fullName || user?.displayName || "").trim())],
    ["Pi username", Boolean(user?.piUsername || user?.username || form.username.trim())],
    ["Country/location", Boolean((form.location || user?.country || "").trim())],
    ["Phone/contact", Boolean((form.phone || user?.contactPhone || "").trim())],
    ["Profile photo", Boolean(user?.avatar)],
    ["Bio/intro", Boolean(user?.bio?.trim())],
  ] as const;
  const profileCompleted = profileRequirements.filter(([, done]) => done).length;
  const profileComplete = profileCompleted === profileRequirements.length;
  const approvedRank = verificationStatus === "approved" ? levelRank(verificationLevel) : 0;
  const nextVerificationLevel: VerificationLevel | null = approvedRank >= 3 ? null : approvedRank >= 2 ? "trusted_seller" : approvedRank >= 1 ? "seller_verified" : "pi_verified";
  const sellerListingReady = verificationStats.approvedListings >= 10;
  const trustedListingReady = verificationStats.approvedListings >= 100;
  const trustedSalesReady = verificationStats.completedSales >= 20;
  const sellerReady = Boolean(user?.sellerActive || user?.role === "seller") && sellerListingReady;
  const trustedReady = trustedListingReady && trustedSalesReady;
  const verificationReady = nextVerificationLevel === "pi_verified"
    ? profileComplete
    : nextVerificationLevel === "seller_verified"
      ? sellerReady
      : nextVerificationLevel === "trusted_seller"
        ? trustedReady
        : false;
  const verificationButtonLabel = !nextVerificationLevel
    ? "Trusted Seller Approved"
    : hasRequestedVerification
      ? "Verification Pending"
      : requestingVerification
        ? "Requesting..."
        : nextVerificationLevel === "pi_verified"
          ? "Request Real Pi User Verification"
          : nextVerificationLevel === "seller_verified"
            ? "Request Seller Verification"
            : "Request Trusted Seller";
  const verificationLockedText = nextVerificationLevel === "pi_verified"
    ? `${profileCompleted} / ${profileRequirements.length} profile items completed`
    : nextVerificationLevel === "seller_verified"
      ? `${Math.min(verificationStats.approvedListings, 10)} / 10 approved listings completed`
      : nextVerificationLevel === "trusted_seller"
        ? `${Math.min(verificationStats.approvedListings, 100)} / 100 listings and ${Math.min(verificationStats.completedSales, 20)} / 20 sales completed`
        : "Highest verification level approved";

  const requestVerification = async () => {
    if (!nextVerificationLevel || !verificationReady || hasRequestedVerification) return;
    setMessage("");
    setRequestingVerification(true);
    try {
      await axiosClient.post("/user/verification-request", { level: nextVerificationLevel });
      setVerificationRequested(true);
      setMessage("Verification request submitted. Team will review your account.");
    } catch {
      setMessage("Verification request could not be submitted. Please try again.");
    } finally {
      setRequestingVerification(false);
    }
  };

  const logout = async () => {
    await signOut();
    navigate("/home", { replace: true });
  };

  const replayWelcomeTour = () => {
    window.dispatchEvent(new Event(WELCOME_REPLAY_EVENT));
  };

  return (
    <main className="private-page settings-page">
      <LanguageSoonButton />
      <section className="private-page-head">
        <div>
          <p className="private-kicker">ACCOUNT</p>
          <h1>Settings</h1>
          <p>Simple account controls for your SMAJ PI HUB profile, theme, notifications, privacy, and session.</p>
        </div>
      </section>

      <form className="settings-sections" onSubmit={(event) => void saveSettings(event)}>
        <section>
          <h2>Identity & Access</h2>
          <div className="settings-info-row"><span>Account name</span><strong>{form.fullName || user?.displayName || user?.username || "Pi user"}</strong></div>
          <div className="settings-info-row"><span>Pi username</span><strong>{piAccount}</strong></div>
          <div className="settings-info-row"><span>Pi access</span><strong>Pi access is handled by Pi Network. SMAJ PI HUB does not store your Pi or private keys.</strong></div>
          <p>Profile name, country, image, banner, and bio are managed from the Profile page so your public marketplace identity stays consistent.</p>
        </section>

        <section>
          <h2>Account Settings</h2>
          <label>Account type<select value={form.accountType} onChange={(event) => setField("accountType", event.target.value as SavedSettings["accountType"])}><option>Buyer</option><option>Seller</option><option>Both</option></select></label>
          <div className="settings-info-row settings-verification-row"><span>Verification status</span><strong className="settings-verification-badge"><TrustBadge level={verificationLevel} status={user?.verificationStatus} /></strong></div>
          <div className="settings-verification-card">
            <div>
              <strong>{verificationButtonLabel}</strong>
              <small>{verificationLockedText}</small>
            </div>
            {nextVerificationLevel === "pi_verified" ? (
              <>
                <div className="verification-progress-line"><span style={{ width: clampPercent(profileCompleted, profileRequirements.length) }} /></div>
                <ul>
                  {profileRequirements.map(([label, done]) => <li className={done ? "done" : ""} key={label}>{label}</li>)}
                </ul>
              </>
            ) : nextVerificationLevel === "seller_verified" ? (
              <>
                <div className="verification-progress-line"><span style={{ width: clampPercent(Math.min(verificationStats.approvedListings, 10), 10) }} /></div>
                <p>Seller Verified unlocks after seller tools are active and 10 approved/live listings are completed.</p>
              </>
            ) : nextVerificationLevel === "trusted_seller" ? (
              <>
                <div className="verification-progress-line"><span style={{ width: clampPercent(Math.min(verificationStats.approvedListings, 100) + Math.min(verificationStats.completedSales, 20), 120) }} /></div>
                <p>Trusted Seller unlocks after 100 approved/live listings and 20 completed sales.</p>
              </>
            ) : (
              <p>Your account has the highest trust level.</p>
            )}
            <button type="button" className="private-primary-button" disabled={!verificationReady || hasRequestedVerification || requestingVerification || !nextVerificationLevel} onClick={() => void requestVerification()}>{verificationButtonLabel}</button>
          </div>
          <div className="settings-action-row">
            <button type="button" className="private-secondary-button" onClick={replayWelcomeTour}>Replay welcome tour</button>
            <button type="button" className="private-secondary-button danger" onClick={() => setShowSignOut(true)}>Logout</button>
          </div>
        </section>

        <section>
          <h2>Theme Settings</h2>
          <div className="appearance-options">
            {(["light", "dark"] as const).map((theme) => (
              <button type="button" className={form.theme === theme ? "active" : ""} key={theme} onClick={() => setField("theme", theme)}>
                {theme === "light" ? "Light mode" : "Dark mode"}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Notification Settings</h2>
          <div className="setting-line toggle-line"><span><strong>Phone push notifications</strong><small>{pushSupported ? "Show important alerts even when SMAJ PI HUB is closed." : "Install this site on your Home Screen and use a supported browser."}</small></span><button type="button" className="private-secondary-button" disabled={!pushSupported || pushBusy} onClick={() => void togglePhoneNotifications()}>{pushBusy ? "Please wait..." : pushEnabled ? "Disable" : "Enable"}</button></div>
          <label className="setting-line toggle-line"><span><strong>Email notifications</strong><small>Receive important account and support updates.</small></span><input type="checkbox" checked={form.emailNotifications} onChange={(event) => setField("emailNotifications", event.target.checked)} /></label>
          <label className="setting-line toggle-line"><span><strong>Product/order notifications</strong><small>Get marketplace listing, order, and payment updates.</small></span><input type="checkbox" checked={form.productNotifications} onChange={(event) => setField("productNotifications", event.target.checked)} /></label>
          <label className="setting-line toggle-line"><span><strong>Message notifications</strong><small>Get alerts for buyer and seller conversations.</small></span><input type="checkbox" checked={form.messageNotifications} onChange={(event) => setField("messageNotifications", event.target.checked)} /></label>
        </section>

        <section>
          <h2>Privacy & Security</h2>
          <Link className="settings-device-link" to="/settings/security/app-lock"><span className="settings-device-icon" aria-hidden="true"><LockOutlinedIcon /></span><span><strong>App Lock</strong><small>Fingerprint, face, or device credential protection</small></span><ChevronRightOutlinedIcon aria-hidden="true" /></Link>
          <Link className="settings-device-link" to="/settings/devices"><span className="settings-device-icon" aria-hidden="true"><DevicesOutlinedIcon /></span><span><strong>Devices & Sessions</strong><small>Manage active web and Android logins</small></span><ChevronRightOutlinedIcon aria-hidden="true" /></Link>
          <label className="setting-line toggle-line"><span><strong>Show profile publicly</strong><small>Allow marketplace users to see your public seller or buyer profile.</small></span><input type="checkbox" checked={form.publicProfile} onChange={(event) => setField("publicProfile", event.target.checked)} /></label>
          <label className="setting-line toggle-line"><span><strong>Allow sellers/buyers to contact me</strong><small>Enable safe marketplace contact for service and order activity.</small></span><input type="checkbox" checked={form.allowContact} onChange={(event) => setField("allowContact", event.target.checked)} /></label>
          <button type="button" className="private-secondary-button danger" onClick={() => setDeleteRequested(true)}>Delete account</button>
        </section>

        {message ? <div className="private-alert success">{message}</div> : null}
        <button className="private-primary-button">Save changes</button>
      </form>

      <ConfirmSignOutModal open={showSignOut} onCancel={() => setShowSignOut(false)} onConfirm={() => void logout()} />
      {deleteRequested ? (
        <div className="confirm-modal-backdrop">
          <section className="confirm-modal">
            <h2>Delete account?</h2>
            <p>The SMAJ support team will review the request before any account action is taken. Type DELETE to confirm.</p>
            <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} placeholder="Type DELETE" />
            <div className="confirm-modal-actions">
              <button className="modal-cancel-button" onClick={() => { setDeleteRequested(false); setDeleteConfirmText(""); }}>Cancel</button>
              <button className="modal-signout-button" disabled={deleteConfirmText !== "DELETE"} onClick={() => void requestDeletion()}>Submit Request</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default SettingsPage;
