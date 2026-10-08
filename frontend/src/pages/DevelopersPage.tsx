import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import ApiOutlinedIcon from "@mui/icons-material/ApiOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import IntegrationInstructionsOutlinedIcon from "@mui/icons-material/IntegrationInstructionsOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";

const developerBlocks = [
  ["Pi Identity Hooks", "Build user flows around Pi-first identity and account access.", HubOutlinedIcon],
  [
    "Service Modules",
    "Prepare modular service experiences that can connect into the hub.",
    IntegrationInstructionsOutlinedIcon,
  ],
  ["API Readiness", "Plan endpoints for listings, profiles, status, search, support, and events.", ApiOutlinedIcon],
  [
    "Trust Standards",
    "Align integrations with verification, safety, privacy, and clear status rules.",
    SecurityOutlinedIcon,
  ],
] as const;

const integrationSteps = [
  "Submit project or integration interest.",
  "Define service category, user flow, and data needs.",
  "Review trust, safety, and Pi wallet requirements.",
  "Prepare sandbox testing and launch readiness plan.",
];

const DevelopersPage = () => {
  return (
    <AppLayout>
      <main className="home-page program-page">
        <section className="home-hero program-hero">
          <div>
            <span className="home-kicker">DEVELOPER PROGRAM</span>
            <h1>Build for the Pi Economic Utility Layer</h1>
            <p>
              Help extend practical Pi commerce and work through useful modules and partner integrations. Public APIs
              and developer tools are planned to expand after the initial economic model is validated.
            </p>
            <div className="home-hero-cta">
              <Link to="/contact" className="home-hero-primary-btn">
                Contact Developer Team
              </Link>
              <Link to="/white-paper" className="home-hero-secondary-btn">
                Read Architecture
              </Link>
            </div>
          </div>
          <aside className="program-hero-card">
            <CodeOutlinedIcon />
            <strong>Planned Developer and API Layer</strong>
            <span>Identity, services, APIs, trust, and modular growth.</span>
          </aside>
        </section>

        <section className="home-section program-section">
          <div className="home-section-head">
            <span className="home-kicker">BUILDING BLOCKS</span>
            <h2>What developers should prepare for.</h2>
          </div>
          <div className="program-card-grid">
            {developerBlocks.map(([title, text, Icon]) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section program-section program-process-panel">
          <div>
            <span className="home-kicker">INTEGRATION FLOW</span>
            <h2>A careful path from idea to module.</h2>
            <p>
              Developer access and public integration tools are planned to expand as Store and Jobs validate the model
              and integration standards become stable.
            </p>
          </div>
          <ol>
            {integrationSteps.map(step => (
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

export default DevelopersPage;
