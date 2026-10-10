/** Les offres créées avant le 10/10/2026 portent le nombre de titres figé dans leur nom (« Ma collection · 8 titres »
 *  alors que la collection en compte 10) : on affiche toujours le nombre réel, jamais celui du nom. */
export function offerDisplayName(offer: { playlistName?: string | null; trackCount?: number | null }): string {
  const name = String(offer.playlistName || '').trim();
  const generic = /^(.*?)\s*·\s*\d+\s+titres?$/i.exec(name);
  const count = Number(offer.trackCount ?? 0);
  if (generic && count > 0) return `${generic[1] || 'Ma collection'} · ${count} titre${count > 1 ? 's' : ''}`;
  return name || 'Collection';
}
