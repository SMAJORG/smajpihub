import type { ReactNode } from "react";
import { useAuthContext } from "../contexts/AuthContext";
import Header from "../components/Header";
import Footer from "../components/Footer";
import SignIn from "../components/SignIn";
import { useNavigate } from "react-router-dom";
import useRouteScrollTop from "../hooks/useRouteScrollTop";
import AndroidDownloadPrompt from "../components/AndroidDownloadPrompt";

type AppLayoutProps = {
  children: ReactNode;
  showFooter?: boolean;
  showHeader?: boolean;
};

const AppLayout = ({ children, showFooter = true, showHeader = true }: AppLayoutProps) => {
  useRouteScrollTop();
  const { showSignIn, closeSignIn, isLoading, signIn } = useAuthContext();
  const navigate = useNavigate();
  const login = async () => {
    if (await signIn()) {
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <>
      {showHeader ? <Header /> : null}
      {children}
      {showFooter ? <Footer /> : null}
      <AndroidDownloadPrompt />
      {showSignIn && (
        <div
          className="sign-in-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeSignIn}
        >
          <SignIn onSignIn={() => void login()} onModalClose={closeSignIn} disabled={isLoading} />
        </div>
      )}
    </>
  );
};

export default AppLayout;
