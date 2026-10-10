import type { LokiPulseItem } from './lokiPulseService';

/** Les recommandations de goût passent devant, sans doublon avec le Pulse existant. */
export function mergeTasteRecommendations(items: LokiPulseItem[], recommendations: LokiPulseItem[], limit: number): LokiPulseItem[] {
  // Même sans suggestions externes, le flux brut peut contenir plusieurs fiches
  // fournisseur pour une même chanson : dédupliquer systématiquement.
  const seen = new Set<string>();
  const out: LokiPulseItem[] = [];
  const seenSongs = new Set<string>();
  for (const item of [...recommendations, ...items]) {
    if (seen.has(item.track.id)) continue;
    const identity = String(item.track.isrc || '').trim().toUpperCase() || [item.track.artist, item.track.title].map(x => String(x || '').normalize('NFKC').toLocaleLowerCase('fr-FR').trim()).join('|');
    if (seenSongs.has(identity)) continue;
    seenSongs.add(identity);
    seen.add(item.track.id);
    out.push(item);
  }
  return out.slice(0, Math.max(limit, items.length));
}
