import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Tooltip from "@mui/material/Tooltip"; // Import Tooltip
import InstagramIcon from "@mui/icons-material/Instagram";
import XIcon from "@mui/icons-material/X";
import YouTubeIcon from "@mui/icons-material/YouTube";
import TelegramIcon from "@mui/icons-material/Telegram";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import ArrowUpwardOutlinedIcon from "@mui/icons-material/ArrowUpwardOutlined";
import styles from "./Footer.module.css";
import { useTranslation } from "react-i18next";

const companyEmail = "info@smajpihub.com";

const Footer = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        <div>
          <h4>SMAJ PI HUB</h4>
          <p>{t("footer.description")}</p>
        </div>
        <div>
          <h4>{t("footer.platform")}</h4>
          <Link to="/home">{t("nav.home")}</Link>
          <Link to="/about">{t("nav.about")}</Link>
          <Link to="/services">{t("nav.services")}</Link>
          <Link to="/white-paper">{t("nav.whitePaper")}</Link>
          <Link to="/trust">{t("footer.trust")}</Link>
          <Link to="/company">{t("footer.company")}</Link>
          <Link to="/contact">{t("nav.contact")}</Link>
        </div>
        <div>
          <h4>{t("footer.programs")}</h4>
          <Link to="/affiliate">{t("footer.affiliate")}</Link>
          <Link to="/onboarding">{t("nav.join")}</Link>
          <Link to="/collaborate">{t("footer.collaborate")}</Link>
          <Link to="/partners">{t("footer.partners")}</Link>
          <Link to="/community">{t("footer.community")}</Link>
          <Link to="/developers">{t("footer.developers")}</Link>
        </div>
        <div>
          <h4>{t("footer.keyServices")}</h4>
          <Link to="/services/store">STORE</Link>
          <Link to="/services/jobs">JOBS</Link>
          <Link to="/services/health">HEALTH</Link>
          <Link to="/services/education">EDUCATION</Link>
          <Link to="/services/sports">SPORTS</Link>
          <Link to="/services/stream">STREAM</Link>
          <Link to="/services">{t("footer.viewAll")}</Link>
        </div>
        <div>
          <h4>{t("footer.social")}</h4>
          <a href={`mailto:${companyEmail}`}><MailOutlineOutlinedIcon fontSize="small" />{companyEmail}</a>
          <div className={styles.socialRow} aria-label="Social links">
            <a className={styles.socialIcon} href="https://x.com/smajpihub" aria-label="X" target="_blank" rel="noreferrer">
              <XIcon fontSize="small" />
            </a>
            <a className={styles.socialIcon} href="https://t.me/smajpihub" aria-label="Telegram" target="_blank" rel="noreferrer">
              <TelegramIcon fontSize="small" />
            </a>
            <a className={styles.socialIcon} href="https://instagram.com/smajpihub" aria-label="Instagram" target="_blank" rel="noreferrer">
              <InstagramIcon fontSize="small" />
            </a>
            <a className={styles.socialIcon} href="https://youtube.com/@smajpihub" aria-label="YouTube" target="_blank" rel="noreferrer">
              <YouTubeIcon fontSize="small" />
            </a>
            <a className={styles.socialIcon} href="https://www.tiktok.com/@smajpihub" aria-label="TikTok" target="_blank" rel="noreferrer">
              <MusicNoteOutlinedIcon fontSize="small" />
            </a>
          </div>
        </div>



      </div>

      <div className={styles.footerBottomBar}>
        <div className={styles.poweredBy}>
          <a href="https://smaj.org" className={styles.logoLink} aria-label="SMAJ Ecosystem">
            <img src="/smaj_ecosystem_logo.png" alt="SMAJ Ecosystem Logo" className={styles.logoImg} />
          </a>
          <p className={styles.poweredText}>
            <span>{t("footer.poweredBy")}</span>
          </p>
        </div>

        <div className={styles.legalLinksRow}>
          <Link to="/privacy">{t("footer.privacy")}</Link>
          <span className={styles.legalSeparator}>|</span>
          <Link to="/terms">{t("footer.terms")}</Link>
          <span className={styles.legalSeparator}>|</span>
          <Link to="/cookies">{t("footer.cookies")}</Link>
          <span className={styles.legalSeparator}>|</span>
          <button type="button" className={styles.cookieSettingsButton} onClick={() => window.dispatchEvent(new Event("smaj-cookie-settings-open"))}>Cookie settings</button>
          <span className={styles.legalSeparator}>|</span>
          <Link to="/report-abuse">{t("footer.reportAbuse")}</Link>
          <span className={styles.legalSeparator}>|</span>
          <Link to="/seller-agreement">{t("footer.sellerAgreement")}</Link>
        </div>

        <p className={styles.copyright}>&copy; 2026 SMAJ PI HUB. {t("footer.rights")}</p>

      </div>


      <Tooltip title={t("footer.scrollTop")} placement="left">
        <button
          type="button"
          onClick={scrollToTop}
          className={`${styles.scrollToTop} ${isVisible ? styles.visible : ""}`}
          aria-label="Scroll to top"
        >
          <ArrowUpwardOutlinedIcon />
        </button>
      </Tooltip>
    </footer>
  );
};

export default Footer;
