import { useState, type FormEvent } from "react";
import AppLayout from "../layouts/AppLayout";
import { axiosClient } from "../lib/axiosClient";
import "./delete-account.css";

const DeleteAccountPage = () => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setError("");

    try {
      await axiosClient.post("/support", {
        source: "account-deletion",
        topic: "Account deletion request",
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        message: [
          "Public account and associated data deletion request.",
          `Pi username: ${String(form.get("pi-username") || "").trim()}`,
          `Request details: ${String(form.get("details") || "").trim() || "Please contact me to verify ownership and proceed."}`,
        ].join("\n"),
      });
      formElement.reset();
      setSubmitted(true);
    } catch {
      setError("We couldn't submit your request. Please try again or email contact@smajpihub.com.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <main className="delete-account-page">
        <div className="delete-account-container">
          <header className="delete-account-header">
            <span className="delete-account-kicker">SMAJ PI HUB ACCOUNT</span>
            <h1>Request account deletion</h1>
            <p>
              Use this form to ask us to delete your SMAJ PI HUB account and associated data. You can submit a request
              here without signing in or reinstalling the app.
            </p>
          </header>

          <section className="delete-account-panel" aria-labelledby="delete-request-heading">
            <div>
              <span className="delete-account-kicker">DELETION REQUEST</span>
              <h2 id="delete-request-heading">Tell us which account to remove</h2>
              <p>
                We’ll review your request and verify account ownership before taking action. Don’t include your
                password, Pi wallet passphrase, or other authentication secrets.
              </p>
            </div>
            {submitted ? (
              <div className="delete-account-notice success" role="status">
                Your request has been submitted to the SMAJ PI HUB support team. We’ll contact you at the email
                provided if we need information to verify the account.
              </div>
            ) : null}
            {error ? (
              <div className="delete-account-notice error" role="alert">
                {error}
              </div>
            ) : null}
            <form className="delete-account-form" onSubmit={handleSubmit}>
              <label>
                <span>Your name</span>
                <input name="name" type="text" autoComplete="name" maxLength={100} required />
              </label>
              <label>
                <span>Contact email</span>
                <input name="email" type="email" autoComplete="email" maxLength={120} required />
              </label>
              <label>
                <span>Pi username</span>
                <input
                  name="pi-username"
                  type="text"
                  autoComplete="username"
                  maxLength={100}
                  placeholder="The username connected to your account"
                  required
                />
              </label>
              <label>
                <span>Additional details <small>(optional)</small></span>
                <textarea
                  name="details"
                  rows={4}
                  maxLength={1000}
                  placeholder="Anything that will help us identify the account or process your request."
                />
              </label>
              <button type="submit" disabled={submitting}>
                {submitting ? "Submitting request…" : "Submit deletion request"}
              </button>
              <small className="delete-account-form-note">
                This form sends your request to our support team for review. It does not immediately delete your
                account.
              </small>
            </form>
          </section>

          <section className="delete-account-info" aria-labelledby="deletion-process-heading">
            <h2 id="deletion-process-heading">What happens next</h2>
            <ol>
              <li>We review the request and may contact you to verify that you own the account.</li>
              <li>After verification, we process deletion of the account and associated data.</li>
              <li>
                We aim to complete verified requests within 30 days. If verification or a legal requirement delays
                completion, we’ll explain the next steps.
              </li>
            </ol>
          </section>

          <section className="delete-account-info" aria-labelledby="data-deletion-heading">
            <h2 id="data-deletion-heading">Data deleted and data retained</h2>
            <p>
              We delete or de-identify personal account and profile information and account-linked content where it
              can be removed without affecting other users or records that must be kept. This can include profile
              details, preferences, and content you submitted to SMAJ PI HUB.
            </p>
            <p>
              We may retain limited transaction, payment, tax, fraud-prevention, security, or dispute records when
              needed for legal compliance or legitimate safety purposes. Financial records may need to be retained
              for up to 7 years where applicable accounting or tax rules require it; the required period varies by
              jurisdiction and record type. Any retained information is restricted to that purpose and kept only for
              the applicable period. Request details are used to verify and process your request and are then
              deleted or minimized unless a legal obligation requires otherwise.
            </p>
            <p>
              See our <a href="/privacy">Privacy Policy</a> for more information. Questions can also be sent to{" "}
              <a href="mailto:contact@smajpihub.com">contact@smajpihub.com</a>.
            </p>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};

export default DeleteAccountPage;
