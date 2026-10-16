import type { ChatMessage } from "../types/marketplace";
export type HistoryPage = { messages: ChatMessage[]; nextCursor?: string | null };
// Fetch recent history first. On reconnect, fill pages back to the newest saved message.
export async function fetchChatHistory<T extends HistoryPage>(fetchPage: (before?: string) => Promise<T>, newestKnown: string | undefined, current: () => boolean): Promise<T | null> {
  const result = await fetchPage();
  if (!current()) return null;
  let cursor = result.nextCursor;
  while (newestKnown && cursor && result.messages[0]?._id > newestKnown) {
    const page = await fetchPage(cursor);
    if (!current()) return null;
    result.messages = [...page.messages, ...result.messages];
    if (page.nextCursor === cursor) throw new Error("History cursor did not advance");
    cursor = page.nextCursor;
  }
  return { ...result, nextCursor: cursor };
}
