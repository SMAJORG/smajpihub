import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import { usePiPayment } from "../../hooks/usePiPayment";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { isAxiosError } from "axios";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import { formatPiAmount, formatUsdAmount } from "../../lib/formatters";
import { formatPiRate, usdtFromPi } from "../../lib/piPricing";
import {
  clearBuyNowItem,
  getBuyNowItem,
  getCartItems,
  removeFromCart,
  updateCartQuantity,
} from "../../lib/storeCart";
import type { Order } from "../../types/marketplace";

const CommerceFlowPage = ({ mode }: { mode: "cart" | "checkout" | "payment-method" }) => {
  const { isAuthenticated, requireAuth } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState(() => getCartItems());
  const [buyNowItem, setBuyNowItemState] = useState(() => getBuyNowItem());
  const [order, setOrder] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState((location.state as { message?: string } | null)?.message || "");
  const [error, setError] = useState("");
  const { isPaying, payOrder } = usePiPayment();

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const loadOrder = useCallback(async (orderId: string) => {
    try {
      const { data } = await axiosClient.get<{ order: Order }>(`/marketplace/orders/${orderId}`);
      setOrder(data.order);
    } catch {
      // ignore refresh failure
    }
  }, []);

  useEffect(() => {
    setCartItems(getCartItems());
    setBuyNowItemState(getBuyNowItem());
  }, [mode]);

  const checkoutItem = useMemo(() => buyNowItem || cartItems[0] || null, [buyNowItem, cartItems]);
  const cartTotalPi = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.pricePi * item.quantity, 0),
    [cartItems]
  );
  const checkoutTotalPi = checkoutItem ? checkoutItem.pricePi * checkoutItem.quantity : 0;
  const hasPi = typeof window !== "undefined" && Boolean(window.Pi);


  const handleCreateOrder = async () => {
    if (!checkoutItem) {
      setError("Add a product first before checking out.");
      return;
    }

    if (!isAuthenticated) {
      setError("Please sign in with Pi before creating an order.");
      requireAuth();
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const { data } = await axiosClient.post<{ order: Order }>("/marketplace/orders", {
        productId: checkoutItem.productId,
        quantity: checkoutItem.quantity,
      });

      setOrder(data.order);

      if (cartItems.some((item) => item.productId === checkoutItem.productId)) {
        setCartItems(removeFromCart(checkoutItem.productId));
      }

      clearBuyNowItem();
      setBuyNowItemState(null);
      setMessage("Order created successfully");
    } catch (err: unknown) {
      if (isAxiosError<{ message?: string }>(err)) {
        const responseMessage = err.response?.data?.message;
        setError(responseMessage || `Unable to create order: ${err.message || "Please try again."}`);
      } else if (err instanceof Error) {
        setError(`Unable to create order: ${err.message}`);
      } else {
        setError("Could not create the order.");
      }
    } finally {
      setCreating(false);
    }
  };

  if (mode === "payment-method") {
    return (
      <main className="private-page commerce-page">
        <section className="private-page-head">
          <div>
            <p className="private-kicker">SMAJ STORE</p>
            <h1>Payment Method</h1>
            <p>Pi Wallet is the live payment option for SMAJ Store orders.</p>
          </div>
        </section>
        <section className="commerce-panel">
          <div className="commerce-method-card active">
            <AccountBalanceWalletOutlinedIcon />
            <div>
              <strong>Pi Wallet</strong>
              <p>Secure Pi Browser payment for SMAJ Store orders. {formatPiRate()}.</p>
            </div>
          </div>
          <div className="commerce-method-card">
            <ReceiptLongOutlinedIcon />
            <div>
              <strong>Payment safety</strong>
              <p>Orders stay payment pending until Pi payment is confirmed successfully.</p>
            </div>
          </div>
          {!hasPi ? <div className="private-alert">Open SMAJ PI HUB in Pi Browser to pay with Pi</div> : null}
        </section>
      </main>
    );
  }

  if (mode === "cart") {
    return (
      <main className="private-page commerce-page">
        <section className="private-page-head">
          <div>
            <p className="private-kicker">SMAJ STORE</p>
            <h1>Cart</h1>
            <p>Review saved products and continue to checkout.</p>
          </div>
        </section>
        {message ? <div className="smaj-toast success" role="status">{message}</div> : null}
        {error ? <div className="smaj-toast error" role="alert">{error}</div> : null}
        {!cartItems.length ? (
          <section className="private-state commerce-flow">
            <ShoppingCartOutlinedIcon />
            <h2>Your cart is empty</h2>
            <p>Add products from SMAJ Store to continue.</p>
            <div className="form-actions">
              <Link className="private-primary-button" to="/store">
                Continue Shopping
              </Link>
            </div>
          </section>
        ) : (
          <section className="commerce-grid">
            <div className="commerce-panel">
              {cartItems.map((item) => (
                <article className="commerce-line-item" key={item.productId}>
                  <img src={item.image} alt={item.title} />
                  <div>
                    <strong>{item.title}</strong>
                    <p>
                      {item.sellerName} · {item.location}
                    </p>
                    <small>{formatPiAmount(item.pricePi)} each</small>
                  </div>
                  <label className="commerce-qty">
                    <span>Qty</span>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => {
                        const next = Math.max(1, Number(event.target.value) || 1);
                        setCartItems(updateCartQuantity(item.productId, next));
                      }}
                    />
                  </label>
                  <strong>{formatPiAmount(item.pricePi * item.quantity)}</strong>
                  <div className="commerce-line-actions">
                    <button
                      type="button"
                      className="private-secondary-button"
                      onClick={() => {
                        window.localStorage.setItem("smaj_store_buy_now", JSON.stringify({ ...item }));
                        navigate("/checkout");
                      }}
                    >
                      Checkout
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove item"
                      onClick={() => setCartItems(removeFromCart(item.productId))}
                    >
                      <DeleteOutlineOutlinedIcon />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <aside className="commerce-summary">
              <h2>Order summary</h2>
              <div>
                <span>Items</span>
                <strong>{cartItems.length}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatPiAmount(cartTotalPi)}</strong>
              </div>
              <small>approx {formatUsdAmount(usdtFromPi(cartTotalPi))}</small>
              <button
                type="button"
                className="private-primary-button"
                onClick={() => {
                  window.localStorage.setItem("smaj_store_buy_now", JSON.stringify({ ...cartItems[0] }));
                  navigate("/checkout");
                }}
              >
                Checkout first item
              </button>
            </aside>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="private-page commerce-page">
      <section className="private-page-head">
        <div>
          <p className="private-kicker">SMAJ STORE</p>
          <h1>Checkout</h1>
          <p>Review product details, create the order, and pay with Pi.</p>
        </div>
      </section>
      {message ? <div className="smaj-toast success" role="status">{message}</div> : null}
      {error ? <div className="smaj-toast error" role="alert">{error}</div> : null}

      {!checkoutItem && !order ? (
        <section className="private-state commerce-flow">
          <ReceiptLongOutlinedIcon />
          <h2>No product ready for checkout</h2>
          <p>Choose Buy on a product card or open Cart to continue.</p>
          <div className="form-actions">
            <Link className="private-primary-button" to="/store">
              Go to SMAJ Store
            </Link>
            <Link className="private-secondary-button" to="/cart">
              Open Cart
            </Link>
          </div>
        </section>
      ) : (
        <section className="commerce-grid">
          <div className="commerce-panel">
            {!order && checkoutItem ? (
              <>
                <div className="commerce-section-head">
                  <div>
                    <p className="private-kicker">ORDER REVIEW</p>
                    <h2>Confirm order</h2>
                  </div>
                </div>
                <article className="commerce-checkout-card">
                  <img src={checkoutItem.image} alt={checkoutItem.title} />
                  <div>
                    <strong>{checkoutItem.title}</strong>
                    <p>
                      {checkoutItem.sellerName} · {checkoutItem.location}
                    </p>
                    <small>{checkoutItem.category}</small>
                  </div>
                  <strong>{formatPiAmount(checkoutTotalPi)}</strong>
                </article>
                <div className="commerce-total-box">
                  <div className="commerce-total-row">
                    <span>Total</span>
                    <strong>{formatPiAmount(checkoutTotalPi)}</strong>
                  </div>
                  <small className="commerce-usd">approx {formatUsdAmount(usdtFromPi(checkoutTotalPi))}</small>
                </div>
                <div className="form-actions commerce-checkout-actions">
                  <button
                    type="button"
                    className="private-primary-button"
                    disabled={creating}
                    onClick={() => void handleCreateOrder()}
                  >
                    {creating ? "Creating order..." : "Confirm order"}
                  </button>
                  <Link className="private-secondary-button" to="/store">
                    Back to Store
                  </Link>
                </div>
              </>
            ) : null}

            {order ? (
              <>
                <section className="commerce-success">
                  <p className="private-kicker">ORDER READY</p>
                  <h2>Order created successfully</h2>
                  <p>Your order is waiting for Pi payment confirmation.</p>
                  <div className="commerce-order-meta">
                    <span>Order ID</span>
                    <strong>{order._id}</strong>
                  </div>
                  <div className="commerce-order-meta">
                    <span>Status</span>
                    <strong>{order.status}</strong>
                  </div>
                </section>

                <section className="commerce-panel nested">
                  <div className="commerce-section-head">
                    <div>
                      <p className="private-kicker">PAY WITH PI</p>
                      <h2>Payment</h2>
                    </div>
                  </div>
                  {!hasPi ? <div className="private-alert">Open SMAJ PI HUB in Pi Browser to pay with Pi.</div> : null}
                  <div className="commerce-payment-card">
                    <div className="commerce-payment-copy">
                      <strong>{order.productTitle}</strong>
                      <span>{formatPiAmount(order.pricePi)}</span>
                      <small>approx {formatUsdAmount(usdtFromPi(order.pricePi))}</small>
                    </div>
                    <div className="commerce-payment-actions">
                      <button
                        type="button"
                        className="private-primary-button"
                        disabled={isPaying}
                        onClick={() => void payOrder(order._id, order.pricePi, {
                          onReady: () => setMessage("Pi payment approved. Waiting confirmation..."),
                          onComplete: () => {
                            setMessage("Payment confirmed. Order is paid.");
                            void loadOrder(order._id);
                            navigate(`/orders/${order._id}/track`);
                          },
                          onCancel: () => setError("Payment was cancelled."),
                          onError: (message) => setError(message),
                        }).catch((err) => {
                          if (err instanceof Error) setError(err.message);
                        })}
                      >
                        {isPaying ? "Processing payment..." : "Pay with Pi"}
                      </button>
                      <Link className="private-secondary-button" to={`/orders/${order._id}/track`}>
                        Track Order
                      </Link>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </div>

          <aside className="commerce-summary">
            <h2>Why this is safe</h2>
            <div>
              <span>Payment state</span>
              <strong>{order?.paymentStatus || "pending"}</strong>
            </div>
            <div>
              <span>Order state</span>
              <strong>{order?.status || "pending"}</strong>
            </div>
            <p>SMAJ Store only marks an order paid after Pi payment success is confirmed.</p>
            <Link className="private-secondary-button" to="/payment-method">
              View payment method
            </Link>
          </aside>
        </section>
      )}
    </main>
  );
};

export default CommerceFlowPage;
