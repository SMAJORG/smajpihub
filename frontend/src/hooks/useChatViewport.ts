import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { readChatCache, writeChatCache } from "../lib/chatCache";
import type { ChatMessage } from "../types/marketplace";

export type ChatPosition = {
  atBottom: boolean;
  messageId?: string;
  offset: number;
  scrollTop: number;
};
export function captureChatPosition(node: HTMLElement): ChatPosition {
  const header =
    parseFloat(
      getComputedStyle(node.parentElement!).getPropertyValue(
        "--chat-header-height",
      ),
    ) || 76;
  const top = node.getBoundingClientRect().top + header + 8;
  const first = [
    ...node.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((item) => item.getBoundingClientRect().bottom > top);
  return {
    atBottom: node.scrollHeight - node.scrollTop - node.clientHeight < 90,
    messageId: first?.dataset.messageId,
    offset: first ? first.getBoundingClientRect().top - top : 0,
    scrollTop: node.scrollTop,
  };
}
export function applyChatPosition(node: HTMLElement, position: ChatPosition) {
  if (position.atBottom) {
    node.scrollTop = node.scrollHeight;
    return;
  }
  const anchor = [
    ...node.querySelectorAll<HTMLElement>("[data-message-id]"),
  ].find((item) => item.dataset.messageId === position.messageId);
  if (anchor) {
    const header =
      parseFloat(
        getComputedStyle(node.parentElement!).getPropertyValue(
          "--chat-header-height",
        ),
      ) || 76;
    const top = node.getBoundingClientRect().top + header + 8;
    node.scrollTop +=
      anchor.getBoundingClientRect().top - top - position.offset;
  } else node.scrollTop = position.scrollTop;
}

export function useChatViewport(
  owner: string | undefined,
  id: string | undefined,
  open: boolean,
  messages: ChatMessage[],
  container: RefObject<HTMLDivElement | null>,
  nearBottom: RefObject<boolean>,
  showJump: (show: boolean) => void,
) {
  const positions = useRef(new Map<string, ChatPosition>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const position = useCallback(() => {
    if (!id) return null;
    let saved = positions.current.get(id);
    if (!saved) {
      saved = readChatCache(owner, "position:" + id, {
        atBottom: true,
        offset: 0,
        scrollTop: 0,
      });
      positions.current.set(id, saved);
    }
    return saved;
  }, [owner, id]);
  const restore = useCallback(() => {
    const node = container.current,
      saved = position();
    if (!open || !node || !saved) return;
    applyChatPosition(node, saved);
    nearBottom.current = saved.atBottom;
    showJump(!saved.atBottom);
  }, [container, nearBottom, open, position, showJump]);
  const save = useCallback(() => {
    if (!id || !container.current || !open) return;
    const saved = captureChatPosition(container.current);
    positions.current.set(id, saved);
    writeChatCache(owner, "position:" + id, saved);
  }, [owner, id, open, container]);
  useLayoutEffect(() => {
    const node = container.current;
    const thread = id;
    if (!open || !node || !thread) return;
    restore();
    const cache = positions.current;
    return () => {
      const saved = cache.get(thread) || captureChatPosition(node);
      cache.set(thread, saved);
      writeChatCache(owner, "position:" + thread, saved);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // Restore once when entering; message/resize restoration is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, id, open]);
  useLayoutEffect(() => {
    const node = container.current;
    if (!open || !node) return;
    restore();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(restore);
    observer.observe(node);
    node
      .querySelectorAll("[data-message-id]")
      .forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [container, open, messages, restore]);
  const onScroll = useCallback(() => {
    if (!id || !open || !container.current) return;
    const saved = captureChatPosition(container.current);
    positions.current.set(id, saved);
    nearBottom.current = saved.atBottom;
    showJump(!saved.atBottom);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => writeChatCache(owner, "position:" + id, saved),
      160,
    );
  }, [container, id, open, owner, nearBottom, showJump]);
  const jump = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const node = container.current;
      if (!node || !id) return;
      positions.current.set(id, {
        atBottom: true,
        offset: 0,
        scrollTop: node.scrollHeight,
      });
      nearBottom.current = true;
      showJump(false);
      node.scrollTo({ top: node.scrollHeight, behavior });
    },
    [container, id, nearBottom, showJump],
  );
  return { onScroll, restore, save, jump };
}
