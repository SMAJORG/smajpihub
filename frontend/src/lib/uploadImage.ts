import { axiosClient } from "./axiosClient";
import { isAxiosError } from "axios";

const isInlineImage = (value: string) => value.startsWith("data:image/");
const isStoredImageUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && /\/image\/upload\//.test(url.pathname);
  } catch {
    return false;
  }
};

type UploadOptions = {
  timeout?: number;
  onProgress?: (percent: number) => void;
};

export const uploadImage = async (image: string, purpose: string, options: UploadOptions = {}) => {
  if (!image || !isInlineImage(image)) return image;
  try {
    const { data } = await axiosClient.post<{ url: string }>("/uploads/image", { image, purpose }, {
      timeout: options.timeout ?? 20_000,
      onUploadProgress: event => {
        if (event.total) options.onProgress?.(Math.round(event.loaded / event.total * 100));
      },
    });
    if (!isStoredImageUrl(data.url)) throw new Error("Image storage did not return a saved media URL.");
    return data.url;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Image storage did not return a saved media URL.") throw err;
    if (isAxiosError<{ message?: string }>(err)) {
      throw new Error(err.response?.data?.message || "Could not upload image. Try a smaller JPG, PNG, or WebP file.");
    }
    throw new Error("Could not upload image. Try a smaller JPG, PNG, or WebP file.");
  }
};

export const uploadImages = async (images: string[], purpose: string) => {
  const cleanImages = images.filter(Boolean).slice(0, 12);
  if (!cleanImages.length) return [];

  try {
    const { data } = await axiosClient.post<{ urls?: string[] }>("/uploads/images", { images: cleanImages, purpose });
    if (Array.isArray(data.urls) && data.urls.length === cleanImages.length) return data.urls;
  } catch {
    // Fall back to the single-image endpoint so one unsupported deployment does not block product listing.
  }

  return Promise.all(cleanImages.map((image) => uploadImage(image, purpose)));
};
