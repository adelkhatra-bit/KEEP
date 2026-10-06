import * as Localization from 'expo-localization';
import { supabase } from './supabaseClient';

export type MusicGenreOption = {
  key: string;
  label: string;
  trackCount: number;
  featured: boolean;
};

export type MusicCountryOption = {
  code: string;
  name: string;
  languageCodes: string[];
};

export function detectMusicLocale(): { languageTag: string; countryCode?: string } {
  try {
    const locale = Localization.getLocales?.()?.[0];
    const languageTag = String(locale?.languageTag || locale?.languageCode || 'en');
    const countryCode = locale?.regionCode ? String(locale.regionCode).toUpperCase() : undefined;
    return { languageTag, countryCode };
  } catch {
    return { languageTag: 'en' };
  }
}

async function invoke(kind: 'genres' | 'countries', q = '', limit = 80): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.functions.invoke('keep-music-taxonomy', {
    body: { kind, q: q.trim(), limit },
  });
  if (error) throw error;
  return Array.isArray((data as any)?.items) ? (data as any).items : [];
}

export async function loadMusicGenres(query = '', limit = 80): Promise<MusicGenreOption[]> {
  const rows = await invoke('genres', query, limit);
  return rows.map((row: any) => ({
    key: String(row.genre_key ?? row.key ?? row.label ?? '').trim(),
    label: String(row.label ?? row.genre_key ?? '').trim(),
    trackCount: Number(row.track_count ?? row.trackCount ?? 0),
    featured: Boolean(row.is_featured ?? row.featured),
  })).filter((row) => row.key && row.label);
}

export async function loadMusicCountries(query = '', limit = 300): Promise<MusicCountryOption[]> {
  const rows = await invoke('countries', query, limit);
  return rows.map((row: any) => ({
    code: String(row.code ?? '').trim().toUpperCase(),
    name: String(row.name ?? row.code ?? '').trim(),
    languageCodes: Array.isArray(row.language_codes ?? row.languageCodes)
      ? (row.language_codes ?? row.languageCodes).map(String)
      : [],
  })).filter((row) => /^[A-Z]{2}$/.test(row.code) && row.name);
}
