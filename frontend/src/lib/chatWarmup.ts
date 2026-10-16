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

export function createChatWarmup(options: {
  read: (id: string) => ChatMessage[] | null | undefined;
  fetch: (id: string, signal: AbortSignal) => Promise<ChatMessage[]>;
  save: (id: string, messages: ChatMessage[]) => void;
  current: () => boolean;
}) {
  const queue: string[] = [];
  const requests = new Map<string, AbortController>();
  let disposed = false;
  const pump = () => {
    while (!disposed && options.current() && requests.size < 2 && queue.length) {
      const id = queue.shift()!;
      if (options.read(id) || requests.has(id) || id.startsWith("draft:")) continue;
      const controller = new AbortController(); requests.set(id, controller);
      void options.fetch(id, controller.signal).then(messages => {
        if (!disposed && options.current() && !controller.signal.aborted && !options.read(id)) options.save(id, messages);
      }).catch(() => undefined).finally(() => { requests.delete(id); pump(); });
    }
  };
  return {
    enqueue(ids: string[], priority = false) {
      if (disposed) return;
      for (const id of ids) {
        const position = queue.indexOf(id);
        if (position >= 0) { if (!priority) continue; queue.splice(position, 1); }
        if (priority) queue.unshift(id); else queue.push(id);
      }
      pump();
    },
    dispose() { disposed = true; queue.length = 0; requests.forEach(controller => controller.abort()); },
  };
}
