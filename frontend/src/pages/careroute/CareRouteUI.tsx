import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { careRouteConnection } from "../../lib/careRouteConnection";
import type { PatientRequestStatus } from "../../types/careroute";

export const statusLabels: Record<PatientRequestStatus, string> = {
  submitted: "Submitted",
  dispatched: "Sent to hospital",
  accepted: "Accepted",
  rejected: "Diverted",
  completed: "Care completed",
  closed: "Closed / cancelled",
};
export const isActiveRequest = (status: PatientRequestStatus) =>
  ["submitted", "dispatched", "accepted"].includes(status);
export function formatCareDate(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not recorded";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function StatusBadge({ status }: { status: PatientRequestStatus }) {
  return (
    <span className={`cr-status cr-status-${status}`}>
      <i aria-hidden="true" />
      {statusLabels[status] || status}
    </span>
  );
}
export function ConnectionBanner({ quiet = false }: { quiet?: boolean }) {
  const connection = useSyncExternalStore(careRouteConnection.subscribe, careRouteConnection.getSnapshot);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const writeFailed = connection.failures.some(key => !key.startsWith("GET "));
  const warning = !online || connection.failures.length > 0;
  if (quiet && !warning && !connection.pendingWrites) return null;
  return (
    <div className={`cr-connection${warning ? " cr-connection-warning" : ""}`} role={warning ? "alert" : "status"}>
      <i aria-hidden="true" />
      <div>
        <strong>
          {!online
            ? "You're offline"
            : writeFailed
              ? "A change could not be confirmed"
              : warning
                ? "Unable to refresh from the server"
                : connection.pendingWrites
                  ? "Sending your changes..."
                  : connection.lastContact
                    ? "Server reached"
                    : "Waiting for server confirmation"}
        </strong>
        <span>
          {warning
            ? "Saved details may be out of date. Reconnect and refresh; confirm important changes with the hospital."
            : connection.lastContact
              ? `Last contact ${new Date(connection.lastContact).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Updates are checked periodically.`
              : "Local updates alone do not confirm hospital receipt."}
        </span>
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="cr-page-heading">
      <div>
        {eyebrow && <div className="cr-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="cr-actions">{actions}</div>}
    </div>
  );
}
export function CareDialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="cr-dialog"
      aria-labelledby={id}
      onCancel={e => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="cr-dialog-heading">
        <h2 id={id}>{title}</h2>
        <button type="button" className="cr-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>
          &times;
        </button>
      </div>
      {children}
    </dialog>
  );
}
