import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languages, normalizeLanguage, persistLanguage, profileLanguageCode } from '../localization/languages';
import { useAuthContext } from '../contexts/AuthContext';

const LanguageSoonButton = ({ dashboardPrompt = false }: { dashboardPrompt?: boolean }) => {
  const { i18n } = useTranslation();
  const { user, updateLanguage } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizeLanguage(i18n.resolvedLanguage || 'en'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const close = () => { if (!busy) { setOpen(false); setError(''); trigger.current?.focus(); } };
  useEffect(() => {
    setDraft(profileLanguageCode(user?.language || user?.settings?.language || i18n.resolvedLanguage || 'en'));
    setError('');
    if (dashboardPrompt) setOpen(Boolean(user?.uid && !user.languagePreferenceSaved));
  }, [user?.uid, user?.languagePreferenceSaved, user?.language, user?.settings?.language, dashboardPrompt, i18n]);
  useEffect(() => {
    if (!open) return;
    select.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const dialog = select.current?.closest('section');
        const elements = dialog?.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button:not(:disabled), select:not(:disabled)');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, busy]);
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await updateLanguage(draft);
      persistLanguage(draft);
      await i18n.changeLanguage(draft);
      setOpen(false);
      trigger.current?.focus();
    } catch { setError('Your language could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };
  if (dashboardPrompt && (!user?.uid || user.languagePreferenceSaved)) return null;
  return <>
    <button ref={trigger} type="button" className="language-soon-button" aria-label="Choose language" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span aria-hidden="true">文</span><span aria-hidden="true">A</span></button>
    {open ? <div className="language-choice-backdrop" role="presentation" onClick={close}>
      <section className="language-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="language-choice-title" aria-busy={busy} onClick={event => event.stopPropagation()}>
        <button type="button" className="language-choice-close" aria-label="Close" disabled={busy} onClick={close}>×</button>
        <h2 id="language-choice-title">Pick language</h2>
        <p>Your choice is saved to your profile. You can change it later in Settings.</p>
        <label><span>Language</span><select ref={select} value={draft} disabled={busy} onChange={event => setDraft(normalizeLanguage(event.target.value))}>{languages.map(language => <option value={language.code} key={language.code} translate="no">{language.label}</option>)}</select></label>
        {error && <p className="language-choice-error" role="alert">{error}</p>}
        <div className="language-choice-actions"><button type="button" className="language-choice-save" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button></div>
      </section>
    </div> : null}
  </>;
};
export default LanguageSoonButton;
