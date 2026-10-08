import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { serviceCatalog, getServiceLaunchStatus } from "../content/serviceCatalog";
import { useEventTracking } from "../hooks/useEventTracking";

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  linkToContact?: boolean;
};

const faqItems: FaqItem[] = [
  {
    id: "what-is-smaj",
    question: "What is SMAJ PI HUB?",
    answer:
      "SMAJ PI HUB is building a trusted economic utility layer for the Pi ecosystem. It connects verified people and businesses to commerce, work, and real-world services through one Pi identity and one Pi wallet.",
  },
  {
    id: "pi-browser",
    question: "Do I need Pi Browser to login?",
    answer:
      "Yes. Login with Pi requires Pi Browser because the Pi SDK is available there. If you open the website in another browser, the site will show a message asking you to continue in Pi Browser.",
  },
  {
    id: "official-pi",
    question: "Is SMAJ PI HUB the official Pi Network?",
    answer:
      "SMAJ PI HUB is an independent Pi-powered application concept and service platform. It uses Pi identity and wallet utility where supported, but it is not the official Pi Network organization.",
  },
  {
    id: "what-live",
    question: "What is live now?",
    answer: `Services currently labeled live are ${serviceCatalog
      .filter(service => getServiceLaunchStatus(service.slug) === "live")
      .map(service => service.name)
      .join(
        ", "
      )}. Store and Jobs form the initial economic foundation. See the Services page for current availability; additional modules expand in phases.`,
  },
  {
    id: "payments",
    question: "How will Pi payments work?",
    answer:
      "The product direction is to use Pi wallet flows for supported service transactions, with clear pricing, confirmation, reviews, and marketplace safety steps where available.",
  },
  {
    id: "token",
    question: "Is SMAJ Token live?",
    answer:
      "No. A potential SMAJ token is deferred and is not part of the current core strategy or launch plan. Any future token would require a clear user need, credible purpose, safeguards, feasibility, and a separate decision.",
  },
  {
    id: "sellers",
    question: "How can sellers or service providers join?",
    answer:
      "Sellers, providers, merchants, and partners can contact SMAJ PI HUB for onboarding interest. The company direction includes provider checks, service status, and trust controls before wider rollout.",
    linkToContact: true,
  },
  {
    id: "trust",
    question: "How does SMAJ PI HUB handle trust and safety?",
    answer:
      "Pi sign-in and clear service-status labels support access today. Enhanced seller/provider checks, reputation, fraud monitoring, and in-platform dispute workflows are planned. Contact the team for current support.",
  },
  {
    id: "finance",
    question: "Is SMAJ PI HUB a bank or investment platform?",
    answer:
      "No. SMAJ PI HUB is a digital marketplace and service platform. It does not provide banking services, custody, investment advice, or profit guarantees.",
  },
  {
    id: "support",
    question: "How do I get support?",
    answer:
      "Use the contact page or email info@smajpihub.com for support, partnerships, provider onboarding, or company inquiries.",
    linkToContact: true,
  },
];

const FaqPage = () => {
  const [openId, setOpenId] = useState<string>(faqItems[0]?.id ?? "");
  const trackEvent = useEventTracking();

  const toggleItem = (id: string) => {
    setOpenId(current => {
      const next = current === id ? "" : id;
      trackEvent({ event: "faq_toggle", payload: { faq_id: id, is_open: next === id } });
      return next;
    });
  };

  return (
    <AppLayout>
      <main className="home-page">
        <section className="home-hero">
          <span className="home-kicker">HELP CENTER</span>
          <h1>Frequently Asked Questions</h1>
          <p>Quick answers to help you start, explore services, and get support.</p>
        </section>

        <section className="home-section">
          <div className="faq-list" role="list">
            {faqItems.map(item => {
              const isOpen = openId === item.id;
              return (
                <article key={item.id} className="faq-item" role="listitem">
                  <button
                    type="button"
                    className="faq-question"
                    aria-expanded={isOpen}
                    onClick={() => toggleItem(item.id)}
                  >
                    {item.question}
                  </button>
                  {isOpen ? (
                    <div className="faq-answer">
                      <p>{item.answer}</p>
                      {item.linkToContact ? (
                        <Link
                          to="/contact"
                          onClick={() => trackEvent({ event: "faq_contact_cta_click", payload: { source: "faq" } })}
                        >
                          Contact Support
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppLayout>
  );
};

export default FaqPage;
