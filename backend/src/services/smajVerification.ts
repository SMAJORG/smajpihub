import { ObjectId } from "mongodb";

export const verificationStates = ["none", "pending", "approved", "rejected", "suspended", "expired", "revoked"] as const;
export type SmajVerificationState = typeof verificationStates[number];
export type SmajVerificationRecord = {
  status: SmajVerificationState;
  reviewedBy: string;
  reviewedAt: Date;
  expiresAt: Date | null;
  reason: string;
  revision: number;
};

// This projection is the only public identity-verification decision. Pi /me,
// seller permissions, qualifications and institutional approval do not grant it.
export function smajVerification(user: any, now = Date.now()) {
  const record = user?.smajVerification;
  // Preserve legacy account approvals, excluding the automatic admin login seed.
  const legacyApproved = !record && user?.verificationStatus === "approved"
    && ["pi_verified", "seller_verified", "trusted_seller", "verified"].includes(user?.verificationLevel)
    && (user?.role !== "admin" || Boolean(user?.verificationRequestedAt || user?.verificationReviewedAt));
  let status: SmajVerificationState = record
    ? verificationStates.includes(record.status) ? record.status : "none"
    : legacyApproved ? "approved" : user?.verificationStatus === "pending" ? "pending" : "none";
  const expiration = record?.expiresAt == null ? null : new Date(record.expiresAt).getTime();
  if (status === "approved" && expiration !== null && (!Number.isFinite(expiration) || expiration <= now)) status = "expired";
  if (user?.blocked || user?.status === "blocked") status = "suspended";
  return {
    userId: user?._id?.toString() || null,
    status,
    verified: Boolean(user?._id && status === "approved"),
    expiresAt: expiration !== null && Number.isFinite(expiration) ? new Date(expiration).toISOString() : null,
    revision: record?.revision || 0,
  };
}

export async function verificationStatuses(collection: any, ids: string[]) {
  const users = await collection.find({ $or: [{ uid: { $in: ids } }, { _id: { $in: ids.filter(ObjectId.isValid).map(id => new ObjectId(id)) } }] })
    .project({ _id: 1, uid: 1, blocked: 1, status: 1, role: 1, verificationStatus: 1, verificationLevel: 1, verificationRequestedAt: 1, verificationReviewedAt: 1, smajVerification: 1 }).toArray();
  return Object.fromEntries(ids.map(id => {
    const matches = users.filter((user: any) => user.uid === id || user._id.toString() === id);
    // Ambiguous identifiers never authorize a public badge.
    return [id, smajVerification(matches.length === 1 ? matches[0] : null)];
  }));
}
