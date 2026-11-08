import { AppState } from "react-native";
import { SmajApiError } from "@smaj/api-client";
import type { PiAuthResult, SmajUser } from "@smaj/shared-types";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { config } from "@/constants/config";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";
import { createPiOAuthRequest, createVerifiedPiAuthResult } from "@/lib/pi-auth";
import { isPiOAuthCallbackUrl, parsePiOAuthCallback } from "@/lib/pi-oauth";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  user: SmajUser | null;
  loading: boolean;
  signingIn: boolean;
  authError: string | null;
  beginPiSignIn: () => Promise<void>;
  completePiSignIn: (callbackUrl: string) => Promise<boolean>;
  clearAuthError: () => void;
  signInWithPiAuthResult: (result: PiAuthResult) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SmajUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const processingCallback = useRef(false);
  const handledCallbacks = useRef(new Set<string>());

  const restore = useCallback(async () => {
    try {
      const token = await authStorage.getAccessToken();
      if (!token) return;
      await api.refreshSession();
      const response = await api.currentUser();
      setUser(response.user);
      if (!response.user) await authStorage.clear();
    } catch (error) {
      if (error instanceof SmajApiError && [401, 403].includes(error.status)) { await authStorage.clear(); setUser(null); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restore();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void restore(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void restore(); }, 20 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [restore]);

  const signInWithPiAuthResult = useCallback(async (result: PiAuthResult) => {
    const response = await api.signInWithPi(result);
    await authStorage.setAccessToken(response.session?.accessToken || result.accessToken);
    if (response.session) await authStorage.setRefreshToken(response.session.refreshToken);
    setUser(response.user);
  }, []);

  const completePiSignIn = useCallback(async (callbackUrl: string) => {
    if (!isPiOAuthCallbackUrl(callbackUrl, config.piOAuthRedirectUri) || processingCallback.current || handledCallbacks.current.has(callbackUrl)) return false;
    handledCallbacks.current.add(callbackUrl);
    processingCallback.current = true;
    setSigningIn(true);
    setAuthError(null);
    try {
      const expectedState = await authStorage.getOAuthState();
      const callback = parsePiOAuthCallback(callbackUrl, config.piOAuthRedirectUri, expectedState || "");
      await authStorage.clearOAuthState();
      const authResult = await createVerifiedPiAuthResult(callback.accessToken);
      await signInWithPiAuthResult(authResult);
      return true;
    } catch (error) {
      await authStorage.clearOAuthState();
      setAuthError(error instanceof Error ? error.message : "Pi sign-in failed. Please try again.");
      return false;
    } finally {
      processingCallback.current = false;
      setSigningIn(false);
    }
  }, [signInWithPiAuthResult]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", event => {
      void completePiSignIn(event.url).then(handled => { if (handled) void WebBrowser.dismissBrowser(); });
    });
    void Linking.getInitialURL().then(url => { if (url) void completePiSignIn(url); });
    return () => subscription.remove();
  }, [completePiSignIn]);

  const beginPiSignIn = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const request = await createPiOAuthRequest();
      await authStorage.setOAuthState(request.state);
      const result = await WebBrowser.openAuthSessionAsync(request.authorizeUrl, config.piOAuthRedirectUri);
      if (result.type === "success") await completePiSignIn(result.url);
    } catch (error) {
      await authStorage.clearOAuthState();
      setAuthError(error instanceof Error ? error.message : "Could not open Pi sign-in.");
    } finally {
      setSigningIn(false);
    }
  }, [completePiSignIn]);

  const signOut = useCallback(async () => {
    try { await api.request("/user/signout", { method: "POST" }); }
    finally { await authStorage.clear(); setUser(null); setAuthError(null); }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);
  const value = useMemo(() => ({ user, loading, signingIn, authError, beginPiSignIn, completePiSignIn, clearAuthError, signInWithPiAuthResult, signOut }), [authError, beginPiSignIn, clearAuthError, completePiSignIn, loading, signInWithPiAuthResult, signOut, signingIn, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
};