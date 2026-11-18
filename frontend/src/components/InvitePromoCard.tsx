import { Link } from "react-router-dom";
import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";

const InvitePromoCard = ({ placement }: { placement: "account" | "home" }) => (
  <section className={`invite-promo invite-promo-${placement}`}>
    <span className="invite-promo-icon" aria-hidden="true"><CardGiftcardOutlinedIcon /></span>
    <div className="invite-promo-copy">
      <h2>Invite &amp; Earn</h2>
      <p>Invite friends to SMAJ PI HUB. Tracking is not enabled and rewards are not confirmed.</p>
    </div>
    <Link to="/referrals">
      <span>Invite friends</span>
      <ArrowForwardOutlinedIcon />
    </Link>
  </section>
);

export default InvitePromoCard;
