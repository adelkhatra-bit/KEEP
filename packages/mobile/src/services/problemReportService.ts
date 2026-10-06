import { Platform } from 'react-native';
import { supabase } from './supabaseClient';
import { navigationRef } from '../navigation/navigationRef';
import { currentReportSurface, describeReportLocation } from './reportSurface';
import { composeReportUpdateLine, isAbusiveReport, readCrumbs, type ReportUpdate } from './reportLoop';

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

function currentRouteParamKeys(): string[] {
  try {
    const route: any = (navigationRef as any).getCurrentRoute?.();
    return Object.keys(route?.params ?? {}).slice(0, 12);
  } catch { return []; }
}

/** Contexte envoyé avec un signalement : où est l'utilisateur et ce qu'il vient de faire (jamais de contenu privé, seulement des noms d'écrans / d'actions). */
function buildReportContext(kind: string): Record<string, unknown> {
  const crumbs = readCrumbs().map((c) => ({ ago_s: Math.max(0, Math.round((Date.now() - c.t) / 1000)), kind: c.kind, label: c.label }));
  let online: boolean | null = null;
  try { online = typeof navigator !== 'undefined' && 'onLine' in navigator ? Boolean((navigator as any).onLine) : null; } catch { online = null; }
  const surface = currentReportSurface();
  return { kind, route: currentScreenName(), surface: surface ? { label: surface.label, track_id: surface.trackId ?? null, track_title: surface.trackTitle ?? null, track_artist: surface.trackArtist ?? null, index: surface.index ?? null, ...(surface.extra ?? {}) } : null, route_param_keys: currentRouteParamKeys(), crumbs, online, locale: (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return null; } })() };
}

export async function submitProblemReport(message: string, who: ReportContext, kind: 'SHAKE' | 'MANUAL' | 'AUTO' = 'MANUAL'): Promise<void> {
  const text = message.trim();
  if (text.length < 3) throw new Error('PROBLEM_REPORT_TOO_SHORT');
  if (!supabase || !who.userId) throw new Error('PROBLEM_REPORT_UNAVAILABLE');
  // Insultes : le texte n'est jamais stocké ; seule une ligne « signalé » part, le Super Admin décide de la suite (jamais de sanction automatique).
  const abusive = kind !== 'AUTO' && isAbusiveReport(text);
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
    message: abusive ? '[MESSAGE MASQUÉ — langage inapproprié]' : text.slice(0, 2000),
    screen: describeReportLocation(currentScreenName()),
    platform: Platform.OS,
    os_version: String(Platform.Version ?? ''),
    device: device || null,
    app_version: appVersion || null,
    build_sha: String(process.env.EXPO_PUBLIC_BUILD_SHA || '').slice(0, 40) || null,
    kind: abusive ? 'ABUSE' : kind,
    flagged: abusive,
    context: buildReportContext(kind),
  });
  if (error) throw error;
  if (abusive) throw new Error('PROBLEM_REPORT_ABUSIVE');
}

/**
 * Réponses de l'IA aux signalements de cet utilisateur (réparé / mise à jour nécessaire / pas de bug) : le robot les annonce UNE fois,
 * puis le signalement est marqué comme annoncé. Lecture seule + accusé de réception ; jamais bloquant.
 */
export async function announceReportUpdates(): Promise<number> {
  try {
    if (!supabase) return 0;
    const { data, error } = await supabase.rpc('keep_my_report_updates');
    if (error || !Array.isArray(data) || !data.length) return 0;
    const { robotSay } = require('./robotCoachService');
    const rows = data as any[];
    const first: ReportUpdate = { id: String(rows[0].id), screen: String(rows[0].screen ?? 'inconnu'), status: rows[0].status, note: rows[0].ai_note };
    const spoke = await robotSay('REPORT_UPDATE', { text: composeReportUpdateLine(first, Date.now()) });
    if (spoke) await supabase.rpc('keep_report_ack', { p_ids: rows.map((r) => String(r.id)) });
    return spoke ? rows.length : 0;
  } catch { return 0; }
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
