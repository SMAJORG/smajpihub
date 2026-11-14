import type { CSSProperties } from "react";
import "./SignIn.css";

interface SignInProps {
  onSignIn: () => void;
  onModalClose: () => void;
  disabled?: boolean;
}

const modalStyle: CSSProperties = {
  background: "var(--surface)",
  color: "var(--text)",
  position: "absolute",
  left: "15vw",
  top: "40%",
  width: "70vw",
  minHeight: "25vh",
  border: "1px solid var(--border)",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  padding: "1rem",
  gap: "1rem",
};

const buttonContainerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: "1rem",
};

const SignIn = ({ onSignIn, onModalClose, disabled }: SignInProps) => {
  return (
    <div className="smaj-signin-panel" role="dialog" aria-modal="true" aria-label="Pi sign-in" style={modalStyle}>
      <p style={{ fontWeight: "bold" }}>You need to sign in first.</p>
      <a href="/account-link" onClick={onModalClose} style={{ color: "var(--primary)" }}>Existing account in another Pi app? Connect your identities</a>
      <div style={buttonContainerStyle}>
        <button onClick={onSignIn} disabled={disabled}>
          Login with Pi
        </button>
        <button onClick={onModalClose}>Close</button>
      </div>
    </div>
  );
};

export default SignIn;
