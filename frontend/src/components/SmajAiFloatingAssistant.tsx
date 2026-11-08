import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function SmajAiFloatingAssistant({ userId = "" }: { userId?: string }) {
  const [invitation, setInvitation] = useState(false);
  useEffect(() => {
    setInvitation(false);
    if (!userId) return;
    const key = `smaj-ai-invitations:${userId}`;
    let shown = 0;
    try { shown = Number(window.sessionStorage.getItem(key)) || 0; } catch { /* A private session can use the in-memory limit. */ }
    let hideTimer = 0;
    const invite = () => {
      if (!window.matchMedia("(max-width: 1023px)").matches || shown >= 2 || document.hidden || document.querySelector('[aria-modal="true"]') || document.activeElement?.matches('input, textarea, select')) return;
      shown++;
      try { window.sessionStorage.setItem(key, String(shown)); } catch { /* The invitation is optional. */ }
      setInvitation(true);
      hideTimer = window.setTimeout(() => setInvitation(false), 6000);
    };
    const initial = window.setTimeout(invite, 20000);
    const repeat = window.setInterval(invite, 180000);
    return () => { window.clearTimeout(initial); window.clearTimeout(hideTimer); window.clearInterval(repeat); };
  }, [userId]);
  return (
    <aside className="smaj-ai-float" aria-label="SMAJ AI">
      {invitation && <div className="smaj-ai-invitation" id="smaj-ai-invitation" role="status"><span>Need help? Ask SMAJ AI</span><button type="button" aria-label="Dismiss AI invitation" onClick={() => setInvitation(false)}>×</button></div>}
      <Link className="smaj-ai-trigger" to="/ai" aria-label="Open SMAJ AI" title="SMAJ AI" aria-describedby={invitation ? "smaj-ai-invitation" : undefined} onClick={() => setInvitation(false)}>
        <img className="smaj-ai-mark" src="/smaj-ai-logo.png" alt="" />
      </Link>
    </aside>
  );
}
