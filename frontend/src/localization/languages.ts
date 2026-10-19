export const languages = [
  { code: 'en', label: 'English' }, { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' }, { code: 'ha', label: 'Hausa' },
  { code: 'es', label: 'Español' }, { code: 'pt', label: 'Português' },
  { code: 'zh', label: '简体中文' }, { code: 'sw', label: 'Kiswahili' },
  { code: 'hi', label: 'हिन्दी' }, { code: 'tr', label: 'Türkçe' },
] as const;
export type LanguageCode = typeof languages[number]['code'];
export const normalizeLanguage = (raw: string): LanguageCode => {
  const code = raw.toLowerCase().split(/[-_]/)[0];
  return languages.some(language => language.code === code) ? code as LanguageCode : 'en';
};
export const readLanguage = () => {
  try { return window.localStorage.getItem('smaj_language'); } catch { return null; }
};
export const persistLanguage = (code: string) => {
  try { window.localStorage.setItem('smaj_language', normalizeLanguage(code)); } catch { /* Keep in-memory selection. */ }
};
