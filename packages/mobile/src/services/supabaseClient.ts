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

// 02/10/2026 : les logs Supabase ont prouvé des rafales simultanées de RPC
// au chargement (profil, Loki Pulse, crédits, chat, Pépites...) jusqu'à saturer
// Postgres : 500/504, Auth /user en timeout et profils qui semblaient vides.
// On garde UN SEUL client, mais on borne le fan-out HTTP par appareil.
// Auth n'attend jamais cette file ; les appels REST/Functions sont lissés.
// Aucun écran/design n'est modifié.
const KEEP_NETWORK_MAX_CONCURRENT = 4;
let keepNetworkActive = 0;
let keepNetworkCooldownUntil = 0;
const keepNetworkQueue: Array<() => void> = [];

function drainKeepNetworkQueue() {
  if (keepNetworkActive >= KEEP_NETWORK_MAX_CONCURRENT || !keepNetworkQueue.length) return;
  const waitMs = Math.max(0, keepNetworkCooldownUntil - Date.now());
  if (waitMs > 0) {
    setTimeout(drainKeepNetworkQueue, Math.min(waitMs, 1200));
    return;
  }
  while (keepNetworkActive < KEEP_NETWORK_MAX_CONCURRENT && keepNetworkQueue.length) {
    const next = keepNetworkQueue.shift();
    next?.();
  }
}

async function keepSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  // Auth doit toujours garder la priorité absolue. WebSocket Realtime ne passe
  // pas ici ; seules les requêtes HTTP sont concernées.
  if (url.includes('/auth/v1/')) return fetch(input, init);

  await new Promise<void>((resolve) => {
    keepNetworkQueue.push(() => {
      keepNetworkActive += 1;
      resolve();
    });
    drainKeepNetworkQueue();
  });

  try {
    const response = await fetch(input, init);
    if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
      // Petit coupe-circuit local : évite qu'un écran qui reçoit un 504
      // relance immédiatement 10 autres RPC pendant que Postgres récupère.
      keepNetworkCooldownUntil = Math.max(keepNetworkCooldownUntil, Date.now() + 900);
    }
    return response;
  } finally {
    keepNetworkActive = Math.max(0, keepNetworkActive - 1);
    drainKeepNetworkQueue();
  }
}

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
      global: {
        fetch: keepSupabaseFetch,
      },
    })
  : null;

/** Jeton d'accès de la session Loki courante, ou `null` si non connecté / Supabase non configuré. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
