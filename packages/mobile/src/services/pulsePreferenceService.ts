import * as Localization from 'expo-localization';
import { supabase } from './supabaseClient';

export type PulsePreferenceState = {
  completed: boolean;
  shouldPrompt: boolean;
  favoriteGenres: string[];
  suggestedGenres: string[];
  languageCodes: string[];
  countryCodes: string[];
  preferredLanguageTag: string | null;
  promptAfter: string | null;
  dismissCount: number;
  version: number;
};

export type MusicGenreOption = { genreKey: string; label: string; trackCount: number; isFeatured: boolean };
export type MusicCountryOption = { code: string; name: string; languageCodes: string[] };
export type MusicLanguageOption = { code: string; name: string };

const fallbackState: PulsePreferenceState = {
  completed: false,
  shouldPrompt: false,
  favoriteGenres: [],
  suggestedGenres: [],
  languageCodes: [],
  countryCodes: [],
  preferredLanguageTag: null,
  promptAfter: null,
  dismissCount: 0,
  version: 0,
};

function client() {
  if (!supabase) throw new Error('Supabase indisponible');
  return supabase;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((x) => x.trim()).filter(Boolean) : [];
}

function deviceLanguageTag(): string | null {
  try {
    const locales = Localization.getLocales?.() ?? [];
    const tag = locales[0]?.languageTag || locales[0]?.languageCode;
    return tag ? String(tag) : null;
  } catch {
    return null;
  }
}

function normalizeState(row: any): PulsePreferenceState {
  const value = row && typeof row === 'object' ? row : {};
  return {
    completed: Boolean(value.completed),
    shouldPrompt: Boolean(value.shouldPrompt ?? value.should_prompt),
    favoriteGenres: asArray(value.favoriteGenres ?? value.favorite_genres),
    suggestedGenres: asArray(value.suggestedGenres ?? value.suggested_genres ?? value.favoriteGenres ?? value.favorite_genres),
    languageCodes: asArray(value.languageCodes ?? value.language_codes),
    countryCodes: asArray(value.countryCodes ?? value.country_codes).map((x) => x.toUpperCase()),
    preferredLanguageTag: value.preferredLanguageTag ?? value.preferred_language_tag ?? null,
    promptAfter: value.promptAfter ?? value.prompt_after ?? null,
    dismissCount: Number(value.dismissCount ?? value.dismiss_count ?? 0),
    version: Number(value.version ?? 0),
  };
}

export async function loadPulsePreferenceState(): Promise<PulsePreferenceState> {
  if (!supabase) return fallbackState;
  const { data, error } = await client().rpc('keep_pulse_preferences_state');
  if (error) throw error;
  return normalizeState(data);
}

export async function savePulsePreferences(input: {
  genres: string[];
  languageCodes?: string[];
  countryCodes?: string[];
  preferredLanguageTag?: string | null;
}): Promise<PulsePreferenceState> {
  const genres = Array.from(new Set(input.genres.map((x) => x.trim()).filter(Boolean))).slice(0, 30);
  const languageCodes = Array.from(new Set((input.languageCodes ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
  const countryCodes = Array.from(new Set((input.countryCodes ?? []).map((x) => x.trim().toUpperCase()).filter(Boolean))).slice(0, 20);
  const preferredLanguageTag = (input.preferredLanguageTag || deviceLanguageTag() || '').trim() || null;
  const { data, error } = await client().rpc('keep_save_pulse_preferences', {
    p_genres: genres,
    p_language_codes: languageCodes,
    p_country_codes: countryCodes,
    p_preferred_language_tag: preferredLanguageTag,
  });
  if (error) throw error;
  return normalizeState(data);
}

export async function snoozePulsePreferences(hours = 24): Promise<PulsePreferenceState> {
  if (!supabase) return fallbackState;
  const { data, error } = await client().rpc('keep_snooze_pulse_preferences', {
    p_hours: Math.max(6, Math.min(Math.round(hours), 72)),
  });
  if (error) throw error;
  return normalizeState(data);
}

async function invokeTaxonomy(kind: 'genres' | 'countries' | 'languages', q: string, limit: number): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await client().functions.invoke('keep-music-taxonomy', {
    body: { kind, q: q.trim() || null, limit },
  });
  if (!error && Array.isArray((data as any)?.items)) return (data as any).items;

  const rpcName = kind === 'genres'
    ? 'keep_music_genre_search'
    : kind === 'countries'
      ? 'keep_music_country_search'
      : 'keep_music_language_search';
  const { data: fallback, error: fallbackError } = await client().rpc(rpcName, {
    p_query: q.trim() || null,
    p_limit: limit,
  });
  if (fallbackError) throw fallbackError;
  return Array.isArray(fallback) ? fallback : [];
}

export async function searchMusicGenres(query = '', limit = 120): Promise<MusicGenreOption[]> {
  const rows = await invokeTaxonomy('genres', query, Math.max(20, Math.min(limit, 300)));
  return rows.map((row: any) => ({
    genreKey: String(row.genre_key ?? row.genreKey ?? row.label ?? '').trim(),
    label: String(row.label ?? row.genre_key ?? '').trim(),
    trackCount: Number(row.track_count ?? row.trackCount ?? 0),
    isFeatured: Boolean(row.is_featured ?? row.isFeatured),
  })).filter((row) => row.genreKey && row.label);
}

export async function searchMusicCountries(query = '', limit = 300): Promise<MusicCountryOption[]> {
  const rows = await invokeTaxonomy('countries', query, Math.max(20, Math.min(limit, 300)));
  return rows.map((row: any) => ({
    code: String(row.code ?? '').trim().toUpperCase(),
    name: String(row.name ?? row.code ?? '').trim(),
    languageCodes: asArray(row.language_codes ?? row.languageCodes).map((x) => x.toLowerCase()),
  })).filter((row) => /^[A-Z]{2}$/.test(row.code));
}

export async function searchMusicLanguages(query = '', limit = 300): Promise<MusicLanguageOption[]> {
  const rows = await invokeTaxonomy('languages', query, Math.max(20, Math.min(limit, 300)));
  return rows.map((row: any) => ({
    code: String(row.code ?? '').trim().toLowerCase(),
    name: String(row.name ?? row.code ?? '').trim(),
  })).filter((row) => row.code && row.name);
}

export function detectedDeviceLanguageTag(): string | null {
  return deviceLanguageTag();
}
