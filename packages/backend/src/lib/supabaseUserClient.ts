/**
 * Client Supabase scopé à l'utilisateur courant (son propre jeton, jamais
 * service_role) -- factorisé le 23/08/2026 : keepLocalIndexStore.ts et
 * social.ts avaient chacun leur propre copie de cette construction. Respecte
 * RLS par construction (voir migrations 0006_rls.sql) -- c'est PRÉCISÉMENT
 * pour ça que la plupart des routes KEEP n'ont jamais eu besoin de
 * service_role, contrairement à ce qui avait été supposé initialement.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function isSupabaseUserClientConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
}

export function supabaseUserClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
}
