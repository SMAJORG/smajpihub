import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import i18n from "../i18n";

const DASHBOARD_LANGUAGE_SAVED_KEY = "smaj_dashboard_language_saved";
const EXPLICIT_LANGUAGE_KEY = "smaj_language_explicit";

type LanguageChoiceButtonProps = { dashboardPrompt?: boolean };

const languages = [
  { code: "en", label: "English" }, { code: "af", label: "Afrikaans" }, { code: "ar", label: "العربية" },
  { code: "bn", label: "বাংলা" }, { code: "zh", label: "中文" }, { code: "cs", label: "Čeština" },
  { code: "nl", label: "Nederlands" }, { code: "fr", label: "Français" }, { code: "de", label: "Deutsch" },
  { code: "ha", label: "Hausa" }, { code: "hi", label: "हिन्दी" }, { code: "id", label: "Bahasa Indonesia" },
  { code: "it", label: "Italiano" }, { code: "ja", label: "日本語" }, { code: "ko", label: "한국어" },
  { code: "ms", label: "Bahasa Malaysia" }, { code: "pt", label: "Português" }, { code: "ru", label: "Русский" },
  { code: "es", label: "Español" }, { code: "sw", label: "Kiswahili" }, { code: "tr", label: "Türkçe" },
  { code: "ur", label: "اردو" }, { code: "vi", label: "Tiếng Việt" }, { code: "yo", label: "Yorùbá" },
] as const;
type LanguageCode = (typeof languages)[number]["code"];
const supports = (code: string): code is LanguageCode => languages.some(language => language.code === code);

const LanguageSoonButton = ({ dashboardPrompt = false }: LanguageChoiceButtonProps) => {
  const [hidden, setHidden] = useState(() => dashboardPrompt && window.localStorage.getItem(DASHBOARD_LANGUAGE_SAVED_KEY) === "true");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LanguageCode>(() => {
    const detected = (i18n.language || i18n.resolvedLanguage || navigator.language || "en").split("-")[0].toLowerCase();
    return supports(detected) ? detected : "en";
  });

  useEffect(() => {
    const syncLanguage = (language: string) => {
      const code = language.split("-")[0].toLowerCase();
      setSelected(supports(code) ? code : "en");
    };
    i18n.on("languageChanged", syncLanguage);
    if (window.localStorage.getItem(EXPLICIT_LANGUAGE_KEY) !== "true") {
      const detect = async () => {
        const raw = Capacitor.isNativePlatform() ? (await Device.getLanguageCode()).value : navigator.language;
        const code = String(raw || "en").split("-")[0].toLowerCase();
        const next = supports(code) ? code : "en";
        window.localStorage.setItem("smaj_language", next);
        await i18n.changeLanguage(next);
      };
      void detect().catch(() => undefined);
    }
    return () => { i18n.off("languageChanged", syncLanguage); };
  }, []);

  if (hidden) return null;

  const saveLanguage = async () => {
    await i18n.changeLanguage(selected);
    window.localStorage.setItem("smaj_language", selected);
    window.localStorage.setItem(EXPLICIT_LANGUAGE_KEY, "true");
    window.localStorage.setItem(DASHBOARD_LANGUAGE_SAVED_KEY, "true");
    setOpen(false);
    if (dashboardPrompt) setHidden(true);
  };

  return <>
    <button type="button" className="language-soon-button" aria-label="Choose language" aria-haspopup="dialog" onClick={() => setOpen(true)}><span aria-hidden="true">文</span><span aria-hidden="true">A</span></button>
    {open ? <div className="language-choice-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="language-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="language-choice-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="language-choice-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        <h2 id="language-choice-title">Pick language</h2>
        <label><span>Language</span><select value={selected} onChange={event => setSelected(event.target.value as LanguageCode)}>{languages.map(language => <option value={language.code} key={language.code}>{language.label}</option>)}</select></label>
        <div className="language-choice-actions"><button type="button" className="language-choice-cancel" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="language-choice-save" onClick={() => void saveLanguage()}>Save</button></div>
      </section>
    </div> : null}
  </>;
};

export default LanguageSoonButton;
