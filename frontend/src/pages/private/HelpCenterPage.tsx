import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { isAxiosError } from "axios";
import { axiosClient } from "../../lib/axiosClient";

type HelpArticle = { title: string; summary: string; steps: string[]; action?: { label: string; to: string } };

const categories: { title: string; articles: HelpArticle[] }[] = [
  { title: "Getting Started", articles: [
    { title: "Create your account", summary: "Your Pi account is used to create your SMAJ PI HUB profile.", steps: ["Open SMAJ PI HUB in Pi Browser.", "Confirm your Pi identity when prompted.", "Add your display name and country in Profile."], action: { label: "Open Profile", to: "/profile" } },
    { title: "Use SMAJ PI HUB", summary: "Use the five tabs at the bottom to move between the main areas.", steps: ["Home shows your activity and discoveries.", "Services opens Store and other SMAJ services.", "Messages keeps buyer and seller conversations together."], action: { label: "Open Home", to: "/dashboard" } },
    { title: "Explore services", summary: "Services are grouped by what you want to do, such as Store, Transport, Food, Stream, and Sports.", steps: ["Open Services from the bottom navigation.", "Choose a service card to explore it.", "Use the Store for marketplace products."], action: { label: "Open Services", to: "/app/services" } },
    { title: "Complete your profile", summary: "A complete profile helps buyers and sellers recognise who they are dealing with.", steps: ["Add a profile photo and display name.", "Add your country and contact details.", "Submit verification details when available."], action: { label: "Complete Profile", to: "/profile" } },
  ] },
  { title: "Marketplace Help", articles: [
    { title: "Buy a product", summary: "Check the listing details and seller before adding an item to your cart.", steps: ["Open the product and review photos, price, and location.", "Add it to cart and confirm the quantity.", "Complete Pi payment, then follow the order timeline."], action: { label: "Open Store", to: "/store" } },
    { title: "Sell a product", summary: "Seller tools let you add products, manage incoming orders, and review marketplace activity.", steps: ["Open Seller Dashboard from your profile.", "Create a complete listing with real photos and price.", "Keep stock and delivery status up to date."], action: { label: "Open Seller Tools", to: "/seller" } },
    { title: "Product safety", summary: "Only pay through the in-app Pi payment flow and keep important decisions in SMAJ messages.", steps: ["Review seller details and product information.", "Never share your password, wallet passphrase, or private keys.", "Report suspicious listings before paying."], action: { label: "Report an issue", to: "/app/help-center" } },
    { title: "Contact a seller", summary: "Messages keeps each product conversation connected to the relevant seller.", steps: ["Open the product listing.", "Choose Message Seller.", "Keep delivery and product questions in that conversation."], action: { label: "Open Messages", to: "/messages" } },
  ] },
  { title: "Wallet & Payments", articles: [
    { title: "Payment pending", summary: "A pending payment means SMAJ PI HUB is waiting for confirmation from Pi Browser.", steps: ["Return to Pi Browser and check for the payment request.", "Confirm the amount and seller before approving.", "Return to your order and wait for the status to refresh."], action: { label: "Open Orders", to: "/orders" } },
    { title: "Check a transaction", summary: "Your order page shows the payment state and the next delivery step.", steps: ["Open Orders from your profile or the Store.", "Select the purchase you want to review.", "Use Track Order for the latest status."], action: { label: "View Orders", to: "/orders" } },
    { title: "Payment issue", summary: "Do not pay a seller outside the in-app checkout if an order payment has a problem.", steps: ["Check whether the order is pending, paid, or failed.", "Refresh the order after returning from Pi Browser.", "Send a support request with the order ID if it does not update."], action: { label: "Open Orders", to: "/orders" } },
  ] },
  { title: "Account & Security", articles: [
    { title: "Protect your account", summary: "Your Pi credentials and wallet recovery information must stay private.", steps: ["Never share a password, passphrase, or verification code.", "Use only SMAJ PI HUB pages inside Pi Browser.", "Sign out on shared devices."], action: { label: "Open Settings", to: "/settings" } },
    { title: "Privacy settings", summary: "Choose how your marketplace profile and contact details are shared.", steps: ["Open Profile or Settings.", "Review public profile and contact options.", "Save after changing a setting."], action: { label: "Open Settings", to: "/settings" } },
    { title: "Report suspicious activity", summary: "Report suspicious listings, messages, or account behaviour as soon as you see it.", steps: ["Do not send payment or personal details.", "Keep the listing or conversation available for review.", "Send a report with clear details."], action: { label: "Send a report", to: "/app/help-center" } },
  ] },
];

const HelpCenterPage = () => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("Account support");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [helpful, setHelpful] = useState<Record<string, "yes" | "no">>({});
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories.map((category) => ({ ...category, articles: category.articles.filter((article) => !query || [article.title, article.summary, ...article.steps].join(" ").toLowerCase().includes(query)) })).filter((category) => category.articles.length);
  }, [search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(false);
    setError("");
    if (message.trim().length < 10) {
      setError("Please write at least 10 characters so support can understand the issue.");
      return;
    }
    setSubmitting(true);
    try {
      await axiosClient.post("/support", { source: "private-help-center", topic, email: email.trim(), message: message.trim() });
      setSubmitted(true);
      setMessage("");
      setEmail("");
    } catch (err: unknown) {
      setError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || "Could not submit support request." : "Could not submit support request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="private-page help-center-page">
      <section className="help-hero">
        <p className="private-kicker">SMAJ PI HUB SUPPORT</p>
        <h1>How can we help you?</h1>
        <label><SearchOutlinedIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search help articles..." /></label>
      </section>

      <section className="help-accordion">
        {filtered.map((category) => (
          <article key={category.title}>
            <h2>{category.title}</h2>
            {category.articles.map((article) => {
              const articleId = `${category.title}-${article.title}`;
              const isOpen = open === articleId;
              return <div key={article.title}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : articleId)}>
                  <span>{article.title}</span>
                  <ExpandMoreOutlinedIcon />
                </button>
                {isOpen ? <div className="help-article-content"><p>{article.summary}</p><ol>{article.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="help-article-footer">{article.action ? <Link to={article.action.to}>{article.action.label}</Link> : null}<span>Was this helpful?<button type="button" className={helpful[articleId] === "yes" ? "active" : ""} onClick={() => setHelpful((current) => ({ ...current, [articleId]: "yes" }))}>Yes</button><button type="button" className={helpful[articleId] === "no" ? "active" : ""} onClick={() => setHelpful((current) => ({ ...current, [articleId]: "no" }))}>No</button></span></div></div> : null}
              </div>;
            })}
          </article>
        ))}
      </section>

      <section className="support-form-section">
        <div>
          <p className="private-kicker">CONTACT SUPPORT</p>
          <h2>Send feedback or report an issue</h2>
          <p>Your message is saved to the SMAJ PI HUB support queue with your signed-in account, topic, and timestamp.</p>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>Topic<select value={topic} onChange={(event) => setTopic(event.target.value)}><option>Account support</option><option>Marketplace</option><option>Wallet and payment</option><option>Safety report</option><option>Feedback</option></select></label>
          <label>Reply email optional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@smajpihub.com" /></label>
          <label>Message<textarea required maxLength={1500} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what happened, what page you were on, and what you expected." /><small className="form-help">{message.length}/1500 characters</small></label>
          {submitted ? <div className="private-alert success">Support request submitted.</div> : null}
          {error ? <div className="private-alert error">{error}</div> : null}
          <button className="private-primary-button" disabled={submitting}>{submitting ? "Submitting..." : "Submit Message"}</button>
        </form>
      </section>
    </main>
  );
};

export default HelpCenterPage;
