import "./StreamSkeleton.css";

type Props = { variant?: "cards" | "rows" | "channel" | "metrics" | "form" | "player"; label?: string };
const StreamSkeleton = ({ variant = "cards", label = "Loading content" }: Props) => (
  <div className={`sw-skeleton sw-skeleton-${variant}`} role="status" aria-label={label} aria-busy="true">
    {variant === "player" || variant === "channel" ? <div className="sw-skeleton-cover" /> : null}
    {variant === "channel" ? <div className="sw-skeleton-identity"><i /><span><b /><b /></span></div> : null}
    {variant === "metrics" ? <div className="sw-skeleton-metrics">{Array.from({ length: 4 }, (_, i) => <div key={i}><b /><b /><b /></div>)}</div> : null}
    {variant === "rows" ? <div className="sw-skeleton-rows">{Array.from({ length: 5 }, (_, i) => <div key={i}><i /><span><b /><b /></span></div>)}</div> : null}
    {variant === "rows" ? null : variant === "cards" ? <div className="sw-skeleton-cards">{Array.from({ length: 6 }, (_, i) => <div key={i}><i /><b /><b /></div>)}</div> : <div className="sw-skeleton-panel"><b /><b /><b /><b /></div>}
  </div>
);
export default StreamSkeleton;
