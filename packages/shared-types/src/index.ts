export type VerificationStatus = "none" | "pending" | "approved" | "rejected";
export type VerificationLevel = "basic" | "pi_verified" | "seller_verified" | "trusted_seller";

export type SmajUser = {
  uid: string;
  username: string;
  piUsername?: string;
  displayName?: string;
  avatar?: string;
  country?: string;
  role?: "buyer" | "seller" | "admin";
  roles?: string[];
  sellerActive?: boolean;
  verificationStatus?: VerificationStatus;
  verificationLevel?: VerificationLevel;
};

export type PiAuthResult = {
  accessToken: string;
  user: {
    uid: string;
    username: string;
    wallet_address?: string;
    roles?: string[];
  };
};

export type ProductSummary = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  price?: number;
  pricePi?: number;
  image?: string;
  images?: string[];
};

export type ConversationSummary = {
  id: string;
  title?: string;
  participantName?: string;
  lastMessage?: string;
  updatedAt?: string;
  unreadCount?: number;
};

export type ServiceLaunchStatus = "live" | "in-progress" | "coming-soon";
export type SmajService = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  status: ServiceLaunchStatus;
};

export type HealthResponse = {
  status: "ok" | "starting";
  service: string;
  database: "mongodb" | "memory";
  uptimeSeconds: number;
};

export type ApiErrorBody = { error?: string; message?: string };
export type HubSession = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  expiresAt: string;
};
