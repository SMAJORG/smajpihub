export type WalletNetwork = "mainnet" | "testnet" | "unknown";
export type WalletFilter = "all" | "payments" | "orders" | "earnings" | "refunds";
export type WalletActivityItem = {
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
export type WalletStat = { count: number; amountPi: number | null };
export type WalletActivityResponse = {
  network: WalletNetwork;
  filter: WalletFilter;
  service: string;
  offset: number;
  limit: number;
  items: WalletActivityItem[];
  total: number;
  summary: { paid: WalletStat; pending: WalletStat; completed: WalletStat; cancelled: WalletStat } | null;
  networks: { id: WalletNetwork; count: number }[];
  services: { id: string; name: string }[];
  supportedFilters: WalletFilter[];
  balance: { available: false; amountPi: null; message: string };
  partial: boolean;
  truncated: boolean;
  unavailable: string[];
  serverTime: string;
};
export const walletNetworkLabel = (network: WalletNetwork) =>
  network === "mainnet" ? "Mainnet" : network === "testnet" ? "Testnet" : "Unconfirmed network";
export const walletStatusLabel = (status: string) =>
  ({
    completed: "Completed",
    pending: "Pending",
    cancelled: "Cancelled",
    failed: "Failed",
    unverified: "Verification pending",
  })[status] || "Recorded";
export const walletAmount = (value: number | null, visible = true) =>
  !visible
    ? "****"
    : value === null
      ? "Amount unavailable"
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 7 }).format(value);
