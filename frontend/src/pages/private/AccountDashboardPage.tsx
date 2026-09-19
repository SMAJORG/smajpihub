import { Link } from "react-router-dom";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import InstagramIcon from "@mui/icons-material/Instagram";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import XIcon from "@mui/icons-material/X";
import YouTubeIcon from "@mui/icons-material/YouTube";
import { useAuthContext } from "../../contexts/AuthContext";
import TrustBadge from "../../components/TrustBadge";

const quickLinks = [
  ["Profile", "/profile", PersonOutlineOutlinedIcon],
  ["Wallet", "/app/wallet", AccountBalanceWalletOutlinedIcon],
  ["Safety", "/settings/preferences", ShieldOutlinedIcon],
  ["Inbox", "/messages", InboxOutlinedIcon],
] as const;

const marketplaceCards = [
  ["Seller tools", "Manage shop", "/seller", DashboardOutlinedIcon],
  ["Saved products", "Your items", "/saved", BookmarkBorderOutlinedIcon],
  ["Orders", "Purchases", "/orders", ReceiptLongOutlinedIcon],
] as const;

const accountRows = [
  ["Help center", "Support and marketplace guidance", "/help"],
  ["Legal", "Terms, privacy, and platform rules", "/terms"],
  ["White Paper", "Vision, ecosystem, utility, and roadmap", "/white-paper"],
] as const;

const socialLinks = [
  ["X", "https://x.com/smajpihub", XIcon],
  ["Telegram", "https://t.me/smajpihub", TelegramIcon],
  ["Instagram", "https://instagram.com/smajpihub", InstagramIcon],
  ["YouTube", "https://youtube.com/@smajpihub", YouTubeIcon],
  ["TikTok", "https://www.tiktok.com/@smajpihub", MusicNoteOutlinedIcon],
] as const;

const AccountDashboardPage = () => {
  const { user } = useAuthContext();
  const name = user?.displayName || user?.username || "Pi User";
  const sellerActive = user?.sellerActive || user?.role === "seller";
  const sellerCard = sellerActive
    ? ["Seller profile", `/seller/${user?.uid}`, StorefrontOutlinedIcon] as const
    : ["Become a seller", "/profile", StorefrontOutlinedIcon] as const;

  return (
    <main className="private-page account-dashboard-page">
      <section className="account-dashboard-identity">
        <div className="account-dashboard-avatar">
          {user?.avatar ? <img src={user.avatar} alt="" /> : name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="profile-name-line"><span className="profile-name-text">{name}</span><TrustBadge level={user?.verificationLevel} status={user?.verificationStatus} /></h1>
          <p>@{user?.piUsername || user?.username}</p>
        </div>
        <Link
          className="profile-package-shortcut"
          to="/app/services/token/rewards"
          aria-label="Open SMAJ Token Rewards package preview"
        >
          <span className="profile-package-icon" aria-hidden="true"><CardGiftcardOutlinedIcon /></span>
          <span>Package</span>
          <small>SOON</small>
        </Link>
      </section>

      <section className="account-quick-grid">
        {quickLinks.map(([label, to, Icon]) => (
          <Link to={to} key={label}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </section>

      <section className="account-quick-grid account-marketplace-actions" aria-label="Marketplace shortcuts">
        {[...marketplaceCards.map(([label, , to, Icon]) => [label, to, Icon] as const), sellerCard].map(([label, to, Icon]) => (
          <Link to={to} key={label}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </section>

      <section className="account-dashboard-list">
        {accountRows.map(([label, description, to]) => (
          <Link to={to} key={label}>
            <span>{label}<small>{description}</small></span>
            <ChevronRightOutlinedIcon />
          </Link>
        ))}
        <div>
          <span>App version</span>
          <small>0.1.0</small>
        </div>
        <div className="settings-social-row" aria-label="Official social handles">
          <span className="settings-social-title">Official social handles</span>
          {socialLinks.map(([label, href, Icon]) => (
            <a href={href} key={label} aria-label={label} target="_blank" rel="noreferrer">
              <Icon fontSize="small" />
            </a>
          ))}
        </div>
      </section>

    </main>
  );
};

export default AccountDashboardPage;
