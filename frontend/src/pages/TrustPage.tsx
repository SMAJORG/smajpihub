import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import BalanceOutlinedIcon from "@mui/icons-material/BalanceOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

const trustLayers = [
  ["Pi Identity", "Users enter through Pi-first identity access where supported.", VerifiedUserOutlinedIcon],
  [
    "Seller / Provider Checks",
    "Planned: enhanced business and professional verification. Pi account access alone does not guarantee provider reliability.",
    CheckCircleOutlineOutlinedIcon,
  ],
  [
    "Wallet Awareness",
    "Pi wallet flows are designed to keep users aware of payment actions and service status.",
    AccountBalanceWalletOutlinedIcon,
  ],
  [
    "Marketplace Safety",
    "Planned: expanded reputation, fraud monitoring, and dispute workflows. Use current support channels for help.",
    SecurityOutlinedIcon,
  ],
] as const;

const policies = [
  "SMAJ PI HUB is a digital marketplace and service platform, not a bank or investment company.",
  "Service availability, payment flows, and roadmap timing may change. A SMAJ token is deferred and is outside the current launch plan.",
  "Users, sellers, and partners are responsible for complying with laws in their own jurisdictions.",
  "The platform will continue improving verification, fraud prevention, data protection, and service review processes.",
];

const TrustPage = () => (
  <AppLayout>
    <main className="home-page trust-company-page">
      <section className="home-hero trust-company-hero">
        <div>
          <span className="home-kicker">TRUST & SAFETY</span>
          <h1>Built for Trusted Pi Commerce</h1>
          <p>
            SMAJ PI HUB is designed to make Pi-powered services easier to use while keeping trust, user awareness,
            marketplace safety, and honest status at the center of the product.
          </p>
          <div className="home-hero-cta">
            <Link to="/white-paper" className="home-hero-primary-btn">
              Read White Paper
            </Link>
            <Link to="/contact" className="home-hero-secondary-btn">
              Report / Contact
            </Link>
          </div>
        </div>
        <aside className="trust-hero-card">
          <SecurityOutlinedIcon />
          <strong>Trust before scale</strong>
          <span>Verification, safety logic, user support, and transparent service status.</span>
        </aside>
      </section>

      <section className="home-section trust-company-section">
        <div className="home-section-head">
          <span className="home-kicker">TRUST LAYERS</span>
          <h2>How safety is designed into the platform.</h2>
        </div>
        <div className="trust-layer-grid">
          {trustLayers.map(([title, text, Icon]) => (
            <article key={title}>
              <Icon />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section trust-company-section trust-policy-panel">
        <div>
          <BalanceOutlinedIcon />
          <h2>Clear company position.</h2>
          <p>
            SMAJ PI HUB facilitates digital marketplace and service experiences. It does not promise profits, provide
            banking services, act as a custodian, or provide investment advice.
          </p>
        </div>
        <ul>
          {policies.map(policy => (
            <li key={policy}>
              <GavelOutlinedIcon />
              {policy}
            </li>
          ))}
        </ul>
      </section>
    </main>
  </AppLayout>
);

export default TrustPage;
