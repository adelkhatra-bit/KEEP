/**
 * Client Supabase unique côté mobile (source unique -- pas de deuxième
 * `createClient` ailleurs dans l'app, cf. règle anti-doublon).
 *
 * STATUT HONNÊTE : aucun projet Supabase KEEP n'existe encore (voir
 * docs/PROJECT_STATUS.md). Tant que EXPO_PUBLIC_SUPABASE_URL/ANON_KEY ne
 * sont pas renseignées, `supabase` vaut `null` et tout appelant doit gérer
 * ce cas explicitement (voir useUserStore/OnboardingScreen) -- jamais un
 * client construit avec une URL factice qui échouerait de façon opaque.
 */
import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
        detectSessionInUrl: false,
      },
    })
  : null;

/** Jeton d'accès de la session KEEP courante, ou `null` si non connecté / Supabase non configuré. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Session invité (cf. demande explicite du 23/08/2026 -- "KEEP doit être
 * testable immédiatement sans inscription, sans e-mail et sans compte").
 * Utilise le mode `signInAnonymously()` OFFICIEL de Supabase Auth -- pas un
 * hack maison : le même user_id auth.uid() reste valable si l'invité crée
 * ensuite un vrai compte (voir `linkGuestToRealAccount`), donc rien n'est
 * jamais perdu à la conversion, sans code de migration manuel.
 *
 * N'écrase JAMAIS une session déjà active (réelle OU déjà invitée) --
 * appelé uniquement quand `getSupabaseAccessToken()` renvoie `null`.
 */
export async function ensureGuestSession(): Promise<string | null> {
  if (!supabase) return null;
  const existing = await getSupabaseAccessToken();
  if (existing) return existing;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    console.warn('[KEEP][guest-session]', error?.message);
    return null;
  }
  return data.session.access_token;
}
