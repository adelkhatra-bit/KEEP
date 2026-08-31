import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, LANGUAGES } from './languages';
import { APP_NAME } from '../config/brand';

export { LANGUAGES, DEFAULT_LANGUAGE, FALLBACK_LANGUAGE } from './languages';
export type { LanguageDef, LanguageStatus } from './languages';

const resources = {
  fr: { translation: fr },
  en: { translation: en },
};

// Langue système -> code ISO à 2 lettres, avec repli sur EN si non supportée.
function resolveDeviceLanguage(): string {
  try {
    const locales = Localization.getLocales?.() ?? [];
    const tag = locales[0]?.languageCode ?? DEFAULT_LANGUAGE;
    const active = LANGUAGES.find((l) => l.status === 'ACTIVE' && l.code === tag);
    return active ? active.code : FALLBACK_LANGUAGE;
  } catch {
    return FALLBACK_LANGUAGE;
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false, defaultVariables: { appName: APP_NAME } },
  returnEmptyString: false,
});

export default i18n;
