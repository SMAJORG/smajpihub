import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { useAuthContext } from "../../contexts/AuthContext";
import TrustBadge from "../../components/TrustBadge";
import UserAvatarFrame from "../../components/UserAvatarFrame";
import { axiosClient } from "../../lib/axiosClient";
import { uploadImage } from "../../lib/uploadImage";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";

const countryCodes = [
  "AE",
  "US",
  "GB",
  "NG",
  "IN",
  "CN",
  "ID",
  "VN",
  "PH",
  "PK",
  "BD",
  "BR",
  "TR",
  "RU",
  "KR",
  "JP",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "CA",
  "AU",
  "SA",
  "ZA",
  "EG",
  "MA",
  "KE",
  "GH",
  "CM",
  "CI",
  "SN",
  "TZ",
  "UG",
  "ET",
  "RW",
  "DZ",
  "TN",
  "LY",
  "SD",
  "SS",
  "AO",
  "BJ",
  "BW",
  "BF",
  "BI",
  "CV",
  "CF",
  "TD",
  "KM",
  "CG",
  "CD",
  "DJ",
  "GQ",
  "ER",
  "SZ",
  "GA",
  "GM",
  "GN",
  "GW",
  "LS",
  "LR",
  "MG",
  "MW",
  "ML",
  "MR",
  "MU",
  "MZ",
  "NA",
  "NE",
  "SC",
  "SL",
  "SO",
  "TG",
  "ZM",
  "ZW",
  "AF",
  "AL",
  "AD",
  "AR",
  "AM",
  "AT",
  "AZ",
  "BS",
  "BH",
  "BB",
  "BY",
  "BE",
  "BZ",
  "BT",
  "BO",
  "BA",
  "BN",
  "BG",
  "KH",
  "CL",
  "CO",
  "CR",
  "HR",
  "CY",
  "CZ",
  "DK",
  "DO",
  "EC",
  "SV",
  "EE",
  "FJ",
  "FI",
  "GE",
  "GR",
  "GT",
  "GY",
  "HN",
  "HK",
  "HU",
  "IS",
  "IE",
  "IL",
  "JM",
  "JO",
  "KZ",
  "KW",
  "KG",
  "LA",
  "LV",
  "LB",
  "LI",
  "LT",
  "LU",
  "MO",
  "MY",
  "MV",
  "MT",
  "MX",
  "MD",
  "MC",
  "MN",
  "ME",
  "MM",
  "NP",
  "NZ",
  "NI",
  "MK",
  "NO",
  "OM",
  "PA",
  "PY",
  "PE",
  "PL",
  "PT",
  "QA",
  "RO",
  "RS",
  "SG",
  "SK",
  "SI",
  "LK",
  "SE",
  "CH",
  "TW",
  "TJ",
  "TH",
  "UA",
  "UY",
  "UZ",
  "VA",
  "VE",
] as const;
const priorityCountries = new Set(["AE", "US", "GB", "NG", "IN", "ID", "VN", "PH", "PK", "BD", "BR", "TR"]);
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes
  .map(code => ({
    code,
    name: countryNames.of(code) || code,
    flag: code.replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0))),
  }))
  .sort(
    (a, b) =>
      Number(priorityCountries.has(b.code)) - Number(priorityCountries.has(a.code)) || a.name.localeCompare(b.name)
  );

const cleanLanguages = [
  { name: "English", native: "United Kingdom", flag: "GB" },
  { name: "Arabic", native: "Arabic", flag: "AE" },
  { name: "French", native: "Francais", flag: "FR" },
  { name: "Spanish", native: "Espanol", flag: "ES" },
  { name: "Portuguese", native: "Portugues", flag: "PT" },
  { name: "Hindi", native: "Hindi", flag: "IN" },
  { name: "Urdu", native: "Urdu", flag: "PK" },
  { name: "Bengali", native: "Bangla", flag: "BD" },
  { name: "Indonesian", native: "Bahasa Indonesia", flag: "ID" },
  { name: "Vietnamese", native: "Tieng Viet", flag: "VN" },
  { name: "Filipino", native: "Filipino", flag: "PH" },
  { name: "Chinese", native: "Chinese", flag: "CN" },
  { name: "Japanese", native: "Japanese", flag: "JP" },
  { name: "Korean", native: "Korean", flag: "KR" },
  { name: "German", native: "Deutsch", flag: "DE" },
  { name: "Italian", native: "Italiano", flag: "IT" },
  { name: "Dutch", native: "Nederlands", flag: "NL" },
  { name: "Russian", native: "Russian", flag: "RU" },
  { name: "Turkish", native: "Turkce", flag: "TR" },
  { name: "Swahili", native: "Kiswahili", flag: "KE" },
  { name: "Hausa", native: "Hausa", flag: "NG" },
  { name: "Yoruba", native: "Yoruba", flag: "NG" },
  { name: "Igbo", native: "Igbo", flag: "NG" },
  { name: "Amharic", native: "Amharic", flag: "ET" },
] as const;
const FlagIcon = ({ code, label }: { code: string; label: string }) => (
  <img
    className="profile-picker-flag"
    src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
    alt=""
    aria-label={label}
    loading="lazy"
  />
);
type BackendErrorBody = { message?: string; error?: string };
type CropTarget = "avatar" | "cover";
type CropFrame = { x: number; y: number; w: number; h: number };
type CropHandle = "move" | "nw" | "ne" | "se" | "sw";
type CropState = { target: CropTarget; source: string; frame: CropFrame };
type AlertState = { type: "success" | "error"; text: string };
type PickerPosition = { position: "fixed"; top: number; left: number; width: number; maxHeight: number };

const getPickerPosition = (trigger: HTMLElement | null): PickerPosition | null => {
  if (!trigger) return null;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportWidth = viewport?.width || window.innerWidth;
  const bounds = trigger.getBoundingClientRect();
  const anchorTop = bounds.top + viewportTop;
  const anchorBottom = bounds.bottom + viewportTop;
  const spaceAbove = anchorTop - viewportTop - 8;
  const spaceBelow = viewportTop + viewportHeight - anchorBottom - 8;
  const openAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
  const availableHeight = Math.max(80, openAbove ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(420, availableHeight - 8, Math.max(72, viewportHeight - 16));
  const width = Math.min(Math.max(bounds.width, 280), Math.max(1, viewportWidth - 24));
  const left = Math.max(
    viewportLeft + 12,
    Math.min(bounds.left + viewportLeft, viewportLeft + viewportWidth - width - 12),
  );
  const desiredTop = openAbove
    ? Math.max(viewportTop + 8, anchorTop - maxHeight - 8)
    : anchorBottom + 8;
  const top = Math.max(viewportTop + 8, Math.min(desiredTop, viewportTop + viewportHeight - maxHeight - 8));
  return { position: "fixed", top, left, width, maxHeight };
};

const formatJoinDate = (value?: string) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(date);
};

const cropConfig = {
  avatar: { width: 512, height: 512, label: "Profile picture" },
  cover: { width: 1640, height: 624, label: "Profile banner" },
} as const;

const initialCropFrame = (target: CropTarget): CropFrame =>
  target === "cover" ? { x: 6, y: 12, w: 88, h: 56 } : { x: 12, y: 12, w: 76, h: 76 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readImageFile = (file: File, onLoad: (value: string) => void, onError: (message: string) => void) => {
  if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) {
    onError("Choose an image up to 4 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ""));
  reader.onerror = () => onError("Could not read that image.");
  reader.readAsDataURL(file);
};

const cropImage = (crop: CropState) =>
  new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const { target, frame } = crop;
      const { width, height } = cropConfig[target];
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not available"));
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const renderedWidth = image.naturalWidth * scale;
      const renderedHeight = image.naturalHeight * scale;
      const dx = (width - renderedWidth) / 2;
      const dy = (height - renderedHeight) / 2;
      const sx = clamp(((frame.x / 100) * width - dx) / scale, 0, image.naturalWidth);
      const sy = clamp(((frame.y / 100) * height - dy) / scale, 0, image.naturalHeight);
      const sw = clamp(((frame.w / 100) * width) / scale, 1, image.naturalWidth - sx);
      const sh = clamp(((frame.h / 100) * height) / scale, 1, image.naturalHeight - sy);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    image.onerror = reject;
    image.src = crop.source;
  });

const uploadProfileImage = async (image: string, purpose: string) => {
  if (!image) return "";
  return uploadImage(image, purpose);
};

const ProfilePage = () => {
  const { user, updateProfile } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = searchParams.get("returnTo");
  const [editing, setEditing] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [stats, setStats] = useState({ totalProducts: 0, successfulOrders: 0 });
  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [countryPosition, setCountryPosition] = useState<PickerPosition | null>(null);
  const [languagePosition, setLanguagePosition] = useState<PickerPosition | null>(null);
  const countryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const languageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const cropPreviewRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ handle: CropHandle; startX: number; startY: number; startFrame: CropFrame } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [sellerSaving, setSellerSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    country: "",
    contactPhone: "",
    avatar: "",
    coverImage: "",
    bio: "",
    language: "English",
    sellerActive: false,
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      displayName: user.displayName || user.username || "",
      country: user.country || "",
      contactPhone: user.contactPhone || "",
      avatar: user.avatar || "",
      coverImage: user.coverImage || "",
      bio: user.bio || "",
      language: user.language || user.settings?.language || "English",
      sellerActive: Boolean(user.sellerActive || user.role === "seller"),
    });
  }, [user]);

  useEffect(() => {
    if (searchParams.get("edit") !== "1") return;
    setEditing(true);
    setSearchParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("edit");
        return next;
      },
      { replace: true }
    );
    window.requestAnimationFrame(() =>
      document.querySelector(".real-profile-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    axiosClient
      .get("/user/stats")
      .then(({ data }) => setStats(data.stats))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => setAlert(null), 3000);
    return () => window.clearTimeout(timer);
  }, [alert]);

  useEffect(() => {
    if (!countryOpen) return;
    let frame = 0;
    const updatePosition = () => {
      const position = getPickerPosition(countryTriggerRef.current);
      if (position) setCountryPosition(position);
    };
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };
    schedulePosition();
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("scroll", schedulePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      window.visualViewport?.removeEventListener("resize", schedulePosition);
      window.visualViewport?.removeEventListener("scroll", schedulePosition);
    };
  }, [countryOpen]);

  useEffect(() => {
    if (!languageOpen) return;
    let frame = 0;
    const updatePosition = () => {
      const position = getPickerPosition(languageTriggerRef.current);
      if (position) setLanguagePosition(position);
    };
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };
    schedulePosition();
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    window.visualViewport?.addEventListener("resize", schedulePosition);
    window.visualViewport?.addEventListener("scroll", schedulePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      window.visualViewport?.removeEventListener("resize", schedulePosition);
      window.visualViewport?.removeEventListener("scroll", schedulePosition);
    };
  }, [languageOpen]);

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    return countries
      .filter(
        country => !query || country.name.toLowerCase().includes(query) || country.code.toLowerCase().includes(query)
      )
      .slice(0, 220);
  }, [countrySearch]);
  const filteredLanguages = useMemo(() => {
    const query = languageSearch.trim().toLowerCase();
    return cleanLanguages.filter(
      language => !query || language.name.toLowerCase().includes(query) || language.native.toLowerCase().includes(query)
    );
  }, [languageSearch]);

  const name = form.displayName || user?.displayName || user?.username || "Pi User";
  const username = user?.piUsername || user?.username || "pi-user";
  const joined = formatJoinDate(user?.createdAt);
  const sellerActive = Boolean(form.sellerActive);
  const selectedCountry = countries.find(country => country.name === form.country || country.code === form.country);
  const selectedLanguage =
    cleanLanguages.find(language => language.name === form.language || language.native === form.language) ||
    cleanLanguages[0];

  const beginCrop = (target: CropTarget, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    readImageFile(
      file,
      source => {
        setEditing(true);
        setCrop({ target, source, frame: initialCropFrame(target) });
      },
      text => setAlert({ type: "error", text })
    );
  };

  const openCoverPicker = () => {
    coverInputRef.current?.click();
  };

  const updateCropFrame = (handle: CropHandle, event: PointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    const preview = cropPreviewRef.current;
    if (!drag || !preview) return;
    const rect = preview.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startY) / rect.height) * 100;
    const minSize = crop?.target === "cover" ? 28 : 34;
    const start = drag.startFrame;

    setCrop(current => {
      if (!current) return current;
      if (handle === "move") {
        return {
          ...current,
          frame: {
            ...start,
            x: clamp(start.x + dx, 0, 100 - start.w),
            y: clamp(start.y + dy, 0, 100 - start.h),
          },
        };
      }

      let x = start.x;
      let y = start.y;
      if (current.target === "cover") {
        let width = start.w;
        let height = start.h;
        if (handle === "nw" || handle === "sw") {
          width = clamp(start.w - dx, minSize, 96);
          x = start.x + start.w - width;
        }
        if (handle === "ne" || handle === "se") width = clamp(start.w + dx, minSize, 96 - start.x);
        if (handle === "nw" || handle === "ne") {
          height = clamp(start.h - dy, minSize, 90);
          y = start.y + start.h - height;
        }
        if (handle === "sw" || handle === "se") height = clamp(start.h + dy, minSize, 90 - start.y);
        x = clamp(x, 0, 100 - width);
        y = clamp(y, 0, 100 - height);
        return { ...current, frame: { x, y, w: width, h: height } };
      }

      let size = start.w;
      const change =
        handle === "nw"
          ? Math.max(-dx, -dy)
          : handle === "ne"
            ? Math.max(dx, -dy)
            : handle === "sw"
              ? Math.max(-dx, dy)
              : Math.max(dx, dy);
      size = clamp(start.w + change, minSize, 96);
      if (handle === "nw" || handle === "sw") x = start.x + start.w - size;
      if (handle === "nw" || handle === "ne") y = start.y + start.h - size;
      x = clamp(x, 0, 100 - size);
      y = clamp(y, 0, 100 - size);
      return { ...current, frame: { x, y, w: size, h: size } };
    });
  };

  const startCropDrag = (handle: CropHandle, event: PointerEvent<HTMLElement>) => {
    if (!crop) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { handle, startX: event.clientX, startY: event.clientY, startFrame: crop.frame };
  };

  const dragCropFrame = (event: PointerEvent<HTMLElement>) => {
    const handle = cropDragRef.current?.handle;
    if (!handle) return;
    updateCropFrame(handle, event);
  };

  const stopCropDrag = (event: PointerEvent<HTMLElement>) => {
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const applyCrop = async () => {
    if (!crop) return;
    try {
      const cropped = await cropImage(crop);
      setForm(current =>
        crop.target === "avatar" ? { ...current, avatar: cropped } : { ...current, coverImage: cropped }
      );
      setCrop(null);
      setAlert({
        type: "success",
        text: `${cropConfig[crop.target].label} ready. Save changes to update your profile.`,
      });
    } catch {
      setAlert({ type: "error", text: "Could not crop image. Please try another file." });
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAlert(null);
    try {
      setSaving(true);
      const [avatar, coverImage] = await Promise.all([
        uploadProfileImage(form.avatar, "profile-avatar"),
        uploadProfileImage(form.coverImage, "profile-banner"),
      ]);
      await updateProfile({
        ...form,
        avatar,
        coverImage,
        bio: form.bio.trim(),
        role: user?.role === "admin" ? "admin" : form.sellerActive ? "seller" : "buyer",
      });
      setForm(current => ({ ...current, avatar, coverImage }));
      setAlert({ type: "success", text: "Saved. Your profile changes are live." });
      setEditing(false);
      if (returnTo?.startsWith("/")) navigate(returnTo);
    } catch (err: unknown) {
      setAlert({
        type: "error",
        text: isAxiosError<BackendErrorBody>(err)
          ? err.response?.data?.message || "Profile was not saved. Try again."
          : err instanceof Error
            ? err.message
            : "Profile was not saved. Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSeller = async () => {
    const next = !sellerActive;
    const nextForm = { ...form, sellerActive: next };
    setForm(nextForm);
    setAlert(null);
    setSellerSaving(true);
    try {
      const updatedUser = await updateProfile({
        ...nextForm,
        role: user?.role === "admin" ? "admin" : next ? "seller" : "buyer",
      });
      const active = updatedUser ? Boolean(updatedUser.sellerActive || updatedUser.role === "seller") : next;
      setForm(current => ({ ...current, sellerActive: active }));
      setAlert({
        type: "success",
        text: active ? "Seller tools activated. You can list products now." : "Seller tools deactivated.",
      });
    } catch (err: unknown) {
      setForm(form);
      setAlert({
        type: "error",
        text: isAxiosError<BackendErrorBody>(err)
          ? err.response?.data?.message || "Seller tools were not updated. Try again."
          : err instanceof Error
            ? err.message
            : "Seller tools were not updated. Try again.",
      });
    } finally {
      setSellerSaving(false);
    }
  };

  return (
    <main className="private-page real-profile-page">
      <input
        id="profileAvatarUpload"
        className="profile-file-input"
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={event => beginCrop("avatar", event)}
      />
      <input
        id="profileCoverUpload"
        className="profile-file-input"
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={event => beginCrop("cover", event)}
      />

      <section className="real-profile-hero">
        <button
          type="button"
          className="real-profile-cover"
          style={form.coverImage ? { backgroundImage: `url(${form.coverImage})` } : undefined}
          onClick={openCoverPicker}
          aria-label="Edit profile banner"
        >
          <span className="real-profile-cover-edit" aria-hidden="true">
            <EditOutlinedIcon /> Edit Banner
          </span>
        </button>
        <div className="real-profile-identity">
          <button
            type="button"
            className="real-profile-avatar"
            aria-label="Upload profile picture"
            onClick={() => avatarInputRef.current?.click()}
          >
            <div className="real-profile-avatar-photo" aria-hidden="true">
              <UserAvatarFrame name={name} image={form.avatar} frame={user?.activeAvatarFrame} size={104} />
            </div>
            <span>
              <CameraAltOutlinedIcon />
            </span>
          </button>
          <div>
            <h1 className="profile-name-line">
              <span className="profile-name-text">{name}</span>
              <TrustBadge userId={user?.uid} />
            </h1>
            <span className="profile-username">@{username}</span>
            <div className="real-profile-badges">
              <b>{sellerActive ? "Seller enabled" : "Buyer account"}</b>
            </div>
          </div>
          <div className="real-profile-controls">
            <div className="real-profile-actions">
              <button className="private-primary-button" type="button" onClick={() => setEditing(true)}>
                Edit Profile
              </button>
              {sellerActive ? (
                <Link className="private-secondary-button" to="/seller">
                  Seller Dashboard
                </Link>
              ) : null}
            </div>
            <Link className="profile-frames-navigation" to="/profile/frames">
              <span>Avatar Frames</span>
              <ChevronRightOutlinedIcon aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {alert ? <div className={`private-alert floating-alert ${alert.type}`}>{alert.text}</div> : null}

      {!editing ? (
        <>
          <section className="real-profile-stats">
            <article>
              <Inventory2OutlinedIcon />
              <span>Products</span>
              <strong>{stats.totalProducts}</strong>
            </article>
            <article>
              <StorefrontOutlinedIcon />
              <span>Successful Orders</span>
              <strong>{stats.successfulOrders}</strong>
            </article>
            <article>
              <VerifiedUserOutlinedIcon />
              <span>Verification</span>
            </article>
          </section>

          <section className="real-profile-grid">
            <article className="real-profile-card real-profile-about">
              <div className="real-profile-card-head">
                <AccountCircleOutlinedIcon />
                <h2>About</h2>
              </div>
              <p>
                {user?.bio || "Add a short bio so buyers, sellers, and partners understand who you are on SMAJ PI HUB."}
              </p>
            </article>

            <article className="real-profile-card">
              <div className="real-profile-card-head">
                <BadgeOutlinedIcon />
                <h2>Account Details</h2>
              </div>
              <dl>
                <div>
                  <dt>Pi Username</dt>
                  <dd>@{username}</dd>
                </div>
                <div>
                  <dt>Joined</dt>
                  <dd>{joined}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>
                    {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.name}` : user?.country || "Not set"}
                  </dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{user?.contactPhone || "Not set"}</dd>
                </div>
              </dl>
            </article>

            <article className="real-profile-card">
              <div className="real-profile-card-head">
                <StorefrontOutlinedIcon />
                <h2>Seller Profile</h2>
              </div>
              <p>
                {sellerActive
                  ? "Seller tools are active. Your listings can be reviewed and approved for SMAJ Store."
                  : "Use one verified Pi identity to activate seller tools when you are ready to list products."}
              </p>
              <div className="form-actions">
                <button
                  className="private-secondary-button"
                  type="button"
                  disabled={sellerSaving}
                  onClick={() => void toggleSeller()}
                >
                  {sellerSaving ? "Saving..." : sellerActive ? "Deactivate Seller Tools" : "Activate Seller Tools"}
                </button>
                {sellerActive ? (
                  <Link className="private-primary-button" to="/add-product">
                    Add Product
                  </Link>
                ) : null}
              </div>
            </article>

            <article className="real-profile-card">
              <div className="real-profile-card-head">
                <LanguageOutlinedIcon />
                <h2>Preferences</h2>
              </div>
              <dl>
                <div>
                  <dt>Language</dt>
                  <dd>{form.language}</dd>
                </div>
                <div>
                  <dt>Account Status</dt>
                  <dd>Active</dd>
                </div>
                <div>
                  <dt>Public Preview</dt>
                  <dd>
                    {sellerActive ? (
                      <Link to={`/seller/${user?.uid}`}>View seller profile</Link>
                    ) : (
                      "Available after seller activation"
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          </section>
        </>
      ) : (
        <form className="private-form real-profile-form" onSubmit={submit}>
          <section>
            <h2>Personal Information</h2>
            <label>
              Display name
              <input
                required
                maxLength={80}
                value={form.displayName}
                onChange={event => setForm({ ...form, displayName: event.target.value })}
              />
            </label>
            <label>
              Pi username
              <input value={`@${username}`} disabled />
              <small>Pi username is managed by Pi authentication.</small>
            </label>
            <label>
              Bio / About
              <textarea
                maxLength={500}
                rows={4}
                value={form.bio}
                onChange={event => setForm({ ...form, bio: event.target.value })}
                placeholder="Tell buyers and sellers who you are, what you do, and how you use SMAJ PI HUB."
              />
              <small className="form-help">{form.bio.length}/500 characters.</small>
            </label>
            <div className="private-form-row">
              <div className="country-picker-label">
                Country
                <button
                  type="button"
                  ref={countryTriggerRef}
                  className="country-picker-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={countryOpen}
                  onClick={() => {
                    if (countryOpen) {
                      setCountryOpen(false);
                      setCountryPosition(null);
                    } else {
                      setLanguageOpen(false);
                      setLanguagePosition(null);
                      setCountryPosition(getPickerPosition(countryTriggerRef.current));
                      setCountryOpen(true);
                      setCountrySearch("");
                    }
                  }}
                >
                  {selectedCountry ? <FlagIcon code={selectedCountry.code} label={selectedCountry.name} /> : null}
                  <span>{selectedCountry ? selectedCountry.name : form.country || "Choose country"}</span>
                </button>
              </div>
              <div className="language-picker-label">
                Language
                <button
                  type="button"
                  ref={languageTriggerRef}
                  className="language-picker-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={languageOpen}
                  onClick={() => {
                    if (languageOpen) {
                      setLanguageOpen(false);
                      setLanguagePosition(null);
                    } else {
                      setCountryOpen(false);
                      setCountryPosition(null);
                      setLanguagePosition(getPickerPosition(languageTriggerRef.current));
                      setLanguageOpen(true);
                      setLanguageSearch("");
                    }
                  }}
                >
                  <FlagIcon code={selectedLanguage.flag} label={selectedLanguage.name} />
                  <strong>{selectedLanguage.name}</strong>
                  <small>{selectedLanguage.native}</small>
                </button>
              </div>
            </div>
            <label>
              Phone / WhatsApp
              <input
                maxLength={40}
                value={form.contactPhone}
                onChange={event => setForm({ ...form, contactPhone: event.target.value })}
                placeholder="+971 50 123 4567"
              />
            </label>
          </section>

          <label className="setting-line">
            <span>
              <strong>Seller profile</strong>
              <small>Unlock seller tools under this same verified Pi account.</small>
            </span>
            <input
              type="checkbox"
              checked={form.sellerActive}
              onChange={event => setForm({ ...form, sellerActive: event.target.checked })}
            />
          </label>

          <div className="form-actions">
            <button className="private-primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="private-secondary-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {countryOpen && countryPosition ? createPortal(
        <div className="country-picker-panel" role="listbox" style={countryPosition}>
          <input
            autoFocus
            value={countrySearch}
            onChange={event => setCountrySearch(event.target.value)}
            placeholder="Search country or scroll..."
          />
          <div>
            {filteredCountries.map(country => (
              <button
                type="button"
                key={country.code}
                onClick={() => {
                  setForm({ ...form, country: country.name });
                  setCountrySearch("");
                  setCountryOpen(false);
                  setCountryPosition(null);
                  setLanguageOpen(false);
                }}
              >
                <FlagIcon code={country.code} label={country.name} />
                <strong>{country.name}</strong>
                {priorityCountries.has(country.code) ? <small>High Pi community</small> : null}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
      {languageOpen && languagePosition ? createPortal(
        <div className="language-picker-panel" role="listbox" style={languagePosition}>
          <input
            autoFocus
            value={languageSearch}
            onChange={event => setLanguageSearch(event.target.value)}
            placeholder="Search language..."
          />
          <div>
            {filteredLanguages.map(language => (
              <button
                type="button"
                key={language.name}
                className={language.name === form.language ? "active" : ""}
                onClick={() => {
                  setForm({ ...form, language: language.name });
                  setLanguageSearch("");
                  setLanguageOpen(false);
                  setLanguagePosition(null);
                  setCountryOpen(false);
                }}
              >
                <FlagIcon code={language.flag} label={language.name} />
                <strong>{language.name}</strong>
                <small>{language.native}</small>
                {language.name === form.language ? <b>✓</b> : null}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}

      {crop ? (
        <div className="crop-modal-backdrop">
          <section className="crop-modal">
            <h2>Crop {cropConfig[crop.target].label}</h2>
            <div ref={cropPreviewRef} className={`crop-preview crop-preview-${crop.target}`}>
              <img src={crop.source} alt="" />
              <span
                className="crop-frame"
                style={{
                  left: `${crop.frame.x}%`,
                  top: `${crop.frame.y}%`,
                  width: `${crop.frame.w}%`,
                  height: `${crop.frame.h}%`,
                }}
                onPointerDown={event => startCropDrag("move", event)}
                onPointerMove={dragCropFrame}
                onPointerUp={stopCropDrag}
                onPointerCancel={stopCropDrag}
                role="presentation"
              >
                <i
                  onPointerDown={event => startCropDrag("nw", event)}
                  onPointerMove={dragCropFrame}
                  onPointerUp={stopCropDrag}
                  onPointerCancel={stopCropDrag}
                />
                <i
                  onPointerDown={event => startCropDrag("ne", event)}
                  onPointerMove={dragCropFrame}
                  onPointerUp={stopCropDrag}
                  onPointerCancel={stopCropDrag}
                />
                <i
                  onPointerDown={event => startCropDrag("se", event)}
                  onPointerMove={dragCropFrame}
                  onPointerUp={stopCropDrag}
                  onPointerCancel={stopCropDrag}
                />
                <i
                  onPointerDown={event => startCropDrag("sw", event)}
                  onPointerMove={dragCropFrame}
                  onPointerUp={stopCropDrag}
                  onPointerCancel={stopCropDrag}
                />
              </span>
            </div>
            <p>Drag the frame or pull a corner, then save the selected area.</p>
            <div className="form-actions">
              <button type="button" className="private-primary-button" onClick={() => void applyCrop()}>
                Use Image
              </button>
              <button
                type="button"
                className="private-secondary-button"
                onClick={() => (crop.target === "cover" ? coverInputRef.current : avatarInputRef.current)?.click()}
              >
                Choose Another
              </button>
              <button type="button" className="private-secondary-button" onClick={() => setCrop(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default ProfilePage;
