import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUserPresence } from "../hooks/useUserPresence";

type AuthContextType = ReturnType<typeof useAuth>;
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  useUserPresence(auth.user?.uid);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used within AuthProvider");
  return context;
};
