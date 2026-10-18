import UpdateProgress from "../../components/UpdateProgress";
import AdPrivacyControls from "../../components/AdPrivacyControls";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import ConfirmSignOutModal from "../../components/ConfirmSignOutModal";
import LanguageSoonButton from "../../components/LanguageSoonButton";
import TrustBadge from "../../components/TrustBadge";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import { Capacitor } from "@capacitor/core";
import {
  APP_VERSION,
  checkAppUpdate,
  installAppUpdate,
  type AppUpdate,
  type UpdateProgress as Progress,
} from "../../lib/appUpdates";
import "./SettingsPage.css";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { WELCOME_REPLAY_EVENT } from "../../components/WelcomeTour";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { disablePushNotifications, enablePushNotifications, getPushState } from "../../lib/pushNotifications";
import {
  disableNativePushNotifications,
  enableNativePushNotifications,
  getNativePushState,
  supportsNativePushNotifications,
} from "../../lib/nativePushNotifications";

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

const SettingsGroup = ({
  id,
  title,
  description,
  icon,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <section className="settings-group">
    <h2>
      <button
        type="button"
        className="settings-group-toggle"
        id={id + "-heading"}
        aria-expanded={expanded}
        aria-controls={id + "-panel"}
        onClick={onToggle}
      >
        <span className="settings-group-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="settings-group-copy">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <ChevronRightOutlinedIcon className="settings-group-chevron" aria-hidden="true" />
      </button>
    </h2>
    <div
      className="settings-group-body"
      id={id + "-panel"}
      role="region"
      aria-labelledby={id + "-heading"}
      hidden={!expanded}
    >
      {children}
    </div>
  </section>
);

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
  const [savedForm, setSavedForm] = useState(form);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm);
  const groupProps = (id: string) => ({
    id,
    expanded: expanded === id,
    onToggle: () => setExpanded(current => (current === id ? null : id)),
  });
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdate | null>(null);
  const [updateProgress, setUpdateProgress] = useState<Progress | null>(null);
  const [updatingApp, setUpdatingApp] = useState(false);
  const updateDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (updateInfo) updateDialog.current?.showModal();
  }, [updateInfo]);
  const closeUpdate = () => {
    updateDialog.current?.close();
    setUpdateInfo(null);
  };
  const checkVersion = async () => {
    setCheckingVersion(true);
    setMessage("");
    try {
      setUpdateInfo(await checkAppUpdate(Capacitor.isNativePlatform()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check for updates.");
    } finally {
      setCheckingVersion(false);
    }
  };
  const installUpdate = async () => {
    setUpdatingApp(true);
    try {
      if (updateInfo?.native) {
        await installAppUpdate(updateInfo, setUpdateProgress);
        closeUpdate();
      } else {
        setUpdateProgress({ stage: "preparing" });
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          await registration?.update();
        }
        window.location.reload();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the update. Please try again.");
      closeUpdate();
    } finally {
      setUpdatingApp(false);
      setUpdateProgress(null);
    }
  };
  const [message, setMessage] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleteRequested) deleteDialog.current?.showModal();
  }, [deleteRequested]);
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [verificationStats, setVerificationStats] = useState<VerificationStats>({
    totalProducts: 0,
    approvedListings: 0,
    successfulOrders: 0,
    completedSales: 0,
  });

  useEffect(() => {
    document.documentElement.dataset.privateTheme = form.theme;
    document.documentElement.dataset.theme = form.theme;
    window.localStorage.setItem("smaj_private_theme_mode", form.theme);
    window.localStorage.setItem("smaj_public_theme", form.theme);
    window.dispatchEvent(new CustomEvent("smaj:theme-change", { detail: form.theme }));
  }, [form.theme]);

  useEffect(() => {
    axiosClient
      .get<{ stats: VerificationStats }>("/user/stats")
      .then(({ data }) => {
        setVerificationStats({
          totalProducts: data.stats?.totalProducts || 0,
          approvedListings: data.stats?.approvedListings || 0,
          successfulOrders: data.stats?.successfulOrders || 0,
          completedSales: data.stats?.completedSales || 0,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const stateRequest = supportsNativePushNotifications() ? getNativePushState() : getPushState();
    stateRequest
      .then(state => {
        setPushSupported(state.supported);
        setPushEnabled(state.subscribed);
      })
      .catch(() => setPushSupported(false));
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
      setMessage(
        pushEnabled ? "Phone notifications disabled on this device." : "Phone notifications enabled on this device."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Phone notifications could not be changed.");
    } finally {
      setPushBusy(false);
    }
  };

  const setField = <Key extends keyof SavedSettings>(key: Key, value: SavedSettings[Key]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !hasChanges) return;
    const submitted = { ...form };
    setSaving(true);
    setMessage("");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      await Promise.all([
        updateSettings({
          theme: form.theme,
          language: user?.language || user?.settings?.language || "English",
          notifications: form.emailNotifications,
        }),
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
      setSavedForm(submitted);
      setMessage("Settings saved.");
    } catch {
      setMessage("Settings could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const requestDeletion = async () => {
    if (deleteConfirmText !== "DELETE" || deleting) return;
    setDeleting(true);
    setDeletionError("");
    try {
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
    } catch {
      setDeletionError("The deletion request could not be submitted. Please retry; no account action has been taken.");
    } finally {
      setDeleting(false);
    }
  };

  const verificationLevel = user?.verificationLevel || "basic";
  const verificationStatus = user?.verificationStatus || "none";
  const hasRequestedVerification =
    verificationRequested || Boolean(user?.verificationRequested) || verificationStatus === "pending";
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
  const nextVerificationLevel: VerificationLevel | null =
    approvedRank >= 3
      ? null
      : approvedRank >= 2
        ? "trusted_seller"
        : approvedRank >= 1
          ? "seller_verified"
          : "pi_verified";
  const sellerListingReady = verificationStats.approvedListings >= 10;
  const trustedListingReady = verificationStats.approvedListings >= 100;
  const trustedSalesReady = verificationStats.completedSales >= 20;
  const sellerReady = Boolean(user?.sellerActive || user?.role === "seller") && sellerListingReady;
  const trustedReady = trustedListingReady && trustedSalesReady;
  const verificationReady =
    nextVerificationLevel === "pi_verified"
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
  const verificationLockedText =
    nextVerificationLevel === "pi_verified"
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
    <main className="settings-page settings-compact">
      <header className="settings-topbar">
        <button type="button" aria-label="Back to account" onClick={() => navigate("/settings")}>
          <ArrowBackIosNewOutlinedIcon />
        </button>
        <h1>Settings</h1>
      </header>

      <section className="settings-profile-card" aria-label="Account profile">
        {user?.avatar ? (
          <img src={user.avatar} alt="" />
        ) : (
          <span className="settings-profile-initial" aria-hidden="true">
            {(form.fullName || user?.displayName || user?.username || "P").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <strong>{form.fullName || user?.displayName || user?.username || "Pi user"}</strong>
          <span>{piAccount}</span>
          <small>
            <TrustBadge level={verificationLevel} status={user?.verificationStatus} />
            {verificationStatus === "approved" && levelRank(verificationLevel) > 0
              ? "Verified account"
              : hasRequestedVerification
                ? "Verification pending"
                : "Not verified"}
          </small>
        </div>
        <Link to="/profile" aria-label="Open profile">
          <ChevronRightOutlinedIcon aria-hidden="true" />
        </Link>
      </section>
      <form className="settings-sections" aria-label="Account settings" onSubmit={event => void saveSettings(event)}>
        <div className="settings-menu-card">
          <SettingsGroup
            {...groupProps("account")}
            title="Account & Identity"
            description="Profile, Pi username, account type, verification"
            icon={<PersonOutlineOutlinedIcon />}
          >
            <Link className="settings-device-link" to="/profile">
              <span className="settings-device-icon" aria-hidden="true">
                <PersonOutlineOutlinedIcon />
              </span>
              <span>
                <strong>Edit profile</strong>
                <small>Name, country, photo, banner and bio</small>
              </span>
              <ChevronRightOutlinedIcon aria-hidden="true" />
            </Link>
            <p className="settings-access-note">
              Pi access is handled by Pi Network. SMAJ PI HUB does not store your Pi or private keys.
            </p>
            <label>
              Account type
              <select
                value={form.accountType}
                onChange={event => setField("accountType", event.target.value as SavedSettings["accountType"])}
              >
                <option>Buyer</option>
                <option>Seller</option>
                <option>Both</option>
              </select>
            </label>
            <div className="settings-verification-card">
              <div>
                <strong>{verificationButtonLabel}</strong>
                <small>{verificationLockedText}</small>
              </div>
              {nextVerificationLevel === "pi_verified" ? (
                <>
                  <div className="verification-progress-line">
                    <span style={{ width: clampPercent(profileCompleted, profileRequirements.length) }} />
                  </div>
                  <ul>
                    {profileRequirements.map(([label, done]) => (
                      <li className={done ? "done" : ""} key={label}>
                        {label}
                      </li>
                    ))}
                  </ul>
                </>
              ) : nextVerificationLevel === "seller_verified" ? (
                <>
                  <div className="verification-progress-line">
                    <span style={{ width: clampPercent(Math.min(verificationStats.approvedListings, 10), 10) }} />
                  </div>
                  <p>
                    Seller Verified unlocks after seller tools are active and 10 approved/live listings are completed.
                  </p>
                </>
              ) : nextVerificationLevel === "trusted_seller" ? (
                <>
                  <div className="verification-progress-line">
                    <span
                      style={{
                        width: clampPercent(
                          Math.min(verificationStats.approvedListings, 100) +
                            Math.min(verificationStats.completedSales, 20),
                          120
                        ),
                      }}
                    />
                  </div>
                  <p>Trusted Seller unlocks after 100 approved/live listings and 20 completed sales.</p>
                </>
              ) : (
                <p>Your account has the highest trust level.</p>
              )}
              <button
                type="button"
                className="private-primary-button"
                disabled={
                  !verificationReady || hasRequestedVerification || requestingVerification || !nextVerificationLevel
                }
                onClick={() => void requestVerification()}
              >
                {verificationButtonLabel}
              </button>
            </div>
          </SettingsGroup>

          <SettingsGroup
            {...groupProps("notifications")}
            title="Notifications"
            description="Push, email, orders, messages"
            icon={<NotificationsNoneOutlinedIcon />}
          >
            <div className="setting-line toggle-line">
              <span>
                <strong>Phone push notifications</strong>
                <small>
                  {pushSupported
                    ? "Show important alerts even when SMAJ PI HUB is closed."
                    : "Install this site on your Home Screen and use a supported browser."}
                </small>
              </span>
              <button
                type="button"
                className={`settings-switch ${pushEnabled ? "enabled" : ""}`}
                role="switch"
                aria-label="Phone push notifications"
                aria-checked={pushEnabled}
                disabled={!pushSupported || pushBusy}
                onClick={() => void togglePhoneNotifications()}
              >
                <i />
              </button>
            </div>
            <label className="setting-line toggle-line">
              <span>
                <strong>Email notifications</strong>
                <small>Receive important account and support updates.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.emailNotifications}
                onChange={event => setField("emailNotifications", event.target.checked)}
              />
            </label>
            <label className="setting-line toggle-line">
              <span>
                <strong>Product/order notifications</strong>
                <small>Get marketplace listing, order, and payment updates.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.productNotifications}
                onChange={event => setField("productNotifications", event.target.checked)}
              />
            </label>
            <label className="setting-line toggle-line">
              <span>
                <strong>Message notifications</strong>
                <small>Get alerts for buyer and seller conversations.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.messageNotifications}
                onChange={event => setField("messageNotifications", event.target.checked)}
              />
            </label>
          </SettingsGroup>

          <SettingsGroup
            {...groupProps("privacy")}
            title="Privacy & Security"
            description="App lock, devices, public profile, ads privacy"
            icon={<ShieldOutlinedIcon />}
          >
            <AdPrivacyControls />
            <Link className="settings-device-link" to="/settings/security/app-lock">
              <span className="settings-device-icon" aria-hidden="true">
                <LockOutlinedIcon />
              </span>
              <span>
                <strong>App Lock</strong>
                <small>Fingerprint, face, or device credential protection</small>
              </span>
              <ChevronRightOutlinedIcon aria-hidden="true" />
            </Link>
            <Link className="settings-device-link" to="/settings/devices">
              <span className="settings-device-icon" aria-hidden="true">
                <DevicesOutlinedIcon />
              </span>
              <span>
                <strong>Devices & Sessions</strong>
                <small>Manage active web and Android logins</small>
              </span>
              <ChevronRightOutlinedIcon aria-hidden="true" />
            </Link>
            <label className="setting-line toggle-line">
              <span>
                <strong>Show profile publicly</strong>
                <small>Allow marketplace users to see your public seller or buyer profile.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.publicProfile}
                onChange={event => setField("publicProfile", event.target.checked)}
              />
            </label>
            <label className="setting-line toggle-line">
              <span>
                <strong>Allow sellers/buyers to contact me</strong>
                <small>Enable safe marketplace contact for service and order activity.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.allowContact}
                onChange={event => setField("allowContact", event.target.checked)}
              />
            </label>
            <button
              type="button"
              className="private-secondary-button danger"
              onClick={() => {
                setDeleteConfirmText("");
                setDeletionError("");
                setDeleteRequested(true);
              }}
            >
              Delete account
            </button>
          </SettingsGroup>

          <SettingsGroup
            {...groupProps("appearance")}
            title="Appearance & Language"
            description="Dark mode, language, translation"
            icon={<PaletteOutlinedIcon />}
          >
            <label className="setting-line toggle-line">
              <span>
                <strong>Dark mode</strong>
                <small>Use a darker appearance.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={form.theme === "dark"}
                onChange={event => setField("theme", event.target.checked ? "dark" : "light")}
              />
            </label>
            <div className="settings-language-row">
              <span>
                <strong>Language</strong>
                <small>Choose the app language</small>
              </span>
              <LanguageSoonButton />
            </div>
          </SettingsGroup>

          <SettingsGroup
            {...groupProps("app")}
            title="App & Support"
            description="Version, welcome tour, help"
            icon={<HelpOutlineOutlinedIcon />}
          >
            <button
              type="button"
              className="settings-menu-row"
              onClick={() => void checkVersion()}
              disabled={checkingVersion}
            >
              <span>Check version</span>
              <span className="settings-row-value">{checkingVersion ? "Checking..." : APP_VERSION}</span>
              <ChevronRightOutlinedIcon aria-hidden="true" />
            </button>
            <div className="settings-action-row">
              <button type="button" className="private-secondary-button" onClick={replayWelcomeTour}>
                Replay welcome tour
              </button>
            </div>
            <Link className="settings-device-link" to="/app/help-center">
              <span className="settings-device-icon" aria-hidden="true">
                <HelpOutlineOutlinedIcon />
              </span>
              <span>
                <strong>Help Center</strong>
                <small>Support and account help</small>
              </span>
              <ChevronRightOutlinedIcon aria-hidden="true" />
            </Link>
          </SettingsGroup>
        </div>
        {message ? (
          <div className="private-alert" role="status">
            {message}
          </div>
        ) : null}
        {hasChanges ? (
          <div className="settings-save-bar">
            <span>Unsaved changes</span>
            <button type="submit" className="private-primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ) : null}
      </form>
      <footer className="settings-signout-footer">
        <button type="button" onClick={() => setShowSignOut(true)}>
          <span>Log Out</span>
          <ChevronRightOutlinedIcon aria-hidden="true" />
        </button>
        <p>SMAJ PI HUB v{APP_VERSION}</p>
      </footer>

      {updateInfo ? (
        <dialog
          ref={updateDialog}
          className="settings-update-sheet"
          aria-labelledby="settings-update-title"
          onCancel={event => {
            if (updatingApp) event.preventDefault();
            else setUpdateInfo(null);
          }}
        >
          <h2 id="settings-update-title">{updateInfo.available ? "New Version" : "Up to date"}</h2>
          <div className="settings-update-app">
            <img src="/icon-192x192.png" alt="" />
            <div>
              <strong>SMAJ PI HUB</strong>
              <p>Version: {updateInfo.version}</p>
            </div>
          </div>
          <strong>Details</strong>
          <p>{updateInfo.available ? updateInfo.details : "You are using the latest version."}</p>
          <UpdateProgress progress={updateProgress} />
          <div className="settings-update-actions">
            <button type="button" disabled={updatingApp} onClick={closeUpdate}>
              {updateInfo.available ? "Later" : "Close"}
            </button>
            {updateInfo.available ? (
              <button type="button" disabled={updatingApp} onClick={() => void installUpdate()}>
                {updatingApp ? "Updating..." : "Update"}
              </button>
            ) : null}
          </div>
        </dialog>
      ) : null}
      <ConfirmSignOutModal open={showSignOut} onCancel={() => setShowSignOut(false)} onConfirm={() => void logout()} />
      {deleteRequested ? (
        <dialog
          ref={deleteDialog}
          className="settings-delete-dialog"
          aria-labelledby="settings-delete-title"
          aria-describedby="settings-delete-description"
          onCancel={event => {
            if (deleting) event.preventDefault();
            else {
              setDeleteRequested(false);
              setDeleteConfirmText("");
            }
          }}
        >
          <h2 id="settings-delete-title">Delete account?</h2>
          <p id="settings-delete-description">
            The SMAJ support team will review the request before any account action is taken. Type DELETE to confirm.
          </p>
          <form
            onSubmit={event => {
              event.preventDefault();
              void requestDeletion();
            }}
          >
            <label htmlFor="settings-delete-confirm">
              Confirmation
              <input
                id="settings-delete-confirm"
                value={deleteConfirmText}
                disabled={deleting}
                autoComplete="off"
                autoFocus
                onChange={event => setDeleteConfirmText(event.target.value)}
                placeholder="Type DELETE"
              />
            </label>
            {deletionError ? (
              <p className="settings-delete-error" role="alert">
                {deletionError}
              </p>
            ) : null}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="modal-cancel-button"
                disabled={deleting}
                onClick={() => {
                  setDeleteRequested(false);
                  setDeleteConfirmText("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="modal-signout-button"
                disabled={deleteConfirmText !== "DELETE" || deleting}
              >
                {deleting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </main>
  );
};

export default SettingsPage;
