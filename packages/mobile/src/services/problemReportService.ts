import { Platform } from 'react-native';
import { supabase } from './supabaseClient';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Signalement d'un problème depuis l'app (Adel, 05/10/2026) : secouer le téléphone ou « Signaler un problème » dans les réglages.
 * Le message part avec le contexte (écran, plateforme, version) dans `public.app_problem_reports` ; une IA lit ce journal,
 * localise l'écran concerné et corrige l'écart TestFlight ↔ site. Même code sur TestFlight et sur le site.
 */
export function currentScreenName(): string {
  try {
    const route: any = (navigationRef as any).getCurrentRoute?.();
    return String(route?.name ?? 'inconnu').slice(0, 120);
  } catch { return 'inconnu'; }
}

type ReportContext = { userId: string; username?: string | null };

export async function submitProblemReport(message: string, who: ReportContext): Promise<void> {
  const text = message.trim();
  if (text.length < 3) throw new Error('PROBLEM_REPORT_TOO_SHORT');
  if (!supabase || !who.userId) throw new Error('PROBLEM_REPORT_UNAVAILABLE');
  let device = '';
  try { device = String(require('expo-device').modelName ?? ''); } catch { /* web : pas de modèle */ }
  let appVersion = '';
  try {
    const constantsModule = require('expo-constants');
    const Constants = constantsModule?.default ?? constantsModule;
    appVersion = String(Constants?.expoConfig?.version ?? '');
  } catch { /* version inconnue */ }
  const { error } = await supabase.from('app_problem_reports').insert({
    user_id: who.userId,
    username: who.username ?? null,
    message: text.slice(0, 2000),
    screen: currentScreenName(),
    platform: Platform.OS,
    os_version: String(Platform.Version ?? ''),
    device: device || null,
    app_version: appVersion || null,
    build_sha: String(process.env.EXPO_PUBLIC_BUILD_SHA || '').slice(0, 40) || null,
  });
  if (error) throw error;
}

/**
 * Diagnostic automatique silencieux (Adel, 05/10/2026 : « ne reviens pas tant que t'as pas réglé ») : quand un geste clé échoue
 * (GARDER, mise en story, son), une ligne `[AUTO]` part dans `app_problem_reports` avec l'écran et la version, SANS rien demander à
 * l'utilisateur. Au plus 3 lignes par code et par session ; jamais bloquant ; jamais de donnée sensible (code d'erreur seulement).
 */
const autoReportCounts = new Map<string, number>();
export function reportAutoDiagnostic(code: string, detail?: unknown): void {
  try {
    const seen = autoReportCounts.get(code) ?? 0;
    if (seen >= 3) return;
    autoReportCounts.set(code, seen + 1);
    const { useUserStore } = require('../store/useUserStore');
    const user = useUserStore.getState().user;
    if (!user?.id || useUserStore.getState().isDemoMode || useUserStore.getState().isLocalGuest) return;
    const raw = detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : (detail as any)?.message ?? '';
    void submitProblemReport(`[AUTO] ${code}${raw ? ` — ${String(raw).slice(0, 200)}` : ''}`, { userId: user.id, username: user.username }).catch(() => {});
  } catch { /* le diagnostic ne doit jamais casser l'app */ }
}

// Ouverture de la fenêtre depuis n'importe où (secousse, réglages) : un seul point d'entrée.
const openListeners = new Set<() => void>();
export function subscribeProblemReportOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => { openListeners.delete(listener); };
}
export function openProblemReport(): void {
  openListeners.forEach((listener) => { try { listener(); } catch { /* ignoré */ } });
}

/**
 * Détection de secousse. `expo-sensors` est un module natif : un ancien binaire TestFlight ne l'a pas.
 * Le chargement est donc protégé : sans le module, aucune secousse (le bouton des réglages reste disponible), jamais de plantage.
 */
export function startShakeDetection(onShake: () => void): () => void {
  if (Platform.OS === 'web') return () => {};
  let subscription: { remove: () => void } | null = null;
  try {
    const { Accelerometer } = require('expo-sensors');
    Accelerometer.setUpdateInterval(120);
    let spikes: number[] = [];
    let lastFire = 0;
    subscription = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
      const force = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (force > 2.4) spikes.push(now);
      spikes = spikes.filter((at) => now - at < 900);
      if (spikes.length >= 3 && now - lastFire > 6000) {
        lastFire = now;
        spikes = [];
        onShake();
      }
    });
  } catch { /* module natif absent : pas de secousse */ }
  return () => { try { subscription?.remove(); } catch { /* déjà retiré */ } };
}
