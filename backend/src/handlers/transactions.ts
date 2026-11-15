import { Router } from "express";
import { commerceMode } from "../services/commerceEnvironment";
import env from "../environments";
import { platformAPIKeyClient } from "../services/platformAPIClient";
import { LiveTransactionFeed } from "../services/liveTransactions";

export default function mountLiveTransactions(router: Router) {
  let feed: LiveTransactionFeed | undefined;
  router.get("/live", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (commerceMode() !== "legacy") {
      try {
        const transactions = await req.app.locals.testnetHistoryDb.collection("pi_live_testnet_transactions")
          .find({ network: "Pi Testnet", verified: true }, { projection: { _id: 0, transactionId: 1, amount: 1, time: 1, timeKind: 1, verified: 1, network: 1, explorerUrl: 1 } })
          .sort({ time: -1 }).limit(20).maxTimeMS(8000).toArray();
        return res.json({ network: "Pi Testnet", transactions, availability: "archived", readOnly: true });
      } catch { return res.status(503).json({ error: "transactions_unavailable" }); }
    }
    if (env.use_memory_db || !req.app.locals.liveTransactionCollection) {
      return res.status(503).json({
        error: "transactions_unavailable",
        message: "Verified Testnet transaction data is unavailable.",
      });
    }
    if (!feed)
      feed = new LiveTransactionFeed(req.app.locals, platformAPIKeyClient);
    try {
      const enabled =
        env.pi_payments_enabled &&
        Boolean(env.pi_api_key) &&
        env.platform_api_url.replace(/\/$/, "") === "https://api.minepi.com";
      // Serve the persisted verified snapshot immediately; sync cannot block public
      // requests or amplify Pi API calls with homepage traffic.
      if (enabled)
        void feed.refresh().catch(() => {
          feed!.unavailable = true;
        });
      const transactions = await feed.latest();
      return res.json({
        network: "Pi Testnet",
        transactions,
        availability: enabled && !feed.unavailable ? "ready" : "unavailable",
        refreshIntervalSeconds: 10,
      });
    } catch {
      return res.status(503).json({
        error: "transactions_unavailable",
        message: "Verified Testnet transaction data is unavailable.",
      });
    }
  });
}
