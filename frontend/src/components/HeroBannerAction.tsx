import type { ReactNode } from "react";
import { Link } from "react-router-dom";
export default function HeroBannerAction({ to, children }: { to: string; children: ReactNode }) {
  if (!to) return null;
  return /^https:\/\//i.test(to) ? (
    <a href={to} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link to={to}>{children}</Link>
  );
}
