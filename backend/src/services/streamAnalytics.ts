import { createHash } from "node:crypto";

// One cumulative checkpoint per viewing session makes retries and out-of-order requests safe.
export const recordStreamPlayback = async (collection: any, input: { creatorId: string; videoId: string; viewerId: string; sessionId: string; watchSeconds: number }, now = new Date()) => {
  const _id = createHash("sha256").update(JSON.stringify([input.viewerId, input.videoId, input.sessionId])).digest("hex");
  try {
    await collection.updateOne({ _id }, { $setOnInsert: { _id, creatorId: input.creatorId, videoId: input.videoId, viewerId: input.viewerId, watchSeconds: 0, createdAt: now, updatedAt: now } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const session = await collection.findOne({ _id });
  const elapsed = Math.max(0, (now.getTime() - new Date(session.createdAt).getTime()) / 1000);
  const watchSeconds = Math.max(0, Math.min(86_400, elapsed + 2, input.watchSeconds));
  await collection.updateOne({ _id, watchSeconds: { $lt: watchSeconds } }, { $set: { watchSeconds, updatedAt: now } });
};

export const getStreamPlaybackTotals = async (collection: any, creatorId: string) => {
  if (!collection) return { views: 0, watchSeconds: 0 };
  const [totals] = await collection.aggregate([{ $match: { creatorId } }, { $group: { _id: null, views: { $sum: 1 }, watchSeconds: { $sum: "$watchSeconds" } } }]).toArray();
  return { views: Number(totals?.views) || 0, watchSeconds: Number(totals?.watchSeconds) || 0 };
};
