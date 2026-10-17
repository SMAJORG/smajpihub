import type { ChatMessage } from "../types/marketplace";
import "./MessageDeliveryStatus.css";
export default function MessageDeliveryStatus({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  if (message.deliveryState === "failed") return <button type="button" className="message-send-retry" aria-label="Retry sending message" onClick={onRetry}>Retry</button>;
  if (message.deliveryState) return <span className="message-waiting" role="status" aria-label="Waiting to send" title="Waiting to send"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M10 5v5h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span>;
  return <span className={"message-checks " + (message.readAt ? "read" : "sent")} aria-label={message.readAt ? "Read" : "Sent"}>{message.readAt ? "\u2713\u2713" : "\u2713"}</span>;
}
