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
// Aucun écran/design n'est modifié.
//
// ERR-PROFILE-QUEUE-STARVATION-031 (02/10/2026, reproduit dans Chromium avec les
// vraies données du compte « inside ») : avec 1 seule requête à la fois, en
// ordre d'arrivée, les ~88 requêtes du démarrage passaient avant les musiques
// et les FREE de l'utilisateur. À 3 s par requête côté serveur, le profil
// restait « 0 morceau / … FREE » plus de 2 minutes alors que les données
// étaient prêtes. Règles verrouillées (config/keep-product-contract.json >
// networkQueue, contrôlées par verify-product-contract.cjs) :
//  - le contenu essentiel de l'utilisateur passe TOUJOURS en premier ;
//  - seule une vraie connexion (mot de passe / pseudo / bootstrap profil) met
//    la file en pause, jamais une simple vérification de session ;
//  - quelques requêtes en parallèle, pause après erreur plafonnée.
const KEEP_NETWORK_MAX_CONCURRENT = 3;
const KEEP_NETWORK_FAILURE_BASE_COOLDOWN_MS = 1500;
const KEEP_NETWORK_FAILURE_MAX_COOLDOWN_MS = 10000;
let keepNetworkActive = 0;
let keepNetworkCooldownUntil = 0;
let keepNetworkFailureStreak = 0;
let keepNetworkCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let keepAuthPriorityActive = 0;
const keepNetworkQueue: Array<() => void> = [];
const keepNetworkPriorityQueue: Array<() => void> = [];

// Le contenu que l'utilisateur vient voir : son profil, ses musiques, ses
// FREE, ses playlists, ses GARDER. Jamais derrière Battle/notifications/options.
const KEEP_ESSENTIAL_CONTENT_PATHS = [
  '/rest/v1/rpc/keep_own_profile_tracks',
  '/rest/v1/rpc/keep_own_profile_snapshot',
  '/rest/v1/rpc/keep_public_profile_snapshot',
  '/rest/v1/rpc/keep_public_profile_tracks',
  '/rest/v1/rpc/keep_battle_credit_status',
  '/rest/v1/rpc/keep_download_credit_status',
  '/rest/v1/rpc/keep_loki_pulse',
  // Attendues avec les blocs ci-dessus par l'écran Profil (Promise.all /
  // allSettled) : en fin de file, elles retenaient tout l'affichage.
  '/rest/v1/rpc/keep_profile_discovery_impacts',
  '/rest/v1/rpc/keep_free_spent_today',
  '/rest/v1/rpc/keep_battle_profile_battle_stats_daily',
  // Pseudo du découvreur de chaque morceau (hydrateSourceUsernames) : la liste
  // des musiques attend ces réponses avant de s'afficher.
  '/rest/v1/rpc/keep_track_first_discoveries',
  '/rest/v1/rpc/keep_public_certification_tiers',
  '/rest/v1/follows',
  '/rest/v1/profiles',
  '/rest/v1/playlists',
  '/rest/v1/playlist_tracks',
  '/rest/v1/keep_decisions',
  '/rest/v1/tracks',
];

function isEssentialContentUrl(url: string) {
  return KEEP_ESSENTIAL_CONTENT_PATHS.some((path) => url.includes(`${path}?`) || url.endsWith(path));
}

// Requêtes Auth : jamais mises en file.
function isCriticalAuthUrl(url: string) {
  return url.includes('/auth/v1/')
    || url.includes('/functions/v1/keep-username-auth')
    || url.includes('/functions/v1/keep-auth-email')
    || url.includes('/functions/v1/keep-profile-bootstrap');
}

// Seule une vraie connexion réserve toute la capacité (pas /auth/v1/user ni le
// renouvellement de jeton, qui reviennent sans cesse et bloquaient tout).
function isExplicitLoginUrl(url: string) {
  return url.includes('grant_type=password')
    || url.includes('/functions/v1/keep-username-auth')
    || url.includes('/functions/v1/keep-auth-email')
    || url.includes('/functions/v1/keep-profile-bootstrap');
}

function nextQueuedRequest() {
  return keepNetworkPriorityQueue.shift() ?? keepNetworkQueue.shift();
}

function drainKeepNetworkQueue() {
  // Pendant une vraie connexion, aucun nouveau RPC secondaire ne démarre.
  if (keepAuthPriorityActive > 0) return;
  const pending = keepNetworkPriorityQueue.length + keepNetworkQueue.length;
  if (keepNetworkActive >= KEEP_NETWORK_MAX_CONCURRENT || !pending) return;
  const waitMs = Math.max(0, keepNetworkCooldownUntil - Date.now());
  if (waitMs > 0) {
    // Un seul timer de reprise. Avant ce garde-fou, chaque composant en attente
    // pouvait programmer son propre réveil et recréer une rafale dès que
    // PostgREST revenait.
    if (!keepNetworkCooldownTimer) {
      keepNetworkCooldownTimer = setTimeout(() => {
        keepNetworkCooldownTimer = null;
        drainKeepNetworkQueue();
      }, Math.min(waitMs, 1200));
    }
    return;
  }
  while (keepNetworkActive < KEEP_NETWORK_MAX_CONCURRENT && (keepNetworkPriorityQueue.length || keepNetworkQueue.length)) {
    const next = nextQueuedRequest();
    next?.();
  }
}

async function keepSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Priorité absolue à TOUT le chemin de connexion, pas seulement GoTrue.
  // Le login par pseudo passe par keep-username-auth et l'hydratation critique
  // par keep-profile-bootstrap : les laisser derrière Pulse/chat/crédits était
  // précisément la raison des écrans "Le service met plus de temps..." vus le
  // 02/10 pendant la saturation Postgres.
  if (isCriticalAuthUrl(url)) {
    const reservesLane = isExplicitLoginUrl(url);
    if (reservesLane) keepAuthPriorityActive += 1;
    try {
      return await fetch(input, init);
    } finally {
      if (reservesLane) keepAuthPriorityActive = Math.max(0, keepAuthPriorityActive - 1);
      drainKeepNetworkQueue();
    }
  }

  const targetQueue = isEssentialContentUrl(url) ? keepNetworkPriorityQueue : keepNetworkQueue;
  await new Promise<void>((resolve) => {
    targetQueue.push(() => {
      keepNetworkActive += 1;
      resolve();
    });
    drainKeepNetworkQueue();
  });

  try {
    const response = await fetch(input, init);
    if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
      // Vrai coupe-circuit progressif. PGRST002 / 500 / 503 / 504 signifient
      // que la base ou son pool de connexions ne peut plus absorber le trafic.
      // On ne martèle plus le serveur : 2,5 s -> 5 s -> 10 s -> 20 s -> 30 s.
      // L'auth critique reste TOUJOURS hors de cette file et peut donc passer.
      keepNetworkFailureStreak = Math.min(8, keepNetworkFailureStreak + 1);
      const cooldown = Math.min(
        KEEP_NETWORK_FAILURE_MAX_COOLDOWN_MS,
        KEEP_NETWORK_FAILURE_BASE_COOLDOWN_MS * (2 ** Math.min(keepNetworkFailureStreak - 1, 4)),
      );
      keepNetworkCooldownUntil = Math.max(keepNetworkCooldownUntil, Date.now() + cooldown);
    } else if (response.ok) {
      // Une réponse saine confirme la récupération progressive du backend.
      // On redescend doucement au lieu de relancer toute la file d'un coup.
      keepNetworkFailureStreak = Math.max(0, keepNetworkFailureStreak - 1);
      if (keepNetworkFailureStreak === 0) keepNetworkCooldownUntil = 0;
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
