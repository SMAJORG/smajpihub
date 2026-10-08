import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import BusinessCenterOutlinedIcon from "@mui/icons-material/BusinessCenterOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

const partnerTypes = [
  [
    "Sellers & Merchants",
    "Product sellers, store operators, and local merchants preparing for Pi-powered marketplace access.",
    StorefrontOutlinedIcon,
  ],
  [
    "Service Providers",
    "Health, education, transport, housing, events, agriculture, utility, and digital service providers.",
    BusinessCenterOutlinedIcon,
  ],
  [
    "Community Partners",
    "Pi communities, ambassadors, local growth teams, and ecosystem organizers.",
    HandshakeOutlinedIcon,
  ],
  [
    "Infrastructure Partners",
    "Technology, compliance, logistics, support, and integration partners.",
    VerifiedUserOutlinedIcon,
  ],
] as const;

const onboardingSteps = [
  "Submit company, seller, or provider interest.",
  "Share service category, location, capacity, and verification details.",
  "Review marketplace fit, trust requirements, and rollout phase.",
  "Prepare listings, provider profile, support process, and launch readiness.",
];

const PartnersPage = () => {
  return (
    <AppLayout>
      <main className="home-page partner-company-page">
        <section className="home-hero partner-company-hero">
          <div>
            <span className="home-kicker">PARTNERS & PROVIDERS</span>
            <h1>Help build real Pi utility with SMAJ PI HUB.</h1>
            <p>
              Help build a trusted economic utility layer for the Pi ecosystem. Merchants, employers, providers, and
              infrastructure partners can support commerce, work, and country-by-country service expansion.
            </p>
            <div className="home-hero-cta">
              <Link to="/contact" className="home-hero-primary-btn">
                Apply / Contact
              </Link>
              <Link to="/services" className="home-hero-secondary-btn">
                View Services
              </Link>
            </div>
          </div>
          <aside className="partner-hero-card">
            <HandshakeOutlinedIcon />
            <strong>Partner-ready ecosystem</strong>
            <span>Commerce and work first, followed by services as demand and readiness grow.</span>
          </aside>
        </section>

        <section className="home-section partner-company-section">
          <div className="home-section-head">
            <span className="home-kicker">WHO CAN JOIN</span>
            <h2>Partner categories we are preparing for.</h2>
          </div>
          <div className="partner-type-grid">
            {partnerTypes.map(([title, text, Icon]) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section partner-company-section partner-onboarding-panel">
          <div>
            <span className="home-kicker">ONBOARDING</span>
            <h2>A careful process before scale.</h2>
            <p>
              The platform should grow with trust. Provider participation will be reviewed based on service fit,
              readiness, verification, and user safety.
            </p>
          </div>
          <ol>
            {onboardingSteps.map(step => (
              <li key={step}>
                <CheckCircleOutlineOutlinedIcon />
                {step}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </AppLayout>
  );
};

export default PartnersPage;
