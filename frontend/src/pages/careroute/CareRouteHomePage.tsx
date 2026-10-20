import React from "react";
import { Link } from "react-router-dom";
import CareRouteLayout from "./CareRouteLayout";
import EmergencyShareOutlinedIcon from "@mui/icons-material/EmergencyShareOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import NearMeOutlinedIcon from "@mui/icons-material/NearMeOutlined";

const steps = [
  { title: "Share your location", text: "Tell us where you are and what help you need.", Icon: EmergencyShareOutlinedIcon },
  { title: "Choose a hospital", text: "Compare nearby hospitals and available care.", Icon: NearMeOutlinedIcon },
  { title: "Follow your request", text: "Get updates when the hospital responds.", Icon: LocalHospitalOutlinedIcon },
];

export const CareRouteHomePage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => (
  <CareRouteLayout embedded={embedded}>
    <div className="careroute-home">
      <aside className="careroute-home-notice">
        <WarningAmberOutlinedIcon />
        <p>In immediate danger? Call your local emergency service. CareRoute does not replace emergency services.</p>
      </aside>

      <section className="careroute-hero" aria-labelledby="careroute-home-title">
        <div className="careroute-hero-eyebrow">SMAJ Health</div>
        <h1 id="careroute-home-title">Find a hospital nearby</h1>
        <p>Share your location to find participating hospitals and request help.</p>
        <div className="careroute-home-actions">
          <Link to="/careroute/request" className="careroute-btn-primary">
            <EmergencyShareOutlinedIcon />
            <span>Request help</span>
          </Link>
          <Link to="/careroute/track" className="careroute-btn-secondary">
            <LocalShippingOutlinedIcon />
            <span>Track request</span>
          </Link>
        </div>
        <Link className="careroute-browse-link" to="/careroute/hospitals">Browse hospitals</Link>
      </section>

      <section className="careroute-home-steps" aria-labelledby="careroute-steps-title">
        <h2 id="careroute-steps-title">How it works</h2>
        <div className="careroute-grid-3">
          {steps.map(({ title, text, Icon }, index) => (
            <article className="careroute-card careroute-step-card" key={title}>
              <div className="careroute-step-icon"><Icon /></div>
              <div>
                <h3>{index + 1}. {title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="careroute-card careroute-staff-banner" aria-labelledby="careroute-staff-title">
        <div>
          <h2 id="careroute-staff-title">Hospital staff?</h2>
          <p>Manage incoming requests and update bed availability.</p>
        </div>
        <Link to="/careroute/hospital-dashboard" className="careroute-btn-secondary">Open hospital desk</Link>
      </section>
    </div>
  </CareRouteLayout>
);

export default CareRouteHomePage;
