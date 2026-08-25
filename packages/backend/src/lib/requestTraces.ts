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

/**
 * Étape nommée d'une tentative (cf. demande explicite du 23/08/2026 --
 * "USER_TAP -> MICRO_STARTED -> AUDIO_CAPTURED -> LOCAL_INDEX_CALLED ->
 * AUDFPRINT_RESULT -> FALLBACK_RESULT -> UI_RESULT", PASS/FAIL + durée
 * pour chacune). `AUTH_TOKEN` ajouté en plus de sa liste -- c'est
 * exactement l'étape qui a échoué en silence jusqu'ici (mur "connecte-toi"
 * malgré ensureGuestSession()), elle doit être visible comme les autres.
 */
export interface TraceStep {
  name: 'USER_TAP' | 'MIC_STARTED' | 'AUDIO_CAPTURED' | 'AUDIO_LEVEL' | 'AUTH_TOKEN' | 'LOCAL_INDEX_CALLED' | 'AUDFPRINT_RESULT' | 'FALLBACK_RESULT' | 'UI_RESULT';
  status: 'ok' | 'fail';
  atMs: number;
  detail?: string;
}

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
  /** Cf. demande explicite du 23/08/2026 -- trace pas à pas, PASS/FAIL + durée entre chaque étape. */
  steps: TraceStep[];
}

const MAX_TRACES = 50;
const traces = new Map<string, RequestTrace>();
const traceStartedAtMs = new Map<string, number>();

function parseDevice(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iPhone';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows|Macintosh|Linux/.test(userAgent)) return 'PC/Desktop';
  return 'unknown';
}

/**
 * `requestId` optionnel (cf. demande explicite du 23/08/2026) : si le mobile
 * a déjà commencé une trace côté client (USER_TAP/MICRO_STARTED/AUDIO_CAPTURED
 * envoyés via POST /api/dev/trace-step AVANT même que ce handler ne soit
 * atteint), on CONTINUE cette même trace au lieu d'en générer une nouvelle --
 * sinon les étapes client et serveur d'une même tentative réelle finiraient
 * dans deux enregistrements différents, impossible à recoller.
 */
export function startTrace(opts: {
  requestId?: string;
  userAgent?: string;
  buildId?: string;
  sessionId?: string;
  guestUserId?: string;
}): RequestTrace {
  const existing = opts.requestId ? traces.get(opts.requestId) : undefined;
  if (existing) {
    // Complète les champs connus seulement une fois le vrai appel backend atteint.
    if (opts.buildId) existing.buildId = opts.buildId;
    if (opts.sessionId) existing.sessionId = opts.sessionId;
    if (opts.guestUserId) existing.guestUserId = opts.guestUserId;
    existing.routerCalled = true;
    return existing;
  }
  const trace: RequestTrace = {
    requestId: opts.requestId ?? randomUUID(),
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
    steps: [],
  };
  traces.set(trace.requestId, trace);
  traceStartedAtMs.set(trace.requestId, Date.now());
  if (traces.size > MAX_TRACES) {
    const oldest = traces.keys().next().value;
    if (oldest) {
      traces.delete(oldest);
      traceStartedAtMs.delete(oldest);
    }
  }
  return trace;
}

/**
 * Ajoute une étape nommée à une trace, en la créant si elle n'existe pas
 * encore (cf. demande explicite du 23/08/2026) -- appelé côté client AVANT
 * tout appel backend réel (USER_TAP/MICRO_STARTED/AUDIO_CAPTURED/AUTH_TOKEN),
 * donc la trace n'existe pas forcément déjà quand la première étape arrive.
 */
export function addStep(requestId: string, name: TraceStep['name'], status: TraceStep['status'], detail?: string): void {
  let trace = traces.get(requestId);
  if (!trace) {
    trace = startTrace({ requestId });
    trace.routerCalled = false; // recréée depuis une étape client -- pas encore prouvé que le backend /identify a été appelé.
  }
  const startedAt = traceStartedAtMs.get(requestId) ?? Date.now();
  trace.steps.push({ name, status, atMs: Date.now() - startedAt, detail });
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
