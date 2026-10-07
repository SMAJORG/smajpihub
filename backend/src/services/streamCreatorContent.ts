import { ObjectId } from "mongodb";

type Collection = { findOne: (query: Record<string, unknown>) => Promise<any>; updateOne: (query: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ matchedCount: number }> };
export type CreatorContentPatch = { title: string; description: string; category: string; visibility: "public" | "unlisted" | "private" };
export const parseCreatorContentPatch = (body: Record<string, unknown>): CreatorContentPatch | null => {
  if (typeof body.title !== "string" || typeof body.description !== "string" || typeof body.category !== "string") return null;
  const title = body.title.trim();
  const description = body.description.trim();
  const category = body.category.trim();
  if (!title || title.length > 140 || description.length > 4000 || !category || category.length > 60 || !["public", "unlisted", "private"].includes(String(body.visibility))) return null;
  return { title, description, category, visibility: body.visibility as CreatorContentPatch["visibility"] };
};
const ownerQuery = (creatorId: string, uid: string) => ({ creatorId, $or: [{ cloudflareUid: uid }, ...(ObjectId.isValid(uid) ? [{ _id: new ObjectId(uid) }] : [])] });
export const editCreatorContent = async (collection: Collection, creatorId: string, uid: string, patch: CreatorContentPatch) => {
  const video = await collection.findOne(ownerQuery(creatorId, uid));
  if (!video || video.deletedAt) return null;
  const result = await collection.updateOne({ _id: video._id, creatorId, deletedAt: { $exists: false } }, { $set: { ...patch, updatedAt: new Date() } });
  if (!result.matchedCount) return null;
  return collection.findOne({ _id: video._id, creatorId });
};
export const deleteCreatorContent = async (collection: Collection, creatorId: string, uid: string) => {
  const video = await collection.findOne(ownerQuery(creatorId, uid));
  if (!video || video.deletedAt) return false;
  const now = new Date();
  const result = await collection.updateOne({ _id: video._id, creatorId, deletedAt: { $exists: false } }, { $set: { deletedAt: now, updatedAt: now, visibility: "private", moderationStatus: "deleted", playbackAllowed: false, downloadAllowed: false } });
  return result.matchedCount > 0;
};
