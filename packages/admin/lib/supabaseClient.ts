/**
 * Client Supabase browser du Super Admin — source unique (pas de deuxième
 * `createClient` ailleurs). `null` tant que NEXT_PUBLIC_SUPABASE_URL/
 * NEXT_PUBLIC_SUPABASE_ANON_KEY ne sont pas renseignées (voir
 * docs/PROJECT_STATUS.md) : chaque appelant gère ce cas explicitement.
 *
 * IMPORTANT : le Super Admin et l'application utilisateur vivent sur le même
 * domaine GitHub Pages et utilisent le même projet Supabase. Ils doivent donc
 * avoir des clés de stockage Auth différentes, sinon ouvrir le Super Admin peut
 * remplacer/déconnecter la session utilisateur dans le même navigateur.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPER_ADMIN_STORAGE_KEY = 'keep-superadmin-auth-v1';

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('your_') || value === 'undefined';
}

export const isSupabaseConfigured = !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        storageKey: SUPER_ADMIN_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
