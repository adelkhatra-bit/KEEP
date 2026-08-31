/**
 * Registre des langues Loki.
 *
 * Statut honnête par langue — ne jamais annoncer une langue "disponible"
 * si ses traductions n'existent pas réellement (règle "aucun faux résultat").
 *
 *   ACTIVE  = fichier de traduction complet et chargé
 *   PLANNED = prévue dans l'architecture (RTL, code, sélecteur) mais
 *             traductions non écrites — tombera sur EN en fallback
 */
export type LanguageStatus = 'ACTIVE' | 'PLANNED';

export interface LanguageDef {
  code: string;
  label: string;
  rtl: boolean;
  status: LanguageStatus;
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'fr', label: 'Français', rtl: false, status: 'ACTIVE' },
  { code: 'en', label: 'English', rtl: false, status: 'ACTIVE' },
  { code: 'es', label: 'Español', rtl: false, status: 'PLANNED' },
  { code: 'pt', label: 'Português', rtl: false, status: 'PLANNED' },
  { code: 'de', label: 'Deutsch', rtl: false, status: 'PLANNED' },
  { code: 'it', label: 'Italiano', rtl: false, status: 'PLANNED' },
  { code: 'ar', label: 'العربية', rtl: true, status: 'PLANNED' },
  { code: 'tr', label: 'Türkçe', rtl: false, status: 'PLANNED' },
  { code: 'ru', label: 'Русский', rtl: false, status: 'PLANNED' },
  { code: 'zh', label: '中文', rtl: false, status: 'PLANNED' },
  { code: 'ja', label: '日本語', rtl: false, status: 'PLANNED' },
  { code: 'ko', label: '한국어', rtl: false, status: 'PLANNED' },
  { code: 'hi', label: 'हिन्दी', rtl: false, status: 'PLANNED' },
];

export const DEFAULT_LANGUAGE = 'en';
export const FALLBACK_LANGUAGE = 'en';
