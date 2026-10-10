// Adel (29/09/2026) : « imagine-toi que demain on a plus de 5 millions
// d'utilisateurs ». Les collections d'un vendeur s'affichent par paquets :
// 3 d'abord, puis +10 à chaque « VOIR PLUS », puis retour à 3 (RÉDUIRE).
export const SALE_ROWS_INITIAL = 3;
export const SALE_ROWS_STEP = 10;

export function nextSaleVisibleCount(current: number, total: number): number {
  if (current >= total) return SALE_ROWS_INITIAL;
  return Math.min(total, current + SALE_ROWS_STEP);
}

// Adel (29/09/2026) : « trois articles en vente et on en envoie un seul sur
// le profil ». keep_playlist_sale_my_offers renvoie AUSSI les collections
// retirées (✕ Retirer, ou moins de 2 morceaux restants) ; le profil et les
// visiteurs ne montrent que les actives. La gestion sépare donc les deux au
// lieu d'étiqueter tout « PUBLIÉE ». La collection ciblée (ouverte depuis
// Ma musique) passe en tête.
export function splitSaleOffersByStatus<T extends { isActive: boolean; offerId?: string; playlistId: string }>(offers: T[], focusId?: string | null): { published: T[]; retired: T[] } {
  const isFocus = (o: T) => Boolean(focusId) && (o.offerId === focusId || o.playlistId === focusId);
  const published = offers.filter((o) => o.isActive);
  const retired = offers.filter((o) => !o.isActive);
  published.sort((a, b) => Number(isFocus(b)) - Number(isFocus(a)));
  return { published, retired };
}
