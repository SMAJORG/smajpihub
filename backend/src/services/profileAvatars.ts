import type { Request } from "express";
import { ObjectId } from "mongodb";
import { getEligibleAvatarFramesForUsers, resolveAvatarFrame } from "./avatarFrames";

// Public content must resolve photos from the account, not an old content snapshot.
export async function enrichProfileAvatars(req: Request, rows: Record<string, any>[], kind: "product" | "review") {
  const ids = [...new Set(rows.map(row => String(kind === "product" ? row.sellerId || "" : row.userId || row.reviewer?.id || "")).filter(Boolean))];
  if (!ids.length) return rows;
  const objectIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
  const users = await req.app.locals.userCollection.find({ $or: [{ uid: { $in: ids } }, { _id: { $in: objectIds } }] })
    .project({ uid: 1, avatar: 1, "streamProfile.avatarUrl": 1, role: 1, roles: 1, sellerActive: 1, openToWork: 1, activeAvatarFrame: 1 }).toArray();
  const avatars = new Map<string, string>();
  for (const user of users) {
    const avatar = user.avatar ?? user.streamProfile?.avatarUrl ?? "";
    if (user.uid) avatars.set(String(user.uid), avatar);
    if (user._id) avatars.set(String(user._id), avatar);
  }
  const eligibleFrames = await getEligibleAvatarFramesForUsers(req.app.locals, users);
  const frames = new Map<string, string | null>();
  for (const user of users) {
    const frame = resolveAvatarFrame(user, eligibleFrames.get(String(user.uid)) || []);
    if (user.uid) frames.set(String(user.uid), frame);
    if (user._id) frames.set(String(user._id), frame);
  }
  return rows.map(row => {
    const id = String(kind === "product" ? row.sellerId || "" : row.userId || row.reviewer?.id || "");
    if (!avatars.has(id)) return row;
    return kind === "product"
      ? { ...row, sellerAvatar: avatars.get(id), sellerAvatarFrame: frames.get(id) || null }
      : { ...row, reviewer: { ...row.reviewer, avatarUrl: avatars.get(id), avatarFrame: frames.get(id) || null } };
  });
}

export async function synchronizeAvatarSnapshots(req: Request, user: Record<string, any>, avatar: string) {
  const ids = [user.uid, user._id?.toString()].filter(Boolean);
  await Promise.all([
    req.app.locals.productCollection?.updateMany({ sellerId: user.uid }, { $set: { sellerAvatar: avatar } }),
    req.app.locals.streamReviewCollection?.updateMany(
      { $or: [{ userId: { $in: ids } }, { "reviewer.id": { $in: ids } }] },
      { $set: { "reviewer.avatarUrl": avatar } }
    ),
  ]);
}