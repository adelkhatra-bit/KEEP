/**
 * Lecture de `remote_config` (cf. demande explicite du 24/08/2026 -- "Le
 * nombre 3 et le seuil 6 doivent être configurables depuis Super Admin").
 * Table réutilisée telle quelle (déjà utilisée pour
 * session_silence_timeout_minutes, voir routes/admin.ts) -- pas une
 * nouvelle table, juste un nouveau lecteur côté backend (le premier réel :
 * jusqu'ici seul Super Admin écrivait dans cette table, rien ne la lisait).
 *
 * Cache en mémoire avec TTL court plutôt qu'une requête Supabase à chaque
 * reconnaissance (coût réseau réel sur le chemin le plus fréquenté du
 * backend) -- un changement Super Admin met au maximum CACHE_TTL_MS à
 * s'appliquer, largement suffisant pour un réglage de tarification, jamais
 * un besoin de propagation instantanée.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const CACHE_TTL_MS = 30_000;

let cache: Record<string, unknown> | null = null;
let cacheFetchedAt = 0;
let inFlight: Promise<Record<string, unknown>> | null = null;

async function fetchRemoteConfig(): Promise<Record<string, unknown>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return {};
  const res = await fetch(`${SUPABASE_URL}/rest/v1/remote_config?select=key,value`, {
    headers: { apikey: SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(3000) as any,
  });
  if (!res.ok) throw new Error(`remote_config fetch failed: HTTP ${res.status}`);
  const rows = (await res.json()) as { key: string; value: unknown }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function getConfig(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cache && now - cacheFetchedAt < CACHE_TTL_MS) return cache;
  if (inFlight) return inFlight; // évite un troupeau de requêtes simultanées au premier appel/à l'expiration.
  inFlight = fetchRemoteConfig()
    .then((cfg) => {
      cache = cfg;
      cacheFetchedAt = Date.now();
      return cfg;
    })
    .catch((e) => {
      console.warn('[KEEP][remote-config] lecture échouée, valeurs par défaut conservées:', e?.message);
      return cache ?? {}; // panne réseau ponctuelle -- ne jamais faire planter la reconnaissance pour un réglage.
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Lit une valeur numérique de remote_config, avec repli sûr si absente/invalide/table injoignable. */
export async function getNumericConfig(key: string, fallback: number): Promise<number> {
  const cfg = await getConfig();
  const v = cfg[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
