import crypto from "crypto";
import env from "../environments";

type CloudinaryResponse = {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  type?: string;
};

export type CloudinaryUpload = {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  storage: "cloudinary" | "existing";
};

export const isBase64Image = (value?: unknown) =>
  typeof value === "string" && value.startsWith("data:image/");

const isSupportedBase64Image = (value: string) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value);
const isHttpsUrl = (value: string) => /^https:\/\/[^\s]+$/i.test(value);
const isBase64Pdf = (value: unknown): value is string =>
  typeof value === "string" && /^data:application\/pdf;base64,/i.test(value);

export const sanitizeAssetName = (value: unknown, fallback = "image") => {
  const safeName = String(value || fallback)
    .replace(/[\/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safeName || fallback;
};

export const safePurpose = (value: unknown) => sanitizeAssetName(value, "image").toLowerCase().slice(0, 40) || "image";

export const uploadImageToCloudinary = async (image: string, purpose = "image", originalName = "image"): Promise<CloudinaryUpload> => {
  if (!isSupportedBase64Image(image)) {
    throw Object.assign(new Error("Upload a valid image file."), { statusCode: 400 });
  }

  if (image.length > 6_500_000) {
    throw Object.assign(new Error("Image must be smaller than 5 MB."), { statusCode: 413 });
  }

  if (!env.cloudinary_cloud_name || !env.cloudinary_upload_preset) {
    throw Object.assign(new Error("Cloudinary upload is not configured."), { statusCode: 503 });
  }

  const params = new URLSearchParams();
  params.set("file", image);
  params.set("upload_preset", env.cloudinary_upload_preset);
  params.set("filename_override", sanitizeAssetName(originalName || purpose));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinary_cloud_name}/image/upload`, {
    method: "POST",
    body: params,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Cloudinary upload failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as CloudinaryResponse;
  if (!data.secure_url || !data.secure_url.startsWith("https://res.cloudinary.com/")) {
    throw new Error("Cloudinary did not return a secure image URL");
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    format: data.format,
    storage: "cloudinary",
  };
};

export const uploadPdfToCloudinary = async (document: string, purpose = "document", originalName = "document.pdf") => {
  if (!isBase64Pdf(document)) throw Object.assign(new Error("Upload a valid PDF file."), { statusCode: 400 });
  if (document.length > 7_000_000) throw Object.assign(new Error("PDF must be 5 MB or smaller."), { statusCode: 413 });
  if (!env.cloudinary_cloud_name || !env.cloudinary_upload_preset)
    throw Object.assign(new Error("Cloudinary upload is not configured."), { statusCode: 503 });
  const params = new URLSearchParams();
  params.set("file", document);
  params.set("upload_preset", env.cloudinary_upload_preset);
  params.set("filename_override", sanitizeAssetName(originalName, "document.pdf"));
  params.set("folder", `${env.cloudinary_folder}/${safePurpose(purpose)}`);
  const protectedCv = safePurpose(purpose) === "jobs-private-cv";
  if (protectedCv) {
    const secret = env.cloudinary_api_secret, key = env.cloudinary_api_key;
    if (!secret || !key) throw Object.assign(new Error("Protected CV storage is not configured"), { statusCode: 503 });
    params.delete("upload_preset");
    params.set("timestamp", String(Math.floor(Date.now() / 1000)));
    params.set("type", "authenticated");
    const signed = [...params.entries()].filter(([k]) => k !== "file").sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => k + "=" + v).join("&");
    params.set("signature", crypto.createHash("sha1").update(signed + secret).digest("hex"));
    params.set("api_key", key);
  }
  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinary_cloud_name}/raw/upload`, {
    method: "POST",
    body: params,
  });
  if (!response.ok) throw new Error(`Cloudinary PDF upload failed: ${response.status}`);
  const data = (await response.json()) as CloudinaryResponse;
  if (protectedCv && data.type !== "authenticated") throw new Error("CV provider did not confirm authenticated storage");
  if (!data.secure_url?.startsWith("https://res.cloudinary.com/")) throw new Error("Cloudinary did not return a secure PDF URL");
  return { url: data.secure_url, publicId: data.public_id, bytes: data.bytes, format: data.format, protectedAsset: protectedCv, storage: "cloudinary" as const };
};

export const resolveImageValue = async (value: unknown, purpose = "image", originalName = "image") => {
  const image = String(value || "").trim();
  if (!image) return "";
  if (isBase64Image(image)) return (await uploadImageToCloudinary(image, purpose, originalName)).url;
  if (isHttpsUrl(image)) return image;
  throw Object.assign(new Error("Upload a valid image file."), { statusCode: 400 });
};

export const assertNoBase64Images = (value: unknown, label = "document") => {
  const seen = new Set<unknown>();
  const visit = (item: unknown, path: string) => {
    if (isBase64Image(item)) {
      throw Object.assign(new Error(`Base64 images cannot be stored in MongoDB at ${path}.`), { statusCode: 400 });
    }
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    Object.entries(item as Record<string, unknown>).forEach(([key, child]) => visit(child, `${path}.${key}`));
  };

  visit(value, label);
};
