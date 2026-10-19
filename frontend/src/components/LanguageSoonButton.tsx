import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languages, normalizeLanguage, persistLanguage } from '../localization/languages';

const LanguageSoonButton = ({ dashboardPrompt = false }: { dashboardPrompt?: boolean }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    select.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const dialog = select.current?.closest('section');
        const elements = dialog?.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  if (hidden) return null;
  return <>
    <button ref={trigger} type="button" className="language-soon-button" aria-label="Choose language" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span aria-hidden="true">文</span><span aria-hidden="true">A</span></button>
    {open ? <div className="language-choice-backdrop" role="presentation" onClick={close}>
      <section className="language-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="language-choice-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="language-choice-close" aria-label="Close" onClick={close}>×</button>
        <h2 id="language-choice-title">Pick language</h2>
        <label><span>Language</span><select ref={select} value={normalizeLanguage(i18n.resolvedLanguage || 'en')} onChange={event => {
          persistLanguage(event.target.value);
          void i18n.changeLanguage(event.target.value);
        }}>{languages.map(language => <option value={language.code} key={language.code} translate="no">{language.label}</option>)}</select></label>
        <div className="language-choice-actions"><button type="button" className="language-choice-save" onClick={() => { close(); if (dashboardPrompt) setHidden(true); }}>Close</button></div>
      </section>
    </div> : null}
  </>;
};
export default LanguageSoonButton;
