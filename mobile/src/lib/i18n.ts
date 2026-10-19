import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Resource } from 'i18next';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { resources } from '../../../frontend/src/localization/catalog';
import { normalizeLanguage } from '../../../frontend/src/localization/languages';
const key = 'smaj_language';
export const localeReady = (async () => {
  let saved: string | null = null;
  try { saved = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) : await SecureStore.getItemAsync(key); } catch { /* Detection works without storage. */ }
  const language = normalizeLanguage(saved || Intl.DateTimeFormat().resolvedOptions().locale || 'en');
  await i18n.use(initReactI18next).init({ resources: resources as Resource, lng: language, fallbackLng: 'en', interpolation: { escapeValue: false }, initAsync: false });
})();
export async function selectLanguage(language: string) {
  const code = normalizeLanguage(language);
  await i18n.changeLanguage(code);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, code);
    else await SecureStore.setItemAsync(key, code);
  } catch { /* Keep in-memory selection. */ }
}
export default i18n;
