export type AuthSessionUser = {
  userId: string;
  uid?: string;
  piUsername: string;
  role: "buyer" | "seller" | "admin";
};

// https://stackoverflow.com/questions/65108033/property-user-does-not-exist-on-type-session-partialsessiondata
declare module 'express-session' {
  export interface SessionData {
    user?: AuthSessionUser | null,
    deviceSessionId?: string,
  }
}
