import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useAuthContext } from "../contexts/AuthContext";
import { isCapacitorNative, PI_BROWSER_REQUIRED_MESSAGE, PI_BROWSER_LAUNCH_FAILED_MESSAGE } from "../lib/capacitorPiAuth";
import { Browser } from "@capacitor/browser";
import "./NativeWelcomeGate.css";

const slides = [
  {
    eyebrow: "LEARN. LIVE. CONNECT.",
    title: "Grow through one connected hub.",
    description: "Access education, health, entertainment and more through SMAJ PI HUB.",
    image: "/assets/smaj-pi-login-learn.jpg",
    alt: "Learn, live and connect with SMAJ PI HUB",
    tone: "teal",
  },
  {
    eyebrow: "WORK. LEARN. EARN.",
    title: "Build skills and create opportunity.",
    description: "Find jobs, offer services and grow your business from one account.",
    image: "/assets/smaj-pi-login-work.jpg",
    alt: "Work, learn, earn and grow with SMAJ PI HUB",
    tone: "indigo",
  },
  {
    eyebrow: "SHOP WITH PI",
    title: "Discover products around the world.",
    description: "Browse products, services and local businesses through the SMAJ Store.",
    image: "/assets/smaj-pi-login-shop.jpg",
    alt: "Shop globally with Pi through SMAJ PI HUB",
    tone: "purple",
  },
  {
    eyebrow: "ONE PI IDENTITY",
    title: "One identity. Many possibilities.",
    description: "Connect to real services and opportunities across the SMAJ ecosystem.",
    image: "/assets/smaj-pi-login-identity.jpg",
    alt: "One Pi identity connecting the SMAJ PI HUB ecosystem",
    tone: "gold",
  },
  {
    eyebrow: "THE SMAJ PI HUB",
    title: "Everything you need. One place.",
    description: "Move between everyday services while keeping the same SMAJ account.",
    image: "/assets/smaj-pi-login-ecosystem.jpg",
    alt: "SMAJ PI HUB services connected around one identity",
    tone: "violet",
  },
] as const;

const NativeWelcomeGate = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading, isPiLoginPending, piLoginStage, loginWithPi, authFeedback } = useAuthContext();
  const [activeSlide, setActiveSlide] = useState(0);
  const [installError, setInstallError] = useState("");
  const needsPiBrowser = authFeedback?.type === "error" && [PI_BROWSER_REQUIRED_MESSAGE, PI_BROWSER_LAUNCH_FAILED_MESSAGE].includes(authFeedback.message);
  const openPiBrowserInstall = async () => {
    setInstallError("");
    try {
      await Browser.open({ url: "https://play.google.com/store/apps/details?id=pi.browser" });
    } catch {
      setInstallError("Open Google Play and search for Pi Browser to install it.");
    }
  };
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading || isAuthenticated || !isCapacitorNative()) return;
    const timer = window.setInterval(() => {
      setActiveSlide(current => (current + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, isLoading]);

  if (!isCapacitorNative() || isAuthenticated) return <>{children}</>;

  const slide = slides[activeSlide];
  const changeSlide = (direction: number) => {
    setActiveSlide(current => (current + direction + slides.length) % slides.length);
  };
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) >= 45) changeSlide(distance < 0 ? 1 : -1);
  };

  return (
    <main
      className={`native-welcome native-welcome--${slide.tone}`}
      aria-labelledby="native-welcome-title"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <section className="native-welcome__content">
        <header className="native-welcome__topbar">
          <div className="native-welcome__brand">
            <img src="/logo.png" alt="SMAJ PI HUB" className="native-welcome__logo" />
            <span className="native-welcome__beta">BETA</span>
          </div>
          <div className="native-welcome__progress" aria-label={`Slide ${activeSlide + 1} of ${slides.length}`}>
            {slides.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                className={index === activeSlide ? "active" : index < activeSlide ? "complete" : ""}
                onClick={() => setActiveSlide(index)}
                aria-label={`Show slide ${index + 1}`}
                aria-current={index === activeSlide ? "step" : undefined}
              />
            ))}
          </div>
        </header>

        <article className="native-welcome__slide" key={slide.title}>
          <div className="native-welcome__copy">
            <p className="native-welcome__eyebrow">{slide.eyebrow}</p>
            <h1 id="native-welcome-title">{slide.title}</h1>
            <p>{slide.description}</p>
          </div>
          <figure className="native-welcome__visual">
            <img src={slide.image} alt={slide.alt} draggable={false} />
          </figure>
        </article>

        <div className="native-welcome__actions">
          <div className="native-welcome__signin-label">
            <span className="native-welcome__pi" aria-hidden="true"><img src="/assets/pi-network-logo.png" alt="" width="44" height="44" /></span>
            <div><strong>Continue with Pi</strong><small>Secure sign-in with your Pi identity</small></div>
          </div>
          <button
            type="button"
            className="native-welcome__button"
            onClick={() => { setInstallError(""); void loginWithPi(); }}
            disabled={isLoading}
          >
            {isPiLoginPending ? (
              <><span className="native-welcome__spinner" aria-hidden="true" />{piLoginStage === "verifying" ? "Verifying Pi sign-in…" : "Opening Pi Browser…"}</>
            ) : "Continue with Pi"}
          </button>
          {authFeedback?.type === "error" ? (
            <p className="native-welcome__error" role="alert">{authFeedback.message}</p>
          ) : null}
          {needsPiBrowser ? (
            <button type="button" className="native-welcome__button native-welcome__install" onClick={() => void openPiBrowserInstall()}>
              Install Pi Browser
            </button>
          ) : null}
          {needsPiBrowser && installError ? <p className="native-welcome__error" role="alert">{installError}</p> : null}
          <div className="native-welcome__trust">
            <span>Powered by Pi</span><i aria-hidden="true" /><span>PART OF THE SMAJ ECOSYSTEM</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default NativeWelcomeGate;
