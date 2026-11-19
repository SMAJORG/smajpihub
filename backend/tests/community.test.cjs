const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const express = require("express");
const session = require("express-session");
const { ObjectId } = require("mongodb");
const { createMemoryCollections } = require("../build/services/memoryDatabase");
const mountAdminEndpoints = require("../build/handlers/admin").default;
const mountCommunityEndpoints = require("../build/handlers/community").default;
const mountUserEndpoints = require("../build/handlers/users").default;
const { getEligibleAvatarFrames, resolveAvatarFrame } = require("../build/services/avatarFrames");

const app = express();
const locals = createMemoryCollections();
app.locals = { ...app.locals, ...locals };
const accounts = new Map();
let server;
let baseUrl;

app.use(express.json());
app.use(session({ secret: "community-test-session", resave: false, saveUninitialized: true }));
app.use((req, _res, next) => {
  const account = accounts.get(req.get("x-test-user"));
  if (account) req.session.user = { userId: String(account._id), uid: account.uid, role: account.role };
  next();
});
const communityRouter = express.Router();
const adminRouter = express.Router();
const userRouter = express.Router();
mountCommunityEndpoints(communityRouter);
mountAdminEndpoints(adminRouter);
mountUserEndpoints(userRouter);
app.use("/community", communityRouter);
app.use("/admin", adminRouter);
app.use("/user", userRouter);
app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));

const makeAccount = async (uid, values = {}) => {
  const account = {
    uid,
    username: uid,
    piUsername: uid,
    displayName: `User ${uid}`,
    avatar: "",
    role: "buyer",
    blocked: false,
    publicProfile: true,
    allowContact: true,
    settings: { theme: "light", publicProfile: true, allowContact: true },
    createdAt: new Date(),
    ...values,
  };
  const result = await locals.userCollection.insertOne(account);
  account._id = result.insertedId;
  accounts.set(uid, account);
  return account;
};

const request = async (method, path, uid, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(uid ? { "x-test-user": uid } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, data: await response.json() };
};

test("community profiles, privacy, eligibility, engagement, and moderation", async () => {
  const author = await makeAccount("author");
  const viewer = await makeAccount("viewer");
  const otherViewer = await makeAccount("other-viewer");
  const thirdViewer = await makeAccount("third-viewer");
  const privateUser = await makeAccount("private-user", { publicProfile: false, settings: { theme: "light", publicProfile: false, allowContact: true } });
  const seller = await makeAccount("seller", { role: "seller", sellerActive: true });
  const ambassador = await makeAccount("ambassador");
  const employer = await makeAccount("employer");
  const admin = await makeAccount("admin", { role: "admin" });
  const multiRoleSeller = await makeAccount("multi-role-seller", {
    role: "admin", roles: ["admin", "seller", "moderator"], sellerActive: true,
  });

  const listing = await locals.productCollection.insertOne({
    sellerId: seller.uid, title: "Approved item", active: true, hidden: false, approved: true, reviewStatus: "approved",
  });
  await locals.productCollection.insertOne({
    sellerId: multiRoleSeller.uid, title: "Approved role listing", active: true, hidden: false, approved: true, reviewStatus: "approved",
  });
  await locals.ambassadorCollection.insertOne({ userId: ambassador.uid, status: "approved" });
  await locals.jobCompanyCollection.insertOne({
    ownerId: employer.uid, verified: true, moderationStatus: "approved", verificationStatus: "verified",
  });

  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  let result = await request("GET", `/community/profiles/${author.uid}`, viewer.uid);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.profile.uid, author.uid);
  result = await request("GET", `/community/profiles/${privateUser.uid}`, viewer.uid);
  assert.equal(result.response.status, 404);
  result = await request("GET", `/community/profiles/${privateUser.uid}`, privateUser.uid);
  assert.equal(result.response.status, 200);

  result = await request("POST", `/community/follow/${viewer.uid}`, viewer.uid);
  assert.equal(result.response.status, 400);
  result = await request("POST", `/community/follow/${author.uid}`, viewer.uid);
  assert.equal(result.response.status, 201);
  assert.equal(result.data.following, true);

  result = await request("GET", "/user/search?q=User", viewer.uid);
  assert.equal(result.response.status, 200);
  assert.ok(result.data.users.some(user => user.uid === author.uid));
  assert.ok(!result.data.users.some(user => user.uid === privateUser.uid));

  result = await request("PUT", "/user/social-settings", seller.uid, {
    publicProfile: true, allowContact: true, openToWork: true, activeAvatarFrame: "seller",
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.settings.eligibleFrames.sort(), ["open_to_work", "seller"]);
  assert.equal(result.data.settings.activeAvatarFrame, "seller");
  assert.equal((await locals.userCollection.findOne({ uid: seller.uid })).activeAvatarFrame, "seller");
  result = await request("PUT", "/user/social-settings", seller.uid, {
    publicProfile: true, allowContact: true, openToWork: false, activeAvatarFrame: "hiring",
  });
  assert.equal(result.response.status, 403, "the server rejects a frame the account has not unlocked");
  result = await request("PUT", "/user/social-settings", seller.uid, {
    publicProfile: true, allowContact: true, openToWork: true, activeAvatarFrame: "open_to_work",
  });
  assert.equal(result.response.status, 200);
  assert.equal((await locals.userCollection.findOne({ uid: seller.uid })).activeAvatarFrame, "open_to_work");
  result = await request("PUT", "/user/social-settings", seller.uid, {
    publicProfile: true, allowContact: true, openToWork: true, activeAvatarFrame: null,
  });
  assert.equal(result.response.status, 200);
  assert.equal((await locals.userCollection.findOne({ uid: seller.uid })).activeAvatarFrame, null);

  assert.deepEqual(await getEligibleAvatarFrames(locals, multiRoleSeller), ["seller"]);
  result = await request("PUT", "/user/profile", multiRoleSeller.uid, {
    displayName: "Multi-role seller", role: "admin", sellerActive: true,
    country: "NG", contactPhone: "", avatar: "", coverImage: "", bio: "", language: "English",
  });
  assert.equal(result.response.status, 200);
  const savedMultiRoleSeller = await locals.userCollection.findOne({ uid: multiRoleSeller.uid });
  assert.deepEqual(savedMultiRoleSeller.roles, ["admin", "seller", "moderator"]);
  result = await request("PUT", "/user/social-settings", multiRoleSeller.uid, {
    publicProfile: true, allowContact: true, openToWork: false, activeAvatarFrame: "seller",
  });
  assert.equal(result.response.status, 200);
  assert.equal((await locals.userCollection.findOne({ uid: multiRoleSeller.uid })).activeAvatarFrame, "seller");
  await locals.productCollection.deleteOne({ _id: listing.insertedId });
  result = await request("GET", "/user/social-settings", seller.uid);
  assert.equal(result.data.settings.activeAvatarFrame, null);
  assert.ok(!result.data.settings.eligibleFrames.includes("seller"));
  result = await request("PUT", "/user/social-settings", seller.uid, {
    publicProfile: false, allowContact: false, openToWork: true, activeAvatarFrame: "open_to_work",
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.settings.publicProfile, false);
  assert.equal(result.data.settings.allowContact, false);
  result = await request("GET", `/community/profiles/${seller.uid}`, viewer.uid);
  assert.equal(result.response.status, 404);
  result = await request("GET", `/community/profiles/${seller.uid}`, seller.uid);
  assert.equal(result.response.status, 200);

  assert.deepEqual(await getEligibleAvatarFrames(locals, ambassador), ["ambassador"]);
  assert.deepEqual(await getEligibleAvatarFrames(locals, employer), ["hiring"]);
  assert.equal((await getEligibleAvatarFrames(locals, multiRoleSeller)).includes("seller"), true);
  assert.equal(resolveAvatarFrame({ activeAvatarFrame: "hiring" }, ["hiring"]), "hiring");
  assert.equal(resolveAvatarFrame({ activeAvatarFrame: "seller" }, []), null);

  const privatePost = await request("POST", "/community/posts", privateUser.uid, { content: "Private post", media: [] });
  assert.equal(privatePost.response.status, 201);
  result = await request("GET", `/community/feed?authorId=${privateUser.uid}`, privateUser.uid);
  assert.equal(result.data.posts.length, 1);
  result = await request("GET", `/community/feed?authorId=${privateUser.uid}`, viewer.uid);
  assert.equal(result.response.status, 404);
  result = await request("DELETE", `/community/posts/${privatePost.data.post._id}`, privateUser.uid);
  assert.equal(result.response.status, 200);

  const created = await request("POST", "/community/posts", author.uid, { content: "A public community post", media: [] });
  assert.equal(created.response.status, 201);
  const postId = created.data.post._id;
  result = await request("POST", "/community/posts", author.uid, {
    content: "Invalid media",
    media: [{ type: "image", url: "https://res.cloudinary.com/example/video/upload/sample.mp4" }],
  });
  assert.equal(result.response.status, 400);
  result = await request("POST", `/community/posts/${postId}/like`, viewer.uid);
  assert.deepEqual(result.data, { liked: true, likeCount: 1 });
  result = await request("POST", `/community/posts/${postId}/like`, viewer.uid);
  assert.deepEqual(result.data, { liked: false, likeCount: 0 });
  result = await request("POST", `/community/posts/${postId}/comments`, viewer.uid, { content: "A comment" });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.comment.content, "A comment");

  result = await request("POST", `/community/posts/${postId}/repost`, viewer.uid);
  assert.equal(result.response.status, 201);
  const repostId = result.data.post._id;
  result = await request("POST", `/community/posts/${postId}/repost`, viewer.uid);
  assert.equal(result.response.status, 409);

  result = await request("POST", `/community/posts/${postId}/report`, viewer.uid, { reason: "Spam" });
  assert.equal(result.response.status, 201);
  result = await request("POST", `/community/posts/${postId}/report`, viewer.uid, { reason: "Spam" });
  assert.equal(result.response.status, 409);
  await request("POST", `/community/posts/${postId}/report`, otherViewer.uid, { reason: "Spam" });
  await request("POST", `/community/posts/${postId}/report`, thirdViewer.uid, { reason: "Spam" });
  assert.equal((await locals.communityPostCollection.findOne({ _id: new ObjectId(postId) })).status, "hidden");
  result = await request("GET", "/community/feed", viewer.uid);
  assert.ok(!result.data.posts.some(post => post._id === postId || post._id === repostId));
  result = await request("PATCH", `/admin/community/posts/${postId}/moderate`, admin.uid, { status: "published" });
  assert.equal(result.response.status, 200);
  result = await request("GET", "/community/feed", viewer.uid);
  assert.ok(result.data.posts.some(post => post._id === postId));
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});
