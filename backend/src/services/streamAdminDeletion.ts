type Content = { cloudflareUid?: string; contentSource?: string; contentType?: string; liveInputUid?: string };
type Collection = { findOne(query: Record<string, unknown>): Promise<Content | null>; deleteMany(query: Record<string, unknown>): Promise<unknown> };
export class StreamAdminDeletionError extends Error { constructor(public status: number, message: string) { super(message); } }
export const deleteAdminStreamVideo = async (collection: Collection, uid: string, removeRemote: (uid: string) => Promise<void>) => {
  const video = await collection.findOne({ cloudflareUid: uid });
  if (!video) throw new StreamAdminDeletionError(404, "Video not found.");
  if (video.contentType === "live") throw new StreamAdminDeletionError(400, "Delete live inputs from the live-stream manager.");
  const isCloudflare = video.contentSource === "cloudflare_stream" || (!video.contentSource && /^[a-f0-9]{32}$/i.test(uid));
  if (isCloudflare) {
    try { await removeRemote(uid); }
    catch (error) {
      if ((error as { response?: { status?: number } }).response?.status !== 404) throw error;
    }
  }
  // Never remove the app record until Cloudflare confirms deletion (or it is already absent).
  await collection.deleteMany({ cloudflareUid: uid });
  return { deleted: true, cloudflareDeleted: isCloudflare };
};
