/**
 * Traçage RÉEL par requête (cf. demande explicite du 23/08/2026 -- "logue
 * un identifiant unique de requête... DEVICE/BUILD/SESSION/AUDIO
 * RECEIVED/WAV VALID/ROUTER CALLED/AUDFPRINT CALLED/INDEX VERSION/MATCH
 * SCORE/RESULT/UI RESULT SENT"). En mémoire, bornée (dernières 50) --
 * diagnostic ponctuel, pas une table d'audit permanente. Consultable via
 * GET /api/dev/trace/:id et /api/dev/traces (dev uniquement, voir devTools.ts).
 *
 * STATUT HONNÊTE : pas encore une vraie page Super Admin (packages/admin
 * est une app séparée, déploiement distinct) -- ces deux endpoints donnent
 * la même visibilité en pratique pour CE diagnostic, sans attendre de
 * construire/déployer un nouvel écran. À transformer en vrai écran Super
 * Admin si ce niveau de traçage doit devenir permanent.
 */
import { randomUUID } from 'node:crypto';

export interface RequestTrace {
  requestId: string;
  timestamp: string;
  device: string;
  buildId: string | null;
  sessionId: string | null;
  guestUserId: string | null;
  audioReceivedBytes: number | null;
  wavValid: boolean | null;
  routerCalled: boolean;
  audfprintCalled: boolean;
  indexVersion: { tracks: number; hashes: number } | null;
  matchScore: number | null;
  result: 'success' | 'no_match' | 'error' | 'pending';
  resultDetail: string | null;
  noMatchReason: string | null;
  uiResultSent: boolean;
  uiResultDisplayedConfirmedAt: string | null;
}

const MAX_TRACES = 50;
const traces = new Map<string, RequestTrace>();

function parseDevice(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iPhone';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows|Macintosh|Linux/.test(userAgent)) return 'PC/Desktop';
  return 'unknown';
}

export function startTrace(opts: { userAgent?: string; buildId?: string; sessionId?: string; guestUserId?: string }): RequestTrace {
  const trace: RequestTrace = {
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    device: parseDevice(opts.userAgent),
    buildId: opts.buildId ?? null,
    sessionId: opts.sessionId ?? null,
    guestUserId: opts.guestUserId ?? null,
    audioReceivedBytes: null,
    wavValid: null,
    routerCalled: true, // atteindre ce handler = le routeur mobile a bien appelé le backend.
    audfprintCalled: false,
    indexVersion: null,
    matchScore: null,
    result: 'pending',
    resultDetail: null,
    noMatchReason: null,
    uiResultSent: false,
    uiResultDisplayedConfirmedAt: null,
  };
  traces.set(trace.requestId, trace);
  if (traces.size > MAX_TRACES) {
    const oldest = traces.keys().next().value;
    if (oldest) traces.delete(oldest);
  }
  return trace;
}

export function getTrace(id: string): RequestTrace | undefined {
  return traces.get(id);
}

export function listTraces(): RequestTrace[] {
  return Array.from(traces.values()).reverse();
}

export function confirmDisplay(id: string): boolean {
  const t = traces.get(id);
  if (!t) return false;
  t.uiResultDisplayedConfirmedAt = new Date().toISOString();
  return true;
}
