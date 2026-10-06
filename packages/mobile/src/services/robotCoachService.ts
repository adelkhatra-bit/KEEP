import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Vibration } from 'react-native';
import { canRobotSpeak, composeRobotLine, LOW_FREE_THRESHOLD, type Memory, type RobotCoachKind } from './robotCoachMessages';
import { useRobotMessageStore } from '../store/useRobotMessageStore';
import { playNotificationCue } from './notificationSoundService';
import { useGameSessionStore } from '../store/useGameSessionStore';
import { composeCall, composeWelcomeBack, HELP_ACTIONS, pickTip, shouldWelcomeBack, spokenWelcome, type HelpActionKey, type RobotAction } from './robotHelp';

/**
 * Robot coach (Adel, 05/10/2026) : parle de temps en temps, jamais « prise de tête ».
 *  - SESSIONS : à chaque nouvelle session prête (au plus une fois par minute), avec une courte vibration et un son discret ;
 *  - NO_FREE / NO_SOLO : quand l'utilisateur n'a plus de FREE / de Solo, au plus 2 fois par jour et 6 h d'écart, avec une phrase différente à chaque fois.
 */
const KEY = 'keep:robot:coach:v1';
export async function robotSay(kind: RobotCoachKind, options: { count?: number; username?: string; text?: string; actions?: RobotAction[]; force?: boolean } = {}): Promise<boolean> {
  // Règles d'Adel (05/10/2026) : jamais pendant un Solo ni un Battle en ligne (ni message, ni vibration) ; jamais deux messages en même temps.
  if (useGameSessionStore.getState().isGameInProgress) return false;
  if (useRobotMessageStore.getState().message && !options.force) return false;
  if (useRobotMessageStore.getState().quiet > 0) return false;
  const now = Date.now();
  let memory: Memory = {};
  try { const raw = await AsyncStorage.getItem(KEY); memory = raw ? JSON.parse(raw) : {}; } catch { memory = {}; }
  if (!options.force && !canRobotSpeak(memory, kind, now)) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  const previous = memory[kind];
  memory[kind] = { lastAt: now, day: today, count: previous && previous.day === today ? previous.count + 1 : 1 };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* sans mémoire : le robot parlera un peu plus */ }
  useRobotMessageStore.getState().say(kind, options.text ?? composeRobotLine(kind, `${now}:${Math.floor(Math.random() * 1e9)}`, options.count ?? 0, options.username ?? ''), options.actions);
  // Le robot « s'agite » : vibration (motif sur Android, une vibration sur iPhone). Son discret seulement pour les sessions et le solde bas.
  try { if (Platform.OS !== 'web') Vibration.vibrate(kind === 'GREETING' ? [0, 40, 60, 40] : [0, 70, 50, 70]); } catch { /* sans vibreur */ }
  if (kind === 'SESSIONS' || kind === 'LOW_FREE') void playNotificationCue('DEFAULT').catch(() => {});
  return true;
}

let welcomedFor: string | null = null;
/**
 * Accueil du robot (Adel, 05/10/2026) : à l'ouverture, UN message utile — solde FREE vide ou bas (avec de quoi en gagner), sinon un salut jeune avec le pseudo.
 * Une seule fois par lancement et par compte ; les délais (6 h / 12 h, max par jour) évitent tout harcèlement.
 */
export async function robotWelcome(profileId: string, username: string, loadBalance: () => Promise<number | null>): Promise<void> {
  if (!profileId || welcomedFor === profileId) return;
  welcomedFor = profileId;
  let balance: number | null = null;
  try { balance = await loadBalance(); } catch { balance = null; }
  if (balance !== null && balance <= 0 && await robotSay('NO_FREE')) return;
  if (balance !== null && balance > 0 && balance <= LOW_FREE_THRESHOLD && await robotSay('LOW_FREE', { count: balance })) return;
  // Accueil intelligent (Adel, 06/10/2026) : « Salut {pseudo} » seulement après une vraie absence, jamais à chaque ouverture ; avec la voix la première fois du jour.
  const lastActive = await readLastActive();
  if (!shouldWelcomeBack(lastActive, Date.now())) { void markRobotActive(); return; }
  const seed = Date.now();
  const spoke = await robotSay('WELCOME_BACK', { text: composeWelcomeBack(username, seed), actions: HELP_ACTIONS });
  void markRobotActive();
  if (spoke) void speakOncePerDay(spokenWelcome(username, seed));
}

const LAST_ACTIVE_KEY = 'keep:robot:lastActive:v1';
const VOICE_DAY_KEY = 'keep:robot:voiceDay:v1';
async function readLastActive(): Promise<number | null> {
  try { const raw = await AsyncStorage.getItem(LAST_ACTIVE_KEY); const value = raw ? Number(raw) : NaN; return Number.isFinite(value) ? value : null; } catch { return null; }
}
/** Mémorise « l'utilisateur est là » (appelé toutes les minutes et au passage en arrière-plan) : sert à savoir s'il revient après une absence. */
export async function markRobotActive(): Promise<void> {
  try { await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* sans mémoire : le robot saluera à chaque lancement */ }
}
async function speakOncePerDay(text: string): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if ((await AsyncStorage.getItem(VOICE_DAY_KEY)) === today) return;
    await AsyncStorage.setItem(VOICE_DAY_KEY, today);
    const { speakLokiText } = require('./lokiSpeechService');
    await speakLokiText(text);
  } catch { /* la voix est un bonus : jamais bloquante */ }
}

/** Secousse (Adel, 06/10/2026) : le robot propose plusieurs directions ; « Un souci » ouvre le signalement. */
export async function summonRobotMenu(username: string): Promise<boolean> {
  const { SHAKE_ACTIONS } = require('./robotHelp');
  const name = String(username || '').trim().replace(/^@+/, '');
  return robotSay('ROBOT_CALL', { text: `On fait quoi${name ? `, ${name}` : ''} ?`, actions: SHAKE_ACTIONS, force: true });
}

/** Appel du robot (5 touchers rapprochés) : « Qu'est-ce que je peux faire pour toi, {pseudo} ? » + les trois propositions, à voix haute. */
export async function summonRobot(username: string): Promise<boolean> {
  const seed = Date.now();
  const spoke = await robotSay('ROBOT_CALL', { text: composeCall(username, seed), actions: HELP_ACTIONS, force: true });
  if (spoke) {
    try { const { speakLokiText } = require('./lokiSpeechService'); void speakLokiText(composeCall(username, seed).replace(' Choisis ce qui te tente :', '')); } catch { /* voix facultative */ }
  }
  return spoke;
}

/** Explication du robot une fois arrivé à l'endroit choisi : quoi toucher, en deux phrases. */
export async function robotExplain(key: HelpActionKey): Promise<boolean> {
  return robotSay('ROBOT_TIP', { text: pickTip(key, Date.now()), force: true });
}
