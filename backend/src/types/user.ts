import { ObjectId } from "mongodb";

export interface UserData {
  _id: ObjectId,
  username: string,
  piUsername: string,
  uid: string,
  roles: Array<string>,
  role: "buyer" | "seller" | "admin",
  displayName: string,
  country: string,
  contactPhone?: string,
  contactEmail?: string,
  avatar?: string,
  coverImage?: string,
  bio?: string,
  language?: string,
  languagePreferenceSaved?: boolean,
  sellerActive?: boolean,
  blocked?: boolean,
  verificationLevel?: "basic" | "pi_verified" | "seller_verified" | "trusted_seller",
  verificationStatus?: "none" | "pending" | "approved" | "rejected",
  verificationRequested?: boolean,
  verificationRequestType?: "pi_verified" | "seller_verified" | "trusted_seller",
  settings?: {
    theme: "dark" | "light",
    language: string,
    notifications: boolean,
  },
  sportsPreferences?: {
    completed: boolean,
    favoriteTeamIds: string[],
    favoriteCompetitionIds: string[],
    notifications: {
      breakingNews: boolean,
      matchStart: boolean,
      matchEnd: boolean,
      scoreUpdates: boolean,
    },
    updatedAt?: string | null,
  },  recentSearches?: string[],
  createdAt: Date,
  accessToken: string
}
