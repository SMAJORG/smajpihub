import { isCapacitorNative } from "../lib/capacitorPiAuth";
import { useAuthContext } from "../contexts/AuthContext";

const AuthToast = () => {
  const { authFeedback, isAuthenticated } = useAuthContext();
  // The native welcome screen already renders its own sign-in error.
  if (isCapacitorNative() && !isAuthenticated && authFeedback?.type === "error") return null;
  return authFeedback ? <div className={`smaj-toast ${authFeedback.type}`} role="status">
    {authFeedback.message}
    {authFeedback.type === "error" && authFeedback.message.includes("could not match this identity") && <a href="/account-link" style={{ color: "var(--text)", textDecoration: "underline" }}> Verify both Pi identities</a>}
  </div> : null;
};
export default AuthToast;
