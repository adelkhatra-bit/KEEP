// ERR-SUPABASE-API-POLLING-20261021 : 1 755 appels / 24 h à
// keep_track_enrich_genres, tous sans effet. Un morceau n'est envoyé qu'une
// fois par appareil (30 jours), même si l'écran recharge sa liste.

const mockRpc = jest.fn(async () => ({ data: null, error: null }));

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => (mockRpc as any)(...args) } }));
jest.mock('../keylessGenreService', () => ({ enrichMissingGenres: jest.fn(async (tracks: unknown[]) => tracks) }));
jest.mock('@keep/music', () => ({ buildSmartAlbumSuggestions: jest.fn(() => []) }));
jest.mock('../../config/brand', () => ({ APP_NAME: 'Loki' }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { __resetGenrePersistMemoryForTests, persistEnrichedGenres } from '../smartAlbumService';

describe('persistEnrichedGenres — pas de renvoi en boucle', () => {
  beforeEach(async () => {
    mockRpc.mockClear();
    __resetGenrePersistMemoryForTests();
    await AsyncStorage.clear();
  });

  it('5 rechargements de la même liste = 1 seul envoi par morceau', async () => {
    const tracks = [{ id: 't1', genres: ['Pop'] }, { id: 't2', genres: ['House'] }];
    for (let i = 0; i < 5; i++) await persistEnrichedGenres(tracks);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('ignore les morceaux sans genre trouvé', async () => {
    await persistEnrichedGenres([{ id: 't3', genres: [] }]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('la mémoire survit au redémarrage de l’app (stockage local)', async () => {
    await persistEnrichedGenres([{ id: 't4', genres: ['Funk'] }]);
    await new Promise((r) => setTimeout(r, 0));
    __resetGenrePersistMemoryForTests();
    await persistEnrichedGenres([{ id: 't4', genres: ['Funk'] }]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('deux écrans en même temps ne doublent pas l’envoi', async () => {
    const tracks = [{ id: 't5', genres: ['Rock'] }];
    await Promise.all([persistEnrichedGenres(tracks), persistEnrichedGenres(tracks)]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
