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
export const APP_NAME = 'Loki';
