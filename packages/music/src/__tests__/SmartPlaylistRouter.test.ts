import { SmartPlaylistRouter } from '../SmartPlaylistRouter';
import { InMemoryRoutingWeightsStore } from '../InMemoryRoutingWeightsStore';
import { CanonicalTrack, ProviderPlaylist } from '../types';

describe('SmartPlaylistRouter', () => {
  const playlists: ProviderPlaylist[] = [
    { id: 'p-piscine', name: 'Piscine', description: 'Sons d’été, ambiance chill au bord de l’eau', trackCount: 10 },
    { id: 'p-afro', name: 'Afro House', description: 'Rythmes afro house', trackCount: 20 },
    { id: 'p-voiture', name: 'Voiture', description: 'Pour la route', trackCount: 15 },
  ];

  it('recommande selon les mots-clés du nom de playlist quand aucun historique n’existe', async () => {
    const router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
    const track: CanonicalTrack = { id: 't1', title: 'Afro House Sunset', artist: 'DJ Test', genres: ['afro house'], providerIds: {} };
    const recs = await router.recommend('user-1', track, playlists);
    expect(recs[0].playlistId).toBe('p-afro');
  });

  it('apprend : une correction fait remonter la playlist choisie pour les prochaines recommandations du même artiste', async () => {
    const store = new InMemoryRoutingWeightsStore();
    const router = new SmartPlaylistRouter(store);
    const track: CanonicalTrack = { id: 't2', title: 'Deep Cut', artist: 'Obscure Artist', genres: [], providerIds: {} };

    const before = await router.recommend('user-2', track, playlists);
    const beforeTop = before[0].score;

    // KEEP proposait "Voiture" (ou rien de pertinent), l'utilisateur corrige vers "Piscine".
    await router.recordCorrection('user-2', {
      trackId: track.id,
      artist: track.artist,
      genres: [],
      recommendedPlaylistId: before[0]?.playlistId ?? null,
      chosenPlaylistId: 'p-piscine',
      createdAt: new Date().toISOString(),
    });

    const after = await router.recommend('user-2', track, playlists);
    const piscineAfter = after.find((r) => r.playlistId === 'p-piscine')!;
    const piscineBefore = before.find((r) => r.playlistId === 'p-piscine')!;

    expect(piscineAfter.score).toBeGreaterThan(piscineBefore.score);
    expect(after[0].playlistId).toBe('p-piscine');
  });

  it('deux utilisateurs différents peuvent apprendre des rangements différents pour le même artiste (personnalisation)', async () => {
    const store = new InMemoryRoutingWeightsStore();
    const router = new SmartPlaylistRouter(store);
    const track: CanonicalTrack = { id: 't3', title: 'Track X', artist: 'Shared Artist', genres: [], providerIds: {} };

    await router.recordCorrection('user-A', {
      trackId: track.id,
      artist: track.artist,
      genres: [],
      recommendedPlaylistId: null,
      chosenPlaylistId: 'p-piscine',
      createdAt: new Date().toISOString(),
    });
    await router.recordCorrection('user-B', {
      trackId: track.id,
      artist: track.artist,
      genres: [],
      recommendedPlaylistId: null,
      chosenPlaylistId: 'p-voiture',
      createdAt: new Date().toISOString(),
    });

    const recsA = await router.recommend('user-A', track, playlists);
    const recsB = await router.recommend('user-B', track, playlists);

    expect(recsA[0].playlistId).toBe('p-piscine');
    expect(recsB[0].playlistId).toBe('p-voiture');
  });
});
