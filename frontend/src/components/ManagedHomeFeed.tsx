import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import { homeSectionDefaults } from "../content/homeContentDefaults";
import { useSiteContent, type ContentCard, type HomeSection } from "../lib/siteContent";
import { serviceCatalog, getServiceLaunchLabel, serviceAppPath } from "../content/serviceCatalog";
import ServiceArt from "./ServiceArt";
export type HomeEntry = { id: string; content?: ReactNode };
export function SuggestedServices() {
  const { services } = useSiteContent();
  const sorted = [...serviceCatalog].sort(
    (a, b) =>
      (services.find(s => s.slug === a.slug)?.order ?? serviceCatalog.indexOf(a)) -
      (services.find(s => s.slug === b.slug)?.order ?? serviceCatalog.indexOf(b))
  );
  const groups = Array.from({ length: Math.ceil(sorted.length / 3) }, (_, i) => sorted.slice(i * 3, i * 3 + 3));
  return (
    <div className="mobile-service-groups">
      {groups.map((group, i) => (
        <div className="mobile-service-group" key={i}>
          {group.map(service => {
            const configured = services.find(s => s.slug === service.slug);
            return (
              <Link to={serviceAppPath(service.slug)} className="mobile-service-app" key={service.slug}>
                <ServiceArt index={service.atlasIndex} />
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.items.slice(0, 2).join(" - ")}</span>
                  <small className="rating">{getServiceLaunchLabel(service.slug)}</small>
                  {configured?.status === "in-progress" ? (
                    <progress max={100} value={configured.progress} aria-label={service.name + " progress"} />
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
function Card({ card, sports, trust }: { card: ContentCard; sports: boolean; trust: boolean }) {
  const body = (
    <>
      {card.image ? <img className="managed-card-image" src={card.image} alt="" /> : null}
      <div className="managed-card-copy">
        {card.serviceSlug ? (
          <ServiceArt index={serviceCatalog.find(service => service.slug === card.serviceSlug)?.atlasIndex ?? 0} />
        ) : card.icon ? (
          <img className="managed-card-icon" src={card.icon} alt="" />
        ) : trust ? (
          <VerifiedUserOutlinedIcon />
        ) : null}
        {card.badge ? <b>{card.badge}</b> : null}
        <h3>{card.title}</h3>
        {sports && (card.homeName || card.awayName) ? (
          <>
            <p>{card.competition}</p>
            <div className="managed-score">
              <span>
                {card.homeIcon ? <img src={card.homeIcon} alt="" /> : null}
                {card.homeName}
              </span>
              <strong>
                {card.homeScore || "0"} : {card.awayScore || "0"}
              </strong>
              <span>
                {card.awayIcon ? <img src={card.awayIcon} alt="" /> : null}
                {card.awayName}
              </span>
            </div>
          </>
        ) : null}
        <p>{card.text}</p>
      </div>
    </>
  );
  return card.to ? (
    <Link className="managed-content-card" to={card.to}>
      {body}
    </Link>
  ) : (
    <article className="managed-content-card">{body}</article>
  );
}
export function ManagedHomeSection({
  section,
  children,
  compact = true,
}: {
  section: HomeSection;
  children?: ReactNode;
  compact?: boolean;
}) {
  if (!section.visible) return null;
  const custom = section.mode === "custom";
  return (
    <section
      className={(compact ? "mobile-feed-section" : "desktop-feed-section") + " managed-home-section"}
      data-home-section={section.id}
    >
      <div className={compact ? "mobile-section-heading" : "desktop-feed-section-head"}>
        <div>
          {section.title ? <h2>{section.title}</h2> : null}
          {section.subtitle ? <p>{section.subtitle}</p> : null}
        </div>
        {section.to ? <Link to={section.to}>See all</Link> : null}
      </div>
      {custom ? (
        <div className={"managed-content-strip " + (section.id === "trust" ? "managed-trust-strip" : "")}>
          {section.cards.map(card => (
            <Card key={card.id} card={card} sports={section.id === "sports"} trust={section.id === "trust"} />
          ))}
        </div>
      ) : section.id === "suggested" ? (
        <SuggestedServices />
      ) : (
        <div className="managed-live-content">{children}</div>
      )}
    </section>
  );
}
export default function ManagedHomeFeed({ entries, compact = true }: { entries: HomeEntry[]; compact?: boolean }) {
  const { sections } = useSiteContent();
  const byId = new Map(entries.map(entry => [entry.id, entry.content]));
  const all = new Map(homeSectionDefaults.map(section => [section.id, section]));
  sections.forEach(section => all.set(section.id, section));
  return (
    <div className="managed-home-feed">
      {[...all.values()]
        .sort((a, b) => a.order - b.order)
        .map(section => (
          <ManagedHomeSection key={section.id} section={section} compact={compact}>
            {byId.get(section.id)}
          </ManagedHomeSection>
        ))}
    </div>
  );
}
