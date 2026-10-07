import StreamSkeleton from "./StreamSkeleton";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { getStreamWatchHistory, type StreamWatchProgress } from "../../lib/streamPlayback";

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const StreamWatchHistory = () => {
  const [items, setItems] = useState<StreamWatchProgress[] | null>(null);
  useEffect(() => { void getStreamWatchHistory().then(setItems).catch(() => setItems([])); }, []);
  if (!items) return <StreamSkeleton variant="cards" label="Loading watch history..." />;
  return <><header className="sw-page-head"><span>YOUR STREAM</span><h1>Continue watching</h1><p>Your progress is synchronized securely across signed-in devices.</p></header>{items.length ? <section className="sw-history-grid">{items.map(item => <Link to={`/app/services/stream/watch/${item.videoId}`} key={item.videoId}><div style={item.thumbnailUrl ? { backgroundImage: `url(${item.thumbnailUrl})` } : undefined}><PlayArrowRoundedIcon /><i><b style={{ width: `${item.duration ? Math.min(100, (item.position / item.duration) * 100) : 0}%` }} /></i></div><h2>{item.title}</h2><p>{item.completed ? "Watched" : `${formatTime(item.position)} of ${formatTime(item.duration)}`}</p></Link>)}</section> : <div className="sw-catalog-status">Your watch history is empty. Start an authorized creator video and your progress will appear here.</div>}</>;
};

export default StreamWatchHistory;
