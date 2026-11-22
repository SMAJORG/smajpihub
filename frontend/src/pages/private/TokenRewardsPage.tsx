import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import RedeemOutlinedIcon from "@mui/icons-material/RedeemOutlined";
import StarsRoundedIcon from "@mui/icons-material/StarsRounded";
import TollRoundedIcon from "@mui/icons-material/TollRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Link } from "react-router-dom";

const TokenRewardsPage = () => (
  <main className="token-rewards-page token-rewards-compact">
    <header className="token-rewards-header">
      <Link to="/settings" aria-label="Back to account"><ArrowBackRoundedIcon /></Link>
      <div>
        <span>SMAJ PI HUB</span>
        <h1>Token Rewards</h1>
        <p>Your rewards, all in one place.</p>
      </div>
      <span className="token-rewards-soon">COMING SOON</span>
    </header>
    <section className="token-rewards-summary" aria-label="Reward overview">
      <article><span><TollRoundedIcon /></span><strong>0</strong><small>Tokens</small></article>
      <article><span><StarsRoundedIcon /></span><strong>0</strong><small>Points</small></article>
      <article className="token-package-card"><span><CardGiftcardOutlinedIcon /></span><strong>—</strong><small>Package</small></article>
    </section>
    <section className="token-redeem-card">
      <span className="token-redeem-icon"><RedeemOutlinedIcon /></span>
      <div><h2>Redeem gift code</h2><p>Available when rewards launch.</p></div>
      <button type="button" disabled><LockOutlinedIcon fontSize="small" /> Coming soon</button>
    </section>
    <section className="token-rewards-preview">
      <div className="token-rewards-preview-heading"><h2>Explore future rewards</h2><span>PREVIEW</span></div>
      <div className="token-rewards-preview-list">
        <article><CardGiftcardOutlinedIcon /><div><strong>Member packages</strong><small>Exclusive member benefits</small></div><LockOutlinedIcon className="token-rewards-locked" /></article>
        <article><StarsRoundedIcon /><div><strong>Activity rewards</strong><small>Recognition for eligible activity</small></div><LockOutlinedIcon className="token-rewards-locked" /></article>
      </div>
    </section>
    <p className="token-rewards-disclaimer"><InfoOutlinedIcon fontSize="small" /> Rewards are not active yet. No token distribution or redemption is available.</p>
  </main>
);

export default TokenRewardsPage;
