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
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
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
        setLastUpdated(new Date().toISOString());
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
        <span className="live-transactions-badge">TESTNET</span>
      </div>
      <p className="live-transactions-description">
        Completed app payments verified through Pi Platform. This feed does not include every direct transfer to the app
        wallet.
      </p>
      <p className="live-transactions-update" role="status">
        {loading
          ? "Loading verified Testnet transactions..."
          : unavailable
            ? "Live verification is temporarily unavailable. Previously verified records may be shown."
            : `Refreshes every 10 seconds${lastUpdated ? ` · Updated ${new Date(lastUpdated).toLocaleTimeString()}` : ""}.`}
      </p>
      {!loading && transactions.length === 0 && <p>No verified Testnet transactions yet.</p>}
      {transactions.length > 0 && (
        <div className="live-transactions-table-wrap">
          <table>
            <caption className="live-transactions-caption">
              Up to 10 latest verified Test-Pi app payments. Time is recorded completion time, or payment creation time
              when completion time is unavailable.
            </caption>
            <thead>
              <tr>
                <th scope="col">Transaction ID</th>
                <th scope="col">Amount (Test-Pi)</th>
                <th scope="col">Time</th>
                <th scope="col">Status</th>
                <th scope="col">Blockchain</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(transaction => {
                const explorer = safeExplorerUrl(transaction.explorerUrl, transaction.transactionId);
                return (
                  <tr key={transaction.transactionId}>
                    <td data-label="Transaction ID">
                      <code>{transaction.transactionId}</code>
                    </td>
                    <td data-label="Amount (Test-Pi)">
                      {transaction.amount.toLocaleString(undefined, { maximumFractionDigits: 7 })}
                    </td>
                    <td data-label="Time">
                      <time
                        dateTime={transaction.time}
                        title={
                          transaction.timeKind === "completion" ? "Recorded completion time" : "Payment creation time"
                        }
                      >
                        {new Date(transaction.time).toLocaleString()}
                      </time>
                    </td>
                    <td data-label="Status">
                      <span className="live-transactions-verified">Verified</span>
                    </td>
                    <td data-label="Blockchain">
                      {explorer ? (
                        <a href={explorer} target="_blank" rel="noopener noreferrer">
                          View on Blockchain
                          <span className="live-transactions-sr-only"> for {transaction.transactionId}</span>
                        </a>
                      ) : (
                        <span>Link unavailable</span>
                      )}
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
