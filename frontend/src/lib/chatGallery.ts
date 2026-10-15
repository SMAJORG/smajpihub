import { Capacitor, registerPlugin } from "@capacitor/core";
export type GalleryAlbum = {
  id: string;
  name: string;
  count: number;
  thumbnail?: string;
};
export type GalleryMedia = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  thumbnail: string;
  duration?: number;
};
type PickedMedia = {
  cancelled?: boolean;
  name?: string;
  mimeType?: string;
  dataUrl?: string;
};
export const chatGallery = registerPlugin<{
  albums(): Promise<{ albums: GalleryAlbum[]; limited?: boolean }>;
  media(options: {
    album: string;
    offset: number;
    limit: number;
  }): Promise<{ items: GalleryMedia[]; hasMore: boolean }>;
  read(options: { id: string }): Promise<PickedMedia>;
  openPicker(): Promise<PickedMedia>;
}>("SmajGallery");
export const hasNativeChatGallery = () =>
  Capacitor.getPlatform() === "android" &&
  Capacitor.isPluginAvailable("SmajGallery");
export function pickedMediaFile(value: PickedMedia): File | null {
  if (value.cancelled) return null;
  if (
    !value.dataUrl ||
    !/^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(value.dataUrl)
  )
    throw new Error("Choose a photo or video.");
  const [header, encoded] = value.dataUrl.split(",");
  const mime = header.slice(5, -7);
  const limit = mime.startsWith("video/") ? 2_500_000 : 2 * 1024 * 1024;
  if (encoded.length > Math.ceil(limit / 3) * 4)
    throw new Error("The selected file is too large for chat.");
  const binary = atob(encoded);
  if (binary.length > limit)
    throw new Error("The selected file is too large for chat.");
  return new File(
    [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
    value.name || (mime.startsWith("video/") ? "video.mp4" : "photo.jpg"),
    { type: mime },
  );
}
