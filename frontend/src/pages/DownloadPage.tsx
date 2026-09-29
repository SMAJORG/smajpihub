import AndroidRoundedIcon from "@mui/icons-material/AndroidRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import UpdateRoundedIcon from "@mui/icons-material/UpdateRounded";
import { Link } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import { ANDROID_APK_URL } from "../lib/androidDownload";
import "./DownloadPage.css";


const DownloadPage = () => (
  <AppLayout>
    <main className="download-page">
      <section className="download-hero">
        <div className="download-copy">
          <span className="download-eyebrow"><AndroidRoundedIcon /> ANDROID APP</span>
          <h1>SMAJ PI HUB<br /><em>on your phone.</em></h1>
          <p>Use the same SMAJ account, services, products, jobs, courses and messages you already use in Pi Browser.</p>
          <div className="download-actions">
            <a className="download-primary" href={ANDROID_APK_URL} download><DownloadRoundedIcon /> Download APK</a>
            <Link className="download-secondary" to="/home"><LanguageRoundedIcon /> Open Web App</Link>
          </div>
          <small>Android 8 or newer · Direct APK installation</small>
        </div>
        <div className="download-phone download-phone-preview">
          <img src="/assets/smaj-android-app-preview.png" alt="SMAJ PI HUB Android app home screen on a Galaxy Note phone" />
        </div>
      </section>
      <section className="download-testing-notice" aria-labelledby="download-testing-title">
        <header>
          <span><ScienceOutlinedIcon /> TESTING PREVIEW</span>
          <h2 id="download-testing-title">Please read before installing</h2>
        </header>
        <div className="download-testing-grid">
          <article>
            <WarningAmberRoundedIcon />
            <div>
              <strong>This Android app is for voluntary testing</strong>
              <p>Use it to test Pi sign-in, navigation, messages, content, notifications and other app features. It is a preview build, may contain unfinished features, and may change after testing.</p>
            </div>
          </article>
          <article>
            <SecurityRoundedIcon />
            <div>
              <strong>Use Pi Browser for Pay with Pi</strong>
              <p>Pi payment support is not guaranteed inside this standalone Android preview. For reliable Pi sign-in and Pay with Pi, open <b>smajpihub.com</b> in the official Pi Browser.</p>
            </div>
          </article>
        </div>
        <p className="download-testing-disclaimer">SMAJ PI HUB does not claim that standalone Android Pi payments are approved or released by Pi Core Team. Do not use unofficial payment workarounds. This notice will be updated when official Pi platform support changes.</p>
        <div className="download-testing-actions">
          <a href="https://minepi.com/pi-browser/" target="_blank" rel="noreferrer"><LanguageRoundedIcon /> Get official Pi Browser</a>
          <a href="https://developers.minepi.com/docs/build-first-app/GettingStarted" target="_blank" rel="noreferrer">Read official Pi guidance</a>
        </div>
      </section>
      <section className="download-use-guide">
        <header><span>INSTALLATION & USE</span><h2>From download to your SMAJ home</h2><p>Follow these steps on the Android phone where you want to use SMAJ PI HUB.</p></header>
        <ol>
          <li><b>1</b><span><strong>Tap Download APK</strong><small>Your browser downloads <code>SMAJ-PI-HUB.apk</code>.</small></span></li>
          <li><b>2</b><span><strong>Open the downloaded file</strong><small>Use the browser download notification or the phone’s Downloads folder.</small></span></li>
          <li><b>3</b><span><strong>Allow this installation</strong><small>If Android blocks it, tap Settings and enable “Allow from this source” for that browser.</small></span></li>
          <li><b>4</b><span><strong>Install SMAJ PI HUB</strong><small>Return to the installer, tap Install, then tap Open.</small></span></li>
          <li><b>5</b><span><strong>Test Continue with Pi</strong><small>Test sign-in and return-to-app behavior. For Pay with Pi, use the SMAJ web app inside the official Pi Browser.</small></span></li>
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
          <div><strong>Ready to test SMAJ PI HUB?</strong><small>Download the latest Android testing preview.</small></div>
          <a className="download-primary" href={ANDROID_APK_URL} download><DownloadRoundedIcon /> Download APK</a>
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