export const PRESENCE_TTL_MS = 45_000;
export function readUserPresence(user: any, now = Date.now()) {
  const sessions = user?.presenceSessions;
  const expiries = sessions && typeof sessions === "object"
    ? Object.values(sessions).map((entry: any) => new Date(entry?.expiresAt || 0).getTime()).filter(Number.isFinite)
    : [user?.lastSeenAt ? new Date(user.lastSeenAt).getTime() + PRESENCE_TTL_MS : 0];
  const expiresAt = Math.max(0, ...expiries);
  return { online: expiresAt > now, lastSeenAt: user?.lastSeenAt || null, presenceExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null };
}
export function presenceUpdate(user: any, sessionId: string, active: boolean, now = Date.now()) {
  const unset: Record<string, string> = {};
  for (const [key, entry] of Object.entries(user.presenceSessions || {})) {
    if (key !== sessionId && /^[a-zA-Z0-9_-]{20,80}$/.test(key) && !(new Date((entry as any)?.expiresAt || 0).getTime() > now)) unset["presenceSessions." + key] = "";
  }
  const set: Record<string, unknown> = { lastSeenAt: new Date(now) };
  if (active) set["presenceSessions." + sessionId] = { expiresAt: new Date(now + PRESENCE_TTL_MS) };
  else unset["presenceSessions." + sessionId] = "";
  return { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) };
}
