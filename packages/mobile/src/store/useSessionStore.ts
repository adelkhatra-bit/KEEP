import { create } from 'zustand';
import { CanonicalTrack, RecognitionRouterResult } from '@keep/music';
import { KeepSession, SessionTrackEntry, SessionTrackStatus } from '../types';
import { musicEngine } from '../services/musicEngine';
import { commitKeep } from '../services/keepTrackAction';
import { captureAudioSample, MicPermissionDeniedError, CaptureDiagnostics, releaseCaptureResources } from '../services/micCapture';
import { useSessionHistoryStore } from './useSessionHistoryStore';
import { useMusicServiceStore } from './useMusicServiceStore';
import { useUserStore } from './useUserStore';
import { useRecognitionTelemetryStore, RecognitionOutcome } from './useRecognitionTelemetryStore';
import { fetchRecognitionConfig, fetchMySubscription } from '../services/billingApi';
import { pushKeepDecision, patchKeepVisibility } from '../services/profileApi';
import { DEFAULT_RECOGNITION_SETTINGS } from '../config/recognitionSettings';
import i18n from '../i18n';

/**
 * Moteur de session KEEP (cahier des charges — concept corrigé du 21/08/2026) :
 * KEEP n'est pas un lecteur ("Écouter"), c'est la mémoire musicale d'un
 * moment vécu. DÉMARRER UNE SESSION -> KEEP identifie successivement les
 * morceaux entendus -> GARDER/PASSER au fil de l'eau ou plus tard depuis le
 * récapitulatif -> fin automatique après une période sans musique.
 *
 * DÉMO : la cadence de reconnaissance simule un DJ qui enchaîne les
 * morceaux, en interrogeant recognitionProvider.recognize() à intervalle
 * régulier — pas de vrai buffer micro (voir docs/PROJECT_STATUS.md).
 * MODE RÉEL : chaque tick capture un vrai échantillon micro (voir
 * services/micCapture.ts) tant que KEEP est au premier plan. La continuité
 * en arrière-plan (écran verrouillé) est un chantier séparé, contraint par
 * l'OS — voir docs/PLATFORM_COMPLIANCE.md section "Continuité de la
 * reconnaissance en session" : ne jamais prétendre écouter en permanence
 * tant que ce n'est pas réellement câblé et vérifié sur un vrai appareil.
 *
 * PROTECTION QUOTA (cf. demande explicite du 23/08/2026 -- "une soirée de
 * plusieurs heures ne doit pas consommer des centaines de requêtes
 * inutiles") : la boucle ne tourne plus à intervalle fixe aveugle, elle se
 * reprogramme après chaque tentative selon ce qui vient de se passer --
 * cooldown après un morceau reconnu (probablement encore en train de jouer),
 * backoff exponentiel après une erreur transitoire, arrêt complet après une
 * erreur de quota/autorisation (jamais marteler une clé épuisée). Voir
 * config/recognitionSettings.ts pour les valeurs (Super Admin, coded pas
 * encore connected).
 */
const SILENCE_CHECK_INTERVAL_MS = 15000;

/**
 * Mode debug TEMPORAIRE (cf. investigation du 23/08/2026 -- échec réel
 * persistant sur iPhone après le fix AudioContext, backend toujours à 0
 * requête reçue malgré le fix confirmé déployé). Affiche le détail
 * technique brut dans le message d'erreur normalement visible par
 * l'utilisateur -- déroge sciemment à la règle "jamais d'erreur technique
 * visible" UNIQUEMENT pour ce diagnostic ciblé, opt-in via variable d'env,
 * jamais actif par défaut. À retirer une fois la vraie cause identifiée.
 */
const DEBUG_RECOGNITION = process.env.EXPO_PUBLIC_DEBUG_RECOGNITION === 'true';
function withDebugDetail(userMessage: string, technicalDetail: string): string {
  return DEBUG_RECOGNITION ? `${userMessage}\n[DEBUG] ${technicalDetail}` : userMessage;
}

/**
 * Diagnostic E2E réel (cf. demande explicite du 23/08/2026 -- "ne suppose
 * rien, mesure-le", audit MIC PERMISSION/AUDIOCONTEXT/RMS/PEAK/ROUTER/ENGINE).
 * DEV UNIQUEMENT (voir appels : `if (__DEV__ && ...)`), fire-and-forget --
 * ne doit JAMAIS ralentir/faire échouer une reconnaissance réelle pour de
 * la télémétrie de diagnostic. Le backend (routes/devTools.ts) se protège
 * lui-même en plus via NODE_ENV.
 */
// Un silence répété (personne à côté du micro, poche, etc.) ne doit PAS
// spammer le diagnostic à chaque tick (~8-10s) -- constaté en vrai le
// 23/08/2026 : 245 envois en 50 min depuis un onglet PC silencieux, du bruit
// pur, aucun signal utile en plus. Résultat/erreur réels toujours envoyés
// immédiatement (jamais throttlés) -- seul le cas routine "silence, on
// retente" est espacé.
const DIAGNOSTIC_SILENCE_THROTTLE_MS = 60000;
let lastSilenceDiagnosticSentAt = 0;

function isRoutineSilence(diag: CaptureDiagnostics, routed: RecognitionRouterResult | null): boolean {
  if (routed?.result) return false; // vrai match -- jamais throttlé.
  if (diag.error && !/signal quasi silencieux/i.test(diag.error)) return false; // vraie erreur (permission, etc.) -- jamais throttlé.
  if (routed?.attempts.some((a) => a.outcome === 'error')) return false; // erreur provider (quota, session) -- jamais throttlé.
  return true;
}

function sendDevDiagnostic(
  diag: CaptureDiagnostics,
  routed: RecognitionRouterResult | null,
  capturedBlob: Blob | ArrayBuffer | null,
  routerLatencyMs?: number
): void {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;

  if (isRoutineSilence(diag, routed)) {
    const now = Date.now();
    if (now - lastSilenceDiagnosticSentAt < DIAGNOSTIC_SILENCE_THROTTLE_MS) return;
    lastSilenceDiagnosticSentAt = now;
  }

  // Identification RÉELLE de la requête (cf. demande explicite du 23/08/2026
  // -- "identifie formellement que la requête vient bien de mon iPhone, et
  // pas du PC" + "BUILD ID visible pour savoir si mon téléphone utilise la
  // dernière version"). userAgent distingue iPhone/Safari d'un PC sans
  // ambiguïté ; buildId change à chaque redémarrage volontaire du serveur
  // mobile -- un diagnostic avec un ANCIEN buildId prouve un onglet resté
  // ouvert sur du vieux code, pas un vrai échec du correctif actuel.
  const sessionState = useSessionStore.getState();
  const userState = useUserStore.getState();
  const payload = {
    timestamp: new Date().toISOString(),
    buildId: process.env.EXPO_PUBLIC_BUILD_ID ?? '(non renseigné)',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '(non disponible)',
    sessionId: sessionState.sessionId,
    sessionStartedAt: sessionState.startedAt,
    guestUserId: userState.user?.id ?? null,
    isDemoMode: userState.isDemoMode,
    micPermission: diag.micPermission,
    micDeviceFound: diag.micDeviceFound,
    micDeviceLabel: diag.micDeviceLabel,
    audioContextStateBefore: diag.audioContextStateBefore,
    audioContextStateDuring: diag.audioContextStateDuring,
    audioContextStateAfter: diag.audioContextStateAfter,
    inputSampleRate: diag.inputSampleRate,
    requestedCaptureDurationMs: diag.requestedCaptureDurationMs,
    actualChunksReceived: diag.actualChunksReceived,
    rmsLevel: diag.rmsLevel,
    peakLevel: diag.peakLevel,
    wavSizeBytes: diag.wavSizeBytes,
    wavDurationSec: diag.wavDurationSec,
    captureError: diag.error,
    routerCalled: !!routed,
    engineCalled: routed?.result?.engine ?? null,
    matchScore: routed?.result?.confidence ?? null,
    routerAttempts: routed?.attempts ?? null,
    /** Fin de capture -> réponse du routeur (composant "moteur" du délai perçu, pas encore l'affichage complet -- voir event 'e2e_result_shown' pour le total réel). */
    routerLatencyMs: routerLatencyMs ?? null,
  };

  fetch(`${apiUrl}/api/dev/diagnostic-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});

  if (capturedBlob) {
    fetch(`${apiUrl}/api/dev/capture-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: capturedBlob as any,
    }).catch(() => {});
  }
}

type TraceStepName = 'USER_TAP' | 'MIC_STARTED' | 'AUDIO_CAPTURED' | 'AUDIO_LEVEL' | 'AUTH_TOKEN' | 'UI_RESULT';

/**
 * Cf. demande explicite du 23/08/2026 -- "trace une tentative réelle avec un
 * REQUEST_ID unique depuis mon clic jusqu'au résultat : USER_TAP ->
 * MIC_STARTED -> AUDIO_CAPTURED -> AUDIO_LEVEL -> LOCAL_INDEX_CALLED ->
 * AUDFPRINT_RESULT -> FALLBACK_RESULT -> UI_RESULT, PASS/FAIL + durée". Les 3 étapes serveur
 * sont ajoutées par routes/recognition.ts (même requestId, voir
 * requestTraces.ts) -- ceci ne couvre que les étapes qui se produisent
 * AVANT tout appel backend (donc pas protégeables par le jeton de session
 * qu'on est justement en train d'établir). DEV uniquement, fire-and-forget --
 * ne doit jamais ralentir/faire échouer une reconnaissance réelle.
 */
function sendTraceStep(requestId: string, step: TraceStepName, status: 'ok' | 'fail', detail?: string): void {
  if (!__DEV__) return;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;
  console.log(`[KEEP][TRACE][${requestId}] STEP=${step} STATUS=${status}${detail ? ` DETAIL=${detail}` : ''}`);
  fetch(`${apiUrl}/api/dev/trace-step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, step, status, detail }),
  }).catch(() => {});
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isQuotaOrAuthError(message: string): boolean {
  return /limit was reached|authorization failed|erreur 90[0-3]/i.test(message);
}

/**
 * "Pas connecté" n'est pas une panne technique -- c'est un état normal
 * (Mode Démo, ou pas encore de session KEEP réelle) qui mérite un message
 * clair et actionnable, pas noyé dans "reconnaissance indisponible" (cf.
 * demande explicite du 23/08/2026 -- confusion réelle constatée en test).
 */
function isNotLoggedInError(message: string): boolean {
  return /aucune session KEEP active/i.test(message);
}

/**
 * Limite invité atteinte -- moment POSITIF (la personne vient d'avoir la
 * preuve que KEEP marche), pas une panne. Voir routes/recognition.ts pour
 * la limite serveur réelle (cf. demande explicite du 23/08/2026 : "on lui
 * fait vivre le wow de KEEP d'abord, puis on lui demande de créer son
 * profil").
 */
function isGuestLimitReached(message: string): boolean {
  return /guest_limit_reached/i.test(message);
}

/** Limite Free atteinte (compte inscrit, 6 au total) -- distinct de guest_limit_reached (invité) : jamais "Créer mon profil" ici, message Premium à la place -- cf. demande explicite du 24/08/2026. */
function isFreeTierLimitReached(message: string): boolean {
  return /free_tier_limit_reached/i.test(message);
}

/**
 * Capture micro techniquement réussie mais sans signal exploitable (voir
 * micCapture.ts, `throwIfTooSmall`/vérification du pic). PAS une panne
 * réseau/provider -- se produit AVANT le moindre appel réseau, donc noyer ça
 * dans "reconnaissance indisponible" cachait un diagnostic actionnable côté
 * utilisateur (diagnostiqué le 23/08/2026 : test iPhone réel en échec répété
 * alors que le backend ne recevait STRICTEMENT AUCUNE requête).
 */
function isMicSilenceError(message: string): boolean {
  return /signal quasi silencieux|fichier audio trop petit/i.test(message);
}

/**
 * Valeur par défaut si le Super Admin n'a rien changé. Modifiable depuis
 * Super Admin -> Feature Flags -> Réglages session (packages/admin) ;
 * PAS ENCORE persistée côté Supabase (aucun projet KEEP déployé — voir
 * docs/PROJECT_STATUS.md), donc la valeur choisie en admin ne voyage pas
 * encore jusqu'ici. CODED, pas CONNECTED : ne pas annoncer plus que ça.
 */
export const DEFAULT_SESSION_SILENCE_TIMEOUT_MIN = 10;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sameTrack(a: CanonicalTrack, b: CanonicalTrack): boolean {
  if (a.isrc && b.isrc) return a.isrc === b.isrc;
  return a.title === b.title && a.artist === b.artist;
}

interface SessionStore {
  isActive: boolean;
  sessionId: string | null;
  startedAt: string | null;
  tracks: SessionTrackEntry[];
  silenceTimeoutMin: number;
  showEndPrompt: boolean;
  recognizing: boolean;
  /** Niveau micro réel 0-1 en direct (metering expo-av) -- 0 hors capture ou si le navigateur ne fournit pas de metering. */
  micLevel: number;
  error: string | null;
  /** true après une erreur de quota/autorisation provider -- la boucle de reconnaissance s'arrête, jamais de martèlement d'une clé épuisée. */
  quotaExceeded: boolean;
  /** true dès que la limite invité (2 essais gratuits) est atteinte -- déclenche la proposition de créer un profil, pas une erreur (voir HomeScreen). */
  guestLimitReached: boolean;
  /** true dès que la limite Free (compte inscrit, 6 au total) est atteinte -- déclenche l'offre Premium, jamais "Créer mon profil" (déjà inscrit) -- cf. demande explicite du 24/08/2026 "le message doit dépendre du contexte". */
  freeLimitReached: boolean;
  locationLabel?: string;
  lat?: number;
  lng?: number;

  startSession: () => void;
  /** Déclenchée par le bouton manuel "Terminer" ou par la confirmation du prompt de fin. Archive et renvoie l'id pour naviguer vers le récap. */
  requestEndSession: (title?: string) => string | null;
  dismissEndPrompt: () => void;
  keepTrack: (entryId: string, playlistId?: string) => Promise<void>;
  passTrack: (entryId: string) => void;
  keepAllPending: () => Promise<void>;
  /** Renomme un morceau de la session EN COURS (pas encore archivée) -- voir useSessionHistoryStore.renameTrackInSession pour les sessions déjà terminées. */
  renameTrack: (entryId: string, customTitle: string) => void;
  /** Partager/masquer un KEEP sur le profil (cf. demande explicite du 24/08/2026) -- `false` si le keep n'a pas encore de `keepId` (pas encore synchronisé serveur) ou si le PATCH échoue, jamais un état local qui ment sur le vrai état serveur. */
  setTrackVisibility: (entryId: string, visibility: 'PUBLIC' | 'PRIVATE') => Promise<boolean>;
  /** Retente commitKeep() pour les morceaux "waiting_sync" de la session EN COURS -- appelé après connexion d'un service pendant qu'une session tourne encore. */
  syncWaitingTracks: () => Promise<void>;
  setSilenceTimeoutMin: (minutes: number) => void;
  attachLocation: (label: string, lat?: number, lng?: number) => void;
  /**
   * DEV/ADMIN uniquement (cf. demande explicite du 23/08/2026 -- "bouton
   * TEST RECONNAISSANCE... EXACTEMENT le même RecognitionRouter utilisé par
   * le micro"). Appelle `musicEngine.recognitionRouter` -- la MÊME instance
   * singleton que `tick()` ci-dessus, pas une copie -- avec un vrai
   * échantillon audio (corpus QA), sans dépendre du micro. Renvoie le
   * résultat brut du routeur (quel provider a répondu, avec quel détail) --
   * jamais un état caché, c'est justement l'outil de diagnostic.
   */
  testRecognitionWithAudio: (audioSample: ArrayBuffer) => ReturnType<typeof musicEngine.recognitionRouter.recognize>;
}

let tickHandle: ReturnType<typeof setTimeout> | null = null;
let silenceCheckHandle: ReturnType<typeof setInterval> | null = null;
let lastDetectionAt = 0;
let consecutiveErrors = 0;
/**
 * Palier réel de l'utilisateur (FREE/PREMIUM/CREATOR_PRO/VENUE_PRO) --
 * `null` tant que non résolu (backend injoignable/pas encore répondu),
 * traité comme FREE par prudence (jamais d'accès illimité supposé par
 * défaut). Revérifié une fois par session (voir startSession()), pas à
 * chaque tick -- /me/subscription ne doit pas être martelé toutes les
 * ~8-10s pendant qu'une session tourne.
 */
let cachedPlanCodeForSession: string | null = null;

function clearTimers() {
  if (tickHandle) {
    clearTimeout(tickHandle);
    tickHandle = null;
  }
  if (silenceCheckHandle) {
    clearInterval(silenceCheckHandle);
    silenceCheckHandle = null;
  }
  consecutiveErrors = 0;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  isActive: false,
  sessionId: null,
  startedAt: null,
  tracks: [],
  silenceTimeoutMin: DEFAULT_SESSION_SILENCE_TIMEOUT_MIN,
  showEndPrompt: false,
  recognizing: false,
  micLevel: 0,
  error: null,
  quotaExceeded: false,
  guestLimitReached: false,
  freeLimitReached: false,
  locationLabel: undefined,
  lat: undefined,
  lng: undefined,

  startSession: () => {
    clearTimers();
    lastDetectionAt = Date.now();
    // Fire-and-forget -- ne bloque jamais le démarrage de session. Voir
    // cachedPlanCodeForSession plus haut : Premium/CREATOR_PRO/VENUE_PRO
    // passent le quota de révélation en illimité (cf. spec explicite du
    // 24/08/2026 "Puis limite atteinte → Premium").
    cachedPlanCodeForSession = null;
    fetchMySubscription().then((sub) => {
      cachedPlanCodeForSession = sub?.plans?.code ?? null;
    });
    set({
      isActive: true,
      sessionId: newId(),
      startedAt: new Date().toISOString(),
      tracks: [],
      showEndPrompt: false,
      error: null,
      quotaExceeded: false,
      guestLimitReached: false,
  freeLimitReached: false,
      micLevel: 0,
      locationLabel: undefined,
      lat: undefined,
      lng: undefined,
    });

    const settings = DEFAULT_RECOGNITION_SETTINGS;

    const scheduleNext = (delayMs: number) => {
      if (!get().isActive) return;
      tickHandle = setTimeout(tick, delayMs);
    };

    const tick = async (trigger: 'USER_TAP' | 'AUTO' = 'AUTO') => {
      if (!get().isActive || get().quotaExceeded) {
        // Cf. demande explicite du 23/08/2026 -- si ce cas se produit un
        // jour, on veut le SAVOIR (console), pas le deviner : un tick
        // arrivé alors que la session n'est déjà plus active serait une
        // vraie boucle résiduelle.
        if (__DEV__) console.warn('[KEEP][CAPTURE_TRIGGER] RESIDUAL_LOOP -- tick ignoré, session déjà inactive');
        return;
      }
      // Cf. demande explicite du 23/08/2026 -- un onglet caché (écran
      // verrouillé, changement d'app) ne doit JAMAIS rouvrir le micro tout
      // seul. On ne capture pas tant que l'onglet n'est pas revenu au
      // premier plan -- la boucle se réarme normalement au prochain tick une
      // fois visible, sans perdre la session en cours.
      if (typeof document !== 'undefined' && document.hidden) {
        scheduleNext(settings.tickIntervalMs);
        return;
      }
      if (__DEV__) console.log('[KEEP][CAPTURE_TRIGGER]', trigger);
      // Ne jamais proposer un nouveau morceau tant que l'utilisateur n'a pas
      // décidé GARDER/PASSER sur celui en attente -- l'ancienne cadence fixe
      // remplaçait un morceau avant que l'utilisateur ait eu le temps de
      // réagir (cf. demande explicite du 23/08/2026 : "j'ai pas eu le temps
      // d'accepter ou refuser... je pourrais les faire une par une").
      if (get().tracks.some((t) => t.status === 'pending')) {
        lastDetectionAt = Date.now(); // en attente d'une décision, pas de silence réel -- ne pas déclencher la fin de session pendant que l'utilisateur réfléchit.
        scheduleNext(settings.tickIntervalMs);
        return;
      }
      // Quota MARKETING (succès RÉELS, pas des tentatives) -- BUG RÉEL
      // corrigé le 24/08/2026 : "la session affiche 0 morceaux détectés mais
      // KEEP affiche déjà Crée ton profil -- l'UI doit être pilotée par le
      // nombre RÉEL de morceaux reconnus, jamais par le fait qu'une session
      // tourne". Vérifié AVANT toute capture -- ne gaspille jamais un appel
      // AudD payant une fois le quota de révélation déjà atteint. Distinct
      // du plafond anti-abus backend (RecognitionRouter, migration 0020).
      const isPremiumTier = cachedPlanCodeForSession !== null && cachedPlanCodeForSession !== 'FREE';
      if (!isPremiumTier) {
        const userState = useUserStore.getState();
        const isGuest = !userState.user || userState.isAnonymous;
        const { guestSuccessLimit, signupBonusSuccesses } = await fetchRecognitionConfig();
        // Invité = guestSuccessLimit seul ; compte réel FREE =
        // guestSuccessLimit + signupBonusSuccesses (jamais additionné deux
        // fois -- successCount est le MÊME compteur depuis l'invité, seul le
        // palier change à l'inscription, voir migration 0020).
        const limit = isGuest ? guestSuccessLimit : guestSuccessLimit + signupBonusSuccesses;
        if (userState.successCount >= limit) {
          set({ recognizing: false, error: null, guestLimitReached: isGuest, freeLimitReached: !isGuest });
          return;
        }
      }
      set({ recognizing: true });
      const startedAtMs = Date.now();
      let lastAttemptedProviderId = 'unknown';
      // Déclarés ici (pas dans le try) pour rester visibles depuis le catch
      // externe -- un échec de capture micro (permission/silence) jette
      // AVANT d'atteindre recognitionRouter.recognize(), donc le diagnostic
      // doit pouvoir partir depuis les DEUX branches (cf. demande explicite
      // du 23/08/2026 -- "ne suppose rien, mesure-le", même pour un échec).
      let captureDiag: CaptureDiagnostics | null = null;
      let capturedBlob: Blob | ArrayBuffer | null = null;
      const requestId = newRequestId();
      sendTraceStep(requestId, 'USER_TAP', 'ok', trigger);
      const logRecognition = (outcome: RecognitionOutcome, detail?: string) => {
        useRecognitionTelemetryStore.getState().log({
          providerId: lastAttemptedProviderId,
          source: 'mic',
          outcome,
          latencyMs: Date.now() - startedAtMs,
          detail,
        });
        sendTraceStep(requestId, 'UI_RESULT', outcome === 'success' ? 'ok' : 'fail', detail ?? outcome);
      };
      try {
        // BUG RÉEL diagnostiqué le 23/08/2026 ("Connecte-toi pour activer la
        // reconnaissance gratuite" vu en vrai alors qu'une session invité
        // existe malgré ensureGuestSession() appelé en garde-fou) : un SEUL
        // essai fire-and-forget masquait un vrai échec transitoire (réseau,
        // SDK Supabase pas encore prêt) sans jamais le prouver -- l'appelant
        // ne voyait qu'un `null` silencieux. On retente réellement 3 fois
        // (backoff court) et on TRACE chaque tentative -- cf. demande
        // explicite du 24/08/2026 : "vérifie pourquoi le message de
        // connexion existe encore alors que ensureGuestSession() était censé
        // avoir supprimé ce mur", "trouve exactement pourquoi".
        //
        // BUG RÉEL trouvé le 24/08/2026 (régression, diagnostiquée par
        // comparaison git) : ce garde-fou vérifiait EN PLUS
        // `!useUserStore.getState().isDemoMode`, une condition ABSENTE du
        // test juste en dessous qui décide si une vraie capture a lieu
        // (`musicEngine.isRealRecognition` seul, voir plus bas). Si
        // `isDemoMode` reste bloqué à `true` dans le stockage persisté (ex.
        // un tap passé sur l'ancien bouton "Mode Démo", avant le correctif
        // du 24/08/2026 sur OnboardingScreen -- la persistance Zustand
        // survit à un rechargement complet, ce n'est PAS un cache navigateur)
        // alors que `isRealRecognition` reste vrai (déterminé au build, pas
        // par ce flag), une VRAIE capture se déclenchait quand même mais ce
        // bloc était sauté silencieusement -- aucune session garantie,
        // échec direct à l'appel AcoustID. Les deux conditions doivent
        // rester identiques : seul `isRealRecognition` détermine si une
        // vraie session est nécessaire.
        if (musicEngine.isRealRecognition) {
          const { ensureGuestSession } = await import('../services/supabaseClient');
          let token: string | null = null;
          let lastError: string | undefined;
          for (let attempt = 1; attempt <= 3 && !token; attempt++) {
            try {
              token = await ensureGuestSession();
              if (!token) lastError = `tentative ${attempt}/3 : ensureGuestSession() a renvoyé null (aucune exception -- voir console [KEEP][guest-session])`;
            } catch (e: any) {
              lastError = `tentative ${attempt}/3 : ${e?.message ?? String(e)}`;
            }
            if (!token && attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
          }
          sendTraceStep(requestId, 'AUTH_TOKEN', token ? 'ok' : 'fail', token ? undefined : lastError);
        }
        // Reconnaissance factice (pas de vraie clé AudD/AcoustID) : buffer
        // vide, DemoRecognitionProvider l'ignore. Reconnaissance réelle : vrai
        // échantillon micro, indépendamment du reste de l'app (Mode Démo ou
        // non) -- cf. demande explicite du 22/08/2026.
        if (musicEngine.isRealRecognition) sendTraceStep(requestId, 'MIC_STARTED', 'ok');
        const audioSample = musicEngine.isRealRecognition
          ? await captureAudioSample(
              (level) => set({ micLevel: level }),
              settings.sampleDurationMs,
              settings.silencePeakThreshold,
              (d) => {
                d.captureTrigger = trigger;
                captureDiag = d;
                // Cf. demande explicite du 24/08/2026 -- niveau RÉEL capté
                // (pas juste "un fichier a été produit") : distingue "le
                // micro n'a rien entendu" de "le micro a entendu quelque
                // chose qui ne correspond pas à l'index".
                sendTraceStep(
                  requestId,
                  'AUDIO_LEVEL',
                  d.peakLevel !== undefined && d.peakLevel >= settings.silencePeakThreshold ? 'ok' : 'fail',
                  `peak=${d.peakLevel?.toFixed(4) ?? 'n/a'} rms=${d.rmsLevel?.toFixed(4) ?? 'n/a'} chunks=${d.actualChunksReceived ?? 'n/a'}`
                );
              }
            ).then((blob) => {
              capturedBlob = blob;
              sendTraceStep(requestId, 'AUDIO_CAPTURED', 'ok', `${(blob as Blob).size ?? 'n/a'} octets`);
              return blob;
            }).catch((e) => {
              sendTraceStep(requestId, 'AUDIO_CAPTURED', 'fail', e?.message);
              throw e;
            })
          : new ArrayBuffer(0);
        // Marque la FIN de capture -- cf. demande explicite du 23/08/2026 :
        // "je veux mesurer le temps à partir de la fin de la capture micro
        // jusqu'à l'affichage du résultat, pas uniquement les 565ms du
        // moteur" -- distinct de `startedAtMs` (début du tick, inclut les
        // 10s de capture elles-mêmes, pas ce qu'on veut mesurer ici).
        const captureEndedAtMs = Date.now();
        // RecognitionRouter essaie chaque provider dans l'ordre (AcoustID
        // gratuit d'abord, AudD en repli) -- voir RecognitionRouter.ts.
        const routed = await musicEngine.recognitionRouter.recognize(audioSample, requestId);
        if (__DEV__ && captureDiag) sendDevDiagnostic(captureDiag, routed, capturedBlob, Date.now() - captureEndedAtMs);
        lastAttemptedProviderId = routed.matchedProviderId ?? routed.attempts[routed.attempts.length - 1]?.providerId ?? 'unknown';
        const recognition = routed.result;
        if (!recognition) {
          const errorAttempts = routed.attempts.filter((a) => a.outcome === 'error');
          if (errorAttempts.length === 0) {
            // Rien entendu ce tick -- normal (silence, morceau non reconnu
            // par AUCUN provider de la chaîne), pas une erreur.
            consecutiveErrors = 0;
            logRecognition('no_match');
            set({ recognizing: false, error: null });
            scheduleNext(settings.tickIntervalMs);
            return;
          }

          // Au moins un provider de la chaîne a échoué -- détail technique en
          // console/télémétrie uniquement, jamais affiché tel quel (cf.
          // demande explicite du 23/08/2026).
          const technicalMessage = errorAttempts.map((a) => `${a.providerId}: ${a.detail}`).join(' | ');
          console.warn('[KEEP][recognition]', technicalMessage);

          // Limite invité atteinte -- moment POSITIF, pas une panne : la
          // personne vient d'avoir la preuve que KEEP marche (cf. demande
          // explicite du 23/08/2026). Ne compte pas comme une erreur pour le
          // backoff -- HomeScreen affiche la proposition de créer un profil.
          if (errorAttempts.some((a) => isGuestLimitReached(a.detail ?? ''))) {
            logRecognition('quota_error', technicalMessage);
            set({ recognizing: false, error: null, guestLimitReached: true });
            return;
          }

          // Limite Free (compte déjà inscrit) -- jamais "Créer mon profil"
          // (il a déjà un compte), offre Premium à la place (cf. demande
          // explicite du 24/08/2026).
          if (errorAttempts.some((a) => isFreeTierLimitReached(a.detail ?? ''))) {
            logRecognition('quota_error', technicalMessage);
            set({ recognizing: false, error: null, freeLimitReached: true });
            return;
          }

          // "Pas connecté" (Mode Démo ou pas de session KEEP réelle) mérite
          // un message clair et actionnable, jamais noyé dans "reconnaissance
          // indisponible" -- ce n'est pas une panne, c'est un état normal que
          // l'utilisateur peut résoudre lui-même en 20 secondes.
          if (errorAttempts.some((a) => isNotLoggedInError(a.detail ?? ''))) {
            logRecognition('error', technicalMessage);
            consecutiveErrors += 1;
            const backoff = Math.min(settings.backoffBaseMs * 2 ** (consecutiveErrors - 1), settings.backoffMaxMs);
            set({ recognizing: false, error: withDebugDetail(i18n.t('session.recognitionNeedsLogin'), technicalMessage) });
            scheduleNext(backoff);
            return;
          }

          // N'arrête TOUTE la boucle que si CHAQUE provider de la chaîne est
          // en quota/autorisation épuisés -- si AcoustID (gratuit) répond
          // encore normalement, un AudD à sec ne doit pas couper la
          // reconnaissance, juste ce repli précis.
          const allQuotaExhausted =
            errorAttempts.length === routed.attempts.length && errorAttempts.every((a) => isQuotaOrAuthError(a.detail ?? ''));
          if (allQuotaExhausted) {
            logRecognition('quota_error', technicalMessage);
            set({ recognizing: false, error: withDebugDetail(i18n.t('session.recognitionUnavailable'), technicalMessage), quotaExceeded: true });
            return;
          }

          logRecognition('error', technicalMessage);
          consecutiveErrors += 1;
          const backoff = Math.min(settings.backoffBaseMs * 2 ** (consecutiveErrors - 1), settings.backoffMaxMs);
          set({ recognizing: false, error: withDebugDetail(i18n.t('session.recognitionUnavailable'), technicalMessage) });
          scheduleNext(backoff);
          return;
        }
        consecutiveErrors = 0;

        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
        // Un morceau déjà vu CE SOIR (gardé, passé, ou encore en attente) ne
        // redemande jamais — PASS = fermé, pas question du même morceau tant
        // que la session n'est pas terminée (cf. demande explicite du
        // 22/08/2026 : "PASS ne doit jamais reproposer le même morceau").
        // La musique continue en revanche : repousse la détection de fin.
        const alreadySeen = get().tracks.find((t) => sameTrack(t.track, track));
        if (alreadySeen) {
          logRecognition('already_seen');
          lastDetectionAt = Date.now();
          set({ recognizing: false, showEndPrompt: false, error: null });
          // Cooldown, pas l'intervalle normal -- le même morceau joue très
          // probablement encore, inutile de re-fingerprinter tout de suite
          // (cf. protection quota en tête de fichier).
          scheduleNext(settings.cooldownAfterSuccessMs);
          return;
        }

        // Nouveau morceau RÉELLEMENT distinct -- compte pour le quota
        // MARKETING (voir useUserStore.successCount), jamais un doublon déjà
        // vu ni une simple tentative/no_match (c'est exactement la
        // distinction manquante qui causait le bug du 24/08/2026).
        useUserStore.getState().incrementSuccessCount();

        // Aucun service connecté = aucune recommandation "où ranger" possible
        // (rien à recommander) -- ne doit JAMAIS empêcher le morceau
        // d'apparaître en attente, sans quoi une détection sans service
        // connecté serait perdue au lieu de finir en "waiting_sync" (cf.
        // demande explicite du 22/08/2026 : "il ne doit jamais être perdu").
        const hasService = useMusicServiceStore.getState().connectedServices.length > 0;
        const recommendations = hasService
          ? await (async () => {
              const session = await musicEngine.getSession();
              const playlists = await musicEngine.musicProvider.getPlaylists(session);
              return musicEngine.router.recommend(session.userId, track, playlists);
            })()
          : [];

        // UniversalTrackResolver -- interroge réellement chaque plateforme
        // connectée pour savoir où ce morceau existe (cf. demande explicite
        // du 23/08/2026). Ne bloque jamais l'ajout du morceau en attente si
        // ça échoue -- une résolution ratée reste "unknown", pas une perte.
        const availability = await musicEngine
          .getConnectedProviders()
          .then((connected) => musicEngine.universalResolver.resolveAvailability(track, connected))
          .then((r) => r.perProvider)
          .catch(() => undefined);

        const entry: SessionTrackEntry = {
          id: newId(),
          track,
          recommendations,
          status: 'pending',
          detectedAt: new Date().toISOString(),
          discoverySource: 'mic',
          availability,
        };
        // engine = vrai moteur backend (keep_local | acoustid), distinct de
        // lastAttemptedProviderId (l'étape du routeur) -- voir
        // RecognitionResult.engine, gap comblé le 23/08/2026 pour pouvoir
        // prouver depuis les logs quel moteur a réellement répondu.
        logRecognition('success', `${track.title} — ${track.artist} [engine=${recognition.engine ?? 'inconnu'}]`);
        lastDetectionAt = Date.now();
        set((s) => ({ tracks: [entry, ...s.tracks], recognizing: false, showEndPrompt: false, error: null }));
        // E2E réel "fin de capture -> résultat affiché" (cf. demande
        // explicite du 23/08/2026) -- capturé ICI, après le `set()` qui
        // déclenche le rendu, PAS juste après le routeur (qui ignore
        // résolution du morceau/recommandations/disponibilité, une partie
        // réelle du délai perçu par l'utilisateur).
        if (__DEV__) {
          const apiUrl = process.env.EXPO_PUBLIC_API_URL;
          if (apiUrl) {
            fetch(`${apiUrl}/api/dev/diagnostic-log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                timestamp: new Date().toISOString(),
                buildId: process.env.EXPO_PUBLIC_BUILD_ID ?? '(non renseigné)',
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '(non disponible)',
                event: 'e2e_result_shown',
                engine: recognition.engine ?? null,
                title: track.title,
                artist: track.artist,
                e2eLatencyMs: Date.now() - captureEndedAtMs,
              }),
            }).catch(() => {});
            // Confirme "réellement affiché à l'écran" (distinct de "réponse
            // envoyée par le backend", déjà vraie côté serveur) -- cf.
            // demande explicite du 23/08/2026, champ UI RESULT SENT du traçage.
            if (recognition.requestId) {
              fetch(`${apiUrl}/api/dev/trace/${recognition.requestId}/confirm-display`, { method: 'POST' }).catch(() => {});
            }
          }
        }
        scheduleNext(settings.cooldownAfterSuccessMs);
      } catch (e: any) {
        const technicalMessage: string = e?.message ?? 'Erreur de reconnaissance';
        // Détail technique -- console + journal Super Admin uniquement,
        // jamais affiché tel quel à l'utilisateur (cf. demande explicite du
        // 23/08/2026 : "Ne m'affiche plus les erreurs techniques").
        console.warn('[KEEP][recognition]', technicalMessage);
        // Diagnostic envoyé même en échec (permission/silence) -- c'est
        // JUSTEMENT le cas qu'on veut mesurer, voir sendDevDiagnostic.
        if (__DEV__ && captureDiag) sendDevDiagnostic(captureDiag, null, capturedBlob);

        // Ce catch englobe aussi `captureAudioSample()` (voir try plus haut)
        // -- une capture micro ratée arrive ICI, jamais dans la branche
        // routeur/provider ci-dessus. Sans ce cas distinct, une permission
        // micro refusée ou un signal trop faible produisait exactement le
        // même message générique "reconnaissance indisponible" qu'une vraie
        // panne réseau, alors que le backend n'était jamais contacté (bug
        // diagnostiqué le 23/08/2026 sur test iPhone réel).
        if (e instanceof MicPermissionDeniedError) {
          logRecognition('error', technicalMessage);
          consecutiveErrors += 1;
          const backoff = Math.min(settings.backoffBaseMs * 2 ** (consecutiveErrors - 1), settings.backoffMaxMs);
          set({ recognizing: false, error: withDebugDetail(i18n.t('session.micPermissionDenied'), technicalMessage) });
          scheduleNext(backoff);
          return;
        }
        if (isMicSilenceError(technicalMessage)) {
          logRecognition('no_match', technicalMessage);
          // Pas une erreur au sens quota/panne -- pas de backoff exponentiel
          // agressif, juste le rythme normal, KEEP retente au prochain tick.
          consecutiveErrors = 0;
          set({ recognizing: false, error: withDebugDetail(i18n.t('session.micSilence'), technicalMessage) });
          scheduleNext(settings.tickIntervalMs);
          return;
        }
        if (isQuotaOrAuthError(technicalMessage)) {
          logRecognition('quota_error', technicalMessage);
          // Quota/autorisation épuisés côté provider -- marteler ne fera
          // qu'aggraver, on arrête la boucle jusqu'à la prochaine session.
          set({ recognizing: false, error: withDebugDetail(i18n.t('session.recognitionUnavailable'), technicalMessage), quotaExceeded: true });
          return;
        }
        logRecognition('error', technicalMessage);
        consecutiveErrors += 1;
        const backoff = Math.min(settings.backoffBaseMs * 2 ** (consecutiveErrors - 1), settings.backoffMaxMs);
        set({ recognizing: false, error: withDebugDetail(i18n.t('session.recognitionUnavailable'), technicalMessage) });
        scheduleNext(backoff);
      }
    };

    tick('USER_TAP');
    silenceCheckHandle = setInterval(() => {
      const { isActive, silenceTimeoutMin, showEndPrompt } = get();
      if (!isActive || showEndPrompt) return;
      if (Date.now() - lastDetectionAt >= silenceTimeoutMin * 60 * 1000) {
        set({ showEndPrompt: true });
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  },

  dismissEndPrompt: () => {
    lastDetectionAt = Date.now();
    set({ showEndPrompt: false });
  },

  requestEndSession: (title) => {
    clearTimers();
    releaseCaptureResources();
    const s = get();
    if (!s.sessionId || !s.startedAt) return null;

    const session: KeepSession = {
      id: s.sessionId,
      startedAt: s.startedAt,
      endedAt: new Date().toISOString(),
      title: title ?? null,
      locationLabel: s.locationLabel,
      lat: s.lat,
      lng: s.lng,
      tracks: s.tracks,
    };

    if (session.tracks.length > 0) {
      useSessionHistoryStore.getState().addSession(session);
    }

    set({
      isActive: false,
      sessionId: null,
      startedAt: null,
      tracks: [],
      showEndPrompt: false,
      locationLabel: undefined,
      lat: undefined,
      lng: undefined,
      // BUG RÉEL diagnostiqué le 23/08/2026 : ces champs n'étaient jamais
      // remis à zéro ici -- le dernier message d'erreur (ex. "signal quasi
      // silencieux") restait affiché indéfiniment sur l'écran idle, AVANT
      // tout nouveau tap, laissant croire à tort qu'une reconnaissance
      // venait de se déclencher toute seule.
      error: null,
      guestLimitReached: false,
  freeLimitReached: false,
      recognizing: false,
      micLevel: 0,
    });

    return session.tracks.length > 0 ? session.id : null;
  },

  keepTrack: async (entryId, playlistId) => {
    const entry = get().tracks.find((t) => t.id === entryId);
    if (!entry) return;
    try {
      const { targetPlaylistId, syncState } = await commitKeep(entry.track, entry.recommendations, playlistId);
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === entryId ? { ...t, status: 'kept' as SessionTrackStatus, keptPlaylistId: targetPlaylistId, syncState } : t
        ),
      }));
      // Cf. commentaire de pushKeepDecision (profileApi.ts) -- GARDER
      // n'écrivait jusqu'ici QUE localement, jamais côté serveur. `keepId`
      // stocké dès réception -- indispensable pour toute action serveur
      // ultérieure sur CE keep précis (visibilité, etc.), voir types/index.ts.
      pushKeepDecision(entry.track).then((keepId) => {
        if (keepId) set((s) => ({ tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, keepId, visibility: 'PUBLIC' } : t)) }));
      });
    } catch (e: any) {
      set({ error: e?.message ?? 'Erreur lors du rangement' });
    }
  },

  passTrack: (entryId) => {
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, status: 'passed' as SessionTrackStatus } : t)),
    }));
  },

  keepAllPending: async () => {
    const pending = get().tracks.filter((t) => t.status === 'pending');
    for (const entry of pending) {
      await get().keepTrack(entry.id);
    }
  },

  renameTrack: (entryId, customTitle) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, customTitle } : t)) })),

  setTrackVisibility: async (entryId, visibility) => {
    const entry = get().tracks.find((t) => t.id === entryId);
    if (!entry?.keepId) return false;
    const ok = await patchKeepVisibility(entry.keepId, visibility);
    if (ok) set((s) => ({ tracks: s.tracks.map((t) => (t.id === entryId ? { ...t, visibility } : t)) }));
    return ok;
  },

  syncWaitingTracks: async () => {
    const waiting = get().tracks.filter((t) => t.status === 'kept' && t.syncState === 'waiting_sync');
    for (const entry of waiting) {
      try {
        const { targetPlaylistId, syncState } = await commitKeep(entry.track, entry.recommendations);
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === entry.id ? { ...t, keptPlaylistId: targetPlaylistId, syncState } : t)),
        }));
      } catch (e: any) {
        set({ error: e?.message ?? 'Erreur de synchronisation' });
      }
    }
  },

  setSilenceTimeoutMin: (minutes) => set({ silenceTimeoutMin: minutes }),

  attachLocation: (label, lat, lng) => set({ locationLabel: label, lat, lng }),

  testRecognitionWithAudio: (audioSample) => musicEngine.recognitionRouter.recognize(audioSample),
}));
