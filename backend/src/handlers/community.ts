import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import { Request, Response, Router } from "express";
import { resolveCurrentUser } from "../services/auth";
import { getEligibleAvatarFrames, getEligibleAvatarFramesForUsers, resolveAvatarFrame, type AvatarFrameId } from "../services/avatarFrames";

type CommunityMedia = { type: "image" | "video"; url: string; altText?: string; taggedPeople?: string[]; captionsVtt?: string };
type CommunityAudience = "everyone" | "followers" | "only_me";
type CommunityCommentPolicy = "everyone" | "followers" | "nobody";
const MAX_POST_TEXT = 2000;
const MAX_COMMENT_TEXT = 1000;
const pageSize = 20;
const allowedPostTypes = new Set(["post", "media", "event", "celebration", "job", "poll", "document"]);
type CommunityPreferenceKind = "saved_post" | "hidden_author" | "not_interested_post";
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
    const altText = String((item as Record<string, unknown>).altText || "").trim();
    const rawTaggedPeople = (item as Record<string, unknown>).taggedPeople ?? [];
    const captionsVtt = String((item as Record<string, unknown>).captionsVtt || "").trim();
    if (!Array.isArray(rawTaggedPeople) || rawTaggedPeople.length > 10) return null;
    if (captionsVtt && (type !== "video" || captionsVtt.length > 20_000
      || !/^WEBVTT(?:\r?\n)/.test(captionsVtt)
      || !/(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}/.test(captionsVtt))) return null;
    const taggedPeople = [...new Set(rawTaggedPeople.map(uid => String(uid).trim()).filter(Boolean))];
    if (taggedPeople.some(uid => uid.length > 128)) return null;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !["image", "video"].includes(String(type))
        || !url.pathname.includes(`/${type}/upload/`)) return null;
      media.push({
        type: type as CommunityMedia["type"],
        url: url.toString(),
        ...(altText ? { altText: altText.slice(0, 500) } : {}),
        ...(taggedPeople.length ? { taggedPeople } : {}),
        ...(captionsVtt ? { captionsVtt } : {}),
      });
    } catch {
      return null;
    }
  }
  return media;
};
const validMediaTags = async (locals: Record<string, any>, media: CommunityMedia[]) => {
  const taggedPeople = [...new Set(media.flatMap(item => item.taggedPeople || []))];
  if (!taggedPeople.length) return true;
  const users = await locals.userCollection.find({
    uid: { $in: taggedPeople },
    blocked: { $ne: true },
    publicProfile: { $ne: false },
    "settings.publicProfile": { $ne: false },
  }).toArray();
  return users.length === taggedPeople.length;
};
const safeDocument = (input: unknown) => {
  if (!input || typeof input !== "object") return null;
  const document = input as Record<string, unknown>;
  const name = String(document.name || "").trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").slice(0, 120);
  const rawUrl = String(document.url || "").trim();
  try {
    const url = new URL(rawUrl);
    if (!name || url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.includes("/raw/upload/")) return null;
    return { name, url: url.toString() };
  } catch {
    return null;
  }
};
const safePoll = (input: unknown) => {
  if (!input || typeof input !== "object") return null;
  const poll = input as Record<string, unknown>;
  const question = String(poll.question || "").trim();
  const options = Array.isArray(poll.options)
    ? poll.options.map((option, index) => ({ id: `option-${index + 1}`, label: String(option || "").trim().slice(0, 100) }))
    : [];
  const expiresAt = poll.expiresAt ? new Date(String(poll.expiresAt)) : null;
  if (!question || question.length > 240 || options.length < 2 || options.length > 6
    || options.some(option => !option.label) || new Set(options.map(option => option.label.toLowerCase())).size !== options.length
    || (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 30 * 86_400_000))) return null;
  return { question, options: options.map(option => ({ ...option, votes: 0 })), expiresAt: expiresAt?.toISOString() || null };
};
const safeEvent = (input: unknown) => {
  if (!input || typeof input !== "object") return null;
  const event = input as Record<string, unknown>;
  const title = String(event.title || "").trim();
  const startsAt = new Date(String(event.startsAt || ""));
  const location = String(event.location || "").trim().slice(0, 160);
  if (!title || title.length > 120 || !Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now() || !location) return null;
  return { title, startsAt: startsAt.toISOString(), location };
};
const parsePostInput = (body: Record<string, any>) => {
  const content = String(body.content || "").trim();
  const media = safeMedia(body.media ?? []);
  const postType = String(body.postType || (media?.length ? "media" : "post"));
  const audience = String(body.audience || "everyone");
  const commentPolicy = String(body.commentPolicy || "everyone");
  const collaborators = Array.isArray(body.collaborators)
    ? [...new Set(body.collaborators.map((uid: unknown) => String(uid).slice(0, 128)).filter(Boolean))]
    : [];
  const poll = postType === "poll" ? safePoll(body.poll) : null;
  const event = postType === "event" ? safeEvent(body.event) : null;
  const document = postType === "document" ? safeDocument(body.document) : null;
  const jobId = postType === "job" ? String(body.jobId || "").slice(0, 128) : "";
  const celebration = postType === "celebration" ? String(body.celebration || "").trim().slice(0, 80) : "";
  const brandPartnership = body.brandPartnership === true;
  if (!allowedPostTypes.has(postType) || !["everyone", "followers", "only_me"].includes(audience)
    || !["everyone", "followers", "nobody"].includes(commentPolicy) || collaborators.length > 5
    || content.length > MAX_POST_TEXT || !media
    || (!content && !media.length && !poll && !event && !document && !jobId && !celebration)
    || (postType === "poll" && !poll) || (postType === "event" && !event)
    || (postType === "document" && !document) || (postType === "job" && !jobId)
    || (postType === "celebration" && !celebration)) return null;
  return {
    content,
    media,
    postType,
    audience: audience as CommunityAudience,
    commentPolicy: commentPolicy as CommunityCommentPolicy,
    collaboratorIds: collaborators,
    brandPartnership,
    ...(poll ? { poll } : {}),
    ...(event ? { event } : {}),
    ...(document ? { document } : {}),
    ...(jobId ? { jobId } : {}),
    ...(celebration ? { celebration } : {}),
  };
};
const serialize = (record: Record<string, any>) => ({ ...record, _id: String(record._id) });
const setCommunityPreference = async (
  locals: Record<string, any>,
  userId: string,
  kind: CommunityPreferenceKind,
  targetId: string,
  enabled: boolean,
) => {
  const query = { userId, kind, targetId };
  if (!enabled) {
    await locals.communityPreferenceCollection.deleteOne(query);
    return;
  }
  try {
    await locals.communityPreferenceCollection.updateOne(query, {
      $setOnInsert: { ...query, createdAt: new Date() },
    }, { upsert: true });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
};
const canViewPost = async (req: Request, post: Record<string, any>, viewer: Record<string, any> | null) => {
  if (post.authorId === viewer?.uid) return true;
  if ((post.audience || "everyone") === "everyone") return true;
  if (!viewer || post.audience === "only_me") return false;
  if (post.audience !== "followers") return false;
  return Boolean(await req.app.locals.communityFollowCollection.findOne({ followerId: viewer.uid, followingId: post.authorId }));
};
const canCommentOnPost = async (req: Request, post: Record<string, any>, viewer: Record<string, any> | null) => {
  if (!viewer) return false;
  if (post.authorId === viewer.uid) return true;
  const policy = post.commentPolicy || "everyone";
  if (policy === "everyone") return true;
  if (policy === "nobody") return false;
  return Boolean(await req.app.locals.communityFollowCollection.findOne({ followerId: viewer.uid, followingId: post.authorId }));
};
const saveCommunityReaction = async (
  locals: Record<string, any>,
  post: Record<string, any>,
  userId: string,
  reaction: string | null,
) => {
  const postId = String(post._id);
  const existing = await locals.communityLikeCollection.findOne({ postId, userId });
  if (!reaction) {
    if (existing) await locals.communityLikeCollection.deleteOne({ _id: existing._id });
  } else if (existing) {
    await locals.communityLikeCollection.updateOne({ _id: existing._id }, { $set: { reaction, createdAt: new Date() } });
  } else {
    try {
      await locals.communityLikeCollection.insertOne({ postId, userId, reaction, createdAt: new Date() });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      await locals.communityLikeCollection.updateOne({ postId, userId }, { $set: { reaction, createdAt: new Date() } });
    }
  }
  const reactions = await locals.communityLikeCollection.find({ postId }).toArray();
  const reactionCounts: Record<string, number> = { like: 0, love: 0, celebrate: 0, support: 0, insightful: 0 };
  reactions.forEach((item: Record<string, any>) => {
    const type = ["like", "love", "celebrate", "support", "insightful"].includes(item.reaction) ? item.reaction : "like";
    reactionCounts[type] += 1;
  });
  await locals.communityPostCollection.updateOne(
    { _id: post._id },
    { $set: { likeCount: reactions.length, reactionCounts } },
  );
  const saved = await locals.communityLikeCollection.findOne({ postId, userId });
  return {
    myReaction: saved ? (["like", "love", "celebrate", "support", "insightful"].includes(saved.reaction) ? saved.reaction : "like") : null,
    likeCount: reactions.length,
    reactionCounts,
  };
};
const getPublicPost = async (req: Request, postId: string) => {
  if (!ObjectId.isValid(postId)) return null;
  const post = await req.app.locals.communityPostCollection.findOne({ _id: new ObjectId(postId), status: "published" });
  if (!post) return null;
  const author = await req.app.locals.userCollection.findOne({ uid: post.authorId });
  const viewer = await resolveCurrentUser(req);
  return (isPublic(author) || Boolean(author && viewer?.uid === author.uid))
    && await canViewPost(req, post, viewer) ? { post, author, viewer } : null;
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
  const viewerPreferences = viewer
    ? await req.app.locals.communityPreferenceCollection.find({ userId: viewer.uid }).toArray()
    : [];
  const hiddenAuthorIds = viewerPreferences
    .filter((item: Record<string, any>) => item.kind === "hidden_author")
    .map((item: Record<string, any>) => item.targetId);
  const notInterestedPostIds = viewerPreferences
    .filter((item: Record<string, any>) => item.kind === "not_interested_post" && ObjectId.isValid(item.targetId))
    .map((item: Record<string, any>) => new ObjectId(item.targetId));
  const savedPostIds = new Set(viewerPreferences
    .filter((item: Record<string, any>) => item.kind === "saved_post")
    .map((item: Record<string, any>) => item.targetId));
  const follows = viewer
    ? (await req.app.locals.communityFollowCollection.find({ followerId: viewer.uid }).limit(500).toArray())
      .map((follow: Record<string, any>) => follow.followingId)
    : [];
  const followedIds = follows;
  query.$and = [{
    $or: [
      { audience: { $exists: false } },
      { audience: "everyone" },
      ...(viewer ? [{ authorId: viewer.uid }, { audience: "followers", authorId: { $in: followedIds } }] : []),
    ],
  }];
  const authorId = typeof req.query.authorId === "string" ? req.query.authorId.slice(0, 128) : "";
  if (authorId) {
    const author = await req.app.locals.userCollection.findOne({ uid: authorId, blocked: { $ne: true } });
    if (!isPublic(author) && viewer?.uid !== authorId) return res.status(404).json({ error: "profile_unavailable" });
    query.authorId = authorId;
  } else {
    if (req.query.scope === "following") {
      if (!viewer) return res.status(401).json({ error: "unauthorized" });
      if (!followedIds.length) return res.json({ posts: [], hasMore: false });
      query.authorId = { $in: followedIds };
    }
    if (hiddenAuthorIds.length) {
      query.authorId = {
        ...(query.authorId && typeof query.authorId === "object" ? query.authorId : {}),
        $nin: hiddenAuthorIds,
      };
    }
    if (notInterestedPostIds.length) query._id = { $nin: notInterestedPostIds };
  }
  const posts = await req.app.locals.communityPostCollection.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
  const authorIds = [...new Set(posts.map((post: Record<string, any>) => post.authorId))];
  const authors = authorIds.length ? await req.app.locals.userCollection.find({ uid: { $in: authorIds }, blocked: { $ne: true } }).toArray() : [];
  const authorsById = new Map<string, Record<string, any>>(authors
    .filter((author: Record<string, any>) => isPublic(author) || Boolean(authorId && viewer?.uid === author.uid))
    .map((author: Record<string, any>) => [String(author.uid), author]));
  const visiblePosts = posts.filter((post: Record<string, any>) => authorsById.has(post.authorId));
  const eligibilityByUser = await getEligibleAvatarFramesForUsers(req.app.locals, [...authorsById.values()]);
  const postIds = visiblePosts.map((post: Record<string, any>) => String(post._id));
  const [viewerLikes, jobProfiles, recentLikes, recentComments, recentReposts, recentFollows] = await Promise.all([
    viewer && postIds.length
      ? req.app.locals.communityLikeCollection.find({ userId: viewer.uid, postId: { $in: postIds } }).toArray()
      : [],
    authorIds.length ? req.app.locals.jobProfileCollection.find({ userId: { $in: authorIds } }).toArray() : [],
    postIds.length ? req.app.locals.communityLikeCollection.find({ postId: { $in: postIds } }).sort({ createdAt: -1 }).limit(150).toArray() : [],
    postIds.length ? req.app.locals.communityCommentCollection.find({ postId: { $in: postIds }, status: "visible" }).sort({ createdAt: -1 }).limit(150).toArray() : [],
    postIds.length ? req.app.locals.communityPostCollection.find({ repostOf: { $in: postIds }, status: "published" }).sort({ createdAt: -1 }).limit(150).toArray() : [],
    authorIds.length ? req.app.locals.communityFollowCollection.find({ followingId: { $in: authorIds } }).sort({ createdAt: -1 }).limit(100).toArray() : [],
  ]);
  const likesByPost = new Map<string, Record<string, any>>(viewerLikes.map((like: Record<string, any>) => [like.postId, like]));
  const profilesByUser = new Map<string, Record<string, any>>(jobProfiles.map((profile: Record<string, any>) => [profile.userId, profile]));
  const socialByPost = new Map<string, { kind: string; userId: string; createdAt: unknown }>();
  const addActivity = (postId: string, kind: string, userId: string, createdAt: unknown) => {
    if (!postIds.includes(postId) || !userId) return;
    const current = socialByPost.get(postId);
    if (!current || new Date(createdAt as any).getTime() >= new Date(current.createdAt as any).getTime()) {
      socialByPost.set(postId, { kind, userId, createdAt });
    }
  };
  recentLikes.forEach((item: Record<string, any>) => addActivity(item.postId, "likes", item.userId, item.createdAt));
  recentComments.forEach((item: Record<string, any>) => addActivity(item.postId, "commented", item.authorId, item.createdAt));
  recentReposts.forEach((item: Record<string, any>) => addActivity(item.repostOf, "reposted", item.authorId, item.createdAt));
  recentFollows.forEach((item: Record<string, any>) => {
    visiblePosts.filter((post: Record<string, any>) => post.authorId === item.followingId)
      .forEach((post: Record<string, any>) => addActivity(String(post._id), "follows", item.followerId, item.createdAt));
  });
  const activityUserIds = [...new Set([...socialByPost.values()].map(item => item.userId))];
  const activityUsers = activityUserIds.length
    ? await req.app.locals.userCollection.find({ uid: { $in: activityUserIds }, blocked: { $ne: true }, publicProfile: { $ne: false }, "settings.publicProfile": { $ne: false } }).toArray()
    : [];
  const activityUsersById = new Map<string, Record<string, any>>(activityUsers.filter(isPublic).map((person: Record<string, any>) => [person.uid, person]));
  const output = await Promise.all(visiblePosts.map(async (post: Record<string, any>) => {
    const author = authorsById.get(post.authorId)!;
    const jobProfile = profilesByUser.get(String(author.uid));
    const identity = {
      ...await publicIdentity(req.app.locals, author, eligibilityByUser.get(String(author.uid))),
      headline: String(jobProfile?.headline || jobProfile?.jobTitle || "").slice(0, 160),
    };
    let originalPost: Record<string, any> | null = null;
    if (post.repostOf && ObjectId.isValid(post.repostOf)) {
      const original = await req.app.locals.communityPostCollection.findOne({ _id: new ObjectId(post.repostOf), status: "published" });
      const originalAuthor = original && await req.app.locals.userCollection.findOne({ uid: original.authorId, blocked: { $ne: true } });
      if (!original || !isPublic(originalAuthor) || !await canViewPost(req, original, viewer)) return null;
      const originalJobProfile = await req.app.locals.jobProfileCollection.findOne({ userId: originalAuthor.uid });
      const originalViewerReaction = viewer
        ? await req.app.locals.communityLikeCollection.findOne({ postId: String(original._id), userId: viewer.uid })
        : null;
      originalPost = {
        ...serialize(original),
        author: {
          ...await publicIdentity(req.app.locals, originalAuthor),
          headline: String(originalJobProfile?.headline || originalJobProfile?.jobTitle || "").slice(0, 160),
        },
        likedByMe: Boolean(originalViewerReaction),
        myReaction: originalViewerReaction ? originalViewerReaction.reaction || "like" : null,
        reactionCounts: original.reactionCounts || { like: Number(original.likeCount || 0) },
        isFollowedByMe: followedIds.includes(original.authorId),
        canComment: await canCommentOnPost(req, original, viewer),
      };
      if (original.poll) {
        const votes = await req.app.locals.communityPollVoteCollection.find({ postId: String(original._id) }).toArray();
        originalPost.poll = {
          ...original.poll,
          options: original.poll.options.map((option: Record<string, any>) => ({
            ...option,
            votes: votes.filter((vote: Record<string, any>) => vote.optionId === option.id).length,
          })),
        };
        originalPost.myVote = votes.find((vote: Record<string, any>) => vote.userId === viewer?.uid)?.optionId || null;
      }
    }
    let poll = post.poll;
    let myVote: string | null = null;
    if (poll && req.app.locals.communityPollVoteCollection) {
      const votes = await req.app.locals.communityPollVoteCollection.find({ postId: String(post._id) }).toArray();
      poll = {
        ...poll,
        options: poll.options.map((option: Record<string, any>) => ({
          ...option,
          votes: votes.filter((vote: Record<string, any>) => vote.optionId === option.id).length,
        })),
      };
      myVote = votes.find((vote: Record<string, any>) => vote.userId === viewer?.uid)?.optionId || null;
    }
    return {
      ...serialize(post),
      author: identity,
      originalPost,
      savedByMe: savedPostIds.has(String(post._id)),
      likedByMe: likesByPost.has(String(post._id)),
      myReaction: likesByPost.has(String(post._id)) ? likesByPost.get(String(post._id))!.reaction || "like" : null,
      reactionCounts: post.reactionCounts || { like: Number(post.likeCount || 0) },
      isFollowedByMe: followedIds.includes(String(originalPost?.authorId || post.authorId)),
      socialActivity: (() => {
        const activity = socialByPost.get(String(post._id));
        const person = activity && activityUsersById.get(activity.userId);
        return activity && person
          ? { kind: activity.kind, displayName: displayName(person) }
          : null;
      })(),
      ...(poll ? { poll, myVote } : {}),
      canComment: await canCommentOnPost(req, post, viewer),
    };
  }));
  return res.json({ posts: output.filter(Boolean), hasMore: posts.length === pageSize });
};

export default function mountCommunityEndpoints(router: Router) {
  for (const method of ["get", "post", "patch", "delete"] as const) {
    const register = router[method].bind(router) as any;
    (router as any)[method] = (path: string, handler: any) => register(path, (req: Request, res: Response, next: (error?: unknown) => void) =>
      Promise.resolve(handler(req, res, next)).catch(next));
  }
  router.use(noStore);
  router.get("/profiles/:uid", userProfile);
  router.get("/feed", listPosts);
  router.get("/posts/scheduled", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const collection = req.app.locals.communityPostCollection;
    if (!collection) return res.status(503).json({ error: "community_storage_unavailable" });
    const posts = await collection.find({ authorId: user.uid, status: "scheduled" }).sort({ publishAt: 1 }).limit(100).toArray();
    return res.json({ posts: posts.map(serialize) });
  });

  router.post("/follow/:uid", async (req: Request, res: Response) => {
    const viewer = await resolveCurrentUser(req);
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    if (!req.params.uid || req.params.uid === viewer.uid) return res.status(400).json({ error: "invalid_follow", message: "You cannot follow your own account." });
    const target = await req.app.locals.userCollection.findOne({ uid: req.params.uid, blocked: { $ne: true } });
    if (!isPublic(target)) return res.status(404).json({ error: "profile_unavailable" });
    const existing = await req.app.locals.communityFollowCollection.findOne({ followerId: viewer.uid, followingId: target.uid });
    const shouldFollow = typeof req.body?.following === "boolean" ? req.body.following : !existing;
    if (existing && !shouldFollow) {
      await req.app.locals.communityFollowCollection.deleteOne({ _id: existing._id });
      return res.json({ following: false });
    }
    if (existing && shouldFollow) return res.json({ following: true });
    if (!existing && !shouldFollow) return res.json({ following: false });
    try {
      await req.app.locals.communityFollowCollection.insertOne({ followerId: viewer.uid, followingId: target.uid, createdAt: new Date() });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    return res.status(201).json({ following: true });
  });

  router.post("/authors/:uid/hide", async (req: Request, res: Response) => {
    const viewer = await resolveCurrentUser(req);
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    if (!req.params.uid || req.params.uid === viewer.uid) return res.status(400).json({ error: "invalid_author" });
    const target = await req.app.locals.userCollection.findOne({ uid: req.params.uid, blocked: { $ne: true } });
    if (!isPublic(target)) return res.status(404).json({ error: "profile_unavailable" });
    await setCommunityPreference(req.app.locals, viewer.uid, "hidden_author", target.uid, true);
    return res.json({ hidden: true });
  });

  router.post("/posts/:id/save", async (req: Request, res: Response) => {
    const viewer = await resolveCurrentUser(req);
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    if (typeof req.body?.saved !== "boolean") return res.status(400).json({ error: "invalid_saved_state" });
    const result = await getPublicPost(req, req.params.id);
    if (!result || !await canViewPost(req, result.post, viewer)) return res.status(404).json({ error: "post_unavailable" });
    await setCommunityPreference(req.app.locals, viewer.uid, "saved_post", String(result.post._id), req.body.saved);
    return res.json({ saved: req.body.saved });
  });

  router.post("/posts/:id/not-interested", async (req: Request, res: Response) => {
    const viewer = await resolveCurrentUser(req);
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result || !await canViewPost(req, result.post, viewer)) return res.status(404).json({ error: "post_unavailable" });
    await setCommunityPreference(req.app.locals, viewer.uid, "not_interested_post", String(result.post._id), true);
    return res.json({ dismissed: true });
  });

  router.post("/posts/:id/share", async (req: Request, res: Response) => {
    const viewer = await resolveCurrentUser(req);
    if (!viewer) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result || !await canViewPost(req, result.post, viewer)) return res.status(404).json({ error: "post_unavailable" });
    await req.app.locals.communityPostCollection.updateOne(
      { _id: result.post._id, status: "published" },
      { $inc: { shareCount: 1 } },
    );
    return res.json({ shareCount: Number(result.post.shareCount || 0) + 1 });
  });

  router.post("/posts", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (user.blocked) return res.status(403).json({ error: "account_unavailable" });
    const fields = parsePostInput(req.body || {});
    if (!fields) return res.status(400).json({ error: "invalid_post", message: "Check the post content, options, audience and attachments." });
    if (!(await validMediaTags(req.app.locals, fields.media))) return res.status(400).json({ error: "invalid_media_tags" });
    const collaborators = fields.collaboratorIds.length
      ? await req.app.locals.userCollection.find({ uid: { $in: fields.collaboratorIds }, blocked: { $ne: true }, publicProfile: { $ne: false }, "settings.publicProfile": { $ne: false } }).toArray()
      : [];
    if (collaborators.length !== fields.collaboratorIds.length) return res.status(400).json({ error: "invalid_collaborators" });
    let job = null;
    if (fields.jobId) {
      job = await req.app.locals.jobCollection.findOne({
        slug: fields.jobId,
        status: "active",
        moderationStatus: "approved",
        expiresAt: { $gt: new Date().toISOString() },
      });
      if (!job) return res.status(400).json({ error: "job_unavailable", message: "Choose an active approved SMAJ Jobs listing." });
    }
    const publishAt = req.body?.publishAt ? new Date(String(req.body.publishAt)) : null;
    if (publishAt && (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < Date.now() + 60_000 || publishAt.getTime() > Date.now() + 365 * 86_400_000)) {
      return res.status(400).json({ error: "invalid_schedule", message: "Choose a publish time between one minute and one year from now." });
    }
    const clientRequestId = String(req.body?.clientRequestId || "").trim();
    if (clientRequestId && !/^[a-zA-Z0-9._:-]{8,100}$/.test(clientRequestId)) {
      return res.status(400).json({ error: "invalid_request_id" });
    }
    const requestHash = clientRequestId
      ? createHash("sha256").update(JSON.stringify({ fields, publishAt: publishAt?.toISOString() || null })).digest("hex")
      : "";
    if (clientRequestId) {
      const previous = await req.app.locals.communityPostCollection.findOne({ authorId: user.uid, clientRequestId });
      if (previous) {
        if (previous.requestHash !== requestHash) return res.status(409).json({ error: "idempotency_conflict", message: "This post changed after an uncertain publish attempt. Submit it again to publish the updated version." });
        return res.status(200).json({ post: { ...serialize(previous), author: await publicIdentity(req.app.locals, user), likedByMe: false } });
      }
    }
    const recentPosts = await req.app.locals.communityPostCollection.countDocuments({ authorId: user.uid, createdAt: { $gte: new Date(Date.now() - 60_000) } });
    if (recentPosts >= 3) return res.status(429).json({ error: "posting_rate_limited", message: "Please wait before publishing another post." });
    const now = new Date();
    const post = {
      ...fields,
      ...(job ? { job: { id: job.slug, title: job.title, company: job.company, location: job.location } } : {}),
      authorId: user.uid,
      ...(clientRequestId ? { clientRequestId, requestHash } : {}),
      type: "post",
      status: publishAt ? "scheduled" : "published",
      ...(publishAt ? { publishAt } : {}),
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    let result;
    try {
      result = await req.app.locals.communityPostCollection.insertOne(post);
    } catch (error: any) {
      if (error?.code !== 11000 || !clientRequestId) throw error;
      const previous = await req.app.locals.communityPostCollection.findOne({ authorId: user.uid, clientRequestId });
      if (!previous) throw error;
      if (previous.requestHash !== requestHash) return res.status(409).json({ error: "idempotency_conflict", message: "This post changed after an uncertain publish attempt. Submit it again to publish the updated version." });
      return res.status(200).json({ post: { ...serialize(previous), author: await publicIdentity(req.app.locals, user), likedByMe: false } });
    }
    return res.status(201).json({ post: { ...post, _id: String(result.insertedId), author: await publicIdentity(req.app.locals, user), likedByMe: false } });
  });

  router.patch("/posts/:id/schedule", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "scheduled_post_unavailable" });
    const post = await req.app.locals.communityPostCollection.findOne({ _id: new ObjectId(req.params.id), authorId: user.uid, status: "scheduled" });
    if (!post) return res.status(404).json({ error: "scheduled_post_unavailable" });
    const publishAt = new Date(String(req.body?.publishAt || ""));
    if (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < Date.now() + 60_000 || publishAt.getTime() > Date.now() + 365 * 86_400_000) {
      return res.status(400).json({ error: "invalid_schedule", message: "Choose a publish time between one minute and one year from now." });
    }
    const updatesContent = Object.keys(req.body || {}).some(key => key !== "publishAt");
    let fields: ReturnType<typeof parsePostInput> = null;
    let job: Record<string, any> | null = null;
    if (updatesContent) {
      fields = parsePostInput({
        ...post,
        ...req.body,
        collaborators: req.body?.collaborators ?? post.collaboratorIds ?? [],
        postType: req.body?.postType || post.postType || "post",
      });
      if (!fields) return res.status(400).json({ error: "invalid_post", message: "Check the post content, options, audience and attachments." });
      if (!(await validMediaTags(req.app.locals, fields.media))) return res.status(400).json({ error: "invalid_media_tags" });
      const collaborators = fields.collaboratorIds.length
        ? await req.app.locals.userCollection.find({ uid: { $in: fields.collaboratorIds }, blocked: { $ne: true }, publicProfile: { $ne: false }, "settings.publicProfile": { $ne: false } }).toArray()
        : [];
      if (collaborators.length !== fields.collaboratorIds.length) return res.status(400).json({ error: "invalid_collaborators" });
      if (fields.jobId) {
        job = await req.app.locals.jobCollection.findOne({
          slug: fields.jobId,
          status: "active",
          moderationStatus: "approved",
          expiresAt: { $gt: new Date().toISOString() },
        });
        if (!job) return res.status(400).json({ error: "job_unavailable", message: "Choose an active approved SMAJ Jobs listing." });
      }
    }
    const updatedAt = new Date();
    const updateFields = {
      ...(fields || {}),
      ...(job ? { job: { id: job.slug, title: job.title, company: job.company, location: job.location } } : {}),
      publishAt,
      updatedAt,
    };
    const unsetFields: Record<string, ""> = {};
    if (fields) {
      for (const key of ["poll", "event", "document", "jobId", "job", "celebration"]) {
        if (!(key in updateFields)) unsetFields[key] = "";
      }
    }
    await req.app.locals.communityPostCollection.updateOne(
      { _id: post._id, authorId: user.uid, status: "scheduled" },
      { $set: updateFields, ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}) },
    );
    const updatedPost = { ...post, ...updateFields };
    Object.keys(unsetFields).forEach(key => delete updatedPost[key]);
    return res.json({ post: serialize(updatedPost) });
  });

  router.delete("/posts/:id/schedule", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "scheduled_post_unavailable" });
    const result = await req.app.locals.communityPostCollection.updateOne(
      { _id: new ObjectId(req.params.id), authorId: user.uid, status: "scheduled" },
      { $set: { status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() } },
    );
    return result.modifiedCount ? res.json({ cancelled: true }) : res.status(404).json({ error: "scheduled_post_unavailable" });
  });

  router.post("/posts/:id/poll/vote", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result?.post.poll) return res.status(404).json({ error: "poll_unavailable" });
    const optionId = String(req.body?.optionId || "");
    if (!result.post.poll.options.some((option: Record<string, any>) => option.id === optionId)
      || (result.post.poll.expiresAt && new Date(result.post.poll.expiresAt).getTime() <= Date.now())) {
      return res.status(400).json({ error: "invalid_poll_vote" });
    }
    await req.app.locals.communityPollVoteCollection.updateOne(
      { postId: String(result.post._id), userId: user.uid },
      { $set: { optionId, votedAt: new Date() } },
      { upsert: true },
    );
    const votes = await req.app.locals.communityPollVoteCollection.find({ postId: String(result.post._id) }).toArray();
    return res.json({
      myVote: optionId,
      options: result.post.poll.options.map((option: Record<string, any>) => ({
        ...option,
        votes: votes.filter((vote: Record<string, any>) => vote.optionId === option.id).length,
      })),
    });
  });

  router.post("/posts/:id/like", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    const postId = String(result.post._id);
    const existing = await req.app.locals.communityLikeCollection.findOne({ postId, userId: user.uid });
    const saved = await saveCommunityReaction(req.app.locals, result.post, user.uid, existing?.reaction === "like" || (existing && !existing.reaction) ? null : "like");
    return res.json({ liked: saved.myReaction === "like", likeCount: saved.likeCount });
  });

  router.post("/posts/:id/reaction", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    const requested = req.body?.reaction;
    if (requested !== null && !["like", "love", "celebrate", "support", "insightful"].includes(String(requested))) {
      return res.status(400).json({ error: "invalid_reaction" });
    }
    const saved = await saveCommunityReaction(req.app.locals, result.post, user.uid, requested === null ? null : String(requested));
    return res.json(saved);
  });

  router.get("/posts/:id/comments", async (req: Request, res: Response) => {
    const result = await getPublicPost(req, req.params.id);
    if (!result) return res.status(404).json({ error: "post_unavailable" });
    if (!await canCommentOnPost(req, result.post, result.viewer)) return res.status(403).json({ error: "comments_unavailable" });
    const comments = await req.app.locals.communityCommentCollection.find({ postId: String(result.post._id), status: "visible" }).sort({ createdAt: 1 }).limit(100).toArray();
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
    if (!await canCommentOnPost(req, result.post, user)) return res.status(403).json({ error: "comments_unavailable" });
    const content = String(req.body?.content || "").trim();
    if (!content || content.length > MAX_COMMENT_TEXT) return res.status(400).json({ error: "invalid_comment", message: "Comments must contain 1–1,000 characters." });
    const requestedParentId = String(req.body?.parentId || "").trim();
    let parentId: string | undefined;
    if (requestedParentId) {
      if (!ObjectId.isValid(requestedParentId)) return res.status(400).json({ error: "invalid_reply_target" });
      const parent = await req.app.locals.communityCommentCollection.findOne({
        _id: new ObjectId(requestedParentId),
        postId: String(result.post._id),
        status: "visible",
      });
      if (!parent || parent.parentId) return res.status(400).json({ error: "invalid_reply_target" });
      parentId = String(parent._id);
    }
    const recentComments = await req.app.locals.communityCommentCollection.countDocuments({ authorId: user.uid, createdAt: { $gte: new Date(Date.now() - 60_000) } });
    if (recentComments >= 10) return res.status(429).json({ error: "comment_rate_limited", message: "Please wait before posting another comment." });
    const comment = { postId: String(result.post._id), authorId: user.uid, ...(parentId ? { parentId } : {}), content, status: "visible", createdAt: new Date() };
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
    if ((result.post.audience || "everyone") !== "everyone") {
      return res.status(403).json({ error: "repost_unavailable", message: "Posts with limited audiences cannot be reposted." });
    }
    if (result.post.authorId === user.uid) return res.status(400).json({ error: "self_repost" });
    const originalId = String(result.post.repostOf || result.post._id);
    const originalResult = await getPublicPost(req, originalId);
    if (!originalResult) return res.status(404).json({ error: "post_unavailable" });
    if ((originalResult.post.audience || "everyone") !== "everyone") {
      return res.status(403).json({ error: "repost_unavailable", message: "Posts with limited audiences cannot be reposted." });
    }
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

  router.patch("/posts/:id", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "post_unavailable" });
    const post = await req.app.locals.communityPostCollection.findOne({
      _id: new ObjectId(req.params.id),
      authorId: user.uid,
      status: "published",
    });
    if (!post) return res.status(404).json({ error: "post_unavailable" });
    const content = String(req.body?.content ?? "").trim();
    const hasStructuredContent = Boolean(post.media?.length || post.poll || post.event || post.document || post.job || post.celebration);
    if (content.length > MAX_POST_TEXT || (!content && !hasStructuredContent)) {
      return res.status(400).json({ error: "invalid_post_content", message: "Add text or keep existing post content." });
    }
    const updatedAt = new Date();
    await req.app.locals.communityPostCollection.updateOne(
      { _id: post._id, authorId: user.uid, status: "published" },
      { $set: { content, updatedAt } },
    );
    return res.json({ post: serialize({ ...post, content, updatedAt }) });
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
