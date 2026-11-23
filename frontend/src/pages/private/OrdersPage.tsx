import "./OrdersPageLayout.css";
import SmajVerifiedBadge from "../../components/SmajVerifiedBadge";
import { chatLink } from "../../lib/chatCache";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import PullToRefresh from "../../components/PullToRefresh";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount } from "../../lib/formatters";
import { useAuthContext } from "../../contexts/AuthContext";
import type { Order, OrderStatus } from "../../types/marketplace";

const OrdersPage = () => {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderTab, setOrderTab] = useState<"buyer" | "seller">("buyer");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState((location.state as { message?: string } | null)?.message || "");
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewMessage, setReviewMessage] = useState("");
  const [actionOrder, setActionOrder] = useState<Order | null>(null);
  const [actionKind, setActionKind] = useState<"refund" | "dispute">("refund");
  const [actionReason, setActionReason] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await axiosClient.get<{ orders: Order[] }>("/marketplace/orders");
      setOrders(data.orders);
      setError("");
    } catch {
      setError("Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const buyerOrders = useMemo(
    () => orders.filter((order) => order.buyerId === user?.uid),
    [orders, user?.uid]
  );
  const sellerOrders = useMemo(
    () => orders.filter((order) => order.sellerId === user?.uid),
    [orders, user?.uid]
  );

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await axiosClient.patch(`/marketplace/orders/${orderId}/status`, { status });
      setMessage(`Order marked ${status}.`);
      await loadOrders();
    } catch (err: unknown) {
      setMessage(
        isAxiosError<{ message?: string }>(err)
          ? err.response?.data?.message || "Could not update order."
          : "Could not update order."
      );
    } finally {
      setUpdatingId("");
    }
  };

  const messageSeller = async (productId: string) => {
    const order = orders.find(item => item.productId === productId);
    if (order) navigate(chatLink({ uid: order.sellerId, displayName: order.sellerName }));
  };

  const submitReview = async () => {
    if (!reviewOrder) return;
    try {
      await axiosClient.post(`/marketplace/orders/${reviewOrder._id}/review`, { rating: reviewRating, message: reviewMessage });
      setMessage("Thanks. Your seller review was saved.");
      setReviewOrder(null);
      setReviewMessage("");
    } catch (err: unknown) {
      setMessage(
        isAxiosError<{ message?: string }>(err)
          ? err.response?.data?.message || "Could not save your review."
          : "Could not save your review."
      );
    }
  };

  const submitOrderAction = async () => {
    if (!actionOrder) return;
    try {
      const path = actionKind === "refund"
        ? `/marketplace/orders/${actionOrder._id}/refund-request`
        : `/marketplace/orders/${actionOrder._id}/disputes`;
      await axiosClient.post(path, { reason: actionReason });
      setMessage(actionKind === "refund" ? "Refund request submitted." : "Order dispute opened.");
      setActionOrder(null);
      setActionReason("");
      await loadOrders();
    } catch (err: unknown) {
      setMessage(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Could not submit request." : "Could not submit request.");
    }
  };

  const openOrderAction = (order: Order, kind: "refund" | "dispute") => {
    setActionOrder(order);
    setActionKind(kind);
    setActionReason("");
  };

  const openReview = (order: Order) => {
    setReviewOrder(order);
    setReviewRating(5);
    setReviewMessage("");
  };

  const renderOrder = (order: Order, mode: "buyer" | "seller") => {
    return (
      <article className="order-card" key={order._id}>
        <div className="order-image">
          {order.productImage ? <img src={order.productImage} alt={order.productTitle} /> : <span>PI</span>}
        </div>
        <div className="order-main">
          <small>{mode === "buyer" ? "Purchase" : "Sale"}</small>
          <h2>{order.productTitle}</h2>
          <p>Order ID: {order._id}</p>
          <p>
            {mode === "buyer"
              ? `Seller: ${order.sellerName || order.sellerId}`
              : `Buyer: ${order.buyerName || order.buyerId}`}
            <SmajVerifiedBadge userId={mode === "buyer" ? order.sellerId : order.buyerId} />
          </p>
          <p>{new Date(order.createdAt).toLocaleString()}</p>
          {order.paidAt ? <p>Paid: {new Date(order.paidAt).toLocaleString()}</p> : null}
          {order.quantity && order.quantity > 1 ? <p>Quantity: {order.quantity}</p> : null}
          {order.refundStatus ? <p>Refund: {order.refundStatus.replace("_", " ")}</p> : null}
          {order.disputeStatus ? <p>Dispute: {order.disputeStatus.replace("_", " ")}</p> : null}
        </div>
        <strong className="order-price">{formatPiAmount(order.pricePi)}</strong>
        <span className={`order-status ${order.status}`}>{order.status}</span>
        <div className="order-actions">
          <button className="secondary" onClick={() => navigate(`/orders/${order._id}/track`)}>
            Track Order
          </button>
          {mode === "buyer" ? (
            <button className="secondary" onClick={() => void messageSeller(order.productId)}>
              Message Seller
            </button>
          ) : null}
          {mode === "buyer" && order.status === "pending" ? (
            <button className="secondary" onClick={() => navigate(`/orders/${order._id}/track`)}>Continue Payment</button>
          ) : null}
          {order.status === "pending" ? (
            <button
              disabled={updatingId === order._id}
              className="secondary"
              onClick={() => void updateStatus(order._id, "cancelled")}
            >
              Cancel Order
            </button>
          ) : null}
          {mode === "seller" && order.status === "paid" ? (
            <button disabled={updatingId === order._id} onClick={() => void updateStatus(order._id, "processing")}>
              Mark Processing
            </button>
          ) : null}
          {mode === "seller" && order.status === "processing" ? (
            <button disabled={updatingId === order._id} onClick={() => void updateStatus(order._id, "shipped")}>
              Mark Shipped
            </button>
          ) : null}
          {mode === "seller" && order.status === "shipped" ? (
            <span className="order-note">Waiting for buyer confirmation.</span>
          ) : null}
          {mode === "buyer" && order.status === "shipped" ? (
            <button disabled={updatingId === order._id} onClick={() => void updateStatus(order._id, "completed")}>
              Confirm Received
            </button>
          ) : null}
          {mode === "buyer" && order.paymentStatus === "paid" && !order.refundStatus ? (
            <button className="secondary" onClick={() => openOrderAction(order, "refund")}>Request Refund</button>
          ) : null}
          {!["pending", "cancelled"].includes(order.status) && !["open", "under_review"].includes(order.disputeStatus || "") ? (
            <button className="secondary" onClick={() => openOrderAction(order, "dispute")}>Open Dispute</button>
          ) : null}
          {mode === "buyer" && ["delivered", "completed"].includes(order.status) ? (
            <button onClick={() => openReview(order)}>Rate Seller</button>
          ) : null}
        </div>
        {order.paymentStatus ? (
          <small className={`payment-state ${order.paymentStatus}`}>
            Payment: {order.paymentStatus}
            {order.paymentId ? ` · ID ${order.paymentId}` : ""}
            {order.paymentTxid ? ` · Tx ${order.paymentTxid}` : ""}
          </small>
        ) : null}
      </article>
    );
  };

  const activeOrders = orderTab === "buyer" ? buyerOrders : sellerOrders;
  const filteredOrders = activeOrders.filter(order => {
    const searchText = [order._id, order.productTitle, order.sellerName, order.buyerName].join(" ").toLowerCase();
    return (statusFilter === "all" || order.status === statusFilter)
      && searchText.includes(orderSearch.trim().toLowerCase());
  }).sort((a, b) => {
    if (sortOrder === "highest") return b.pricePi - a.pricePi;
    const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortOrder === "oldest" ? -delta : delta;
  });
  const changeTab = (tab: "buyer" | "seller") => {
    setOrderTab(tab);
    setStatusFilter("all");
    setOrderSearch("");
    setVisibleCount(20);
  };

  return (
    <main className="private-page orders-page">
      <PullToRefresh onRefresh={loadOrders} />
      <header className="orders-compact-header">
        <h1>My Orders</h1>
        <p>Track purchases and manage sales</p>
      </header>
      {!window.Pi ? <div className="private-alert">Please open SMAJ PI HUB inside Pi Browser to use Pi payment.</div> : null}
      {message ? <div className="private-alert success">{message}</div> : null}
      {error ? <div className="private-alert error" role="alert">{error} <button type="button" onClick={() => void loadOrders()}>Retry</button></div> : null}
      <div className="orders-compact-tabs" role="tablist" aria-label="Order type">
        <button type="button" role="tab" aria-selected={orderTab === "buyer"} className={orderTab === "buyer" ? "active" : ""} onClick={() => changeTab("buyer")}><span className="orders-tab-title">Purchases</span><strong>{buyerOrders.length}</strong></button>
        <button type="button" role="tab" aria-selected={orderTab === "seller"} className={orderTab === "seller" ? "active" : ""} onClick={() => changeTab("seller")}><span className="orders-tab-title">Sales</span><strong>{sellerOrders.length}</strong></button>
      </div>
      <div className="orders-compact-search">
        <label className="orders-control-label" htmlFor="orders-search">Search orders</label>
        <input id="orders-search" type="search" value={orderSearch} onChange={event => {setOrderSearch(event.target.value);setVisibleCount(20);}} placeholder="Search by order ID or product" />
      </div>
      <div className="orders-compact-filters">
        <div className="orders-status-field"><label className="orders-control-label" htmlFor="orders-status">Order status</label>
        <select id="orders-status" value={statusFilter} onChange={event => {setStatusFilter(event.target.value);setVisibleCount(20);}}>
          <option value="all">All orders</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select></div>
        <div className="orders-filter-field"><span className="orders-control-label">More filters</span><button type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(!showAdvanced)}>☷ Filters {showAdvanced ? "⌃" : "⌄"}</button></div>
      </div>
      {showAdvanced ? <div className="orders-compact-advanced">
        <label htmlFor="orders-sort">Sort by</label>
        <select id="orders-sort" value={sortOrder} onChange={event => setSortOrder(event.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest amount</option>
        </select>
        <button type="button" onClick={() => {setStatusFilter("all");setSortOrder("newest");setOrderSearch("");setVisibleCount(20);setShowAdvanced(false);}}>Clear filters</button>
      </div> : null}
      {loading ? <PrivateSkeleton variant="orders" count={4} /> : (
        <section className="orders-compact-results">
          <div className="orders-compact-results-head"><h2>{orderTab === "buyer" ? "Purchase history" : "Sales history"}</h2><span>{filteredOrders.length} orders</span></div>
          {filteredOrders.length ? <div className="orders-list">{filteredOrders.slice(0,visibleCount).map(order => renderOrder(order,orderTab))}</div> : <div className="orders-compact-empty">
            <span aria-hidden="true">{orderTab === "buyer" ? "▢" : "▣"}</span>
            <h3>{activeOrders.length ? "No matching orders" : orderTab === "buyer" ? "No purchases yet" : "No sales yet"}</h3>
            <p>{activeOrders.length ? "Try a different search or filter." : orderTab === "buyer" ? "Your purchases will appear here." : "Customer orders will appear here."}</p>
            {activeOrders.length ? <button type="button" onClick={() => {setStatusFilter("all");setOrderSearch("");}}>Clear filters</button> : orderTab === "buyer" ? <button type="button" onClick={() => navigate("/store")}>Explore Store</button> : <button type="button" onClick={() => navigate("/seller")}>Manage Products</button>}
          </div>}
          {filteredOrders.length > visibleCount ? <button className="orders-load-more" type="button" onClick={() => setVisibleCount(n => n+20)}>Load more ({filteredOrders.length-visibleCount} remaining)</button> : null}
        </section>
      )}
      {actionOrder ? (
        <div className="service-modal-backdrop" onMouseDown={() => setActionOrder(null)}>
          <form className="service-modal marketplace-action-modal" onSubmit={(event) => { event.preventDefault(); void submitOrderAction(); }} onMouseDown={(event) => event.stopPropagation()}>
            <h2>{actionKind === "refund" ? "Request Refund" : "Open Order Dispute"}</h2>
            <p>{actionKind === "refund" ? "Explain why you are requesting a refund. Pi returns are reviewed and recorded as a separate transaction." : "Explain the problem clearly so an administrator can review the order."}</p>
            <label>
              Details
              <textarea rows={5} minLength={10} maxLength={actionKind === "refund" ? 500 : 1000} required value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Provide at least 10 characters..." />
            </label>
            <div className="confirm-modal-actions">
              <button type="button" className="modal-cancel-button" onClick={() => setActionOrder(null)}>Cancel</button>
              <button type="submit" className="private-primary-button">Submit</button>
            </div>
          </form>
        </div>
      ) : null}
      {reviewOrder ? (
        <div className="service-modal-backdrop" onMouseDown={() => setReviewOrder(null)}>
          <form className="service-modal marketplace-action-modal" onSubmit={(event) => { event.preventDefault(); void submitReview(); }} onMouseDown={(event) => event.stopPropagation()}>
            <h2>Rate Seller</h2>
            <p>Share a short review for {reviewOrder.sellerName} after completing your order.</p>
            <label>
              Rating
              <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
              </select>
            </label>
            <label>
              Review
              <textarea rows={4} maxLength={300} value={reviewMessage} onChange={(event) => setReviewMessage(event.target.value)} placeholder="Describe your experience..." />
            </label>
            <div className="confirm-modal-actions">
              <button type="button" className="modal-cancel-button" onClick={() => setReviewOrder(null)}>Cancel</button>
              <button type="submit" className="private-primary-button">Submit Review</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
};

export default OrdersPage;
