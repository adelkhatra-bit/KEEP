import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Vibration } from 'react-native';
import { canRobotSpeak, composeRobotLine, LOW_FREE_THRESHOLD, type Memory, type RobotCoachKind } from './robotCoachMessages';
import { useRobotMessageStore } from '../store/useRobotMessageStore';
import { playNotificationCue } from './notificationSoundService';
import { useGameSessionStore } from '../store/useGameSessionStore';

/**
 * Robot coach (Adel, 05/10/2026) : parle de temps en temps, jamais « prise de tête ».
 *  - SESSIONS : à chaque nouvelle session prête (au plus une fois par minute), avec une courte vibration et un son discret ;
 *  - NO_FREE / NO_SOLO : quand l'utilisateur n'a plus de FREE / de Solo, au plus 2 fois par jour et 6 h d'écart, avec une phrase différente à chaque fois.
 */
const KEY = 'keep:robot:coach:v1';
export async function robotSay(kind: RobotCoachKind, options: { count?: number; username?: string } = {}): Promise<boolean> {
  // Règles d'Adel (05/10/2026) : jamais pendant un Solo ni un Battle en ligne (ni message, ni vibration) ; jamais deux messages en même temps.
  if (useGameSessionStore.getState().isGameInProgress) return false;
  if (useRobotMessageStore.getState().message) return false;
  const now = Date.now();
  let memory: Memory = {};
  try { const raw = await AsyncStorage.getItem(KEY); memory = raw ? JSON.parse(raw) : {}; } catch { memory = {}; }
  if (!canRobotSpeak(memory, kind, now)) return false;
  const today = new Date(now).toISOString().slice(0, 10);
  const previous = memory[kind];
  memory[kind] = { lastAt: now, day: today, count: previous && previous.day === today ? previous.count + 1 : 1 };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* sans mémoire : le robot parlera un peu plus */ }
  useRobotMessageStore.getState().say(kind, composeRobotLine(kind, `${now}:${Math.floor(Math.random() * 1e9)}`, options.count ?? 0, options.username ?? ''));
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
  await robotSay('GREETING', { username });
}
