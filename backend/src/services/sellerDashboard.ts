// Read-only seller analytics. Fulfillment states never stand in for verified receipts.
type Row = Record<string, any>;
const DAY = 86400000;
const amount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1e7)
    : null;
const time = (value: unknown) =>
  value ? new Date(value as string).getTime() : NaN;
const tx = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
export const sellerNetworks = ["Pi Testnet", "Pi Mainnet", "Unknown"] as const;
const network = (value: unknown) =>
  value === "Pi Testnet" || value === "Pi Mainnet" ? value : "Unknown";

export function summarizeSeller(
  orders: Row[],
  settlements: Row[] | null,
  payments: Row[] | null,
  now = Date.now(),
) {
  const orderMap = new Map(orders.map((row) => [String(row._id), row]));
  const receipts = new Map<string, Row>();
  const seen = new Set<string>();
  // Canonical ledger rows may have aliases for the same transaction.
  for (const row of payments || []) {
    const id = String(row.intentKey || "").replace(/^store:/, "");
    const order = orderMap.get(id);
    const value = amount(row.amountPi);
    if (
      !order ||
      row.verified !== true ||
      !tx(row.txid) ||
      value === null ||
      !Number.isFinite(time(order.paidAt || row.verifiedAt))
    )
      continue;
    const key = network(row.network) + ":" + String(row.txid).toLowerCase();
    if (seen.has(key) || receipts.has(id)) continue;
    seen.add(key);
    receipts.set(id, {
      orderId: id,
      network: network(row.network),
      units: value,
      at: time(order.paidAt || row.verifiedAt),
      refunded: order.refundStatus === "completed",
    });
  }
  for (const row of settlements || []) {
    const id = String(row.orderId),
      order = orderMap.get(id),
      value = amount(row.amountPi);
    const key = network(row.network) + ":" + String(row.receiptTxid).toLowerCase();
    if (
      !order ||
      receipts.has(id) ||
      seen.has(key) ||
      !tx(row.receiptTxid) ||
      value === null ||
      !Number.isFinite(time(order.paidAt || row.createdAt))
    )
      continue;
    seen.add(key);
    receipts.set(id, {
      orderId: id,
      network: network(row.network),
      units: value,
      at: time(order.paidAt || row.createdAt),
      refunded: order.refundStatus === "completed",
    });
  }
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const day = +today,
    week = day - ((today.getUTCDay() + 6) % 7) * DAY;
  const month = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const finance = sellerNetworks.map((name) => {
    const records = [...receipts.values()].filter(
      (row) => row.network === name,
    );
    const sum = (from = 0) =>
      records
        .filter((row) => row.at >= from && row.at <= now)
        .reduce((total, row) => total + row.units, 0) / 1e7;
    const payouts = new Map<string, Row>();
    const payoutTxs = new Set<string>();
    for (const row of settlements || []) {
      const order = orderMap.get(String(row.orderId));
      if (
        !order ||
        network(row.network) !== name ||
        amount(row.amountPi) === null ||
        payouts.has(String(row.orderId))
      )
        continue;
      if (
        row.status === "settled" &&
        (!tx(row.txid) ||
          !Number.isFinite(time(row.verifiedAt)) ||
          payoutTxs.has(String(row.txid).toLowerCase()))
      )
        continue;
      if (row.status === "settled") payoutTxs.add(String(row.txid).toLowerCase());
      if (row.status === "held" && order.refundStatus === "completed") continue;
      payouts.set(String(row.orderId), row);
    }
    const funds = (status: string) =>
      settlements === null
        ? null
        : [...payouts.values()]
            .filter((row) => row.status === status)
            .reduce((total, row) => total + amount(row.amountPi)!, 0) / 1e7;
    return {
      network: name,
      grossSales: payments === null && settlements === null ? null : sum(),
      today: payments === null && settlements === null ? null : sum(day),
      week: payments === null && settlements === null ? null : sum(week),
      month: payments === null && settlements === null ? null : sum(month),
      lifetimeEarnings: funds("settled"),
      pendingFunds: funds("held"),
      completedPayments:
        settlements === null
          ? null
          : [...payouts.values()].filter((row) => row.status === "settled")
              .length,
      refundedSales:
        records
          .filter((row) => row.refunded)
          .reduce((total, row) => total + row.units, 0) / 1e7,
      series: Array.from({ length: 90 }, (_, i) => {
        const from = day - (89 - i) * DAY;
        const items = records.filter(
          (row) => row.at >= from && row.at < from + DAY && row.at <= now,
        );
        return {
          date: new Date(from).toISOString().slice(0, 10),
          sales: items.reduce((total, row) => total + row.units, 0) / 1e7,
          payments: items.length,
        };
      }),
      hours: Array.from({ length: 24 }, (_, i) => {
        const from = day + i * 3600000,
          items = records.filter(
            (row) => row.at >= from && row.at < from + 3600000 && row.at <= now,
          );
        return {
          date: String(i).padStart(2, "0") + ":00",
          sales: items.reduce((total, row) => total + row.units, 0) / 1e7,
          payments: items.length,
        };
      }),
    };
  });
  const paidIds = new Set(receipts.keys());
  return {
    finance,
    paidIds,
    unverifiedOrders: orders.filter(
      (row) =>
        (row.paymentStatus === "paid" ||
          ["paid", "processing", "shipped", "delivered", "completed"].includes(
            row.status,
          )) &&
        !paidIds.has(String(row._id)),
    ).length,
  };
}

export function sellerResponseMetrics(
  conversations: Row[],
  messages: Row[],
  uid: string,
) {
  const latencies: number[] = [];
  let eligible = 0;
  const grouped = new Map<string, Row[]>();
  for (const message of messages) {
    if (!Number.isFinite(time(message.createdAt))) continue;
    const id = String(message.conversationId);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(message);
  }
  for (const conversation of conversations) {
    const other =
      conversation.buyerId === uid
        ? conversation.sellerId
        : conversation.buyerId;
    const history = (grouped.get(String(conversation._id)) || []).sort(
      (a, b) => time(a.createdAt) - time(b.createdAt),
    );
    const inbound = history.find((row) => row.senderId === other);
    if (!inbound) continue;
    eligible++;
    const reply = history.find(
      (row) =>
        row.senderId === uid && time(row.createdAt) >= time(inbound.createdAt),
    );
    if (reply)
      latencies.push((time(reply.createdAt) - time(inbound.createdAt)) / 60000);
  }
  return {
    responseRate: eligible
      ? Math.round((latencies.length / eligible) * 100)
      : null,
    responseMinutes: latencies.length
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : null,
    conversations: eligible,
  };
}

export async function buildSellerDashboard(
  locals: Row,
  user: Row,
  now = Date.now(),
) {
  const uid = user.uid;
  const warnings: string[] = [];
  const optional = async (
    key: string,
    query: Row,
    projection: Row,
    limit?: number,
  ): Promise<Row[] | null> => {
    try {
      if (!locals[key]) throw Error("Unavailable");
      let cursor = locals[key]
        .find(query, { projection })
        .sort({ createdAt: -1 });
      if (limit) cursor = cursor.limit(limit);
      return await cursor.toArray();
    } catch {
      warnings.push(key);
      return null;
    }
  };
  const [products, orders, reviews, settlements, conversations] =
    await Promise.all([
      locals.productCollection
        .find(
          { sellerId: uid },
          {
            projection: {
              _id: 1,
              title: 1,
              image: 1,
              pricePi: 1,
              priceUsdt: 1,
              quantity: 1,
              active: 1,
              hidden: 1,
              approved: 1,
              reviewStatus: 1,
              rejectionReason: 1,
              sellerAgreementAccepted: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .toArray(),
      locals.marketplaceOrderCollection
        .find(
          { sellerId: uid },
          {
            projection: {
              _id: 1,
              productTitle: 1,
              productImage: 1,
              pricePi: 1,
              buyerName: 1,
              status: 1,
              paymentStatus: 1,
              paidAt: 1,
              paymentId: 1,
              paymentTxid: 1,
              refundStatus: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .toArray(),
      locals.reviewCollection
        .find({ sellerId: uid }, { projection: { rating: 1 } })
        .toArray(),
      optional(
        "settlementCollection",
        { sellerUid: uid },
        {
          orderId: 1,
          amountPi: 1,
          network: 1,
          status: 1,
          receiptTxid: 1,
          txid: 1,
          verifiedAt: 1,
          createdAt: 1,
        },
      ),
      optional(
        "conversationCollection",
        { sellerId: uid, updatedAt: { $gte: new Date(now - 90 * DAY) } },
        { buyerId: 1, sellerId: 1 },
        501,
      ),
    ]);
  const notifications = await optional(
    "notificationCollection",
    {
      userId: uid,
      relatedId: {
        $in: [...orders, ...products].map((row: Row) => String(row._id)),
      },
      type: {
        $in: [
          "new_order",
          "payment_received",
          "order_completed",
          "order_update",
          "product_approved",
          "product_rejected",
          "product_hidden",
          "refund_requested",
          "order_dispute",
          "dispute_update",
        ],
      },
    },
    { title: 1, message: 1, type: 1, relatedId: 1, createdAt: 1, read: 1 },
    3,
  );
  const payments = orders.length
    ? await optional(
        "paymentCollection",
        {
          intentKey: { $in: orders.map((order: Row) => "store:" + order._id) },
          verified: true,
        },
        {
          intentKey: 1,
          amountPi: 1,
          network: 1,
          txid: 1,
          verified: 1,
          verifiedAt: 1,
        },
      )
    : [];
  let response = {
    responseRate: null as number | null,
    responseMinutes: null as number | null,
    conversations: 0,
  };
  if (conversations && conversations.length <= 500) {
    const messages = conversations.length
      ? await optional(
          "messageCollection",
          {
            conversationId: {
              $in: conversations.map((row) => String(row._id)),
            },
            createdAt: { $gte: new Date(now - 90 * DAY) },
          },
          { conversationId: 1, senderId: 1, createdAt: 1 },
          10001,
        )
      : [];
    if (messages && messages.length <= 10000)
      response = sellerResponseMetrics(conversations, messages, uid);
  }
  const financial = summarizeSeller(orders, settlements, payments, now);
  const validReviews = reviews.filter(
    (row: Row) =>
      typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5,
  );
  const active = Boolean(user.sellerActive || user.role === "seller");
  const approved = user.verificationStatus === "approved";
  const level =
    user.verificationLevel === "verified"
      ? "pi_verified"
      : user.verificationLevel;
  const verificationLevel =
    !active && ["trusted_seller", "seller_verified"].includes(level)
      ? "pi_verified"
      : level || "basic";
  const statusCounts = Object.fromEntries(
    [
      "pending",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "completed",
      "cancelled",
    ].map((status) => [
      status,
      orders.filter((row: Row) => row.status === status).length,
    ]),
  );
  return {
    updatedAt: new Date(now).toISOString(),
    timezone: "UTC",
    warnings,
    seller: {
      active,
      storeName:
        user.displayName || user.piUsername || user.username || "Your store",
      verificationStatus: user.verificationStatus || "none",
      verificationLevel: approved ? verificationLevel : "basic",
    },
    stats: {
      totalProducts: products.length,
      totalOrders: orders.length,
      pendingOrders: statusCounts.pending,
      paidOrders: payments === null && settlements === null ? null : financial.paidIds.size,
    },
    finance: financial.finance,
    unverifiedOrders: financial.unverifiedOrders,
    orderStatus: statusCounts,
    inventory: {
      lowStock: products.filter(
        (row: Row) =>
          row.active &&
          typeof row.quantity === "number" &&
          row.quantity > 0 &&
          row.quantity <= 3,
      ).length,
      outOfStock: products.filter(
        (row: Row) => !row.active || row.quantity === 0,
      ).length,
      pendingReview: products.filter(
        (row: Row) =>
          !row.hidden &&
          row.reviewStatus !== "rejected" &&
          (row.reviewStatus === "pending" || row.approved !== true),
      ).length,
    },
    performance: {
      averageRating: validReviews.length
        ? validReviews.reduce((sum: number, row: Row) => sum + row.rating, 0) /
          validReviews.length
        : null,
      totalReviews: validReviews.length,
      ...response,
    },
    products: products.map((row: Row) => ({ ...row, _id: String(row._id) })),
    orders: orders
      .slice(0, 5)
      .map((row: Row) => ({
        ...row,
        _id: String(row._id),
        paymentStatus: financial.paidIds.has(String(row._id))
          ? "paid"
          : row.paymentStatus === "paid"
            ? "unverified"
            : row.paymentStatus || "pending",
      })),
    notifications:
      notifications?.map((row) => ({ ...row, _id: String(row._id) })) ?? null,
  };
}
