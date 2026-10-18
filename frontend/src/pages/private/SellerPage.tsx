import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount } from "../../lib/formatters";
import { useAuthContext } from "../../contexts/AuthContext";
import TrustBadge from "../../components/TrustBadge";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import ActionDialog from "../../components/ActionDialog";
import type { Product } from "../../types/marketplace";
import {
  sellerSnapshots,
  type SellerDashboard,
  type SellerFinance,
} from "../../lib/sellerDashboard";
import "./SellerPage.css";

const money = (value: number | null | undefined) =>
  value == null ? "Unavailable" : formatPiAmount(value);
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(+date)
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "Date unavailable";
};
const reviewLabel = (product: Product) =>
  product.hidden
    ? "Hidden"
    : product.reviewStatus === "rejected"
      ? "Rejected"
      : product.approved !== true || product.reviewStatus !== "approved"
        ? "Pending review"
        : !product.active || product.quantity === 0
          ? "Sold out"
          : product.quantity == null
            ? "In stock"
            : product.quantity + " in stock";
function QuickIcon({kind}:{kind:string}) {
 const path=kind==="add" ? "M12 5v14M5 12h14" : kind==="products" ? "M4 7l8-4 8 4v10l-8 4-8-4V7zm0 0 8 4 8-4M12 11v10" : kind==="orders" ? "M5 7h14v14H5zM9 7V4h6v3" : "M5 20V11h3v9m3 0V5h3v15m3 0V9h3v11";
 return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={path}/></svg>;
}
function SalesChart({ finance }: { finance: SellerFinance }) {
  const [range, setRange] = useState(7),
    [point, setPoint] = useState<number | null>(null);
  const values = range === 1 ? finance.hours : finance.series.slice(-range);
  const selected =
    values[Math.min(point ?? values.length - 1, values.length - 1)];
  const max = Math.max(...values.map((item) => item.sales), 0.0000001);
  const path = values
    .map(
      (item, index) =>
        (index ? "L" : "M") +
        (20 + (index / Math.max(1, values.length - 1)) * 600) +
        "," +
        (150 - (item.sales / max) * 130),
    )
    .join(" ");
  if (finance.grossSales === null) return <section className="sw-card" id="seller-insights"><h2>Sales analytics</h2><p className="sw-empty">Verified sales records are unavailable. Refresh to try again.</p></section>;
  return (
    <section
      className="sw-card sw-chart"
      id="seller-insights"
      aria-label="Sales analytics"
    >
      <div className="sw-card-heading">
        <h2>Sales analytics</h2>
        <span>{finance.network}</span>
      </div>
      <div className="sw-filters" aria-label="Analytics period">
        {[
          [1, "Today"],
          [7, "7 Days"],
          [30, "30 Days"],
          [90, "90 Days"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={range === value}
            onClick={() => {
              setRange(Number(value));
              setPoint(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="sw-chart-readout" aria-live="polite">
        <strong>{money(selected?.sales)}</strong>
        <span>
          {selected?.date} &middot; {selected?.payments ?? 0} verified payments
        </span>
      </div>
      <svg
        viewBox="0 0 640 170"
        role="img"
        aria-label={
          "Verified gross sales over " +
          (range === 1 ? "today" : range + " days")
        }
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPoint(
            Math.max(
              0,
              Math.min(
                values.length - 1,
                Math.round(
                  ((((event.clientX - rect.left) / rect.width) * 640 - 20) /
                    600) *
                    (values.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <path d="M20 20H620M20 85H620M20 150H620" className="sw-chart-grid" />
        <path d={path} className="sw-chart-line" />
        {selected ? (
          <circle
            cx={
              20 +
              (Math.min(point ?? values.length - 1, values.length - 1) /
                Math.max(1, values.length - 1)) *
                600
            }
            cy={150 - (selected.sales / max) * 130}
            r="5"
            className="sw-chart-dot"
          />
        ) : null}
      </svg>
      <input
        aria-label="Explore sales dates"
        type="range"
        min={0}
        max={Math.max(0, values.length - 1)}
        value={Math.min(point ?? values.length - 1, values.length - 1)}
        onChange={(event) => setPoint(Number(event.target.value))}
      />
      <div className="sw-chart-axis">
        <span>{values[0]?.date}</span>
        <span>{values[values.length - 1]?.date}</span>
      </div>
      <p className="sw-caption">
        {values.some((item) => item.payments)
          ? "Verified receipts only. "
          : "No verified sales in this period. "}
        Periods use UTC; week starts Monday.
      </p>
    </section>
  );
}

function SellerWorkspace() {
  const { user, updateProfile } = useAuthContext();
  const owner = user?.uid || "";
  const [data, setData] = useState<SellerDashboard | null>(
    () => sellerSnapshots.get(owner) || null,
  );
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine);
  const [network, setNetwork] = useState(""),
    [productLimit, setProductLimit] = useState(8);
  const [action, setAction] = useState<{
    kind: "delete" | "availability";
    product: Product;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false),
    [activating, setActivating] = useState(false);
  const flight = useRef<Promise<void> | null>(null),
    controller = useRef<AbortController | null>(null),
    alive = useRef(true);
  const load = useCallback((): Promise<void> => {
    if (flight.current) return flight.current;
    if (!owner || !navigator.onLine) {
      setOffline(!navigator.onLine);
      return Promise.resolve();
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    const task = axiosClient
      .get<SellerDashboard>("/marketplace/seller/dashboard", {
        signal: request.signal,
        timeout: 15000,
        smajSkipReadRetry: true,
        headers: { "X-SMAJ-Silent": "true" },
      })
      .then(({ data: snapshot }) => {
        if (!alive.current || request.signal.aborted) return;
        if (sellerSnapshots.size >= 10 && !sellerSnapshots.has(owner))
          sellerSnapshots.delete(sellerSnapshots.keys().next().value!);
        sellerSnapshots.set(owner, snapshot);
        setData(snapshot);
        setError("");
        setOffline(false);
      })
      .catch((err: unknown) => {
        if (!alive.current || request.signal.aborted) return;
        setOffline(!navigator.onLine);
        setError(
          isAxiosError(err) && err.response?.status === 401
            ? "Sign in again to view your seller workspace."
            : "Could not refresh your store. Your last successful snapshot is retained.",
        );
      })
      .finally(() => {
        if (alive.current && controller.current === request) {
          setBusy(false);
          flight.current = null;
        }
      });
    flight.current = task;
    return task;
  }, [owner]);
  useEffect(() => {
    alive.current = true;
    void load();
    const refresh = () => {
      setOffline(!navigator.onLine);
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false;
      controller.current?.abort();
      flight.current = null;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const perform = async () => {
    if (!action || actionBusy) return;
    setActionBusy(true);
    try {
      if (action.kind === "delete")
        await axiosClient.delete(
          "/marketplace/seller/products/" + action.product._id,
        );
      else
        await axiosClient.patch(
          "/marketplace/seller/products/" +
            action.product._id +
            "/availability",
          { active: !action.product.active },
        );
      setMessage(
        action.kind === "delete"
          ? "Product deleted."
          : "Product availability updated.",
      );
      setAction(null);
      await flight.current;
      await load();
    } catch (err) {
      setError(
        isAxiosError(err)
          ? err.response?.data?.message || "Could not update this product."
          : "Could not update this product.",
      );
    } finally {
      setActionBusy(false);
    }
  };
  const activate = async () => {
    if (!user) return;
    setActivating(true);
    try {
      const updated = await updateProfile({
        displayName: user.displayName || user.username || "Pi User",
        country: user.country || "",
        contactPhone: user.contactPhone || "",
        avatar: user.avatar || "",
        coverImage: user.coverImage || "",
        bio: user.bio || "",
        language: user.language || user.settings?.language || "English",
        sellerActive: true,
        role: user.role === "admin" ? "admin" : "seller",
      });
      if (!updated?.sellerActive && updated?.role !== "seller")
        throw Error("Activation failed");
      setMessage("Seller tools activated.");
      await flight.current;
      await load();
    } catch {
      setError("Seller tools could not be activated. Please retry.");
    } finally {
      setActivating(false);
    }
  };
  const selectedNetwork = network || data?.defaultNetwork || "Pi Testnet";
  const finance = data?.finance.find(
    (item) => item.network === selectedNetwork,
  );
  const verified =
    data?.seller.verificationStatus === "approved" &&
    data.seller.verificationLevel !== "basic";
  return (
    <main className="private-page seller-workspace">
      <PullToRefresh onRefresh={load} />
      <header className="sw-header">
        <div>
          <h1>Seller Dashboard</h1>
          <p>{data?.seller.storeName || user?.displayName || "Your store"}</p>
        </div>
        {data ? (
          <span className={"sw-verification " + (verified ? "verified" : "")}>
            <TrustBadge
              level={data.seller.verificationLevel}
              status={data.seller.verificationStatus}
            />
            {verified
              ? data.seller.verificationLevel === "trusted_seller"
                ? "Trusted Seller"
                : data.seller.verificationLevel === "seller_verified"
                  ? "Seller Verified"
                  : "Pi Verified"
              : data.seller.verificationStatus === "pending"
                ? "Under review"
                : "Not verified"}
          </span>
        ) : null}
      </header>
      <div className="sw-sync">
        <span role="status">
          {offline
            ? "Offline - showing saved data"
            : busy
              ? "Updating store..."
              : data
                ? "Live - refreshes every 20 seconds"
                : "Loading store..."}
          {data
            ? " - Last updated " + new Date(data.updatedAt).toLocaleTimeString()
            : ""}
        </span>
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div className="sw-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy || offline}
          >
            Retry
          </button>
          <button
            type="button"
            aria-label="Dismiss seller error"
            onClick={() => setError("")}
          >
            &times;
          </button>
        </div>
      ) : null}
      {message ? (
        <div className="sw-notice" role="status">
          {message}
          <button
            type="button"
            aria-label="Dismiss seller message"
            onClick={() => setMessage("")}
          >
            &times;
          </button>
        </div>
      ) : null}
      {!data ? (
        error || offline ? (
          <section className="sw-card">
            <h2>{offline ? "You are offline" : "Store unavailable"}</h2>
            <p>
              {offline
                ? "Reconnect to load your seller dashboard."
                : "Refresh to try loading your store again."}
            </p>
          </section>
        ) : (
          <PrivateSkeleton variant="sellerDashboard" count={4} />
        )
      ) : (
        <>
          <section className="sw-sales" aria-label="Sales summary">
            <div className="sw-card-heading">
              <span>Total recorded sales</span>
              <label>
                <span className="sw-sr-only">Sales network</span>
                <select
                  aria-label="Sales network"
                  value={selectedNetwork}
                  onChange={(event) => setNetwork(event.target.value)}
                >
                  {data.finance.map((item) => (
                    <option key={item.network}>{item.network}</option>
                  ))}
                </select>
              </label>
            </div>
            <strong className="sw-sales-total">
              {money(finance?.grossSales)}
            </strong>
            <p>Verified gross receipts &middot; {selectedNetwork}</p>
            <div className="sw-periods">
              {[
                ["Today", finance?.today],
                ["This week", finance?.week],
                ["This month", finance?.month],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{money(value as number | undefined)}</strong>
                </div>
              ))}
            </div>
            <div className="sw-funds">
              <div>
                <span>Lifetime seller earnings</span>
                <strong>{money(finance?.lifetimeEarnings)}</strong>
                <small>Verified payouts to you</small>
              </div>
              <div>
                <span>Pending funds</span>
                <strong>{money(finance?.pendingFunds)}</strong>
                <small>Held for settlement</small>
              </div>
              <div>
                <span>Completed payments</span>
                <strong>{finance?.completedPayments ?? "Unavailable"}</strong>
                <small>Settled seller payouts</small>
              </div>
            </div>
            <p className="sw-sales-note">
              Gross sales are app receipts, not your wallet balance. Refunds
              recorded: {money(finance?.refundedSales)}. Networks are never
              combined.
            </p>
          </section>
          <section className="sw-stats" aria-label="Store statistics">
            {[
              ["Total Products", data.stats.totalProducts],
              ["Total Orders", data.stats.totalOrders],
              ["Pending Orders", data.stats.pendingOrders],
              ["Paid Orders", data.stats.paidOrders],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value ?? "Unavailable"}</strong>
              </article>
            ))}
          </section>
          {data.unverifiedOrders > 0 ? (
            <p className="sw-caption">
              {data.unverifiedOrders} older order(s) have no linked verified
              receipt and are excluded from sales. Order counts cover all
              networks.
            </p>
          ) : (
            <p className="sw-caption">
              Order counts cover all networks. Paid orders require a verified
              receipt.
            </p>
          )}
          {data.warnings.length > 0 ? (
            <p className="sw-error" role="status">
              Some records are temporarily unavailable; affected metrics are
              marked unavailable.
            </p>
          ) : null}
          <div className="sw-columns">
            {finance ? (
              <SalesChart key={selectedNetwork} finance={finance} />
            ) : null}
            <div className="sw-side">
              <section className="sw-card">
                <h2>Quick actions</h2>
                <nav className="sw-quick" aria-label="Seller actions">
                  <Link to="/add-product"><QuickIcon kind="add" /> Add Product</Link>
                  <a href="#seller-products"><QuickIcon kind="products" /> Manage Products</a>
                  <Link to="/orders"><QuickIcon kind="orders" /> View Orders</Link>
                  <a href="#seller-insights"><QuickIcon kind="analytics" /> Seller Analytics</a>
                </nav>
              </section>
              <section className="sw-card">
                <div className="sw-card-heading">
                  <h2>Order management</h2>
                  <Link to="/orders">View all</Link>
                </div>
                <div className="sw-pipeline">
                  {[
                    [
                      "New",
                      (data.orderStatus.pending || 0) +
                        (data.orderStatus.paid || 0),
                    ],
                    ["Processing", data.orderStatus.processing],
                    ["Shipped", data.orderStatus.shipped],
                    [
                      "Delivered",
                      (data.orderStatus.delivered || 0) +
                        (data.orderStatus.completed || 0),
                    ],
                    ["Cancelled", data.orderStatus.cancelled],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <p className="sw-caption">
                  New includes unpaid and paid orders awaiting processing;
                  delivered includes completed.
                </p>
              </section>
            </div>
          </div>
          <div className="sw-columns">
            <section className="sw-card">
              <h2>Seller performance</h2>
              <div className="sw-performance">
                <div>
                  <span>Average rating</span>
                  <strong>
                    {data.performance.averageRating == null
                      ? "Unavailable"
                      : data.performance.averageRating.toFixed(1) + " / 5"}
                  </strong>
                </div>
                <div>
                  <span>Total reviews</span>
                  <strong>{data.performance.totalReviews}</strong>
                </div>
                <div>
                  <span>Response rate</span>
                  <strong>
                    {data.performance.responseRate == null
                      ? "Unavailable"
                      : data.performance.responseRate + "%"}
                  </strong>
                </div>
                <div>
                  <span>Avg. first response</span>
                  <strong>
                    {data.performance.responseMinutes == null
                      ? "Unavailable"
                      : data.performance.responseMinutes < 1
                        ? "Under 1 min"
                        : Math.round(data.performance.responseMinutes) + " min"}
                  </strong>
                </div>
              </div>
              <p className="sw-caption">
                {data.performance.conversations} buyer-initiated conversations
                in the last 90 days. Response rate counts conversations with a
                seller reply.
              </p>
            </section>
            <section className="sw-card">
              <div className="sw-card-heading">
                <h2>Notifications</h2>
                <Link to="/notifications">View all</Link>
              </div>
              {data.notifications === null ? (
                <p className="sw-empty">Notifications unavailable.</p>
              ) : !data.notifications.length ? (
                <p className="sw-empty">No seller notifications yet.</p>
              ) : (
                <ul className="sw-notifications">
                  {data.notifications.map((item) => (
                    <li key={item._id}>
                      <strong>{item.title}</strong>
                      <span>{item.message}</span>
                      <time dateTime={item.createdAt}>
                        {dateLabel(item.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <details className="sw-card sw-trust">
            <summary>
              <span>Seller verification</span>
              <span>
                {data.seller.active ? "Tools active" : "Tools not activated"} &middot;{" "}
                {verified ? "Verified" : "Review details"}
              </span>
            </summary>
            <div>
              <p>
                {data.seller.active
                  ? "Your seller tools are active."
                  : "Seller tools must be activated before listing products. Identity verification and selling access are separate."}
              </p>
              <p>
                Verification: {data.seller.verificationStatus}.{" "}
                {verified
                  ? "Your approved verification level is shown beside your store name."
                  : "Manage your verification request in Settings."}
              </p>
              <p>
                Seller agreement:{" "}
                {data.products.some((item) => item.sellerAgreementAccepted)
                  ? "Accepted on a listing"
                  : "Not yet recorded on a listing"}
              </p>
              {!data.seller.active ? (
                <button
                  type="button"
                  className="private-primary-button"
                  disabled={activating}
                  onClick={() => void activate()}
                >
                  {activating ? "Activating..." : "Activate Seller Tools"}
                </button>
              ) : null}
              <Link to="/settings">Verification settings &rarr;</Link>
            </div>
          </details>
          {Object.values(data.inventory).some((value) => value > 0) ? (
            <section className="sw-card sw-inventory">
              <h2>Inventory alerts</h2>
              <div>
                {[
                  ["Low stock", data.inventory.lowStock],
                  ["Out of stock", data.inventory.outOfStock],
                  ["Pending product review", data.inventory.pendingReview],
                ]
                  .filter(([, value]) => Number(value) > 0)
                  .map(([label, value]) => (
                    <a key={label} href="#seller-products">
                      <strong>{value}</strong> {label}
                    </a>
                  ))}
              </div>
            </section>
          ) : null}
          <section className="sw-card" id="seller-products">
            <div className="sw-card-heading">
              <h2>Your products</h2>
              <Link to="/add-product">Add Product</Link>
            </div>
            {!data.products.length ? (
              <div className="sw-empty">
                No products yet.{" "}
                <Link to="/add-product">Add your first product</Link>
              </div>
            ) : (
              <ul className="sw-products">
                {data.products.slice(0, productLimit).map((product) => (
                  <li key={product._id}>
                    <img src={product.image} alt="" loading="lazy" />
                    <div>
                      <Link
                        to={"/edit-product/" + product._id}
                        title={product.title}
                      >
                        {product.title}
                      </Link>
                      <span>
                        {money(product.pricePi)} &middot; {reviewLabel(product)}
                      </span>
                      {product.reviewStatus === "rejected" ? (
                        <small>
                          {product.rejectionReason ||
                            "Edit and resubmit for review."}
                        </small>
                      ) : null}
                    </div>
                    <details className="sw-product-menu">
                      <summary aria-label={"Actions for " + product.title}>
                        &#8942;
                      </summary>
                      <div>
                        <Link to={"/edit-product/" + product._id}>Edit</Link>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            setAction({ kind: "availability", product });
                          }}
                        >
                          {product.active ? "Mark Sold Out" : "Mark Available"}
                        </button>
                        <button
                          type="button"
                          className="sw-danger"
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            setAction({ kind: "delete", product });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {data.products.length > productLimit ? (
              <button
                type="button"
                className="sw-load-more"
                onClick={() => setProductLimit((value) => value + 12)}
              >
                Show more products ({data.products.length - productLimit})
              </button>
            ) : null}
          </section>
          <section className="sw-card">
            <div className="sw-card-heading">
              <h2>Recent orders</h2>
              <Link to="/orders">View all</Link>
            </div>
            {!data.orders.length ? (
              <p className="sw-empty">
                No orders yet. New orders will appear here.
              </p>
            ) : (
              <ul className="sw-orders">
                {data.orders.map((order) => (
                  <li key={order._id}>
                    <div>
                      <Link to="/orders" title={order.productTitle}>
                        {order.productTitle}
                      </Link>
                      <span>
                        {money(order.pricePi)} &middot; {dateLabel(order.createdAt)} &middot;{" "}
                        {order.buyerName || "Customer"}
                      </span>
                    </div>
                    <div className="sw-order-badges">
                      <span
                        className={
                          "sw-badge " +
                          (order.paymentStatus === "paid" ? "positive" : "")
                        }
                      >
                        {order.paymentStatus === "paid"
                          ? "Payment verified"
                          : order.paymentStatus === "unverified"
                            ? "Payment unverified"
                            : "Payment " + order.paymentStatus}
                      </span>
                      <span
                        className={
                          "sw-badge " +
                          (order.status === "cancelled" ? "negative" : "")
                        }
                      >
                        {order.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <ActionDialog
        open={Boolean(action)}
        title={
          action?.kind === "delete"
            ? 'Delete "' + action.product.title + '"?'
            : action?.product.active
              ? "Mark product sold out?"
              : "Make product available?"
        }
        description={
          action?.kind === "delete"
            ? "This permanently removes the listing and cannot be undone."
            : "This changes whether buyers can purchase this listing."
        }
        confirmLabel={
          action?.kind === "delete" ? "Delete product" : "Confirm change"
        }
        danger={action?.kind === "delete"}
        busy={actionBusy}
        onCancel={() => setAction(null)}
        onConfirm={() => void perform()}
      />
    </main>
  );
}
export default function SellerPage() {
  const { user } = useAuthContext();
  return <SellerWorkspace key={user?.uid || "signed-out"} />;
}
