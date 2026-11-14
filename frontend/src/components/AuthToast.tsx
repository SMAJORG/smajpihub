import { isCapacitorNative } from "../lib/capacitorPiAuth";
import { useAuthContext } from "../contexts/AuthContext";

const AuthToast = () => {
  const { authFeedback, isAuthenticated } = useAuthContext();
  // The native welcome screen already renders its own sign-in error.
  if (isCapacitorNative() && !isAuthenticated && authFeedback?.type === "error") return null;
  return authFeedback ? <div className={`smaj-toast ${authFeedback.type}`} role="status">
    {authFeedback.message}
  </div> : null;
};
export default AuthToast;
