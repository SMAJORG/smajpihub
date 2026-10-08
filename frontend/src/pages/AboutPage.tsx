import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

const steps = [
  {
    label: "Step 01",
    title: "Mission",
    text: "Contribute to Pi's real utility economy by building a trusted platform where verified people and businesses can buy, sell, work, and access real-world services using Pi.",
  },
  {
    label: "Step 02",
    title: "Vision",
    text: "Build a global economic platform connecting verified people and businesses to trusted commerce, work, and real-world services through one Pi identity and one Pi wallet.",
  },
  {
    label: "Step 03",
    title: "Promise",
    text: "Keep the platform useful, transparent, and service-focused while growing carefully through verification, safety systems, and real marketplace demand.",
  },
];

const reasons = [
  "Digital users are tired of separate accounts, wallets, apps, and repeated verification.",
  "Pi needs real services where people can use it for practical daily activity.",
  "Buyers, sellers, freelancers, providers, and communities need stronger trust signals.",
  "A unified hub can reduce friction while giving each service room to grow.",
];

const services = [
  "Marketplace",
  "Jobs",
  "Health",
  "Education",
  "Housing",
  "Transport",
  "Entertainment",
  "Digital Services",
];

const companyFacts = [
  ["Company Focus", "A trusted economic utility layer for the Pi ecosystem."],
  ["Launch Layer", "SMAJ Store and SMAJ PI Jobs form the initial commerce and work foundation."],
  ["User Access", "One Pi identity and one Pi wallet across connected services."],
  ["Operating Model", "Digital marketplace and service platform. Not a bank or financial institution."],
] as const;

const platformLayers = [
  ["Identity Layer", "Pi login and account signals help reduce fake participation.", VerifiedUserOutlinedIcon],
  [
    "Wallet Layer",
    "Pi wallet access supports native Pi payments and transparent service pricing.",
    AccountBalanceWalletOutlinedIcon,
  ],
  [
    "Marketplace Layer",
    "SMAJ Store and SMAJ PI Jobs connect product discovery and work opportunities. Enhanced reputation and dispute workflows are planned.",
    StorefrontOutlinedIcon,
  ],
  [
    "Service Layer",
    "A long-term modular service architecture expands as demand, trust, and operating capacity support it.",
    AppsOutlinedIcon,
  ],
  [
    "AI Guidance",
    "Platform-focused AI assistance is planned to help users discover services and navigate available features.",
    AutoAwesomeOutlinedIcon,
  ],
  [
    "Trust Layer",
    "Pi access and clear service status support participation today. Enhanced provider checks, reputation, fraud prevention, and dispute workflows are planned.",
    SecurityOutlinedIcon,
  ],
] as const;

const audiences = [
  ["Pioneers", "Use one Pi-powered account to discover services, products, opportunities, and support tools."],
  ["Sellers", "List products, build trust, communicate with buyers, and prepare for Pi-powered commerce flows."],
  [
    "Service Providers",
    "Bring jobs, health, education, transport, housing, events, and other services into one verified hub.",
  ],
  [
    "Partners",
    "Collaborate on infrastructure, merchant onboarding, community growth, compliance, and service expansion.",
  ],
] as const;

const operatingPrinciples = [
  ["Real Utility First", "Every major feature should help people do something useful, not just decorate the product."],
  [
    "Trust Before Scale",
    "Growth must include verification, marketplace safety, provider accountability, and user protection.",
  ],
  ["Clear Service Status", "Live, coming soon, and experimental features should be labeled honestly."],
  ["Local to Global", "The hub starts with practical marketplace needs, then expands into broader global Pi utility."],
] as const;

const trustItems = [
  ["Pi Identity Access", VerifiedUserOutlinedIcon],
  ["Pi Wallet Flow", AccountBalanceWalletOutlinedIcon],
  ["Clear Service Status", CheckCircleOutlineOutlinedIcon],
  ["One Connected Hub", HubOutlinedIcon],
] as const;

const AboutPage = () => {
  return (
    <AppLayout>
      <main className="home-page about-clean-page">
        <section className="home-hero about-hero about-clean-hero">
          <div>
            <span className="home-kicker">ABOUT SMAJ PI HUB</span>
            <h1>Building the economic utility layer for the Pi ecosystem.</h1>
            <p>
              SMAJ PI HUB is building a trusted economic utility layer connecting verified people and businesses to
              commerce, work, and real-world services through one Pi identity and one Pi wallet.
            </p>
            <div className="home-hero-cta">
              <Link to="/services" className="home-hero-primary-btn">
                Explore Services
              </Link>
              <Link to="/white-paper" className="home-hero-secondary-btn">
                Read White Paper
              </Link>
            </div>
          </div>
          <aside className="about-clean-snapshot">
            <HubOutlinedIcon />
            <strong>Commerce, Work, and Real Pi Utility.</strong>
            <span>Marketplace, services, identity, wallet access, and trust systems built around real Pi utility.</span>
          </aside>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">WHO WE ARE</span>
            <h2>A digital infrastructure company for the Pi economy.</h2>
            <p>
              SMAJ PI HUB brings discovery, Pi payments, and marketplace participation into a shared experience. Store
              and Jobs are the initial economic foundation; additional services follow as the model is validated.
            </p>
          </div>
          <div className="about-fact-grid">
            {companyFacts.map(([title, text]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">OUR SIMPLE PLAN</span>
            <h2>Our mission, vision, and commitment.</h2>
          </div>
          <div className="about-step-grid">
            {steps.map(step => (
              <article key={step.title} className="about-step-card">
                <span>{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">HOW THE COMPANY WORKS</span>
            <h2>A modular foundation for practical economic activity.</h2>
            <p>
              The company is building a modular ecosystem. Each service can grow independently, but users still move
              through one familiar SMAJ PI HUB experience.
            </p>
          </div>
          <div className="about-layer-grid">
            {platformLayers.map(([title, text, Icon]) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section about-why-section">
          <div className="home-section-head">
            <span className="home-kicker">WHY WE ARE BUILDING</span>
            <h2>Because real utility needs trust, access, and useful services.</h2>
          </div>
          <div className="about-reason-list">
            {reasons.map(reason => (
              <article key={reason}>
                <CheckCircleOutlineOutlinedIcon />
                <p>{reason}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">WHO WE SERVE</span>
            <h2>Built for users, sellers, providers, and partners.</h2>
          </div>
          <div className="about-audience-grid">
            {audiences.map(([title, text]) => (
              <article key={title}>
                <Diversity3OutlinedIcon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">WHAT WE PROVIDE</span>
            <h2>A growing set of connected services.</h2>
          </div>
          <div className="about-service-strip">
            {services.map(service => (
              <span key={service}>
                {service === "Marketplace" ? <StorefrontOutlinedIcon /> : <AppsOutlinedIcon />}
                {service}
              </span>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">OPERATING PRINCIPLES</span>
            <h2>The standards guiding the company.</h2>
          </div>
          <div className="about-principle-list">
            {operatingPrinciples.map(([title, text]) => (
              <article key={title}>
                <CheckCircleOutlineOutlinedIcon />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section">
          <div className="home-section-head">
            <span className="home-kicker">TRUST AND SAFETY</span>
            <h2>Built for Trusted Pi Commerce</h2>
            <p>
              The platform direction is built around verified participation, clearer service flow, and trusted
              marketplace behavior.
            </p>
          </div>
          <div className="about-trust-grid">
            {trustItems.map(([title, Icon]) => (
              <article key={title}>
                <Icon />
                <strong>{title}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section about-clean-section about-company-status">
          <div>
            <span className="home-kicker">COMPANY STATUS</span>
            <h2>Focused rollout, honest status.</h2>
            <p>
              SMAJ PI HUB is under active development. Store and Jobs form the initial economic foundation. Expansion
              follows validated demand, stronger trust, country readiness, and partner participation.
            </p>
          </div>
          <div className="about-status-grid">
            <article>
              <StorefrontOutlinedIcon />
              <strong>Commerce and Work</strong>
              <span>Store and Jobs connect buyers, sellers, talent, and employers.</span>
            </article>
            <article>
              <PaymentsOutlinedIcon />
              <strong>Pi Utility</strong>
              <span>Pi login, Pi wallet access, Pi-denominated service flows.</span>
            </article>
            <article>
              <GavelOutlinedIcon />
              <strong>Clear Disclaimer</strong>
              <span>Digital marketplace platform, not banking or investment advice.</span>
            </article>
            <article>
              <PublicOutlinedIcon />
              <strong>Global Direction</strong>
              <span>Designed to grow with local services, providers, and Pi communities.</span>
            </article>
          </div>
        </section>

        <section className="home-section about-clean-section about-final-cta">
          <span className="home-kicker">SMAJ PI HUB</span>
          <h2>Take Part in the Pi Utility Economy</h2>
          <div className="home-hero-cta">
            <Link to="/services" className="home-hero-primary-btn">
              Explore Services
            </Link>
            <Link to="/contact" className="home-hero-secondary-btn">
              Contact SMAJ
            </Link>
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default AboutPage;
