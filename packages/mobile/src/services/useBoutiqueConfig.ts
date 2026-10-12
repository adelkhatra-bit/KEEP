import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { BOUTIQUE_CONFIG_FALLBACK as FALLBACK, parseBoutiqueConfig, type BoutiqueConfig } from './boutiqueVitrine';

// Lecture tolérante des réglages Super Admin de la Boutique (Lot 5) : clé absente
// (avant la migration 20261013000100) ou base injoignable => valeurs de repli.
let cached: BoutiqueConfig | null = null;
let inflight: Promise<BoutiqueConfig> | null = null;

export function loadBoutiqueConfig(): Promise<BoutiqueConfig> {
  if (cached) return Promise.resolve(cached);
  if (!supabase) return Promise.resolve(FALLBACK);
  if (!inflight) {
    inflight = Promise.resolve(supabase.from('remote_config').select('key,value').in('key', ['playlist_sale_follower_threshold', 'boutique_featured_count', 'playlist_sale_free_without_threshold']))
      .then(({ data, error }) => {
        const value = error ? FALLBACK : parseBoutiqueConfig(data as any);
        if (!error) cached = value;
        return value;
      }, () => FALLBACK)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useBoutiqueConfig(): BoutiqueConfig {
  const [config, setConfig] = useState<BoutiqueConfig>(cached ?? FALLBACK);
  useEffect(() => {
    let active = true;
    void loadBoutiqueConfig().then((value) => { if (active) setConfig(value); });
    return () => { active = false; };
  }, []);
  return config;
}
