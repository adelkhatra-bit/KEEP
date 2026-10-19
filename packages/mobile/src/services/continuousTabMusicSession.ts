import { Alert } from '../utils/keepAlert';
import { musicEngine } from './musicEngine';
import { startTabAudioMonitor, type TabAudioMonitorHandle } from './micCapture';
import { recognizeFreshTabAudio } from './keepMusicCoreRecognition';
import { resolveTrackPreviewUrl } from './trackPreviewResolver';
import { useSessionStore } from '../store/useSessionStore';
import { useUserStore } from '../store/useUserStore';

/**
 * ONE browser-tab capture per Loki application, independent of screen mounts.
 *
 * The browser grants audio sharing only from a user gesture. Once granted, it
 * must not be silently stopped when the user opens Sessions, Profile or Stories.
 * Every distinct, confirmed recognition uses the SAME session/store, quota,
 * deduplication and KEEP/FREE/visibility pathways as the microphone.
 */
export type ContinuousTabPhase = 'idle' | 'starting' | 'monitoring';
export type ContinuousTabState = { phase: ContinuousTabPhase; recognized: number };
let snapshot: ContinuousTabState = { phase: 'idle', recognized: 0 };
const listeners = new Set<() => void>();
let monitor: TabAudioMonitorHandle | null = null;
let epoch = 0;
let linkedSessionId: string | null = null;
let ownedSessionId: string | null = null;
let originalAccountId: string | null = null;
let shouldResumeMicrophone = false;

function publish(patch: Partial<ContinuousTabState>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}
export function getContinuousTabState(): ContinuousTabState { return snapshot; }
export function subscribeContinuousTabState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function isContinuousTabMusicActive(): boolean {
  return snapshot.phase !== 'idle';
}

/** Synchronous STOP: closes all browser media tracks immediately. */
export function stopContinuousTabMusic(options: { finalizeSession?: boolean } = {}): void {
  if (snapshot.phase === 'idle') return;
  epoch += 1; // Ignore any recognition request that returns after STOP.
  const activeMonitor = monitor;
  monitor = null;
  activeMonitor?.stop();
  const finalizedId = ownedSessionId;
  const wasMicrophoneActive = shouldResumeMicrophone;
  linkedSessionId = null;
  ownedSessionId = null;
  originalAccountId = null;
  shouldResumeMicrophone = false;
  publish({ phase: 'idle' });
  const session = useSessionStore.getState();
  if (options.finalizeSession !== false && finalizedId && session.isActive && session.sessionId === finalizedId) {
    // Preserves recognized titles in Mes Sessions, available for Swipe/KEEP/Story.
    session.requestEndSession();
  } else if (wasMicrophoneActive && session.isActive && session.micPaused
    && !session.listenFreeRequired && !session.listenFreeInsufficient) {
    session.resumeListening();
  }
}

export async function startContinuousTabMusic(): Promise<void> {
  if (snapshot.phase !== 'idle') return;
  const initial = useSessionStore.getState();
  if (initial.listenFreeRequired || initial.listenFreeInsufficient) {
    throw new Error('Quota d’identifications atteint. Autorise les FREE avant de relancer.');
  }
  const startedAtEpoch = ++epoch;
  shouldResumeMicrophone = initial.isActive && !initial.micPaused;
  originalAccountId = useUserStore.getState().user?.id ?? null;
  if (shouldResumeMicrophone) initial.pauseListening();
  publish({ phase: 'starting', recognized: 0 });

  try {
    // No await before this call: getDisplayMedia() opens in the user's click.
    const pending = await startTabAudioMonitor(async (sample) => {
      if (epoch !== startedAtEpoch) return;
      const before = useSessionStore.getState();
      if (!before.isActive || before.sessionId !== linkedSessionId) {
        stopContinuousTabMusic({ finalizeSession: false });
        return;
      }
      if (before.listenFreeRequired || before.listenFreeInsufficient) {
        stopContinuousTabMusic();
        return;
      }
      // Fingerprint the ACTUAL current tab audio; never reuse an old pasted URL.
      const recognition = await recognizeFreshTabAudio(sample);
      if (!recognition || epoch !== startedAtEpoch) return;
      const live = useSessionStore.getState();
      if (!live.isActive || live.sessionId !== linkedSessionId) return;
      const outcome = await live.submitCapturedAudioRecognition(recognition);
      if (epoch !== startedAtEpoch) return;
      if (outcome === 'added') {
        publish({ recognized: useSessionStore.getState().tracks.length });
        const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
        void resolveTrackPreviewUrl(track).catch(() => null);
      } else if (outcome === 'inactive' &&
        (useSessionStore.getState().listenFreeRequired || useSessionStore.getState().listenFreeInsufficient)) {
        throw new Error('LISTEN_FREE_REQUIRED');
      }
    }, (error) => {
      if (epoch !== startedAtEpoch) return;
      stopContinuousTabMusic();
      if (error) {
        const quota = /LISTEN_FREE_(REQUIRED|INSUFFICIENT)/.test(error.message);
        Alert.alert(
          quota ? 'Quota d’écoute atteint' : 'Partage d’onglet interrompu',
          quota
            ? 'Les morceaux déjà reconnus restent dans Mes Sessions. Autorise les FREE avant de relancer le partage.'
            : error.message,
        );
      }
    });

    if (epoch !== startedAtEpoch) {
      pending.stop();
      return;
    }
    monitor = pending;
    const current = useSessionStore.getState();
    if (!current.isActive) {
      // Tab mode intentionally NEVER starts a microphone.
      current.startSession({ captureMode: 'tab' });
      ownedSessionId = useSessionStore.getState().sessionId;
    } else if (!current.micPaused) {
      current.pauseListening();
    }
    linkedSessionId = useSessionStore.getState().sessionId;
    if (!linkedSessionId) {
      stopContinuousTabMusic({ finalizeSession: false });
      throw new Error('Impossible d’ouvrir la session d’écoute.');
    }
    publish({ phase: 'monitoring', recognized: useSessionStore.getState().tracks.length });
  } catch (error) {
    if (epoch === startedAtEpoch) stopContinuousTabMusic({ finalizeSession: false });
    throw error;
  }
}

// A stopped or replaced session must NEVER leave an invisible browser capture.
useSessionStore.subscribe((current) => {
  if (snapshot.phase !== 'monitoring' || !linkedSessionId) return;
  if (!current.isActive || current.sessionId !== linkedSessionId) {
    stopContinuousTabMusic({ finalizeSession: false });
  }
});
useUserStore.subscribe((current) => {
  if (snapshot.phase === 'monitoring' && originalAccountId &&
    current.user?.id !== originalAccountId) {
    stopContinuousTabMusic();
  }
});
