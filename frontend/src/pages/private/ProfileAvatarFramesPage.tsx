import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import ArrowBackIosNewOutlinedIcon from "@mui/icons-material/ArrowBackIosNewOutlined";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import UserAvatarFrame, { type AvatarFrameId } from "../../components/UserAvatarFrame";
import { axiosClient } from "../../lib/axiosClient";
import type { User } from "../../types/pi";

type SocialSettings = {
  publicProfile: boolean;
  allowContact: boolean;
  openToWork: boolean;
  eligibleFrames: AvatarFrameId[];
  activeAvatarFrame: AvatarFrameId | null;
};

const frameOptions: Array<{ id: AvatarFrameId; label: string; unlock: string }> = [
  { id: "ambassador", label: "AMBASSADOR", unlock: "Join the SMAJ Ambassador programme and wait for approval." },
  { id: "open_to_work", label: "OPEN TO WORK", unlock: "Turn on Open to Work to unlock this frame." },
  { id: "seller", label: "SELLER", unlock: "Activate seller tools and publish an approved listing." },
  { id: "hiring", label: "HIRING", unlock: "Verify an employer company in SMAJ Jobs." },
];

const initialSettings: SocialSettings = {
  publicProfile: true,
  allowContact: true,
  openToWork: false,
  eligibleFrames: [],
  activeAvatarFrame: null,
};

const ProfileAvatarFramesPage = () => {
  const { user, synchronizeUser } = useAuthContext();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSettings = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    setSettingsLoaded(false);
    setError("");
    try {
      const { data } = await axiosClient.get<{ settings: SocialSettings }>("/user/social-settings", {
        smajSkipResponseCache: true,
      });
      setSettings(data.settings);
      setSettingsLoaded(true);
    } catch (reason: unknown) {
      const status = isAxiosError(reason) ? reason.response?.status : undefined;
      setError(
        status === 404
          ? "Avatar frame settings are unavailable on the connected backend. Please try again when the service finishes updating."
          : "Social settings could not be loaded. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async (updates: Partial<SocialSettings>, success: string) => {
    if (saving || loading) return;
    const next = { ...settings, ...updates };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await axiosClient.put<{ settings: SocialSettings; user?: Partial<User> }>(
        "/user/social-settings",
        {
          publicProfile: next.publicProfile,
          allowContact: next.allowContact,
          openToWork: next.openToWork,
          activeAvatarFrame: next.activeAvatarFrame,
        },
      );
      setSettings(data.settings);
      if (data.user) synchronizeUser(data.user);
      setNotice(success);
    } catch (reason: unknown) {
      setError(
        isAxiosError<{ message?: string }>(reason)
          ? reason.response?.data?.message || "Avatar frame settings could not be saved."
          : reason instanceof Error ? reason.message : "Avatar frame settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleOpenToWork = () => {
    const openToWork = !settings.openToWork;
    const activeAvatarFrame = !openToWork && settings.activeAvatarFrame === "open_to_work"
      ? null
      : settings.activeAvatarFrame;
    void saveSettings(
      { openToWork, activeAvatarFrame },
      openToWork ? "Open to Work enabled." : "Open to Work disabled.",
    );
  };

  const name = user?.displayName || user?.username || "Pi User";

  return (
    <main className="private-page profile-avatar-frames-page">
      <header className="private-page-head">
        <button className="profile-frames-back" type="button" onClick={() => navigate("/profile")} aria-label="Back to profile">
          <ArrowBackIosNewOutlinedIcon />
        </button>
        <div>
          <p className="private-kicker">PROFILE</p>
          <h1>Avatar Frames</h1>
        </div>
      </header>

      {error ? (
        <div className="private-alert error" role="alert">
          <span>{error}</span>
          <button type="button" disabled={loading} onClick={() => void loadSettings()}>Retry</button>
        </div>
      ) : null}
      {notice ? <p className="private-alert success" role="status">{notice}</p> : null}
      {loading ? <p className="profile-frames-loading" role="status">Loading social settings…</p> : null}

      {settingsLoaded ? (
        <>
          <section className="profile-avatar-frame-grid" aria-label="Avatar frame options">
            {frameOptions.map(({ id, label, unlock }) => {
              const eligible = settings.eligibleFrames.includes(id);
              const selected = settings.activeAvatarFrame === id;
              return (
                <article className="profile-avatar-frame-option" data-frame={id} key={id}>
                  <UserAvatarFrame name={name} image={user?.avatar} frame={id} size={100} />
                  <strong>{label}</strong>
                  {eligible ? (
                    <button
                      type="button"
                      className={selected ? "private-secondary-button" : "private-primary-button"}
                      disabled={saving || loading}
                      aria-pressed={selected}
                      onClick={() => void saveSettings(
                        { activeAvatarFrame: selected ? null : id },
                        selected ? "Avatar frame removed." : `${label} frame activated.`,
                      )}
                    >
                      {selected ? "Remove frame" : settings.activeAvatarFrame ? "Switch to frame" : "Activate frame"}
                    </button>
                  ) : id === "open_to_work" ? (
                    <div className="profile-avatar-frame-unlock">
                      <p>{unlock}</p>
                      <button
                        type="button"
                        className="private-secondary-button"
                        disabled={saving || loading}
                        onClick={toggleOpenToWork}
                      >
                        Turn on Open to Work
                      </button>
                    </div>
                  ) : (
                    <p className="profile-avatar-frame-unlock">Locked: {unlock}</p>
                  )}
                  {id === "open_to_work" && eligible ? (
                    <button
                      type="button"
                      className="private-secondary-button"
                      disabled={saving || loading}
                      onClick={toggleOpenToWork}
                    >
                      Turn off Open to Work
                    </button>
                  ) : null}
                </article>
              );
            })}
          </section>
          <p className="profile-avatar-frame-current">
            {settings.activeAvatarFrame
              ? `Active frame: ${frameOptions.find(frame => frame.id === settings.activeAvatarFrame)?.label || settings.activeAvatarFrame}`
              : "No frame selected; your normal avatar is displayed."}
          </p>
        </>
      ) : null}
    </main>
  );
};

export default ProfileAvatarFramesPage;
