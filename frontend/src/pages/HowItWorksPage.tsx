import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

const steps = [
  ["01", "Pi Identity", "Sign in with Pi to access your SMAJ account.", AccountCircleOutlinedIcon],
  ["02", "Discover", "Find products in Store or work opportunities in Jobs.", SearchOutlinedIcon],
  ["03", "Transact", "Confirm the details and use the available Pi payment flow.", PaymentsOutlinedIcon],
  ["04", "Complete Exchange", "Deliver the goods or complete the agreed work.", ChatOutlinedIcon],
  ["05", "Build Trust", "Expanded reviews and reputation tools are planned.", VerifiedUserOutlinedIcon],
  ["06", "Repeat", "Return for your next purchase, sale, or work opportunity.", ArrowForwardOutlinedIcon],
] as const;

const phoneItems = ["Pi Login", "SMAJ Store", "SMAJ PI Jobs", "Pi Payment"];

const HowItWorksPage = () => {
  return (
    <AppLayout>
      <main className="home-page how-company-page">
        <section className="home-hero how-company-hero">
          <div>
            <span className="home-kicker">HOW SMAJ PI HUB WORKS</span>
            <h1>Discover, transact, and build practical Pi utility.</h1>
            <p>
              SMAJ PI HUB connects commerce and work through a shared Pi experience. Start with your Pi identity,
              discover an opportunity, exchange value, and return as the economy grows.
            </p>
            <div className="home-hero-cta">
              <Link to="/services" className="home-hero-primary-btn">
                Explore Services
              </Link>
              <Link to="/services/store" className="home-hero-secondary-btn">
                Open SMAJ Store
              </Link>
            </div>
          </div>
          <aside className="how-phone-mockup" aria-label="Animated SMAJ PI HUB phone flow">
            <div className="how-phone-screen">
              <span>SMAJ PI HUB</span>
              <strong>Commerce and work with Pi</strong>
              <div>
                {phoneItems.map(item => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="home-section how-company-section">
          <div className="home-section-head">
            <span className="home-kicker">USER FLOW</span>
            <h2>The economic loop in six steps.</h2>
          </div>
          <div className="how-step-grid">
            {steps.map(([num, title, description, Icon]) => (
              <article key={num}>
                <span>{num}</span>
                <Icon />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section how-company-section how-company-explain">
          <div>
            <VerifiedUserOutlinedIcon />
            <h2>Trust is part of the flow.</h2>
            <p>
              Pi sign-in and service-status labels are available today. Enhanced seller/provider checks, reputation,
              fraud prevention, dispute workflows, and platform-focused AI assistance remain planned capabilities.
            </p>
          </div>
          <Link to="/white-paper">
            Read White Paper
            <ArrowForwardOutlinedIcon />
          </Link>
        </section>

        <section className="home-section how-company-section how-store-callout">
          <StorefrontOutlinedIcon />
          <div>
            <span className="home-kicker">ECONOMIC FOUNDATION</span>
            <h2>SMAJ Store and SMAJ PI Jobs form the initial foundation.</h2>
            <p>
              Commerce and work demonstrate practical Pi utility before additional services expand with demand and
              readiness.
            </p>
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default HowItWorksPage;
