import { supabase } from './supabaseClient';

/**
 * Source canonique du « Découvert par » (Adel, 05/10/2026 — règle définitive) :
 * une découverte reste marquée par la PREMIÈRE personne qui l'a faite, partout
 * (liste, swipe, écoute). Le serveur (keep_track_first_discoveries) est la seule
 * vérité ; ni le propriétaire du profil ni une copie/reprise ne la remplacent.
 */
export type TrackOrigin = { profileId: string; username: string };

const cache = new Map<string, TrackOrigin | null>();

export async function loadFirstDiscoveryOrigins(trackIds: string[]): Promise<Record<string, TrackOrigin>> {
  const ids = Array.from(new Set(trackIds.map((id) => String(id || '')).filter(Boolean)));
  const out: Record<string, TrackOrigin> = {};
  const missing = ids.filter((id) => !cache.has(id));
  if (supabase && missing.length) {
    for (let start = 0; start < missing.length; start += 100) {
      const chunk = missing.slice(start, start + 100);
      try {
        const { data, error } = await supabase.rpc('keep_track_first_discoveries', { p_track_ids: chunk });
        if (error) continue;
        const found = new Set<string>();
        for (const row of (Array.isArray(data) ? data : []) as any[]) {
          if (!row?.track_id || !row?.profile_id) continue;
          found.add(String(row.track_id));
          cache.set(String(row.track_id), { profileId: String(row.profile_id), username: String(row.username || '') });
        }
        chunk.forEach((id) => { if (!found.has(id)) cache.set(id, null); });
      } catch {
        // Réseau indisponible : on ne met rien en cache, le prochain appel réessaiera.
      }
    }
  }
  ids.forEach((id) => { const origin = cache.get(id); if (origin && origin.username) out[id] = origin; });
  return out;
}
