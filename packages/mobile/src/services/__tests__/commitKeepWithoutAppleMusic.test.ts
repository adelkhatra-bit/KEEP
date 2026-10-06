// Adel (02/10/2026) : « Loki Pulse : impossible d'ajouter ce morceau ».
// Un compte réel SANS Apple Music doit garder normalement (décision serveur
// = débit FREE + profil) ; Apple Music n'est qu'une copie optionnelle.
const mockRecordKeepDecision = jest.fn();
const mockGetSession = jest.fn();
const mockRefresh = jest.fn(async () => {});
let mockUserState: any = { isDemoMode: false, isLocalGuest: false, user: { id: 'u1' } };

jest.mock('../musicEngine', () => ({ musicEngine: { getSession: () => mockGetSession(), musicProvider: {}, router: {} } }));
jest.mock('../keepMusicCoreRecognition', () => ({ recordKeepDecision: (...a: any[]) => mockRecordKeepDecision(...a) }));
jest.mock('../creditService', () => ({ ensureDownloadCreditAvailable: jest.fn(async () => ({})) }));
jest.mock('../connectedMusicLibrary', () => ({ checkOwnKeepLibrary: jest.fn(async () => null) }));
jest.mock('../keepLibraryService', () => ({ syncPlaylistTrack: jest.fn() }));
jest.mock('../retry', () => ({ withRetry: (fn: any) => fn() }));
jest.mock('../../store/usePlaylistStore', () => ({ usePlaylistStore: { getState: () => ({ refresh: mockRefresh }) } }));
jest.mock('../../store/useUserStore', () => ({ useUserStore: { getState: () => mockUserState } }));
jest.mock('@keep/music', () => ({}));

import { commitKeep } from '../keepTrackAction';

const track: any = { id: 't1', title: 'Titre', artist: 'Artiste', previewUrl: null };

describe('GARDER sans Apple Music', () => {
  beforeEach(() => { mockRecordKeepDecision.mockReset(); mockGetSession.mockReset(); });

  it('keeps on the server when Apple Music is not connected', async () => {
    mockGetSession.mockRejectedValue(new Error('Apple Music non connecté'));
    mockRecordKeepDecision.mockResolvedValue({ decisionId: 'd1', trackId: 'tr1' });
    const result = await commitKeep(track, [], undefined, { visibility: 'PUBLIC', consumeCredit: true, context: { source: 'loki_pulse' } });
    expect(result).toMatchObject({ keepDecisionId: 'd1', visibility: 'PUBLIC', alreadyKept: false });
    expect(mockRecordKeepDecision).toHaveBeenCalledWith(track, 'PUBLIC', expect.objectContaining({ source: 'loki_pulse', creditPolicy: 'LISTEN_KEEP' }));
  });

  it('never pretends success if the server does not confirm', async () => {
    mockGetSession.mockRejectedValue(new Error('Apple Music non connecté'));
    mockRecordKeepDecision.mockResolvedValue(null);
    await expect(commitKeep(track, [], undefined, { visibility: 'PRIVATE' })).rejects.toThrow('KEEP_SERVER_NOT_CONFIRMED');
  });
});
