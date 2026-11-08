import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUserPresence } from "../hooks/useUserPresence";

import { useTranslation } from "react-i18next";
import { persistLanguage, profileLanguageCode } from "../localization/languages";

type AuthContextType = ReturnType<typeof useAuth>;
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  useUserPresence(auth.user?.uid);
  const { i18n } = useTranslation();
  useEffect(() => {
    if (!auth.user?.languagePreferenceSaved) return;
    const language = profileLanguageCode(auth.user.language || auth.user.settings?.language || "en");
    persistLanguage(language);
    void i18n.changeLanguage(language);
  }, [auth.user?.uid, auth.user?.languagePreferenceSaved, auth.user?.language, auth.user?.settings?.language, i18n]);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used within AuthProvider");
  return context;
};
