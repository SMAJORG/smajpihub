import { ObjectId } from "mongodb";
import { Request, Response, Router } from "express";
import { resolveCurrentUser } from "../services/auth";
import { getEligibleAvatarFrames, getEligibleAvatarFramesForUsers, resolveAvatarFrame, type AvatarFrameId } from "../services/avatarFrames";

type CommunityMedia = { type: "image" | "video"; url: string };
const MAX_POST_TEXT = 2000;
const MAX_COMMENT_TEXT = 1000;
const pageSize = 20;
const noStore = (_req: Request, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
const isPublic = (user: Record<string, any> | null | undefined) =>
  Boolean(user && user.blocked !== true && user.publicProfile !== false && user.settings?.publicProfile !== false);
const displayName = (user: Record<string, any>) => String(user.displayName || user.username || "Pi user").slice(0, 80);
const publicIdentity = async (locals: Record<string, any>, user: Record<string, any>, frameEligibility?: AvatarFrameId[]) => {
  const eligibleFrames = frameEligibility || await getEligibleAvatarFrames(locals, user);
  const verificationStatus = ["none", "pending", "approved", "rejected"].includes(user.verificationStatus)
    ? user.verificationStatus
    : user.verificationRequested ? "pending" : "none";
  const profileComplete = Boolean(user.displayName && user.piUsername && user.country && user.contactPhone && user.avatar && user.bio);
  const verificationLevel = verificationStatus === "approved" && (user.role === "admin" || profileComplete)
    ? user.verificationLevel === "verified" ? "pi_verified" : user.verificationLevel || "basic"
    : "basic";
  return {
    uid: user.uid,
    username: user.username || "",
    piUsername: user.piUsername || user.username || "",
    displayName: displayName(user),
    country: user.country || "",
    bio: user.bio || "",
    avatar: user.avatar || "",
    coverImage: user.coverImage || "",
    role: user.role || "buyer",
    sellerActive: Boolean(user.sellerActive || user.role === "seller" || user.roles?.includes("seller")),
    openToWork: user.openToWork === true,
    activeAvatarFrame: resolveAvatarFrame(user, eligibleFrames),
    verificationLevel,
    verificationStatus,
    allowContact: user.allowContact !== false && user.settings?.allowContact !== false,
    createdAt: user.createdAt || null,
  };
};
const safeMedia = (input: unknown): CommunityMedia[] | null => {
  if (!Array.isArray(input) || input.length > 4) return null;
  const media: CommunityMedia[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") return null;
    const type = (item as Record<string, unknown>).type;
    const rawUrl = String((item as Record<string, unknown>).url || "").trim();
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !["image", "video"].includes(String(type))
        || !url.pathname.includes(`/${type}/upload/`)) return null;
      media.push({ type: type as CommunityMedia["type"], url: url.toString() });
    } catch {
      return null;
    }
  }
  return media;
};
const serialize = (record: Record<string, any>) => ({ ...record, _id: String(record._id) });
const getPublicPost = async (req: Request, postId: string) => {
  if (!ObjectId.isValid(postId)) return null;
  const post = await req.app.locals.communityPostCollection.findOne({ _id: new ObjectId(postId), status: "published" });
  if (!post) return null;
  const author = await req.app.locals.userCollection.findOne({ uid: post.authorId });
  const viewer = await resolveCurrentUser(req);
  return isPublic(author) || Boolean(author && viewer?.uid === author.uid) ? { post, author } : null;
};

const userProfile = async (req: Request, res: Response) => {
  const profileUser = await req.app.locals.userCollection.findOne({ uid: req.params.uid, blocked: { $ne: true } });
  const viewer = await resolveCurrentUser(req);
  if (!isPublic(profileUser) && viewer?.uid !== profileUser?.uid) return res.status(404).json({ error: "profile_unavailable", message: "This profile is not available." });
  if (!profileUser || profileUser.blocked) return res.status(404).json({ error: "profile_unavailable", message: "This profile is not available." });
  const uid = profileUser.uid;
  const [followers, following, posts, listings, jobs, videos, company, jobProfile] = await Promise.all([
    req.app.locals.communityFollowCollection.countDocuments({ followingId: uid }),
    req.app.locals.communityFollowCollection.countDocuments({ followerId: uid }),
    req.app.locals.communityPostCollection.countDocuments({ authorId: uid, status: "published" }),
    req.app.locals.productCollection.find({ sellerId: uid, active: true, hidden: { $ne: true }, approved: true, reviewStatus: "approved" }).sort({ createdAt: -1 }).limit(6).toArray(),
    req.app.locals.jobCollection.countDocuments({ employerId: uid, status: "active", moderationStatus: "approved" }),
    req.app.locals.streamContentCollection.countDocuments({ creatorId: uid, moderationStatus: "approved", processingStatus: "ready" }),
    req.app.locals.jobCompanyCollection.findOne({ ownerId: uid, verified: true, moderationStatus: "approved", verificationStatus: { $in: ["verified", "pi_kyb"] } }),
    req.app.locals.jobProfileCollection.findOne({ userId: uid }),
  ]);
  const followingRecord = viewer && viewer.uid !== uid
    ? await req.app.locals.communityFollowCollection.findOne({ followerId: viewer.uid, followingId: uid })
    : null;
  const identity = await publicIdentity(req.app.locals, profileUser);
  return res.json({
    profile: identity,
    stats: { followers, following, posts },
    viewer: { isSelf: viewer?.uid === uid, following: Boolean(followingRecord) },
    isPublic: isPublic(profileUser),
    professional: {
      headline: String(jobProfile?.headline || jobProfile?.jobTitle || "").slice(0, 160),
      skills: Array.isArray(jobProfile?.skills) ? jobProfile.skills.map((skill: unknown) => String(skill).slice(0, 60)).slice(0, 12) : [],
      company: company ? { name: String(company.name || "").slice(0, 120), logoUrl: String(company.logoUrl || "") } : null,
    },
    activities: {
      marketplaceListings: listings.map((product: Record<string, any>) => ({
        id: String(product._id),
        title: String(product.title || "").slice(0, 120),
        image: String(product.image || ""),
        pricePi: product.pricePi,
        createdAt: product.createdAt,
      })),
      jobs,
      streamVideos: videos,
    },
  });
};

const listPosts = async (req: Request, res: Response) => {
  const viewer = await resolveCurrentUser(req);
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(req.query.page || "1"), 10) || 1));
  const query: Record<string, any> = { status: "published" };
  const authorId = typeof req.query.authorId === "string" ? req.query.authorId.slice(0, 128) : "";
  if (authorId) {
    const author = await req.app.locals.userCollection.findOne({ uid: authorId, blocked: { $ne: true } });
    if (!isPublic(author) && viewer?.uid !== authorId) return res.status(404).json({ error: "profile_unavailable" });
    query.authorId = authorId;
  } else if (req.query.scope === "following") {
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    const follows = await req.app.locals.communityFollowCollection.find({ followerId: viewer.uid }).limit(500).toArray();
    const followedIds = follows.map((follow: Record<string, any>) => follow.followingId);
    if (!followedIds.length) return res.json({ posts: [], hasMore: false });
    query.authorId = { $in: followedIds };
  }
  const posts = await req.app.locals.communityPostCollection.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
  const authorIds = [...new Set(posts.map((post: Record<string, any>) => post.authorId))];
  const authors = authorIds.length ? await req.app.locals.userCollection.find({ uid: { $in: authorIds }, blocked: { $ne: true } }).toArray() : [];
  const authorsById = new Map<string, Record<string, any>>(authors
    .filter((author: Record<string, any>) => isPublic(author) || Boolean(authorId && viewer?.uid === author.uid))
    .map((author: Record<string, any>) => [String(author.uid), author]));
  const visiblePosts = posts.filter((post: Record<string, any>) => authorsById.has(post.authorId));
  const eligibilityByUser = await getEligibleAvatarFramesForUsers(req.app.locals, [...authorsById.values()]);
  const viewerLikes = viewer && visiblePosts.length
    ? await req.app.locals.communityLikeCollection.find({ userId: viewer.uid, postId: { $in: visiblePosts.map((post: Record<string, any>) => String(post._id)) } }).toArray()
    : [];
  const likedIds = new Set(viewerLikes.map((like: Record<string, any>) => like.postId));
  const output = await Promise.all(visiblePosts.map(async (post: Record<string, any>) => {
    const author = authorsById.get(post.authorId)!;
    const identity = await publicIdentity(req.app.locals, author, eligibilityByUser.get(String(author.uid)));
    let originalPost = null;
    if (post.repostOf && ObjectId.isValid(post.repostOf)) {
      const original = await req.app.locals.communityPostCollection.findOne({ _id: new ObjectId(post.repostOf), status: "published" });
      const originalAuthor = original && await req.app.locals.userCollection.findOne({ uid: original.authorId, blocked: { $ne: true } });
      if (!original || !isPublic(originalAuthor)) return null;
      originalPost = { ...serialize(original), author: await publicIdentity(req.app.locals, originalAuthor) };
    }
    return {
      ...serialize(post),
      author: identity,
      originalPost,
      likedByMe: likedIds.has(String(post._id)),
    };
  }));
  return res.json({ posts: output.filter(Boolean), hasMore: posts.length === pageSize });
};

export default function mountCommunityEndpoints(router: Router) {
  for (const method of ["get", "post", "delete"] as const) {
    const register = router[method].bind(router) as any;
    (router as any)[method] = (path: string, handler: any) => register(path, (req: Request, res: Response, next: (error?: unknown) => void) =>
      Promise.resolve(handler(req, res, next)).catch(next));
  }
  router.use(noStore);
  router.get("/profiles/:uid", userProfile);
  router.get("/feed", listPosts);

  router.post("/follow/:uid", async (req: Request, res: Response) => {
    const viewer = await resolveCurrentUser(req);
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    if (!req.params.uid || req.params.uid === viewer.uid) return res.status(400).json({ error: "invalid_follow", message: "You cannot follow your own account." });
    const target = await req.app.locals.userCollection.findOne({ uid: req.params.uid, blocked: { $ne: true } });
    if (!isPublic(target)) return res.status(404).json({ error: "profile_unavailable" });
    const existing = await req.app.locals.communityFollowCollection.findOne({ followerId: viewer.uid, followingId: target.uid });
    if (existing) {
      await req.app.locals.communityFollowCollection.deleteOne({ _id: existing._id });
      return res.json({ following: false });
    }
    try {
      await req.app.locals.communityFollowCollection.insertOne({ followerId: viewer.uid, followingId: target.uid, createdAt: new Date() });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    return res.status(201).json({ following: true });
  });

  router.post("/posts", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.blocked) return res.status(403).json({ error: "account_unavailable" });
    const content = String(req.body?.content || "").trim();
    const media = safeMedia(req.body?.media ?? []);
    if (content.length > MAX_POST_TEXT || !media || (!content && !media.length)) {
      return res.status(400).json({ error: "invalid_post", message: "Add text or up to four uploaded photos or videos. Text must be 2,000 characters or fewer." });
    }
    const recentPosts = await req.app.locals.communityPostCollection.countDocuments({ authorId: user.uid, createdAt: { $gte: new Date(Date.now() - 60_000) } });
    if (recentPosts >= 3) return res.status(429).json({ error: "posting_rate_limited", message: "Please wait before publishing another post." });
    const now = new Date();
    const post = {
      authorId: user.uid,
      content,
      media,
      type: "post",
      status: "published",
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const result = await req.app.locals.communityPostCollection.insertOne(post);
    return res.status(201).json({ post: { ...post, _id: String(result.insertedId), author: await publicIdentity(req.app.locals, user), likedByMe: false } });
  });

  router.post("/posts/:id/like", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    const postId = String(result.post._id);
    const existing = await req.app.locals.communityLikeCollection.findOne({ postId, userId: user.uid });
    if (existing) {
      const deleted = await req.app.locals.communityLikeCollection.deleteOne({ _id: existing._id });
      if (deleted.deletedCount) {
        await req.app.locals.communityPostCollection.updateOne({ _id: result.post._id }, { $inc: { likeCount: -1 } });
      }
      const updatedPost = await req.app.locals.communityPostCollection.findOne({ _id: result.post._id });
      return res.json({ liked: false, likeCount: Math.max(0, Number(updatedPost?.likeCount || 0)) });
    }
    let liked = false;
    try {
      await req.app.locals.communityLikeCollection.insertOne({ postId, userId: user.uid, createdAt: new Date() });
      await req.app.locals.communityPostCollection.updateOne({ _id: result.post._id }, { $inc: { likeCount: 1 } });
      liked = true;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    const updatedPost = await req.app.locals.communityPostCollection.findOne({ _id: result.post._id });
    return res.json({ liked: liked || Boolean(await req.app.locals.communityLikeCollection.findOne({ postId, userId: user.uid })), likeCount: Number(updatedPost?.likeCount || 0) });
  });

  router.get("/posts/:id/comments", async (req: Request, res: Response) => {
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    const comments = await req.app.locals.communityCommentCollection.find({ postId: String(result.post._id), status: "visible" }).sort({ createdAt: 1 }).limit(50).toArray();
    const authors = comments.length
      ? await req.app.locals.userCollection.find({ uid: { $in: [...new Set(comments.map((comment: Record<string, any>) => comment.authorId))] }, blocked: { $ne: true }, publicProfile: { $ne: false } }).toArray()
      : [];
    const authorsById = new Map<string, Record<string, any>>(authors.filter(isPublic).map((author: Record<string, any>) => [String(author.uid), author]));
    const visibleComments = comments.filter((comment: Record<string, any>) => authorsById.has(comment.authorId));
    const eligibilityByUser = await getEligibleAvatarFramesForUsers(req.app.locals, [...authorsById.values()]);
    return res.json({ comments: await Promise.all(visibleComments.map(async (comment: Record<string, any>) => {
      const author = authorsById.get(comment.authorId)!;
      const eligibleFrames = eligibilityByUser.get(String(author.uid)) || [];
      return {
        ...serialize(comment),
        author: {
          uid: author.uid,
          displayName: displayName(author),
          avatar: author.avatar || "",
          activeAvatarFrame: resolveAvatarFrame(author, eligibleFrames),
        },
      };
    })) });
  });

  router.post("/posts/:id/comments", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    const content = String(req.body?.content || "").trim();
    if (!content || content.length > MAX_COMMENT_TEXT) return res.status(400).json({ error: "invalid_comment", message: "Comments must contain 1–1,000 characters." });
    const recentComments = await req.app.locals.communityCommentCollection.countDocuments({ authorId: user.uid, createdAt: { $gte: new Date(Date.now() - 60_000) } });
    if (recentComments >= 10) return res.status(429).json({ error: "comment_rate_limited", message: "Please wait before posting another comment." });
    const comment = { postId: String(result.post._id), authorId: user.uid, content, status: "visible", createdAt: new Date() };
    const inserted = await req.app.locals.communityCommentCollection.insertOne(comment);
    await req.app.locals.communityPostCollection.updateOne({ _id: result.post._id }, { $inc: { commentCount: 1 } });
    const eligibleFrames = await getEligibleAvatarFrames(req.app.locals, user);
    return res.status(201).json({ comment: { ...comment, _id: String(inserted.insertedId), author: { uid: user.uid, displayName: displayName(user), avatar: user.avatar || "", activeAvatarFrame: resolveAvatarFrame(user, eligibleFrames) } } });
  });

  router.post("/posts/:id/repost", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    if (result.post.authorId === user.uid) return res.status(400).json({ error: "self_repost" });
    const originalId = String(result.post.repostOf || result.post._id);
    const originalResult = await getPublicPost(req, originalId);
    if (!originalResult) return res.status(404).json({ error: "post_unavailable" });
    if (originalResult.post.authorId === user.uid) return res.status(400).json({ error: "self_repost" });
    if (await req.app.locals.communityPostCollection.findOne({ authorId: user.uid, type: "repost", repostOf: originalId, status: "published" })) {
      return res.status(409).json({ error: "already_reposted" });
    }
    const repost = { authorId: user.uid, content: String(req.body?.content || "").trim().slice(0, 500), media: [], type: "repost", repostOf: originalId, status: "published", likeCount: 0, commentCount: 0, repostCount: 0, createdAt: new Date(), updatedAt: new Date() };
    let inserted;
    try {
      inserted = await req.app.locals.communityPostCollection.insertOne(repost);
    } catch (error: any) {
      if (error?.code === 11000) return res.status(409).json({ error: "already_reposted" });
      throw error;
    }
    await req.app.locals.communityPostCollection.updateOne({ _id: originalResult.post._id }, { $inc: { repostCount: 1 } });
    return res.status(201).json({ post: { ...repost, _id: String(inserted.insertedId), author: await publicIdentity(req.app.locals, user), originalPost: { ...serialize(originalResult.post), author: await publicIdentity(req.app.locals, originalResult.author) } } });
  });

  router.post("/posts/:id/report", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    if (result.post.authorId === user.uid) return res.status(400).json({ error: "cannot_report_own_post" });
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!reason) return res.status(400).json({ error: "report_reason_required" });
    const postId = String(result.post._id);
    if (await req.app.locals.reportCollection.findOne({ targetType: "community_post", targetId: postId, reportedBy: user.uid })) {
      return res.status(409).json({ error: "duplicate_report", message: "You have already reported this post." });
    }
    try {
      await req.app.locals.reportCollection.insertOne({
        targetType: "community_post",
        targetId: postId,
        targetName: displayName(result.author),
        reason,
        details: String(result.post.content || "").slice(0, 300),
        reportedBy: user.uid,
        reporterName: displayName(user),
        resolved: false,
        createdAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code === 11000) return res.status(409).json({ error: "duplicate_report", message: "You have already reported this post." });
      throw error;
    }
    const reportCount = await req.app.locals.reportCollection.countDocuments({ targetType: "community_post", targetId: postId, resolved: { $ne: true } });
    if (reportCount >= 3) {
      await req.app.locals.communityPostCollection.updateOne({ _id: result.post._id, status: "published" }, { $set: { status: "hidden", hiddenAt: new Date(), hiddenReason: "report_threshold" } });
    }
    return res.status(201).json({ reported: true });
  });

  router.delete("/posts/:id", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result || result.post.authorId !== user.uid) return res.status(404).json({ error: "post_unavailable" });
    await req.app.locals.communityPostCollection.updateOne({ _id: result.post._id, authorId: user.uid }, { $set: { status: "deleted", deletedAt: new Date() } });
    return res.json({ deleted: true });
  });
}
