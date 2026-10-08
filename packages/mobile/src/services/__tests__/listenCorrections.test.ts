import type { RecognitionResult } from '@keep/music';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../musicEngine', () => ({
  musicEngine: {
    isDemoMode: false,
    usesDemoMusicProvider: false,
    recognitionProvider: { providerId: 'ACRCloud' },
    trackResolver: { resolveFromRecognition: (r: RecognitionResult) => ({ ...r, id: r.title, providerIds: r.providerIds ?? {} }) },
    getSession: jest.fn().mockResolvedValue({ userId: 'user' }),
    musicProvider: { getPlaylists: jest.fn().mockResolvedValue([]) },
    router: { recommend: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock('../keepMusicCoreRecognition', () => ({
  recordRecognitionCorrection: jest.fn().mockResolvedValue(undefined),
  markDirectRediscovery: jest.fn(),
  authorizeNextPaidListenWithFree: jest.fn(),
  clearNextPaidListenFreeAuthorization: jest.fn(),
  updateKeepDecisionVisibility: jest.fn(),
  searchTrackByText: jest.fn(),
}));
jest.mock('../keepTrackAction', () => ({ commitKeep: jest.fn() }));
jest.mock('../creditService', () => ({ getDownloadCreditStatus: jest.fn().mockResolvedValue({ unlimited: true }) }));
jest.mock('../micCapture', () => ({
  cancelAudioCapture: jest.fn().mockResolvedValue(undefined),
  captureAudioSample: jest.fn(), prepareAudioCaptureFromUserGesture: jest.fn(),
}));
jest.mock('../connectedMusicLibrary', () => ({ checkConnectedLibraries: jest.fn().mockResolvedValue({ exists: false }) }));
jest.mock('../sharedMusicSourceService', () => ({ clearSharedMusicSource: jest.fn(), getSharedMusicSource: jest.fn().mockResolvedValue(null) }));
jest.mock('../recognitionNotificationService', () => ({ prepareRecognitionNotifications: jest.fn() }));
jest.mock('../listenEconomyService', () => ({ recordListenSuccess: jest.fn(), loadListenEconomyStatus: jest.fn() }));
jest.mock('../../utils/keepAlert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../../store/useAccountGateStore', () => ({ useAccountGateStore: { getState: () => ({ requestAccount: jest.fn() }) } }));
jest.mock('../../store/useSessionHistoryStore', () => {
  const state = { sessions: [], upsertSession: jest.fn() };
  return { useSessionHistoryStore: { getState: () => state, setState: jest.fn() } };
});

import { useSessionStore } from '../../store/useSessionStore';
import { musicEngine } from '../musicEngine';
import { recordRecognitionCorrection, markDirectRediscovery } from '../keepMusicCoreRecognition';
import { commitKeep } from '../keepTrackAction';
import { cancelAudioCapture } from '../micCapture';
import { recordListenSuccess } from '../listenEconomyService';
import { useSessionHistoryStore } from '../../store/useSessionHistoryStore';
import { topGenresFromSessions } from '../tasteOnboarding';

const wrong = { id: 'wrong', title: 'Faux titre', artist: 'Artiste', providerIds: {}, genres: ['Metal'] };
const choice: RecognitionResult = { title: 'Bon titre', artist: 'Artiste réel', confidence: 0.8, genres: ['Jazz'] };

beforeEach(() => {
  jest.clearAllMocks();
  (musicEngine as any).isDemoMode = false;
  (cancelAudioCapture as jest.Mock).mockResolvedValue(undefined);
  useSessionStore.setState({
    isActive: true, sessionId: 'session', startedAt: new Date().toISOString(),
    tracks: [{ id: 'entry', track: wrong, status: 'pending', recommendations: [], detectedAt: new Date().toISOString(), recognitionEngine: 'ACRCloud', recognitionPending: true }],
  });
});

it('Pas la bonne remplace le titre et ne transmet jamais le faux titre aux goûts, stats ou GARDER', async () => {
  const store = useSessionStore.getState();
  expect(topGenresFromSessions([{ tracks: store.tracks }])).toEqual([]);
  await store.rejectRecognition('entry');
  await store.keepTrack('entry');
  expect(commitKeep).not.toHaveBeenCalled();
  expect(await store.correctRecognition('entry', choice)).toBe(true);
  const tracks = useSessionStore.getState().tracks;
  expect(tracks).toHaveLength(1);
  expect(tracks[0].track.title).toBe('Bon titre');
  expect(topGenresFromSessions([{ tracks }])).toEqual(['Jazz']);
  expect(recordRecognitionCorrection).toHaveBeenLastCalledWith(expect.any(String), wrong, expect.objectContaining({ title: 'Bon titre' }), 'ACRCloud');
  expect(commitKeep).not.toHaveBeenCalled();
  expect(markDirectRediscovery).not.toHaveBeenCalled();
  expect(recordListenSuccess).not.toHaveBeenCalled();
  expect(useSessionHistoryStore.getState().upsertSession).toHaveBeenLastCalledWith(expect.objectContaining({ tracks: expect.arrayContaining([expect.objectContaining({ track: expect.objectContaining({ title: 'Bon titre' }) })]) }));
});

it('ne perd ni une décision déjà gardée ni sa provenance si la correction est un doublon', async () => {
  useSessionStore.setState((s) => ({ tracks: [...s.tracks, {
    id: 'kept', track: { ...choice, id: 'kept-track', providerIds: {} }, recommendations: [],
    detectedAt: new Date().toISOString(), status: 'kept', keepDecisionId: 'decision', sourceProfileId: 'origin',
  }] }));
  await useSessionStore.getState().rejectRecognition('entry');
  await useSessionStore.getState().correctRecognition('entry', choice);
  expect(useSessionStore.getState().tracks).toHaveLength(1);
  expect(useSessionStore.getState().tracks[0]).toMatchObject({ status: 'kept', keepDecisionId: 'decision', sourceProfileId: 'origin' });
});

it('Mode Démo corrige seulement la session locale', async () => {
  (musicEngine as any).isDemoMode = true;
  await useSessionStore.getState().rejectRecognition('entry');
  await useSessionStore.getState().correctRecognition('entry', choice);
  expect(useSessionStore.getState().tracks[0].track.title).toBe('Bon titre');
  expect(recordRecognitionCorrection).not.toHaveBeenCalled();
  expect(commitKeep).not.toHaveBeenCalled();
  expect(recordListenSuccess).not.toHaveBeenCalled();
});

it('SESSION attend la libération du micro avant navigation et conserve les titres sans reprise automatique', async () => {
  let release!: () => void;
  (cancelAudioCapture as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const open = jest.fn();
  const stopping = useSessionStore.getState().openStoppedSession(open);
  expect(cancelAudioCapture).toHaveBeenCalledTimes(1);
  expect(useSessionStore.getState().isActive).toBe(false);
  expect(open).not.toHaveBeenCalled();
  expect(useSessionHistoryStore.getState().upsertSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'session', tracks: expect.arrayContaining([expect.objectContaining({ track: wrong })]) }));
  release();
  await stopping;
  expect(open).toHaveBeenCalledWith('session');
  useSessionStore.getState().resumeListening();
  expect(useSessionStore.getState().isActive).toBe(false);
});

it('un refus sans choix ne devient jamais un titre de la session terminée', async () => {
  await useSessionStore.getState().rejectRecognition('entry');
  useSessionStore.getState().requestEndSession();
  expect(useSessionHistoryStore.getState().upsertSession).toHaveBeenLastCalledWith(expect.objectContaining({ tracks: [] }));
});

it('une correction tardive ne ressuscite pas une session arrêtée pendant le journal', async () => {
  await useSessionStore.getState().rejectRecognition('entry');
  let finish!: () => void;
  (recordRecognitionCorrection as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const correcting = useSessionStore.getState().correctRecognition('entry', choice);
  useSessionStore.getState().requestEndSession();
  finish();
  expect(await correcting).toBe(false);
  expect(useSessionStore.getState()).toMatchObject({ isActive: false, sessionId: null, tracks: [] });
});

it('sérialise GARDER et correction pour ne pas associer une décision au mauvais titre', async () => {
  let finish!: (result: any) => void;
  (commitKeep as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const keeping = useSessionStore.getState().keepTrack('entry');
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  await expect(useSessionStore.getState().rejectRecognition('entry')).rejects.toThrow('en cours de rangement');
  expect(await useSessionStore.getState().correctRecognition('entry', choice)).toBe(false);
  finish({ targetPlaylistId: 'playlist', keepDecisionId: 'decision' });
  await keeping;
  expect(useSessionStore.getState().tracks[0]).toMatchObject({ track: wrong, status: 'kept', keepDecisionId: 'decision' });
  expect(recordRecognitionCorrection).not.toHaveBeenCalled();
});
