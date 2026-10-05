import type { LokiPulseItem } from './lokiPulseService';

/** Les recommandations de goût passent devant, sans doublon avec le Pulse existant. */
export function mergeTasteRecommendations(items: LokiPulseItem[], recommendations: LokiPulseItem[], limit: number): LokiPulseItem[] {
  if (!recommendations.length) return items;
  const seen = new Set<string>();
  const out: LokiPulseItem[] = [];
  for (const item of [...recommendations, ...items]) {
    if (seen.has(item.track.id)) continue;
    seen.add(item.track.id);
    out.push(item);
  }
  return out.slice(0, Math.max(limit, items.length));
}
