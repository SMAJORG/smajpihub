import { useEffect, useMemo, useRef, useState, useLayoutEffect, type ElementType, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import RotateRightOutlinedIcon from "@mui/icons-material/RotateRightOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import { showFeedback } from "../../lib/feedback";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { axiosClient } from "../../lib/axiosClient";
import { uploadImage } from "../../lib/uploadImage";
import { getJobs, type JobsApiJob } from "../../lib/jobsApi";
import {
  cancelScheduledCommunityPost,
  createCommunityPost,
  getScheduledCommunityPosts,
  updateScheduledCommunityPost,
  type CommunityMedia,
  type CommunityPost,
  type CommunityPostInput,
  type CommunityPostType,
} from "../../lib/communityApi";
import "./communityPostCreate.css";

type Sheet = "options" | "settings" | "event" | "celebration" | "job" | "poll" | "media" | "document" | "schedule" | null;
type Person = { uid: string; displayName: string; avatar?: string };
type CropRatio = "original" | "square" | "portrait" | "landscape";
type MediaDraft = { file: File; previewUrl: string; altText: string; taggedPeople: string[]; uploadedUrl?: string; captionsVtt?: string };
type CropRect = { x: number; y: number; width: number; height: number };
type MediaEditorState = {
  file?: File;
  previewUrl: string;
  type: CommunityMedia["type"];
  existingIndex?: number;
  localIndex?: number;
  rotation: number;
  cropRatio: CropRatio;
  imageSize?: { width: number; height: number };
  cropRect?: CropRect;
  captionsVtt: string;
};
type SavedDraft = { content: string; audience: NonNullable<CommunityPostInput["audience"]>; commentPolicy: NonNullable<CommunityPostInput["commentPolicy"]>; brandPartnership: boolean };
type ComposerSnapshot = {
  content: string;
  audience: SavedDraft["audience"];
  commentPolicy: SavedDraft["commentPolicy"];
  brandPartnership: boolean;
  collaborators: Person[];
  scheduledCollaboratorIds: string[];
  mediaFiles: MediaDraft[];
  existingMedia: CommunityMedia[];
  documentFile: File | null;
  existingDocument: CommunityPost["document"];
  postType: CommunityPostType;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  celebration: string;
  jobId: string;
  pollQuestion: string;
  pollOptions: string[];
  pollExpiry: string;
};
const postTypes: Array<{ type: CommunityPostType; label: string; icon: ElementType }> = [
  { type: "media", label: "Media", icon: PermMediaOutlinedIcon },
  { type: "event", label: "Event", icon: EventOutlinedIcon },
  { type: "celebration", label: "Celebration", icon: CelebrationOutlinedIcon },
  { type: "job", label: "Job", icon: WorkOutlineOutlinedIcon },
  { type: "poll", label: "Poll", icon: PollOutlinedIcon },
  { type: "document", label: "Document", icon: InsertDriveFileOutlinedIcon },
];
const draftKey = (uid: string) => `smaj-community-post-draft-v1:${uid}`;
const publishAttemptKey = (uid: string) => `smaj-community-post-attempt-v1:${uid}`;
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read the selected file."));
  reader.readAsDataURL(file);
});
const readMediaDimensions = (type: CommunityMedia["type"], url: string) => new Promise<{ width: number; height: number } | undefined>(resolve => {
  let finished = false;
  const finish = (width = 0, height = 0) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    resolve(width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : undefined);
  };
  const timeout = window.setTimeout(() => finish(), 5000);
  if (type === "image") {
    const image = new Image();
    image.onload = () => finish(image.naturalWidth, image.naturalHeight);
    image.onerror = () => finish();
    image.src = url;
    return;
  }
  const video = document.createElement("video");
  video.preload = "metadata";
  video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight);
  video.onerror = () => finish();
  video.src = url;
  video.load();
});
const getCropRect = (ratio: CropRatio, width: number, height: number): CropRect => {
  const requestedRatio = cropRatios[ratio];
  if (!requestedRatio) return { x: 0, y: 0, width: 1, height: 1 };
  let cropWidth = width;
  let cropHeight = height;
  if (cropWidth / cropHeight > requestedRatio) cropWidth = cropHeight * requestedRatio;
  else cropHeight = cropWidth / requestedRatio;
  return {
    x: (width - cropWidth) / width / 2,
    y: (height - cropHeight) / height / 2,
    width: cropWidth / width,
    height: cropHeight / height,
  };
};
const renderEditedImage = (editor: MediaEditorState) => new Promise<File>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const rotation = ((editor.rotation % 360) + 360) % 360;
    const rotated = document.createElement("canvas");
    const rotatedWidth = rotation % 180 ? image.height : image.width;
    const rotatedHeight = rotation % 180 ? image.width : image.height;
    rotated.width = rotatedWidth;
    rotated.height = rotatedHeight;
    const rotatedContext = rotated.getContext("2d");
    if (!rotatedContext) return reject(new Error("Image editing is unavailable in this browser."));
    rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
    rotatedContext.rotate(rotation * Math.PI / 180);
    rotatedContext.drawImage(image, -image.width / 2, -image.height / 2);

    const crop = editor.cropRect || getCropRect(editor.cropRatio, rotatedWidth, rotatedHeight);
    const cropWidth = rotatedWidth * crop.width;
    const cropHeight = rotatedHeight * crop.height;
    const left = rotatedWidth * crop.x;
    const top = rotatedHeight * crop.y;
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(cropWidth));
    output.height = Math.max(1, Math.round(cropHeight));
    const context = output.getContext("2d");
    if (!context) return reject(new Error("Image editing is unavailable in this browser."));
    context.drawImage(rotated, left, top, cropWidth, cropHeight, 0, 0, output.width, output.height);
    const mimeType = editor.file?.type || "image/jpeg";
    output.toBlob(blob => {
      if (!blob) return reject(new Error("The edited image could not be created."));
      const name = editor.file?.name || "community-image.jpg";
      resolve(new File([blob], name, { type: blob.type || mimeType, lastModified: Date.now() }));
    }, mimeType, .92);
  };
  image.onerror = () => reject(new Error("This image could not be opened for editing."));
  image.src = editor.previewUrl;
});
const toDateTimeInput = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const toIso = (value: string) => value ? new Date(value).toISOString() : "";
const cropRatios: Record<CropRatio, number | null> = { original: null, square: 1, portrait: 4 / 5, landscape: 16 / 9 };
const defaultDraft = (): SavedDraft => ({ content: "", audience: "everyone", commentPolicy: "everyone", brandPartnership: false });
const readDraft = (uid?: string): SavedDraft => {
  if (!uid) return defaultDraft();
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(uid)) || "null") as Partial<SavedDraft> | null;
    return {
      ...defaultDraft(),
      ...saved,
      audience: ["everyone", "followers", "only_me"].includes(String(saved?.audience)) ? saved!.audience! : "everyone",
      commentPolicy: ["everyone", "followers", "nobody"].includes(String(saved?.commentPolicy)) ? saved!.commentPolicy! : "everyone",
    };
  } catch {
    return defaultDraft();
  }
};

export default function CommunityPostCreatePage() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const initialDraft = useMemo(() => readDraft(user?.uid), [user?.uid]);
  const [content, setContent] = useState(initialDraft.content);
  const [audience, setAudience] = useState<SavedDraft["audience"]>(initialDraft.audience);
  const [commentPolicy, setCommentPolicy] = useState<SavedDraft["commentPolicy"]>(initialDraft.commentPolicy);
  const [brandPartnership, setBrandPartnership] = useState(initialDraft.brandPartnership);
  const [collaborators, setCollaborators] = useState<Person[]>([]);
  const [scheduledCollaboratorIds, setScheduledCollaboratorIds] = useState<string[]>([]);
  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const [collaboratorResults, setCollaboratorResults] = useState<Person[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaDraft[]>([]);
  const [existingMedia, setExistingMedia] = useState<CommunityMedia[]>([]);
  const [mediaEditor, setMediaEditor] = useState<MediaEditorState | null>(null);
  const [mediaQueue, setMediaQueue] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [mediaEditorBusy, setMediaEditorBusy] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [existingDocument, setExistingDocument] = useState<CommunityPost["document"]>();
  const [postType, setPostType] = useState<CommunityPostType>("post");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [celebration, setCelebration] = useState("");
  const [jobs, setJobs] = useState<JobsApiJob[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollExpiry, setPollExpiry] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [scheduledPosts, setScheduledPosts] = useState<CommunityPost[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledLoaded, setScheduledLoaded] = useState(false);
  const [scheduledLoadError, setScheduledLoadError] = useState("");
  const [scheduledRefresh, setScheduledRefresh] = useState(0);
  const [scheduledTab, setScheduledTab] = useState<"compose" | "scheduled">("compose");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [scheduleEditMode, setScheduleEditMode] = useState<"time" | "content" | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const mediaEditorStage = useRef<HTMLDivElement>(null);
  const cropPointers = useRef(new Map<number, { x: number; y: number }>());
  const cropInteraction = useRef<{
    mode: "move" | "resize" | "pinch";
    handle?: string;
    startX: number;
    startY: number;
    rect: CropRect;
    distance?: number;
  } | null>(null);
  const composerDraftSnapshot = useRef<ComposerSnapshot | null>(null);
  const previewUrls = useRef(new Set<string>());
  const publishAttempt = useRef<{ id: string; signature: string } | null>(null);

  const makePreviewUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    previewUrls.current.add(url);
    return url;
  };
  const releasePreviewUrl = (url: string) => {
    if (!previewUrls.current.delete(url)) return;
    URL.revokeObjectURL(url);
  };

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!user?.uid || composerDraftSnapshot.current) return;
    try {
      localStorage.setItem(draftKey(user.uid), JSON.stringify({ content, audience, commentPolicy, brandPartnership }));
    } catch {
      showFeedback("Draft storage is unavailable. Keep this page open until you post.", "error");
    }
  }, [audience, brandPartnership, commentPolicy, content, scheduleEditMode, user?.uid]);

  useEffect(() => {
    const query = collaboratorQuery.trim();
    if (query.length < 2) {
      setCollaboratorResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void axiosClient.get<{ users: Person[] }>("/users/search", { params: { q: query }, signal: controller.signal })
        .then(({ data }) => {
          if (!controller.signal.aborted) setCollaboratorResults(data.users.filter(person => person.uid !== user?.uid && !collaborators.some(item => item.uid === person.uid) && !scheduledCollaboratorIds.includes(person.uid)));
        })
        .catch(() => {
          if (!controller.signal.aborted) showFeedback("People could not be searched. Try again.", "error");
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [collaboratorQuery, collaborators, scheduledCollaboratorIds, user?.uid]);

  useEffect(() => {
    if (sheet !== "job" || jobsLoaded) return;
    let active = true;
    setJobsLoading(true);
    setJobsError("");
    getJobs({ page: 1, pageSize: 50 }).then(result => {
      if (active) setJobs(result.jobs);
    }).catch(() => {
      if (active) {
        setJobsError("Active SMAJ Jobs listings could not be loaded.");
        showFeedback("Active SMAJ Jobs listings could not be loaded.", "error");
      }
    }).finally(() => {
      if (active) {
        setJobsLoading(false);
        setJobsLoaded(true);
      }
    });
    return () => { active = false; };
  }, [jobsLoaded, sheet]);

  useEffect(() => {
    if (sheet !== "schedule" || scheduledLoaded) return;
    let active = true;
    setScheduledLoading(true);
    setScheduledLoadError("");
    getScheduledCommunityPosts().then(posts => {
      if (active) {
        setScheduledPosts(posts);
        setScheduledLoaded(true);
      }
    }).catch(reason => {
      if (active) {
        const message = reason && typeof reason === "object" && "response" in reason
          ? (reason as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
        const errorMessage = typeof message === "string" && message.trim()
          ? message
          : "Scheduled posts could not be loaded. Check your connection and retry.";
        setScheduledLoadError(errorMessage);
        showFeedback(errorMessage, "error");
      }
    }).finally(() => {
      if (active) {
        setScheduledLoading(false);
      }
    });
    return () => { active = false; };
  }, [scheduledLoaded, scheduledRefresh, sheet]);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty("--community-create-height", `${viewport?.height ?? window.innerHeight}px`);
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--community-create-height");
    };
  }, []);

  useLayoutEffect(() => {
    const textarea = contentInput.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [content]);

  const selectedJob = jobs.find(job => job.id === jobId);
  const validPoll = pollQuestion.trim().length > 0 && pollOptions.filter(option => option.trim()).length >= 2;
  const hasTextOrMedia = Boolean(content.trim() || mediaFiles.length || existingMedia.length);
  const validContent = postType === "post" ? hasTextOrMedia
    : postType === "media" ? Boolean(mediaFiles.length || existingMedia.length)
      : postType === "event" ? Boolean(eventTitle.trim() && eventDate && eventLocation.trim())
        : postType === "celebration" ? Boolean(celebration)
          : postType === "job" ? Boolean(jobId)
            : postType === "poll" ? Boolean(validPoll && (!pollExpiry || new Date(pollExpiry).getTime() > Date.now()))
              : Boolean(documentFile || existingDocument);
  const audienceLabel = audience === "everyone" ? "Anyone" : audience === "followers" ? "Followers" : "Only me";

  const getPublishRequestId = (signature: string) => {
    if (!publishAttempt.current && user?.uid) {
      try {
        const saved = JSON.parse(localStorage.getItem(publishAttemptKey(user.uid)) || "null") as { id?: string; signature?: string } | null;
        if (saved?.id && saved.signature) publishAttempt.current = { id: saved.id, signature: saved.signature };
      } catch {
        publishAttempt.current = null;
      }
    }
    if (publishAttempt.current?.signature === signature) return publishAttempt.current.id;
    const id = crypto.randomUUID();
    publishAttempt.current = { id, signature };
    if (user?.uid) {
      try {
        localStorage.setItem(publishAttemptKey(user.uid), JSON.stringify(publishAttempt.current));
      } catch {
        showFeedback("The publish retry could not be saved locally. Keep this page open if publishing fails.", "warning");
      }
    }
    return id;
  };

  const captureComposerDraft = (): ComposerSnapshot => ({
    content,
    audience,
    commentPolicy,
    brandPartnership,
    collaborators,
    scheduledCollaboratorIds,
    mediaFiles,
    existingMedia,
    documentFile,
    existingDocument,
    postType,
    eventTitle,
    eventDate,
    eventLocation,
    celebration,
    jobId,
    pollQuestion,
    pollOptions,
    pollExpiry,
  });

  const restoreComposerDraft = () => {
    const saved = composerDraftSnapshot.current;
    if (!saved) return;
    setContent(saved.content);
    setAudience(saved.audience);
    setCommentPolicy(saved.commentPolicy);
    setBrandPartnership(saved.brandPartnership);
    setCollaborators(saved.collaborators);
    setScheduledCollaboratorIds(saved.scheduledCollaboratorIds);
    setMediaFiles(saved.mediaFiles);
    setExistingMedia(saved.existingMedia);
    setDocumentFile(saved.documentFile);
    setExistingDocument(saved.existingDocument);
    setPostType(saved.postType);
    setEventTitle(saved.eventTitle);
    setEventDate(saved.eventDate);
    setEventLocation(saved.eventLocation);
    setCelebration(saved.celebration);
    setJobId(saved.jobId);
    setPollQuestion(saved.pollQuestion);
    setPollOptions(saved.pollOptions);
    setPollExpiry(saved.pollExpiry);
    composerDraftSnapshot.current = null;
  };

  const editScheduledContent = (post: CommunityPost) => {
    composerDraftSnapshot.current = captureComposerDraft();
    setContent(post.content || "");
    setAudience(post.audience || "everyone");
    setCommentPolicy(post.commentPolicy || "everyone");
    setBrandPartnership(post.brandPartnership === true);
    setCollaborators([]);
    setScheduledCollaboratorIds(post.collaboratorIds || []);
    setMediaFiles([]);
    setExistingMedia(post.media || []);
    setDocumentFile(null);
    setExistingDocument(post.document);
    setPostType(post.postType || "post");
    setEventTitle(post.event?.title || "");
    setEventDate(toDateTimeInput(post.event?.startsAt || ""));
    setEventLocation(post.event?.location || "");
    setCelebration(post.celebration || "");
    setJobId(post.job?.id || "");
    setPollQuestion(post.poll?.question || "");
    setPollOptions(post.poll?.options.map(option => option.label) || ["", ""]);
    setPollExpiry(toDateTimeInput(post.poll?.expiresAt || ""));
    setScheduledAt(toDateTimeInput(post.publishAt || ""));
    setEditingScheduleId(post._id);
    setScheduleEditMode("content");
    setSheet(null);
  };

  const selectPostType = (type: CommunityPostType) => {
    setPostType(type);
    setSheet(type === "media" ? "media" : type === "document" ? "document" : type === "event" ? "event" : type === "celebration" ? "celebration" : type === "job" ? "job" : type === "poll" ? "poll" : null);
  };

  const chooseMedia = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (mediaFiles.length + existingMedia.length + files.length > 4 || files.some(file => !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"].includes(file.type))
      || files.some(file => file.size > (file.type.startsWith("video/") ? 50 : 4) * 1024 * 1024)) {
      showFeedback("Choose up to four photos (4 MB each) or MP4, WebM, or MOV videos (50 MB each, maximum 1 minute 30 seconds).", "error");
      return;
    }
    // Read local metadata before accepting a video; reject videos longer than 90 seconds.
    const durationIsValid = (file: File): Promise<boolean> => new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      let settled = false;
      const finish = (valid: boolean) => {
        if (settled) return;
        settled = true;
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
        resolve(valid);
      };
      video.preload = "metadata";
      video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 && video.duration <= 90);
      video.onerror = () => finish(false);
      video.src = url;
      setTimeout(() => finish(false), 10000);
    });
    const videoChecks = await Promise.all(files.filter(file => file.type.startsWith("video/")).map(durationIsValid));
    if (videoChecks.some(valid => !valid)) {
      showFeedback("Videos must be 1 minute 30 seconds or shorter. Please select a shorter video.", "error");
      return;
    }
    const queue = files.map(file => ({
      file,
      previewUrl: makePreviewUrl(file),
    }));
    setSheet(null);
    if (queue.length) {
      const [first, ...rest] = queue;
      setMediaQueue(rest);
      setMediaEditor({
        file: first.file,
        previewUrl: first.previewUrl,
        type: first.file.type.startsWith("video/") ? "video" : "image",
        rotation: 0,
        cropRatio: "original",
        captionsVtt: "",
      });
    }
  };

  const beginLocalMediaEdit = (index: number) => {
    const media = mediaFiles[index];
    if (!media) return;
    setMediaQueue([]);
    setMediaEditor({
      file: media.file,
      previewUrl: media.previewUrl,
      type: media.file.type.startsWith("video/") ? "video" : "image",
      localIndex: index,
      rotation: 0,
      cropRatio: "original",
      captionsVtt: media.captionsVtt || "",
    });
  };

  const beginExistingMediaEdit = (index: number) => {
    const media = existingMedia[index];
    if (!media) return;
    setMediaQueue([]);
    setMediaEditor({
      previewUrl: media.url,
      type: media.type,
      existingIndex: index,
      rotation: 0,
      cropRatio: "original",
      captionsVtt: media.captionsVtt || "",
    });
  };

  const orientedImageSize = (editor: MediaEditorState) => {
    const size = editor.imageSize;
    if (!size) return null;
    return editor.rotation % 180
      ? { width: size.height, height: size.width }
      : size;
  };

  const beginCropPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!mediaEditor || mediaEditor.type !== "image") return;
    const stage = mediaEditorStage.current;
    const size = orientedImageSize(mediaEditor);
    if (!stage || !size) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-crop-handle]")?.dataset.cropHandle;
    const rect = mediaEditor.cropRect || getCropRect(mediaEditor.cropRatio, size.width, size.height);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cropPointers.current.size > 1) {
      const points = [...cropPointers.current.values()];
      cropInteraction.current = {
        mode: "pinch",
        startX: points[0].x,
        startY: points[0].y,
        rect,
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      };
      return;
    }
    cropInteraction.current = {
      mode: handle ? "resize" : "move",
      handle,
      startX: event.clientX,
      startY: event.clientY,
      rect,
    };
  };

  const moveCropPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = cropInteraction.current;
    const stage = mediaEditorStage.current;
    if (!mediaEditor || !interaction || !stage) return;
    cropPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const bounds = stage.getBoundingClientRect();
    if (interaction.mode === "pinch" && interaction.distance) {
      const points = [...cropPointers.current.values()];
      if (points.length < 2) return;
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const scale = interaction.distance / distance;
      const ratio = cropRatios[mediaEditor.cropRatio] || bounds.width / bounds.height;
      const normalizedAspect = ratio * bounds.height / bounds.width;
      const maxWidth = Math.min(1, normalizedAspect);
      const width = Math.min(maxWidth, Math.max(Math.min(.08, maxWidth), interaction.rect.width * scale));
      const height = Math.min(1, width / normalizedAspect);
      const centerX = interaction.rect.x + interaction.rect.width / 2;
      const centerY = interaction.rect.y + interaction.rect.height / 2;
      setMediaEditor(current => current ? {
        ...current,
        cropRect: {
          x: Math.max(0, Math.min(1 - width, centerX - width / 2)),
          y: Math.max(0, Math.min(1 - height, centerY - height / 2)),
          width,
          height,
        },
      } : current);
      return;
    }
    const dx = (event.clientX - interaction.startX) / bounds.width;
    const dy = (event.clientY - interaction.startY) / bounds.height;
    if (interaction.mode === "move") {
      const x = Math.max(0, Math.min(1 - interaction.rect.width, interaction.rect.x + dx));
      const y = Math.max(0, Math.min(1 - interaction.rect.height, interaction.rect.y + dy));
      setMediaEditor(current => current ? { ...current, cropRect: { ...interaction.rect, x, y } } : current);
      return;
    }
    const handle = interaction.handle || "";
    const left = handle.includes("w");
    const top = handle.includes("n");
    const rightX = interaction.rect.x + interaction.rect.width;
    const bottomY = interaction.rect.y + interaction.rect.height;
    const ratio = cropRatios[mediaEditor.cropRatio] || bounds.width / bounds.height;
    const normalizedAspect = ratio * bounds.height / bounds.width;
    const horizontalWidthDelta = left ? -dx : dx;
    const verticalWidthDelta = (top ? -dy : dy) * normalizedAspect;
    const widthDelta = Math.abs(horizontalWidthDelta) >= Math.abs(verticalWidthDelta) ? horizontalWidthDelta : verticalWidthDelta;
    const maximumWidth = Math.min(left ? rightX : 1 - interaction.rect.x, (top ? bottomY : 1 - interaction.rect.y) * normalizedAspect);
    const width = Math.max(Math.min(.08, maximumWidth), Math.min(maximumWidth, interaction.rect.width + widthDelta));
    const height = width / normalizedAspect;
    const x = left ? rightX - width : interaction.rect.x;
    const y = top ? bottomY - height : interaction.rect.y;
    setMediaEditor(current => current ? {
      ...current,
      cropRect: {
        x: Math.max(0, Math.min(1 - width, x)),
        y: Math.max(0, Math.min(1 - height, y)),
        width,
        height,
      },
    } : current);
  };

  const endCropPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    cropPointers.current.delete(event.pointerId);
    if (cropPointers.current.size < 2) cropInteraction.current = null;
  };

  const setEditorCropRatio = (ratio: CropRatio) => {
    setMediaEditor(current => {
      if (!current) return current;
      const size = orientedImageSize(current);
      return {
        ...current,
        cropRatio: ratio,
        ...(size ? { cropRect: getCropRect(ratio, size.width, size.height) } : {}),
      };
    });
  };

  const rotateEditorImage = () => {
    setMediaEditor(current => {
      if (!current) return current;
      const rotation = (current.rotation + 90) % 360;
      const size = current.imageSize
        ? rotation % 180 ? { width: current.imageSize.height, height: current.imageSize.width } : current.imageSize
        : null;
      return {
        ...current,
        rotation,
        ...(size ? { cropRect: getCropRect(current.cropRatio, size.width, size.height) } : {}),
      };
    });
  };

  const cancelMediaEdit = () => {
    if (mediaEditor && mediaEditor.localIndex === undefined && mediaEditor.existingIndex === undefined) {
      releasePreviewUrl(mediaEditor.previewUrl);
    }
    mediaQueue.forEach(item => releasePreviewUrl(item.previewUrl));
    setMediaQueue([]);
    setMediaEditor(null);
    cropPointers.current.clear();
    cropInteraction.current = null;
  };

  const applyMediaEdit = async () => {
    if (!mediaEditor || mediaEditorBusy) return;
    setMediaEditorBusy(true);
    try {
      const captionsVtt = mediaEditor.captionsVtt.trim();
      if (captionsVtt && (!/^WEBVTT(?:\r?\n)/.test(captionsVtt)
        || !/(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}/.test(captionsVtt))) {
        showFeedback("Captions must use WebVTT format and include at least one timestamped cue.", "error");
        return;
      }
      const changedImage = mediaEditor.type === "image"
        && (mediaEditor.rotation !== 0 || mediaEditor.cropRatio !== "original"
          || Boolean(mediaEditor.cropRect && (mediaEditor.cropRect.x || mediaEditor.cropRect.y || mediaEditor.cropRect.width < 1 || mediaEditor.cropRect.height < 1)));
      const editedFile = changedImage ? await renderEditedImage(mediaEditor) : mediaEditor.file;
      const editedPreview = editedFile && changedImage ? makePreviewUrl(editedFile) : mediaEditor.previewUrl;
      const previousMedia = mediaEditor.existingIndex !== undefined
        ? existingMedia[mediaEditor.existingIndex]
        : mediaEditor.localIndex !== undefined ? mediaFiles[mediaEditor.localIndex] : undefined;
      const metadata = {
        altText: previousMedia?.altText || "",
        taggedPeople: previousMedia?.taggedPeople || [],
        ...(mediaEditor.type === "video" && mediaEditor.captionsVtt.trim() ? { captionsVtt: mediaEditor.captionsVtt.trim() } : {}),
      };

      if (mediaEditor.existingIndex !== undefined && !changedImage) {
        setExistingMedia(current => current.map((media, index) =>
          index === mediaEditor.existingIndex ? { ...media, ...metadata } : media,
        ));
      } else if (editedFile) {
        const draft: MediaDraft = { file: editedFile, previewUrl: editedPreview, ...metadata };
        if (mediaEditor.existingIndex !== undefined) {
          setExistingMedia(current => current.filter((_, index) => index !== mediaEditor.existingIndex));
          setMediaFiles(current => [...current, draft]);
        } else if (mediaEditor.localIndex !== undefined) {
          setMediaFiles(current => current.map((media, index) => index === mediaEditor.localIndex ? draft : media));
          if (editedPreview !== mediaEditor.previewUrl) releasePreviewUrl(mediaEditor.previewUrl);
        } else {
          setMediaFiles(current => [...current, draft]);
          if (editedPreview !== mediaEditor.previewUrl) releasePreviewUrl(mediaEditor.previewUrl);
        }
      }

      const [next, ...remaining] = mediaQueue;
      if (next) {
        setMediaQueue(remaining);
        setMediaEditor({
          file: next.file,
          previewUrl: next.previewUrl,
          type: next.file.type.startsWith("video/") ? "video" : "image",
          rotation: 0,
          cropRatio: "original",
          captionsVtt: "",
        });
      } else {
        setMediaQueue([]);
        setMediaEditor(null);
      }
      cropPointers.current.clear();
      cropInteraction.current = null;
    } catch (reason) {
      showFeedback(reason instanceof Error ? reason.message : "The media could not be edited.", "error");
    } finally {
      setMediaEditorBusy(false);
    }
  };

  const chooseDocument = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) {
      showFeedback("Choose a PDF document up to 5 MB.", "error");
      return;
    }
    setDocumentFile(file);
    setExistingDocument(undefined);
    setSheet(null);
  };

  const buildInput = async (onProgress?: (percent: number) => void): Promise<Omit<CommunityPostInput, "publishAt" | "clientRequestId">> => {
    const weights = [...mediaFiles.map(media => media.file.size), ...(postType === "document" && documentFile ? [documentFile.size] : [])];
    const progress = weights.map(() => 0);
    const reportProgress = (index: number, percent: number) => {
      progress[index] = percent;
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      if (totalWeight) onProgress?.(Math.round(progress.reduce((sum, value, item) => sum + value * weights[item], 0) / totalWeight));
    };
    const uploads: CommunityMedia[] = await Promise.all(mediaFiles.map(async (media, index): Promise<CommunityMedia> => {
      const dimensions = await readMediaDimensions(
        media.file.type.startsWith("video/") ? "video" : "image",
        media.previewUrl,
      );
      const metadata = {
        ...(dimensions || {}),
        altText: media.altText,
        taggedPeople: media.taggedPeople,
        ...(media.captionsVtt?.trim() ? { captionsVtt: media.captionsVtt.trim() } : {}),
      };
      if (media.uploadedUrl) {
        reportProgress(index, 100);
        return { type: media.file.type.startsWith("image/") ? "image" : "video", url: media.uploadedUrl, ...metadata };
      }
      const dataUrl = await fileToDataUrl(media.file);
      if (media.file.type.startsWith("image/")) {
        const url = await uploadImage(dataUrl, "community-post", { timeout: 120_000, onProgress: percent => reportProgress(index, percent) });
        setMediaFiles(current => current.map(item => item.previewUrl === media.previewUrl ? { ...item, uploadedUrl: url } : item));
        return {
          type: "image",
          url,
          ...metadata,
        };
      }
      const { data } = await axiosClient.post<{ url: string }>("/uploads/video", { video: dataUrl, name: media.file.name }, {
        timeout: 120_000,
        onUploadProgress: event => {
          if (event.total) reportProgress(index, Math.round(event.loaded / event.total * 100));
        },
      });
      let videoUrl: URL;
      try {
        videoUrl = new URL(data.url);
      } catch {
        throw new Error("Video storage did not return a saved media URL.");
      }
      if (videoUrl.protocol !== "https:" || videoUrl.hostname !== "res.cloudinary.com" || !videoUrl.pathname.includes("/video/upload/")) {
        throw new Error("Video storage did not return a saved media URL.");
      }
      setMediaFiles(current => current.map(item => item.previewUrl === media.previewUrl ? { ...item, uploadedUrl: videoUrl.toString() } : item));
      return { type: "video", url: videoUrl.toString(), ...metadata };
    }));
    const media: CommunityMedia[] = [...existingMedia, ...uploads];
    let document: CommunityPostInput["document"];
    if (postType === "document" && documentFile) {
      const dataUrl = await fileToDataUrl(documentFile);
      const documentIndex = mediaFiles.length;
      reportProgress(documentIndex, 0);
      const { data } = await axiosClient.post<{ url: string }>("/uploads/document", { document: dataUrl, name: documentFile.name, purpose: "community-post" }, {
        timeout: 120_000,
        onUploadProgress: event => {
          if (event.total) reportProgress(documentIndex, Math.round(event.loaded / event.total * 100));
        },
      });
      reportProgress(documentIndex, 100);
      document = { name: documentFile.name, url: data.url };
    } else if (postType === "document") {
      document = existingDocument;
    }
    return {
      content: content.trim(),
      media,
      postType,
      audience,
      commentPolicy,
      collaborators: [...new Set([...scheduledCollaboratorIds, ...collaborators.map(person => person.uid)])],
      brandPartnership,
      ...(postType === "event" ? { event: { title: eventTitle.trim(), startsAt: toIso(eventDate), location: eventLocation.trim() } } : {}),
      ...(postType === "celebration" ? { celebration } : {}),
      ...(postType === "job" && jobId ? { jobId } : {}),
      ...(postType === "poll" ? { poll: { question: pollQuestion.trim(), options: pollOptions.map(option => option.trim()).filter(Boolean), ...(pollExpiry ? { expiresAt: toIso(pollExpiry) } : {}) } } : {}),
      ...(document ? { document } : {}),
    };
  };

  const clearDraft = () => {
    if (user?.uid) {
      localStorage.removeItem(draftKey(user.uid));
      localStorage.removeItem(publishAttemptKey(user.uid));
    }
    publishAttempt.current = null;
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!validContent || posting) return;
    setPosting(true);
    setUploadProgress(mediaFiles.length || (postType === "document" && documentFile) ? 0 : null);
    try {
      if (editingScheduleId && scheduleEditMode === "content") {
        if (!scheduledAt || new Date(toIso(scheduledAt)).getTime() < Date.now() + 60_000) {
          showFeedback("Choose a scheduled time at least one minute in the future.", "warning");
          return;
        }
        const updatedPost = await updateScheduledCommunityPost(editingScheduleId, { ...await buildInput(), publishAt: toIso(scheduledAt) });
        setScheduledPosts(current => current.map(post => post._id === updatedPost._id ? updatedPost : post));
        restoreComposerDraft();
        setEditingScheduleId("");
        setScheduleEditMode(null);
        showFeedback("Scheduled post updated.", "success");
        return;
      }
      const input = await buildInput(setUploadProgress);
      const signature = JSON.stringify({
        content, audience, commentPolicy, brandPartnership, postType, collaborators: [...scheduledCollaboratorIds, ...collaborators.map(person => person.uid)].sort(),
        media: mediaFiles.map(({ file, altText, taggedPeople, captionsVtt }) => [file.name, file.type, file.size, file.lastModified, altText, [...taggedPeople].sort(), captionsVtt]),
        existingMedia: existingMedia.map(({ url, altText, taggedPeople, captionsVtt }) => [url, altText, [...(taggedPeople || [])].sort(), captionsVtt]),
        document: documentFile ? [documentFile.name, documentFile.size, documentFile.lastModified] : existingDocument?.url,
        eventTitle, eventDate, eventLocation, celebration, jobId, pollQuestion, pollOptions, pollExpiry,
      });
      setUploadProgress(null);
      const publishedPost = await createCommunityPost({ ...input, clientRequestId: getPublishRequestId(signature) });
      clearDraft();
      navigate("/community/feed", { state: { communityPublishedPost: publishedPost } });
    } catch (reason) {
      const status = reason && typeof reason === "object" && "response" in reason
        ? (reason as { response?: { status?: number } }).response?.status
        : undefined;
      const responseMessage = reason && typeof reason === "object" && "response" in reason
        ? (reason as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      const requestCode = reason && typeof reason === "object" && "code" in reason
        ? String((reason as { code?: string }).code || "")
        : "";
      const reasonMessage = reason instanceof Error ? reason.message : "";
      showFeedback(status === 429 ? "Please wait a moment before publishing another post."
        : scheduleEditMode === "content" ? "The scheduled post could not be updated. Your original draft is still saved."
          : responseMessage
            || (requestCode === "ECONNABORTED" ? "Media upload timed out. Your draft is still saved; check your connection and retry."
              : ["Network Error", "ERR_NETWORK"].includes(reasonMessage) ? "Media storage could not be reached. Your draft is still saved; check your connection and retry."
                : reasonMessage || "Your post could not be published. Your draft is still saved."), "error");
    } finally {
      setPosting(false);
      setUploadProgress(null);
    }
  };

  const publishScheduled = async () => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt) || (scheduleEditMode !== "time" && !validContent) || scheduleBusy) return;
    const publishAt = toIso(scheduledAt);
    if (new Date(publishAt).getTime() < Date.now() + 60_000) {
      showFeedback("Choose a time at least one minute in the future.", "warning");
      return;
    }
    setScheduleBusy(true);
    try {
      if (editingScheduleId) {
        const changes = scheduleEditMode === "content"
          ? { ...await buildInput(), publishAt }
          : { publishAt };
        const updatedPost = await updateScheduledCommunityPost(editingScheduleId, changes);
        setScheduledPosts(current => current.map(post => post._id === updatedPost._id ? updatedPost : post));
        setEditingScheduleId("");
        if (scheduleEditMode === "content") {
          restoreComposerDraft();
          showFeedback("Scheduled post updated.", "success");
        }
        setScheduleEditMode(null);
        setSheet(null);
      } else {
        const input = await buildInput();
        const signature = JSON.stringify({
          content, audience, commentPolicy, brandPartnership, postType, collaborators: [...scheduledCollaboratorIds, ...collaborators.map(person => person.uid)].sort(),
          media: mediaFiles.map(({ file, altText, taggedPeople, captionsVtt }) => [file.name, file.type, file.size, file.lastModified, altText, [...taggedPeople].sort(), captionsVtt]),
          existingMedia: existingMedia.map(({ url, altText, taggedPeople, captionsVtt }) => [url, altText, [...(taggedPeople || [])].sort(), captionsVtt]),
          document: documentFile ? [documentFile.name, documentFile.size, documentFile.lastModified] : existingDocument?.url,
          eventTitle, eventDate, eventLocation, celebration, jobId, pollQuestion, pollOptions, pollExpiry, publishAt,
        });
        await createCommunityPost({ ...input, publishAt, clientRequestId: getPublishRequestId(signature) });
        clearDraft();
        showFeedback("Post scheduled successfully.", "success");
        navigate("/community/feed");
      }
    } catch {
      const message = "The scheduled post could not be saved.";
      showFeedback(message, "error");
    } finally {
      setScheduleBusy(false);
    }
  };

  const editScheduledTime = (post: CommunityPost) => {
    setEditingScheduleId(post._id);
    setScheduleEditMode("time");
    setScheduledAt(toDateTimeInput(post.publishAt || ""));
    setScheduledTab("compose");
  };

  const cancelScheduled = async (post: CommunityPost) => {
    if (!window.confirm("Cancel this scheduled post?")) return;
    setScheduleBusy(true);
    try {
      await cancelScheduledCommunityPost(post._id);
      setScheduledPosts(current => current.filter(item => item._id !== post._id));
      showFeedback("Scheduled post cancelled.", "success");
      if (editingScheduleId === post._id) {
        if (scheduleEditMode === "content") restoreComposerDraft();
        setEditingScheduleId("");
        setScheduleEditMode(null);
      }
    } catch {
      const message = "The scheduled post could not be cancelled.";
      showFeedback(message, "error");
    } finally {
      setScheduleBusy(false);
    }
  };

  const addCollaborator = (person: Person) => {
    if (collaborators.length + scheduledCollaboratorIds.length >= 5) {
      showFeedback("You can add up to five collaborators.", "warning");
      return;
    }
    setCollaborators(current => [...current, person]);
    setCollaboratorQuery("");
    setCollaboratorResults([]);
  };

  return (
    <main className="community-post-create" aria-label="Create a community post">
      <header className="community-create-header">
        <button type="button" className="community-create-close" onClick={() => navigate("/community/feed")} aria-label="Close post composer"><CloseOutlinedIcon /></button>
        <UserAvatarFrame name={user?.displayName || user?.username || "Pi user"} image={user?.avatar} frame={user?.activeAvatarFrame} size={42} />
        <div className="community-create-identity">
          <button type="button" className="community-create-audience" onClick={() => setSheet("settings")}>{audienceLabel} <span aria-hidden="true">⌄</span></button>
        </div>
        <button type="button" className="community-create-schedule" onClick={() => { setScheduledTab("compose"); if (!scheduleEditMode) { setEditingScheduleId(""); setScheduledAt(""); } setSheet("schedule"); }} aria-label="Schedule post"><ScheduleOutlinedIcon /></button>
        {scheduleEditMode === "time" ? <button type="button" className="community-create-publish" onClick={() => setSheet("schedule")} disabled={!scheduledAt}>Update time</button>
          : <button type="submit" form="community-post-create-form" className="community-create-publish" disabled={!validContent || posting || (scheduleEditMode === "content" && (!scheduledAt || new Date(toIso(scheduledAt)).getTime() < Date.now() + 60_000))}>{posting ? "Posting…" : scheduleEditMode === "content" ? "Save changes" : "Post"}</button>}
      </header>
      <form id="community-post-create-form" className="community-create-form" onSubmit={event => void publish(event)}>
        <textarea ref={contentInput} id="community-create-content" aria-label="Share your thoughts" value={content} maxLength={2000} onChange={event => setContent(event.target.value)} placeholder="Share your thoughts ..." />
        {existingMedia.length || mediaFiles.length ? <div className="community-create-media-grid">
          {existingMedia.map((media, index) => <article className="community-create-media-card" key={`existing-${media.url}`}>
            {media.type === "video"
              ? <video src={media.url} controls playsInline preload="metadata" />
              : <img src={media.url} alt={media.altText || ""} />}
            <div className="community-create-media-actions">
              <button type="button" aria-label={`Edit media ${index + 1}`} onClick={() => beginExistingMediaEdit(index)}><EditOutlinedIcon /></button>
              <button type="button" aria-label={`Remove media ${index + 1}`} onClick={() => setExistingMedia(current => current.filter((_, itemIndex) => itemIndex !== index))}><CloseOutlinedIcon /></button>
            </div>
          </article>)}
          {mediaFiles.map((media, index) => <article className="community-create-media-card" key={`${media.file.name}-${index}`}>
            {media.file.type.startsWith("video/")
              ? <video src={media.previewUrl} controls playsInline preload="metadata" />
              : <img src={media.previewUrl} alt={media.altText || ""} />}
            <div className="community-create-media-actions">
              <button type="button" aria-label={`Edit ${media.file.name}`} onClick={() => beginLocalMediaEdit(index)}><EditOutlinedIcon /></button>
              <button type="button" aria-label={`Remove ${media.file.name}`} onClick={() => { releasePreviewUrl(media.previewUrl); setMediaFiles(current => current.filter((_, fileIndex) => fileIndex !== index)); }}><CloseOutlinedIcon /></button>
            </div>
          </article>)}
        </div> : null}
        {documentFile || existingDocument ? <div className="community-create-attachments"><span>{documentFile?.name || existingDocument?.name}<button type="button" aria-label="Remove document" onClick={() => { setDocumentFile(null); setExistingDocument(undefined); }}><CloseOutlinedIcon /></button></span></div> : null}
        {postType === "event" && eventTitle ? <p className="community-create-summary">Event: {eventTitle}{eventDate ? ` · ${new Date(eventDate).toLocaleString()}` : ""}{eventLocation ? ` · ${eventLocation}` : ""}</p> : null}
        {postType === "celebration" && celebration ? <p className="community-create-summary">Celebrating: {celebration.replaceAll("_", " ")}</p> : null}
        {postType === "job" && jobId ? <p className="community-create-summary">Job: {selectedJob ? `${selectedJob.title} · ${selectedJob.company}` : jobId}</p> : null}
        {postType === "poll" && validPoll ? <p className="community-create-summary">Poll: {pollQuestion} · {pollOptions.filter(option => option.trim()).length} choices</p> : null}
        {uploadProgress !== null ? <div className="community-create-upload-progress">
          <span>Uploading media · {uploadProgress}%</span>
          <progress aria-label="Media upload progress" max={100} value={uploadProgress} />
        </div> : null}
      </form>
      <footer className="community-create-toolbar">
        <span aria-live="polite">{content.length}/2000</span>
        <div>
          <button type="button" onClick={() => setSheet("media")} aria-label="Add media"><PermMediaOutlinedIcon /></button>
          <button type="button" onClick={() => setSheet("options")} aria-label="More post options"><AddOutlinedIcon /></button>
        </div>
      </footer>

      <input ref={mediaInput} hidden type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={event => { chooseMedia(event.target.files); event.currentTarget.value = ""; }} />
      <input ref={documentInput} hidden type="file" accept="application/pdf,.pdf" onChange={event => { chooseDocument(event.target.files?.[0]); event.currentTarget.value = ""; }} />

      {mediaEditor ? <section className="community-media-editor" role="dialog" aria-modal="true" aria-label="Edit media">
        <header className="community-media-editor-header">
          <button type="button" onClick={cancelMediaEdit} disabled={mediaEditorBusy}>Cancel</button>
          <button type="button" onClick={() => void applyMediaEdit()} disabled={mediaEditorBusy}>{mediaEditorBusy ? "Applying…" : "Next"}</button>
        </header>
        <div className="community-media-editor-stage-wrap">
          {(() => {
            const size = orientedImageSize(mediaEditor);
            const ratio = size ? size.width / size.height : 1;
            const crop = mediaEditor.cropRect || (size ? getCropRect(mediaEditor.cropRatio, size.width, size.height) : null);
            return (
          <div
            ref={mediaEditorStage}
            className="community-media-editor-stage"
            style={{ aspectRatio: String(ratio) }}
            onPointerDown={beginCropPointer}
            onPointerMove={moveCropPointer}
            onPointerUp={endCropPointer}
            onPointerCancel={endCropPointer}
          >
            {mediaEditor.type === "video"
              ? <video src={mediaEditor.previewUrl} controls playsInline />
              : <img
                src={mediaEditor.previewUrl}
                alt="Selected media preview"
                onLoad={event => {
                  const imageSize = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
                  const oriented = mediaEditor.rotation % 180
                    ? { width: imageSize.height, height: imageSize.width }
                    : imageSize;
                  setMediaEditor(current => current ? {
                    ...current,
                    imageSize,
                    cropRect: current.cropRect || getCropRect(current.cropRatio, oriented.width, oriented.height),
                  } : current);
                }}
                style={{
                  width: mediaEditor.rotation % 180 && mediaEditor.imageSize
                    ? `${mediaEditor.imageSize.width / mediaEditor.imageSize.height * 100}%`
                    : "100%",
                  height: mediaEditor.rotation % 180 && mediaEditor.imageSize
                    ? `${mediaEditor.imageSize.height / mediaEditor.imageSize.width * 100}%`
                    : "100%",
                  transform: `translate(-50%, -50%) rotate(${mediaEditor.rotation}deg)`,
                }}
              />}
            {mediaEditor.type === "image" && crop ? <div
              className="community-media-editor-crop-frame"
              data-crop-frame
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}
            >
              <span className="community-media-editor-grid-line horizontal" />
              <span className="community-media-editor-grid-line vertical" />
              {(["nw", "ne", "sw", "se"] as const).map(handle => <span
                key={handle}
                className={`community-media-editor-crop-handle ${handle}`}
                data-crop-handle={handle}
                aria-hidden="true"
              />)}
            </div> : null}
          </div>
            );
          })()}
        </div>
        <div className="community-media-editor-controls">
          {mediaEditor.type === "image" ? <>
            <div className="community-media-editor-crop" aria-label="Crop image">
              {(["original", "square", "portrait", "landscape"] as const).map(ratio => (
                <button key={ratio} type="button" className={mediaEditor.cropRatio === ratio ? "active" : ""} onClick={() => setEditorCropRatio(ratio)}>
                  {ratio === "original" ? "Original" : ratio === "square" ? "Square" : ratio === "portrait" ? "4:5" : "16:9"}
                </button>
              ))}
            </div>
            <div className="community-media-editor-rotate">
              <button type="button" onClick={rotateEditorImage}><RotateRightOutlinedIcon /> Rotate</button>
            </div>
          </> : null}
          {mediaEditor.type === "video" ? <label className="community-media-editor-captions">Closed captions (WebVTT)<textarea value={mediaEditor.captionsVtt} maxLength={20_000} onChange={event => setMediaEditor(current => current ? { ...current, captionsVtt: event.target.value } : current)} placeholder={"WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nCaption text"} /></label> : null}
        </div>
      </section> : null}

      {sheet ? <div className="community-create-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSheet(null); }}>
        <section className="community-create-sheet" role="dialog" aria-modal="true" aria-label={sheet === "options" ? "Add to your post" : sheet === "settings" ? "Post settings" : sheet === "schedule" ? "Schedule post" : `Add ${sheet}`} onMouseDown={event => event.stopPropagation()}>
          <div className="community-create-sheet-grip" />
          {sheet === "options" ? <>
            <h2>Add to your post</h2>
            <div className="community-create-option-grid">
              {postTypes.map(({ type, label, icon: Icon }) => <button key={type} type="button" onClick={() => selectPostType(type)}><Icon /><span>{label}</span></button>)}
            </div>
          </> : null}
          {sheet === "media" ? <>
            <h2>Add media</h2>
            <p>Select up to four photos or videos to attach to this post.</p>
            <button type="button" className="community-create-sheet-primary" onClick={() => mediaInput.current?.click()}><PermMediaOutlinedIcon /> Choose photos or videos</button>
          </> : null}
          {sheet === "document" ? <>
            <h2>Add a document</h2>
            <p>Attach a PDF document up to 5 MB.</p>
            <button type="button" className="community-create-sheet-primary" onClick={() => documentInput.current?.click()}><InsertDriveFileOutlinedIcon /> Choose PDF</button>
          </> : null}
          {sheet === "event" ? <>
            <h2>Create an event post</h2>
            <label>Event name<input value={eventTitle} maxLength={120} onChange={event => setEventTitle(event.target.value)} /></label>
            <label>Date and time<input type="datetime-local" min={toDateTimeInput(new Date(Date.now() + 60_000).toISOString())} value={eventDate} onChange={event => setEventDate(event.target.value)} /></label>
            <label>Location or event link<input value={eventLocation} maxLength={160} onChange={event => setEventLocation(event.target.value)} /></label>
            <button type="button" className="community-create-sheet-primary" disabled={!eventTitle.trim() || !eventDate || !eventLocation.trim()} onClick={() => setSheet(null)}>Add event details</button>
          </> : null}
          {sheet === "celebration" ? <>
            <h2>Choose a celebration</h2>
            <label>Celebration type<select value={celebration} onChange={event => setCelebration(event.target.value)}><option value="">Select a milestone</option><option value="new_role">New role</option><option value="work_anniversary">Work anniversary</option><option value="birthday">Birthday</option><option value="milestone">Personal milestone</option><option value="achievement">Achievement</option></select></label>
            <label>Add a message<textarea value={content} maxLength={2000} onChange={event => setContent(event.target.value)} placeholder="Share a little more about this moment…" /></label>
            <button type="button" className="community-create-sheet-primary" disabled={!celebration} onClick={() => setSheet(null)}>Add celebration</button>
          </> : null}
          {sheet === "job" ? <>
            <h2>Share a SMAJ Jobs listing</h2>
            {jobsLoading ? <p role="status">Loading active jobs…</p> : null}
            {jobsError ? <button type="button" className="community-create-retry" onClick={() => { setJobsLoaded(false); setJobsError(""); }}>Retry loading jobs</button> : null}
            <div className="community-create-job-list">
              {jobs.map(job => <button key={job.id} type="button" className={jobId === job.id ? "selected" : ""} onClick={() => setJobId(job.id)}><strong>{job.title}</strong><span>{job.company} · {job.location}</span></button>)}
            </div>
            {!jobsLoading && !jobsError && !jobs.length ? <p>No active SMAJ Jobs listings are available.</p> : null}
            <button type="button" className="community-create-sheet-primary" disabled={!selectedJob} onClick={() => setSheet(null)}>Attach selected job</button>
          </> : null}
          {sheet === "poll" ? <>
            <h2>Create a poll</h2>
            <label>Poll question<input maxLength={240} value={pollQuestion} onChange={event => setPollQuestion(event.target.value)} /></label>
            {pollOptions.map((option, index) => <label key={index}>Choice {index + 1}<input maxLength={100} value={option} onChange={event => setPollOptions(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}
            {pollOptions.length < 6 ? <button type="button" className="community-create-secondary" onClick={() => setPollOptions(current => [...current, ""])}>Add choice</button> : null}
            {pollOptions.length > 2 ? <button type="button" className="community-create-secondary" onClick={() => setPollOptions(current => current.slice(0, -1))}>Remove last choice</button> : null}
            <label>Poll closes (optional)<input type="datetime-local" min={toDateTimeInput(new Date(Date.now() + 60_000).toISOString())} value={pollExpiry} onChange={event => setPollExpiry(event.target.value)} /></label>
            <button type="button" className="community-create-sheet-primary" disabled={!validPoll || new Set(pollOptions.filter(item => item.trim()).map(item => item.trim().toLowerCase())).size !== pollOptions.filter(item => item.trim()).length} onClick={() => { setPostType("poll"); setSheet(null); }}>Add poll</button>
          </> : null}
          {sheet === "settings" ? <>
            <h2>Post settings</h2>
            <div className="community-create-identity-row"><UserAvatarFrame name={user?.displayName || user?.username || "Pi user"} image={user?.avatar} frame={user?.activeAvatarFrame} size={38} /><div><strong>Posting identity</strong><small>{user?.displayName || user?.username || "Your profile"}</small></div></div>
            <label>Who can see your post?<select value={audience} onChange={event => setAudience(event.target.value as SavedDraft["audience"])}><option value="everyone">Anyone</option><option value="followers">Followers</option><option value="only_me">Only me</option></select></label>
            <label>Who can comment on your post?<select value={commentPolicy} onChange={event => setCommentPolicy(event.target.value as SavedDraft["commentPolicy"])}><option value="everyone">Anyone</option><option value="followers">Followers</option><option value="nobody">No one</option></select></label>
            <label>Add collaborators<input value={collaboratorQuery} maxLength={80} onChange={event => setCollaboratorQuery(event.target.value)} placeholder="Search public profiles" /></label>
            {collaboratorResults.length ? <div className="community-create-people">{collaboratorResults.map(person => <button key={person.uid} type="button" onClick={() => addCollaborator(person)}><UserAvatarFrame name={person.displayName} image={person.avatar} size={34} /><span>{person.displayName}</span><b>Add</b></button>)}</div> : null}
            {collaborators.length || scheduledCollaboratorIds.length ? <div className="community-create-collaborator-list">
              {scheduledCollaboratorIds.map(uid => <span key={uid}>{uid}<button type="button" aria-label={`Remove collaborator ${uid}`} onClick={() => setScheduledCollaboratorIds(current => current.filter(item => item !== uid))}><CloseOutlinedIcon /></button></span>)}
              {collaborators.map(person => <span key={person.uid}>{person.displayName}<button type="button" aria-label={`Remove ${person.displayName}`} onClick={() => setCollaborators(current => current.filter(item => item.uid !== person.uid))}><CloseOutlinedIcon /></button></span>)}
            </div> : null}
            <label className="community-create-toggle"><span><strong>Brand partnership</strong><small>Disclose that this post includes a brand partnership.</small></span><input type="checkbox" checked={brandPartnership} onChange={event => setBrandPartnership(event.target.checked)} /></label>
            <button type="button" className="community-create-sheet-primary" onClick={() => setSheet(null)}>Done</button>
          </> : null}
          {sheet === "schedule" ? <>
            <h2>Schedule post</h2>
            <div className="community-create-schedule-tabs"><button type="button" className={scheduledTab === "compose" ? "active" : ""} onClick={() => setScheduledTab("compose")}>Schedule post</button><button type="button" className={scheduledTab === "scheduled" ? "active" : ""} onClick={() => setScheduledTab("scheduled")}>Scheduled</button></div>
            {scheduledTab === "compose" ? <>
              {editingScheduleId ? <p>{scheduleEditMode === "content" ? "Edit the post details and publish time." : "Update the publish time for this post."}</p> : null}
              <label>Date<input type="date" min={toDateTimeInput(new Date().toISOString()).split("T")[0]} value={scheduledAt.split("T")[0] || ""} onChange={event => {
                const time = scheduledAt.split("T")[1] || "09:00";
                setScheduledAt(event.target.value ? `${event.target.value}T${time}` : "");
              }} /></label>
              <label>Time<input type="time" value={scheduledAt.split("T")[1] || ""} onChange={event => {
                const date = scheduledAt.split("T")[0] || toDateTimeInput(new Date().toISOString()).split("T")[0];
                setScheduledAt(event.target.value ? `${date}T${event.target.value}` : "");
              }} /></label>
              <button type="button" className="community-create-sheet-primary" disabled={!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt) || scheduleBusy || (!editingScheduleId && !validContent) || (scheduleEditMode === "content" && !validContent)} onClick={() => void publishScheduled()}>{scheduleBusy ? "Saving…" : editingScheduleId ? scheduleEditMode === "content" ? "Save scheduled post" : "Update scheduled time" : "Confirm schedule"}</button>
            </> : <>
              {scheduledLoading ? <p role="status">Loading scheduled posts…</p> : null}
              {scheduledLoadError ? <button type="button" className="community-create-retry" onClick={() => { setScheduledLoadError(""); setScheduledRefresh(current => current + 1); }}>Retry loading scheduled posts</button> : null}
              {scheduledLoaded && !scheduledLoading && !scheduledLoadError && !scheduledPosts.length ? <div className="community-create-scheduled-empty">
                <span className="community-create-scheduled-empty-illustration" aria-hidden="true"><ScheduleOutlinedIcon /></span>
                <p>When you schedule a post, it automatically posts at the date and time you choose.</p>
                <button type="button" className="community-create-schedule-start" onClick={() => setScheduledTab("compose")}>Schedule</button>
              </div> : null}
              <div className="community-create-scheduled-list">{scheduledPosts.map(post => <article key={post._id}><strong>{post.content || post.event?.title || post.poll?.question || post.job?.title || post.document?.name || "Scheduled community post"}</strong><time>{new Date(post.publishAt || "").toLocaleString()}</time><div><button type="button" disabled={scheduleEditMode === "content"} onClick={() => editScheduledContent(post)}>Edit post</button><button type="button" disabled={scheduleEditMode === "content"} onClick={() => editScheduledTime(post)}>Edit time</button><button type="button" disabled={scheduleBusy} onClick={() => void cancelScheduled(post)}>Cancel</button></div></article>)}</div>
            </>}
          </> : null}
          <button type="button" className="community-create-sheet-close" onClick={() => setSheet(null)}>Close</button>
        </section>
      </div> : null}
    </main>
  );
}
