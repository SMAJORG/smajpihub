import { Link } from "react-router-dom";

export default function SmajAiFloatingAssistant() {
  return (
    <aside className="smaj-ai-float" aria-label="SMAJ AI">
      <Link className="smaj-ai-trigger" to="/ai" aria-label="Open SMAJ AI" title="SMAJ AI">
        <img className="smaj-ai-mark" src="/smaj-ai-logo.png" alt="" />
      </Link>
    </aside>
  );
}
