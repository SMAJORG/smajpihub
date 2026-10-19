import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import type { Resource } from 'i18next';
import { resources } from './localization/catalog';
import { languages, normalizeLanguage, persistLanguage } from './localization/languages';
const updateDocument = (language: string) => {
  const code = normalizeLanguage(language);
  document.documentElement.lang = code === 'zh' ? 'zh-Hans' : code;
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
  persistLanguage(code);
};
i18n.on('languageChanged', updateDocument);
void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: resources as Resource,
  initAsync: false,
  fallbackLng: 'en',
  supportedLngs: languages.map(language => language.code),
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'], lookupLocalStorage: 'smaj_language', convertDetectedLanguage: raw => raw.toLowerCase().split(/[-_]/)[0] },
});
updateDocument(i18n.resolvedLanguage || i18n.language || 'en');
export default i18n;
