import { useEffect, useState } from "react";
import i18n from "../i18n";

const DASHBOARD_LANGUAGE_SAVED_KEY = "smaj_dashboard_language_saved";

type LanguageChoiceButtonProps = {
  dashboardPrompt?: boolean;
};

const languages = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;
type LanguageCode = (typeof languages)[number]["code"];

const LanguageSoonButton = ({ dashboardPrompt = false }: LanguageChoiceButtonProps) => {
  const [hidden, setHidden] = useState(
    () => dashboardPrompt && window.localStorage.getItem(DASHBOARD_LANGUAGE_SAVED_KEY) === "true",
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LanguageCode>(() => {
    const saved = window.localStorage.getItem("smaj_language") as LanguageCode | null;
    return languages.some(language => language.code === saved) ? saved! : i18n.resolvedLanguage === "fr" ? "fr" : "en";
  });

  useEffect(() => {
    const syncLanguage = (language: string) => setSelected(language.split("-")[0] === "fr" ? "fr" : "en");
    i18n.on("languageChanged", syncLanguage);
    return () => { i18n.off("languageChanged", syncLanguage); };
  }, []);

  if (hidden) return null;

  const saveLanguage = async () => {
    await i18n.changeLanguage(selected);
    window.localStorage.setItem("smaj_language", selected);
    window.localStorage.setItem(DASHBOARD_LANGUAGE_SAVED_KEY, "true");
    setOpen(false);
    if (dashboardPrompt) setHidden(true);
  };

  return (
    <>
      <button
        type="button"
        className="language-soon-button"
        aria-label="Choose language"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">{"\u6587"}</span>
        <span aria-hidden="true">A</span>
      </button>

      {open ? (
        <div className="language-choice-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="language-choice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-choice-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="language-choice-close" aria-label="Close" onClick={() => setOpen(false)}>x</button>
            <h2 id="language-choice-title">Pick language</h2>
            <div className="language-choice-list" role="radiogroup" aria-label="Languages">
              {languages.map((language) => (
                <button type="button" role="radio" aria-checked={selected === language.code} className={selected === language.code ? "active" : ""} onClick={() => setSelected(language.code)} key={language.code}><span>{language.label}</span></button>
              ))}
            </div>
            <div className="language-choice-actions">
              <button type="button" className="language-choice-cancel" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="language-choice-save" onClick={() => void saveLanguage()}>Save</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};

export default LanguageSoonButton;