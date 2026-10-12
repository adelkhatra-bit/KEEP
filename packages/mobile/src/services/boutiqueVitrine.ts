/**
 * Vitrine « Boutique » toujours présente (Lot 5, 12/10/2026).
 *
 * Règles pures (testées) + lecture tolérante du réglage Super Admin
 * `playlist_sale_follower_threshold`. La clé peut ne pas exister en base
 * (avant la migration 20261013000100) : on retombe alors sur 100, valeur
 * réellement appliquée par le serveur jusqu'ici.
 */

export const DEFAULT_SALE_FOLLOWER_THRESHOLD = 100;
export const DEFAULT_FEATURED_COUNT = 3;

export type BoutiqueVitrineMode =
  | 'OWNER_CREATE'      // propriétaire, vente débloquée, aucune offre : « Créer ma boutique »
  | 'OWNER_LOCKED'      // propriétaire, seuil d'abonnés non atteint : « N / seuil »
  | 'VISITOR_EMPTY'     // visiteur, aucune offre : « @x n'a rien en vente » + Suivre
  | 'SHOWCASE';         // au moins une offre : à la une + grille

export type BoutiqueVitrineInput = {
  isOwner: boolean;
  offerCount: number;
  followers: number;
  threshold: number;
  /** Réglage « vendre sans seuil » (clé playlist_sale_free_without_threshold). */
  freeWithoutThreshold?: boolean;
};

export function normalizeSaleThreshold(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : DEFAULT_SALE_FOLLOWER_THRESHOLD;
}

export function normalizeFeaturedCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : DEFAULT_FEATURED_COUNT;
}

export function boutiqueVitrineMode(input: BoutiqueVitrineInput): BoutiqueVitrineMode {
  if (input.offerCount > 0) return 'SHOWCASE';
  if (!input.isOwner) return 'VISITOR_EMPTY';
  const unlocked = Boolean(input.freeWithoutThreshold) || input.followers >= input.threshold;
  return unlocked ? 'OWNER_CREATE' : 'OWNER_LOCKED';
}

export function missingFollowers(followers: number, threshold: number): number {
  return Math.max(0, Math.floor(threshold) - Math.max(0, Math.floor(followers)));
}

export type BoutiqueVitrineCopy = { title: string; body: string; cta: 'CREATE' | 'FOLLOW' | 'NONE' };

export function boutiqueVitrineCopy(mode: BoutiqueVitrineMode, input: { sellerName: string; followers: number; threshold: number }): BoutiqueVitrineCopy {
  const name = String(input.sellerName || '').replace(/^@+/, '').trim() || 'Ce profil';
  switch (mode) {
    case 'OWNER_CREATE':
      return { title: 'Ta boutique est prête', body: 'Mets une première collection en vente.', cta: 'CREATE' };
    case 'OWNER_LOCKED':
      return { title: `${input.followers} / ${input.threshold} abonnés`, body: `Encore ${missingFollowers(input.followers, input.threshold)} pour ouvrir ta boutique.`, cta: 'NONE' };
    case 'VISITOR_EMPTY':
      return { title: `@${name} n'a rien en vente`, body: 'Suis-le pour être prévenu de sa première collection.', cta: 'FOLLOW' };
    default:
      return { title: '', body: '', cta: 'NONE' };
  }
}

export type BoutiqueConfig = { threshold: number; featuredCount: number; freeWithoutThreshold: boolean };
export const BOUTIQUE_CONFIG_FALLBACK: BoutiqueConfig = { threshold: DEFAULT_SALE_FOLLOWER_THRESHOLD, featuredCount: DEFAULT_FEATURED_COUNT, freeWithoutThreshold: false };

export function parseBoutiqueConfig(rows: { key: string; value: unknown }[] | null | undefined): BoutiqueConfig {
  const result: BoutiqueConfig = { ...BOUTIQUE_CONFIG_FALLBACK };
  for (const row of rows ?? []) {
    if (row.key === 'playlist_sale_follower_threshold') result.threshold = normalizeSaleThreshold(row.value);
    if (row.key === 'boutique_featured_count') result.featuredCount = normalizeFeaturedCount(row.value);
    if (row.key === 'playlist_sale_free_without_threshold') result.freeWithoutThreshold = String(row.value).toLowerCase() === 'true';
  }
  return result;
}
