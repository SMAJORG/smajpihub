export const publishDueCommunityPosts = async (app: { locals: Record<string, any> }, now = new Date()) => {
  const collection = app.locals.communityPostCollection;
  if (!collection) throw new Error("Community post storage is unavailable.");
  const duePosts = await collection.find({ status: "scheduled", publishAt: { $lte: now } })
    .sort({ publishAt: 1 })
    .limit(100)
    .toArray();
  let published = 0;
  for (const post of duePosts) {
    const result = await collection.updateOne(
      { _id: post._id, status: "scheduled", publishAt: { $lte: now } },
      { $set: { status: "published", publishedAt: now, updatedAt: now } },
    );
    if (result.modifiedCount) published += 1;
  }
  return published;
};
