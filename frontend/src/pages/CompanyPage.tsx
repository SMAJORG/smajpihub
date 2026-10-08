import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import BusinessCenterOutlinedIcon from "@mui/icons-material/BusinessCenterOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";

const officialLinks = [
  ["Email", "info@smajpihub.com", "mailto:info@smajpihub.com"],
  ["X", "@smajpihub", "https://x.com/smajpihub"],
  ["Telegram", "t.me/smajpihub", "https://t.me/smajpihub"],
  ["Instagram", "@smajpihub", "https://instagram.com/smajpihub"],
  ["YouTube", "@smajpihub", "https://www.youtube.com/@SPHcore"],
] as const;

const profileFacts = [
  ["Company Focus", "A trusted economic utility layer for the Pi ecosystem.", HubOutlinedIcon],
  ["Economic Foundation", "SMAJ Store and SMAJ PI Jobs connect commerce and work.", RocketLaunchOutlinedIcon],
  ["Audience", "Pi users, sellers, service providers, partners, and ecosystem communities.", PublicOutlinedIcon],
  ["Position", "Digital marketplace and service platform, not a financial institution.", VerifiedOutlinedIcon],
] as const;

const CompanyPage = () => (
  <AppLayout>
    <main className="home-page company-profile-page">
      <section className="home-hero company-profile-hero">
        <div>
          <span className="home-kicker">COMPANY PROFILE</span>
          <h1>SMAJ PI HUB official company overview.</h1>
          <p>
            SMAJ PI HUB is building a trusted economic utility layer connecting verified people and businesses to
            commerce, work, and real-world services through one Pi identity and one Pi wallet.
          </p>
          <div className="home-hero-cta">
            <Link to="/about" className="home-hero-primary-btn">
              About SMAJ
            </Link>
            <Link to="/white-paper" className="home-hero-secondary-btn">
              White Paper
            </Link>
          </div>
        </div>
        <aside className="company-profile-card">
          <BusinessCenterOutlinedIcon />
          <strong>SMAJ PI HUB</strong>
          <span>The Economic Utility Layer for the Pi Ecosystem</span>
        </aside>
      </section>

      <section className="home-section company-profile-section">
        <div className="company-profile-grid">
          {profileFacts.map(([title, text, Icon]) => (
            <article key={title}>
              <Icon />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section company-profile-section company-official-links">
        <div>
          <span className="home-kicker">OFFICIAL CHANNELS</span>
          <h2>Use only official SMAJ PI HUB contact links.</h2>
          <p>For company, provider, partnership, support, and media inquiries, use the channels below.</p>
        </div>
        <div>
          {officialLinks.map(([label, value, href]) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer" : undefined}
            >
              <MailOutlineOutlinedIcon />
              <span>{label}</span>
              <strong>{value}</strong>
            </a>
          ))}
        </div>
      </section>
    </main>
  </AppLayout>
);

export default CompanyPage;
