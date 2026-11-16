import { useSmajVerification } from "../lib/smajVerification";
import "./SmajVerifiedBadge.css";

export default function SmajVerifiedBadge({ userId }: { userId?: string }) {
  const verification = useSmajVerification(userId);
  if (!verification?.verified || verification.status !== "approved") return null;
  const level = verification.level || "pi_verified";
  const label = level === "trusted_seller" ? "Trusted Seller" : level === "seller_verified" ? "Seller Verified" : "Pi Verified";
  return <span className={`smaj-verified-badge ${level}`} role="img" aria-label={`SMAJ Verified — ${label}`} title={`SMAJ Verified — ${label}. Product, professional and institutional approvals are separate.`}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="m23 12-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.82.34 3.68L1 12l2.44 2.78-.34 3.68 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12Zm-12.91 4.72-3.8-3.81 1.41-1.41 2.39 2.4 5.95-5.96 1.41 1.41-7.36 7.37Z" /></svg>
  </span>;
}
