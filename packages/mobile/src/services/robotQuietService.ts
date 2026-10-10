// Le robot sait se faire discret (Adel, 10/10/2026, IDEA-211) : toute info du robot se ferme d'un toucher ; si l'utilisateur en ferme plusieurs
// d'affilée, le robot propose de le laisser tranquille, avec une punchline. Logique PURE + mémoire locale (AsyncStorage).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RobotAction } from './robotHelp';

export const DISMISS_THRESHOLD = 3;
export const DISMISS_WINDOW_MS = 20 * 60 * 1000;
export const QUIET_DURATION_MS = 2 * 60 * 60 * 1000;
const KEY_QUIET_UNTIL = 'keep:robot:quietUntil:v1';

/** Ajoute une fermeture ; vrai quand c'est la 3e en 20 minutes (le robot doit alors proposer le silence). */
export function pushDismissal(history: number[], now: number): { history: number[]; offerQuiet: boolean } {
  const recent = [...history.filter((at) => now - at <= DISMISS_WINDOW_MS), now];
  return recent.length >= DISMISS_THRESHOLD ? { history: [], offerQuiet: true } : { history: recent, offerQuiet: false };
}

let dismissals: number[] = [];
export function registerRobotDismissal(now = Date.now()): boolean {
  const next = pushDismissal(dismissals, now);
  dismissals = next.history;
  return next.offerQuiet;
}

const OFFERS = [
  'Je vois que mes infos te saoulent 😅 Tu veux que je te laisse tranquille pour savourer ton bon moment ?',
  'Ok ok, j’ai capté : tu kiffes ta zik sans moi. Je me fais petit pendant un moment ?',
  'Même les meilleurs DJ savent quand couper le micro. Je te laisse savourer, ça te va ?',
  'Je parle trop ? Un bon son, ça s’écoute en silence. Je te laisse tranquille un moment ?',
  'Message reçu cinq sur cinq 🎧 Je ferme ma bouche robotique le temps que tu savoures ?',
];
export const QUIET_ACTIONS: RobotAction[] = [
  { key: 'QUIET', label: '🤫 Oui, tranquille 2 h', route: '' },
  { key: 'CONTINUE', label: '💬 Non, continue', route: '' },
];
export const QUIET_CONFIRMS = ['Ça marche, je me fais discret 🤫 Appelle-moi en secouant ton téléphone.', 'Promis, plus un bip. Une secousse et je reviens !'];

export function composeQuietOffer(seed = 0): { text: string; actions: RobotAction[] } {
  return { text: OFFERS[Math.abs(Math.floor(seed)) % OFFERS.length], actions: QUIET_ACTIONS };
}

export async function setRobotQuiet(durationMs = QUIET_DURATION_MS, now = Date.now()): Promise<void> {
  try { await AsyncStorage.setItem(KEY_QUIET_UNTIL, String(now + durationMs)); } catch { /* sans mémoire : silence jusqu'au prochain lancement */ }
  quietUntilMemory = now + durationMs;
}
let quietUntilMemory = 0;
export async function isRobotQuiet(now = Date.now()): Promise<boolean> {
  if (quietUntilMemory > now) return true;
  try {
    const raw = await AsyncStorage.getItem(KEY_QUIET_UNTIL);
    const until = raw ? Number(raw) : 0;
    quietUntilMemory = Number.isFinite(until) ? until : 0;
  } catch { /* lecture impossible : le robot reste silencieux seulement via la mémoire */ }
  return quietUntilMemory > now;
}
