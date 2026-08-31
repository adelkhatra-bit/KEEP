import type { CanonicalTrack, RecognitionResult } from '@keep/music';
import type { SessionTrackEntry } from '../types';
import { musicEngine } from './musicEngine';
import { checkConnectedLibraries } from './connectedMusicLibrary';
import { notifyRecognitionOutsideKeep } from './recognitionNotificationService';
import { useSessionStore } from '../store/useSessionStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalize(value: string | undefined) {
  return (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function sameTrack(a: CanonicalTrack, b: CanonicalTrack) {
  if (a.isrc && b.isrc) return a.isrc.toUpperCase() === b.isrc.toUpperCase();
  return normalize(a.title) === normalize(b.title) && normalize(a.artist) === normalize(b.artist);
}

async function withSoftTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

function persistCurrentSession() {
  const state = useSessionStore.getState();
  if (!state.isActive || !state.sessionId || !state.startedAt || state.tracks.length === 0) return;
  useSessionHistoryStore.getState().upsertSession({
    id: state.sessionId,
    startedAt: state.startedAt,
    endedAt: null,
    title: null,
    locationLabel: state.locationLabel,
    lat: state.lat,
    lng: state.lng,
    tracks: state.tracks,
  });
}

/** Ajoute un résultat fiable provenant d'un fallback non-micro à la session active. */
export async function ingestExternalRecognition(recognition: RecognitionResult): Promise<boolean> {
  const initial = useSessionStore.getState();
  if (!initial.isActive || !initial.sessionId) return false;
  const track = musicEngine.trackResolver.resolveFromRecognition(recognition);
  const duplicate = initial.tracks.find((entry) => sameTrack(entry.track, track));
  if (duplicate) {
    useSessionStore.setState({ showEndPrompt: false, error: null });
    return false;
  }

  const sessionId = initial.sessionId;
  const entry: SessionTrackEntry = {
    id: newId(),
    track,
    recommendations: [],
    status: 'pending',
    detectedAt: new Date().toISOString(),
  };
  useSessionStore.setState((state) => ({
    tracks: [entry, ...state.tracks],
    showEndPrompt: false,
    error: null,
  }));
  persistCurrentSession();

  // Le fallback social ne passe pas par NotifyingRecognitionProvider. Sans cet
  // appel, un titre résolu après que l'utilisateur est retourné dans TikTok,
  // Instagram ou une autre app était bien ajouté à la session mais restait
  // silencieux. La fonction est elle-même no-op quand Loki est au premier plan.
  void notifyRecognitionOutsideKeep(recognition);

  void (async () => {
    try {
      const [connected, providerSession] = await Promise.all([
        withSoftTimeout(checkConnectedLibraries(track), 900),
        musicEngine.getSession(),
      ]);
      const playlists = await withSoftTimeout(musicEngine.musicProvider.getPlaylists(providerSession), 1000) ?? [];
      let existingMatch: SessionTrackEntry['existingMatch'] | undefined;
      if (connected?.exists && connected.match) {
        existingMatch = {
          playlistId: connected.match.playlistId,
          playlistName: connected.match.playlistName,
          provider: connected.match.provider,
        };
      }
      const recommendations = existingMatch ? [] : await musicEngine.router.recommend(providerSession.userId, track, playlists);
      const live = useSessionStore.getState();
      if (!live.isActive || live.sessionId !== sessionId) return;
      useSessionStore.setState((state) => ({
        tracks: state.tracks.map((candidate) => candidate.id !== entry.id
          ? candidate
          : {
              ...candidate,
              recommendations,
              status: existingMatch ? 'already_saved' : candidate.status,
              existingMatch,
            }),
      }));
      persistCurrentSession();
    } catch {
      // Le morceau identifié reste utilisable même si l'enrichissement est lent.
    }
  })();

  return true;
}
