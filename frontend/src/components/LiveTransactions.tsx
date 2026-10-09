import { useEffect, useState } from "react";
import { axiosClient } from "../lib/axiosClient";
import "./LiveTransactions.css";

type Transaction = {
  transactionId: string;
  amount: number;
  time: string;
  timeKind: "completion" | "payment-created";
  verified: true;
  network: "Pi Testnet";
  explorerUrl: string | null;
};
const safeExplorerUrl = (value: string | null, hash: string) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.host === "blockexplorer.minepi.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === `/testnet/transactions/${hash}`
      ? url.href
      : null;
  } catch {
    return null;
  }
};

export default function LiveTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const { data } = await axiosClient.get("/transactions/live", { signal: controller.signal, timeout: 8000 });
        if (controller.signal.aborted) return;
        if (data.network !== "Pi Testnet" || !Array.isArray(data.transactions)) throw new Error("Invalid Testnet feed");
        setTransactions(
          data.transactions
            .filter(
              (t: Transaction) =>
                t.network === "Pi Testnet" &&
                t.verified === true &&
                /^[a-f0-9]{64}$/i.test(t.transactionId) &&
                Number.isFinite(t.amount) &&
                t.amount > 0 &&
                Number.isFinite(Date.parse(t.time))
            )
            .slice(0, 10)
        );
        setUnavailable(data.availability === "unavailable");
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  return (
    <section className="home-section public-home-section live-transactions" aria-labelledby="live-transactions-title">
      <div className="live-transactions-heading">
        <h2 id="live-transactions-title">SMAJ PI HUB Live Transactions</h2>
        <span className="live-transactions-badge">Testnet</span>
      </div>
      <p className="live-transactions-summary">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="m5 14 4-4 4 5 6-8" />
        </svg>
        Recent verified Test-Pi payments
      </p>
      {loading && <p role="status">Loading verified Testnet transactions...</p>}
      {unavailable && <p role="status">Live verification is temporarily unavailable.</p>}
      {!loading && transactions.length === 0 && <p>No verified Testnet transactions yet.</p>}
      {transactions.length > 0 && (
        <div className="live-transactions-table-wrap">
          <table aria-label="Verified Testnet app payments">
            <thead>
              <tr>
                <th scope="col">Transaction</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(transaction => {
                const explorer = safeExplorerUrl(transaction.explorerUrl, transaction.transactionId);
                const shortHash =
                  transaction.transactionId.slice(0, 6) + "\u2026" + transaction.transactionId.slice(-4);
                return (
                  <tr key={transaction.transactionId}>
                    <td>
                      {explorer ? (
                        <a
                          href={explorer}
                          title={transaction.transactionId}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={"View on Blockchain: " + transaction.transactionId}
                        >
                          {shortHash}
                        </a>
                      ) : (
                        <span title={transaction.transactionId}>
                          {shortHash}
                          <span className="live-transactions-sr-only"> Link unavailable</span>
                        </span>
                      )}
                      <time
                        dateTime={transaction.time}
                        title={
                          transaction.timeKind === "completion" ? "Recorded completion time" : "Payment creation time"
                        }
                      >
                        {new Date(transaction.time).toLocaleDateString()}
                      </time>
                    </td>
                    <td className="live-transactions-amount">
                      {transaction.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 7,
                      })}
                      {" \u03c0"}
                    </td>
                    <td>
                      <span className="live-transactions-verified">Verified</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
