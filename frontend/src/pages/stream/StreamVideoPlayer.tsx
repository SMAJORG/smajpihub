import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Link } from "react-router-dom";
import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded";
import PictureInPictureAltRoundedIcon from "@mui/icons-material/PictureInPictureAltRounded";
import { Capacitor } from "@capacitor/core";
import { SmajMedia } from "../../native/smajMedia";
import StreamFullscreenFrame from "./StreamFullscreenFrame";
import {
  getStreamPlayback,
  getStreamProgress,
  saveStreamProgress,
  type StreamPlaybackVideo,
} from "../../lib/streamPlayback";

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};
type YouTubePlayerEvent = { target: YouTubePlayer; data: number };
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number>;
      events: { onReady: (event: YouTubePlayerEvent) => void; onStateChange: (event: YouTubePlayerEvent) => void };
    }
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

let youtubeApiPromise: Promise<YouTubeApi> | null = null;
const loadYouTubeApi = () => {
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const youtubeWindow = window as typeof window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
    if (youtubeWindow.YT?.Player) {
      resolve(youtubeWindow.YT);
      return;
    }
    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
      else reject(new Error("YouTube player API did not initialize."));
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("YouTube player API could not load."));
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
};

const StreamVideoPlayer = ({ id }: { id: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef(0);
  const [video, setVideo] = useState<StreamPlaybackVideo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setState("loading");
    void Promise.all([getStreamPlayback(id), getStreamProgress(id).catch(() => null)])
      .then(([playback, progress]) => {
        setVideo(playback);
        lastSavedRef.current = progress?.position || 0;
        setState("ready");
      })
      .catch(error => {
        setMessage(error?.response?.data?.message || "This title is not available for playback.");
        setState("error");
      });
  }, [id]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !video?.playbackUrl || !["hls", "mp4"].includes(video.sourceType)) return;
    let hls: Hls | null = null;
    const resume = () => {
      if (lastSavedRef.current > 0 && lastSavedRef.current < element.duration - 15)
        element.currentTime = lastSavedRef.current;
    };
    const fail = (reason: string) => {
      setMessage(reason);
      setState("error");
      hls?.destroy();
    };
    let networkRecoveries = 0;
    let mediaRecoveries = 0;
    const onElementError = () => {
      if (hls) return;
      const code = element.error?.code;
      fail(
        code === MediaError.MEDIA_ERR_NETWORK
          ? "The video could not load. Check your connection and retry."
          : code === MediaError.MEDIA_ERR_DECODE
            ? "This video could not be decoded."
            : code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
              ? "The playback source is not supported by this browser."
              : "This video could not be played."
      );
    };
    element.addEventListener("loadedmetadata", resume, { once: true });
    element.addEventListener("error", onElementError);
    if (video.sourceType === "mp4") element.src = video.playbackUrl;
    else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(video.playbackUrl!));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
          networkRecoveries += 1;
          hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries += 1;
          hls?.recoverMediaError();
          return;
        }
        fail(`Cloudflare Stream playback failed (${data.details}). Retry in a moment.`);
      });
      hls.attachMedia(element);
    } else if (element.canPlayType("application/vnd.apple.mpegurl")) element.src = video.playbackUrl;
    else fail("This browser cannot play HLS video.");
    return () => {
      element.removeEventListener("loadedmetadata", resume);
      element.removeEventListener("error", onElementError);
      hls?.destroy();
    };
  }, [video]);

  useEffect(() => {
    const target = youtubeRef.current;
    if (!target || video?.sourceType !== "youtube" || !video.youtubeVideoId) return;
    let active = true;
    let player: YouTubePlayer | null = null;
    let timer: number | null = null;
    let lastPosition = lastSavedRef.current;
    const save = (force = false, completed = false) => {
      if (!player || typeof player.getCurrentTime !== "function" || typeof player.getDuration !== "function") return;
      const position = Math.max(0, Number(player.getCurrentTime()) || 0);
      const duration = Math.max(0, Number(player.getDuration()) || 0);
      if (!duration || (!force && Math.abs(position - lastPosition) < 10)) return;
      lastPosition = position;
      lastSavedRef.current = position;
      void saveStreamProgress(id, {
        title: video.title,
        thumbnailUrl: video.thumbnailUrl || null,
        position,
        duration,
        completed,
      }).catch(() => active && setMessage("Watch progress could not synchronize. Check your connection and sign-in."));
    };
    void loadYouTubeApi()
      .then(YT => {
        if (!active) return;
        player = new YT.Player(target, {
          videoId: video.youtubeVideoId!,
          playerVars: { rel: 0, playsinline: 1 },
          events: {
            onReady: event => {
              player = event.target;
              if (typeof player.getCurrentTime !== "function" || typeof player.getDuration !== "function") {
                setMessage("The YouTube player is not ready yet. Please reload the video.");
                return;
              }
              const duration = player.getDuration();
              if (
                typeof player.seekTo === "function" &&
                lastSavedRef.current > 0 &&
                lastSavedRef.current < duration - 15
              )
                player.seekTo(lastSavedRef.current, true);
              timer = window.setInterval(() => save(), 10_000);
            },
            onStateChange: event => {
              player = event.target;
              if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) save(true);
              if (event.data === YT.PlayerState.ENDED) save(true, true);
            },
          },
        });
      })
      .catch(() => active && setMessage("The YouTube player could not initialize."));
    return () => {
      save(true);
      active = false;
      if (timer !== null) window.clearInterval(timer);
      if (player && typeof player.destroy === "function") player.destroy();
    };
  }, [id, video]);

  const enterPictureInPicture = async () => {
    const element = videoRef.current;
    if (!element) return;
    try {
      if (Capacitor.isNativePlatform()) {
        await SmajMedia.enterPictureInPicture();
        return;
      }
      if (!document.pictureInPictureEnabled || typeof element.requestPictureInPicture !== "function")
        throw new Error("Picture-in-Picture is unsupported");
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await element.requestPictureInPicture();
    } catch {
      setMessage("Picture-in-Picture is not available in this Pi Browser or device.");
    }
  };
  const persist = (completed = false) => {
    const element = videoRef.current;
    if (!video || !element || !Number.isFinite(element.duration)) return;
    const position = element.currentTime;
    if (!completed && Math.abs(position - lastSavedRef.current) < 10) return;
    lastSavedRef.current = position;
    void saveStreamProgress(id, {
      title: video.title,
      thumbnailUrl: video.thumbnailUrl || null,
      position,
      duration: element.duration,
      completed,
    }).catch(() => setMessage("Watch progress could not synchronize. Check your connection and sign-in."));
  };

  if (state === "loading")
    return (
      <section className="sw-player-state">
        <i />
        <h1>Preparing your video...</h1>
        <p>Checking playback rights and loading the stream.</p>
      </section>
    );
  if (state === "error" || !video)
    return (
      <section className="sw-player-state error">
        <h1>Video unavailable</h1>
        <p>{message}</p>
        <Link to="/app/services/stream">Browse available entertainment</Link>
      </section>
    );
  if (video.sourceType === "youtube" && video.youtubeVideoId)
    return (
      <section className="sw-watch real">
        <StreamFullscreenFrame className="sw-youtube-player" title={video.title}>
          <div ref={youtubeRef} title={video.title} />
        </StreamFullscreenFrame>
        {message ? <p className="sw-player-warning">{message}</p> : null}
        <div className="sw-watch-info">
          <div>
            <h1>{video.title}</h1>
            <p>{video.creatorName || "SMAJ Creator"} - Progress saves automatically</p>
          </div>
        </div>
      </section>
    );

  if (video.sourceType === "cloudflare" && video.iframeUrl)
    return (
      <section className="sw-watch real">
        <StreamFullscreenFrame className="sw-real-player sw-cloudflare-player" title={video.title}>
          <iframe
            src={video.iframeUrl}
            title={video.title}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
          <span className="sw-licensed-badge">AUTHORIZED STREAM</span>
        </StreamFullscreenFrame>
        <div className="sw-watch-info">
          <div>
            <h1>{video.title}</h1>
            <p>{video.creatorName || "SMAJ Stream"}</p>
          </div>
          <button type="button">
            <BookmarkRoundedIcon /> Save
          </button>
        </div>
        {video.description ? <p className="sw-watch-description">{video.description}</p> : null}
      </section>
    );
  return (
    <section className="sw-watch real">
      <StreamFullscreenFrame className="sw-real-player" title={video.title} mediaRef={videoRef}>
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          preload="metadata"
          poster={video.thumbnailUrl || undefined}
          onTimeUpdate={() => persist()}
          onPause={() => persist()}
          onEnded={() => persist(true)}
        />
        <div className="sw-player-screen-actions">
          <button
            className="sw-player-pip"
            type="button"
            onClick={() => void enterPictureInPicture()}
            aria-label="Picture in Picture"
            title="Picture in Picture"
          >
            <PictureInPictureAltRoundedIcon />
          </button>
        </div>
        <span className="sw-licensed-badge">AUTHORIZED STREAM</span>
        {message ? <p className="sw-player-warning">{message}</p> : null}
      </StreamFullscreenFrame>
      <div className="sw-watch-info">
        <div>
          <h1>{video.title}</h1>
          <p>{video.creatorName || "SMAJ Stream"} - Progress saves automatically</p>
        </div>
        <button type="button">
          <BookmarkRoundedIcon /> Save
        </button>
      </div>
      {video.description ? <p className="sw-watch-description">{video.description}</p> : null}
    </section>
  );
};

export default StreamVideoPlayer;
