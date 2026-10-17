import { createContext, useContext, useEffect, useState } from "react";
import { axiosClient } from "../../lib/axiosClient";
import { uploadImage } from "../../lib/uploadImage";
import { defaultServiceCatalog, getServiceLaunchStatus } from "../../content/serviceCatalog";
import { homeSectionDefaults } from "../../content/homeContentDefaults";
import { publishSiteContent, type SiteContent, type ContentCard, type HomeSection } from "../../lib/siteContent";
import { getStreamCatalog } from "../../lib/streamCatalog";
import { getSportsCatalog } from "../../lib/sportsApi";
import ServiceArt from "../../components/ServiceArt";
import { adPlacements, defaultAdSettings, type AdPlacement } from "../../lib/adPolicy";
import { ManagedHomeSection } from "../../components/ManagedHomeFeed";
import "./AdminHomeContentPage.css";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const blankCard = (): ContentCard => ({
  id: crypto.randomUUID(),
  title: "New card",
  text: "",
  image: "",
  icon: "",
  to: "",
  badge: "",
});
const UploadContext = createContext<(active: boolean) => void>(() => {});
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const uploadState = useContext(UploadContext);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <label className="home-cms-image">
      {label}
      {value ? <img src={value} alt="Preview" /> : null}
      <input value={value} placeholder="HTTPS image URL or /assets/..." onChange={e => onChange(e.target.value)} />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            setError("Choose an image up to 5 MB.");
            return;
          }
          setBusy(true);
          uploadState(true);
          setError("");
          try {
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            onChange(await uploadImage(data, "home-content"));
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Upload failed.");
          } finally {
            setBusy(false);
            uploadState(false);
          }
        }}
      />
      {busy ? <small>Uploading...</small> : null}
      {error ? <small role="alert">{error}</small> : null}
      {value ? (
        <button type="button" onClick={() => onChange("")}>
          Remove image
        </button>
      ) : null}
    </label>
  );
}
function reorder<T>(values: T[], index: number, delta: number) {
  const next = [...values],
    target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
const defaults = (): SiteContent => ({
  services: defaultServiceCatalog.map((s, order) => ({
    slug: s.slug,
    name: s.name,
    description: s.description,
    experience: s.experience,
    items: s.items,
    icon: "",
    status: getServiceLaunchStatus(s.slug),
    progress: 0,
    order,
  })),
  sections: clone(homeSectionDefaults),
});
export default function AdminHomeContentPage() {
  const [uploads, setUploads] = useState(0);
  const [draft, setDraft] = useState<SiteContent>(defaults),
    [revision, setRevision] = useState<string | null>(null),
    [tab, setTab] = useState("sections"),
    [selected, setSelected] = useState("suggested"),
    [slug, setSlug] = useState("store"),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const load = async () => {
    setError("");
    setReady(false);
    try {
      const { data } = await axiosClient.get<{ content: SiteContent; revision: string | null }>("/admin/site-content");
      const base = defaults();
      setDraft({
        ads: data.content.ads || defaultAdSettings,
        services: base.services.map(s => data.content.services.find(v => v.slug === s.slug) || s),
        sections: [
          ...base.sections.map(s => data.content.sections.find(v => v.id === s.id) || s),
          ...data.content.sections.filter(s => !base.sections.some(v => v.id === s.id)),
        ],
      });
      setRevision(data.revision);
      setReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load home content.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const section = draft.sections.find(s => s.id === selected) || draft.sections[0],
    service = draft.services.find(s => s.slug === slug)!;
  const updateSection = (patch: Partial<HomeSection>) =>
    setDraft(d => ({ ...d, sections: d.sections.map(s => (s.id === section.id ? { ...s, ...patch } : s)) }));
  const updateService = (patch: Partial<typeof service>) =>
    setDraft(d => ({ ...d, services: d.services.map(s => (s.slug === slug ? { ...s, ...patch } : s)) }));
  const updateCard = (index: number, patch: Partial<ContentCard>) =>
    updateSection({ cards: section.cards.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const save = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await axiosClient.put<{ content: SiteContent; revision: string }>("/admin/site-content", {
        content: draft,
        revision,
      });
      setDraft(data.content);
      setRevision(data.revision);
      publishSiteContent(data.content);
      setMessage("Home content and shared service branding saved.");
    } catch (reason: any) {
      setError(reason?.response?.data?.message || reason.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  };
  const copyLive = async () => {
    setBusy(true);
    setError("");
    try {
      let cards: ContentCard[] = [];
      if (section.id === "sports") {
        const sports = await getSportsCatalog();
        cards = sports.matches.slice(0, 12).map(m => ({
          ...blankCard(),
          title: m.competition,
          text: [m.minute || m.dateLabel, m.venue].filter(Boolean).join(" - "),
          badge: m.status,
          competition: m.competition,
          homeName: m.home.name,
          awayName: m.away.name,
          homeIcon: m.home.logoUrl || "",
          awayIcon: m.away.logoUrl || "",
          homeScore: String(m.homeScore ?? ""),
          awayScore: String(m.awayScore ?? ""),
          to: "/services/sports",
        }));
        cards.push(
          ...sports.standings
            .slice(0, 3)
            .map(standing => ({
              ...blankCard(),
              title: standing.team.name,
              icon: standing.team.logoUrl || "",
              badge: "Top team",
              text: [
                standing.points + " Points",
                standing.won + " Wins",
                standing.played + " Played",
                standing.team.form.join(" "),
              ].join(String.fromCharCode(10)),
              to: "/services/sports",
            }))
        );
        cards.push(
          ...sports.stories
            .slice(0, 3)
            .map(story => ({
              ...blankCard(),
              title: story.title,
              text: story.summary,
              badge: story.category,
              to: "/services/sports",
            }))
        );
      } else {
        const type = section.id === "series" ? "series" : section.id === "releases" ? "movies" : "trending";
        const result = await getStreamCatalog(type);
        cards = result.results.slice(0, 12).map(item => ({
          ...blankCard(),
          title: item.title,
          text: [item.rating ? String(item.rating) : "", item.releaseDate?.slice(0, 4)].filter(Boolean).join(" - "),
          image: item.backdropUrl || item.posterUrl || "",
          badge: item.mediaType === "tv" ? "SERIES" : "MOVIE",
          to: "/app/services/stream/" + (item.mediaType === "tv" ? "series" : "title") + "/" + item.id,
        }));
      }
      updateSection({ mode: "custom", cards });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not copy live cards.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <UploadContext.Provider value={active => setUploads(n => Math.max(0, n + (active ? 1 : -1)))}>
      <main className="private-page home-cms">
        <fieldset disabled={!ready || busy} style={{ padding: 16, marginBottom: 16 }}>
          <legend>Android test ad placements</legend>
          <p>Only Google test ads are available. Web and Pi Browser remain ad-free. Save changes to publish these switches.</p>
          <label style={{ display: "block" }}>
            <input type="checkbox" checked={draft.ads?.enabled === true} onChange={e => setDraft(d => ({ ...d, ads: { ...(d.ads || defaultAdSettings), enabled: e.target.checked } }))} />
            Enable Android test ads
          </label>
          {(Object.keys(adPlacements) as AdPlacement[]).map(key => <label key={key} style={{ display: "block" }}>
            <input type="checkbox" checked={draft.ads?.placements?.[key] === true} onChange={e => setDraft(d => ({ ...d, ads: { ...(d.ads || defaultAdSettings), placements: { ...d.ads?.placements, [key]: e.target.checked } } }))} />
            {adPlacements[key].label}
          </label>)}
        </fieldset>
        <section className="private-page-head">
          <div>
            <p className="private-kicker">CONTENT &amp; CMS</p>
            <h1>Home &amp; Services</h1>
            <p>Edit home sections and manage service icons once for the whole app.</p>
          </div>
          <div className="home-cms-actions">
            <button
              type="button"
              className="private-secondary-button"
              disabled={busy || uploads > 0}
              onClick={() => {
                if (window.confirm("Reload and discard unsaved changes?")) void load();
              }}
            >
              Reload
            </button>
            <button
              type="button"
              className="private-primary-button"
              disabled={!ready || busy || uploads > 0}
              onClick={() => void save()}
            >
              {busy ? "Working..." : "Save changes"}
            </button>
          </div>
        </section>
        {error ? (
          <div className="private-alert error" role="alert">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="private-alert success" role="status">
            {message}
          </div>
        ) : null}
        <div className="home-cms-actions">
          <button type="button" aria-pressed={tab === "sections"} onClick={() => setTab("sections")}>
            Home sections
          </button>
          <button type="button" aria-pressed={tab === "services"} onClick={() => setTab("services")}>
            Shared service icons &amp; status
          </button>
        </div>
        <fieldset disabled={!ready || busy || uploads > 0}>
          {tab === "services" ? (
            <>
              <label>
                Service
                <select value={slug} onChange={e => setSlug(e.target.value)}>
                  {[...draft.services]
                    .sort((a, b) => a.order - b.order)
                    .map(s => (
                      <option value={s.slug} key={s.slug}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="home-cms-grid">
                <div>
                  <ServiceArt index={defaultServiceCatalog.find(s => s.slug === slug)!.atlasIndex} />
                  <ImageField
                    label="Shared service icon"
                    value={service.icon}
                    onChange={icon => updateService({ icon })}
                  />
                  <p>
                    This icon is shared by service cards, headers and launch screens. Remove the override to use the
                    built-in icon.
                  </p>
                </div>
                <div>
                  <label>
                    Service name
                    <input
                      value={service.name}
                      maxLength={120}
                      onChange={e => updateService({ name: e.target.value })}
                    />
                  </label>
                  <label>
                    Short title
                    <input
                      value={service.experience}
                      maxLength={120}
                      onChange={e => updateService({ experience: e.target.value })}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={service.description}
                      maxLength={300}
                      onChange={e => updateService({ description: e.target.value })}
                    />
                  </label>
                  <label>
                    Categories (one per line)
                    <textarea
                      value={service.items.join("\n")}
                      onChange={e => updateService({ items: e.target.value.split("\n") })}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={service.status}
                      onChange={e => updateService({ status: e.target.value as typeof service.status })}
                    >
                      <option value="live">Live</option>
                      <option value="in-progress">In progress</option>
                      <option value="coming-soon">Coming soon</option>
                    </select>
                  </label>
                  <label>
                    Progress (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={service.progress}
                      onChange={e => updateService({ progress: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Suggested services order
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={service.order}
                      onChange={e => updateService({ order: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="home-cms-actions">
                <label>
                  Section
                  <select value={section.id} onChange={e => setSelected(e.target.value)}>
                    {[...draft.sections]
                      .sort((a, b) => a.order - b.order)
                      .map(s => (
                        <option value={s.id} key={s.id}>
                          {s.title || s.id}
                          {!s.visible ? " (hidden)" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const id = "section-" + Date.now();
                    setDraft(d => ({
                      ...d,
                      sections: [
                        ...d.sections,
                        {
                          id,
                          title: "New section",
                          subtitle: "",
                          to: "",
                          visible: true,
                          mode: "custom",
                          order: d.sections.length,
                          cards: [],
                        },
                      ],
                    }));
                    setSelected(id);
                  }}
                >
                  Add section
                </button>
              </div>
              <div className="home-cms-grid">
                <label>
                  Section title
                  <input
                    value={section.title}
                    maxLength={120}
                    onChange={e => updateSection({ title: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    value={section.subtitle}
                    maxLength={300}
                    onChange={e => updateSection({ subtitle: e.target.value })}
                  />
                </label>
                <label>
                  See all link
                  <input
                    value={section.to}
                    placeholder="/app/services"
                    onChange={e => updateSection({ to: e.target.value })}
                  />
                </label>
                <label>
                  Display order
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={section.order}
                    onChange={e => updateSection({ order: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Content mode
                  <select
                    value={section.mode}
                    onChange={e => updateSection({ mode: e.target.value as HomeSection["mode"] })}
                  >
                    <option
                      value="automatic"
                      disabled={
                        ![
                          "recent",
                          "sellers",
                          "activity",
                          "trust",
                          "suggested",
                          "trending",
                          "series",
                          "releases",
                          "sports",
                        ].includes(section.id)
                      }
                    >
                      Automatic live content
                    </option>
                    <option value="custom">Cards managed by you</option>
                  </select>
                </label>
                <label className="home-cms-checkbox">
                  <input
                    type="checkbox"
                    checked={section.visible}
                    onChange={e => updateSection({ visible: e.target.checked })}
                  />
                  Visible on home
                </label>
              </div>
              <p>
                Change the display order to move this section. Select cards managed by you to edit every image, icon,
                title, label and destination. Automatic mode keeps live data.
              </p>
              {["sports", "trending", "series", "releases"].includes(section.id) ? (
                <button type="button" onClick={() => void copyLive()}>
                  Copy current live cards for editing
                </button>
              ) : null}
              {section.mode === "custom" ? (
                <>
                  <button
                    type="button"
                    disabled={section.cards.length >= 40}
                    onClick={() => updateSection({ cards: [...section.cards, blankCard()] })}
                  >
                    Add card
                  </button>
                  {section.cards.map((card, index) => (
                    <article className="home-cms-card" key={card.id}>
                      <header>
                        <strong>
                          Card {index + 1}: {card.title}
                        </strong>
                        <div className="home-cms-actions">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => updateSection({ cards: reorder(section.cards, index, -1) })}
                          >
                            Move up
                          </button>
                          <button
                            type="button"
                            disabled={index === section.cards.length - 1}
                            onClick={() => updateSection({ cards: reorder(section.cards, index, 1) })}
                          >
                            Move down
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSection({ cards: section.cards.filter((_, i) => i !== index) })}
                          >
                            Remove card
                          </button>
                        </div>
                      </header>
                      <div className="home-cms-grid">
                        <ImageField
                          label="Card image"
                          value={card.image}
                          onChange={image => updateCard(index, { image })}
                        />
                        <label>
                          Use shared service icon
                          <select
                            value={card.serviceSlug || ""}
                            onChange={e => updateCard(index, { serviceSlug: e.target.value })}
                          >
                            <option value="">Custom icon</option>
                            {draft.services.map(service => (
                              <option key={service.slug} value={service.slug}>
                                {service.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <ImageField
                          label="Card icon"
                          value={card.icon}
                          onChange={icon => updateCard(index, { icon })}
                        />
                        <label>
                          Title
                          <input
                            value={card.title}
                            maxLength={180}
                            onChange={e => updateCard(index, { title: e.target.value })}
                          />
                        </label>
                        <label>
                          Text
                          <textarea
                            value={card.text}
                            maxLength={600}
                            onChange={e => updateCard(index, { text: e.target.value })}
                          />
                        </label>
                        <label>
                          Badge or status
                          <input
                            value={card.badge}
                            maxLength={80}
                            onChange={e => updateCard(index, { badge: e.target.value })}
                          />
                        </label>
                        <label>
                          Open page
                          <input
                            value={card.to}
                            placeholder="/store"
                            onChange={e => updateCard(index, { to: e.target.value })}
                          />
                        </label>
                        {section.id === "sports" ? (
                          <>
                            {(["homeName", "awayName", "homeScore", "awayScore", "competition"] as const).map(key => (
                              <label key={key}>
                                {
                                  {
                                    homeName: "Home team",
                                    awayName: "Away team",
                                    homeScore: "Home score",
                                    awayScore: "Away score",
                                    competition: "Competition",
                                  }[key]
                                }
                                <input
                                  value={card[key] || ""}
                                  onChange={e => updateCard(index, { [key]: e.target.value })}
                                />
                              </label>
                            ))}
                            <ImageField
                              label="Home team icon"
                              value={card.homeIcon || ""}
                              onChange={homeIcon => updateCard(index, { homeIcon })}
                            />
                            <ImageField
                              label="Away team icon"
                              value={card.awayIcon || ""}
                              onChange={awayIcon => updateCard(index, { awayIcon })}
                            />
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </>
              ) : null}
              <h2>Section preview</h2>
              <ManagedHomeSection section={section}>
                <p>Live content appears here on the home page.</p>
              </ManagedHomeSection>
            </>
          )}
        </fieldset>
      </main>
    </UploadContext.Provider>
  );
}
