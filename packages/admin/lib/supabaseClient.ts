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

// Le Super Admin partage le même backend que les utilisateurs mais PAS leur
// session Auth (storageKey séparée ci-dessus). Pour éviter qu'une page admin
// lourde participe à une saturation Postgres, on lisse aussi son fan-out HTTP.
const ADMIN_NETWORK_MAX_CONCURRENT = 3;
let adminNetworkActive = 0;
const adminNetworkQueue: Array<() => void> = [];

function drainAdminQueue() {
  while (adminNetworkActive < ADMIN_NETWORK_MAX_CONCURRENT && adminNetworkQueue.length) {
    adminNetworkActive += 1;
    adminNetworkQueue.shift()?.();
  }
}

async function adminSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('/auth/v1/')) return fetch(input, init);
  await new Promise<void>((resolve) => {
    adminNetworkQueue.push(resolve);
    drainAdminQueue();
  });
  try {
    return await fetch(input, init);
  } finally {
    adminNetworkActive = Math.max(0, adminNetworkActive - 1);
    drainAdminQueue();
  }
}

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
        // Requis pour le callback Google OAuth et le lien « mot de passe oublié »
        // du Super Admin. La session reste isolée de l'app mobile via storageKey.
        detectSessionInUrl: true,
      },
      global: {
        fetch: adminSupabaseFetch,
      },
    })
  : null;

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
