import { Capacitor } from "@capacitor/core";
import StreamFullscreenFrame from "./StreamFullscreenFrame";
import StreamSkeleton from "./StreamSkeleton";
import { startStreamPlaybackTracking } from "../../lib/streamPlaybackTracking";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Link } from "react-router-dom";
import { getLivePlayback } from "../../lib/streamLive";

type LivePlayback = Awaited<ReturnType<typeof getLivePlayback>>;

const StreamLivePlayer = ({ id }: { id: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const loadedIdRef = useRef("");
  const [live, setLive] = useState<LivePlayback | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setState("loading"); });
    void getLivePlayback(id).then(data => {
      if (!active) return;
      loadedIdRef.current = id;
      setLive(data);
      setState("ready");
    }).catch(error => {
      if (!active) return;
      setMessage(error?.response?.data?.message || "This broadcast is not live yet.");
      setState("error");
    });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !live?.playbackUrl) return;
    let active = true;
    let hls: Hls | null = null;
    if (element.canPlayType("application/vnd.apple.mpegurl")) element.src = live.playbackUrl;
    else if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3 });
      hls.loadSource(live.playbackUrl);
      hls.attachMedia(element);
    } else queueMicrotask(() => {
      if (!active) return;
      setMessage("This browser cannot play the live stream.");
      setState("error");
    });
    return () => { active = false; hls?.destroy(); };
  }, [live]);
  useEffect(() => {
    if (!live || state !== "ready" || loadedIdRef.current !== id) return;
    return startStreamPlaybackTracking(id, () => {
      const element = videoRef.current;
      return element ? { position: element.currentTime, playing: !element.paused && !element.ended && element.readyState >= 3, seeking: element.seeking, rate: element.playbackRate } : null;
    });
  }, [id, live, state]);
  if (state === "loading") return <StreamSkeleton variant="player" label="Loading live stream" />;
  if (state === "error" || !live) return <section className="sw-player-state error"><h1>Stream offline</h1><p>{message}</p><Link to="/app/services/stream/live">Back to Live</Link></section>;
  const native = Capacitor.isNativePlatform();
  const media = <><video ref={videoRef} controls={native} autoPlay playsInline poster={live.thumbnailUrl || undefined}/><span className="sw-live-badge-player">LIVE</span></>;
  return <section className="sw-watch real">
    {native ? <div className="sw-real-player">{media}</div> : <StreamFullscreenFrame className="sw-real-player" title={live.title} mediaRef={videoRef}>{media}</StreamFullscreenFrame>}
    <div className="sw-watch-info"><div><h1>{live.title}</h1><p>{live.creatorName} - Live on SMAJ Stream</p></div></div>
  </section>;
};

export default StreamLivePlayer;
