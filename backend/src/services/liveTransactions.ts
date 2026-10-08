import type { ObjectId } from "mongodb";

export type LiveTransaction = {
  transactionId: string;
  amount: number;
  time: string;
  timeKind: "completion" | "payment-created";
  verified: true;
  network: "Pi Testnet";
  explorerUrl: string | null;
};
type Candidate = {
  paymentId: string;
  txid: string;
  amount?: number;
  time?: string | Date;
};
type Source = {
  collection: string;
  timeField: string;
  query: Record<string, unknown>;
  read: (record: any) => Candidate;
};
const sources: Source[] = [
  {
    collection: "marketplaceOrderCollection",
    timeField: "paidAt",
    query: { paymentStatus: "paid" },
    read: (r) => ({
      paymentId: r.paymentId,
      txid: r.paymentTxid,
      amount: r.pricePi,
      time: r.paidAt,
    }),
  },
  {
    collection: "jobBillingCollection",
    timeField: "paidAt",
    query: { status: "paid" },
    read: (r) => ({
      paymentId: r.paymentId,
      txid: r.paymentTxid,
      time: r.paidAt,
    }),
  },
  {
    collection: "transportBookingCollection",
    timeField: "updatedAt",
    query: { paymentStatus: "paid" },
    read: (r) => ({
      paymentId: r.paymentId,
      txid: r.paymentTxid,
      time: r.paidAt,
    }),
  },
  {
    collection: "coursePaymentCollection",
    timeField: "completed_at",
    query: { status: "paid" },
    read: (r) => ({
      paymentId: r.pi_payment_identifier,
      txid: r.transaction_identifier,
      amount: r.amount_pi,
      time: r.completed_at,
    }),
  },
  {
    collection: "universityPaymentCollection",
    timeField: "completed_at",
    query: { status: "paid" },
    read: (r) => ({
      paymentId: r.pi_payment_identifier,
      txid: r.transaction_identifier,
      amount: r.amount_pi,
      time: r.completed_at,
    }),
  },
  {
    collection: "userCollection",
    timeField: "streamSubscription.startedAt",
    query: { "streamSubscription.paymentStatus": "paid" },
    read: (r) => ({
      paymentId: r.streamSubscription?.paymentId,
      txid: r.streamSubscription?.paymentTxid,
      amount: r.streamSubscription?.pricePi,
      time: r.streamSubscription?.startedAt,
    }),
  },
];

// Only known official Testnet explorer routes are allowed; API _link is often
// a Horizon operation URL and must not be blindly published as an explorer URL.
export function testnetExplorerUrl(
  value: unknown,
  txid: string,
): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "blockexplorer.minepi.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.pathname === `/testnet/transactions/${txid}` ? url.href : null;
  } catch {
    return null;
  }
}

export function verifiedTestnetPayment(
  remote: any,
  candidate: Candidate,
): LiveTransaction | null {
  const status = remote?.status;
  const tx = remote?.transaction;
  const amount = remote?.amount;
  if (
    remote?.identifier !== candidate.paymentId ||
    remote?.network !== "Pi Testnet" ||
    remote?.direction !== "user_to_app" ||
    status?.developer_approved !== true ||
    status?.developer_completed !== true ||
    status?.transaction_verified !== true ||
    status?.cancelled !== false ||
    status?.user_cancelled !== false ||
    tx?.verified !== true ||
    typeof tx?.txid !== "string" ||
    !/^[a-f0-9]{64}$/i.test(tx.txid) ||
    tx.txid !== candidate.txid ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    (candidate.amount !== undefined && Number(candidate.amount) !== amount)
  )
    return null;
  const completed = candidate.time ? new Date(candidate.time) : null;
  const created = new Date(remote.created_at);
  const validCompletion = completed && Number.isFinite(completed.getTime());
  const time = validCompletion ? completed : created;
  if (!Number.isFinite(time.getTime())) return null;
  return {
    transactionId: tx.txid,
    amount,
    time: time.toISOString(),
    timeKind: validCompletion ? "completion" : "payment-created",
    verified: true,
    network: "Pi Testnet",
    explorerUrl:
      testnetExplorerUrl(tx._link, tx.txid) ??
      testnetExplorerUrl(
        `https://blockexplorer.minepi.com/testnet/transactions/${tx.txid}`,
        tx.txid,
      ),
  };
}

// Shared across requests: one bounded sync per 10 seconds, no caller-supplied
// payment identifiers. Older records are backfilled while recent arrivals are
// checked each cycle. Never call approve/complete from this read-only feed.
export class LiveTransactionFeed {
  private lastSync = 0;
  private running: Promise<void> | null = null;
  private cursors = new Map<string, ObjectId>();
  private checked = new Map<string, number>();
  public unavailable = false;
  constructor(
    private locals: Record<string, any>,
    private api: { get: (url: string, options: any) => Promise<{ data: any }> },
  ) {}

  refresh(now = Date.now()): Promise<void> {
    if (this.running) return this.running;
    if (now - this.lastSync < 10_000) return Promise.resolve();
    this.lastSync = now;
    this.running = this.sync(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async sync(now: number) {
    this.unavailable = false;
    try {
      const candidates: Candidate[] = [];
      for (const source of sources) {
        const collection = this.locals[source.collection];
        if (!collection) continue;
        const projection: Record<string, number> = {
          paymentId: 1,
          paymentTxid: 1,
          pricePi: 1,
          paidAt: 1,
          updatedAt: 1,
          pi_payment_identifier: 1,
          transaction_identifier: 1,
          amount_pi: 1,
          completed_at: 1,
          streamSubscription: 1,
        };
        const recent = await collection
          .find(source.query, { projection })
          .sort({ [source.timeField]: -1, _id: -1 })
          .limit(10)
          .toArray();
        const cursor = this.cursors.get(source.collection);
        const older = cursor
          ? await collection
              .find({ ...source.query, _id: { $lt: cursor } }, { projection })
              .sort({ _id: -1 })
              .limit(5)
              .toArray()
          : await collection
              .find(source.query, { projection })
              .sort({ _id: -1 })
              .limit(5)
              .toArray();
        const last = older[older.length - 1];
        if (last) this.cursors.set(source.collection, last._id);
        else this.cursors.delete(source.collection);
        candidates.push(...recent.map(source.read), ...older.map(source.read));
      }
      const unique = [
        ...new Map(
          candidates
            .filter(
              (c) =>
                typeof c.paymentId === "string" &&
                /^[a-z0-9_-]{1,200}$/i.test(c.paymentId) &&
                typeof c.txid === "string" &&
                /^[a-f0-9]{64}$/i.test(c.txid),
            )
            .map((c) => [c.paymentId, c]),
        ).values(),
      ];
      const collection = this.locals.liveTransactionCollection;
      // At most three concurrent Platform API requests; no credentials/DTOs logged.
      let index = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (index < unique.length) {
            const candidate = unique[index++];
            if ((this.checked.get(candidate.paymentId) || 0) > now) continue;
            try {
              if (
                await collection.findOne({ paymentId: candidate.paymentId })
              ) {
                this.checked.set(candidate.paymentId, now + 300_000);
                continue;
              }
              const { data } = await this.api.get(
                `/v2/payments/${encodeURIComponent(candidate.paymentId)}`,
                { timeout: 6000 },
              );
              const verified = verifiedTestnetPayment(data, candidate);
              if (verified)
                await collection.updateOne(
                  { transactionId: verified.transactionId },
                  {
                    $setOnInsert: {
                      ...verified,
                      paymentId: candidate.paymentId,
                      verifiedAt: new Date(),
                    },
                  },
                  { upsert: true },
                );
              this.checked.set(
                candidate.paymentId,
                now + (data?.network === "Pi Network" ? 300_000 : 10_000),
              );
            } catch {
              this.unavailable = true;
            }
          }
        }),
      );
      if (this.checked.size > 2000)
        for (const [key, expires] of this.checked)
          if (expires <= now) this.checked.delete(key);
    } catch {
      this.unavailable = true;
    }
  }

  async latest(): Promise<LiveTransaction[]> {
    const rows = await this.locals.liveTransactionCollection
      .find({ network: "Pi Testnet", verified: true })
      .sort({ time: -1 })
      .limit(10)
      .toArray();
    // Explicit public allowlist: no payment ID, users, addresses, metadata, keys.
    return rows.map((r: any) => ({
      transactionId: r.transactionId,
      amount: r.amount,
      time: r.time,
      timeKind: r.timeKind,
      verified: true,
      network: "Pi Testnet",
      explorerUrl: testnetExplorerUrl(r.explorerUrl, r.transactionId),
    }));
  }
}
