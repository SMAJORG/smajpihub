import { Link } from "react-router-dom";
import LocalMallOutlinedIcon from "@mui/icons-material/LocalMallOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import XIcon from "@mui/icons-material/X";
import InstagramIcon from "@mui/icons-material/Instagram";
import TelegramIcon from "@mui/icons-material/Telegram";
import YouTubeIcon from "@mui/icons-material/YouTube";
import "./StoreFooter.css";
export default function StoreFooter({
  onCategory,
}: {
  onCategory: (category: string) => void;
}) {
  return (
    <footer className="storefront-footer store-footer">
      <div className="store-footer-heading">
        <div className="store-footer-brand">
          <img src="/assets/services/store.png" alt="" loading="lazy" />
          <div>
            <strong>SMAJ Store</strong>
            <p>
              Real seller products, Pi checkout, and marketplace updates in one
              place.
            </p>
          </div>
        </div>
        <div className="store-footer-trust">
          <VerifiedUserOutlinedIcon aria-hidden="true" />
          <span>Secure marketplace for Pi users.</span>
        </div>
      </div>
      <nav className="store-footer-links" aria-label="Store footer">
        <section>
          <span className="store-footer-icon">
            <LocalMallOutlinedIcon aria-hidden="true" />
          </span>
          <div>
            <h2>Shop</h2>
            {["Deals", "Electronics", "Fashion"].map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </section>
        <section>
          <span className="store-footer-icon">
            <StorefrontOutlinedIcon aria-hidden="true" />
          </span>
          <div>
            <h2>Seller</h2>
            <Link to="/seller">Seller Dashboard</Link>
            <Link to="/add-product">Add Product</Link>
          </div>
        </section>
        <section>
          <span className="store-footer-icon">
            <PersonOutlineOutlinedIcon aria-hidden="true" />
          </span>
          <div>
            <h2>Account</h2>
            <Link to="/orders">Orders</Link>
            <Link to="/saved">Saved Products</Link>
          </div>
        </section>
      </nav>
      <div className="store-footer-lower">
        <div>
          <p>
            &copy; {new Date().getFullYear()} SMAJ PI HUB. All rights reserved.
          </p>
          <p>Part of SMAJ PI HUB &middot; Secure marketplace for Pi users.</p>
        </div>
        <nav className="store-footer-social" aria-label="Store social links">
          {[
            ["X", "https://x.com/smajpihub", XIcon],
            ["Instagram", "https://instagram.com/smajpihub", InstagramIcon],
            ["Telegram", "https://t.me/smajpihub", TelegramIcon],
            ["YouTube", "https://www.youtube.com/@SPHcore", YouTubeIcon],
          ].map(([name, url, Icon]) => (
            <a
              key={String(name)}
              href={String(url)}
              target="_blank"
              rel="noreferrer"
              aria-label={String(name)}
            >
              {typeof Icon !== "string" ? <Icon aria-hidden="true" /> : null}
            </a>
          ))}
        </nav>
        <nav className="store-footer-legal" aria-label="Store legal and help">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/help">Help</Link>
        </nav>
      </div>
    </footer>
  );
}
