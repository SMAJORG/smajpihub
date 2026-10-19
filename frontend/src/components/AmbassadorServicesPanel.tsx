import "./AmbassadorServicesPanel.css";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { Country, State } from "country-state-city";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { axiosClient } from "../lib/axiosClient";
import { uploadImage } from "../lib/uploadImage";
import { serviceCatalog } from "../content/serviceCatalog";
import { useAuthContext } from "../contexts/AuthContext";

type Application = { _id: string; status: "pending" | "approved" | "rejected"; countryName: string; regionName: string; services: string[]; updatedAt: string };
type PublicAmbassador = { _id: string; displayName: string; countryName: string; countryCode: string; countryFlag: string; regionName: string; services: string[] };
type ImageField = "idFront" | "idBack" | "selfie";
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
const flagFor = (code: string) => code.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
const countries = Country.getAllCountries().map((country) => ({ ...country, flag: flagFor(country.isoCode) })).sort((a, b) => a.name.localeCompare(b.name));
const serviceOptions = [{ slug: "all", name: "All SMAJ services" }, ...serviceCatalog.map((service) => ({ slug: service.slug, name: service.name }))];

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  if (!file.type.startsWith("image/")) return reject(new Error("Choose a JPG, PNG, or WebP image."));
  if (file.size > MAX_IDENTITY_IMAGE_BYTES) return reject(new Error("Each identity image must be 5 MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("The image could not be read."));
  reader.readAsDataURL(file);
});

const AmbassadorServicesPanel = () => {
  const { user } = useAuthContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const selfieStreamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<"apply" | "find" | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [ambassadors, setAmbassadors] = useState<PublicAmbassador[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [selfieCameraOpen, setSelfieCameraOpen] = useState(false);
  const [selfieCameraReady, setSelfieCameraReady] = useState(false);
  const [error, setError] = useState("");
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
        setError("");
      } catch {
        setError("Camera access is needed for the live selfie. Allow camera permission or try another browser.");
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
  }, [selfieCameraOpen]);

  const close = () => { setMode(null); setSelfieCameraOpen(false); setError(""); };
  const chooseService = (slug: string) => {
    setForm((current) => {
      if (slug === "all") return { ...current, services: ["all"] };
      const withoutAll = current.services.filter((item) => item !== "all");
      const services = withoutAll.includes(slug) ? withoutAll.filter((item) => item !== slug) : [...withoutAll, slug];
      return { ...current, services: services.length ? services : ["all"] };
    });
  };
  const selectImage = async (field: ImageField, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const image = await readImage(file);
      setForm((current) => ({ ...current, [field]: image }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image could not be selected.");
    }
    event.target.value = "";
  };
  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is still starting. Try capture again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The selfie could not be captured.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setForm((current) => ({ ...current, selfie: canvas.toDataURL("image/jpeg", 0.9) }));
    setSelfieCameraOpen(false);
    setError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCountry || !selectedRegionName || !form.services.length) {
      setError("Choose a country, region, and at least one service.");
      return;
    }
    const missingIdentity = [
      { value: form.idFront, label: "ID front" },
      { value: form.idBack, label: "ID back" },
      { value: form.selfie, label: "live selfie" },
    ].find((item) => !item.value);
    if (missingIdentity) {
      setError(`Add ${missingIdentity.label} before submitting.`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const [idFrontUrl, idBackUrl, selfieUrl] = await Promise.all([
        uploadImage(form.idFront, "ambassador-private-id-front"),
        uploadImage(form.idBack, "ambassador-private-id-back"),
        uploadImage(form.selfie, "ambassador-private-selfie"),
      ]);
      const { data } = await axiosClient.post<{ application: Application }>("/ambassadors", {
        displayName: form.displayName,
        email: form.email,
        phone: form.phone,
        countryCode: selectedCountry.isoCode,
        countryName: selectedCountry.name,
        countryFlag: selectedCountry.flag,
        regionCode: selectedRegion?.isoCode || "LOCAL",
        regionName: selectedRegionName,
        services: form.services,
        message: form.message,
        idFrontUrl,
        idBackUrl,
        selfieUrl,
      });
      setApplication(data.application);
      close();
    } catch (err: unknown) {
      setError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Application could not be submitted." : err instanceof Error ? err.message : "Application could not be submitted.");
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
        </div> : application ? <div className="ambassador-application-status"><VerifiedUserOutlinedIcon /><h3>Application {application.status}</h3><p>{application.countryName} · {application.regionName}</p><small>Updated {new Date(application.updatedAt).toLocaleDateString()}</small>{application.status === "rejected" ? <button type="button" onClick={() => setApplication(null)}>Update and resubmit</button> : null}</div> : <form className="ambassador-form" onSubmit={submit}>
          <p className="ambassador-privacy-note"><VerifiedUserOutlinedIcon />Your ID and selfie are included only in the private admin review and never shown in the ambassador directory.</p>
          <label>Full name<input required maxLength={100} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <div className="ambassador-form-row"><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Phone<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></div>
          <div className="ambassador-form-row"><label>Country<select required value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value, regionCode: "", customRegion: "" })}><option value="">🌍 Select country</option>{countries.map((country) => <option key={country.isoCode} value={country.isoCode}>{country.flag} {country.name}</option>)}</select></label><label>Region{form.countryCode && !regions.length ? <input required value={form.customRegion} onChange={(event) => setForm({ ...form, customRegion: event.target.value })} placeholder={`${selectedCountry?.flag || "📍"} Region or local area`} /> : <select required disabled={!form.countryCode} value={form.regionCode} onChange={(event) => setForm({ ...form, regionCode: event.target.value })}><option value="">{form.countryCode ? `${selectedCountry?.flag || "📍"} Select region` : "Select country first"}</option>{regions.map((region) => <option key={`${region.countryCode}-${region.isoCode}`} value={region.isoCode}>{selectedCountry?.flag} {region.name}</option>)}</select>}</label></div>
          <label>Services<details className="ambassador-service-multiselect"><summary>{form.services.includes("all") ? "All SMAJ services" : `${form.services.length} services selected`}<span>⌄</span></summary><div className="ambassador-service-options" role="group" aria-label="Choose one or more services">{serviceOptions.map((service) => <label key={service.slug} className={form.services.includes(service.slug) ? "selected" : ""}><input type="checkbox" checked={form.services.includes(service.slug)} onChange={() => chooseService(service.slug)} /><span>{service.name}</span></label>)}</div></details></label>
          <label>Why do you want to become an ambassador?<textarea required minLength={20} maxLength={1500} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us about your local community and experience." /></label>
          <fieldset><legend>Private identity verification</legend><div className="ambassador-identity-grid">{([['idFront', 'ID front', 'environment'], ['idBack', 'ID back', 'environment']] as const).map(([field, label, capture]) => <label className={form[field] ? "uploaded" : ""} key={field}>{form[field] ? <img src={form[field]} alt={`${label} preview`} /> : <BadgeOutlinedIcon />}<strong>{form[field] ? `${label} added` : label}</strong><span>{form[field] ? "Tap to replace" : "JPG, PNG or WebP · max 5 MB"}</span><input type="file" accept="image/jpeg,image/png,image/webp" capture={capture} onChange={(event) => void selectImage(field, event)} /></label>)}<button type="button" className={`ambassador-selfie-tile${form.selfie ? " uploaded" : ""}`} onClick={() => setSelfieCameraOpen(true)}>{form.selfie ? <img src={form.selfie} alt="Live selfie preview" /> : <PhotoCameraOutlinedIcon />}<strong>{form.selfie ? "Live selfie added" : "Live selfie"}</strong><span>{form.selfie ? "Tap to retake" : "Open camera to capture"}</span></button></div></fieldset>
          <label className="ambassador-consent"><input required type="checkbox" />I confirm these details are mine and consent to private identity review.</label>
          {error ? <p className="ambassador-form-error" role="alert">{error}</p> : null}
          <button className="ambassador-submit" disabled={submitting}>{submitting ? "Uploading and submitting…" : "Submit private application"}</button>
        </form>}
      </section>
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
  </>;
};

export default AmbassadorServicesPanel;
