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
      </section>      <section className="download-use-guide">
        <header><span>DOWNLOAD & USE</span><h2>From download to your SMAJ home</h2><p>Follow these steps on the Android phone where you want to use SMAJ PI HUB.</p></header>
        <ol>
          <li><b>1</b><span><strong>Tap Download APK</strong><small>Your browser downloads <code>SMAJ-PI-HUB.apk</code>.</small></span></li>
          <li><b>2</b><span><strong>Open the downloaded file</strong><small>Use the browser download notification or the phone’s Downloads folder.</small></span></li>
          <li><b>3</b><span><strong>Allow this installation</strong><small>If Android blocks it, tap Settings and enable “Allow from this source” for that browser.</small></span></li>
          <li><b>4</b><span><strong>Install SMAJ PI HUB</strong><small>Return to the installer, tap Install, then tap Open.</small></span></li>
          <li><b>5</b><span><strong>Continue with Pi</strong><small>The app opens Pi authentication so you can confirm your Pi identity securely.</small></span></li>
          <li><b>6</b><span><strong>Return to the app</strong><small>After approval, SMAJ PI HUB returns to the logged-in Home screen using the same web/Pi Browser account.</small></span></li>
          <li><b>7</b><span><strong>Allow notifications</strong><small>Enable notifications when Android asks so messages, orders and updates can appear on your phone.</small></span></li>
          <li><b>8</b><span><strong>Start using your services</strong><small>Open Home, Services, Search, Messages or You from the bottom navigation.</small></span></li>
        </ol>
        <div className="download-help-grid">
          <details>
            <summary>Android says “App not installed”</summary>
            <p>Delete an older incompatible test build, confirm that your phone has enough storage, then download the newest official APK and try again.</p>
          </details>
          <details>
            <summary>Pi sign-in does not open</summary>
            <p>Install or update Pi Browser, sign in to your Pi account there, then return to SMAJ PI HUB and tap Continue with Pi again.</p>
            <a href="https://minepi.com/pi-browser/" target="_blank" rel="noreferrer">Get Pi Browser from the official Pi website →</a>
          </details>
          <details>
            <summary>How do I update the app?</summary>
            <p>Return to this page, download the newest APK and install it over the current app. Do not uninstall first if you want to preserve local app data.</p>
          </details>
          <details>
            <summary>Is the APK safe?</summary>
            <p>Install only the APK linked from smajpihub.com. Do not install copies sent through unofficial chats, groups or file-sharing sites.</p>
          </details>
        </div>
        <div className="download-final-cta">
          <img src="/logo.png" alt="" />
          <div><strong>Ready to use SMAJ PI HUB?</strong><small>Download the latest official Android build.</small></div>
          <a className="download-primary" href={APK_URL} download><DownloadRoundedIcon /> Download APK</a>
        </div>
      </section>
    </main>
  </AppLayout>
);

export default DownloadPage;