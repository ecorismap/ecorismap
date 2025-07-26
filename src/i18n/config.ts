import { getLocales } from 'expo-localization';
import { default as i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import translation_en from './en/translation.json';
import translation_ja from './ja/translation.json';

export const resources = {
  en: {
    translation: translation_en,
  },
  ja: {
    translation: translation_ja,
  },
} as const;

const locales = getLocales();
const deviceLanguage = locales[0]?.languageTag || 'en';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  lng: deviceLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  cleanCode: true,
  resources,
});

export default i18n;
export const t = i18n.t;
