import { supabase } from './supabaseClient';
import { useEffect, useState } from 'react';

/**
 * Source canonique du « Découvert par » (Adel, 05/10/2026 — règle définitive) :
 * une découverte reste marquée par la PREMIÈRE personne qui l'a faite, partout
 * (liste, swipe, écoute). Le serveur (keep_track_first_discoveries) est la seule
 * vérité ; ni le propriétaire du profil ni une copie/reprise ne la remplacent.
 */
export type TrackOrigin = { profileId: string; username: string };

const cache = new Map<string, TrackOrigin | null>();

export function firstDiscoveryFreeLabel(trackId: string, confirmed: boolean, origins: Record<string, TrackOrigin>): string | null {
  return confirmed && /^[0-9a-f-]{36}$/i.test(trackId) && !origins[trackId] ? 'Libre · à découvrir par toi' : null;
}

export function useFirstDiscoveryOrigins(trackIds: string[], enabled = true, refreshKey = '') {
  const key = trackIds.filter(Boolean).join(',');
  const [result, setResult] = useState<{ key: string; origins: Record<string, TrackOrigin> } | null>(null);
  useEffect(() => {
    let live = true;
    setResult(null);
    if (!enabled || !key) return undefined;
    void loadFirstDiscoveryOrigins(key.split(','), { requireConfirmed: true }).then((origins) => {
      if (live) setResult({ key, origins });
    }).catch(() => {});
    return () => { live = false; };
  }, [key, enabled, refreshKey]);
  const confirmed = enabled && result?.key === key;
  return { confirmed, origins: confirmed ? result!.origins : {} };
}

export async function loadFirstDiscoveryOrigins(trackIds: string[], options?: { requireConfirmed?: boolean }): Promise<Record<string, TrackOrigin>> {
  const ids = Array.from(new Set(trackIds.map((id) => String(id || '')).filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  const out: Record<string, TrackOrigin> = {};
  const missing = ids.filter((id) => !cache.get(id));
  if (options?.requireConfirmed && missing.length && !supabase) throw new Error('DISCOVERY_ORIGIN_UNAVAILABLE');
  if (supabase && missing.length) {
    for (let start = 0; start < missing.length; start += 100) {
      const chunk = missing.slice(start, start + 100);
      try {
        const { data, error } = await supabase.rpc('keep_track_first_discoveries', { p_track_ids: chunk });
        if (error) {
          if (options?.requireConfirmed) throw error;
          continue;
        }
        for (const row of (Array.isArray(data) ? data : []) as any[]) {
          if (!row?.track_id || !row?.profile_id) continue;
          cache.set(String(row.track_id), { profileId: String(row.profile_id), username: String(row.username || '') });
        }
        // Une absence n'est pas immuable : le premier GARDER peut arriver ensuite.
      } catch (error) {
        if (options?.requireConfirmed) throw error;
        // Réseau indisponible : on ne met rien en cache, le prochain appel réessaiera.
      }
    }
  }
  ids.forEach((id) => { const origin = cache.get(id); if (origin && origin.username) out[id] = origin; });
  return out;
}
