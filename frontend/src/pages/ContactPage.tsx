import type { FormEvent } from "react";
import { axiosClient } from "../lib/axiosClient";
import { useAuthContext } from "../contexts/AuthContext";
import AppLayout from "../layouts/AppLayout";
import BusinessCenterOutlinedIcon from "@mui/icons-material/BusinessCenterOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

const companyEmail = "info@smajpihub.com";
const quickSupportEmail = "smajpihub@gmail.com";

const contactRoutes = [
  ["Support", "Questions about using SMAJ PI HUB, account access, or service navigation.", SupportAgentOutlinedIcon],
  ["Providers", "Sellers, service providers, merchants, and local operators who want to join.", VerifiedUserOutlinedIcon],
  ["Partnerships", "Ecosystem, community, infrastructure, and business collaboration requests.", HandshakeOutlinedIcon],
  ["Company", "Media, legal, compliance, product, and general company inquiries.", BusinessCenterOutlinedIcon],
] as const;

const ContactPage = () => {
  const { showFeedback } = useAuthContext();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await axiosClient.post("/support", {
        source: "contact",
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        topic: String(form.get("topic") || ""),
        message: String(form.get("message") || ""),
      });
      event.currentTarget.reset();
      showFeedback?.({ type: "success", message: "Thanks. Your message has been recorded for the SMAJ PI HUB team." });
    } catch {
      showFeedback?.({ type: "error", message: `Could not send your message. For quick support, email ${quickSupportEmail}.` });
    }
  };

  return (
    <AppLayout>
      <main className="home-page contact-company-page">
        <section className="home-hero contact-company-hero">
          <div>
            <span className="home-kicker">CONTACT SMAJ PI HUB</span>
            <h1>Talk to the team building real Pi utility.</h1>
            <p>
              Contact SMAJ PI HUB for support, seller/provider onboarding, ecosystem partnerships, product feedback,
              media, or company inquiries.
            </p>
          </div>
          <aside className="contact-company-card">
            <EmailOutlinedIcon />
            <strong>{companyEmail}</strong>
            <span>Official company contact email</span>
          </aside>
        </section>

        <section className="home-section contact-company-section">
          <div className="home-section-head">
            <span className="home-kicker">CONTACT ROUTES</span>
            <h2>Send the right message to the right team.</h2>
          </div>
          <div className="contact-route-grid">
            {contactRoutes.map(([title, text, Icon]) => (
              <article key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section contact-company-section contact-grid">
          <form onSubmit={handleSubmit} className="contact-form">
            <div className="contact-form-head">
              <span className="home-kicker">DIRECT MESSAGE</span>
              <h2>Send a Message</h2>
              <p>Tell us who you are, what you need, and how the SMAJ PI HUB team can help.</p>
            </div>
            <div className="contact-field-row">
              <label htmlFor="name">
                <span>Name</span>
                <input id="name" name="name" type="text" placeholder="Your full name" required />
              </label>
              <label htmlFor="email">
                <span>Email</span>
                <input id="email" name="email" type="email" placeholder="you@example.com" required />
              </label>
            </div>
            <label htmlFor="topic">
              <span>Topic</span>
              <select id="topic" name="topic" required defaultValue="">
                <option value="" disabled>Select a topic</option>
                <option>Support</option>
                <option>Seller / Provider onboarding</option>
                <option>Partnership</option>
                <option>Company inquiry</option>
              </select>
            </label>
            <label htmlFor="contact-message">
              <span>Message</span>
              <textarea id="contact-message" name="message" rows={6} placeholder="Write your message here..." required />
            </label>
            <button type="submit">Send Message</button>
          </form>

          <aside className="contact-info-panel">
            <h3>Company Information</h3>
            <p>
              SMAJ PI HUB is a digital marketplace and service platform building real-world utility for the Pi Network
              ecosystem.
            </p>
            <dl>
              <div>
                <dt>Email</dt>
                <dd><a href={`mailto:${companyEmail}`}>{companyEmail}</a></dd>
              </div>
              <div>
                <dt>Office Hours</dt>
                <dd>Monday to Saturday, 9:00 AM to 6:00 PM</dd>
              </div>
              <div>
                <dt>Response Focus</dt>
                <dd>Support, services, onboarding, partnerships, and company inquiries.</dd>
              </div>
            </dl>
          </aside>
        </section>
      </main>
    </AppLayout>
  );
};

export default ContactPage;
