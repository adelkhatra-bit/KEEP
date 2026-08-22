import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, LANGUAGES } from './languages';

const LANGUAGE_STORAGE_KEY = 'keep-language-override';

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
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

// Choix explicite de l'utilisateur (voir ProfileScreen "Langue") --
// prioritaire sur la détection automatique de la langue système une fois
// chargé. Léger flash possible de la langue système au tout premier rendu
// (AsyncStorage est asynchrone) -- même compromis que la restauration de
// session Supabase ailleurs dans l'app.
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((saved) => {
  if (saved && LANGUAGES.some((l) => l.status === 'ACTIVE' && l.code === saved)) {
    i18n.changeLanguage(saved);
  }
});

export async function setAppLanguage(code: string): Promise<void> {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

export default i18n;
