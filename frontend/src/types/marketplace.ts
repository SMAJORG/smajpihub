export type Product = {
  _id: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  piUsername?: string;
  title: string;
  image: string;
  images?: string[];
  pricePi: number;
  priceUsdt?: number;
  description: string;
  category: string;
  location: string;
  condition?: string;
  quantity?: number;
  deliveryOption?: string;
  productStatus?: "draft" | "active" | "out_of_stock" | "hidden";
  variants?: ProductVariant[];
  specifications?: Record<string, string>;
  attributes?: Record<string, string>;
  shipping?: ProductShipping;
  warranty?: string;
  returnPolicy?: string;
  seo?: { slug?: string; metaTitle?: string; metaDescription?: string };
  digitalProduct?: { enabled?: boolean; fileUrl?: string; downloadLimit?: number; licenseKey?: string };
  serviceDetails?: { enabled?: boolean; duration?: string; locationType?: string; appointmentRequired?: boolean };
  country?: string;
  stateRegion?: string;
  city?: string;
  areaAddress?: string;
  sellerAgreementAccepted?: boolean;
  sellerContact: string;
  active: boolean;
  approved?: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  hidden?: boolean;
  createdAt: string;
  verificationLevel?: VerificationLevel;
  verificationStatus?: VerificationStatus;
  rating?: number;
  reviewCount?: number;
  viewCount?: number;
};

export type ProductVariant = {
  color?: string;
  size?: string;
  material?: string;
  storage?: string;
  ram?: string;
  weight?: string;
  model?: string;
  edition?: string;
  style?: string;
  stock?: number;
  pricePi?: number;
  priceUsdt?: number;
  image?: string;
};

export type ProductShipping = {
  weight?: string;
  dimensions?: string;
  method?: string;
  deliveryTime?: string;
  pickupAvailable?: boolean;
};

export type VerificationLevel = "basic" | "pi_verified" | "seller_verified" | "trusted_seller";
export type VerificationStatus = "none" | "pending" | "approved" | "rejected";
export type SellerSummary = { uid: string; username?: string; piUsername?: string; displayName: string; avatar?: string; country?: string; createdAt?: string; verificationLevel?: VerificationLevel; verificationStatus?: VerificationStatus; totalProducts?: number; successfulOrders?: number; averageRating?: number; reviewCount?: number };
export type Review = { _id: string; buyerName: string; rating: number; message?: string; createdAt: string };
export type Conversation = { _id: string; buyerId: string; sellerId: string; productId: string; productTitle: string; productImage?: string; lastMessage?: string; updatedAt: string; unreadBy?: string[]; archived?: boolean; buyerName?: string; sellerName?: string; participantId?: string; participantName?: string; profileImage?: string; verificationLevel?: VerificationLevel; verificationStatus?: VerificationStatus; online?: boolean; lastSeenAt?: string; typing?: boolean };
export type ChatMessage = { _id: string; conversationId: string; senderId: string; message: string; messageType?: "text" | "voice" | "image" | "document"; productId?: string; productTitle?: string; productImage?: string; audioDataUrl?: string; audioMimeType?: string; audioDurationSeconds?: number; attachmentUrl?: string; attachmentDataUrl?: string; attachmentName?: string; attachmentMimeType?: string; attachmentSize?: number; deletedForEveryone?: boolean; deletedAt?: string; createdAt: string; readAt?: string };
export type AppNotification = { _id: string; type: string; title: string; message: string; read: boolean; relatedId?: string; createdAt: string; image?: string };

export type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "completed" | "cancelled";

export type OrderTimelineItem = {
  status: OrderStatus | "payment_pending";
  label: string;
  note?: string;
  at: string;
};

export type Order = {
  _id: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  productId: string;
  productTitle: string;
  productImage: string;
  pricePi: number;
  unitPricePi?: number;
  quantity?: number;
  inventoryReserved?: boolean;
  inventoryReleased?: boolean;
  status: OrderStatus;
  paymentId?: string | null;
  paidAt?: string | null;
  paymentStatus?: "pending" | "processing" | "paid" | "failed" | "cancelled";
  paymentTxid?: string | null;
  refundStatus?: "requested" | "manual_required" | "rejected" | "completed";
  refundReason?: string;
  refundReference?: string | null;
  disputeStatus?: "open" | "under_review" | "resolved" | "rejected";
  activeDisputeId?: string;
  createdAt: string;
  updatedAt?: string;
  timeline?: OrderTimelineItem[];
};
