import { resolveLinkedPiAccount } from "./piIdentityLinks";

// Only authoritative Pi payment payloads may supply payerUid. Never use a
// request-body UID or a matching username as evidence of payment ownership.
export async function paymentOwnedBy(locals: any, payerUid: unknown, accountUid: string) {
  if (typeof payerUid !== "string" || !payerUid) return false;
  if (payerUid === accountUid) return true;
  const account = await resolveLinkedPiAccount(locals, payerUid);
  return Boolean(account && !account.blocked && account.uid === accountUid);
}
