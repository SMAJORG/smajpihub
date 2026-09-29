import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useAuthContext } from "../contexts/AuthContext";

type LoginWithPiButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  loadingContent?: ReactNode;
  redirectTo?: string;
};

const LoginWithPiButton = ({ children, disabled, loadingContent, redirectTo, ...props }: LoginWithPiButtonProps) => {
  const { loginWithPi, isPiLoginPending } = useAuthContext();
  const login = () => {
    if (redirectTo) window.sessionStorage.setItem("smaj_post_auth_redirect", redirectTo);
    void loginWithPi();
  };

  return (
    <button type="button" {...props} onClick={login} disabled={disabled || isPiLoginPending}>
      {isPiLoginPending && loadingContent ? loadingContent : children}
    </button>
  );
};

export default LoginWithPiButton;
