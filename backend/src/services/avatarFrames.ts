export const avatarFrameIds = ["ambassador", "open_to_work", "seller", "hiring"] as const;
export type AvatarFrameId = (typeof avatarFrameIds)[number];
const hasSellerTools = (user: Record<string, any>) =>
  user.sellerActive === true || user.role === "seller" || (Array.isArray(user.roles) && user.roles.includes("seller"));

export const getEligibleAvatarFramesForUsers = async (locals: Record<string, any>, users: Record<string, any>[]) => {
  const distinctUsers = [...new Map(users.filter(user => user.uid).map(user => [String(user.uid), user])).values()];
  const uids = distinctUsers.map(user => String(user.uid));
  if (!uids.length) return new Map<string, AvatarFrameId[]>();
  const sellerUids = distinctUsers.filter(hasSellerTools).map(user => String(user.uid));
  const [ambassadors, approvedListings, employerCompanies] = await Promise.all([
    locals.ambassadorCollection?.find({ userId: { $in: uids }, status: "approved" }).toArray() || [],
    sellerUids.length
      ? locals.productCollection.aggregate([
          { $match: { sellerId: { $in: sellerUids }, active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" } },
          { $group: { _id: "$sellerId", count: { $sum: 1 } } },
        ]).toArray()
      : [],
    locals.jobCompanyCollection?.find({
      ownerId: { $in: uids },
      verified: true,
      moderationStatus: "approved",
      verificationStatus: { $in: ["verified", "pi_kyb"] },
    }).toArray() || [],
  ]);
  const ambassadorUids = new Set(ambassadors.map((item: Record<string, any>) => String(item.userId)));
  const sellerWithListings = new Set(approvedListings.map((item: Record<string, any>) => String(item._id)));
  const employerUids = new Set(employerCompanies.map((item: Record<string, any>) => String(item.ownerId)));
  return new Map(distinctUsers.map(user => {
    const uid = String(user.uid);
    const eligible: AvatarFrameId[] = [];
    if (ambassadorUids.has(uid)) eligible.push("ambassador");
    if (user.openToWork === true) eligible.push("open_to_work");
    if (hasSellerTools(user) && sellerWithListings.has(uid)) eligible.push("seller");
    if (employerUids.has(uid)) eligible.push("hiring");
    return [uid, eligible] as const;
  }));
};

export const getEligibleAvatarFrames = async (locals: Record<string, any>, user: Record<string, any>) =>
  (await getEligibleAvatarFramesForUsers(locals, [user])).get(String(user.uid)) || [];

export const resolveAvatarFrame = (user: Record<string, any>, eligible: AvatarFrameId[]) =>
  avatarFrameIds.includes(user.activeAvatarFrame) && eligible.includes(user.activeAvatarFrame)
    ? user.activeAvatarFrame as AvatarFrameId
    : null;
