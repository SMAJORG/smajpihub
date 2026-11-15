export type CommerceMode = "legacy" | "mainnet" | "testnet-development";
export const freshMainnetAccounts = (settings: NodeJS.ProcessEnv = process.env) => settings.PI_MAINNET_ACCOUNT_MODE === "fresh";
// Original collections are never renamed, copied, cleared or backfilled at startup.
const commerceCollections = new Set([
  "merchant_settlements", "pi_payments", "pi_live_testnet_transactions",
  "orders", "order_disputes", "products", "favorites", "reviews",
  "user_sessions", "device_sessions", "sso_codes",
  "jobs", "job_companies", "job_saved", "job_applications", "job_audit_log",
  "job_billing", "job_payments", "job_disputes", "testnet_a2u_payments",
  "transport_bookings", "transport_drivers", "transport_vehicles", "transport_trips",
  "transport_receipts", "transport_notifications", "tutor_lesson_requests",
  "institution_programs", "institution_student_applications", "institution_announcements",
  "university_programs", "university_applications", "university_payments",
  "courses", "course_payments", "enrollments", "lesson_progress", "quizzes",
  "quiz_submissions", "certificates",
]);
export function commerceMode(settings: NodeJS.ProcessEnv = process.env): CommerceMode {
  const mode = settings.PI_COMMERCE_MODE || "legacy";
  if (freshMainnetAccounts(settings) && mode !== "mainnet") throw new Error("Fresh Mainnet accounts require PI_COMMERCE_MODE=mainnet");
  if (!["legacy", "mainnet", "testnet-development"].includes(mode)) throw new Error("Invalid PI_COMMERCE_MODE");
  if (mode === "mainnet") {
    if (settings.PI_NETWORK !== "Pi Network") throw new Error("Mainnet commerce requires PI_NETWORK=Pi Network");
    // Fresh login-only launch never changes original collections or sends payments.
    const loginOnlyFresh = freshMainnetAccounts(settings) && settings.PI_PAYMENTS_ENABLED === "false";
    if (!loginOnlyFresh && (!/^[a-f0-9]{64}$/.test(settings.MAINNET_BACKUP_SHA256 || "") || settings.MAINNET_BACKUP_RESTORE_VERIFIED !== "true")) throw new Error("Mainnet cutover requires a backup checksum and verified isolated restore");
    if (!loginOnlyFresh && (!settings.PI_MAINNET_APP_ID || !settings.PI_MAINNET_API_KEY)) throw new Error("Configure the Mainnet app ID and Mainnet API key securely");
    if (settings.PI_API_KEY && settings.PI_API_KEY === settings.PI_MAINNET_API_KEY) throw new Error("Mainnet must not reuse the legacy Testnet app key");
    if (settings.PLATFORM_API_URL && settings.PLATFORM_API_URL.replace(/\/+$/, "") !== "https://api.minepi.com") throw new Error("Mainnet requires the official Pi API endpoint");
    if (settings.PI_PAYMENTS_ENABLED !== "false" && settings.PI_MAINNET_INCOMING_WALLET_APPROVED !== "true") throw new Error("Mainnet payments require an approved incoming app wallet");
  }
  if (mode === "testnet-development" && settings.PI_NETWORK !== "Pi Testnet") throw new Error("Testnet development requires PI_NETWORK=Pi Testnet");
  if (mode === "legacy" && settings.PI_NETWORK === "Pi Network") throw new Error("Mainnet cannot use legacy Testnet commerce collections");
  return mode as CommerceMode;
}
export function commerceCollectionName(name: string, mode: CommerceMode, fresh = freshMainnetAccounts()) {
  return ((mode === "mainnet" && fresh) || commerceCollections.has(name)) && mode !== "legacy"
    ? `${mode === "mainnet" ? "mainnet" : "testnet_dev"}_${name}` : name;
}
export function commerceDatabase(db: any, mode: CommerceMode, fresh = freshMainnetAccounts()) {
  return new Proxy(db, { get(target, key) {
    if (key === "collection") return (name: string, ...args: any[]) => target.collection(commerceCollectionName(name, mode, fresh), ...args);
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
