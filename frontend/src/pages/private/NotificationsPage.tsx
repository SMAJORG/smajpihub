import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { axiosClient } from "../../lib/axiosClient";
import type { AppNotification } from "../../types/marketplace";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import { showFeedback } from "../../lib/feedback";

const tabs = ["All", "Community", "Jobs", "Orders", "Messages", "Payments", "Security", "Updates"];

const category = (type: string) =>
  type.startsWith("community_")
    ? "Community"
    : type.startsWith("jobs_")
      ? "Jobs"
      : type.includes("message")
    ? "Messages"
    : type.includes("paid") || type.includes("payment")
      ? "Payments"
      : type.includes("security")
        ? "Security"
        : type.includes("announcement") || type.includes("update")
          ? "Updates"
          : "Orders";

const NotificationsPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const initialTab = tabs.includes(params.get("tab") || "") ? params.get("tab") || "All" : "All";
  const [tab, setTabState] = useState(initialTab);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const refreshNotificationBadge = () => window.dispatchEvent(new Event("smaj:notifications-refresh"));
  const loadNotifications = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const { data } = await axiosClient.get<{ notifications: AppNotification[] }>("/notifications");
      setItems(data.notifications || []);
    } catch {
      if (showSkeleton) showFeedback("Notifications could not be loaded. Pull down to retry.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications(true);
    const refresh = () => { if (!document.hidden) void loadNotifications(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("smaj:notifications-refresh", refresh);
    window.addEventListener("smaj:native-push", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("smaj:notifications-refresh", refresh);
      window.removeEventListener("smaj:native-push", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const next = tabs.includes(params.get("tab") || "") ? params.get("tab") || "All" : "All";
    setTabState(next);
  }, [params]);

  const setTab = (value: string) => {
    setTabState(value);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "All") next.delete("tab");
      else next.set("tab", value);
      return next;
    }, { replace: true });
  };

  const visible = useMemo(
    () => (tab === "All" ? items : items.filter((item) => category(item.type) === tab)),
    [items, tab],
  );

  const open = async (item: AppNotification) => {
    if (!item.read) {
      try { await axiosClient.patch(`/notifications/${item._id}/read`); }
      catch { showFeedback("Could not mark this notification as read. Try again.", "error"); return; }
    }
    setItems((all) => all.map((entry) => (entry._id === item._id ? { ...entry, read: true } : entry)));
    refreshNotificationBadge();
    const fallbackTarget =
      item.relatedId === "messages" || item.type.includes("message")
        ? "/messages"
        : item.relatedId && (item.type.includes("order") || item.type.includes("payment"))
          ? `/orders/${item.relatedId}/track`
        : item.type.includes("product") && item.relatedId
          ? `/product/${item.relatedId}`
        : item.relatedId === "settings" || item.type.includes("security")
          ? "/settings"
          : item.relatedId === "dashboard"
            ? "/dashboard"
            : "/orders";
    let target = fallbackTarget;
    if (item.actionUrl && item.actionUrl.startsWith("/") && !item.actionUrl.startsWith("//")) {
      try {
        const parsed = new URL(item.actionUrl, window.location.origin);
        if (parsed.origin === window.location.origin) target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        // Ignore invalid persisted action URLs and use the existing fallback.
      }
    }
    navigate(target);
  };

  const remove = async () => {
    if (!deleteId) return;
    try { await axiosClient.delete(`/notifications/${deleteId}`); }
    catch { showFeedback("Could not delete this notification. Try again.", "error"); return; }
    setItems((all) => all.filter((item) => item._id !== deleteId));
    setDeleteId(null);
    refreshNotificationBadge();
  };

  const markAll = async () => {
    try { await axiosClient.patch("/notifications/read-all"); }
    catch { showFeedback("Could not mark notifications as read. Try again.", "error"); return; }
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    refreshNotificationBadge();
  };

  return (
    <main className="private-page notifications-page">
      <PullToRefresh onRefresh={() => loadNotifications(false)} />
      <section className="private-page-head">
        <div>
          <p className="private-kicker">ACTIVITY CENTER</p>
          <h1>Notifications</h1>
        </div>
        <button className="private-secondary-button" onClick={() => void markAll()}>
          Mark all as read
        </button>
      </section>

      <nav className="notification-tabs" aria-label="Notification categories">
        {tabs.map((item) => {
          const unread = items.filter(entry => !entry.read && (item === "All" || category(entry.type) === item)).length;
          return <button className={tab === item ? "active" : ""} aria-pressed={tab === item} onClick={() => setTab(item)} key={item}>
            <span>{item}</span>
            {unread > 0 ? <span className="notification-tab-count" aria-label={`${unread} unread`}>{unread}</span> : null}
          </button>;
        })}
      </nav>

      <section className="notification-list rich">
        {loading ? <PrivateSkeleton variant="notifications" count={5} /> : visible.length ? (
          visible.map((item) => (
            <article key={item._id} className={item.read ? "" : "unread"}>
              <button className="notification-open" onClick={() => void open(item)}>
                {item.actor?.avatar || item.image ? (
                  <img src={item.actor?.avatar || item.image} alt="" />
                ) : (
                  <span className={`notification-type ${category(item.type).toLowerCase()}`}>
                    {category(item.type).slice(0, 1)}
                  </span>
                )}
                <div>
                  <strong>{item.actor?.displayName && item.action ? `${item.actor.displayName} ${item.action}` : item.actor?.displayName ? `${item.actor.displayName} ${item.title}` : item.title}</strong>
                  <p>{item.actor?.displayName && item.action ? item.title : item.message}</p>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                {!item.read ? <i className="notification-unread-dot" /> : null}
              </button>
              <button className="notification-delete" aria-label="Delete notification" onClick={() => setDeleteId(item._id)}>
                <DeleteOutlineIcon />
              </button>
            </article>
          ))
        ) : (
          <div className="private-state compact">
            <h3>No notifications yet</h3>
            <p>Order updates, seller messages, payment status, and security alerts will appear here.</p>
          </div>
        )}
      </section>

      {deleteId ? (
        <div className="confirm-modal-backdrop" onMouseDown={() => setDeleteId(null)}>
          <section className="confirm-modal" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Delete notification?</h2>
            <p>Are you sure you want to remove this notification?</p>
            <div className="confirm-modal-actions">
              <button className="modal-cancel-button" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
              <button className="modal-signout-button" onClick={() => void remove()}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default NotificationsPage;
