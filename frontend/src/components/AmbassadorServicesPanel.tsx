import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent } from "react";
import { isAxiosError } from "axios";
import { Country, State } from "country-state-city";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { useSearchParams } from "react-router-dom";
import { axiosClient } from "../lib/axiosClient";
import { serviceCatalog } from "../content/serviceCatalog";
import { useAuthContext } from "../contexts/AuthContext";

type Application = { _id: string; status: "pending" | "approved" | "rejected"; countryName: string; regionName: string; services: string[]; updatedAt: string };
type PublicAmbassador = { _id: string; displayName: string; countryName: string; countryCode: string; countryFlag: string; regionName: string; services: string[] };
type ImageField = "idFront" | "idBack" | "selfie";
type IdImageField = Exclude<ImageField, "selfie">;
type ImageUploadStatus = { state: "idle" | "uploading" | "uploaded" | "error"; progress: number };
type CropEditor = {
  field: IdImageField;
  image: HTMLImageElement;
  zoom: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
};
type FeedbackNotice = { message: string; type: "success" | "error" | "warning" | "info" };
type FormState = {
  displayName: string;
  email: string;
  phone: string;
  countryCode: string;
  regionCode: string;
  customRegion: string;
  services: string[];
  message: string;
  idFront: string;
  idBack: string;
  selfie: string;
};

const MAX_IDENTITY_IMAGE_BYTES = 5 * 1024 * 1024;
const ID_CROP_WIDTH = 800;
const ID_CROP_HEIGHT = 505;
const ID_CROP_OUTPUT_WIDTH = 1800;
const ID_CROP_OUTPUT_HEIGHT = Math.round(ID_CROP_OUTPUT_WIDTH * ID_CROP_HEIGHT / ID_CROP_WIDTH);
const IDENTITY_UPLOAD_TIMEOUT_MS = 120_000;
const identityImageMimeByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const flagFor = (code: string) => code.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
const countries = Country.getAllCountries().map((country) => ({ ...country, flag: flagFor(country.isoCode) })).sort((a, b) => a.name.localeCompare(b.name));
const serviceOptions = [{ slug: "all", name: "All SMAJ services" }, ...serviceCatalog.map((service) => ({ slug: service.slug, name: service.name }))];

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const extensionMime = identityImageMimeByExtension[extension];
  const fileType = file.type.toLowerCase();
  const normalizedFileType = fileType === "image/jpg" ? "image/jpeg" : fileType;
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(normalizedFileType)
    ? normalizedFileType
    : !fileType || fileType === "application/octet-stream" ? extensionMime || "" : "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return reject(new Error("Choose a JPG, PNG, or WebP image."));
  if (file.size > MAX_IDENTITY_IMAGE_BYTES) return reject(new Error("Each identity image must be 5 MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl.startsWith("data:")) return reject(new Error("The image could not be read."));
    resolve(dataUrl.replace(/^data:[^;]+;/i, `data:${mime};`));
  };
  reader.onerror = () => reject(new Error("The image could not be read."));
  reader.readAsDataURL(file);
});

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("The selected image could not be opened."));
  image.src = source;
});

const drawIdCrop = (context: CanvasRenderingContext2D, width: number, height: number, crop: CropEditor) => {
  const radians = crop.rotation * Math.PI / 180;
  const boundWidth = Math.abs(crop.image.naturalWidth * Math.cos(radians)) + Math.abs(crop.image.naturalHeight * Math.sin(radians));
  const boundHeight = Math.abs(crop.image.naturalWidth * Math.sin(radians)) + Math.abs(crop.image.naturalHeight * Math.cos(radians));
  const scale = Math.max(width / boundWidth, height / boundHeight) * crop.zoom;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(
    width / 2 + crop.offsetX * width / ID_CROP_WIDTH,
    height / 2 + crop.offsetY * height / ID_CROP_HEIGHT,
  );
  context.rotate(radians);
  context.scale(scale, scale);
  context.drawImage(crop.image, -crop.image.naturalWidth / 2, -crop.image.naturalHeight / 2);
  context.restore();
};

const storedImageUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && /\/image\/upload\//.test(url.pathname);
  } catch {
    return false;
  }
};

const AmbassadorServicesPanel = () => {
  const { user } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selfieStreamRef = useRef<MediaStream | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const idInputRefs = useRef<Record<IdImageField, HTMLInputElement | null>>({ idFront: null, idBack: null });
  const [mode, setMode] = useState<"apply" | "find" | null>(() =>
    searchParams.get("ambassador") === "apply" ? "apply" : null);
  const [application, setApplication] = useState<Application | null>(null);
  const [ambassadors, setAmbassadors] = useState<PublicAmbassador[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [selfieCameraOpen, setSelfieCameraOpen] = useState(false);
  const [selfieCameraReady, setSelfieCameraReady] = useState(false);
  const [cropEditor, setCropEditor] = useState<CropEditor | null>(null);
  const [notice, setNotice] = useState<FeedbackNotice | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<ImageField, ImageUploadStatus>>({
    idFront: { state: "idle", progress: 0 },
    idBack: { state: "idle", progress: 0 },
    selfie: { state: "idle", progress: 0 },
  });
  const [form, setForm] = useState<FormState>({
    displayName: user?.displayName || user?.username || "",
    email: "",
    phone: user?.contactPhone || "",
    countryCode: "",
    regionCode: "",
    customRegion: "",
    services: ["all"],
    message: "",
    idFront: "",
    idBack: "",
    selfie: "",
  });

  const selectedCountry = countries.find((country) => country.isoCode === form.countryCode);
  const regions = useMemo(() => form.countryCode ? State.getStatesOfCountry(form.countryCode).sort((a, b) => a.name.localeCompare(b.name)) : [], [form.countryCode]);
  const selectedRegion = regions.find((region) => region.isoCode === form.regionCode);
  const selectedRegionName = selectedRegion?.name || form.customRegion.trim();
  const notify = useCallback((message: string, type: FeedbackNotice["type"] = "info") => setNotice({ message, type }), []);

  useEffect(() => {
    axiosClient.get<{ application: Application | null }>("/ambassadors/me")
      .then(({ data }) => setApplication(data.application))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user?.country || form.countryCode) return;
    const match = countries.find((country) => country.name.toLowerCase() === user.country?.toLowerCase() || country.isoCode === user.country?.toUpperCase());
    if (match) setForm((current) => ({ ...current, countryCode: match.isoCode }));
  }, [form.countryCode, user?.country]);

  useEffect(() => {
    if (mode !== "find") return;
    setDirectoryLoading(true);
    axiosClient.get<{ ambassadors: PublicAmbassador[] }>("/ambassadors", { params: { countryCode: countryFilter || undefined, service: serviceFilter } })
      .then(({ data }) => setAmbassadors(data.ambassadors || []))
      .catch(() => setAmbassadors([]))
      .finally(() => setDirectoryLoading(false));
  }, [countryFilter, mode, serviceFilter]);

  useEffect(() => {
    if (!selfieCameraOpen) return;
    let cancelled = false;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_unavailable");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        selfieStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setSelfieCameraReady(true);
      } catch {
        notify("Camera access is needed for the live selfie. Allow camera permission or try another browser.", "error");
        setSelfieCameraOpen(false);
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      selfieStreamRef.current?.getTracks().forEach((track) => track.stop());
      selfieStreamRef.current = null;
      setSelfieCameraReady(false);
    };
  }, [notify, selfieCameraOpen]);

  useEffect(() => {
    if (!cropEditor || !cropCanvasRef.current) return;
    const canvas = cropCanvasRef.current;
    const context = canvas.getContext("2d");
    if (context) drawIdCrop(context, canvas.width, canvas.height, cropEditor);
  }, [cropEditor]);

  const close = () => {
    setMode(null);
    setSelfieCameraOpen(false);
    if (searchParams.get("ambassador") === "apply") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("ambassador");
      setSearchParams(nextParams, { replace: true });
    }
  };
  const chooseService = (slug: string) => {
    setForm((current) => {
      if (slug === "all") return { ...current, services: ["all"] };
      const withoutAll = current.services.filter((item) => item !== "all");
      const services = withoutAll.includes(slug) ? withoutAll.filter((item) => item !== slug) : [...withoutAll, slug];
      return { ...current, services: services.length ? services : ["all"] };
    });
  };
  const selectImage = async (field: ImageField, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;
    if (field === "selfie") {
      input.value = "";
      return;
    }
    try {
      const source = await readImage(file);
      const image = await loadImage(source);
      setCropEditor({ field, image, zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 });
    } catch (err) {
      notify(err instanceof Error ? err.message : "The image could not be selected.", "error");
    } finally {
      input.value = "";
    }
  };
  const confirmCrop = () => {
    if (!cropEditor) return;
    const canvas = document.createElement("canvas");
    canvas.width = ID_CROP_OUTPUT_WIDTH;
    canvas.height = ID_CROP_OUTPUT_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) {
      notify("The cropped ID image could not be prepared. Please try again.", "error");
      return;
    }
    drawIdCrop(context, canvas.width, canvas.height, cropEditor);
    const croppedImage = canvas.toDataURL("image/jpeg", 0.94);
    setForm((current) => ({ ...current, [cropEditor.field]: croppedImage }));
    setUploadStatus((current) => ({ ...current, [cropEditor.field]: { state: "idle", progress: 0 } }));
    setCropEditor(null);
    notify(`${cropEditor.field === "idFront" ? "ID front" : "ID back"} crop confirmed.`, "success");
  };
  const startCropDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!cropEditor) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: cropEditor.offsetX,
      offsetY: cropEditor.offsetY,
    };
  };
  const moveCrop = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setCropEditor((current) => current ? {
      ...current,
      offsetX: drag.offsetX + (event.clientX - drag.x) * ID_CROP_WIDTH / bounds.width,
      offsetY: drag.offsetY + (event.clientY - drag.y) * ID_CROP_HEIGHT / bounds.height,
    } : current);
  };
  const uploadIdentityImage = async (field: ImageField, source: string) => {
    if (storedImageUrl(source)) return source;
    setUploadStatus((current) => ({ ...current, [field]: { state: "uploading", progress: 0 } }));
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("You are offline. Reconnect and retry this image upload.");
      }
      const { data } = await axiosClient.post<{ url: string }>("/uploads/image", {
        image: source,
        purpose: `ambassador-private-${field === "selfie" ? "selfie" : field === "idFront" ? "id-front" : "id-back"}`,
      }, {
        withCredentials: true,
        timeout: IDENTITY_UPLOAD_TIMEOUT_MS,
        headers: { "X-SMAJ-Silent": "true" },
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const progress = Math.round(progressEvent.loaded / progressEvent.total * 100);
          setUploadStatus((current) => ({ ...current, [field]: { state: "uploading", progress } }));
        },
      });
      if (!storedImageUrl(data.url)) throw new Error("Image storage did not return a saved media URL.");
      setForm((current) => ({ ...current, [field]: data.url }));
      setUploadStatus((current) => ({ ...current, [field]: { state: "uploaded", progress: 100 } }));
      return data.url;
    } catch (err: unknown) {
      setUploadStatus((current) => ({ ...current, [field]: { state: "error", progress: 0 } }));
      const message = isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message || "Image upload failed. Check your connection and retry."
        : err instanceof Error ? err.message : "Image upload failed. Check your connection and retry.";
      notify(`${field === "idFront" ? "ID front" : field === "idBack" ? "ID back" : "Live selfie"} upload failed: ${message}`, "error");
      throw err;
    }
  };
  const retryImageUpload = (field: ImageField) => {
    const image = form[field];
    if (image) void uploadIdentityImage(field, image).catch(() => undefined);
  };
  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      notify("Camera is still starting. Try capture again in a moment.", "warning");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      notify("The selfie could not be captured.", "error");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setForm((current) => ({ ...current, selfie: canvas.toDataURL("image/jpeg", 0.9) }));
    setUploadStatus((current) => ({ ...current, selfie: { state: "idle", progress: 0 } }));
    setSelfieCameraOpen(false);
    notify("Live selfie captured.", "success");
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      notify("Please correct the highlighted fields before submitting.", "error");
      return;
    }
    if (!selectedCountry || !selectedRegionName || !form.services.length) {
      notify("Choose a country, region, and at least one service.", "error");
      return;
    }
    const missingIdentity = [
      { value: form.idFront, label: "ID front" },
      { value: form.idBack, label: "ID back" },
      { value: form.selfie, label: "live selfie" },
    ].find((item) => !item.value);
    if (missingIdentity) {
      notify(`Add ${missingIdentity.label} before submitting.`, "error");
      return;
    }
    setSubmitting(true);
    try {
      const [frontResult, backResult, selfieResult] = await Promise.allSettled([
        uploadIdentityImage("idFront", form.idFront),
        uploadIdentityImage("idBack", form.idBack),
        uploadIdentityImage("selfie", form.selfie),
      ]);
      const failedUpload = [frontResult, backResult, selfieResult].find(result => result.status === "rejected");
      if (failedUpload?.status === "rejected") throw failedUpload.reason;
      if (frontResult.status !== "fulfilled" || backResult.status !== "fulfilled" || selfieResult.status !== "fulfilled") {
        throw new Error("Identity images could not be uploaded. Retry failed uploads.");
      }
      const [idFrontUrl, idBackUrl, selfieUrl] = [frontResult.value, backResult.value, selfieResult.value];
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("You are offline. Reconnect before submitting the application.");
      }
      const { data } = await axiosClient.post<{ application: Application }>("/ambassadors", {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        countryCode: selectedCountry.isoCode,
        countryName: selectedCountry.name,
        countryFlag: selectedCountry.flag,
        regionCode: selectedRegion?.isoCode || "LOCAL",
        regionName: selectedRegionName,
        services: form.services,
        message: form.message.trim(),
        idFrontUrl,
        idBackUrl,
        selfieUrl,
      }, { headers: { "X-SMAJ-Silent": "true" } });
      setApplication(data.application);
      notify("Your private ambassador application was submitted.", "success");
      close();
    } catch (err: unknown) {
      if (!isAxiosError(err) || !err.response) {
        notify(err instanceof Error ? err.message : "Application could not be submitted. Please retry.", "error");
      } else {
        notify(err.response.data?.message || "Application could not be submitted. Please retry.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    <section className="services-ambassador-card">
      <div className="services-ambassador-icon"><GroupsOutlinedIcon /></div>
      <div><small>SMAJ AMBASSADORS</small><h2>Represent SMAJ in your region</h2><p>Find trusted community ambassadors or apply across any SMAJ service.</p></div>
      <div className="services-ambassador-actions"><button type="button" onClick={() => setMode("find")}>Find ambassadors</button><button type="button" className="primary" onClick={() => setMode("apply")}>{application ? "My application" : "Become an ambassador"} <span>→</span></button></div>
      {application ? <strong className={`ambassador-status ${application.status}`}>{application.status}</strong> : null}
    </section>

    {mode ? <div className="ambassador-modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="ambassador-modal" role="dialog" aria-modal="true" aria-label={mode === "apply" ? "Ambassador application" : "Find ambassadors"} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>SMAJ AMBASSADORS</small><h2>{mode === "apply" ? "Private application" : "Find an ambassador"}</h2></div><button type="button" onClick={close} aria-label="Close"><CloseOutlinedIcon /></button></header>
        {mode === "find" ? <div className="ambassador-directory">
          <div className="ambassador-directory-filters"><select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="">🌍 All countries</option>{countries.map((country) => <option key={country.isoCode} value={country.isoCode}>{country.flag} {country.name}</option>)}</select><select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>{serviceOptions.map((service) => <option key={service.slug} value={service.slug}>{service.name}</option>)}</select></div>
          {directoryLoading ? <p>Loading ambassadors…</p> : ambassadors.length ? <div className="ambassador-directory-list">{ambassadors.map((ambassador) => <article key={ambassador._id}><span>{flagFor(ambassador.countryCode)}</span><div><strong>{ambassador.displayName}</strong><p>{ambassador.regionName}, {ambassador.countryName}</p><small>{ambassador.services.includes("all") ? "All SMAJ services" : ambassador.services.join(" · ")}</small></div><VerifiedUserOutlinedIcon /></article>)}</div> : <div className="ambassador-empty"><GroupsOutlinedIcon /><strong>No approved ambassadors found</strong><p>Try another country or service.</p></div>}
        </div> : application ? <div className="ambassador-application-status"><VerifiedUserOutlinedIcon /><h3>Application {application.status}</h3><p>{application.countryName} · {application.regionName}</p><small>Updated {new Date(application.updatedAt).toLocaleDateString()}</small>{application.status === "rejected" ? <button type="button" onClick={() => setApplication(null)}>Update and resubmit</button> : null}</div> : <form className="ambassador-form" noValidate onSubmit={submit}>
          <p className="ambassador-privacy-note"><VerifiedUserOutlinedIcon />Your ID and selfie are included only in the private admin review and never shown in the ambassador directory.</p>
          <label>Full name<input required maxLength={100} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <div className="ambassador-form-row"><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Phone<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></div>
          <div className="ambassador-form-row"><label>Country<select required value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value, regionCode: "", customRegion: "" })}><option value="">🌍 Select country</option>{countries.map((country) => <option key={country.isoCode} value={country.isoCode}>{country.flag} {country.name}</option>)}</select></label><label>Region{form.countryCode && !regions.length ? <input required value={form.customRegion} onChange={(event) => setForm({ ...form, customRegion: event.target.value })} placeholder={`${selectedCountry?.flag || "📍"} Region or local area`} /> : <select required disabled={!form.countryCode} value={form.regionCode} onChange={(event) => setForm({ ...form, regionCode: event.target.value })}><option value="">{form.countryCode ? `${selectedCountry?.flag || "📍"} Select region` : "Select country first"}</option>{regions.map((region) => <option key={`${region.countryCode}-${region.isoCode}`} value={region.isoCode}>{selectedCountry?.flag} {region.name}</option>)}</select>}</label></div>
          <label>Services<details className="ambassador-service-multiselect"><summary>{form.services.includes("all") ? "All SMAJ services" : `${form.services.length} services selected`}<span>⌄</span></summary><div className="ambassador-service-options" role="group" aria-label="Choose one or more services">{serviceOptions.map((service) => <label key={service.slug} className={form.services.includes(service.slug) ? "selected" : ""}><input type="checkbox" checked={form.services.includes(service.slug)} onChange={() => chooseService(service.slug)} /><span>{service.name}</span></label>)}</div></details></label>
          <label>Why do you want to become an ambassador?<textarea required minLength={20} maxLength={1500} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us about your local community and experience." /></label>
          <fieldset><legend>Private identity verification</legend><div className="ambassador-identity-grid">
            {([["idFront", "ID front"], ["idBack", "ID back"]] as const).map(([field, label]) => (
              <div className="ambassador-identity-control" key={field}>
                <button type="button" className={`ambassador-id-tile${form[field] ? " uploaded" : ""}`} disabled={submitting} onClick={() => idInputRefs.current[field]?.click()} aria-label={`${form[field] ? "Replace" : "Choose"} ${label} image`}>
                  {form[field] ? <img src={form[field]} alt={`${label} preview`} /> : <BadgeOutlinedIcon />}
                  <strong>{form[field] ? `${label} added` : label}</strong>
                  <span>{form[field] ? uploadStatus[field].state === "uploaded" ? "Uploaded · tap to replace" : "Tap to replace" : "JPG, PNG or WebP · max 5 MB"}</span>
                </button>
                <input ref={element => { idInputRefs.current[field] = element; }} className="ambassador-id-input" type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void selectImage(field, event)} />
                {uploadStatus[field].state === "uploading" ? <div className="ambassador-upload-progress" role="status"><span>Uploading {uploadStatus[field].progress}%</span><progress max="100" value={uploadStatus[field].progress} /></div> : null}
                {uploadStatus[field].state === "error" ? <div className="ambassador-upload-retry"><span>Upload failed</span><button type="button" disabled={submitting} onClick={() => retryImageUpload(field)}>Retry upload</button></div> : null}
              </div>
            ))}
            <div className="ambassador-identity-control">
              <button type="button" className={`ambassador-selfie-tile${form.selfie ? " uploaded" : ""}`} disabled={submitting} onClick={() => setSelfieCameraOpen(true)}>
                {form.selfie ? <img src={form.selfie} alt="Live selfie preview" /> : <PhotoCameraOutlinedIcon />}
                <strong>{form.selfie ? "Live selfie added" : "Live selfie"}</strong>
                <span>{form.selfie ? uploadStatus.selfie.state === "uploaded" ? "Uploaded · tap to retake" : "Tap to retake" : "Open camera to capture"}</span>
              </button>
              {uploadStatus.selfie.state === "uploading" ? <div className="ambassador-upload-progress" role="status"><span>Uploading {uploadStatus.selfie.progress}%</span><progress max="100" value={uploadStatus.selfie.progress} /></div> : null}
              {uploadStatus.selfie.state === "error" ? <div className="ambassador-upload-retry"><span>Upload failed</span><button type="button" disabled={submitting} onClick={() => retryImageUpload("selfie")}>Retry upload</button></div> : null}
            </div>
          </div></fieldset>
          <label className="ambassador-consent"><input required type="checkbox" />I confirm these details are mine and consent to private identity review.</label>
          <button type="submit" className="ambassador-submit" disabled={submitting}>{submitting ? "Uploading and submitting…" : "Submit private application"}</button>
        </form>}
      </section>
      {cropEditor ? <div className="ambassador-crop-backdrop" role="presentation">
        <section className="ambassador-crop-dialog" role="dialog" aria-modal="true" aria-label={`Crop ${cropEditor.field === "idFront" ? "ID front" : "ID back"}`}>
          <header><h3>Adjust {cropEditor.field === "idFront" ? "ID front" : "ID back"}</h3><button type="button" onClick={() => setCropEditor(null)} aria-label="Cancel crop"><CloseOutlinedIcon /></button></header>
          <p>Drag to position the document. Zoom or rotate before confirming.</p>
          <canvas ref={cropCanvasRef} width={ID_CROP_WIDTH} height={ID_CROP_HEIGHT} className="ambassador-crop-canvas" onPointerDown={startCropDrag} onPointerMove={moveCrop} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} />
          <label className="ambassador-crop-zoom">Zoom<input type="range" min="1" max="3" step="0.05" value={cropEditor.zoom} onChange={(event) => setCropEditor(current => current ? { ...current, zoom: Number(event.target.value) } : current)} /></label>
          <div className="ambassador-crop-actions"><button type="button" onClick={() => setCropEditor(current => current ? { ...current, rotation: (current.rotation + 270) % 360 } : current)}>Rotate left</button><button type="button" onClick={() => setCropEditor(current => current ? { ...current, rotation: (current.rotation + 90) % 360 } : current)}>Rotate right</button></div>
          <footer><button type="button" onClick={() => setCropEditor(null)}>Cancel</button><button type="button" className="primary" onClick={confirmCrop}>Confirm crop</button></footer>
        </section>
      </div> : null}
      {selfieCameraOpen ? (
        <div className="ambassador-selfie-camera" role="dialog" aria-modal="true" aria-label="Capture live selfie" onMouseDown={(event) => event.stopPropagation()}>
          <video ref={videoRef} autoPlay playsInline muted />
          <div>
            <button type="button" onClick={() => setSelfieCameraOpen(false)}>Cancel</button>
            <button type="button" className="primary" disabled={!selfieCameraReady} onClick={captureSelfie}>
              {selfieCameraReady ? "Capture" : "Starting camera"}
            </button>
          </div>
        </div>
      ) : null}
    </div> : null}
    {notice && (mode || notice.type === "success") ? <aside className={`ambassador-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"} aria-live={notice.type === "error" ? "assertive" : "polite"}>
      <span>{notice.message}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><CloseOutlinedIcon /></button>
    </aside> : null}
  </>;
};

export default AmbassadorServicesPanel;
