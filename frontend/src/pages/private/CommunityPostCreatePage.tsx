import { useEffect, useMemo, useRef, useState, useLayoutEffect, type ElementType, type FormEvent } from "react";
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
type MediaDraft = { file: File; previewUrl: string; altText: string; taggedPeople: string[] };
type MediaEditorState = {
  file?: File;
  previewUrl: string;
  type: CommunityMedia["type"];
  existingIndex?: number;
  localIndex?: number;
  rotation: number;
  cropRatio: CropRatio;
  zoom: number;
  altText: string;
  taggedPeople: Person[];
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
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read the selected file."));
  reader.readAsDataURL(file);
});
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

    const requestedRatio = cropRatios[editor.cropRatio];
    let cropWidth = rotatedWidth;
    let cropHeight = rotatedHeight;
    if (requestedRatio) {
      if (cropWidth / cropHeight > requestedRatio) cropWidth = cropHeight * requestedRatio;
      else cropHeight = cropWidth / requestedRatio;
    }
    cropWidth /= editor.zoom;
    cropHeight /= editor.zoom;
    const left = (rotatedWidth - cropWidth) / 2;
    const top = (rotatedHeight - cropHeight) / 2;
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
  const [collaboratorError, setCollaboratorError] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaDraft[]>([]);
  const [existingMedia, setExistingMedia] = useState<CommunityMedia[]>([]);
  const [mediaEditor, setMediaEditor] = useState<MediaEditorState | null>(null);
  const [mediaQueue, setMediaQueue] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [mediaEditorBusy, setMediaEditorBusy] = useState(false);
  const [mediaEditorError, setMediaEditorError] = useState("");
  const [mediaTagQuery, setMediaTagQuery] = useState("");
  const [mediaTagResults, setMediaTagResults] = useState<Person[]>([]);
  const [mediaTagError, setMediaTagError] = useState("");
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState<CommunityPost[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledLoaded, setScheduledLoaded] = useState(false);
  const [scheduledError, setScheduledError] = useState("");
  const [scheduledTab, setScheduledTab] = useState<"compose" | "scheduled">("compose");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [scheduleEditMode, setScheduleEditMode] = useState<"time" | "content" | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const composerDraftSnapshot = useRef<ComposerSnapshot | null>(null);
  const previewUrls = useRef(new Set<string>());

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
      setError("Draft storage is unavailable. Keep this page open until you post.");
    }
  }, [audience, brandPartnership, commentPolicy, content, scheduleEditMode, user?.uid]);

  useEffect(() => {
    const query = collaboratorQuery.trim();
    if (query.length < 2) {
      setCollaboratorResults([]);
      setCollaboratorError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void axiosClient.get<{ users: Person[] }>("/users/search", { params: { q: query }, signal: controller.signal })
        .then(({ data }) => {
          if (!controller.signal.aborted) setCollaboratorResults(data.users.filter(person => person.uid !== user?.uid && !collaborators.some(item => item.uid === person.uid) && !scheduledCollaboratorIds.includes(person.uid)));
        })
        .catch(() => {
          if (!controller.signal.aborted) setCollaboratorError("People could not be searched. Try again.");
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [collaboratorQuery, collaborators, scheduledCollaboratorIds, user?.uid]);

  useEffect(() => {
    const query = mediaTagQuery.trim();
    if (!mediaEditor || query.length < 2) {
      setMediaTagResults([]);
      setMediaTagError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void axiosClient.get<{ users: Person[] }>("/users/search", { params: { q: query }, signal: controller.signal })
        .then(({ data }) => {
          if (!controller.signal.aborted) {
            setMediaTagResults(data.users.filter(person =>
              person.uid !== user?.uid && !mediaEditor.taggedPeople.some(tag => tag.uid === person.uid),
            ));
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setMediaTagError("People could not be searched. Try again.");
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mediaEditor, mediaTagQuery, user?.uid]);

  useEffect(() => {
    if (sheet !== "job" || jobsLoaded) return;
    let active = true;
    setJobsLoading(true);
    setJobsError("");
    getJobs({ page: 1, pageSize: 50 }).then(result => {
      if (active) setJobs(result.jobs);
    }).catch(() => {
      if (active) setJobsError("Active SMAJ Jobs listings could not be loaded.");
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
    setScheduledError("");
    getScheduledCommunityPosts().then(posts => {
      if (active) setScheduledPosts(posts);
    }).catch(() => {
      if (active) setScheduledError("Scheduled posts could not be loaded.");
    }).finally(() => {
      if (active) {
        setScheduledLoading(false);
        setScheduledLoaded(true);
      }
    });
    return () => { active = false; };
  }, [scheduledLoaded, sheet]);

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
    setError("");
    setNotice("");
  };

  const selectPostType = (type: CommunityPostType) => {
    setPostType(type);
    setSheet(type === "media" ? "media" : type === "document" ? "document" : type === "event" ? "event" : type === "celebration" ? "celebration" : type === "job" ? "job" : type === "poll" ? "poll" : null);
    setError("");
  };

  const chooseMedia = (list: FileList | null) => {
    const files = Array.from(list || []);
    if (mediaFiles.length + existingMedia.length + files.length > 4 || files.some(file => !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"].includes(file.type))
      || files.some(file => file.size > (file.type.startsWith("video/") ? 5 : 4) * 1024 * 1024)) {
      setError("Choose up to four photos (4 MB each) or MP4, WebM, or MOV videos (5 MB each).");
      return;
    }
    const queue = files.map(file => ({
      file,
      previewUrl: makePreviewUrl(file),
    }));
    setSheet(null);
    setError("");
    if (queue.length) {
      const [first, ...rest] = queue;
      setMediaEditorError("");
      setMediaQueue(rest);
      setMediaEditor({
        file: first.file,
        previewUrl: first.previewUrl,
        type: first.file.type.startsWith("video/") ? "video" : "image",
        rotation: 0,
        cropRatio: "original",
        zoom: 1,
        altText: "",
        taggedPeople: [],
      });
    }
  };

  const beginLocalMediaEdit = (index: number) => {
    const media = mediaFiles[index];
    if (!media) return;
    setMediaQueue([]);
    setMediaEditorError("");
    setMediaTagQuery("");
    setMediaTagResults([]);
    setMediaEditor({
      file: media.file,
      previewUrl: media.previewUrl,
      type: media.file.type.startsWith("video/") ? "video" : "image",
      localIndex: index,
      rotation: 0,
      cropRatio: "original",
      zoom: 1,
      altText: media.altText,
      taggedPeople: media.taggedPeople.map(uid => ({ uid, displayName: uid })),
    });
  };

  const beginExistingMediaEdit = (index: number) => {
    const media = existingMedia[index];
    if (!media) return;
    setMediaQueue([]);
    setMediaEditorError("");
    setMediaTagQuery("");
    setMediaTagResults([]);
    setMediaEditor({
      previewUrl: media.url,
      type: media.type,
      existingIndex: index,
      rotation: 0,
      cropRatio: "original",
      zoom: 1,
      altText: media.altText || "",
      taggedPeople: (media.taggedPeople || []).map(uid => ({ uid, displayName: uid })),
    });
  };

  const cancelMediaEdit = () => {
    if (mediaEditor && mediaEditor.localIndex === undefined && mediaEditor.existingIndex === undefined) {
      releasePreviewUrl(mediaEditor.previewUrl);
    }
    mediaQueue.forEach(item => releasePreviewUrl(item.previewUrl));
    setMediaQueue([]);
    setMediaEditor(null);
    setMediaTagQuery("");
    setMediaTagResults([]);
    setMediaTagError("");
    setMediaEditorError("");
  };

  const applyMediaEdit = async () => {
    if (!mediaEditor || mediaEditorBusy) return;
    setMediaEditorBusy(true);
    setMediaEditorError("");
    try {
      const changedImage = mediaEditor.type === "image"
        && (mediaEditor.rotation !== 0 || mediaEditor.cropRatio !== "original" || mediaEditor.zoom !== 1);
      const editedFile = changedImage ? await renderEditedImage(mediaEditor) : mediaEditor.file;
      const editedPreview = editedFile && changedImage ? makePreviewUrl(editedFile) : mediaEditor.previewUrl;
      const metadata = {
        altText: mediaEditor.altText.trim().slice(0, 500),
        taggedPeople: [...new Set(mediaEditor.taggedPeople.map(person => person.uid))],
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
        setMediaEditorError("");
        setMediaEditor({
          file: next.file,
          previewUrl: next.previewUrl,
          type: next.file.type.startsWith("video/") ? "video" : "image",
          rotation: 0,
          cropRatio: "original",
          zoom: 1,
          altText: "",
          taggedPeople: [],
        });
        setMediaTagQuery("");
      } else {
        setMediaQueue([]);
        setMediaEditor(null);
        setMediaTagQuery("");
      }
    } catch (reason) {
      setMediaEditorError(reason instanceof Error ? reason.message : "The media could not be edited.");
    } finally {
      setMediaEditorBusy(false);
    }
  };

  const chooseDocument = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) {
      setError("Choose a PDF document up to 5 MB.");
      return;
    }
    setDocumentFile(file);
    setExistingDocument(undefined);
    setSheet(null);
    setError("");
  };

  const buildInput = async (): Promise<Omit<CommunityPostInput, "publishAt">> => {
    const uploads: CommunityMedia[] = await Promise.all(mediaFiles.map(async (media): Promise<CommunityMedia> => {
      const dataUrl = await fileToDataUrl(media.file);
      const metadata = { altText: media.altText, taggedPeople: media.taggedPeople };
      if (media.file.type.startsWith("image/")) {
        return { type: "image", url: await uploadImage(dataUrl, "community-post"), ...metadata };
      }
      const { data } = await axiosClient.post<{ url: string }>("/uploads/video", { video: dataUrl, name: media.file.name });
      return { type: "video", url: data.url, ...metadata };
    }));
    const media: CommunityMedia[] = [...existingMedia, ...uploads];
    let document: CommunityPostInput["document"];
    if (postType === "document" && documentFile) {
      const dataUrl = await fileToDataUrl(documentFile);
      const { data } = await axiosClient.post<{ url: string }>("/uploads/document", { document: dataUrl, name: documentFile.name, purpose: "community-post" });
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
    if (user?.uid) localStorage.removeItem(draftKey(user.uid));
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!validContent || posting) return;
    setPosting(true);
    setError("");
    setNotice("");
    try {
      if (editingScheduleId && scheduleEditMode === "content") {
        if (!scheduledAt || new Date(toIso(scheduledAt)).getTime() < Date.now() + 60_000) {
          setError("Choose a scheduled time at least one minute in the future.");
          return;
        }
        await updateScheduledCommunityPost(editingScheduleId, { ...await buildInput(), publishAt: toIso(scheduledAt) });
        setScheduledPosts(await getScheduledCommunityPosts());
        restoreComposerDraft();
        setEditingScheduleId("");
        setScheduleEditMode(null);
        setNotice("Scheduled post updated.");
        return;
      }
      await createCommunityPost(await buildInput());
      clearDraft();
      navigate("/community/feed");
    } catch (reason) {
      const status = reason && typeof reason === "object" && "response" in reason
        ? (reason as { response?: { status?: number } }).response?.status
        : undefined;
      setError(status === 429 ? "Please wait a moment before publishing another post."
        : scheduleEditMode === "content" ? "The scheduled post could not be updated. Your original draft is still saved."
          : "Your post could not be published. Your draft is still saved.");
    } finally {
      setPosting(false);
    }
  };

  const publishScheduled = async () => {
    if (!scheduledAt || (scheduleEditMode !== "time" && !validContent) || scheduleBusy) return;
    const publishAt = toIso(scheduledAt);
    if (new Date(publishAt).getTime() < Date.now() + 60_000) {
      setScheduledError("Choose a time at least one minute in the future.");
      return;
    }
    setScheduleBusy(true);
    setScheduledError("");
    try {
      if (editingScheduleId) {
        const changes = scheduleEditMode === "content"
          ? { ...await buildInput(), publishAt }
          : { publishAt };
        await updateScheduledCommunityPost(editingScheduleId, changes);
        setScheduledPosts(await getScheduledCommunityPosts());
        setEditingScheduleId("");
        if (scheduleEditMode === "content") {
          restoreComposerDraft();
          setNotice("Scheduled post updated.");
        }
        setScheduleEditMode(null);
        setSheet(null);
      } else {
        await createCommunityPost({ ...await buildInput(), publishAt });
        clearDraft();
        navigate("/community/feed");
      }
    } catch {
      setScheduledError("The scheduled post could not be saved.");
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
    setScheduledError("");
    try {
      await cancelScheduledCommunityPost(post._id);
      setScheduledPosts(current => current.filter(item => item._id !== post._id));
      if (editingScheduleId === post._id) {
        if (scheduleEditMode === "content") restoreComposerDraft();
        setEditingScheduleId("");
        setScheduleEditMode(null);
      }
    } catch {
      setScheduledError("The scheduled post could not be cancelled.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const addCollaborator = (person: Person) => {
    if (collaborators.length + scheduledCollaboratorIds.length >= 5) {
      setCollaboratorError("You can add up to five collaborators.");
      return;
    }
    setCollaborators(current => [...current, person]);
    setCollaboratorQuery("");
    setCollaboratorResults([]);
    setCollaboratorError("");
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
          : <button type="submit" form="community-post-create-form" className="community-create-publish" disabled={!validContent || posting || (scheduleEditMode === "content" && (!scheduledAt || new Date(toIso(scheduledAt)).getTime() < Date.now() + 60_000))}>{posting ? "Saving…" : scheduleEditMode === "content" ? "Save changes" : "Post"}</button>}
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
        {error ? <p className="community-create-error" role="alert">{error}</p> : null}
        {notice ? <p className="community-create-notice" role="status">{notice}</p> : null}
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
          <div
            className={`community-media-editor-stage${mediaEditor.cropRatio === "original" ? " original" : ""}`}
            style={mediaEditor.cropRatio === "original" ? undefined : { aspectRatio: String(cropRatios[mediaEditor.cropRatio]) }}
          >
            {mediaEditor.type === "video"
              ? <video src={mediaEditor.previewUrl} controls playsInline />
              : <img
                src={mediaEditor.previewUrl}
                alt="Selected media preview"
                style={{ transform: `rotate(${mediaEditor.rotation}deg) scale(${mediaEditor.zoom})` }}
              />}
          </div>
        </div>
        <div className="community-media-editor-controls">
          {mediaEditorError ? <p className="community-media-editor-error" role="alert">{mediaEditorError}</p> : null}
          {mediaEditor.type === "image" ? <>
            <div className="community-media-editor-crop" aria-label="Crop image">
              {(["original", "square", "portrait", "landscape"] as const).map(ratio => (
                <button key={ratio} type="button" className={mediaEditor.cropRatio === ratio ? "active" : ""} onClick={() => setMediaEditor(current => current ? { ...current, cropRatio: ratio } : current)}>
                  {ratio === "original" ? "Original" : ratio === "square" ? "Square" : ratio === "portrait" ? "4:5" : "16:9"}
                </button>
              ))}
            </div>
            <div className="community-media-editor-rotate">
              <button type="button" onClick={() => setMediaEditor(current => current ? { ...current, rotation: (current.rotation + 90) % 360 } : current)}><RotateRightOutlinedIcon /> Rotate</button>
              <label>Zoom<input type="range" min="1" max="3" step=".1" value={mediaEditor.zoom} onChange={event => setMediaEditor(current => current ? { ...current, zoom: Number(event.target.value) } : current)} /></label>
            </div>
          </> : null}
          <label className="community-media-editor-alt">ALT text<input value={mediaEditor.altText} maxLength={500} onChange={event => setMediaEditor(current => current ? { ...current, altText: event.target.value } : current)} placeholder="Describe this media for accessibility" /></label>
          <div className="community-media-editor-tagging">
            <strong>Tag people</strong>
            <input value={mediaTagQuery} maxLength={80} onChange={event => { setMediaTagQuery(event.target.value); setMediaTagError(""); }} placeholder="Search public profiles" />
            {mediaTagError ? <p role="alert">{mediaTagError}</p> : null}
            {mediaTagResults.length ? <div className="community-media-editor-results">{mediaTagResults.map(person => <button key={person.uid} type="button" onClick={() => { setMediaEditor(current => current ? { ...current, taggedPeople: [...current.taggedPeople, person] } : current); setMediaTagQuery(""); setMediaTagResults([]); }}><span>{person.displayName}</span><b>Add</b></button>)}</div> : null}
            {mediaEditor.taggedPeople.length ? <div className="community-media-editor-tags">{mediaEditor.taggedPeople.map(person => <span key={person.uid}>{person.displayName}<button type="button" aria-label={`Remove ${person.displayName}`} onClick={() => setMediaEditor(current => current ? { ...current, taggedPeople: current.taggedPeople.filter(tag => tag.uid !== person.uid) } : current)}><CloseOutlinedIcon /></button></span>)}</div> : null}
          </div>
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
            {jobsError ? <p className="community-create-error" role="alert">{jobsError}<button type="button" onClick={() => { setJobsLoaded(false); setJobsError(""); }}>Retry</button></p> : null}
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
            {collaboratorError ? <p className="community-create-error" role="alert">{collaboratorError}</p> : null}
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
              <label>Date and time<input type="datetime-local" min={toDateTimeInput(new Date(Date.now() + 60_000).toISOString())} value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label>
              {scheduledError ? <p className="community-create-error" role="alert">{scheduledError}</p> : null}
              <button type="button" className="community-create-sheet-primary" disabled={!scheduledAt || scheduleBusy || (!editingScheduleId && !validContent) || (scheduleEditMode === "content" && !validContent)} onClick={() => void publishScheduled()}>{scheduleBusy ? "Saving…" : editingScheduleId ? scheduleEditMode === "content" ? "Save scheduled post" : "Update scheduled time" : "Confirm schedule"}</button>
            </> : <>
              {scheduledLoading ? <p role="status">Loading scheduled posts…</p> : null}
              {scheduledError ? <p className="community-create-error" role="alert">{scheduledError}<button type="button" onClick={() => { setScheduledLoaded(false); setScheduledError(""); }}>Retry</button></p> : null}
              {scheduledLoaded && !scheduledLoading && !scheduledError && !scheduledPosts.length ? <div className="community-create-scheduled-empty">
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
