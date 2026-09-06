import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import "./ServiceMobileMenu.css";

export type ServiceMenuItem = {
  label: string;
  to: string;
};

const ServiceMobileMenu = ({
  title,
  items,
  accent = "#6b3fc5",
  tone = "light",
  showHubLink = true,
}: {
  title: string;
  items: ServiceMenuItem[];
  accent?: string;
  tone?: "light" | "dark";
  showHubLink?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="service-mobile-menu" style={{ "--service-menu-accent": accent } as React.CSSProperties}>
      <button
        className="service-mobile-menu-trigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${title} menu`}
        aria-expanded={open}
      >
        <MenuRoundedIcon />
      </button>
      {open
        ? createPortal(
        <div
          className={`service-mobile-menu-layer ${tone === "dark" ? "service-mobile-menu-layer-dark" : ""}`}
          style={{ "--service-menu-accent": accent } as React.CSSProperties}
        >
          <button
            className="service-mobile-menu-overlay"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close service menu"
          />
          <aside className="service-mobile-menu-drawer" aria-label={`${title} navigation`}>
            <header>
              <strong>{title}</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close service menu">
                <CloseRoundedIcon />
              </button>
            </header>
            <nav>
              {items.map(item => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    className={active ? "active" : ""}
                    to={item.to}
                    key={`${item.label}-${item.to}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {showHubLink ? <Link className="service-mobile-menu-hub" to="/app/services" onClick={() => setOpen(false)}>
              <AppsOutlinedIcon /> All SMAJ Services
            </Link> : null}
          </aside>
        </div>,
        document.body
      )
        : null}
    </div>
  );
};

export default ServiceMobileMenu;
