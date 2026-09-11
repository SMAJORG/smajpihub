import AndroidRoundedIcon from "@mui/icons-material/AndroidRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import UpdateRoundedIcon from "@mui/icons-material/UpdateRounded";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import "./DownloadPage.css";

const APK_URL = "https://github.com/devsmaj/smajpihub/releases/download/android-latest/SMAJ-PI-HUB.apk";

const DownloadPage = () => (
  <AppLayout>
    <main className="download-page">
      <section className="download-hero">
        <div className="download-copy">
          <span className="download-eyebrow"><AndroidRoundedIcon /> ANDROID APP</span>
          <h1>SMAJ PI HUB<br /><em>on your phone.</em></h1>
          <p>Use the same SMAJ account, services, products, jobs, courses and messages you already use in Pi Browser.</p>
          <div className="download-actions">
            <a className="download-primary" href={APK_URL} download><DownloadRoundedIcon /> Download APK</a>
            <Link className="download-secondary" to="/home"><LanguageRoundedIcon /> Open Web App</Link>
          </div>
          <small>Android 8 or newer · Direct APK installation</small>
        </div>
        <div className="download-phone" aria-label="SMAJ PI HUB Android app preview">
          <div className="download-phone-speaker" />
          <img src="/logo.png" alt="SMAJ PI HUB" />
          <strong>Everything you need.<br />One place.</strong>
          <span>Powered by Pi</span>
        </div>
      </section>
      <section className="download-details">
        <header><span>INSTALLATION</span><h2>Install in a few steps</h2></header>
        <div className="download-step-grid">
          <article><b>01</b><h3>Download</h3><p>Tap Download APK and wait for Android to finish downloading the file.</p></article>
          <article><b>02</b><h3>Allow installation</h3><p>If Android asks, allow your browser to install this app from the downloaded file.</p></article>
          <article><b>03</b><h3>Open and sign in</h3><p>Open SMAJ PI HUB, continue with Pi and return to the same SMAJ account.</p></article>
        </div>
      </section>
      <section className="download-release">
        <div><UpdateRoundedIcon /><span><small>CURRENT RELEASE</small><strong>Android preview</strong><p>The latest successful Android build is always available from this page.</p></span></div>
        <div><SecurityRoundedIcon /><span><small>INSTALL SAFELY</small><strong>Official SMAJ PI HUB build</strong><p>Only install an APK downloaded from smajpihub.com or the official GitHub release.</p></span></div>
      </section>
    </main>
  </AppLayout>
);

export default DownloadPage;