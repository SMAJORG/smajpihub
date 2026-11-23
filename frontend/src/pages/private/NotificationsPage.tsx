import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import { axiosClient } from "../../lib/axiosClient";
import type { AppNotification } from "../../types/marketplace";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import { showFeedback } from "../../lib/feedback";
import { authenticatePiWithTimeout, ensurePiInitialized } from "../../lib/piSdk";
import "./NotificationsPage.css";

const tabs = ["All", "Unread", "Community", "Jobs", "Orders", "Messages", "Payments", "Security", "Updates", "Account"];

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
          : type.includes("verif") || type.includes("ambassador") || type.includes("login") || type.includes("logout") || type.includes("sign") ? "Account" : "Orders";

const NotificationsPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const initialTab = tabs.includes(params.get("tab") || "") ? params.get("tab") || "All" : "All";
  const [tab, setTabState] = useState(initialTab);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteMode, setDeleteMode] = useState<"single" | "selected" | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [piNotifications, setPiNotifications] = useState<{ configured: boolean; enabled: boolean } | null>(null);
  const [piNotificationsBusy, setPiNotificationsBusy] = useState(false);
  const [piNotificationsStatusError, setPiNotificationsStatusError] = useState(false);
  const refreshNotificationBadge = () => window.dispatchEvent(new Event("smaj:notifications-refresh"));
  const loadNotifications = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const { data } = await axiosClient.get<{ notifications: AppNotification[]; total: number; hasMore: boolean }>("/notifications?limit=30");
      setItems(data.notifications || []);
      setTotal(data.total ?? data.notifications?.length ?? 0);
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (showSkeleton) showFeedback("Notifications could not be loaded. Pull down to retry.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    axiosClient.get<{ configured: boolean; enabled: boolean }>("/notifications/pi/status")
      .then(({ data }) => {
        if (active) setPiNotifications(data);
      })
      .catch(() => {
        if (active) setPiNotificationsStatusError(true);
      });
    return () => { active = false; };
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
    () => (tab === "All" ? items : items.filter((item) => tab === "Unread" ? !item.read : category(item.type) === tab)),
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
    setDeleteMode(null);
    setTotal(n => Math.max(0, n - 1));
    refreshNotificationBadge();
  };

  const markAll = async () => {
    try { await axiosClient.patch("/notifications/read-all"); }
    catch { showFeedback("Could not mark notifications as read. Try again.", "error"); return; }
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    refreshNotificationBadge();
  };

  const loadMore = async () => {
    if (!hasMore || busy) return;
    setBusy(true);
    try {
      const { data } = await axiosClient.get<{ notifications: AppNotification[]; total: number; hasMore: boolean }>(`/notifications?limit=30&skip=${items.length}`);
      setItems(previous => [...previous, ...data.notifications.filter(entry => !previous.some(item => item._id === entry._id))]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch { showFeedback("Could not load more notifications.", "error"); }
    finally { setBusy(false); }
  };
  const bulkRead = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      await axiosClient.patch("/notifications/bulk/read", { ids: selected });
      setItems(previous => previous.map(item => selected.includes(item._id) ? { ...item, read: true } : item));
      setSelected([]); setSelectMode(false); refreshNotificationBadge();
      showFeedback("Selected notifications marked as read.", "success");
    } catch { showFeedback("Could not update selected notifications.", "error"); }
    finally { setBusy(false); }
  };
  const bulkDelete = async () => {
    if (!deleteMode || busy) return;
    setBusy(true);
    try {
      if (deleteMode === "single") { await remove(); }
      else {
        const { data } = await axiosClient.post<{ deletedCount: number }>("/notifications/bulk/delete", deleteMode === "all" ? { all: true } : { ids: selected });
        if (deleteMode === "all") { setItems([]); setTotal(0); setHasMore(false); }
        else { setItems(previous => previous.filter(item => !selected.includes(item._id))); setTotal(n => Math.max(0, n - data.deletedCount)); }
        setSelected([]); setSelectMode(false); refreshNotificationBadge();
        showFeedback(`${data.deletedCount} notification(s) deleted.`, "success");
      }
      setDeleteMode(null); setDeleteId(null);
    } catch { showFeedback("Could not delete notifications. Try again.", "error"); }
    finally { setBusy(false); }
  };
  const toggleRead = async (item: AppNotification) => {
    setMenuId(null);
    try {
      if (item.read) await axiosClient.patch("/notifications/bulk/read", { ids: [item._id] });
      else await axiosClient.patch(`/notifications/${item._id}/read`);
      setItems(previous => previous.map(entry => entry._id === item._id ? { ...entry, read: true } : entry));
      refreshNotificationBadge();
    } catch { showFeedback("Could not update notification.", "error"); }
  };

  const togglePiNotifications = async () => {
    if (!piNotifications || piNotificationsBusy) return;
    setPiNotificationsBusy(true);
    try {
      if (piNotifications.enabled) {
        const { data } = await axiosClient.post<{ configured: boolean; enabled: boolean }>("/notifications/pi/consent", { enabled: false });
        setPiNotifications(data);
        showFeedback("Pi App notifications disabled.", "success");
        return;
      }

      if (!window.Pi) {
        showFeedback("Open SMAJ PI HUB in Pi Browser to enable Pi notifications.", "info");
        return;
      }
      await ensurePiInitialized();
      const auth = await authenticatePiWithTimeout(["in_app_notifications"], 60_000);
      const { data } = await axiosClient.post<{ configured: boolean; enabled: boolean }>("/notifications/pi/consent", {
        enabled: true,
        accessToken: auth.accessToken,
      });
      setPiNotifications(data);
      showFeedback("Pi App notifications enabled.", "success");
    } catch (error) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showFeedback(
        message === "pi_notification_scope_required"
          ? "Grant the in-app notifications permission in Pi Browser and try again."
          : error instanceof Error ? error.message : "Pi App notifications could not be updated.",
        "error",
      );
    } finally {
      setPiNotificationsBusy(false);
    }
  };

  return (
    <main className="private-page notifications-page">
      <PullToRefresh onRefresh={() => loadNotifications(false)} />
      <section className="private-page-head">
        <div><h1>Notifications</h1><p className="private-kicker">{total} notifications</p></div>
        <div className="notification-global-menu">
          <button type="button" className="private-secondary-button notification-read-all" onClick={() => void markAll()}>Read all</button>
          <button type="button" className="notification-more-button" aria-label="Notification actions" aria-expanded={menuId === "global"} onClick={() => setMenuId(menuId === "global" ? null : "global")}><MoreVertIcon /></button>
          {menuId === "global" && <div className="notification-popover" role="menu">
            <button onClick={() => { setSelectMode(true); setMenuId(null); }}>Select notifications</button>
            <button onClick={() => { setMenuId(null); void markAll(); }}>Mark all as read</button>
            <button className="danger" onClick={() => { setDeleteMode("all"); setMenuId(null); }}>Delete all notifications</button>
          </div>}
        </div>
      </section>
      <section className="pi-notification-card" aria-label="Pi App Notification Center">
        <div>
          <strong>Pi App Notification Center</strong>
          <p>
            {piNotificationsStatusError
              ? "Pi App notification status could not be loaded. Refresh to try again."
              : piNotifications?.enabled
              ? "Important SMAJ PI HUB updates can also appear in your Pi App Notification Center."
              : piNotifications?.configured
                ? "Choose whether SMAJ PI HUB may send updates to your Pi App Notification Center."
                : "Pi App notifications are not configured on this server yet."}
          </p>
        </div>
        <button
          type="button"
          className="private-secondary-button"
          disabled={!piNotifications || piNotificationsStatusError || piNotificationsBusy || (!piNotifications.enabled && !piNotifications.configured)}
          onClick={() => void togglePiNotifications()}
        >
          {piNotificationsBusy ? "Saving..." : piNotifications?.enabled ? "Disable Pi notifications" : "Enable Pi notifications"}
        </button>
      </section>
      <div className="notification-toolbar">
        {selectMode ? <label className="notification-select-all"><input type="checkbox" checked={visible.length > 0 && visible.every(item => selected.includes(item._id))} onChange={event => setSelected(event.target.checked ? Array.from(new Set([...selected, ...visible.map(item => item._id)])) : selected.filter(id => !visible.some(item => item._id === id)))} /> Select visible</label> : <span>{items.filter(item => !item.read).length} unread</span>}
        {selectMode ? <button className="notification-text-action" onClick={() => { setSelectMode(false); setSelected([]); }}>Cancel</button> : <select aria-label="Filter notifications" value={tab} onChange={event => setTab(event.target.value)}>{tabs.map(value => <option key={value} value={value}>{value === "All" ? "All notifications" : value}</option>)}</select>}
      </div>
      <section className="notification-list rich notification-list-compact">
        {loading ? <PrivateSkeleton variant="notifications" count={5} /> : visible.length ? visible.map(item => (
          <article key={item._id} className={item.read ? "" : "unread"}>
            {selectMode && <input className="notification-item-checkbox" type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(item._id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item._id] : previous.filter(id => id !== item._id))} />}
            <button className="notification-open" onClick={() => selectMode ? setSelected(previous => previous.includes(item._id) ? previous.filter(id => id !== item._id) : [...previous, item._id]) : void open(item)}>
              {item.actor?.avatar || item.image ? <img src={item.actor?.avatar || item.image} alt="" /> : <span className="notification-type notification-icon-compact">{category(item.type) === "Security" ? <ShieldOutlinedIcon /> : category(item.type) === "Account" ? <VerifiedOutlinedIcon /> : category(item.type) === "Orders" ? <ShoppingBagOutlinedIcon /> : <NotificationsOutlinedIcon />}</span>}
              <div><strong>{item.actor?.displayName && item.action ? `${item.actor.displayName} ${item.action}` : item.actor?.displayName ? `${item.actor.displayName} ${item.title}` : item.title}</strong><p>{item.actor?.displayName && item.action ? item.title : item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>
              {!item.read && <i className="notification-unread-dot" />}
            </button>
            {!selectMode && <div className="notification-item-menu">
              <button className="notification-more-button" aria-label="Notification options" aria-expanded={menuId === item._id} onClick={() => setMenuId(menuId === item._id ? null : item._id)}><MoreVertIcon /></button>
              {menuId === item._id && <div className="notification-popover" role="menu">
                <button onClick={() => void toggleRead(item)}>Mark as read</button>
                <button className="danger" onClick={() => { setDeleteId(item._id); setDeleteMode("single"); setMenuId(null); }}>Delete</button>
              </div>}
            </div>}
          </article>
        )) : <div className="private-state compact"><h3>No notifications</h3><p>You're all caught up in this category.</p></div>}
      </section>
      {hasMore && !loading && <button className="private-secondary-button notification-load-more" disabled={busy} onClick={() => void loadMore()}>{busy ? "Loading..." : "Load more notifications"}</button>}
      {selectMode && <div className="notification-bulk-bar"><strong>{selected.length} selected</strong><button disabled={!selected.length || busy} onClick={() => void bulkRead()}>Mark read</button><button className="danger" disabled={!selected.length || busy} onClick={() => setDeleteMode("selected")}>Delete selected</button></div>}
      {deleteMode && <div className="confirm-modal-backdrop" onMouseDown={() => { setDeleteMode(null); setDeleteId(null); }}><section className="confirm-modal" onMouseDown={event => event.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Confirm deletion"><h2>{deleteMode === "all" ? "Delete all notifications?" : deleteMode === "selected" ? `Delete ${selected.length} notifications?` : "Delete notification?"}</h2><p>This cannot be undone.{deleteMode === "all" ? " This includes notifications not currently loaded." : ""}</p><div className="confirm-modal-actions"><button className="modal-cancel-button" onClick={() => { setDeleteMode(null); setDeleteId(null); }}>Cancel</button><button className="modal-signout-button" disabled={busy} onClick={() => void bulkDelete()}>{busy ? "Deleting..." : "Delete"}</button></div></section></div>}
    </main>
  );
};

export default NotificationsPage;
