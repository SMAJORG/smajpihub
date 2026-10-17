type Row = Record<string, any>;
export type WalletNetwork = "mainnet" | "testnet" | "unknown";
export type WalletFilter =
  | "all"
  | "payments"
  | "orders"
  | "earnings"
  | "refunds";
export type WalletItem = {
  id: string;
  service: string;
  title: string;
  amountPi: number | null;
  network: WalletNetwork;
  status: string;
  recordedStatus: string;
  orderStatus: string;
  verified: boolean;
  direction: "outgoing" | "incoming" | "sale";
  categories: WalletFilter[];
  date: string | null;
  paymentId: string;
  txid: string;
  reference: string;
  href: string;
  note: string;
};
const LIMIT = 5000;
const fields = [
  "_id",
  "buyerId",
  "sellerId",
  "userId",
  "user_id",
  "employerId",
  "candidateId",
  "sellerUid",
  "payerUid",
  "amountPi",
  "amount_pi",
  "pricePi",
  "farePi",
  "paymentId",
  "pi_payment_identifier",
  "payment_id",
  "paymentTxid",
  "txid",
  "transaction_identifier",
  "paymentStatus",
  "status",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "paidAt",
  "completed_at",
  "verifiedAt",
  "refundedAt",
  "refundStatus",
  "refundRequestedAt",
  "refundReviewedAt",
  "refundReference",
  "refundTxid",
  "title",
  "productTitle",
  "course_title",
  "course_slug",
  "university_slug",
  "program_name",
  "name",
  "billingId",
  "bookingId",
  "orderId",
  "note",
  "network",
  "paymentNetwork",
  "intentKey",
  "verified",
  "direction",
  "type",
  "pickup",
  "destination",
  "paymentRecordId",
];
const projection = Object.fromEntries(fields.map((field) => [field, 1]));
const asId = (value: unknown) => (value == null ? "" : String(value));
const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER / 1e7
    ? Math.round(n * 1e7) / 1e7
    : null;
};
export const walletNetwork = (value: unknown): WalletNetwork =>
  value === "Pi Network"
    ? "mainnet"
    : value === "Pi Testnet"
      ? "testnet"
      : "unknown";
const date = (...values: unknown[]) => {
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value as any);
    if (Number.isFinite(time.getTime())) return time.toISOString();
  }
  return null;
};
const paymentId = (row: Row) =>
  asId(row.pi_payment_identifier || row.paymentId || "");
const txid = (row: Row) =>
  asId(row.paymentTxid || row.transaction_identifier || row.txid || "");
const serviceNames: Record<string, string> = {
  store: "SMAJ Store",
  jobs: "SMAJ Jobs",
  education: "SMAJ Education",
  stream: "SMAJ Stream",
  food: "SMAJ Food",
  transport: "SMAJ Transport",
  events: "SMAJ Events",
  health: "SMAJ Health",
  charity: "SMAJ Charity",
  housing: "SMAJ Housing",
  energy: "SMAJ Energy",
  agro: "SMAJ Agro",
  sports: "SMAJ Sports",
  swap: "SMAJ Swap",
  token: "SMAJ Token",
  platform: "SMAJ PI HUB",
};
const ledgerService = (intent: string) => {
  const prefix = intent.split(":")[0];
  return ["refund", "settlement"].includes(prefix)
    ? "store"
    : ["course", "courses", "university", "education", "edu"].includes(prefix)
      ? "education"
      : serviceNames[prefix]
        ? prefix
        : "platform";
};
export async function buildWalletActivity(
  locals: Row,
  user: Row,
  query: Row = {},
) {
  const selected =
    query.network === undefined
      ? walletNetwork(locals.piNetwork)
      : query.network;
  if (!["mainnet", "testnet", "unknown"].includes(selected))
    throw Object.assign(new Error("Choose a valid activity network."), {
      status: 400,
    });
  const filter = query.filter || "all";
  if (!["all", "payments", "orders", "earnings", "refunds"].includes(filter))
    throw Object.assign(new Error("Choose a valid activity filter."), {
      status: 400,
    });
  const service = query.service || "";
  if (service && !serviceNames[service])
    throw Object.assign(new Error("Choose a valid service."), { status: 400 });
  const offset = Number(query.offset || 0),
    limit = Number(query.limit || 25);
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Object.assign(new Error("Choose a valid activity page."), {
      status: 400,
    });
  const identities = [user.uid, asId(user._id)].filter(Boolean);
  const uid = asId(user.uid);
  if (!uid)
    throw Object.assign(new Error("Sign in to view financial activity."), {
      status: 401,
    });
  let partial = false,
    truncated = false;
  const unavailable = new Set<string>();
  const read = async (
    key: string,
    scope: Row,
    source: string,
    required = false,
  ): Promise<Row[]> => {
    if (!locals[key]) {
      if (required) {
        partial = true;
        unavailable.add(source);
      }
      return [] as Row[];
    }
    try {
      let cursor = locals[key]
        .find(scope, { projection })
        .sort({ createdAt: -1, created_at: -1 })
        .limit(LIMIT + 1);
      if (typeof cursor.maxTimeMS === "function")
        cursor = cursor.maxTimeMS(8000);
      const rows = await cursor.toArray();
      if (rows.length > LIMIT) {
        truncated = true;
        return rows.slice(0, LIMIT);
      }
      return rows as Row[];
    } catch {
      partial = true;
      unavailable.add(source);
      return [] as Row[];
    }
  };
  const userScope = (...keys: string[]) => ({
    $or: keys.map((key) => ({ [key]: { $in: identities } })),
  });
  const [
    orders,
    billing,
    salaries,
    courses,
    universities,
    transport,
    settlements,
  ] = await Promise.all([
    read(
      "marketplaceOrderCollection",
      { $or: [{ buyerId: uid }, { sellerId: uid }] },
      "Store",
      true,
    ),
    read("jobBillingCollection", userScope("employerId"), "Jobs"),
    read(
      "jobPaymentCollection",
      userScope("employerId", "candidateId"),
      "Jobs earnings",
    ),
    read("coursePaymentCollection", userScope("user_id"), "Education"),
    read("universityPaymentCollection", userScope("user_id"), "Education"),
    read("transportBookingCollection", { userId: uid }, "Transport"),
    read("settlementCollection", { sellerUid: uid }, "Store earnings"),
  ]);
  const streamRows = [
    user.streamSubscription,
    user.pendingStreamSubscription,
  ].filter(
    (row) =>
      row &&
      (row.paymentId || Number(row.amountPi) > 0 || Number(row.pricePi) > 0),
  );
  const allSources = [
    ...orders,
    ...billing,
    ...salaries,
    ...courses,
    ...universities,
    ...transport,
    ...settlements,
    ...streamRows,
  ];
  const ids = [
    ...new Set(
      allSources
        .flatMap((row) => [paymentId(row), asId(row.refundReference)])
        .filter(Boolean),
    ),
  ];
  const receipts = await read(
    "paymentCollection",
    {
      _id: { $regex: "^payment:" },
      $or: [
        { payerUid: uid },
        ...(ids.length ? [{ paymentId: { $in: ids } }] : []),
      ],
    },
    "Verified receipts",
    true,
  );
  const used = new Set<string>();
  const items: WalletItem[] = [];
  const receiptKey = (r: Row) => asId(r.network) + ":" + asId(r.paymentId);
  const findReceipt = (
    id: string,
    hash: string,
    party: string,
    intent?: string,
  ) => {
    if (!id) return undefined;
    const candidates = receipts.filter(
      (r) =>
        r.paymentId === id &&
        (!hash || !r.txid || r.txid === hash) &&
        (!intent || r.intentKey === intent) &&
        (r.payerUid === party || (!r.verified && Boolean(intent))),
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const add = (
    row: Row,
    config: {
      key: string;
      service: string;
      title: string;
      amount: unknown;
      href: string;
      direction?: WalletItem["direction"];
      categories: WalletFilter[];
      intent?: string;
      party?: string;
      paymentId?: string;
      txid?: string;
      status?: unknown;
      time?: unknown;
      note?: string;
    },
  ) => {
    const id = config.paymentId ?? paymentId(row),
      hash = config.txid ?? txid(row),
      party = config.party || uid;
    const receipt = findReceipt(id, hash, party, config.intent);
    const verified = Boolean(
      receipt?.verified === true &&
      receipt.payerUid === party &&
      receipt.direction ===
        (config.direction === "incoming" ? "app_to_user" : "user_to_app") &&
      typeof receipt.txid === "string" &&
      /^[a-f0-9]{64}$/i.test(receipt.txid) &&
      amount(receipt.amountPi) !== null &&
      Number(receipt.amountPi) > 0,
    );
    const network = receipt
      ? walletNetwork(receipt.network)
      : walletNetwork(row.network || row.paymentNetwork);
    const key = receipt ? receiptKey(receipt) : config.key;
    if (used.has(key)) return;
    used.add(key);
    const raw = String(
      config.status ?? row.paymentStatus ?? row.status ?? "pending",
    ).toLowerCase();
    const status = verified
      ? "completed"
      : /cancel|reject|declin/.test(raw + " " + (row.status || ""))
        ? "cancelled"
        : /fail|error/.test(raw)
          ? "failed"
          : /paid|complet|settled|confirm/.test(raw)
            ? "unverified"
            : "pending";
    const value = verified ? amount(receipt!.amountPi) : amount(config.amount);
    items.push({
      id: config.key,
      service: config.service,
      title: config.title || serviceNames[config.service],
      amountPi: value,
      network,
      status,
      recordedStatus: raw,
      orderStatus: String(row.status || ""),
      verified,
      direction: config.direction || "outgoing",
      categories: config.categories,
      date: date(
        config.time,
        receipt?.verifiedAt,
        row.paidAt,
        row.completed_at,
        row.createdAt,
        row.created_at,
        row.updatedAt,
        row.updated_at,
      ),
      paymentId: id,
      txid: verified ? receipt!.txid : hash,
      reference: asId(
        row._id ||
          row.billingId ||
          row.bookingId ||
          row.payment_id ||
          config.key,
      ),
      href: config.href,
      note:
        config.note ||
        (!verified && /paid|complet|settled|confirm/.test(raw)
          ? "Recorded by this service; verification is not available in the shared receipt ledger."
          : ""),
    });
  };
  for (const row of orders) {
    const id = asId(row._id),
      buyer = row.buyerId === uid;
    const hasPayment = Boolean(
      paymentId(row) || row.paymentStatus || row.paidAt,
    );
    add(row, {
      key: "store:" + id,
      service: "store",
      title: row.productTitle || "Store order",
      amount: row.pricePi,
      href: "/orders/" + id + "/track",
      intent: "store:" + id,
      party: row.buyerId,
      direction: buyer ? "outgoing" : "sale",
      categories: [
        "orders",
        ...(buyer && hasPayment ? ["payments" as const] : []),
      ],
      note: buyer
        ? undefined
        : "Sale value. Seller payout is tracked separately when it is settled.",
    });
    if (buyer && row.refundStatus && row.refundStatus !== "none")
      add(
        {
          ...row,
          network: undefined,
          paymentNetwork: undefined,
          paidAt: undefined,
          createdAt: undefined,
          updatedAt: undefined,
        },
        {
          key: "refund:" + id,
          service: "store",
          title: "Refund - " + (row.productTitle || "Store order"),
          amount: row.pricePi,
          href: "/orders/" + id + "/track",
          intent: "refund:" + id,
          direction: "incoming",
          categories: ["refunds"],
          paymentId: asId(row.refundReference),
          txid: asId(row.refundTxid),
          status: row.refundStatus,
          time: row.refundedAt || row.refundReviewedAt || row.refundRequestedAt,
          note:
            row.refundStatus === "completed"
              ? undefined
              : "Refund request; no confirmed return of funds yet.",
        },
      );
  }
  for (const row of billing)
    add(row, {
      key: "jobs:" + asId(row.billingId || row._id),
      service: "jobs",
      title: row.name || "Jobs billing",
      amount: row.amountPi ?? row.pricePi,
      href: "/app/services/jobs/payments-billing",
      intent: "jobs:" + row.billingId,
      categories: ["payments"],
    });
  for (const row of salaries) {
    const incoming = identities.includes(row.candidateId);
    add(row, {
      key: "salary:" + asId(row._id || row.paymentRecordId),
      service: "jobs",
      title: incoming ? "Jobs payment received" : "Jobs salary payment",
      amount: row.amountPi,
      href: incoming
        ? "/app/services/jobs/my-earnings"
        : "/app/services/jobs/payments-billing",
      direction: incoming ? "incoming" : "outgoing",
      categories: incoming ? ["earnings"] : ["payments"],
      note: "Reported salary payment. Candidate confirmation is not blockchain verification.",
    });
  }
  for (const [type, rows] of [
    ["course", courses],
    ["university", universities],
  ] as const)
    for (const row of rows)
      add(row, {
        key: type + ":" + asId(row._id),
        service: "education",
        title: row.course_title || row.program_name || "Education payment",
        amount: row.amount_pi,
        href: row.university_slug
          ? "/services/education/universities/" +
            encodeURIComponent(row.university_slug)
          : row.course_slug
            ? "/services/education/courses/" +
              encodeURIComponent(row.course_slug)
            : "/services/education/my-courses",
        categories: ["payments"],
      });
  for (const row of transport)
    add(row, {
      key: "transport:" + asId(row._id),
      service: "transport",
      title:
        row.type === "flight"
          ? "Flight booking"
          : row.pickup && row.destination
            ? row.pickup + " to " + row.destination
            : "Transport booking",
      amount: row.farePi,
      href: "/services/transport",
      categories: ["orders", "payments"],
    });
  for (const row of settlements)
    add(row, {
      key: "settlement:" + asId(row._id),
      service: "store",
      title: "Seller payout",
      amount: row.amountPi,
      href: "/orders",
      intent:
        "settlement:" +
        asId(row.orderId || asId(row._id).replace(/^store:/, "")),
      direction: "incoming",
      categories: ["earnings"],
      note:
        row.status === "held"
          ? "Payout held pending fulfillment and resolution. Not available to spend."
          : undefined,
    });
  for (const row of streamRows)
    add(row, {
      key: "stream:" + asId(row.paymentId || row.createdAt || row.startedAt),
      service: "stream",
      title: "Stream " + (row.plan || "subscription"),
      amount: row.pricePi ?? row.amountPi,
      href: "/app/services/stream/plans",
      categories: ["payments"],
      time: row.startedAt || row.createdAt,
      status: row.paymentStatus || "pending",
    });
  // The shared verified ledger is also the adapter for other integrated SMAJ services.
  for (const row of receipts) {
    if (row.payerUid !== uid || used.has(receiptKey(row))) continue;
    const source = ledgerService(asId(row.intentKey)),
      incoming = row.direction === "app_to_user";
    add(row, {
      key: "receipt:" + asId(row._id),
      service: source,
      title: serviceNames[source] + " payment",
      amount: row.amountPi,
      href:
        source === "store"
          ? "/orders"
          : source === "platform"
            ? "/app/services"
            : "/app/services/" + source,
      direction: incoming ? "incoming" : "outgoing",
      categories: [
        asId(row.intentKey).startsWith("refund:")
          ? "refunds"
          : incoming
            ? "earnings"
            : "payments",
      ],
      intent: row.intentKey,
    });
  }
  items.sort(
    (a, b) =>
      (b.date || "").localeCompare(a.date || "") || a.id.localeCompare(b.id),
  );
  const amounts = (rows: WalletItem[]) =>
    Math.round(
      rows.reduce((sum, row) => sum + Math.round((row.amountPi || 0) * 1e7), 0),
    ) / 1e7;
  if (
    !(["mainnet", "testnet", "unknown"] as const).every((network) =>
      Number.isSafeInteger(
        items
          .filter((item) => item.network === network)
          .reduce((sum, row) => sum + Math.round((row.amountPi || 0) * 1e7), 0),
      ),
    )
  ) {
    partial = true;
    unavailable.add("Precise totals");
  }
  const summaries = Object.fromEntries(
    (["mainnet", "testnet", "unknown"] as const).map((network) => {
      const rows = items.filter((item) => item.network === network),
        financial = rows.filter(
          (item) =>
            item.direction !== "sale" &&
            item.categories.some((c) =>
              ["payments", "earnings", "refunds"].includes(c),
            ),
        );
      const stat = (subset: WalletItem[]) => ({
        count: subset.length,
        amountPi: subset.some((row) => row.amountPi === null)
          ? null
          : amounts(subset),
      });
      return [
        network,
        partial || truncated
          ? null
          : {
              paid: stat(
                financial.filter(
                  (r) => r.verified && r.direction === "outgoing",
                ),
              ),
              pending: stat(
                financial.filter(
                  (r) => r.status === "pending" || r.status === "unverified",
                ),
              ),
              completed: stat(financial.filter((r) => r.verified)),
              cancelled: stat(
                financial.filter((r) => r.status === "cancelled"),
              ),
            },
      ];
    }),
  );
  const selectedItems = items.filter(
    (item) =>
      item.network === selected &&
      (!service || item.service === service) &&
      (filter === "all" || item.categories.includes(filter)),
  );
  const supportedFilters: WalletFilter[] = ["all", "payments", "orders"];
  if (
    locals.settlementCollection ||
    locals.jobPaymentCollection ||
    items.some((item) => item.categories.includes("earnings"))
  )
    supportedFilters.push("earnings");
  if (
    locals.marketplaceOrderCollection ||
    items.some((item) => item.categories.includes("refunds"))
  )
    supportedFilters.push("refunds");
  return {
    network: selected,
    filter,
    service,
    offset,
    limit,
    items: selectedItems.slice(offset, offset + limit),
    total: selectedItems.length,
    summary: summaries[selected],
    networks: (["mainnet", "testnet", "unknown"] as const).map((id) => ({
      id,
      count: items.filter((item) => item.network === id).length,
    })),
    services: [...new Set(items.map((item) => item.service))].map((id) => ({
      id,
      name: serviceNames[id] || "SMAJ PI HUB",
    })),
    supportedFilters,
    balance: {
      available: false,
      amountPi: null,
      message:
        "Open Pi Wallet to view your balance. This integration does not provide an authorized live wallet balance.",
    },
    partial,
    truncated,
    unavailable: [...unavailable],
    serverTime: new Date().toISOString(),
  };
}
