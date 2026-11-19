import { Router, Request, Response } from "express";
import { resolveCurrentUser } from "../services/auth";
import {
  createReferralAttribution,
  ensureReferralCode,
  isValidReferralCode,
  referralVisitorHash,
} from "../services/referrals";

const HISTORY_LIMIT = 100;

export default function mountReferralEndpoints(router: Router) {
  router.post("/visit", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const code = req.body?.code;
    if (!isValidReferralCode(code)) return res.status(400).json({ message: "Invalid invitation link." });
    const users = req.app.locals.userCollection;
    const visits = req.app.locals.referralVisitCollection;
    if (!users || !visits) return res.status(503).json({ message: "Referral tracking is temporarily unavailable." });

    try {
      const inviter = await users.findOne({ referralCode: code }, { projection: { uid: 1 } });
      if (!inviter) return res.json({ tracked: false });
      const visitorHash = referralVisitorHash(req.ip || "unknown");
      try {
        await visits.updateOne(
          { referralCode: code, visitorHash },
          { $setOnInsert: { referralCode: code, inviterUid: inviter.uid, visitorHash, createdAt: new Date() } },
          { upsert: true },
        );
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
      return res.json({ tracked: true, attribution: createReferralAttribution(code) });
    } catch {
      return res.status(503).json({ message: "Referral tracking is temporarily unavailable." });
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const user = await resolveCurrentUser(req);
      if (!user) return res.status(401).json({ message: "Sign in to view your invitation activity." });
      const users = req.app.locals.userCollection;
      const visits = req.app.locals.referralVisitCollection;
      if (!users || !visits) return res.status(503).json({ message: "Referral data is temporarily unavailable." });

      const referralCode = await ensureReferralCode(users, user);
      const inviteeQuery = { invitedByUid: user.uid, blocked: { $ne: true } };
      const [visitCount, signUpCount, invitees] = await Promise.all([
        visits.countDocuments({ referralCode }),
        users.countDocuments(inviteeQuery),
        users.find(
          inviteeQuery,
          { projection: { displayName: 1, username: 1, createdAt: 1 } },
        ).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).toArray(),
      ]);
      return res.json({
        referralCode,
        visits: visitCount,
        successfulSignUps: signUpCount,
        invitations: invitees.map((invitee: any) => ({
          name: invitee.displayName || invitee.username || "Pi member",
          registeredAt: invitee.createdAt,
        })),
      });
    } catch {
      return res.status(503).json({ message: "Referral data is temporarily unavailable." });
    }
  });
}
