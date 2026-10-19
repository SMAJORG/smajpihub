import { getUserPlatformAPIClient } from "./platformAPIClient";
import { Request } from "express";
import { ObjectId } from "mongodb";
import { UserData } from "../types/user";
import { AuthSessionUser } from "../types/session";

const getBearerToken = (authorization = "") => {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const resolveUser = async (req: Request): Promise<UserData | null> => {
  const userCollection = req.app.locals.userCollection;
  if (!userCollection) return null;

  if (req.session.user?.userId && ObjectId.isValid(req.session.user.userId)) {
    const sessionUser = await userCollection.findOne({ _id: new ObjectId(req.session.user.userId) });
    if (!sessionUser || sessionUser.blocked) return null;
    return sessionUser;
  }

  const accessToken = getBearerToken(req.get("authorization")) || req.get("x-smaj-access-token") || "";
  if (!accessToken) return null;

  const currentUser = await userCollection.findOne({ accessToken });
  if (!currentUser || currentUser.blocked || (currentUser as any).accessTokenRevokedAt) return null;

  try {
    const verified = (await getUserPlatformAPIClient().get("/v2/me", { headers: { Authorization: "Bearer " + accessToken }, timeout: 6000 })).data;
    if (verified?.uid !== currentUser.uid) return null;
    if (verified.credentials?.valid_until?.timestamp && verified.credentials.valid_until.timestamp * 1000 <= Date.now()) return null;
  } catch { return null; }
  return currentUser;
};

// Share verification only within the same HTTP request; never reuse authentication across requests.
const resolvedRequests = new WeakMap<Request, Promise<UserData | null>>();
export const resolveCurrentUser = (req: Request): Promise<UserData | null> => {
  let result = resolvedRequests.get(req);
  if (!result) { result = resolveUser(req); resolvedRequests.set(req, result); }
  return result;
};

export const minimalSessionUser = (user: UserData | Record<string, any>): AuthSessionUser => ({
  userId: user._id.toString(),
  ...(user.uid == null ? {} : { uid: String(user.uid) }),
  piUsername: user.piUsername || user.username,
  role: ["buyer", "seller", "admin"].includes(user.role) ? user.role : "buyer",
});

export const setSessionUser = (req: Request, user: UserData | Record<string, any>) => {
  delete (req.session as any).currentUser;
  delete (req.session as any).accessToken;
  delete (req.session as any).piUser;
  req.session.user = minimalSessionUser(user);
};
