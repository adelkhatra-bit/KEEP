import { supabase } from './supabaseClient';
import type { EarRaw } from './earReport';

/** Rapport « Mon oreille » : lecture seule (RPC keep_my_ear_report), jamais d'écriture. */
export async function loadEarReport(): Promise<EarRaw | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('keep_my_ear_report');
  if (error || !data) return null;
  const d = data as any;
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    given: Number(d.given) || 0, early_hits: Number(d.early_hits) || 0, early_keeps: Number(d.early_keeps) || 0, received: Number(d.received) || 0,
    followers: Number(d.followers) || 0, followers_30: Number(d.followers_30) || 0, styles_explored: Number(d.styles_explored) || 0,
    genres: arr(d.genres), pioneer_styles: arr(d.pioneer_styles), audience: arr(d.audience),
  };
}
