import { pruneExpiredStory } from './storyActivity';

type StoryShape = {
  profileId: string;
  latestAt: string;
  tracks: Array<{ id: string }>;
  addedAt?: Record<string, string>;
};

/** Keep a public 24h story visible through ONE incomplete refresh, rather
 * than making its bubble blink off and on each time network/rpc responses race.
 * A second consecutive authoritative successful result without it removes it.
 * Expired tracks are ALWAYS removed immediately; this is never a way to keep
 * removed music after 24h. Hidden/private removals can be prioritized by the
 * calling service when authorization changes.
 */
export function reconcileStoryRefresh<T extends StoryShape>(
  previous: T[], confirmed: T[], missCounts: Map<string, number>, now = Date.now(),
): T[] {
  const result = new Map<string, T>();
  for (const item of confirmed) {
    const fresh = item.tracks.length > 0 ? pruneExpiredStory(item, now) : item;
    if (fresh) result.set(item.profileId, fresh);
    missCounts.delete(item.profileId);
  }
  for (const item of previous) {
    if (result.has(item.profileId)) continue;
    // Suggestion/friend bubbles can be safely refreshed each time. Only
    // recently posted real stories need transient network protection.
    if (!item.tracks.length) { missCounts.delete(item.profileId); continue; }
    const valid = pruneExpiredStory(item, now);
    if (!valid) { missCounts.delete(item.profileId); continue; }
    const consecutiveMisses = (missCounts.get(item.profileId) ?? 0) + 1;
    if (consecutiveMisses >= 2) { missCounts.delete(item.profileId); continue; }
    missCounts.set(item.profileId, consecutiveMisses);
    result.set(item.profileId, valid);
  }
  return [...result.values()];
}
