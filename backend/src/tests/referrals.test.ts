import assert from "node:assert/strict";
import axios from "axios";
import express from "express";
import session from "express-session";
import { createServer } from "node:http";
import mountReferralEndpoints from "../handlers/referrals";
import { handleSignIn } from "../handlers/users";
import { createMemoryCollections } from "../services/memoryDatabase";
import {
  createReferralAttribution,
  createReferralCode,
  verifyReferralAttribution,
} from "../services/referrals";

const main = async () => {
  const collections = createMemoryCollections();
  const inviterUid = "pi-referrer-uid";
  const referralCode = createReferralCode();
  await collections.userCollection.insertOne({
    uid: inviterUid,
    username: "referrer",
    piUsername: "referrer",
    displayName: "Referrer",
    role: "buyer",
    roles: ["buyer"],
    blocked: false,
    referralCode,
    createdAt: new Date(),
  });
  const secondInviterUid = "pi-second-referrer-uid";
  const secondReferralCode = createReferralCode();
  await collections.userCollection.insertOne({
    uid: secondInviterUid,
    username: "second-referrer",
    piUsername: "second-referrer",
    displayName: "Second Referrer",
    role: "buyer",
    roles: ["buyer"],
    blocked: false,
    referralCode: secondReferralCode,
    createdAt: new Date(),
  });

  const attribution = createReferralAttribution(referralCode);
  assert.equal(verifyReferralAttribution(attribution)?.code, referralCode);
  assert.equal(verifyReferralAttribution(`${attribution}x`), null);
  assert.equal(verifyReferralAttribution(createReferralAttribution(referralCode, Date.now() - 31 * 86400000)), null);

  const app = express();
  Object.assign(app.locals, collections);
  app.use(express.json());
  app.use(session({ secret: "referral-integration-test", resave: false, saveUninitialized: false }));
  const referrals = express.Router();
  mountReferralEndpoints(referrals);
  app.use("/referrals", referrals);
  app.post("/user/signin", handleSignIn);
  app.locals.siteContentCollection = { findOne: async () => null };

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const originalAdapter = axios.defaults.adapter;
  let identity = { uid: "pi-invitee-uid", username: "invitee" };
  axios.defaults.adapter = async config => ({
    data: identity,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });

  try {
    const privateStats = await fetch(`${base}/referrals`);
    assert.equal(privateStats.status, 401);

    const invalidVisit = await fetch(`${base}/referrals/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "not-a-referral-code" }),
    });
    assert.equal(invalidVisit.status, 400);

    const usersBeforeInvalidSignIn = await collections.userCollection.countDocuments({});
    const invalidSignIn = await fetch(`${base}/user/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authResult: { accessToken: "" }, user: { uid: "forged-pi-uid", username: "forged" } }),
    });
    assert.equal(invalidSignIn.status, 400);
    assert.equal(await collections.userCollection.countDocuments({}), usersBeforeInvalidSignIn);

    const visit = await fetch(`${base}/referrals/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: referralCode }),
    });
    assert.equal(visit.status, 200);
    const visitData = await visit.json() as { tracked: boolean; attribution: string };
    assert.equal(visitData.tracked, true);

    await fetch(`${base}/referrals/visit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: referralCode }),
    });
    assert.equal(await collections.referralVisitCollection.countDocuments({ referralCode }), 1);

    const signIn = await fetch(`${base}/user/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authResult: { accessToken: "verified-pi-token" }, referralAttribution: visitData.attribution }),
    });
    assert.equal(signIn.status, 200);
    const sessionCookie = signIn.headers.get("set-cookie")?.match(/connect\.sid=[^;,]+/)?.[0];
    assert.ok(sessionCookie);
    const invitee = await collections.userCollection.findOne({ uid: identity.uid });
    assert.equal(invitee?.invitedByUid, inviterUid);
    assert.equal(invitee?.referralCode && invitee.referralCode !== referralCode, true);

    const duplicateReferralSignIn = await fetch(`${base}/user/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authResult: { accessToken: "verified-pi-token" },
        referralAttribution: createReferralAttribution(secondReferralCode),
      }),
    });
    assert.equal(duplicateReferralSignIn.status, 200);
    const inviteeAfterDuplicate = await collections.userCollection.findOne({ uid: identity.uid });
    assert.equal(inviteeAfterDuplicate?.invitedByUid, inviterUid);
    assert.equal(await collections.userCollection.countDocuments({ invitedByUid: secondInviterUid }), 0);

    identity = { uid: inviterUid, username: "referrer" };
    const selfSignIn = await fetch(`${base}/user/signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authResult: { accessToken: "verified-pi-token" }, referralAttribution: createReferralAttribution(referralCode) }),
    });
    assert.equal(selfSignIn.status, 200);
    const inviterSessionCookie = selfSignIn.headers.get("set-cookie")?.match(/connect\.sid=[^;,]+/)?.[0];
    assert.ok(inviterSessionCookie);
    const inviterAfterSelfAttempt = await collections.userCollection.findOne({ uid: inviterUid });
    assert.equal(inviterAfterSelfAttempt?.invitedByUid, undefined);
    assert.equal(await collections.userCollection.countDocuments({ invitedByUid: inviterUid }), 1);

    const dashboard = await fetch(`${base}/referrals`, { headers: { cookie: inviterSessionCookie } });
    assert.equal(dashboard.status, 200);
    const dashboardData = await dashboard.json() as {
      visits: number;
      successfulSignUps: number;
      invitations: Array<{ name: string }>;
    };
    assert.equal(dashboardData.visits, 1);
    assert.equal(dashboardData.successfulSignUps, 1);
    assert.deepEqual(dashboardData.invitations.map(invitation => invitation.name), ["invitee"]);
  } finally {
    axios.defaults.adapter = originalAdapter;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
