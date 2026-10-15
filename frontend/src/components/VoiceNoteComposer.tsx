import { useRef, useState } from "react";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

type Props = { recording: boolean; paused: boolean; seconds: number; previewUrl?: string; busy: boolean; onPause: () => void; onResume: () => void; onDelete: () => void; onSend: () => void };
export default function VoiceNoteComposer({recording, paused, seconds, previewUrl, busy, onPause, onResume, onDelete, onSend}: Props) {
 const audio = useRef<HTMLAudioElement>(null);
 const [playing, setPlaying] = useState(false);
 const play = () => { if (!audio.current) return; if (audio.current.paused) void audio.current.play().catch(() => setPlaying(false)); else audio.current.pause(); };
 return <div className="voice-note-composer" aria-label="Voice note composer">
   <div className="voice-note-track">
     {(!recording || paused) && previewUrl ? <button type="button" aria-label={playing ? "Pause preview" : "Play preview"} onClick={play} disabled={busy}>{playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}</button> : null}
     <time aria-live="off">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</time>
     <div className={recording && !paused ? "voice-note-wave active" : "voice-note-wave"} aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i} style={{height:8+(i*13%27),animationDelay:(i%7)*80+"ms"}} />)}</div>
   </div>
   {previewUrl ? <audio ref={audio} src={previewUrl} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}><track kind="captions" /></audio> : null}
   <div className="voice-note-actions">
     <button type="button" className="voice-note-delete" onClick={onDelete} disabled={busy} aria-label="Delete voice note"><DeleteOutlineRoundedIcon /></button>
     {recording ? <button type="button" className={paused ? "voice-note-toggle paused" : "voice-note-toggle"} onClick={() => { audio.current?.pause(); if (paused) onResume(); else onPause(); }} disabled={busy}>{paused ? <MicNoneOutlinedIcon /> : <PauseRoundedIcon />}{paused ? "Resume" : "Pause"}</button> : <span className="voice-note-ready">Ready to send</span>}
     <button type="button" className="voice-note-send" onClick={onSend} disabled={busy} aria-label="Send voice note"><SendRoundedIcon /></button>
   </div>
 </div>;
}
