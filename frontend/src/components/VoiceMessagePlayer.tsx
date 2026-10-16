import "./ChatMessageMedia.css";
import { useEffect, useRef, useState } from "react";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import {
  audioWaveform,
  formatAudioTime,
  getMessageBlob,
} from "../lib/chatMedia";
import type { ChatMessage } from "../types/marketplace";

let playbackIntent = 0;
const PLAY_EVENT = "smaj:voice-play";
type Props = {
  message: ChatMessage;
  owner: string;
  mine: boolean;
  avatar?: string;
  name: string;
};
export default function VoiceMessagePlayer({
  message,
  owner,
  mine,
  avatar,
  name,
}: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef("");
  const completed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [duration, setDuration] = useState(message.audioDurationSeconds || 0);
  const [wave, setWave] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = audio.current;
    const pauseOther = (event: Event) => {
      if ((event as CustomEvent).detail !== audio.current)
        audio.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, pauseOther);
    return () => {
      window.removeEventListener(PLAY_EVENT, pauseOther);
      controller.current?.abort();
      element?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  const play = async () => {
    if (!audio.current || busy) return;
    if (!audio.current.paused) {
      audio.current.pause();
      return;
    }
    const intent = ++playbackIntent;
    setError("");
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    try {
      if (!objectUrl.current) {
        const blob = await getMessageBlob(owner, message, request.signal);
        if (request.signal.aborted || !audio.current) return;
        objectUrl.current = URL.createObjectURL(blob);
        audio.current.src = objectUrl.current;
        void audioWaveform(blob).then((samples) => {
          if (!request.signal.aborted) setWave(samples);
        });
      }
      if (intent !== playbackIntent) return;
      if (audio.current.ended) audio.current.currentTime = 0;
      window.dispatchEvent(
        new CustomEvent(PLAY_EVENT, { detail: audio.current }),
      );
      await audio.current.play();
    } catch (reason) {
      if (!request.signal.aborted)
        setError(
          reason instanceof Error && !navigator.onLine
            ? reason.message
            : "Voice note could not play. Tap play to retry.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  return (
    <div
      className={`voice-player${mine ? " voice-player-mine" : ""}`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <span className="voice-player-avatar">
        {avatar ? (
          <img src={avatar} alt={name} />
        ) : (
          <span aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>
        )}
        <MicNoneOutlinedIcon aria-hidden="true" />
      </span>
      <button
        type="button"
        className="voice-player-play"
        aria-label={
          busy
            ? "Loading voice note"
            : playing
              ? "Pause voice note"
              : "Play voice note"
        }
        disabled={busy}
        onClick={() => void play()}
      >
        {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
      </button>
      <div className="voice-player-track">
        <div className="voice-player-wave" aria-hidden="true">
          {Array.from({ length: 32 }, (_, i) => (
            <i
              key={i}
              className={
                elapsed !== null && duration > 0 && i / 32 <= elapsed / duration
                  ? "played"
                  : ""
              }
              style={{ height: `${wave ? 5 + wave[i] * 25 : 10}px` }}
            />
          ))}
        </div>
        <input
          type="range"
          aria-label="Seek voice note"
          min="0"
          max={duration || 1}
          step="0.1"
          value={elapsed || 0}
          disabled={!objectUrl.current}
          onChange={(event) => {
            const value = Number(event.target.value);
            completed.current = false;
            if (audio.current) audio.current.currentTime = value;
            setElapsed(value);
          }}
        />
        <time
          aria-label={
            elapsed === null ? "Voice note duration" : "Playback position"
          }
        >
          {formatAudioTime(elapsed ?? duration)}
        </time>
      </div>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => {
          completed.current = false;
          setPlaying(true);
          setElapsed(audio.current?.currentTime || 0);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => { if (!completed.current) setElapsed(audio.current?.currentTime || 0); }}
        onLoadedMetadata={() => {
          const value = audio.current?.duration;
          if (value && Number.isFinite(value)) setDuration(value);
        }}
        onEnded={() => {
          completed.current = true;
          setPlaying(false);
          setElapsed(null);
        }}
        onError={() => {
          setPlaying(false);
          setError("Voice note could not play. Tap play to retry.");
        }}
      />
      {error ? (
        <small className="voice-player-error" role="status">
          {error}
        </small>
      ) : null}
    </div>
  );
}
