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
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
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

const formatLastSeen = (conversation: RichConversation) => {
  if (conversation.online) return "Online";
  const value = conversation.lastSeenAt || conversation.updatedAt;
  if (!value) return "Offline";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Offline";
  const diffMinutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  return `Last seen ${new Date(value).toLocaleDateString()}`;
};

const formatVoiceTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CHAT_DOCUMENT_BYTES = 3 * 1024 * 1024;

const MessagesPage = () => {
  const { user } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState<RichConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [pendingPhotoCaption, setPendingPhotoCaption] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [imagePreviewFullscreen, setImagePreviewFullscreen] = useState(false);
  const [voiceError, setVoiceError] = useState("");
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const nearBottomRef = useRef(true);
  const typingTimeoutRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const keepRecordingRef = useRef(true);
  const longPressTimerRef = useRef<number | null>(null);
  const conversationLongPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const conversationLongPressTriggeredRef = useRef(false);
  const ignoreMousePressRef = useRef(false);
  const ignoreConversationMousePressRef = useRef(false);
  const selectedId = params.get("conversation");
  const [chatFullscreen, setChatFullscreen] = useState(false);
  useEffect(() => {
    if (!chatFullscreen) return;
    const viewport = window.visualViewport;
    const updateChatViewport = () => {
      document.documentElement.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      window.requestAnimationFrame(() => {
        const messages = chatMessagesRef.current;
        if (messages) messages.scrollTop = messages.scrollHeight;
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
  }, [chatFullscreen]);
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
  const active = useMemo(() => conversations.find((item) => item._id === activeId), [activeId, conversations]);
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

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await axiosClient.get<{ conversations: RichConversation[] }>("/messages");
      setConversations(data.conversations || []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!activeId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    try {
      const { data } = await axiosClient.get<{ conversation?: RichConversation; messages: ChatMessage[] }>(`/messages/${activeId}`);
      setMessages(data.messages || []);
      if (data.conversation) {
        setConversations((current) => current.map((item) => item._id === data.conversation?._id ? { ...item, ...data.conversation } : item));
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadConversations(), 0);
    const timer = window.setInterval(() => void loadConversations(), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadMessages(), 0);
    return () => {
      window.clearTimeout(initial);
    };
  }, [loadMessages]);

  useEffect(() => () => {
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
    setSelectedMessageIds(new Set());
    setSelectedConversationIds(new Set());
  }, [activeId]);

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
    if (!activeId) return;
    axiosClient.post(`/messages/${activeId}/typing`, { typing }).catch(() => undefined);
  }, [activeId]);

  const handleTextChange = (value: string) => {
    setText(value);
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
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    setTyping(false);
    nearBottomRef.current = true;
    try {
      const { data } = await axiosClient.post<{ message: ChatMessage }>(`/messages/${activeId}`, { message });
      if (data.message) setMessages((current) => [...current, data.message]);
      await Promise.all([loadMessages(), loadConversations()]);
    } catch {
      setText(message);
    }
  };

  const deleteMessage = async (scope: "me" | "everyone") => {
    if (!activeId || !deleteTarget) return;
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
    if (!file.type.startsWith("image/") || file.size > MAX_CHAT_IMAGE_BYTES) {
      setVoiceError("Choose a JPG, PNG, WebP, or GIF photo that is 2 MB or smaller.");
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
      const attachmentUrl = await uploadImage(pendingPhoto.dataUrl, "message-photos");
      await axiosClient.post(`/messages/${activeId}`, {
        messageType: "image",
        message: pendingPhotoCaption.trim(),
        attachmentUrl,
        attachmentName: pendingPhoto.file.name,
        attachmentMimeType: pendingPhoto.file.type,
        attachmentSize: pendingPhoto.file.size,
      });
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
    if (!activeId || recording) return;
    clearVoicePreview();
    setVoiceError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      keepRecordingRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stopRecordingTimer();
        stopRecordingTracks();
        setRecording(false);
        const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (!keepRecordingRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setVoiceError("Could not capture audio. Please try again.");
          return;
        }
        setVoicePreview({
          blob,
          url: URL.createObjectURL(blob),
          mimeType: blob.type || "audio/webm",
          durationSeconds,
        });
      };

      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.max(0, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)));
      }, 500);
    } catch {
      stopRecordingTimer();
      stopRecordingTracks();
      setRecording(false);
      setVoiceError("Microphone permission is needed to record a voice note.");
    }
  };

  const stopVoiceRecording = () => {
    keepRecordingRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const cancelVoiceRecording = () => {
    keepRecordingRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopRecordingTimer();
    stopRecordingTracks();
    setRecording(false);
    setRecordingSeconds(0);
    clearVoicePreview();
    setVoiceError("");
  };

  const sendVoiceNote = async () => {
    if (!activeId || !voicePreview || sendingVoice) return;
    setSendingVoice(true);
    setVoiceError("");
    try {
      const audioDataUrl = await blobToDataUrl(voicePreview.blob);
      await axiosClient.post(`/messages/${activeId}`, {
        messageType: "voice",
        audioDataUrl,
        audioMimeType: voicePreview.mimeType,
        audioDurationSeconds: voicePreview.durationSeconds,
      });
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
      await axiosClient.post(`/messages/${activeId}`, {
        messageType,
        attachmentDataUrl,
        attachmentName: file.name,
        attachmentMimeType: file.type || "application/octet-stream",
        attachmentSize: file.size,
      });
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
        <aside className="conversation-list">
          <label className="conversation-search">
            <SearchOutlinedIcon />
            <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search conversations" />
          </label>
          <div className="conversation-filters">
<button type="button" className={inboxFilter === "inbox" ? "active" : ""} onClick={() => setInboxFilter("inbox")}>Inbox</button><button type="button" className={inboxFilter === "archived" ? "active" : ""} onClick={() => setInboxFilter("archived")}>Archived</button></div>
          {loadingConversations ? <PrivateSkeleton variant="messages" count={6} /> : filteredConversations.length ? (
            filteredConversations.map((item) => (
              <button
                className={`${item._id === activeId ? "active" : ""}${selectedConversationIds.has(item._id) ? " selected" : ""}`}
                key={item._id}
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
                  <i className={item.online ? "online" : "offline"} />
                </span>
                <div>
                  <strong className="conversation-name">{getConversationName(item, user?.uid)}<TrustBadge level={item.verificationLevel} status={item.verificationStatus} /></strong>
                  <p className="conversation-meta-line">{getConversationMeta(item, user?.uid)}</p>
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
          <div className="chat-panel chat-panel-fullscreen" role="dialog" aria-modal="true" aria-label="Chat">
            {active ? (
              <>
                <header>
                  <button className="chat-mobile-back" onClick={() => { setParams({}); setChatFullscreen(false); }} aria-label="Back to messages">
                    <ArrowBackOutlinedIcon />
                  </button>
                  <div className="chat-person">
                    <span className="conversation-avatar">
                      {active.profileImage ? <img src={active.profileImage} alt="" /> : getConversationInitial(active, user?.uid)}
                      <i className={active.online ? "online" : "offline"} />
                    </span>
                    <div>
                      <strong className="conversation-name">{getConversationName(active, user?.uid)}<TrustBadge level={active.verificationLevel} status={active.verificationStatus} /></strong>
                      <small>{active.typing ? "Typing..." : formatLastSeen(active)}</small>
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
                  <div className="chat-product-mobile">
                    {active.productImage ? <img src={active.productImage} alt="" /> : null}
                    <div>
                      <strong>{active.productTitle}</strong>
                      <span>Marketplace product</span>
                    </div>
                  </div>
                  {loadingMessages ? (
                    <PrivateSkeleton variant="chat" count={6} />
                  ) : (
                    <>
                      {messages.map((item, index) => (
                        <article
                          className={`${item.senderId === user?.uid ? "mine" : ""}${selectedMessageIds.has(item._id) ? " selected" : ""}`}
                          key={item._id}
                          onMouseDown={() => handleMessageMouseDown(item)}
                          onMouseLeave={clearLongPressTimer}
                          onMouseUp={(event) => handleMessageMouseUp(item, event)}
                          onTouchStart={() => handleMessageTouchStart(item)}
                          onTouchCancel={clearLongPressTimer}
                          onTouchEnd={(event) => handleMessageTouchEnd(item, event)}
                        >
                          {!item.deletedForEveryone && item.productId && item.productTitle && item.productId !== messages[index - 1]?.productId ? <Link className="chat-message-product" to={`/product/${item.productId}`}>
                            {item.productImage ? <img src={item.productImage} alt="" /> : <ImageOutlinedIcon />}
                            <span><small>About this product</small><strong>{item.productTitle}</strong></span>
                          </Link> : null}
                          {item.deletedForEveryone ? <p className="chat-deleted-message">This message was deleted.</p> : item.messageType === "voice" && item.audioDataUrl ? (
                            <div className="voice-message">
                              <MicNoneOutlinedIcon />
                              <audio controls src={item.audioDataUrl}>
                                <track kind="captions" />
                              </audio>
                              <span>{formatVoiceTime(item.audioDurationSeconds || 0)}</span>
                            </div>
                          ) : item.messageType === "image" && (item.attachmentUrl || item.attachmentDataUrl) ? (
                            <figure className="chat-attachment chat-photo-message">
                              <button type="button" onClick={() => setImagePreview({ src: item.attachmentUrl || item.attachmentDataUrl || "", caption: item.message, message: item })} aria-label="Open photo">
                                <img src={item.attachmentUrl || item.attachmentDataUrl} alt={item.attachmentName || item.message || "Shared photo"} />
                              </button>
                              <figcaption>{item.message && item.message !== "Photo" ? item.message : item.attachmentName || "Photo"}</figcaption>
                            </figure>
                          ) : item.messageType === "document" && item.attachmentDataUrl ? (
                            <a className="chat-attachment chat-document-message" href={item.attachmentDataUrl} download={item.attachmentName || "document"} target="_blank" rel="noreferrer">
                              <DescriptionOutlinedIcon />
                              <span>
                                <strong>{item.attachmentName || "Document"}</strong>
                                <small>{item.attachmentMimeType || "File"}</small>
                              </span>
                            </a>
                          ) : (
                            <p>{item.message || "Message"}</p>
                          )}
                          <small className="chat-message-meta">
                            <time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                            {item.senderId === user?.uid ? <span className={`message-checks ${item.readAt ? "read" : "sent"}`} aria-label={item.readAt ? "Read" : "Sent"}>{item.readAt ? "✓✓" : "✓"}</span> : null}
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
                  <div className="voice-recorder-bar">
                    <button type="button" onClick={cancelVoiceRecording} aria-label="Cancel voice note">Cancel</button>
                    <span className={recording ? "recording-live" : ""}>
                      <MicNoneOutlinedIcon />
                      {recording ? `Recording ${formatVoiceTime(recordingSeconds)}` : `Voice note ${formatVoiceTime(voicePreview?.durationSeconds || 0)}`}
                    </span>
                    {voicePreview ? (
                      <audio controls src={voicePreview.url}>
                        <track kind="captions" />
                      </audio>
                    ) : null}
                    {recording ? (
                      <button type="button" className="chat-send-button" onClick={stopVoiceRecording} aria-label="Stop recording">Stop</button>
                    ) : (
                      <button type="button" className="chat-send-button" onClick={sendVoiceNote} disabled={sendingVoice} aria-label="Send voice note">
                        <SendOutlinedIcon />
                      </button>
                    )}
                  </div>
                ) : (
                  <form onSubmit={send}>
                    <input ref={photoInputRef} className="chat-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void preparePhotoAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} />
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
                {pendingPhoto ? <div className="chat-photo-composer" role="dialog" aria-modal="true" aria-label="Photo preview"><header><strong>Send photo</strong><button type="button" onClick={clearPendingPhoto} aria-label="Close photo preview"><CloseOutlinedIcon /></button></header><img src={pendingPhoto.url} alt="Selected photo preview" /><div><input value={pendingPhotoCaption} maxLength={1000} onChange={(event) => setPendingPhotoCaption(event.target.value)} placeholder="Write a message..." /><button type="button" className="chat-send-button" disabled={sendingAttachment} onClick={() => void sendPendingPhoto()} aria-label="Send photo"><SendOutlinedIcon /></button></div></div> : null}
                {attachOpen ? <div className="chat-action-sheet" role="dialog" aria-modal="true" aria-label="Attachments"><button type="button" disabled={sendingAttachment} onClick={() => photoInputRef.current?.click()}><ImageOutlinedIcon />Photo sharing</button><button type="button" disabled={sendingAttachment} onClick={() => documentInputRef.current?.click()}><DescriptionOutlinedIcon />Document sharing</button><button type="button" onClick={() => setAttachOpen(false)}>Cancel</button></div> : null}
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
                      <i className={active.online ? "online" : "offline"} />
                    </span>
                    <div>
                      <strong className="conversation-name">{getConversationName(active, user?.uid)}<TrustBadge level={active.verificationLevel} status={active.verificationStatus} /></strong>
                      <small>{active.typing ? "Typing..." : formatLastSeen(active)}</small>
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
                  <div className="chat-product-mobile">
                    {active.productImage ? <img src={active.productImage} alt="" /> : null}
                    <div>
                      <strong>{active.productTitle}</strong>
                      <span>Marketplace product</span>
                    </div>
                  </div>
                  {loadingMessages ? (
                    <PrivateSkeleton variant="chat" count={6} />
                  ) : (
                    <>
                      {messages.map((item, index) => (
                        <article
                          className={`${item.senderId === user?.uid ? "mine" : ""}${selectedMessageIds.has(item._id) ? " selected" : ""}`}
                          key={item._id}
                          onMouseDown={() => handleMessageMouseDown(item)}
                          onMouseLeave={clearLongPressTimer}
                          onMouseUp={(event) => handleMessageMouseUp(item, event)}
                          onTouchStart={() => handleMessageTouchStart(item)}
                          onTouchCancel={clearLongPressTimer}
                          onTouchEnd={(event) => handleMessageTouchEnd(item, event)}
                        >
                          {!item.deletedForEveryone && item.productId && item.productTitle && item.productId !== messages[index - 1]?.productId ? <Link className="chat-message-product" to={`/product/${item.productId}`}>
                            {item.productImage ? <img src={item.productImage} alt="" /> : <ImageOutlinedIcon />}
                            <span><small>About this product</small><strong>{item.productTitle}</strong></span>
                          </Link> : null}
                          {item.deletedForEveryone ? <p className="chat-deleted-message">This message was deleted.</p> : item.messageType === "voice" && item.audioDataUrl ? (
                            <div className="voice-message">
                              <MicNoneOutlinedIcon />
                              <audio controls src={item.audioDataUrl}>
                                <track kind="captions" />
                              </audio>
                              <span>{formatVoiceTime(item.audioDurationSeconds || 0)}</span>
                            </div>
                          ) : item.messageType === "image" && (item.attachmentUrl || item.attachmentDataUrl) ? (
                            <figure className="chat-attachment chat-photo-message">
                              <button type="button" onClick={() => setImagePreview({ src: item.attachmentUrl || item.attachmentDataUrl || "", caption: item.message, message: item })} aria-label="Open photo">
                                <img src={item.attachmentUrl || item.attachmentDataUrl} alt={item.attachmentName || item.message || "Shared photo"} />
                              </button>
                              <figcaption>{item.message && item.message !== "Photo" ? item.message : item.attachmentName || "Photo"}</figcaption>
                            </figure>
                          ) : item.messageType === "document" && item.attachmentDataUrl ? (
                            <a className="chat-attachment chat-document-message" href={item.attachmentDataUrl} download={item.attachmentName || "document"} target="_blank" rel="noreferrer">
                              <DescriptionOutlinedIcon />
                              <span>
                                <strong>{item.attachmentName || "Document"}</strong>
                                <small>{item.attachmentMimeType || "File"}</small>
                              </span>
                            </a>
                          ) : (
                            <p>{item.message || "Message"}</p>
                          )}
                          <small className="chat-message-meta">
                            <time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                            {item.senderId === user?.uid ? <span className={`message-checks ${item.readAt ? "read" : "sent"}`} aria-label={item.readAt ? "Read" : "Sent"}>{item.readAt ? "✓✓" : "✓"}</span> : null}
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
                  <div className="voice-recorder-bar">
                    <button type="button" onClick={cancelVoiceRecording} aria-label="Cancel voice note">Cancel</button>
                    <span className={recording ? "recording-live" : ""}>
                      <MicNoneOutlinedIcon />
                      {recording ? `Recording ${formatVoiceTime(recordingSeconds)}` : `Voice note ${formatVoiceTime(voicePreview?.durationSeconds || 0)}`}
                    </span>
                    {voicePreview ? (
                      <audio controls src={voicePreview.url}>
                        <track kind="captions" />
                      </audio>
                    ) : null}
                    {recording ? (
                      <button type="button" className="chat-send-button" onClick={stopVoiceRecording} aria-label="Stop recording">Stop</button>
                    ) : (
                      <button type="button" className="chat-send-button" onClick={sendVoiceNote} disabled={sendingVoice} aria-label="Send voice note">
                        <SendOutlinedIcon />
                      </button>
                    )}
                  </div>
                ) : (
                  <form onSubmit={send}>
                    <input ref={photoInputRef} className="chat-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void preparePhotoAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} />
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
                {pendingPhoto ? <div className="chat-photo-composer" role="dialog" aria-modal="true" aria-label="Photo preview"><header><strong>Send photo</strong><button type="button" onClick={clearPendingPhoto} aria-label="Close photo preview"><CloseOutlinedIcon /></button></header><img src={pendingPhoto.url} alt="Selected photo preview" /><div><input value={pendingPhotoCaption} maxLength={1000} onChange={(event) => setPendingPhotoCaption(event.target.value)} placeholder="Write a message..." /><button type="button" className="chat-send-button" disabled={sendingAttachment} onClick={() => void sendPendingPhoto()} aria-label="Send photo"><SendOutlinedIcon /></button></div></div> : null}
                {attachOpen ? <div className="chat-action-sheet" role="dialog" aria-modal="true" aria-label="Attachments"><button type="button" disabled={sendingAttachment} onClick={() => photoInputRef.current?.click()}><ImageOutlinedIcon />Photo sharing</button><button type="button" disabled={sendingAttachment} onClick={() => documentInputRef.current?.click()}><DescriptionOutlinedIcon />Document sharing</button><button type="button" onClick={() => setAttachOpen(false)}>Cancel</button></div> : null}
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

export default MessagesPage;
