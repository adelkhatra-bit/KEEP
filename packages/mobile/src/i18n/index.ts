import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, LANGUAGES } from './languages';
import { APP_NAME } from '../config/brand';
import { supabase } from '../services/supabaseClient';

export { LANGUAGES, DEFAULT_LANGUAGE, FALLBACK_LANGUAGE } from './languages';
export type { LanguageDef, LanguageStatus } from './languages';

const resources = {
  fr: { translation: fr },
  en: { translation: en },
};

type TranslationLeaf = { path: string[]; text: string };

function deviceLanguageCode(): string {
  try {
    const locales = Localization.getLocales?.() ?? [];
    return String(locales[0]?.languageCode || DEFAULT_LANGUAGE).trim().toLowerCase() || DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function bundledLanguage(code: string): code is keyof typeof resources {
  return Object.prototype.hasOwnProperty.call(resources, code);
}

function flattenTranslation(value: any, path: string[] = [], output: TranslationLeaf[] = []): TranslationLeaf[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, child]) => flattenTranslation(child, [...path, key], output));
    return output;
  }
  if (typeof value === 'string') output.push({ path, text: value });
  return output;
}

function setNested(target: Record<string, any>, path: string[], value: string) {
  if (!path.length) return;
  let cursor: Record<string, any> = target;
  path.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  });
  cursor[path[path.length - 1]] = value;
}

const detectedLanguage = deviceLanguageCode();
const initialLanguage = bundledLanguage(detectedLanguage) ? detectedLanguage : FALLBACK_LANGUAGE;

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: FALLBACK_LANGUAGE,
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false, defaultVariables: { appName: APP_NAME } },
  returnEmptyString: false,
});

/**
 * Charge un pack traduit automatiquement pour la langue du téléphone.
 * - FR/EN restent embarqués : démarrage hors-ligne immédiat.
 * - Les autres langues sont traduites côté Supabase, jamais dans le mobile.
 * - La clé fournisseur ne quitte jamais le serveur.
 * - Si le fournisseur n'est pas configuré/joignable, l'anglais reste actif.
 *
 * Cette couche couvre les chaînes déjà centralisées dans i18n. Les écrans
 * historiques contenant encore du texte JSX en dur doivent être migrés vers
 * des clés i18n avant d'être réellement multilingues de bout en bout.
 */
// Panne Supabase (10/10/2026) : un seul chargement à la fois par langue, puis pause de 5 min après un échec,
// pour ne pas ajouter de trafic (fonction + table de cache) pendant que le serveur est saturé.
const RUNTIME_LANGUAGE_RETRY_PAUSE_MS = 5 * 60 * 1000;
const runtimeLanguageInFlight = new Map<string, Promise<boolean>>();
const runtimeLanguageFailedAt = new Map<string, number>();

export function activateRuntimeLanguage(languageCode = detectedLanguage): Promise<boolean> {
  const target = String(languageCode || '').trim().toLowerCase();
  if (!target) return Promise.resolve(false);
  if (bundledLanguage(target)) return loadRuntimeLanguage(target);
  const pending = runtimeLanguageInFlight.get(target);
  if (pending) return pending;
  const failedAt = runtimeLanguageFailedAt.get(target);
  if (failedAt && Date.now() - failedAt < RUNTIME_LANGUAGE_RETRY_PAUSE_MS) return Promise.resolve(false);
  const run = loadRuntimeLanguage(target).then((ok) => {
    if (ok) runtimeLanguageFailedAt.delete(target); else runtimeLanguageFailedAt.set(target, Date.now());
    return ok;
  }).finally(() => { runtimeLanguageInFlight.delete(target); });
  runtimeLanguageInFlight.set(target, run);
  return run;
}

async function loadRuntimeLanguage(target: string): Promise<boolean> {
  if (bundledLanguage(target)) {
    await i18n.changeLanguage(target);
    return true;
  }
  if (!supabase) return false;

  const leaves = flattenTranslation(en);
  if (!leaves.length) return false;

  try {
    const { data, error } = await supabase.functions.invoke('keep-ui-translate', {
      body: {
        source: 'en',
        target,
        texts: leaves.map((item) => item.text),
      },
    });
    const translations = Array.isArray((data as any)?.translations) ? (data as any).translations.map(String) : [];
    if (error || translations.length !== leaves.length) return false;

    const bundle: Record<string, any> = {};
    leaves.forEach((item, index) => setNested(bundle, item.path, translations[index] ?? item.text));
    i18n.addResourceBundle(target, 'translation', bundle, true, true);
    await i18n.changeLanguage(target);
    return true;
  } catch {
    return false;
  }
}

// Ne bloque jamais le rendu initial. La langue système est appliquée dès que
// son pack serveur est disponible; sinon l'anglais embarqué reste le fallback.
if (!bundledLanguage(detectedLanguage)) {
  void activateRuntimeLanguage(detectedLanguage);
}

export default i18n;
