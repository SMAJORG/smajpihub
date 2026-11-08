import type { MouseEvent } from "react";
import { chatLinkParts, openChatUrl } from "../lib/chatLinks";
import "./ChatMessageText.css";

export default function ChatMessageText({ text }: { text: string }) {
  const open = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.stopPropagation();
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const opening = openChatUrl(href);
    if (!opening) return;
    event.preventDefault();
    // Older Pi Browser versions may expose the method but reject it. Keep
    // navigation to the real, validated URL available instead of doing nothing.
    void opening.catch(() => window.location.assign(href));
  };
  return <>{chatLinkParts(text).map((part, index) => part.href ? (
    <a key={index} className="chat-message-link" href={part.href} target="_blank" rel="noopener noreferrer"
      onClick={event => open(event, part.href!)}
      onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()}
      onTouchStart={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>{part.text}</a>
  ) : part.text)}</>;
}
