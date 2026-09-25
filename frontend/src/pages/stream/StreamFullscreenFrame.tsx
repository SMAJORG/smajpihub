import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { StatusBar } from "@capacitor/status-bar";
import CastConnectedRoundedIcon from "@mui/icons-material/CastConnectedRounded";
import FitScreenRoundedIcon from "@mui/icons-material/FitScreenRounded";
import Forward10RoundedIcon from "@mui/icons-material/Forward10Rounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import Replay10RoundedIcon from "@mui/icons-material/Replay10Rounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import { SmajMedia } from "../../native/smajMedia";

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

type Props = {
  title: string;
  className: string;
  children: ReactNode;
  mediaRef?: RefObject<HTMLVideoElement | null>;
  castSupported?: boolean;
};

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
};

const StreamFullscreenFrame = ({ title, className, children, mediaRef, castSupported = false }: Props) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [speed, setSpeed] = useState(1);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    if (fullscreen && (playing || !mediaRef))
      hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, [fullscreen, mediaRef, playing]);

  const restorePortraitUi = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      await Promise.allSettled([SmajMedia.exitLandscape(), ScreenOrientation.unlock(), StatusBar.show()]);
    } else {
      (screen.orientation as LockableOrientation).unlock?.();
    }
  }, []);

  const leaveFullscreen = useCallback(async () => {
    const fullscreenDocument = document as FullscreenDocument;
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if (fullscreenDocument.webkitFullscreenElement) await fullscreenDocument.webkitExitFullscreen?.();
      else if (fullscreenDocument.msFullscreenElement) await fullscreenDocument.msExitFullscreen?.();
    } finally {
      await restorePortraitUi();
    }
  }, [restorePortraitUi]);

  const enterFullscreen = useCallback(async () => {
    const element = frameRef.current as FullscreenElement | null;
    if (!element) return;
    if (element.requestFullscreen) await element.requestFullscreen();
    else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
    else if (element.msRequestFullscreen) await element.msRequestFullscreen();
    else throw new Error("Fullscreen is not supported by this browser.");
    if (Capacitor.isNativePlatform()) {
      try {
        await SmajMedia.enterLandscape();
      } catch {
        await ScreenOrientation.lock({ orientation: "landscape" });
      }
      await StatusBar.hide();
    } else {
      await (screen.orientation as LockableOrientation).lock?.("landscape").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const fullscreenDocument = document as FullscreenDocument;
    const update = () => {
      const active = Boolean(
        document.fullscreenElement ||
        fullscreenDocument.webkitFullscreenElement ||
        fullscreenDocument.msFullscreenElement
      );
      setFullscreen(active);
      setControlsVisible(true);
      document.documentElement.classList.toggle("sw-player-is-fullscreen", active);
      if (!active) void restorePortraitUi();
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    window.addEventListener("orientationchange", update);
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      document.documentElement.classList.remove("sw-player-is-fullscreen");
      void restorePortraitUi();
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [restorePortraitUi]);

  useEffect(() => {
    const media = mediaRef?.current;
    if (!media) return;
    const update = () => {
      setPlaying(!media.paused);
      setMuted(media.muted);
      setCurrentTime(media.currentTime || 0);
      setDuration(media.duration || 0);
    };
    ["play", "pause", "timeupdate", "durationchange", "volumechange"].forEach(event =>
      media.addEventListener(event, update)
    );
    update();
    return () =>
      ["play", "pause", "timeupdate", "durationchange", "volumechange"].forEach(event =>
        media.removeEventListener(event, update)
      );
  }, [mediaRef, children]);

  useEffect(() => {
    showControls();
  }, [playing, fullscreen, showControls]);

  const seek = (offset: number) => {
    const media = mediaRef?.current;
    if (media) media.currentTime = Math.max(0, Math.min(media.duration || Infinity, media.currentTime + offset));
    showControls();
  };
  const togglePlayback = () => {
    const media = mediaRef?.current;
    if (!media) return;
    if (media.paused) void media.play();
    else media.pause();
    showControls();
  };
  const toggleMute = () => {
    const media = mediaRef?.current;
    if (media) media.muted = !media.muted;
  };
  const changeSpeed = () => {
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(speed) + 1) % rates.length];
    setSpeed(next);
    if (mediaRef?.current) mediaRef.current.playbackRate = next;
    showControls();
  };
  const toggleControls = () => {
    if (!fullscreen) return;
    if (controlsVisible) {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      setControlsVisible(false);
    } else {
      showControls();
    }
  };

  return (
    <div
      ref={frameRef}
      className={`${className} sw-player-stage fit-${fit}${fullscreen ? " is-fullscreen" : ""}`}
      onPointerMove={fullscreen ? showControls : undefined}
      onClick={fullscreen ? toggleControls : undefined}
    >
      {children}
      {!fullscreen ? (
        <button
          className="sw-player-frame-fullscreen"
          type="button"
          onClick={() => void enterFullscreen()}
          aria-label="Open fullscreen player"
        >
          <FullscreenRoundedIcon />
        </button>
      ) : null}
      {fullscreen ? (
        <div
          className={`sw-player-controls ${controlsVisible ? "visible" : "hidden"}`}
          onClick={event => {
            event.stopPropagation();
            if ((event.target as Element).closest("button, input")) return;
            toggleControls();
          }}
        >
          <div className="sw-player-controls-top">
            <button
              className="sw-player-back-fullscreen"
              type="button"
              onClick={() => void leaveFullscreen()}
              aria-label="Leave fullscreen"
            >
              <ArrowBackRoundedIcon />
            </button>
            <strong>{title}</strong>
            <button type="button" disabled={!castSupported} aria-label="Cast">
              <CastConnectedRoundedIcon />
            </button>
            <button type="button" onClick={changeSpeed} aria-label="Playback settings">
              <SettingsRoundedIcon />
            </button>

          </div>
          {mediaRef ? (
            <div className="sw-player-controls-center">
              <button type="button" onClick={() => seek(-10)} aria-label="Rewind 10 seconds">
                <Replay10RoundedIcon />
              </button>
              <button
                className="primary"
                type="button"
                onClick={togglePlayback}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
              </button>
              <button type="button" onClick={() => seek(10)} aria-label="Forward 10 seconds">
                <Forward10RoundedIcon />
              </button>
            </div>
          ) : null}
          <div className="sw-player-controls-bottom">
            {mediaRef ? (
              <>
                <span>{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.1"
                  value={Math.min(currentTime, duration || 0)}
                  onChange={event => {
                    if (mediaRef.current) mediaRef.current.currentTime = Number(event.target.value);
                  }}
                  aria-label="Playback position"
                />
                <span>{formatTime(duration)}</span>
                <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
                  {muted ? <VolumeOffRoundedIcon /> : <VolumeUpRoundedIcon />}
                </button>
              </>
            ) : (
              <span className="sw-player-provider-note">Player controls</span>
            )}
            <button
              type="button"
              onClick={() => setFit(value => (value === "contain" ? "cover" : "contain"))}
              aria-label={`Fit: ${fit}`}
            >
              <FitScreenRoundedIcon />
              <small>Fit</small>
            </button>
            <button type="button" onClick={changeSpeed} aria-label="Playback speed">
              <small>{speed}x</small>
            </button>
            <button type="button" onClick={() => void leaveFullscreen()} aria-label="Exit fullscreen">
              <FullscreenExitRoundedIcon />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StreamFullscreenFrame;
