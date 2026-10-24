/**
 * Source unique du nom de marque affiche a l'utilisateur (31/08/2026, demande
 * Adel : "on va changer le nom... trouve une solution pour que ca le change
 * automatiquement partout"). Tout le code doit importer APP_NAME au lieu
 * d'ecrire le nom en dur -- un futur changement de marque redevient une
 * seule ligne a modifier ici, au lieu d'une recherche/remplacement fragile
 * sur des dizaines de fichiers.
 *
 * NE CHANGE PAS : l'identifiant technique (com.adelkhatra.keep), le schema
 * de lien profond (keep://), le depot GitHub, les URLs publiques
 * (adelkhatra-bit.github.io/KEEP/...), les noms de tables/fonctions Supabase
 * ni les noms de modules natifs (KeepIAP, KeepShazam) -- volontairement
 * distincts de la marque affichee, cf. discussion du 31/08/2026.
 */
export const APP_NAME = 'Loki Music';

/**
 * Adresse publique UNIQUE du site Loki Music (24/10/2026, demande Adel :
 * "KEEP et Adel Khatra ne doivent plus être visibles des utilisateurs").
 * Tout lien partagé, lien légal ou texte d'aide passe par ici : le jour où un
 * domaine neutre est branché, on change CETTE ligne (et EXPO_PUBLIC_WEB_URL
 * des workflows web), et tous les liens de l'app suivent.
 * Volontairement une constante (pas process.env) : le plugin d'env Expo
 * injecte expo/virtual/env, non chargeable par Jest.
 */
export const PUBLIC_WEB_URL = 'https://adelkhatra-bit.github.io/KEEP';
export const PUBLIC_WEB_BASE_URL = `${PUBLIC_WEB_URL}/`;
export const publicWebUrl = (path = ''): string => `${PUBLIC_WEB_URL}/${String(path).replace(/^\//, '')}`;
export const LEGAL_URLS = {
  privacy: publicWebUrl('privacy/'),
  privacyChoices: publicWebUrl('privacy-choices/'),
  terms: publicWebUrl('terms/'),
  support: publicWebUrl('support/'),
} as const;
