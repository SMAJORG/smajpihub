// Analytics reads persisted operational records; it never approves or completes payments.
export const ADMIN_ACTIVITY_WINDOW_MS = 15 * 60_000;
const DAY = 86_400_000;
const MAX_ROWS = 50_000;
type Row = Record<string, any>;
export const analyticsServices = [
  { id: "store", name: "SMAJ STORE", collection: "marketplaceOrderCollection", unit: "orders", href: "/admin/orders" },
  { id: "stream", name: "SMAJ PI STREAM", collection: "streamPlaybackSessionCollection", unit: "playback sessions", href: "/admin/stream/analytics" },
  { id: "sports", name: "SMAJ PI SPORTS" },
  { id: "food", name: "SMAJ FOOD DELIVERY" },
  { id: "jobs", name: "SMAJ PI JOBS", collection: "jobApplicationCollection", unit: "applications", href: "/admin/jobs" },
  { id: "health", name: "SMAJ PI HEALTH" },
  { id: "edu", name: "SMAJ PI EDU", collection: "enrollmentCollection", unit: "enrollments", href: "/admin/courses" },
  { id: "transport", name: "SMAJ PI TRANSPORT", collection: "transportBookingCollection", unit: "bookings" },
  { id: "agro", name: "SMAJ PI AGRO" }, { id: "energy", name: "SMAJ PI ENERGY" },
  { id: "charity", name: "SMAJ PI CHARITY" }, { id: "housing", name: "SMAJ PI HOUSING" },
  { id: "events", name: "SMAJ PI EVENTS" }, { id: "swap", name: "SMAJ PI SWAP" },
  { id: "token", name: "SMAJ TOKEN" },
] as const;
export type AnalyticsRange = { from: number; to: number; previousFrom: number; timezone: string; live: boolean; step: number; service?: string };
export function parseAnalyticsRange(query: Row, now = Date.now()): AnalyticsRange {
  const validDate = (value: unknown) => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const durations: Record<string, number> = { Live: 3600_000, "24H": DAY, "7D": 7 * DAY, "30D": 30 * DAY, "90D": 90 * DAY };
  if (query.period && !durations[String(query.period)]) throw new Error("Choose a valid analytics period.");
  const to = query.period ? now : query.to ? validDate(query.to) : now;
  const from = query.period ? to - durations[String(query.period)] : query.from ? validDate(query.from) : now - 30 * DAY;
  const timezone = typeof query.timezone === "string" ? query.timezone : "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now); } catch { throw new Error("Choose a valid timezone."); }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > 180 * DAY || to > now + 60_000) throw new Error("Choose an explicit timezone and a date range of up to 180 days ending no later than now.");
  const service = query.service ? String(query.service) : undefined;
  if (service && !analyticsServices.some(entry => entry.id === service)) throw new Error("Choose a valid service.");
  const duration = to - from;
  const step = duration <= 2 * 3600_000 ? 5 * 60_000 : duration <= DAY ? 3600_000 : Math.ceil(duration / (30 * 3600_000)) * 3600_000;
  return { from, to, previousFrom: from - duration, timezone, live: query.live === "true", step, service };
}
const timestamp = (value: unknown): number => value ? new Date(value as any).getTime() : NaN;
const id = (row: Row) => String(row._id || row.uid || row.transactionId || "");
const inPeriod = (time: number, start: number, end: number) => Number.isFinite(time) && time >= start && time < end;
const projection = Object.fromEntries(["_id", "uid", "username", "displayName", "createdAt", "lastSeenAt", "blocked", "role", "sellerActive", "verificationStatus", "verificationLevel", "verificationRequested", "transactionId", "paymentId", "verified", "network", "amount", "time", "timeKind", "verifiedAt", "paidAt", "paymentTxid", "paymentStatus", "status", "pricePi", "productTitle", "title", "courseTitle", "jobTitle", "pi_payment_identifier", "transaction_identifier", "completed_at", "startedAt", "streamSubscription", "amount_pi"].map(key => [key, 1]));
async function read(locals: Row, key: string): Promise<{ rows: Row[]; error: string | null }> {
  if (!locals[key]) return { rows: [], error: "Required collection: " + key };
  try {
    const cursor = locals[key].find({}).project(projection).limit(MAX_ROWS + 1);
    if (typeof cursor.maxTimeMS === "function") cursor.maxTimeMS(8000);
    const rows = await cursor.toArray();
    if (rows.length > MAX_ROWS) return { rows: [], error: "Database aggregation required for " + key + " above 50,000 records; totals are withheld." };
    return { rows, error: null };
  } catch { return { rows: [], error: "Could not read " + key + ". Retry refresh." }; }
}
export type AnalyticsRecord = { id: string; title: string; time: string; value: number; service: string; status: string; href: string; metric: string; unit: string };
export async function buildAdminAnalytics(locals: Row, range: AnalyticsRange, now = Date.now()) {
  const keys = [...new Set(["userCollection", "liveTransactionCollection", "marketplaceOrderCollection", "jobBillingCollection", "transportBookingCollection", "coursePaymentCollection", "universityPaymentCollection", "streamPlaybackSessionCollection", "jobApplicationCollection", "enrollmentCollection", "orderDisputeCollection", "jobDisputeCollection"] )];
  const results = await Promise.all(keys.map(async key => [key, await read(locals, key)] as const));
  const data = Object.fromEntries(results);
  const records: AnalyticsRecord[] = [];
  const add = (row: Row, metric: string, time: unknown, value: number, service: string, status: string, href: string, unit: string) => {
    const ms = timestamp(time);
    if (!Number.isFinite(ms)) return;
    records.push({ id: id(row), title: String(row.displayName || row.username || row.productTitle || row.courseTitle || row.jobTitle || row.title || row.transactionId || id(row)), time: new Date(ms).toISOString(), value, service, status, href, metric, unit });
  };
  const users = data.userCollection.rows;
  for (const row of users) add(row, "growth", row.createdAt, 1, "platform", row.blocked ? "blocked" : "active", "/admin/users", "users");
  const active = users.filter((row: Row) => !row.blocked && inPeriod(timestamp(row.lastSeenAt), now - ADMIN_ACTIVITY_WINDOW_MS, now + 1));
  for (const row of active) add(row, "active", row.lastSeenAt, 1, "platform", "recent activity", "/admin/users", "users");
  for (const row of data.marketplaceOrderCollection.rows) add(row, "orders", row.createdAt, 1, "store", row.status || "unknown", "/admin/orders", "orders");
  const paymentSources = [
    { key: "marketplaceOrderCollection", service: "store" }, { key: "jobBillingCollection", service: "jobs" },
    { key: "transportBookingCollection", service: "transport" }, { key: "coursePaymentCollection", service: "edu" },
    { key: "universityPaymentCollection", service: "edu" },
  ];
  const attempts = new Map<string, Row>();
  for (const source of paymentSources) for (const row of data[source.key].rows) {
    const paymentId = row.paymentId || row.pi_payment_identifier;
    if (typeof paymentId === "string" && paymentId) attempts.set(paymentId, { ...row, service: source.service });
  }
  for (const row of users) if (row.streamSubscription?.paymentId) attempts.set(row.streamSubscription.paymentId, { ...row.streamSubscription, _id: row._id, service: "stream", createdAt: row.streamSubscription.startedAt });
  const verified = new Map<string, Row>();
  for (const row of data.liveTransactionCollection.rows) {
    if (row.verified !== true || row.network !== "Pi Testnet" || !/^[a-f0-9]{64}$/i.test(row.transactionId || "") || typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0 || !Number.isFinite(timestamp(row.time))) continue;
    verified.set(row.transactionId, row);
  }
  const verifiedIds = new Set<string>();
  for (const row of verified.values()) {
    verifiedIds.add(row.paymentId);
    const attempt = attempts.get(row.paymentId);
    // The verification service distinguishes completion timestamps from payment creation.
    const time = row.time;
    const service = attempt?.service || "unattributed";
    add(row, "payments", time, row.amount, service, "verified", "/admin/analytics?service=" + service, "Pi Testnet");
    add(row, "status", time, 1, service, "successful", "/admin/analytics", "transactions");
  }
  for (const [paymentId, row] of attempts) {
    if (verifiedIds.has(paymentId)) continue;
    const raw = String(row.paymentStatus || row.status || "unknown").toLowerCase();
    const status = ["failed", "cancelled", "error"].includes(raw) ? "failed" : ["pending", "processing", "created", "approved"].includes(raw) ? "pending" : "unverified";
    add(row, "status", row.createdAt || row.startedAt, 1, row.service, status, row.service === "store" ? "/admin/orders" : "/admin/analytics", "transactions");
  }
  const services = analyticsServices.map(service => {
    const collection = "collection" in service ? service.collection : null;
    const error = collection ? data[collection]?.error : "Requires persisted service usage events and admin management API.";
    const rows = collection ? data[collection]?.rows || [] : [];
    for (const row of rows) add(row, "usage", row.createdAt || row.startedAt, 1, service.id, row.status || "recorded", "href" in service ? service.href : "/admin/services/" + service.id, "unit" in service ? service.unit : "events");
    return { id: service.id, name: service.name, unit: "unit" in service ? service.unit : "events", available: !error, reason: error || null, count: error ? null : records.filter(row => row.metric === "usage" && row.service === service.id && inPeriod(timestamp(row.time), range.from, range.to)).length, previous: error ? null : records.filter(row => row.metric === "usage" && row.service === service.id && inPeriod(timestamp(row.time), range.previousFrom, range.from)).length };
  });
  const scope = (row: AnalyticsRecord) => !range.service || ["growth", "active"].includes(row.metric) || row.service === range.service;
  const selected = records.filter(row => scope(row) && inPeriod(timestamp(row.time), range.from, range.to));
  const previous = records.filter(row => scope(row) && inPeriod(timestamp(row.time), range.previousFrom, range.from));
  const sum = (rows: AnalyticsRecord[], metric: string, service?: string) => { const matching = rows.filter(row => row.metric === metric && (!service || row.service === service)); return metric === "payments" ? matching.reduce((total, row) => total + Math.round(row.value * 1e7), 0) / 1e7 : matching.reduce((total, row) => total + row.value, 0); };
  const series = (metric: string) => Array.from({ length: Math.ceil((range.to - range.from) / range.step) }, (_, index) => {
    const start = range.from + index * range.step;
    const end = Math.min(start + range.step, range.to);
    const prevStart = range.previousFrom + index * range.step;
    return { time: new Date(start).toISOString(), end: new Date(end).toISOString(), previousTime: new Date(prevStart).toISOString(), value: sum(selected.filter(row => inPeriod(timestamp(row.time), start, end)), metric), previous: sum(previous.filter(row => inPeriod(timestamp(row.time), prevStart, prevStart + (end - start))), metric), ...(metric === "orders" ? { transactions: selected.filter(row => row.metric === "payments" && inPeriod(timestamp(row.time), start, end)).length, previousTransactions: previous.filter(row => row.metric === "payments" && inPeriod(timestamp(row.time), prevStart, prevStart + (end - start))).length } : {}) };
  });
  const day = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: range.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
  const today = day(now);
  const usersAvailable = !data.userCollection.error;
  const ledgerAvailable = !data.liveTransactionCollection.error;
  const attributionSources: Record<string, string[]> = { store: ["marketplaceOrderCollection"], stream: ["userCollection"], jobs: ["jobBillingCollection"], edu: ["coursePaymentCollection", "universityPaymentCollection"], transport: ["transportBookingCollection"] };
  const attributionAvailable = !range.service || Boolean(attributionSources[range.service]?.every(key => !data[key].error));
  const paymentsAvailable = ledgerAvailable && attributionAvailable;
  const paymentsReason = data.liveTransactionCollection.error || (!attributionAvailable ? "A verified payment attribution adapter is required for this service; financial totals are withheld." : null);
  const statusAvailable = paymentsAvailable && paymentSources.every(source => !data[source.key].error) && usersAvailable;
  const openDisputes = ["orderDisputeCollection", "jobDisputeCollection"];
  const kpis = {
    totalUsers: usersAvailable ? users.length : null,
    activeUsers: usersAvailable ? active.length : null,
    verifiedUsers: usersAvailable ? users.filter((row: Row) => row.verificationStatus === "approved" && ["pi_verified", "seller_verified", "trusted_seller", "verified"].includes(row.verificationLevel)).length : null,
    totalTransactions: ledgerAvailable ? verified.size : null,
    newUsersToday: usersAvailable ? users.filter((row: Row) => Number.isFinite(timestamp(row.createdAt)) && day(timestamp(row.createdAt)) === today).length : null,
    trustedSellers: usersAvailable ? users.filter((row: Row) => row.verificationStatus === "approved" && row.verificationLevel === "trusted_seller").length : null,
    piVolume: paymentsAvailable ? sum(selected, "payments") : null,
    successfulPayments: paymentsAvailable ? selected.filter(row => row.metric === "status" && row.status === "successful").length : null,
    pendingVerifications: usersAvailable ? users.filter((row: Row) => (row.verificationStatus === "pending" || row.verificationRequested === true)).length : null,
    openDisputes: openDisputes.every(key => !data[key].error) ? openDisputes.flatMap(key => data[key].rows).filter(row => ["open", "under_review"].includes(row.status)).length : null,
    fraudAlerts: null,
    activeServices: services.some(service => service.available) ? services.filter(service => service.count !== null && service.count > 0).length : null,
  };
  const unavailable = Object.fromEntries(results.filter(([, result]) => result.error).map(([key, result]) => [key, result.error]));
  return {
    updatedAt: new Date(now).toISOString(), range: { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), previousFrom: new Date(range.previousFrom).toISOString(), timezone: range.timezone },
    kpis, services, unavailable,
    charts: {
      growth: { available: usersAvailable, reason: data.userCollection.error, data: usersAvailable ? series("growth") : [] },
      active: { available: usersAvailable && range.live, reason: usersAvailable ? "Historical active-user snapshots are not stored. Live shows observed accounts with lastSeenAt in the past 15 minutes; login/profile activity is the current signal." : data.userCollection.error, data: usersAvailable && range.live ? [{ time: new Date(now).toISOString(), end: new Date(now + 1).toISOString(), previousTime: "", value: active.length, previous: null }] : [] },
      payments: { available: paymentsAvailable, reason: paymentsReason, data: paymentsAvailable ? series("payments") : [] },
      orders: { available: !data.marketplaceOrderCollection.error && (!range.service || range.service === "store"), reason: data.marketplaceOrderCollection.error || (range.service && range.service !== "store" ? "An order/transaction analytics adapter is required for this service." : null), data: !data.marketplaceOrderCollection.error && (!range.service || range.service === "store") ? series("orders") : [] },
      status: { available: statusAvailable, reason: statusAvailable ? null : "A payment source is unavailable; status totals are withheld.", data: statusAvailable ? ["successful", "pending", "failed", "unverified"].map(status => ({ name: status, value: selected.filter(row => row.metric === "status" && row.status === status).length, previous: previous.filter(row => row.metric === "status" && row.status === status).length })) : [] },
    },
    contributions: [...analyticsServices.map(service => ({ service: service.id, name: service.name, value: sum(selected, "payments", service.id), previous: sum(previous, "payments", service.id) })), { service: "unattributed", name: "Unattributed", value: sum(selected, "payments", "unattributed"), previous: sum(previous, "payments", "unattributed") }],
    definitions: { active: "Accounts not blocked with lastSeenAt in the last 15 minutes. This currently tracks login/profile activity, not continuous browsing.", financial: "Pi Testnet only. Persisted transactions independently verified by the existing Pi Platform verification feed. This is a verified subset, not all payment attempts or Mainnet revenue. Completion time is used when known; otherwise payment creation time.", usage: "Recorded operational actions: orders, playback sessions, job applications, enrollments and transport bookings. These are different units, not comparable unique visitors. Unsupported services are unavailable, not zero.", status: "Current recorded status grouped by attempt creation time; successful uses the verified ledger time. Historical status transitions are not stored. Unverified completions are separate from successful payments." },
    records,
  };
}
