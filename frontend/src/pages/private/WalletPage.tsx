import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import HighlightOffRoundedIcon from "@mui/icons-material/HighlightOffRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import PrivateSkeleton from "../../components/PrivateSkeleton";
import ServiceArt from "../../components/ServiceArt";
import { serviceCatalog } from "../../content/serviceCatalog";
import { useAuthContext } from "../../contexts/AuthContext";
import { axiosClient } from "../../lib/axiosClient";
import {
  walletAmount,
  walletNetworkLabel,
  walletStatusLabel,
  type WalletNetwork,
  type WalletFilter,
  type WalletActivityResponse,
  type WalletActivityItem,
} from "../../lib/walletActivity";
import "./WalletPage.css";
const labels: Record<WalletFilter, string> = {
  all: "All",
  payments: "Payments",
  orders: "Orders",
  earnings: "Earnings",
  refunds: "Refunds",
};
const dateLabel = (value: string | null) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Date unavailable";
};
function Activity({ item, service, visible }: { item: WalletActivityItem; service: string; visible: boolean }) {
  const definition = serviceCatalog.find(entry => entry.slug === item.service);
  return (
    <details className="pi-wallet-activity-item">
      <summary>
        <span className="pi-wallet-service-icon">
          {definition ? <ServiceArt index={definition.atlasIndex} /> : <ReceiptLongOutlinedIcon />}
        </span>
        <span className="pi-wallet-activity-copy">
          <strong>{item.title}</strong>
          <span>{service}</span>
          <small>{dateLabel(item.date)}</small>
        </span>
        <span className="pi-wallet-activity-value">
          <strong>
            {item.direction === "incoming" && item.verified ? "+" : item.direction === "outgoing" ? "-" : ""}
            {item.amountPi === null ? (
              walletAmount(null, visible)
            ) : (
              <>
                {"\u03c0"} {walletAmount(item.amountPi, visible)}
              </>
            )}
          </strong>
          <span className={"pi-wallet-status " + item.status}>{walletStatusLabel(item.status)}</span>
          <small>Details</small>
        </span>
      </summary>
      <div className="pi-wallet-activity-details">
        <dl>
          <div>
            <dt>Network</dt>
            <dd>{walletNetworkLabel(item.network)}</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>{item.verified ? "Verified payment receipt" : "Not verified in the shared receipt ledger"}</dd>
          </div>
          <div>
            <dt>Service status</dt>
            <dd>{item.recordedStatus.replaceAll("_", " ")}</dd>
          </div>
          {item.orderStatus ? (
            <div>
              <dt>Order / record status</dt>
              <dd>{item.orderStatus.replaceAll("_", " ")}</dd>
            </div>
          ) : null}
          <div>
            <dt>Reference</dt>
            <dd>{item.reference}</dd>
          </div>
          {item.paymentId ? (
            <div>
              <dt>Payment ID</dt>
              <dd>{item.paymentId}</dd>
            </div>
          ) : null}
          {item.txid ? (
            <div>
              <dt>Transaction ID</dt>
              <dd>{item.txid}</dd>
            </div>
          ) : null}
        </dl>
        {item.note ? <p>{item.note}</p> : null}
        <Link to={item.href}>
          Open service details <OpenInNewRoundedIcon />
        </Link>
      </div>
    </details>
  );
}
export default function WalletPage() {
  const { user } = useAuthContext();
  const [storedSnapshot, setStoredSnapshot] = useState<{ owner: string; data: WalletActivityResponse } | null>(null),
    [network, setNetwork] = useState<WalletNetwork | "">(""),
    [filter, setFilter] = useState<WalletFilter>("all"),
    [service, setService] = useState(""),
    [page, setPage] = useState(0),
    [visible, setVisible] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const snapshot = storedSnapshot && storedSnapshot.owner === user?.uid ? storedSnapshot.data : null;
  const controller = useRef<AbortController | null>(null),
    flight = useRef(false),
    sequence = useRef(0);
  const load = useCallback(
    async (silent = false) => {
      if (silent && flight.current) return;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const run = ++sequence.current;
      flight.current = true;
      setLoading(true);
      setError("");
      try {
        const { data } = await axiosClient.get<WalletActivityResponse>("/payments/activity", {
          params: { ...(network ? { network } : {}), filter, service, offset: page * 25, limit: 25 },
          signal: abort.signal,
          timeout: 20000,
          headers: { "X-SMAJ-Silent": "true" },
        });
        if (!abort.signal.aborted && run === sequence.current) setStoredSnapshot({ owner: user?.uid || "", data });
      } catch {
        if (!abort.signal.aborted && run === sequence.current)
          setError("Activity could not refresh. Previous records keep their original sync time. Please retry.");
      } finally {
        if (run === sequence.current) {
          flight.current = false;
          setLoading(false);
        }
      }
    },
    [network, filter, service, page, user?.uid]
  );
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden && navigator.onLine) void load(true);
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const current =
    snapshot &&
    (!network || snapshot.network === network) &&
    snapshot.filter === filter &&
    snapshot.service === service &&
    snapshot.offset === page * 25
      ? snapshot
      : null;
  const selectedNetwork = network || snapshot?.network;
  const summary = current?.summary;
  const stats = [
    { key: "paid" as const, label: "Paid", Icon: CheckCircleOutlineRoundedIcon },
    { key: "pending" as const, label: "Pending", Icon: AccessTimeRoundedIcon },
    { key: "completed" as const, label: "Completed", Icon: CheckCircleOutlineRoundedIcon },
    { key: "cancelled" as const, label: "Cancelled", Icon: HighlightOffRoundedIcon },
  ];
  return (
    <main className="pi-wallet-dashboard">
      <header className="pi-wallet-heading">
        <span className="pi-wallet-heading-icon">
          <AccountBalanceWalletOutlinedIcon />
        </span>
        <div>
          <h1>My Wallet</h1>
          <p>SMAJ PI HUB{user?.piUsername ? " @" + user.piUsername : ""}</p>
        </div>
        <button
          type="button"
          className={loading ? "pi-wallet-refresh is-loading" : "pi-wallet-refresh"}
          aria-label="Refresh wallet activity"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshOutlinedIcon />
        </button>
      </header>
      <section className="pi-wallet-balance-card" aria-label="Pi wallet balance">
        <div className="pi-wallet-balance-top">
          <span>Pi Wallet Balance</span>
          <button
            type="button"
            aria-pressed={!visible}
            aria-label={visible ? "Hide wallet amounts" : "Show wallet amounts"}
            onClick={() => setVisible(value => !value)}
          >
            {visible ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        <strong className="pi-wallet-balance-value">{visible ? "0.000 \u03c0" : "****"}</strong>
        <div className="pi-wallet-balance-note">
          <p>Not synced. Zero is a placeholder. Open Pi Wallet to view your actual balance.</p>
          {selectedNetwork ? <span>{walletNetworkLabel(selectedNetwork)}</span> : null}
        </div>
        <nav className="pi-wallet-quick-actions" aria-label="Wallet actions">
          <button
            type="button"
            onClick={() => {
              window.location.href = "pi://wallet";
            }}
          >
            <OpenInNewRoundedIcon />
            <span>Open Pi Wallet</span>
          </button>
          <a
            href="#pi-wallet-activity"
            onClick={() => {
              setFilter("payments");
              setPage(0);
            }}
          >
            <HistoryRoundedIcon />
            <span>Payment History</span>
          </a>
          <Link to="/orders">
            <LocalMallOutlinedIcon />
            <span>My Orders</span>
          </Link>
        </nav>
      </section>
      <div className="pi-wallet-network-switch" aria-label="Activity network">
        {(["mainnet", "testnet", "unknown"] as const).map(value => (
          <button
            type="button"
            key={value}
            aria-pressed={selectedNetwork === value}
            onClick={() => {
              setNetwork(value);
              setPage(0);
            }}
          >
            {value === "unknown" ? "Unconfirmed" : walletNetworkLabel(value)}
          </button>
        ))}
      </div>
      {selectedNetwork === "testnet" ? (
        <p className="pi-wallet-network-notice">
          Testnet activity only. These amounts are not real funds or spendable Pi.
        </p>
      ) : selectedNetwork === "unknown" ? (
        <p className="pi-wallet-network-notice">
          The network is not confirmed for these records. They are excluded from Mainnet and Testnet totals.
        </p>
      ) : (
        <p className="pi-wallet-network-notice">Recorded activity is not your Pi Wallet balance.</p>
      )}
      {error ? (
        <div className="pi-wallet-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()} disabled={loading}>
            Retry
          </button>
        </div>
      ) : null}
      {!current && loading ? (
        <PrivateSkeleton variant="wallet" count={4} />
      ) : (
        <section className="pi-wallet-stat-grid" aria-label="Payment statistics">
          {stats.map(({ key, label, Icon }) => (
            <article key={key} className={"pi-wallet-stat " + key}>
              <span>
                <Icon />
                {label}
              </span>
              <strong>{summary ? summary[key].count : "Unavailable"}</strong>
              <small>
                {summary ? (
                  <>
                    {"\u03c0"} {walletAmount(summary[key].amountPi, visible)}
                  </>
                ) : (
                  "No confirmed snapshot"
                )}
              </small>
            </article>
          ))}
        </section>
      )}
      {current && (current.partial || current.truncated) ? (
        <p className="pi-wallet-network-notice" role="status">
          {current.truncated
            ? "This history exceeds the reporting limit. Totals are withheld rather than shown incomplete."
            : "Some service activity is unavailable. Totals are withheld until all records can refresh."}
        </p>
      ) : null}
      <section className="pi-wallet-recent" id="pi-wallet-activity">
        <div className="pi-wallet-recent-heading">
          <h2>Recent Activity</h2>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setService("");
              setPage(0);
            }}
          >
            View all <span aria-hidden="true">{"\u2192"}</span>
          </button>
        </div>
        <div className="pi-wallet-filter-tabs" role="group" aria-label="Activity type">
          {(snapshot?.supportedFilters || ["all", "payments", "orders"]).map(value => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
            >
              {labels[value as WalletFilter]}
            </button>
          ))}
        </div>
        <label className="pi-wallet-service-filter">
          <span>Service</span>
          <select
            value={service}
            onChange={event => {
              setService(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All services</option>
            {snapshot?.services.map(entry => (
              <option value={entry.id} key={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        {!current && loading ? (
          <PrivateSkeleton variant="list" count={3} />
        ) : current?.items.length ? (
          <div className="pi-wallet-activity-list">
            {current.items.map(item => (
              <Activity
                key={item.id}
                item={item}
                service={current.services.find(s => s.id === item.service)?.name || "SMAJ PI HUB"}
                visible={visible}
              />
            ))}
          </div>
        ) : (
          <div className="pi-wallet-empty">
            <ReceiptLongOutlinedIcon />
            <h3>{error ? "Activity unavailable" : "No activity to show"}</h3>
            <p>
              {error
                ? "Retry to load your financial records."
                : "Your recorded transactions and orders will appear here for this network and filter."}
            </p>
          </div>
        )}
        {current && current.total > 25 ? (
          <nav className="pi-wallet-pagination" aria-label="Activity pages">
            <button type="button" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>
              Previous
            </button>
            <span>
              {current.offset + 1}-{Math.min(current.offset + 25, current.total)} of {current.total}
            </span>
            <button
              type="button"
              disabled={current.offset + 25 >= current.total || loading}
              onClick={() => setPage(value => value + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
      <footer className="pi-wallet-footer">
        <p>
          SMAJ PI HUB tracks your activity without holding your Pi. No wallet passphrase or private key is required.
        </p>
        {current ? <small>Last synced {dateLabel(current.serverTime)}</small> : null}
        <small>
          Paid and completed totals use verified payment receipts. Sales, held payouts and unverified records are not
          spendable balances.
        </small>
      </footer>
    </main>
  );
}
