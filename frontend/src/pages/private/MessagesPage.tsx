import VoiceMessagePlayer from "../../components/VoiceMessagePlayer";
import ChatMessageAttachment from "../../components/ChatMessageAttachment";
import { createChatWarmup } from "../../lib/chatWarmup";
import { fetchChatHistory } from "../../lib/chatHistory";
import { readChatCache, writeChatCache, mergeChatMessages, savedChatHistory } from "../../lib/chatCache";
import { ensureVoicePermission, voiceRecordingError } from "../../lib/voiceRecording";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import SentimentSatisfiedAltOutlinedIcon from "@mui/icons-material/SentimentSatisfiedAltOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import FullscreenOutlinedIcon from "@mui/icons-material/FullscreenOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { axiosClient } from "../../lib/axiosClient";
import { useAuthContext } from "../../contexts/AuthContext";
import type { ChatMessage, Conversation } from "../../types/marketplace";
import TrustBadge from "../../components/TrustBadge";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import VoiceNoteComposer from "../../components/VoiceNoteComposer";
import ChatAttachmentSheet from "../../components/ChatAttachmentSheet";
import { VoiceRecordingClock } from "../../lib/voiceRecordingClock";
import { uploadImage } from "../../lib/uploadImage";

type RichConversation = Conversation & {
  profileImage?: string;
  online?: boolean;
  displayTime?: string;
};

type VoicePreview = {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSeconds: number;
};

type PendingPhoto = {
  file: File;
  url: string;
  dataUrl: string;
};

type ImagePreview = {
  src: string;
  caption?: string;
  message: ChatMessage;
};

const getConversationName = (conversation: RichConversation, currentUserId?: string) =>
  conversation.participantName || (conversation.sellerId === currentUserId ? conversation.buyerName : conversation.sellerName) || "SMAJ user";

const getConversationInitial = (conversation: RichConversation, currentUserId?: string) =>
  getConversationName(conversation, currentUserId).slice(0, 1).toUpperCase();

const getConversationRoleLabel = (conversation: RichConversation, currentUserId?: string) =>
  conversation.sellerId === currentUserId ? "Buyer" : "Seller";

const getConversationMeta = (conversation: RichConversation, currentUserId?: string) =>
  [
    getConversationRoleLabel(conversation, currentUserId),
    conversation.lastMessage || "No messages yet",
    conversation.productTitle,
  ].filter(Boolean).join(" · ");

const isConversationOnline = (conversation: RichConversation) => Boolean(conversation.online && (!conversation.presenceExpiresAt || new Date(conversation.presenceExpiresAt).getTime() > Date.now()));

const formatLastSeen = (conversation: RichConversation) => {
  if (isConversationOnline(conversation)) return "Online";
  const value = conversation.lastSeenAt;
  if (!value) return "Offline";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Offline";
  if (Date.now() - then < 60000) return "Last seen just now";
  const diffMinutes = Math.max(1, Math.floor((Date.now() - then) / 60000));
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  return `Last seen ${new Date(value).toLocaleDateString()}`;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CHAT_VIDEO_BYTES = 2_500_000;
const MAX_CHAT_DOCUMENT_BYTES = 3 * 1024 * 1024;

const MessagesPageContent = () => {
  const { user } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState<RichConversation[]>(() => readChatCache(user?.uid, "inbox", []));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(() => !readChatCache<RichConversation[]>(user?.uid, "inbox", []).length);
  const [connectionState, setConnectionState] = useState(navigator.onLine ? "syncing" : "offline");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const recordingClockRef = useRef<VoiceRecordingClock | null>(null);
  const sendAfterStopRef = useRef(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [pendingPhotoCaption, setPendingPhotoCaption] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [imagePreviewFullscreen, setImagePreviewFullscreen] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [inboxError, setInboxError] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Spam or scam");
  const [inboxFilter, setInboxFilter] = useState<"inbox" | "archived">("inbox");
  const [sendingVoice, setSendingVoice] = useState(false);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(() => new Set());
  const [touchSelectionEnabled, setTouchSelectionEnabled] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [deletingConversations, setDeletingConversations] = useState(false);
  const [conversationActionError, setConversationActionError] = useState("");
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const nearBottomRef = useRef(true);
  const typingTimeoutRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartingRef = useRef(false);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const keepRecordingRef = useRef(true);
  const longPressTimerRef = useRef<number | null>(null);
  const conversationLongPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const conversationLongPressTriggeredRef = useRef(false);
  const ignoreMousePressRef = useRef(false);
  const ignoreConversationMousePressRef = useRef(false);
  const recipientId = params.get("recipient");
  const selectedId = params.get("conversation") || (recipientId ? conversations.find(item => item.participantId === recipientId || (item.buyerId === user?.uid ? item.sellerId : item.buyerId) === recipientId)?._id || "draft:" + recipientId : null);
  const [chatFullscreen, setChatFullscreen] = useState(Boolean(selectedId));
  useEffect(() => {
    setChatFullscreen(Boolean(selectedId));
  }, [selectedId]);
  useEffect(() => {
    if (!chatFullscreen && !selectedId) return;
    const viewport = window.visualViewport;
    const updateChatViewport = () => {
      document.documentElement.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      window.requestAnimationFrame(() => {
        const messages = chatMessagesRef.current;
        if (messages && nearBottomRef.current) messages.scrollTop = messages.scrollHeight;
      });
    };
    updateChatViewport();
    viewport?.addEventListener("resize", updateChatViewport);
    viewport?.addEventListener("scroll", updateChatViewport);
    window.addEventListener("resize", updateChatViewport);
    return () => {
      viewport?.removeEventListener("resize", updateChatViewport);
      viewport?.removeEventListener("scroll", updateChatViewport);
      window.removeEventListener("resize", updateChatViewport);
      document.documentElement.style.removeProperty("--chat-viewport-height");
      document.documentElement.style.removeProperty("--chat-viewport-top");
    };
  }, [chatFullscreen, selectedId]);
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    return conversations.filter((item) => inboxFilter === "archived" ? item.archived : !item.archived).filter((item) => !query || [
      getConversationName(item, user?.uid),
      getConversationRoleLabel(item, user?.uid),
      item.productTitle,
      item.lastMessage,
      item.buyerName,
      item.sellerName,
    ].join(" ").toLowerCase().includes(query));
  }, [conversationSearch, conversations, inboxFilter, user?.uid]);
  const activeId = selectedId || filteredConversations[0]?._id;
  const messageCache = useRef(new Map<string, ChatMessage[]>());
  if (activeId && !messageCache.current.has(activeId)) {
    const cached = readChatCache<ChatMessage[] | null>(user?.uid, activeId, null);
    if (cached) messageCache.current.set(activeId, cached);
  }
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const messageRequest = useRef(0);
  const historyRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRetryAttempt = useRef(0);
  const historyRefresh = useRef<() => void>(() => undefined);
  const historyFlight = useRef<{ id: string; controller: AbortController; promise: Promise<void> } | null>(null);
  const inboxFlight = useRef<Promise<void> | null>(null);
  const inboxController = useRef<AbortController | null>(null);
  const inboxBootstrapped = useRef(false);
  const warmQueue = useRef<ReturnType<typeof createChatWarmup> | null>(null);
  const visibleChatIds = useRef(new Set<string>());
  const conversationListRef = useRef<HTMLElement>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  type Outgoing = { id: string; chatId: string; payload: Partial<ChatMessage>; recipient?: string };
  const outbox = useRef<Outgoing[]>(readChatCache(user?.uid, "outbox", []));
  const flushing = useRef(false);
  const refreshRef = useRef<() => void>(() => undefined);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [loadedMessageId, setLoadedMessageId] = useState<string>();
  const visibleMessages = loadedMessageId === activeId ? messages : messageCache.current.get(activeId || "") || [];
  useEffect(() => {
    if (loadedMessageId) {
      messageCache.current.set(loadedMessageId, messages);
      writeChatCache(user?.uid, loadedMessageId, messages.slice(-100));
    }
  }, [loadedMessageId, messages, user?.uid]);
  const pendingProductId = params.get("product") || undefined;
  const clearProductContext = () => {
    if (pendingProductId) setParams(current => { const next = new URLSearchParams(current); next.delete("product"); return next; }, { replace: true });
  };
  const active = useMemo(() => conversations.find((item) => item._id === activeId) || (selectedId ? readChatCache<RichConversation | null>(user?.uid, "conversation:" + selectedId, null) : null) || (recipientId ? { _id: "draft:" + recipientId, buyerId: user?.uid || "", sellerId: recipientId, participantId: recipientId, participantName: params.get("name") || "SMAJ user", profileImage: params.get("avatar") || "", productId: pendingProductId || "", productTitle: params.get("title") || "", productImage: params.get("image") || "", updatedAt: "" } : undefined), [activeId, conversations, params, pendingProductId, recipientId, selectedId, user?.uid]);
  const inboxIds = conversations.map(item => item._id).join(",");
  useEffect(() => {
    if (!user?.uid) return;
    const queue = createChatWarmup({
      read: id => savedChatHistory(user.uid, id, messageCache.current),
      fetch: async (id, signal) => {
        const { data } = await axiosClient.get<{ messages: ChatMessage[]; nextCursor: string | null }>("/messages/" + id, { params: { preview: "true", light: "1", limit: 12 }, signal, timeout: 10000, smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true", "X-SMAJ-Chat-Owner": user.uid } });
        if (!signal.aborted) writeChatCache(user.uid, "page:" + id, { nextCursor: data.nextCursor });
        return data.messages;
      },
      save: (id, history) => {
        messageCache.current.set(id, history);
        writeChatCache(user.uid, id, history.slice(-100));
        if (activeIdRef.current === id) { setMessages(history); setLoadedMessageId(id); }
      },
      current: () => alive.current && navigator.onLine,
    });
    warmQueue.current = queue;
    const reconnect = () => queue.enqueue([...visibleChatIds.current]);
    window.addEventListener("online", reconnect);
    return () => { queue.dispose(); warmQueue.current = null; window.removeEventListener("online", reconnect); };
  }, [user?.uid]);
  useEffect(() => {
    const list = conversationListRef.current;
    if (!list) return;
    const nodes = list.querySelectorAll<HTMLElement>("[data-conversation-id]");
    if (typeof IntersectionObserver === "undefined") { warmQueue.current?.enqueue(inboxIds.split(",").filter(Boolean)); return; }
    const visible = visibleChatIds.current;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.conversationId!;
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
      warmQueue.current?.enqueue([...visibleChatIds.current]);
    }, { rootMargin: "300px" });
    nodes.forEach(node => observer.observe(node));
    return () => { observer.disconnect(); visible.clear(); };
  }, [inboxIds, loadingConversations]);

  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    const header = panel.querySelector(":scope > header");
    const composer = panel.querySelector(":scope > form, :scope > .voice-note-composer");
    const update = () => {
      panel.style.setProperty("--chat-header-height", (header?.getBoundingClientRect().height || 76) + "px");
      panel.style.setProperty("--chat-composer-height", (composer?.getBoundingClientRect().height || 60) + "px");
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (header) observer?.observe(header);
    if (composer) observer?.observe(composer);
    window.addEventListener("resize", update);
    return () => { observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [chatFullscreen, activeId, recording, voicePreview]);
  const selectedMessages = useMemo(
    () => messages.filter((item) => selectedMessageIds.has(item._id) && !item.deletedForEveryone),
    [messages, selectedMessageIds]
  );
  const canDeleteSelectedForEveryone = selectedMessages.length > 0 && selectedMessages.every(
    (item) => item.senderId === user?.uid && Date.now() - new Date(item.createdAt).getTime() <= 15 * 60 * 1000
  );
  const selectedConversations = useMemo(
    () => conversations.filter((item) => selectedConversationIds.has(item._id)),
    [conversations, selectedConversationIds]
  );

  const archiveConversation = async (conversationId: string, archive: boolean) => {
    setMoreOpen(false);
    if (conversationId.startsWith("draft:")) return;
    try {
      const { data } = await axiosClient.patch<{ conversation?: RichConversation }>(`/messages/${conversationId}/archive`, { archive });
      if (data.conversation) {
        setConversations((current) => current.map((item) => item._id === conversationId ? { ...item, ...data.conversation } : item));
      }
      if (archive) setParams({});
      await loadConversations();
    } catch {
      setVoiceError("Could not update archive. Try again.");
    }
  };

  const submitConversationReport = async () => {
    if (!active) return;
    try {
      await axiosClient.post("/support", { source: "conversation-report", topic: "Safety report", message: `${reportReason}\nConversation: ${active._id}\nProduct: ${active.productTitle || "Not specified"}` });
      setReportOpen(false);
      setVoiceError("Report sent for review.");
    } catch {
      setVoiceError("Could not send the report. Try again.");
    }
  };

  const loadConversations = useCallback(() => {
    if (inboxFlight.current) return inboxFlight.current;
    const controller = new AbortController(); inboxController.current = controller;
    const request = (async () => {
      try {
        const { data } = await axiosClient.get<{ conversations: RichConversation[]; previews?: Record<string, { messages: ChatMessage[]; nextCursor: string | null }> }>("/messages", { params: { includePreviews: inboxBootstrapped.current ? "0" : "1" }, signal: controller.signal, smajSkipReadRetry: true, headers: { "X-SMAJ-Chat-Owner": user?.uid || "", "X-SMAJ-Silent": "true" } });
        if (!alive.current) return;
        for (const [id, page] of Object.entries(data.previews || {})) {
          const merged = mergeChatMessages(savedChatHistory(user?.uid, id, messageCache.current) || [], page.messages);
          messageCache.current.set(id, merged);
          writeChatCache(user?.uid, id, merged.slice(-100));
          writeChatCache(user?.uid, "page:" + id, { nextCursor: page.nextCursor });
        }
        inboxBootstrapped.current = true;
        setInboxError(false);
        for (const item of data.conversations || []) writeChatCache(user?.uid, "conversation:" + item._id, item);
        setConversations(data.conversations || []);
        writeChatCache(user?.uid, "inbox", data.conversations || []);
      } catch { if (alive.current && !controller.signal.aborted) setInboxError(true); }
      finally { if (alive.current) setLoadingConversations(false); }
    })().finally(() => { inboxFlight.current = null; });
    inboxFlight.current = request;
    return request;
  }, [user?.uid]);

  const loadMessages = useCallback(async () => {
    if (!selectedId && !chatFullscreen) return;
    if (!activeId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    if (activeId.startsWith("draft:")) { setMessages(messageCache.current.get(activeId) || []); setLoadedMessageId(activeId); setLoadingMessages(false); setHistoryCursor(null); return; }
    if (historyFlight.current?.id === activeId) return historyFlight.current.promise;
    historyFlight.current?.controller.abort();
    const controller = new AbortController();
    const request = ++messageRequest.current;
    const cached = savedChatHistory(user?.uid, activeId, messageCache.current);
    const run = async () => {
    setHistoryError("");
    setHistoryCursor(readChatCache<{ nextCursor: string | null }>(user?.uid, "page:" + activeId, { nextCursor: null }).nextCursor);
    setLoadingMessages(!cached);
    if (cached) { setMessages(cached); setLoadedMessageId(activeId); }
    try {
      const confirmed = cached?.filter(item => !item.deliveryState) || [];
      const newestKnown = confirmed[confirmed.length - 1]?._id;
      const data = await fetchChatHistory(async before => {
        const response = await axiosClient.get<{ conversation?: RichConversation; messages: ChatMessage[]; nextCursor?: string }>(`/messages/${activeId}`, { params: { before, light: "1" }, signal: controller.signal, timeout: 10000, smajSkipReadRetry: true, headers: { "X-SMAJ-Chat-Owner": user?.uid || "", "X-SMAJ-Silent": "true" } });
        return response.data;
      }, newestKnown, () => alive.current && !controller.signal.aborted && request === messageRequest.current && activeIdRef.current === activeId);
      if (!data) return;
      if (!alive.current) return;
      if (historyRetryTimer.current) clearTimeout(historyRetryTimer.current);
      historyRetryAttempt.current = 0;
      setConnectionState("live");
      const history = messageCache.current.get(activeId) || [];
      const oldest = data.messages?.[0]?._id;
      const retained = history.filter(item => item.deliveryState || (oldest && item._id < oldest));
      const merged = mergeChatMessages(retained, data.messages || []);
      messageCache.current.set(activeId, merged);
      writeChatCache(user?.uid, activeId, merged.slice(-100));
      if (activeIdRef.current !== activeId) return;
      setHistoryCursor(data.nextCursor || null);
      writeChatCache(user?.uid, "page:" + activeId, { nextCursor: data.nextCursor || null });
      setMessages(merged);
      setLoadedMessageId(activeId);
      if (data.conversation) {
        const conversation = data.conversation;
        writeChatCache(user?.uid, "conversation:" + conversation._id, conversation);
        setConversations(current => current.some(item => item._id === conversation._id)
          ? current.map(item => item._id === conversation._id ? { ...item, ...conversation } : item)
          : [conversation, ...current]);
      }
    } catch (error) {
      if (!alive.current || controller.signal.aborted || request !== messageRequest.current || activeIdRef.current !== activeId) return;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403 || status === 404) {
        setHistoryError(status === 401 ? "Please sign in again to open this chat." : "This conversation is unavailable.");
        if (status !== 401) { messageCache.current.delete(activeId); writeChatCache(user?.uid, activeId, []); setMessages([]); setLoadedMessageId(activeId); }
      }
      else if (!messageCache.current.get(activeId)?.length) setHistoryError(navigator.onLine ? "Messages could not load. Please retry." : "Connect to load this conversation.");
      else {
        setConnectionState(navigator.onLine ? "syncing" : "offline");
        if (historyRetryTimer.current) clearTimeout(historyRetryTimer.current);
        historyRetryTimer.current = setTimeout(() => { if (alive.current && !document.hidden && activeIdRef.current === activeId) historyRefresh.current(); }, Math.min(30000, 1000 * 2 ** historyRetryAttempt.current++));
      }
    } finally {
      if (alive.current && !controller.signal.aborted && request === messageRequest.current && activeIdRef.current === activeId) setLoadingMessages(false);
    }
    };
    const promise = run().finally(() => { if (historyFlight.current?.controller === controller) historyFlight.current = null; });
    historyFlight.current = { id: activeId, controller, promise };
    return promise;
  }, [activeId, selectedId, chatFullscreen, user?.uid]);

  historyRefresh.current = () => { void loadMessages(); };
  refreshRef.current = () => { void loadMessages(); void loadConversations(); };
  useEffect(() => {
    if (!recipientId || params.get("conversation")) return;
    const controller = new AbortController();
    axiosClient.get<{ conversation: RichConversation }>("/messages/direct/" + encodeURIComponent(recipientId), { signal: controller.signal }).then(({ data }) => {
      if (!alive.current || controller.signal.aborted) return;
      const conversation = { ...data.conversation, ...(pendingProductId ? { productId: pendingProductId, productTitle: params.get("title") || "", productImage: params.get("image") || "" } : {}) };
      writeChatCache(user?.uid, "conversation:" + conversation._id, conversation);
      setConversations(current => [conversation, ...current.filter(item => item._id !== conversation._id)]);
      if (!conversation._id.startsWith("draft:")) {
        const draftId = "draft:" + recipientId;
        const history = mergeChatMessages(savedChatHistory(user?.uid, conversation._id, messageCache.current) || [], savedChatHistory(user?.uid, draftId, messageCache.current) || []);
        messageCache.current.set(conversation._id, history);
        writeChatCache(user?.uid, conversation._id, history.slice(-100));
        outbox.current.forEach(item => { if (item.chatId === draftId) { item.chatId = conversation._id; delete item.recipient; } });
        writeChatCache(user?.uid, "outbox", outbox.current);
      }
      if (!conversation._id.startsWith("draft:")) setParams(current => { const next = new URLSearchParams(current); next.set("conversation", conversation._id); return next; }, { replace: true });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [recipientId, params, pendingProductId, setParams, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let stopped = false;
    let cursor = "";
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    let generation = 0;
    const synchronize = async (run = generation) => {
      if (stopped || run !== generation || document.hidden || !navigator.onLine) return;
      controller = new AbortController();
      try {
        const { data } = await axiosClient.get<{ cursor: string; conversations: RichConversation[] }>("/messages/sync", { params: { cursor }, timeout: 30000, signal: controller.signal, smajSkipReadRetry: true, headers: { "X-SMAJ-Silent": "true", "X-SMAJ-Chat-Owner": user?.uid || "" } });
        if (stopped || run !== generation) return;
        setConnectionState("live");
        const changed = cursor !== data.cursor;
        cursor = data.cursor;
        setConversations(data.conversations);
        writeChatCache(user.uid, "inbox", data.conversations);
        data.conversations.forEach(item => writeChatCache(user.uid, "conversation:" + item._id, item));
        if (changed) refreshRef.current();
        timer = setTimeout(() => void synchronize(run), 50);
      } catch { if (!stopped && run === generation) { setConnectionState(navigator.onLine ? "syncing" : "offline"); timer = setTimeout(() => void synchronize(run), 3000); } }
    };
    const reconnect = () => { setConnectionState(navigator.onLine ? "syncing" : "offline"); generation++; clearTimeout(timer); controller?.abort(); cursor = ""; void synchronize(); };
    void loadConversations().then(() => { if (!stopped) void synchronize(); });
    window.addEventListener("offline", reconnect);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); window.removeEventListener("offline", reconnect); window.removeEventListener("online", reconnect); document.removeEventListener("visibilitychange", reconnect); };
  }, [loadConversations, user?.uid]);

  const flushOutbox = useCallback(async () => {
    if (flushing.current || !navigator.onLine || !user?.uid) return;
    flushing.current = true;
    try {
      while (outbox.current.length) {
        const entry = outbox.current[0];
        if (!alive.current) break;
        try {
          const endpoint = entry.recipient ? "/messages/direct/" + encodeURIComponent(entry.recipient) : "/messages/" + entry.chatId;
          const { data } = await axiosClient.post<{ message: ChatMessage; conversation: RichConversation }>(endpoint, { ...entry.payload, clientMessageId: entry.id }, { headers: { "X-SMAJ-Silent": "true", "X-SMAJ-Chat-Owner": user.uid } });
          if (!alive.current) break;
          const id = data.message.conversationId;
          const history = mergeChatMessages(mergeChatMessages(messageCache.current.get(id) || [], messageCache.current.get(entry.chatId) || []), [data.message]);
          messageCache.current.set(entry.chatId, history);
          messageCache.current.set(id, history);
          writeChatCache(user.uid, id, history.slice(-100));
          writeChatCache(user.uid, "conversation:" + id, data.conversation);
          outbox.current = outbox.current.filter(item => item.id !== entry.id);
          outbox.current.forEach(item => { if (item.chatId === entry.chatId) { item.chatId = id; delete item.recipient; } });
          writeChatCache(user.uid, "outbox", outbox.current);
          if (activeIdRef.current === entry.chatId || activeIdRef.current === id) {
            setMessages(history); setLoadedMessageId(id);
            if (entry.recipient) setParams(current => { const next = new URLSearchParams(current); next.set("conversation", id); next.delete("product"); return next; }, { replace: true });
          }
          setConversations(current => [data.conversation, ...current.filter(item => item._id !== id && item._id !== entry.chatId)]);
          refreshRef.current();
        } catch (error) {
          if (!alive.current) break;
          const failed = (messageCache.current.get(entry.chatId) || []).map(item => item.clientMessageId === entry.id ? { ...item, deliveryState: "failed" as const } : item);
          messageCache.current.set(entry.chatId, failed);
          if (activeIdRef.current === entry.chatId) setMessages(failed);
          if (isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500 && ![401, 408, 409, 429].includes(error.response.status)) {
            outbox.current = outbox.current.filter(item => item.id !== entry.id);
            writeChatCache(user.uid, "outbox", outbox.current);
            setVoiceError(error.response.data?.message || "Message was rejected. Please try again.");
          }
          break;
        }
      }
    } finally { flushing.current = false; }
  }, [setParams, user?.uid]);
  useEffect(() => {
    const retry = () => { void flushOutbox(); };
    retry();
    const timer = window.setInterval(retry, 5000);
    window.addEventListener("online", retry);
    return () => { window.clearInterval(timer); window.removeEventListener("online", retry); };
  }, [flushOutbox]);

  const sendMessage = async (payload: Partial<ChatMessage>) => {
    if (!activeId || !user?.uid) return;
    const id = globalThis.crypto?.randomUUID?.() || "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const entry: Outgoing = { id, chatId: activeId, payload, ...(activeId.startsWith("draft:") ? { recipient: activeId.slice(6) } : {}) };
    const optimistic: ChatMessage = { ...payload, _id: id, clientMessageId: id, conversationId: activeId, senderId: user.uid, message: payload.message || (payload.messageType === "voice" ? "Voice message" : "Attachment"), createdAt: new Date().toISOString(), deliveryState: "pending" };
    const next = mergeChatMessages(messageCache.current.get(activeId) || [], [optimistic]);
    messageCache.current.set(activeId, next);
    setMessages(next); setLoadedMessageId(activeId);
    writeChatCache(user.uid, activeId, next.slice(-100));
    outbox.current.push(entry);
    if (!writeChatCache(user.uid, "outbox", outbox.current)) setVoiceError("Device storage is unavailable. Keep this chat open until your message is sent.");
    await flushOutbox();
  };

  useEffect(() => {
    historyFlight.current?.controller.abort();
    historyFlight.current = null;
    if (historyRetryTimer.current) clearTimeout(historyRetryTimer.current);
    historyRetryAttempt.current = 0;
    setHistoryError("");
    const initial = window.setTimeout(() => void loadMessages(), 0);
    const refresh = () => { if (!document.hidden) void loadMessages(); };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(initial);
      document.removeEventListener("visibilitychange", refresh);
      if (historyRetryTimer.current) clearTimeout(historyRetryTimer.current);
      historyFlight.current?.controller.abort();
      historyFlight.current = null;
    };
  }, [loadMessages]);

  useEffect(() => () => {
    keepRecordingRef.current = false;
    inboxController.current?.abort();
    sendAfterStopRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    if (conversationLongPressTimerRef.current) window.clearTimeout(conversationLongPressTimerRef.current);
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setTouchSelectionEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setText(readChatCache(user?.uid, "draft-text:" + activeId, ""));
    setSelectedMessageIds(new Set());
    setSelectedConversationIds(new Set());
  }, [activeId, user?.uid]);

  useEffect(() => {
    setSelectedMessageIds((current) => {
      const availableIds = new Set(messages.filter((item) => !item.deletedForEveryone).map((item) => item._id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [messages]);

  useEffect(() => {
    setSelectedConversationIds((current) => {
      const availableIds = new Set(filteredConversations.map((item) => item._id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredConversations]);

  const setTyping = useCallback((typing: boolean) => {
    if (!activeId || activeId.startsWith("draft:")) return;
    axiosClient.post(`/messages/${activeId}/typing`, { typing }).catch(() => undefined);
  }, [activeId]);

  const handleTextChange = (value: string) => {
    setText(value);
    if (activeId) writeChatCache(user?.uid, "draft-text:" + activeId, value);
    if (!value.trim()) {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      setTyping(false);
      return;
    }
    setTyping(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => setTyping(false), 1800);
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = chatMessagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  const loadOlder = async () => {
    if (!activeId || !historyCursor || loadingOlder) return;
    const id = activeId;
    const container = chatMessagesRef.current;
    const height = container?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const { data } = await axiosClient.get<{ messages: ChatMessage[]; nextCursor: string | null }>("/messages/" + id, { params: { before: historyCursor, light: "1" }, smajSkipReadRetry: true, headers: { "X-SMAJ-Chat-Owner": user?.uid || "", "X-SMAJ-Silent": "true" } });
      if (!alive.current || activeIdRef.current !== id) return;
      setMessages(mergeChatMessages(data.messages, messageCache.current.get(id) || []));
      setHistoryCursor(data.nextCursor);
      requestAnimationFrame(() => { if (container) container.scrollTop += container.scrollHeight - height; });
    } catch { setHistoryError("Earlier messages could not load. Please retry."); }
    finally { if (alive.current) setLoadingOlder(false); }
  };
  const handleChatScroll = () => {
    const container = chatMessagesRef.current;
    if (!container) return;
    const awayFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight > 90;
    nearBottomRef.current = !awayFromBottom;
    setShowScrollBottom(awayFromBottom);
  };

  useEffect(() => {
    nearBottomRef.current = true;
    const timer = window.setTimeout(() => setShowScrollBottom(false), 0);
    window.requestAnimationFrame(() => scrollToBottom("auto"));
    return () => window.clearTimeout(timer);
  }, [activeId, scrollToBottom]);

  useEffect(() => {
    if (nearBottomRef.current) window.requestAnimationFrame(() => scrollToBottom("auto"));
  }, [messages, scrollToBottom]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeId || !text.trim()) return;
    const message = text.trim();
    setText("");
    writeChatCache(user?.uid, "draft-text:" + activeId, "");
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    setTyping(false);
    nearBottomRef.current = true;
    await sendMessage({ message, productId: pendingProductId });
    clearProductContext();
  };

  const deleteMessage = async (scope: "me" | "everyone") => {
    if (!activeId || activeId.startsWith("draft:") || !deleteTarget || deleteTarget.deliveryState) return;
    setDeletingMessage(true);
    setVoiceError("");
    try {
      const { data } = await axiosClient.delete<{ hidden?: boolean; message?: ChatMessage }>(`/messages/${activeId}/messages/${deleteTarget._id}`, { data: { scope } });
      if (scope === "me" || data.hidden) setMessages((current) => current.filter((item) => item._id !== deleteTarget._id));
      else if (data.message) setMessages((current) => current.map((item) => item._id === data.message?._id ? data.message : item));
      setDeleteTarget(null);
      await loadConversations();
    } catch (err: unknown) {
      setVoiceError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Message could not be deleted." : "Message could not be deleted.");
    } finally {
      setDeletingMessage(false);
    }
  };

  const archiveSelectedConversations = async (archive: boolean) => {
    if (!selectedConversations.length) return;
    setVoiceError("");
    try {
      await Promise.all(selectedConversations.map((conversation) => axiosClient.patch(`/messages/${conversation._id}/archive`, { archive })));
      setSelectedConversationIds(new Set());
      setParams({});
      await loadConversations();
    } catch {
      setVoiceError("Could not update selected chats. Try again.");
    }
  };

  const deleteSelectedConversations = async () => {
    if (!selectedConversations.length) return;
    const count = selectedConversations.length;
    if (!window.confirm(`Delete ${count === 1 ? "this conversation" : `these ${count} conversations`}? It will be removed from your inbox.`)) return;
    setVoiceError("");
    setConversationActionError("");
    setDeletingConversations(true);
    try {
      await Promise.all(selectedConversations.map((conversation) => axiosClient.delete(`/messages/${conversation._id}`)));
      const selectedIds = new Set(selectedConversations.map((conversation) => conversation._id));
      setConversations((current) => current.filter((conversation) => !selectedIds.has(conversation._id)));
      setSelectedConversationIds(new Set());
      setParams({});
      setMessages([]);
    } catch {
      setConversationActionError("Could not delete. Please try again.");
    } finally {
      setDeletingConversations(false);
    }
  };

  const deleteSelectedMessages = async (scope: "me" | "everyone") => {
    if (!activeId || selectedMessages.length === 0) return;
    setDeletingMessage(true);
    setVoiceError("");
    try {
      const results = await Promise.all(selectedMessages.map((message) =>
        axiosClient.delete<{ hidden?: boolean; message?: ChatMessage }>(`/messages/${activeId}/messages/${message._id}`, { data: { scope } })
      ));
      const selectedIds = new Set(selectedMessages.map((message) => message._id));
      setMessages((current) => {
        let next = scope === "me"
          ? current.filter((item) => !selectedIds.has(item._id))
          : current;
        results.forEach(({ data }) => {
          if (data.hidden) next = next.filter((item) => !selectedIds.has(item._id));
          else if (data.message) next = next.map((item) => item._id === data.message?._id ? data.message : item);
        });
        return next;
      });
      setSelectedMessageIds(new Set());
      await loadConversations();
    } catch (err: unknown) {
      setVoiceError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Messages could not be deleted." : "Messages could not be deleted.");
    } finally {
      setDeletingMessage(false);
    }
  };

  const toggleSelectedMessage = (message: ChatMessage) => {
    if (message.deletedForEveryone) return;
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(message._id)) next.delete(message._id);
      else next.add(message._id);
      return next;
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const startMessageLongPress = (message: ChatMessage) => {
    if (!touchSelectionEnabled || message.deletedForEveryone) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setAttachOpen(false);
      setEmojiOpen(false);
      setReportOpen(false);
      setDeleteTarget(null);
      setSelectedMessageIds((current) => {
        if (current.has(message._id)) return current;
        return new Set([...current, message._id]);
      });
    }, 550);
  };

  const finishMessagePress = (message: ChatMessage, event: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>) => {
    if (!touchSelectionEnabled) return;
    clearLongPressTimer();
    if (selectedMessageIds.size > 0 && !message.deletedForEveryone) {
      event.preventDefault();
      toggleSelectedMessage(message);
      return;
    }
    if (longPressTriggeredRef.current) event.preventDefault();
  };

  const handleMessageMouseDown = (message: ChatMessage) => {
    if (ignoreMousePressRef.current) return;
    startMessageLongPress(message);
  };

  const handleMessageMouseUp = (message: ChatMessage, event: MouseEvent<HTMLElement>) => {
    if (ignoreMousePressRef.current) return;
    finishMessagePress(message, event);
  };

  const handleMessageTouchStart = (message: ChatMessage) => {
    ignoreMousePressRef.current = true;
    startMessageLongPress(message);
  };

  const handleMessageTouchEnd = (message: ChatMessage, event: TouchEvent<HTMLElement>) => {
    finishMessagePress(message, event);
    window.setTimeout(() => {
      ignoreMousePressRef.current = false;
    }, 700);
  };

  const toggleSelectedConversation = (conversation: RichConversation) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversation._id)) next.delete(conversation._id);
      else next.add(conversation._id);
      return next;
    });
  };

  const clearConversationLongPressTimer = () => {
    if (conversationLongPressTimerRef.current) window.clearTimeout(conversationLongPressTimerRef.current);
    conversationLongPressTimerRef.current = null;
  };

  const startConversationLongPress = (conversation: RichConversation) => {
    if (!touchSelectionEnabled) return;
    conversationLongPressTriggeredRef.current = false;
    clearConversationLongPressTimer();
    conversationLongPressTimerRef.current = window.setTimeout(() => {
      conversationLongPressTriggeredRef.current = true;
      setSelectedMessageIds(new Set());
      setSelectedConversationIds((current) => current.has(conversation._id) ? current : new Set([...current, conversation._id]));
    }, 550);
  };

  const finishConversationPress = (conversation: RichConversation, event: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>) => {
    if (!touchSelectionEnabled) return;
    clearConversationLongPressTimer();
    if (conversationLongPressTriggeredRef.current) {
      event.preventDefault();
      return;
    }
    if (selectedConversationIds.size > 0) {
      event.preventDefault();
      toggleSelectedConversation(conversation);
      return;
    }
  };

  const handleConversationMouseDown = (conversation: RichConversation) => {
    if (ignoreConversationMousePressRef.current) return;
    startConversationLongPress(conversation);
  };

  const handleConversationMouseUp = (conversation: RichConversation, event: MouseEvent<HTMLElement>) => {
    if (ignoreConversationMousePressRef.current) return;
    finishConversationPress(conversation, event);
    window.setTimeout(() => {
      conversationLongPressTriggeredRef.current = false;
    }, 700);
  };

  const handleConversationTouchStart = (conversation: RichConversation) => {
    ignoreConversationMousePressRef.current = true;
    startConversationLongPress(conversation);
  };

  const handleConversationTouchEnd = (conversation: RichConversation, event: TouchEvent<HTMLElement>) => {
    finishConversationPress(conversation, event);
    window.setTimeout(() => {
      conversationLongPressTriggeredRef.current = false;
      ignoreConversationMousePressRef.current = false;
    }, 700);
  };

  const clearVoicePreview = useCallback(() => {
    setVoicePreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const clearPendingPhoto = useCallback(() => {
    setPendingPhoto((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setPendingPhotoCaption("");
  }, []);

  useEffect(() => () => {
    clearPendingPhoto();
  }, [clearPendingPhoto]);

  useEffect(() => {
    if (!imagePreview) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setImagePreview(null); setImagePreviewFullscreen(false); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [imagePreview]);

  const preparePhotoAttachment = async (file: File | undefined) => {
    setAttachOpen(false);
    setVoiceError("");
    if (!file) return;
    const video = file.type.startsWith("video/");
    if ((!file.type.startsWith("image/") && !video) || file.size > (video ? MAX_CHAT_VIDEO_BYTES : MAX_CHAT_IMAGE_BYTES)) {
      setVoiceError(video ? "Choose a video smaller than 2.5 MB." : "Choose a JPG, PNG, WebP, or GIF photo that is 2 MB or smaller.");
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      clearPendingPhoto();
      setPendingPhoto({ file, dataUrl, url: URL.createObjectURL(file) });
    } catch {
      setVoiceError("Photo could not be opened. Try another image.");
    }
  };

  const sendPendingPhoto = async () => {
    if (!activeId || !pendingPhoto || sendingAttachment) return;
    setSendingAttachment(true);
    setVoiceError("");
    nearBottomRef.current = true;
    try {
      const video = pendingPhoto.file.type.startsWith("video/");
      const attachmentUrl = video ? "" : await uploadImage(pendingPhoto.dataUrl, "message-photos");
      await sendMessage({
        productId: pendingProductId,
        messageType: video ? "document" : "image",
        message: pendingPhotoCaption.trim(),
        ...(video ? { attachmentDataUrl: pendingPhoto.dataUrl } : { attachmentUrl }),
        attachmentName: pendingPhoto.file.name,
        attachmentMimeType: pendingPhoto.file.type,
        attachmentSize: pendingPhoto.file.size,
      });
      clearProductContext();
      clearPendingPhoto();
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Photo could not be sent. Try a smaller file.");
    } finally {
      setSendingAttachment(false);
    }
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  };

  const stopRecordingTracks = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (!activeId || recording || recordingStartingRef.current) return;
    clearVoicePreview();
    setVoiceError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice recording is not supported in this browser.");
      return;
    }
    recordingStartingRef.current = true;
    try {
      await ensureVoicePermission();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingClockRef.current = new VoiceRecordingClock();
      setRecordingPaused(false);
      sendAfterStopRef.current = false;
      keepRecordingRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
        if (recorder.state === "paused") {
          const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          setVoicePreview(current => {
            if (current) URL.revokeObjectURL(current.url);
            return { blob, url: URL.createObjectURL(blob), mimeType: blob.type, durationSeconds: Math.max(1, recordingClockRef.current?.seconds() || 0) };
          });
        }
      };

      recorder.onstop = () => {
        stopRecordingTimer();
        stopRecordingTracks();
        setRecording(false);
        const durationSeconds = Math.max(1, recordingClockRef.current?.seconds() || 0);
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (!keepRecordingRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setVoiceError("Could not capture audio. Please try again.");
          return;
        }
        const preview = { blob, url: URL.createObjectURL(blob), mimeType: blob.type || "audio/webm", durationSeconds };
        setVoicePreview(current => { if (current) URL.revokeObjectURL(current.url); return preview; });
        setRecordingPaused(false);
        if (sendAfterStopRef.current) { sendAfterStopRef.current = false; void sendVoiceNote(preview); }
      };

      recorder.onerror = (event) => {
        keepRecordingRef.current = false;
        stopRecordingTimer();
        stopRecordingTracks();
        setRecording(false);
        setVoiceError(voiceRecordingError((event as Event & { error?: DOMException }).error));
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(recordingClockRef.current?.seconds() || 0);
      }, 500);
    } catch (error) {
      stopRecordingTimer();
      stopRecordingTracks();
      setRecording(false);
      setVoiceError(voiceRecordingError(error));
    } finally { recordingStartingRef.current = false; }
  };

  const pauseVoiceRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.pause();
    recordingClockRef.current?.pause();
    setRecordingPaused(true);
    recorder.requestData();
  };
  const resumeVoiceRecording = () => {
    if (recorderRef.current?.state !== "paused") return;
    recorderRef.current.resume();
    recordingClockRef.current?.resume();
    clearVoicePreview();
    setRecordingPaused(false);
  };
  const finishAndSendVoice = () => {
    if (sendAfterStopRef.current || sendingVoice) return;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      sendAfterStopRef.current = true;
      keepRecordingRef.current = true;
      recorderRef.current.stop();
    } else void sendVoiceNote();
  };

  const cancelVoiceRecording = () => {
    keepRecordingRef.current = false;
    sendAfterStopRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopRecordingTimer();
    stopRecordingTracks();
    setRecording(false);
    setRecordingSeconds(0);
    setRecordingPaused(false);
    clearVoicePreview();
    setVoiceError("");
  };

  const sendVoiceNote = async (preview = voicePreview) => {
    if (!activeId || !preview || sendingVoice) return;
    setSendingVoice(true);
    setVoiceError("");
    try {
      const audioDataUrl = await blobToDataUrl(preview.blob);
      await sendMessage({
        productId: pendingProductId,
        messageType: "voice",
        audioDataUrl,
        audioMimeType: preview.mimeType,
        audioDurationSeconds: preview.durationSeconds,
      });
      clearProductContext();
      clearVoicePreview();
      nearBottomRef.current = true;
      await Promise.all([loadMessages(), loadConversations()]);
    } catch {
      setVoiceError("Voice note could not be sent. Try a shorter recording.");
    } finally {
      setSendingVoice(false);
    }
  };

  const sendAttachment = async (file: File | undefined, messageType: "document") => {
    if (!activeId || !file || sendingAttachment) return;
    setAttachOpen(false);
    setVoiceError("");
    setSendingAttachment(true);
    nearBottomRef.current = true;
    try {
      if (file.size > MAX_CHAT_DOCUMENT_BYTES) {
        setVoiceError("Choose a document that is 3 MB or smaller.");
        return;
      }
      const attachmentDataUrl = await blobToDataUrl(file);
      await sendMessage({
        productId: pendingProductId,
        messageType,
        attachmentDataUrl,
        attachmentName: file.name,
        attachmentMimeType: file.type || "application/octet-stream",
        attachmentSize: file.size,
      });
      clearProductContext();
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Attachment could not be sent. Try a smaller file.");
    } finally {
      setSendingAttachment(false);
    }
  };

  return (
    <main className={`private-page messages-page ${selectedId ? "conversation-selected" : ""}`}>
      <header className="mobile-messages-heading">
        <label className="conversation-search">
          <SearchOutlinedIcon />
          <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" />
        </label>
      </header>
      <section className="private-page-head messages-desktop-intro">
        <div>
          <p className="private-kicker">COMMUNICATION CENTER</p>
          <p>Buyer and seller conversations across SMAJ PI HUB.</p>
        </div>
      </section>
      <section className="messages-layout rich">
        <aside ref={conversationListRef} className="conversation-list">
          <label className="conversation-search">
            <SearchOutlinedIcon />
            <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" />
          </label>
          <div className="conversation-filters">
<button type="button" className={inboxFilter === "inbox" ? "active" : ""} onClick={() => setInboxFilter("inbox")}>Inbox</button><button type="button" className={inboxFilter === "archived" ? "active" : ""} onClick={() => setInboxFilter("archived")}>Archived</button></div>
          {loadingConversations ? <PrivateSkeleton variant="messages" count={6} /> : inboxError && !conversations.length ? <div className="chat-history-error" role="status">Chats could not load.<button type="button" onClick={() => void loadConversations()}>Retry</button></div> : filteredConversations.length ? (
            filteredConversations.map((item) => (
              <button
                className={`${item._id === activeId ? "active" : ""}${selectedConversationIds.has(item._id) ? " selected" : ""}`}
                key={item._id}
                data-conversation-id={item._id}
                onPointerDown={() => warmQueue.current?.enqueue([item._id], true)}
                onFocus={() => warmQueue.current?.enqueue([item._id], true)}
                onClick={() => {
                  if (selectedConversationIds.size > 0 || conversationLongPressTriggeredRef.current) return;
                  setParams({ conversation: item._id });
                  setChatFullscreen(true);
                }}
                onMouseDown={() => handleConversationMouseDown(item)}
                onMouseLeave={clearConversationLongPressTimer}
                onMouseUp={(event) => handleConversationMouseUp(item, event)}
                onTouchStart={() => handleConversationTouchStart(item)}
                onTouchCancel={clearConversationLongPressTimer}
                onTouchEnd={(event) => handleConversationTouchEnd(item, event)}
              >
                <span className="conversation-avatar">
                  {item.profileImage ? <img src={item.profileImage} alt="" /> : getConversationInitial(item, user?.uid)}
                  <i className={isConversationOnline(item) ? "online" : "offline"} />
                </span>
                <div>
                  <strong className="conversation-name">{getConversationName(item, user?.uid)}<TrustBadge level={item.verificationLevel} status={item.verificationStatus} /></strong>
                  <p className="conversation-meta-line">{/^Voice (message|note)/.test(item.lastMessage || "") ? <><MicNoneOutlinedIcon aria-hidden="true" />{item.lastMessage}</> : getConversationMeta(item, user?.uid)}</p>
                  <small>{formatLastSeen(item)}</small>
                </div>
                {user?.uid && item.unreadBy?.includes(user.uid) ? <b>1</b> : null}
              </button>
            ))
          ) : (
            <div className="private-state compact">
              <h3>{conversations.length ? "No conversations found" : "No conversations yet"}</h3>
              <p>Start a chat from a product page when contacting a seller.</p>
              <Link className="private-secondary-button messages-empty-browse" to="/store">Browse Products</Link>
            </div>
          )}
          {selectedConversations.length ? <div className="conversation-selection-sheet" role="dialog" aria-modal="true" aria-label="Selected chats"><strong>{selectedConversations.length} selected</strong><button type="button" disabled={deletingConversations} onClick={() => void archiveSelectedConversations(inboxFilter !== "archived")}>{inboxFilter === "archived" ? "Unarchive" : "Archive"}</button><button type="button" className="conversation-delete-button" disabled={deletingConversations} onClick={() => void deleteSelectedConversations()}>{deletingConversations ? "Deleting…" : "Delete"}</button><button type="button" disabled={deletingConversations} onClick={() => { setSelectedConversationIds(new Set()); setConversationActionError(""); }}>Cancel</button>{conversationActionError ? <span className="conversation-selection-error" role="alert">{conversationActionError}</span> : null}</div> : null}
        </aside>
        {chatFullscreen && active ? createPortal(
          <div ref={chatPanelRef} className="chat-panel chat-panel-fullscreen" role="dialog" aria-modal="true" aria-label="Chat">
            {active ? (
              <>
                <header>
                  <button className="chat-mobile-back" onClick={() => { setParams({}); setChatFullscreen(false); }} aria-label="Back to messages">
                    <ArrowBackOutlinedIcon />
                  </button>
                  <div className="chat-person">
                    <span className="conversation-avatar">
                      {active.profileImage ? <img src={active.profileImage} alt="" /> : getConversationInitial(active, user?.uid)}
                      <i className={isConversationOnline(active) ? "online" : "offline"} />
                    </span>
                    <div>
                      <strong className="conversation-name">{getConversationName(active, user?.uid)}<TrustBadge level={active.verificationLevel} status={active.verificationStatus} /></strong>
                      <small>{active.typing ? "Typing..." : connectionState === "live" ? formatLastSeen(active) : connectionState === "offline" ? "Offline" : "Connecting..."}</small>
                    </div>
                  </div>
                  <div className="chat-header-actions">
                    <button type="button" onClick={() => setReportOpen(true)} aria-label="Report conversation" title="Report conversation">
                      <FlagOutlinedIcon />
                    </button>
                    <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-label="More options">
                      <MoreVertOutlinedIcon />
                    </button>
                    {moreOpen ? <div className="chat-more-menu"><Link to={`/seller/${active.participantId || (active.sellerId === user?.uid ? active.buyerId : active.sellerId)}`}>View profile</Link><Link to={`/product/${active.productId}`}>View product</Link><button type="button" onClick={() => { setMoreOpen(false); setVoiceError("Conversation muted."); }}>Mute notifications</button><button type="button" onClick={() => void archiveConversation(active._id, !active.archived)}>{active.archived ? "Unarchive" : "Archive conversation"}</button><button type="button" onClick={() => { setMoreOpen(false); setVoiceError("User blocked locally. You can report the conversation for review."); }}>Block user</button></div> : null}
                  </div>
                  <div className="chat-product-preview">
                    {active.productImage ? <img src={active.productImage} alt="" /> : null}
                    <span>
                      <strong>{active.productTitle}</strong>
                      <small>Marketplace conversation</small>
                    </span>
                  </div>
                </header>
                <div className="chat-messages" ref={chatMessagesRef} onScroll={handleChatScroll}>
                  {historyError ? <div className="chat-history-error" role="status">{historyError}<button type="button" onClick={() => void (historyError.startsWith("Earlier") ? loadOlder() : loadMessages())}>Retry</button></div> : null}
                  {historyCursor ? <button type="button" className="chat-history-more" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading earlier messages..." : "Earlier messages"}</button> : null}
                  <div className="chat-product-mobile" hidden={!pendingProductId}>
                    {active.productImage ? <img src={active.productImage} alt="" /> : null}
                    <div>
                      <strong>{active.productTitle}</strong>
                      <span>Marketplace product</span>
                    </div>
                  </div>
                  {!historyError && !activeId?.startsWith("draft:") && (loadingMessages || loadedMessageId !== activeId) && !visibleMessages.length ? (
                    <div className="chat-initial-loading" role="status">Loading messages...</div>
                  ) : (
                    <>
                      {visibleMessages.map((item) => (
                        <article
                          className={`${item.senderId === user?.uid ? "mine" : ""}${item.messageType === "voice" ? " voice-bubble" : ""}${selectedMessageIds.has(item._id) ? " selected" : ""}`}
                          key={item._id}
                          onMouseDown={() => handleMessageMouseDown(item)}
                          onMouseLeave={clearLongPressTimer}
                          onMouseUp={(event) => handleMessageMouseUp(item, event)}
                          onTouchStart={() => handleMessageTouchStart(item)}
                          onTouchCancel={clearLongPressTimer}
                          onTouchEnd={(event) => handleMessageTouchEnd(item, event)}
                        >
                          {!item.deletedForEveryone && item.productContextExplicit && item.productId && item.productTitle ? <Link className="chat-message-product" to={`/product/${item.productId}`}>
                            {item.productImage ? <img src={item.productImage} alt="" /> : <ImageOutlinedIcon />}
                            <span><small>About this product</small><strong>{item.productTitle}</strong></span>
                          </Link> : null}
                          {item.deletedForEveryone ? <p className="chat-deleted-message">This message was deleted.</p> : item.messageType === "voice" ? (
                            <VoiceMessagePlayer message={item} owner={user?.uid || ""} mine={item.senderId === user?.uid} avatar={item.senderId === user?.uid ? user?.avatar : active.profileImage} name={item.senderId === user?.uid ? user?.displayName || "You" : getConversationName(active, user?.uid)} />
                          ) : ["image", "document"].includes(item.messageType || "") && (item.mediaAvailable || item.attachmentDataUrl || item.attachmentUrl) ? (
                            <ChatMessageAttachment message={item} owner={user?.uid || ""} onImage={url => setImagePreview({ src: url, caption: item.message, message: item })} onLoad={() => { if (nearBottomRef.current) scrollToBottom("auto"); }} />
                          ) : (
                            <p>{item.message || "Message"}</p>
                          )}
                          <small className="chat-message-meta">
                            <time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                            {item.senderId === user?.uid ? <span className={`message-checks ${item.readAt ? "read" : "sent"}`} aria-label={item.deliveryState === "failed" ? "Send failed" : item.deliveryState ? "Waiting to send" : item.readAt ? "Read" : "Sent"}>{item.readAt ? "✓✓" : "✓"}</span> : null}
                          </small>
                          {!item.deletedForEveryone ? <button type="button" className="chat-message-delete" onClick={() => setDeleteTarget(item)} aria-label="Delete message" title="Delete message"><DeleteOutlineRoundedIcon /></button> : null}
                        </article>
                      ))}
                      {active.typing ? <div className="typing-indicator"><span />Typing...</div> : null}
                    </>
                  )}
                </div>
                {showScrollBottom ? (
                  <button type="button" className="chat-scroll-bottom" onClick={() => scrollToBottom()} aria-label="Scroll to newest message">
                    <KeyboardArrowDownOutlinedIcon />
                  </button>
                ) : null}
                {recording || voicePreview ? (
                  <VoiceNoteComposer recording={recording} paused={recordingPaused} seconds={recording ? recordingSeconds : voicePreview?.durationSeconds || 0} previewUrl={voicePreview?.url} busy={sendingVoice} onPause={pauseVoiceRecording} onResume={resumeVoiceRecording} onDelete={cancelVoiceRecording} onSend={finishAndSendVoice} />
                ) : (
                  <form onSubmit={send}>
                    <input ref={documentInputRef} className="chat-file-input" type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { void sendAttachment(event.target.files?.[0], "document"); event.currentTarget.value = ""; }} />
                    <button type="button" onClick={() => setEmojiOpen((open) => !open)} aria-label="Emoji">
                      <SentimentSatisfiedAltOutlinedIcon />
                    </button>
                    <input value={text} onChange={(event) => handleTextChange(event.target.value)} maxLength={1000} placeholder="Message..." />
                    <button type="button" onClick={() => setAttachOpen(true)} aria-label="Attach file">
                      <AttachFileOutlinedIcon />
                    </button>
                    <button
                      type={text.trim() ? "submit" : "button"}
                      className="chat-send-button"
                      onClick={text.trim() ? undefined : startVoiceRecording}
                      aria-label={text.trim() ? "Send" : "Record voice note"}
                    >
                      {text.trim() ? <SendOutlinedIcon /> : <MicNoneOutlinedIcon />}
                    </button>
                  </form>
                )}
                {emojiOpen ? <div className="chat-emoji-picker" role="dialog" aria-label="Choose an emoji">{["👍", "😊", "❤️", "👋", "🔥", "😍", "😂", "🙏"].map((emoji) => <button key={emoji} type="button" onClick={() => { setText((current) => `${current}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div> : null}
                {pendingPhoto ? <div className="chat-photo-composer" role="dialog" aria-modal="true" aria-label="Attachment preview"><header><strong>{pendingPhoto.file.type.startsWith("video/") ? "Send video" : "Send photo"}</strong><button type="button" onClick={clearPendingPhoto} aria-label="Close attachment preview"><CloseOutlinedIcon /></button></header>{pendingPhoto.file.type.startsWith("video/") ? <video src={pendingPhoto.url} controls playsInline preload="metadata" /> : <img src={pendingPhoto.url} alt="Selected photo preview" />}<div><input value={pendingPhotoCaption} maxLength={1000} onChange={(event) => setPendingPhotoCaption(event.target.value)} placeholder="Write a message..." /><button type="button" className="chat-send-button" disabled={sendingAttachment} onClick={() => void sendPendingPhoto()} aria-label="Send attachment"><SendOutlinedIcon /></button></div></div> : null}
                {attachOpen ? <ChatAttachmentSheet onClose={() => setAttachOpen(false)} onChoose={file => void preparePhotoAttachment(file)} onDocument={() => { setAttachOpen(false); documentInputRef.current?.click(); }} busy={sendingAttachment} /> : null}
                {reportOpen ? <div className="chat-action-sheet" role="dialog" aria-modal="true" aria-label="Report conversation"><strong>Report conversation</strong><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Spam or scam</option><option>Harassment</option><option>Unsafe payment request</option><option>Misleading product information</option><option>Other</option></select><button type="button" className="chat-report-submit" onClick={() => void submitConversationReport()}>Submit report</button><button type="button" onClick={() => setReportOpen(false)}>Cancel</button></div> : null}
                {selectedMessages.length ? <div className="chat-action-sheet chat-selection-sheet" role="dialog" aria-modal="true" aria-label="Selected messages"><strong>{selectedMessages.length} selected</strong><button type="button" disabled={deletingMessage} onClick={() => void deleteSelectedMessages("me")}>Delete for me</button>{canDeleteSelectedForEveryone ? <button type="button" className="chat-delete-everyone" disabled={deletingMessage} onClick={() => void deleteSelectedMessages("everyone")}>Delete for everyone</button> : null}<button type="button" disabled={deletingMessage} onClick={() => setSelectedMessageIds(new Set())}>Cancel</button></div> : null}
                {deleteTarget && !selectedMessages.length ? <div className="chat-action-sheet" role="dialog" aria-modal="true" aria-label="Delete message"><strong>Delete message</strong><button type="button" disabled={deletingMessage} onClick={() => void deleteMessage("me")}>Delete for me</button>{deleteTarget.senderId === user?.uid && Date.now() - new Date(deleteTarget.createdAt).getTime() <= 15 * 60 * 1000 ? <button type="button" className="chat-delete-everyone" disabled={deletingMessage} onClick={() => void deleteMessage("everyone")}>Delete for everyone</button> : null}<button type="button" disabled={deletingMessage} onClick={() => setDeleteTarget(null)}>Cancel</button></div> : null}
                {voiceError ? <p className="voice-recorder-error">{voiceError}</p> : null}
              </>
            ) : (
              <div className="private-state">Select a conversation.</div>
            )}
          </div>,
          document.body
        ) : (
          <div className="chat-panel">
            {active ? (
              <>
                <header>
                  <button className="chat-mobile-back" onClick={() => setParams({})} aria-label="Back to messages">
                    <ArrowBackOutlinedIcon />
                  </button>
                  <div className="chat-person">
                    <span className="conversation-avatar">
                      {active.profileImage ? <img src={active.profileImage} alt="" /> : getConversationInitial(active, user?.uid)}
                      <i className={isConversationOnline(active) ? "online" : "offline"} />
                    </span>
                    <div>
                      <strong className="conversation-name">{getConversationName(active, user?.uid)}<TrustBadge level={active.verificationLevel} status={active.verificationStatus} /></strong>
                      <small>{active.typing ? "Typing..." : connectionState === "live" ? formatLastSeen(active) : connectionState === "offline" ? "Offline" : "Connecting..."}</small>
                    </div>
                  </div>
                  <div className="chat-header-actions">
                    <button type="button" onClick={() => setReportOpen(true)} aria-label="Report conversation" title="Report conversation">
                      <FlagOutlinedIcon />
                    </button>
                    <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-label="More options">
                      <MoreVertOutlinedIcon />
                    </button>
                    {moreOpen ? <div className="chat-more-menu"><Link to={`/seller/${active.participantId || (active.sellerId === user?.uid ? active.buyerId : active.sellerId)}`}>View profile</Link><Link to={`/product/${active.productId}`}>View product</Link><button type="button" onClick={() => { setMoreOpen(false); setVoiceError("Conversation muted."); }}>Mute notifications</button><button type="button" onClick={() => void archiveConversation(active._id, !active.archived)}>{active.archived ? "Unarchive" : "Archive conversation"}</button><button type="button" onClick={() => { setMoreOpen(false); setVoiceError("User blocked locally. You can report the conversation for review."); }}>Block user</button></div> : null}
                  </div>
                  <div className="chat-product-preview">
                    {active.productImage ? <img src={active.productImage} alt="" /> : null}
                    <span>
                      <strong>{active.productTitle}</strong>
                      <small>Marketplace conversation</small>
                    </span>
                  </div>
                </header>
                <div className="chat-messages" ref={chatMessagesRef} onScroll={handleChatScroll}>
                  {historyError ? <div className="chat-history-error" role="status">{historyError}<button type="button" onClick={() => void (historyError.startsWith("Earlier") ? loadOlder() : loadMessages())}>Retry</button></div> : null}
                  {historyCursor ? <button type="button" className="chat-history-more" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading earlier messages..." : "Earlier messages"}</button> : null}
                  <div className="chat-product-mobile" hidden={!pendingProductId}>
                    {active.productImage ? <img src={active.productImage} alt="" /> : null}
                    <div>
                      <strong>{active.productTitle}</strong>
                      <span>Marketplace product</span>
                    </div>
                  </div>
                  {!historyError && !activeId?.startsWith("draft:") && (loadingMessages || loadedMessageId !== activeId) && !visibleMessages.length ? (
                    <div className="chat-initial-loading" role="status">Loading messages...</div>
                  ) : (
                    <>
                      {visibleMessages.map((item) => (
                        <article
                          className={`${item.senderId === user?.uid ? "mine" : ""}${item.messageType === "voice" ? " voice-bubble" : ""}${selectedMessageIds.has(item._id) ? " selected" : ""}`}
                          key={item._id}
                          onMouseDown={() => handleMessageMouseDown(item)}
                          onMouseLeave={clearLongPressTimer}
                          onMouseUp={(event) => handleMessageMouseUp(item, event)}
                          onTouchStart={() => handleMessageTouchStart(item)}
                          onTouchCancel={clearLongPressTimer}
                          onTouchEnd={(event) => handleMessageTouchEnd(item, event)}
                        >
                          {!item.deletedForEveryone && item.productContextExplicit && item.productId && item.productTitle ? <Link className="chat-message-product" to={`/product/${item.productId}`}>
                            {item.productImage ? <img src={item.productImage} alt="" /> : <ImageOutlinedIcon />}
                            <span><small>About this product</small><strong>{item.productTitle}</strong></span>
                          </Link> : null}
                          {item.deletedForEveryone ? <p className="chat-deleted-message">This message was deleted.</p> : item.messageType === "voice" ? (
                            <VoiceMessagePlayer message={item} owner={user?.uid || ""} mine={item.senderId === user?.uid} avatar={item.senderId === user?.uid ? user?.avatar : active.profileImage} name={item.senderId === user?.uid ? user?.displayName || "You" : getConversationName(active, user?.uid)} />
                          ) : ["image", "document"].includes(item.messageType || "") && (item.mediaAvailable || item.attachmentDataUrl || item.attachmentUrl) ? (
                            <ChatMessageAttachment message={item} owner={user?.uid || ""} onImage={url => setImagePreview({ src: url, caption: item.message, message: item })} onLoad={() => { if (nearBottomRef.current) scrollToBottom("auto"); }} />
                          ) : (
                            <p>{item.message || "Message"}</p>
                          )}
                          <small className="chat-message-meta">
                            <time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                            {item.senderId === user?.uid ? <span className={`message-checks ${item.readAt ? "read" : "sent"}`} aria-label={item.deliveryState === "failed" ? "Send failed" : item.deliveryState ? "Waiting to send" : item.readAt ? "Read" : "Sent"}>{item.readAt ? "✓✓" : "✓"}</span> : null}
                          </small>
                          {!item.deletedForEveryone ? <button type="button" className="chat-message-delete" onClick={() => setDeleteTarget(item)} aria-label="Delete message" title="Delete message"><DeleteOutlineRoundedIcon /></button> : null}
                        </article>
                      ))}
                      {active.typing ? <div className="typing-indicator"><span />Typing...</div> : null}
                    </>
                  )}
                </div>
                {showScrollBottom ? (
                  <button type="button" className="chat-scroll-bottom" onClick={() => scrollToBottom()} aria-label="Scroll to newest message">
                    <KeyboardArrowDownOutlinedIcon />
                  </button>
                ) : null}
                {recording || voicePreview ? (
                  <VoiceNoteComposer recording={recording} paused={recordingPaused} seconds={recording ? recordingSeconds : voicePreview?.durationSeconds || 0} previewUrl={voicePreview?.url} busy={sendingVoice} onPause={pauseVoiceRecording} onResume={resumeVoiceRecording} onDelete={cancelVoiceRecording} onSend={finishAndSendVoice} />
                ) : (
                  <form onSubmit={send}>
                    <input ref={documentInputRef} className="chat-file-input" type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { void sendAttachment(event.target.files?.[0], "document"); event.currentTarget.value = ""; }} />
                    <button type="button" onClick={() => setEmojiOpen((open) => !open)} aria-label="Emoji">
                      <SentimentSatisfiedAltOutlinedIcon />
                    </button>
                    <input value={text} onChange={(event) => handleTextChange(event.target.value)} maxLength={1000} placeholder="Message..." />
                    <button type="button" onClick={() => setAttachOpen(true)} aria-label="Attach file">
                      <AttachFileOutlinedIcon />
                    </button>
                    <button
                      type={text.trim() ? "submit" : "button"}
                      className="chat-send-button"
                      onClick={text.trim() ? undefined : startVoiceRecording}
                      aria-label={text.trim() ? "Send" : "Record voice note"}
                    >
                      {text.trim() ? <SendOutlinedIcon /> : <MicNoneOutlinedIcon />}
                    </button>
                  </form>
                )}
                {emojiOpen ? <div className="chat-emoji-picker" role="dialog" aria-label="Choose an emoji">{["👍", "😊", "❤️", "👋", "🔥", "😍", "😂", "🙏"].map((emoji) => <button key={emoji} type="button" onClick={() => { setText((current) => `${current}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div> : null}
                {pendingPhoto ? <div className="chat-photo-composer" role="dialog" aria-modal="true" aria-label="Attachment preview"><header><strong>{pendingPhoto.file.type.startsWith("video/") ? "Send video" : "Send photo"}</strong><button type="button" onClick={clearPendingPhoto} aria-label="Close attachment preview"><CloseOutlinedIcon /></button></header>{pendingPhoto.file.type.startsWith("video/") ? <video src={pendingPhoto.url} controls playsInline preload="metadata" /> : <img src={pendingPhoto.url} alt="Selected photo preview" />}<div><input value={pendingPhotoCaption} maxLength={1000} onChange={(event) => setPendingPhotoCaption(event.target.value)} placeholder="Write a message..." /><button type="button" className="chat-send-button" disabled={sendingAttachment} onClick={() => void sendPendingPhoto()} aria-label="Send attachment"><SendOutlinedIcon /></button></div></div> : null}
                {attachOpen ? <ChatAttachmentSheet onClose={() => setAttachOpen(false)} onChoose={file => void preparePhotoAttachment(file)} onDocument={() => { setAttachOpen(false); documentInputRef.current?.click(); }} busy={sendingAttachment} /> : null}
                {reportOpen ? <div className="chat-action-sheet" role="dialog" aria-modal="true" aria-label="Report conversation"><strong>Report conversation</strong><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Spam or scam</option><option>Harassment</option><option>Unsafe payment request</option><option>Misleading product information</option><option>Other</option></select><button type="button" className="chat-report-submit" onClick={() => void submitConversationReport()}>Submit report</button><button type="button" onClick={() => setReportOpen(false)}>Cancel</button></div> : null}
                {selectedMessages.length ? <div className="chat-action-sheet chat-selection-sheet" role="dialog" aria-modal="true" aria-label="Selected messages"><strong>{selectedMessages.length} selected</strong><button type="button" disabled={deletingMessage} onClick={() => void deleteSelectedMessages("me")}>Delete for me</button>{canDeleteSelectedForEveryone ? <button type="button" className="chat-delete-everyone" disabled={deletingMessage} onClick={() => void deleteSelectedMessages("everyone")}>Delete for everyone</button> : null}<button type="button" disabled={deletingMessage} onClick={() => setSelectedMessageIds(new Set())}>Cancel</button></div> : null}
                {deleteTarget && !selectedMessages.length ? <div className="chat-action-sheet" role="dialog" aria-modal="true" aria-label="Delete message"><strong>Delete message</strong><button type="button" disabled={deletingMessage} onClick={() => void deleteMessage("me")}>Delete for me</button>{deleteTarget.senderId === user?.uid && Date.now() - new Date(deleteTarget.createdAt).getTime() <= 15 * 60 * 1000 ? <button type="button" className="chat-delete-everyone" disabled={deletingMessage} onClick={() => void deleteMessage("everyone")}>Delete for everyone</button> : null}<button type="button" disabled={deletingMessage} onClick={() => setDeleteTarget(null)}>Cancel</button></div> : null}
                {voiceError ? <p className="voice-recorder-error">{voiceError}</p> : null}
              </>
            ) : (
              <div className="private-state">Select a conversation.</div>
            )}
          </div>
        )}
      </section>
      {imagePreview ? createPortal(<div className={`chat-image-viewer${imagePreviewFullscreen ? " chat-image-viewer-fullscreen" : ""}`} role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={() => { setImagePreview(null); setImagePreviewFullscreen(false); }}><div className="chat-image-viewer-actions" onClick={(event) => event.stopPropagation()}><button type="button" className="chat-image-viewer-back" onClick={() => { setImagePreview(null); setImagePreviewFullscreen(false); }} aria-label="Back to chat"><ArrowBackOutlinedIcon /></button><button type="button" className="chat-image-viewer-delete" onClick={() => { setDeleteTarget(imagePreview.message); setImagePreview(null); setImagePreviewFullscreen(false); }}>Delete</button><button type="button" onClick={() => setImagePreviewFullscreen((open) => !open)} aria-label={imagePreviewFullscreen ? "Exit fullscreen" : "Fullscreen"}><FullscreenOutlinedIcon /></button></div><img src={imagePreview.src} alt={imagePreview.caption || "Shared photo"} onClick={(event) => event.stopPropagation()} />{imagePreview.caption && imagePreview.caption !== "Photo" ? <p>{imagePreview.caption}</p> : null}</div>, document.body) : null}
    </main>
  );
};

const MessagesPage = () => {
  const { user } = useAuthContext();
  return <MessagesPageContent key={user?.uid || "signed-out"} />;
};
export default MessagesPage;
