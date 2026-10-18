import type {
  Product,
  Order,
  AppNotification,
  VerificationLevel,
  VerificationStatus,
} from "../types/marketplace";
export type SellerSeries = { date: string; sales: number; payments: number };
export type SellerFinance = {
  network: string;
  grossSales: number | null;
  today: number | null;
  week: number | null;
  month: number | null;
  lifetimeEarnings: number | null;
  pendingFunds: number | null;
  completedPayments: number | null;
  refundedSales: number;
  series: SellerSeries[];
  hours: SellerSeries[];
};
export type SellerDashboard = {
  updatedAt: string;
  timezone: string;
  warnings: string[];
  defaultNetwork?: string;
  seller: {
    active: boolean;
    storeName: string;
    verificationLevel: VerificationLevel;
    verificationStatus: VerificationStatus;
  };
  stats: {
    totalProducts: number;
    totalOrders: number;
    pendingOrders: number;
    paidOrders: number | null;
  };
  finance: SellerFinance[];
  unverifiedOrders: number;
  orderStatus: Record<string, number>;
  inventory: { lowStock: number; outOfStock: number; pendingReview: number };
  performance: {
    averageRating: number | null;
    totalReviews: number;
    responseRate: number | null;
    responseMinutes: number | null;
    conversations: number;
  };
  products: Product[];
  orders: (Omit<Order, "paymentStatus"> & { paymentStatus: string })[];
  notifications: AppNotification[] | null;
};
export const sellerSnapshots = new Map<string, SellerDashboard>();
