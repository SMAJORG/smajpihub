import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useAuthContext } from "../contexts/AuthContext";
import { isCapacitorNative } from "../lib/capacitorPiAuth";
import "./NativeWelcomeGate.css";

const slides = [
  {
    eyebrow: "ONE PI IDENTITY",
    title: "Everything you need. One place.",
    description: "Use one Pi identity across every SMAJ PI HUB service.",
    image: "/assets/smaj-mobile-hero-v2.png",
    alt: "SMAJ PI HUB services",
    tone: "violet",
  },
  {
    eyebrow: "SHOP WITH PI",
    title: "Discover products and trusted sellers.",
    description: "Browse the SMAJ Store, manage orders and use supported Pi payments.",
    image: "/assets/smaj-mobile-hero-business.jpg",
    alt: "SMAJ commerce and business services",
    tone: "indigo",
  },
  {
    eyebrow: "WORK AND GROW",
    title: "Find opportunities built around you.",
    description: "Explore jobs, services and tools that connect people with real opportunities.",
    image: "/assets/smaj-mobile-hero-work.jpg",
    alt: "SMAJ jobs and professional opportunities",
    tone: "gold",
  },
  {
    eyebrow: "LEARN AND CONNECT",
    title: "Services for learning and daily life.",
    description: "Move between education, sports, health, food and more from one hub.",
    image: "/assets/smaj-service-atlas.png",
    alt: "SMAJ PI HUB connected service directory",
    tone: "teal",
  },
  {
    eyebrow: "SAME SMAJ ACCOUNT",
    title: "Your world stays connected.",
    description: "Keep your profile, messages and activity connected across Android and Pi Browser.",
    image: "/assets/smaj-android-app-preview.png",
    alt: "SMAJ PI HUB Android application",
    tone: "purple",
  },
] as const;

const NativeWelcomeGate = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading, loginWithPi, authFeedback } = useAuthContext();
  const [activeSlide, setActiveSlide] = useState(0);
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
            <span className="native-welcome__pi" aria-hidden="true">π</span>
            <div><strong>Continue with Pi</strong><small>Secure sign-in with your Pi identity</small></div>
          </div>
          <button
            type="button"
            className="native-welcome__button"
            onClick={() => void loginWithPi()}
            disabled={isLoading}
          >
            {isLoading ? <span className="native-welcome__spinner" aria-hidden="true" /> : null}
            {isLoading ? "Checking your session…" : "Continue with Pi"}
          </button>
          {authFeedback?.type === "error" ? (
            <p className="native-welcome__error" role="alert">{authFeedback.message}</p>
          ) : null}
          <div className="native-welcome__trust">
            <span>Powered by Pi</span><i aria-hidden="true" /><span>Part of the SMAJ ecosystem</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default NativeWelcomeGate;