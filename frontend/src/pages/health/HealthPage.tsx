import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import AppLayout from "../../layouts/AppLayout";
import { getHealthCategories, getHealthProviders, FALLBACK_CATEGORIES, FALLBACK_PROVIDERS } from "../../lib/healthApi";
import type { HealthProvider } from "../../types/health";
import { useHealthBooking } from "../../contexts/HealthBookingContext";
import ProviderCard from "../../components/health/ProviderCard";
import BookingSummary from "../../components/health/BookingSummary";
import HealthHeader from "./HealthHeader";
import "./HealthPage.css";

const FEATURED_STATS = [
  ["80+", "Providers"],
  ["24/7", "Support"],
  ["Pi", "Secure checkout"],
] as const;

const HealthPage = () => {
  const [searchParams] = useSearchParams();
  const [categories, setCategories] = useState<string[]>(() => FALLBACK_CATEGORIES);
  const [providers, setProviders] = useState<HealthProvider[]>(() => FALLBACK_PROVIDERS);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { selectedService } = useHealthBooking();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [cats, initialProviders] = await Promise.all([getHealthCategories(), getHealthProviders()]);
        if (!cancelled) {
          setCategories(cats);
          setProviders(initialProviders);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load providers. Showing saved preview.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProviders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter(provider => {
      const matchesQuery =
        !q ||
        provider.name.toLowerCase().includes(q) ||
        provider.specialty.toLowerCase().includes(q) ||
        provider.location.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === "All" || provider.specialty === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [providers, query, selectedCategory]);

  return (
    <AppLayout showHeader={false} showFooter={false}>
      <main className="health-page">
        <HealthHeader query={query} onQueryChange={setQuery} />

        {/* HEALTH SECTION ENTRY: Choose a health service */}
        <section className="health-section health-entry-choice-section" style={{ padding: "20px 0 10px" }} aria-label="Health service options">
          <div className="health-section-head" style={{ marginBottom: "16px" }}>
            <span className="health-kicker">HEALTH SERVICES</span>
            <h2>Choose a health service</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
            {/* CARD 1: SMAJ Clinic & Doctor Care */}
            <div style={{ padding: "24px", borderRadius: "18px", border: "1px solid rgba(19, 32, 51, 0.12)", background: "#ffffff", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#0d9488", textTransform: "uppercase" }}>General Care</span>
              <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#132033" }}>SMAJ Health & Clinics</h3>
              <p style={{ margin: 0, color: "#5a6675", fontSize: "0.95rem", lineHeight: 1.5 }}>
                General healthcare and outpatient medical services. Consult verified clinics, book doctors, diagnostics, and prescription refills.
              </p>
              <div style={{ marginTop: "auto", paddingTop: "12px" }}>
                <a
                  href="#providers"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#0d9488",
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    padding: "10px 20px",
                    borderRadius: "999px",
                    textDecoration: "none"
                  }}
                >
                  Open Health Services →
                </a>
              </div>
            </div>

            {/* CARD 2: CareRoute */}
            <div style={{ padding: "24px", borderRadius: "18px", border: "2px solid #fee2e2", background: "#ffffff", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 4px 12px rgba(220, 38, 38, 0.08)" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#dc2626", textTransform: "uppercase" }}>Emergency Triage</span>
              <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#132033" }}>CareRoute</h3>
              <p style={{ margin: 0, color: "#5a6675", fontSize: "0.95rem", lineHeight: 1.5 }}>
                Emergency hospital finder and request coordination. Find the right nearby hospital based on your emergency and location.
              </p>
              <div style={{ marginTop: "auto", paddingTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <Link
                  to="/careroute"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#dc2626",
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    padding: "10px 20px",
                    borderRadius: "999px",
                    textDecoration: "none"
                  }}
                >
                  Open CareRoute →
                </Link>
                <Link
                  to="/careroute/hospital-dashboard"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#fef2f2",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    padding: "9px 16px",
                    borderRadius: "999px",
                    textDecoration: "none"
                  }}
                  title="Hospital Staff ER Operations Desk"
                >
                  🏥 Hospital ER Desk
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="general-health-services" className="health-hero">
          <div className="health-hero-copy">
            <span className="health-kicker">SMAJ PI HEALTH</span>
            <h1>Care when you need it.</h1>
            <p>Book appointments with verified doctors, clinics, diagnostics, and pharmacies. Pay securely with Pi.</p>
            <div className="health-search" role="search">
              <SearchOutlinedIcon />
              <input
                type="search"
                placeholder="Search providers, services..."
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
              <Link to="#providers">Find care</Link>
            </div>
          </div>
          <aside className="health-hero-panel" aria-label="Health booking preview">
            <div className="health-popular-card">
              <img
                src="https://images.unsplash.com/photo-1666214280557-f1b5022eb634?auto=format&fit=crop&w=900&q=85"
                alt=""
              />
              <span>Trusted providers</span>
            </div>
            <div className="health-booking-card">
              <div>
                <strong>Easy booking</strong>
                <small>Same-day appointments available</small>
              </div>
              <b>Pi checkout</b>
              <Link to="/dashboard">Open wallet</Link>
            </div>
          </aside>
        </section>

        <section className="health-stats" aria-label="Health overview">
          {FEATURED_STATS.map(([value, label]) => (
            <article key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </section>

        <section id="providers" className="health-section">
          <div className="health-section-head">
            <span className="health-kicker">WHAT YOU CAN BOOK</span>
            <h2>Find care near you.</h2>
            <p>Browse verified providers, check availability, and book appointments in minutes.</p>
          </div>
          <div className="health-category-grid">
            {categories.map(category => (
              <button
                key={category}
                type="button"
                className={`health-category-tile${selectedCategory === category ? " selected" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                <StarOutlinedIcon />
                <span>{category}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="health-section">
          <div className="health-section-head compact">
            <span className="health-kicker">PROVIDERS</span>
            <h2>Start booking.</h2>
          </div>
          {loading ? (
            <div className="health-loading">Loading providers...</div>
          ) : error ? (
            <div className="health-error">
              <p>{error}</p>
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="health-empty">
              <p>No providers match your search.</p>
            </div>
          ) : (
            <div className="health-provider-grid">
              {filteredProviders.map(provider => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          )}
        </section>

        {selectedService ? (
          <BookingSummary
            providerName={selectedService.providerId}
            service={selectedService}
            onCheckout={() => navigate(`/services/health/book/${selectedService.providerId}/${selectedService.id}`)}
          />
        ) : null}
      </main>
    </AppLayout>
  );
};

export default HealthPage;
