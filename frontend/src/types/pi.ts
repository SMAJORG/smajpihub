export type AuthResult = {
  accessToken: string;
  user: {
    uid?: string;
    username?: string;
    wallet_address?: string;
    roles?: string[];
    piUsername?: string;
    displayName?: string;
    country?: string;
    role?: "buyer" | "seller" | "admin";
    contactPhone?: string;
    avatar?: string;
    coverImage?: string;
    bio?: string;
    language?: string;
    languagePreferenceSaved?: boolean;
    sellerActive?: boolean;
    blocked?: boolean;
    settings?: {
      theme: "dark" | "light";
      language: string;
      notifications: boolean;
    };
    createdAt?: string;
    verificationLevel?: "basic" | "pi_verified" | "seller_verified" | "trusted_seller";
    verificationStatus?: "none" | "pending" | "approved" | "rejected";
    verificationRequested?: boolean;
    verificationRequestType?: "pi_verified" | "seller_verified" | "trusted_seller";
  };
};

export type User = AuthResult["user"] & { accessToken?: string };

export type PaymentStatus = {
  developer_approved: boolean;
  transaction_verified: boolean;
  developer_completed: boolean;
  cancelled: boolean;
  user_cancelled: boolean;
};

export type PaymentDTO = {
  amount: number;
  user_uid: string;
  created_at: string;
  identifier: string;
  memo: string;
  metadata: Record<string, unknown>;
  status: PaymentStatus;
  to_address: string;
  transaction: null | { txid: string; verified: boolean; _link: string };
};
