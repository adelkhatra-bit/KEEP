/**
 * Client Supabase unique côté mobile (source unique -- pas de deuxième
 * `createClient` ailleurs dans l'app, cf. règle anti-doublon).
 *
 * Le même client sert Expo natif et Expo Web. Sur le web uniquement,
 * `detectSessionInUrl` est activé afin qu'un clic sur l'e-mail de confirmation
 * Supabase revienne sur Loki et récupère automatiquement la session. Sur iOS /
 * Android natifs, le comportement historique AsyncStorage reste inchangé.
 */
import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const isWebRuntime = Boolean((globalThis as any)?.location?.href);

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isSupabaseConfigured = !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: isWebRuntime,
      },
    })
  : null;

/** Jeton d'accès de la session Loki courante, ou `null` si non connecté / Supabase non configuré. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
