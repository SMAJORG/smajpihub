import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { desktopNavigationLabels } from "./desktopNavigationLabels";

const groups = [
  { id: "platform", label: 0, links: [[4, "/about"], [5, "/how-it-works"], [6, "/white-paper"]] },
  { id: "services", label: 1, links: [[7, "/services/store"], [8, "/services/jobs"], [9, "/services/education"], [10, "/services/health"], [11, "/services"]] },
  { id: "resources", label: 2, links: [[12, "/docs"], [13, "/download"], [14, "/faq"]] },
  { id: "company", label: 3, links: [[15, "/contact"], [16, "/onboarding"], [17, "/partners"]] },
] as const;

export default function DesktopNavigation() {
  const { i18n } = useTranslation();
  const labels = desktopNavigationLabels[i18n.resolvedLanguage?.split("-")[0] || "en"] || desktopNavigationLabels.en;
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const id = useId();
  const location = useLocation();

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const closeOnResize = () => setOpen(null);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", closeOnResize);
    };
  }, []);

  useEffect(() => { setOpen(null); }, [location.key, i18n.resolvedLanguage]);

  const focusLink = (group: string, last = false) => {
    requestAnimationFrame(() => {
      const links = navRef.current?.querySelectorAll<HTMLAnchorElement>(`[data-panel="${group}"] a`);
      links?.[last ? links.length - 1 : 0]?.focus();
    });
  };

  const handleKey = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLButtonElement>("[data-trigger]");
    if (event.key === "Escape" && open) {
      event.preventDefault();
      navRef.current?.querySelector<HTMLButtonElement>(`[data-trigger="${open}"]`)?.focus();
      setOpen(null);
    } else if (trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const group = trigger.dataset.trigger!;
      setOpen(group);
      focusLink(group, event.key === "ArrowUp");
    } else if (trigger && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const triggers = Array.from(navRef.current!.querySelectorAll<HTMLButtonElement>("[data-trigger]"));
      const forward = (event.key === "ArrowRight") !== (i18n.dir() === "rtl");
      const next = triggers[(triggers.indexOf(trigger) + (forward ? 1 : -1) + triggers.length) % triggers.length];
      setOpen(null);
      next.focus();
    } else if (target.closest("[data-panel]") && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const links = Array.from(target.closest("[data-panel]")!.querySelectorAll<HTMLAnchorElement>("a"));
      const current = links.indexOf(target.closest("a")!);
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 :
        (current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links[next]?.focus();
    }
  };

  return (
    <nav className="smaj-desktop-navigation" aria-label="Primary" translate="no" ref={navRef}
      onKeyDown={handleKey} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null);
      }}>
      {groups.map(group => (
        <div className="smaj-desktop-group" key={group.id}>
          <button type="button" className="smaj-desktop-trigger" data-trigger={group.id}
            id={`${id}-${group.id}-trigger`} aria-expanded={open === group.id}
            aria-controls={`${id}-${group.id}-panel`}
            onClick={() => setOpen(open === group.id ? null : group.id)}>
            <span>{labels[group.label]}</span><KeyboardArrowDownIcon aria-hidden="true" />
          </button>
          <div className="smaj-mega-menu" id={`${id}-${group.id}-panel`} data-panel={group.id}
            aria-labelledby={`${id}-${group.id}-trigger`} hidden={open !== group.id}>
            <ul>
              {group.links.map(([label, to]) => <li key={to}>
                <NavLink to={to} onClick={() => setOpen(null)}>
                  {labels[label]}
                </NavLink>
              </li>)}
            </ul>
          </div>
        </div>
      ))}
    </nav>
  );
}
