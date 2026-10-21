import AsyncStorage from '@react-native-async-storage/async-storage';

// Mesure « temps réel » contre « appels de secours » (demande d'Adel du
// 21/10/2026 : mesurer avant de changer la fréquence de secours du tchat
// (2,5 s) ou de la synchronisation des sessions (12 s)).
//
// Uniquement des COMPTEURS sur l'appareil : aucun contenu, aucun identifiant de
// message ou de session. Ils partent seulement avec un « Signaler un problème »
// (contexte du signalement, table existante app_problem_reports), jamais seuls.
//
// Lecture : un appel de secours « utile » est un appel qui a réellement apporté
// une nouveauté que le temps réel n'avait pas encore livrée.

export type SyncDiagnosticKey =
  | 'sessionTimerPull'
  | 'sessionTimerPullChanged'
  | 'sessionRealtimeEvent'
  | 'sessionRealtimePull'
  | 'sessionRealtimePullChanged'
  | 'chatRealtimeEvent'
  | 'chatSafetyRefresh'
  | 'chatSafetyRefreshFoundNew';

type Counters = Record<SyncDiagnosticKey, number> & { since: string };

const STORAGE_KEY = 'loki:sync-diagnostics:v1';
const SAVE_EVERY_MS = 30_000;

const empty = (): Counters => ({
  since: new Date().toISOString(),
  sessionTimerPull: 0,
  sessionTimerPullChanged: 0,
  sessionRealtimeEvent: 0,
  sessionRealtimePull: 0,
  sessionRealtimePullChanged: 0,
  chatRealtimeEvent: 0,
  chatSafetyRefresh: 0,
  chatSafetyRefreshFoundNew: 0,
});

let counters: Counters = empty();
let loaded = false;
let lastSave = 0;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object') {
      const merged = empty();
      for (const key of Object.keys(merged) as Array<keyof Counters>) {
        if (key === 'since') { if (typeof saved.since === 'string') merged.since = saved.since; continue; }
        const value = Number(saved[key]);
        (merged as any)[key] = Number.isFinite(value) && value >= 0 ? value + (counters as any)[key] : (counters as any)[key];
      }
      counters = merged;
    }
  } catch {
    // Stockage indisponible : on garde les compteurs en mémoire.
  }
}

function persistSoon(now: number): void {
  if (now - lastSave < SAVE_EVERY_MS) return;
  lastSave = now;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(counters)).catch(() => {});
}

/** Ajoute 1 (ou n) à un compteur. Ne jette jamais. */
export function countSyncDiagnostic(key: SyncDiagnosticKey, n = 1): void {
  try {
    counters[key] = (counters[key] ?? 0) + n;
    void ensureLoaded().then(() => persistSoon(Date.now()));
  } catch {
    // Un compteur ne doit jamais casser l'app.
  }
}

/** Instantané joint au contexte d'un signalement (chiffres seulement). */
export function syncDiagnosticsSnapshot(): Counters {
  return { ...counters };
}

/** Réservé aux tests. */
export function __resetSyncDiagnosticsForTests(): void {
  counters = empty();
  loaded = false;
  lastSave = 0;
}
