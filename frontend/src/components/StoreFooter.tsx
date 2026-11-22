import { Link } from "react-router-dom";
import XIcon from "@mui/icons-material/X";
import InstagramIcon from "@mui/icons-material/Instagram";
import TelegramIcon from "@mui/icons-material/Telegram";
import YouTubeIcon from "@mui/icons-material/YouTube";
import "./StoreFooter.css";

export default function StoreFooter({ onCategory }: { onCategory: (category: string) => void }) {
  return (
    <footer className="storefront-footer store-footer">
      <div className="store-footer-brand">
        <img src="/assets/services/store.png" alt="" loading="lazy" />
        <div><strong>SMAJ Store</strong><p>Shop smarter with Pi.</p></div>
      </div>
      <nav className="store-footer-links" aria-label="Store footer">
        <section><h2>Explore</h2>
          <Link to="/store" onClick={() => onCategory("All")}>All products</Link>
          <button type="button" onClick={() => { onCategory("All"); document.querySelector(".storefront-shopping-tools")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Categories</button>
          <button type="button" onClick={() => onCategory("Deals")}>Deals</button>
        </section>
        <section><h2>Sell</h2><Link to="/seller">Seller Center</Link><Link to="/add-product">Add Product</Link></section>
        <section><h2>Support</h2><Link to="/help">Help Center</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></section>
      </nav>
      <nav className="store-footer-social" aria-label="Store social links">
        <a href="https://x.com/smajpihub" target="_blank" rel="noopener noreferrer" aria-label="X"><XIcon aria-hidden="true" /></a>
        <a href="https://instagram.com/smajpihub" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><InstagramIcon aria-hidden="true" /></a>
        <a href="https://t.me/smajpihub" target="_blank" rel="noopener noreferrer" aria-label="Telegram"><TelegramIcon aria-hidden="true" /></a>
        <a href="https://www.youtube.com/@SPHcore" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><YouTubeIcon aria-hidden="true" /></a>
      </nav>
      <p className="store-footer-copyright">© {new Date().getFullYear()} SMAJ PI HUB · All rights reserved.</p>
    </footer>
  );
}
