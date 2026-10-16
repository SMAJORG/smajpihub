import type { ChatMessage } from "../types/marketplace";
// Bounded background reads never block navigation and never mark a chat as read.
export async function warmChatHistory(ids: string[], options: {
  read: (id: string) => ChatMessage[] | null | undefined;
  fetch: (id: string) => Promise<ChatMessage[]>;
  save: (id: string, messages: ChatMessage[]) => void;
  current: () => boolean;
}) {
  const queue = [...new Set(ids)].filter(id => !id.startsWith("draft:") && !options.read(id));
  const worker = async () => {
    while (queue.length && options.current()) {
      const id = queue.shift()!;
      try {
        const messages = await options.fetch(id);
        // An active chat may have loaded or sent messages while this preview was in flight.
        if (options.current() && !options.read(id)) options.save(id, messages);
      } catch { /* Offline or unavailable previews must not interrupt the inbox. */ }
    }
  };
  await Promise.all([worker(), worker()]);
}
