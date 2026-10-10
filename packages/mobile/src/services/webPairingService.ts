import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

const PENDING_PAIRING_KEY = 'loki:web-pairing-pending';
const COMPANION_SESSION_KEY = 'loki:web-companion-session';
const CHALLENGE_KEY = 'loki:web-pairing-challenge';

export const PC_TARGET_SCREENS = [
  { name: 'Listen', label: 'Loki Music' },
  { name: 'Discover', label: 'Découvertes' },
  { name: 'MyMusic', label: 'Playlists' },
  { name: 'Parties', label: 'Soirées' },
  { name: 'Profile', label: 'Profil' },
] as const;
export type PcTargetScreen = (typeof PC_TARGET_SCREENS)[number]['name'];

export function isPcTargetScreen(screen: unknown): screen is PcTargetScreen {
  return typeof screen === 'string' && PC_TARGET_SCREENS.some((item) => item.name === screen);
}

export type DesktopPairingChallenge = {
  pairingId: string;
  token: string;
  qrUrl: string;
  expiresAt: string;
  deviceLabel: string;
};

export type WebCompanionSession = {
  id: string;
  device_label: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase indisponible');
  const { data, error } = await supabase.functions.invoke('keep-web-pairing', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function desktopDeviceLabel(): string {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'Ordinateur Loki';
  const ua = navigator.userAgent || '';
  if (/macintosh|mac os x/i.test(ua)) return 'Mac · Loki Music';
  if (/windows/i.test(ua)) return 'PC Windows · Loki Music';
  if (/linux/i.test(ua)) return 'Ordinateur Linux · Loki Music';
  return 'Ordinateur · Loki Music';
}

export async function createDesktopPairing(): Promise<DesktopPairingChallenge> {
  return invoke<DesktopPairingChallenge & { ok: true }>({
    action: 'create',
    deviceLabel: desktopDeviceLabel(),
  });
}

export async function claimDesktopPairing(pairingId: string, token: string): Promise<{ status: string; actionLink?: string }> {
  return invoke<{ ok: true; status: string; actionLink?: string }>({
    action: 'claim',
    pairingId,
    token,
  });
}

export async function approveDesktopPairing(pairingId: string, token: string): Promise<{ status: string; deviceLabel?: string }> {
  return invoke<{ ok: true; status: string; deviceLabel?: string }>({
    action: 'approve',
    pairingId,
    token,
  });
}

/** QR périmé, déjà utilisé ou annulé : ce n'est pas une panne, la demande ne doit plus être proposée. */
export class PairingUnusableError extends Error {}

export async function previewDesktopPairing(pairingId: string, token: string): Promise<{ status: string; deviceLabel?: string }> {
  try {
    return await invoke<{ ok: true; status: string; deviceLabel?: string }>({ action: 'preview', pairingId, token });
  } catch (error) {
    const status = Number((error as { context?: { status?: number } })?.context?.status);
    if (status === 404 || status === 409 || status === 410) throw new PairingUnusableError('pairing_unusable');
    throw error;
  }
}

export async function cancelDesktopPairing(pairingId: string, token: string): Promise<{ status: string }> {
  return invoke<{ ok: true; status: string }>({ action: 'cancel', pairingId, token });
}

export function parsePairingDeepLink(url: string): { pairingId: string; token: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'keep:' || parsed.hostname !== 'pair') return null;
    const pairingId = parsed.searchParams.get('pairing_id') || '';
    const token = parsed.searchParams.get('token') || '';
    if (!pairingId || !token) return null;
    return { pairingId, token };
  } catch {
    return null;
  }
}

export function rememberPendingWebPairing(pairingId: string, token: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_PAIRING_KEY, JSON.stringify({ pairingId, token }));
}

export function readPendingWebPairing(): { pairingId: string; token: string } | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_PAIRING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.pairingId && parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingWebPairing(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_PAIRING_KEY);
}

export async function registerCurrentWebCompanionSession(pairingId: string, token: string): Promise<WebCompanionSession> {
  const result = await invoke<{ ok: true; session: WebCompanionSession }>({
    action: 'register',
    pairingId,
    token,
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(COMPANION_SESSION_KEY, result.session.id);
  }
  return result.session;
}

export function currentWebCompanionSessionId(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.localStorage.getItem(COMPANION_SESSION_KEY);
}

export function clearWebCompanionSessionId(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.localStorage.removeItem(COMPANION_SESSION_KEY);
}

export async function getWebCompanionSessionStatus(sessionId: string): Promise<{ revoked: boolean; revokedAt?: string; requestedScreen?: PcTargetScreen | null; screenRequestId?: string | null }> {
  return invoke<{ ok: true; revoked: boolean; revokedAt?: string }>({
    action: 'status',
    sessionId,
  });
}

/** Envoie un vrai ordre serveur au PC jumelé ; ne crée ni QR ni autre session. */
export async function requestWebCompanionScreen(sessionId: string, screen: PcTargetScreen): Promise<void> {
  if (!isPcTargetScreen(screen)) throw new Error('Onglet ordinateur invalide.');
  await invoke<{ ok: true; requestedScreen: PcTargetScreen; screenRequestId: string }>({
    action: 'show-screen',
    sessionId,
    screen,
  });
}

export async function listWebCompanionSessions(): Promise<WebCompanionSession[]> {
  const result = await invoke<{ ok: true; sessions: WebCompanionSession[] }>({ action: 'list' });
  return Array.isArray(result.sessions) ? result.sessions : [];
}

export async function revokeWebCompanionSession(sessionId: string): Promise<boolean> {
  const result = await invoke<{ ok: true; revoked: boolean }>({ action: 'revoke', sessionId });
  return Boolean(result.revoked);
}

/**
 * Le QR affiché survit à un rechargement de la page (Adel 10/10/2026 : « j'ai scanné, ça n'a pas démarré » : le serveur a bien reçu
 * l'approbation à 00:49:04, mais la page du PC s'était rechargée 4 s plus tard et avait créé un NOUVEAU QR, perdant l'approbation).
 * Seul le jeton propre à ce navigateur est gardé (sessionStorage, onglet courant), jamais de refresh token.
 */
export function saveDesktopChallenge(challenge: DesktopPairingChallenge): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge)); } catch { /* stockage indisponible : un nouveau QR sera créé */ }
}

export function loadDesktopChallenge(now = Date.now(), minMs = 15000): DesktopPairingChallenge | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHALLENGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const left = new Date(parsed?.expiresAt).getTime() - now;
    if (!parsed?.pairingId || !parsed?.token || !parsed?.qrUrl || !Number.isFinite(left) || left < minMs) return null;
    return parsed as DesktopPairingChallenge;
  } catch { return null; }
}

export function clearDesktopChallenge(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(CHALLENGE_KEY); } catch { /* sans effet */ }
}
