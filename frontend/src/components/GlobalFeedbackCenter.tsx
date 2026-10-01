import { useEffect, useRef, useState } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { GLOBAL_FEEDBACK_EVENT, type FeedbackEventDetail, type FeedbackType } from "../lib/feedback";

type Feedback = { id: number; message: string; type: FeedbackType };

const feedbackSelector = [
  ".private-alert.success",
  ".private-alert.error",
  ".floating-alert.success",
  ".floating-alert.error",
  ".smaj-toast.success",
  ".smaj-toast.error",
  ".sw-profile-message",

  ".stream-download-error",
].join(",");

const typeForNode = (node: Element): FeedbackType => {
  const text = (node.textContent || "").toLowerCase();
  if (["could not", "failed", "unable", "unavailable", "cannot", "expired", "not found", "try again"].some(term => text.includes(term))) return "error";
  if (node.classList.contains("error") || node.classList.contains("stream-download-error")) return "error";
  if (node.classList.contains("success")) return "success";
  if (node.classList.contains("warning")) return "warning";
  return "info";
};

const iconForType = {
  success: <CheckCircleRoundedIcon />,
  error: <ErrorOutlineRoundedIcon />,
  warning: <WarningAmberRoundedIcon />,
  info: <InfoOutlinedIcon />,
};

const GlobalFeedbackCenter = () => {
  const [items, setItems] = useState<Feedback[]>([]);
  const sequence = useRef(0);
  const recent = useRef(new Map<string, number>());

  useEffect(() => {
    const push = (message: string, type: FeedbackType) => {
      const normalized = message.replace(/\s+/g, " ").trim();
      if (!normalized) return;
      const key = `${type}:${normalized}`;
      const now = Date.now();
      if (now - (recent.current.get(key) || 0) < 1200) return;
      recent.current.set(key, now);
      const id = ++sequence.current;
      setItems(current => [...current.slice(-2), { id, message: normalized, type }]);
      const duration = type === "error" ? 9000 : type === "warning" ? 7000 : type === "info" ? 5000 : 4000;
      window.setTimeout(() => setItems(current => current.filter(item => item.id !== id)), duration);
    };
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<FeedbackEventDetail>).detail;
      if (detail?.message) push(detail.message, detail.type || "info");
    };
    const mirror = (root: ParentNode) => {
      const matches = [
        ...(root instanceof Element && root.matches(feedbackSelector) ? [root] : []),
        ...Array.from(root.querySelectorAll?.(feedbackSelector) || []),
      ];
      matches.forEach(node => {
        const message = node.textContent?.trim() || "";
        const previous = node.getAttribute("data-feedback-message");
        if (!message || previous === message) return;
        node.setAttribute("data-feedback-message", message);
        node.setAttribute("data-feedback-source", "true");
        push(message, typeForNode(node));
      });
    };
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === "characterData" && record.target.parentElement) mirror(record.target.parentElement);
        record.addedNodes.forEach(node => {
          if (node instanceof Element) mirror(node);
        });
      });
    });
    window.addEventListener(GLOBAL_FEEDBACK_EVENT, onFeedback);
    mirror(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.removeEventListener(GLOBAL_FEEDBACK_EVENT, onFeedback);
    };
  }, []);

  return (
    <aside className="global-feedback-center" aria-label="Application messages" aria-live="polite">
      {items.map(item => (
        <section className={`global-feedback-toast ${item.type}`} role={item.type === "error" ? "alert" : "status"} key={item.id}>
          <span>{iconForType[item.type]}</span>
          <p>{item.message}</p>
          <button type="button" onClick={() => setItems(current => current.filter(entry => entry.id !== item.id))} aria-label="Dismiss message"><CloseRoundedIcon /></button>
        </section>
      ))}
    </aside>
  );
};

export default GlobalFeedbackCenter;
