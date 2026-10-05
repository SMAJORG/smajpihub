import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { isAxiosError } from "axios";
import { usePiPayment } from "../../hooks/usePiPayment";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount } from "../../lib/formatters";
import type { Order, OrderStatus } from "../../types/marketplace";

const timelineOrder = ["pending", "payment_pending", "paid", "processing", "shipped", "delivered", "completed"] as const;

const OrderTrackingPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const { isPaying, payOrder } = usePiPayment();
  const continuePayment = async () => {
    if (!order || order.buyerId !== user?.uid || order.status !== "pending") return;
    setError("");
    setMessage("");
    await payOrder(order._id, order.pricePi, {
      onReady: () => { setMessage("Payment approved. Complete payment in Pi Wallet."); void loadOrder(); },
      onComplete: () => { setMessage("Payment completed successfully."); void loadOrder(); },
      onCancel: () => setMessage("Payment cancelled. You can continue payment when ready."),
      onError: setError,
    });
  };

  const loadOrder = useCallback(async () => {
    try {
      const { data } = await axiosClient.get<{ order: Order }>(`/marketplace/orders/${id}`);
      setOrder(data.order);
      setError("");
    } catch (err: unknown) {
      setError(
        isAxiosError<{ message?: string }>(err)
          ? err.response?.data?.message || "Could not load this order."
          : "Could not load this order."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const activeIndex = useMemo(() => {
    if (!order) return 0;
    const currentStep =
      order.status === "pending" && order.paymentStatus !== "paid"
        ? "payment_pending"
        : order.status;
    return Math.max(0, timelineOrder.indexOf(currentStep as (typeof timelineOrder)[number]));
  }, [order]);

  const updateStatus = async (status: OrderStatus) => {
    if (!order) return;
    setUpdating(true);
    try {
      await axiosClient.patch(`/marketplace/orders/${order._id}/status`, { status });
      setMessage(`Order marked ${status}.`);
      await loadOrder();
    } catch (err: unknown) {
      setError(
        isAxiosError<{ message?: string }>(err)
          ? err.response?.data?.message || "Could not update the order."
          : "Could not update the order."
      );
    } finally {
      setUpdating(false);
    }
  };

  const statusSteps = [
    { key: "pending", label: "Order Created", note: "Your order has been created." },
    { key: "payment_pending", label: "Payment Pending", note: "Open Pi Browser to complete payment." },
    { key: "paid", label: "Paid", note: "Pi payment confirmed." },
    { key: "processing", label: "Processing", note: "Seller is preparing the order." },
    { key: "shipped", label: "Shipped", note: "Order is on the way." },
    { key: "delivered", label: "Delivered", note: "Order was marked delivered." },
    { key: "completed", label: "Completed", note: "Order journey finished successfully." },
  ] as const;

  if (loading) {
    return <main className="private-page"><PrivateSkeleton variant="list" count={3} /></main>;
  }

  if (!order) {
    return <main className="private-page"><div className="private-state">{error || "Order not found."}</div></main>;
  }

  const isBuyer = order.buyerId === user?.uid;
  const isSeller = order.sellerId === user?.uid;

  return (
    <main className="private-page tracking-page">
      <section className="private-page-head">
        <div>
          <p className="private-kicker">SMAJ STORE TRACKING</p>
          <h1>Track Order</h1>
          <p>Follow payment and delivery progress for this order.</p>
        </div>
      </section>
      {message ? <div className="private-alert success">{message}</div> : null}
      {error ? <div className="private-alert error">{error}</div> : null}
      {!window.Pi && order.status === "pending" ? <div className="private-alert">Open SMAJ PI HUB in Pi Browser to pay with Pi</div> : null}

      <section className="tracking-grid">
        <article className="tracking-card">
          <div className="tracking-product">
            <img src={order.productImage} alt={order.productTitle} />
            <div>
              <strong>{order.productTitle}</strong>
              <p>Order ID: {order._id}</p>
              <small>{formatPiAmount(order.pricePi)}</small>
            </div>
          </div>
          <div className="tracking-chips">
            <span className={`order-status ${order.status}`}>{order.status}</span>
            <span className={`payment-state ${order.paymentStatus || "pending"}`}>Payment: {order.paymentStatus || "pending"}</span>
          </div>
          <div className="tracking-actions">
            {isBuyer && order.status === "pending" ? (
              <button type="button" className="private-primary-button" disabled={isPaying} onClick={() => void continuePayment()}>{isPaying ? "Completing Payment..." : "Continue Payment"}</button>
            ) : null}
            {isSeller && order.status === "paid" ? (
              <button type="button" className="private-primary-button" disabled={updating} onClick={() => void updateStatus("processing")}>
                Mark Processing
              </button>
            ) : null}
            {isSeller && order.status === "processing" ? (
              <button type="button" className="private-primary-button" disabled={updating} onClick={() => void updateStatus("shipped")}>
                Mark Shipped
              </button>
            ) : null}
            {isSeller && order.status === "shipped" ? (
              <div className="private-alert">Shipped. Waiting for the buyer to confirm receipt.</div>
            ) : null}
            {isBuyer && order.status === "shipped" ? (
              <button type="button" className="private-primary-button" disabled={updating} onClick={() => void updateStatus("completed")}>
                Confirm Received
              </button>
            ) : null}
            <button type="button" className="private-secondary-button" onClick={() => navigate("/orders")}>
              Back to Orders
            </button>
          </div>
        </article>

        <article className="tracking-card">
          <div className="commerce-section-head">
            <div>
              <p className="private-kicker">PROGRESS</p>
              <h2>Order timeline</h2>
            </div>
          </div>
          <div className="tracking-timeline">
            {statusSteps.map((step, index) => {
              const complete = index < activeIndex;
              const current = index === activeIndex;
              return (
                <div className={`tracking-step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""}`} key={step.key}>
                  <div className="tracking-step-icon">
                    {step.key === "completed" ? <TaskAltOutlinedIcon /> : step.key === "shipped" ? <LocalShippingOutlinedIcon /> : <ReceiptLongOutlinedIcon />}
                  </div>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.note}</p>
                    {step.key === "payment_pending" && isBuyer && order.status === "pending" ? <button type="button" className="private-primary-button" disabled={isPaying} onClick={() => void continuePayment()}>{isPaying ? "Completing Payment..." : "Continue Payment"}</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {order.timeline?.length ? (
            <div className="tracking-history">
              <h3>History</h3>
              {order.timeline.map((item, index) => (
                <article key={`${item.status}-${index}`}>
                  <strong>{item.label}</strong>
                  <p>{item.note || item.status}</p>
                  <small>{new Date(item.at).toLocaleString()}</small>
                </article>
              ))}
            </div>
          ) : null}
          <div className="form-actions">
            <Link className="private-secondary-button" to="/store">
              Continue Shopping
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
};

export default OrderTrackingPage;
