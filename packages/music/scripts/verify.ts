/**
 * Vérification exécutable réelle du moteur musical, sans dépendre de Jest
 * (non installable dans ce sandbox — registre npm bloqué, voir
 * docs/PROJECT_STATUS.md). Exécuté avec `tsx` (disponible globalement).
 * Couvre les mêmes scénarios que src/__tests__/*.test.ts.
 *
 * Usage: npx tsx packages/music/scripts/verify.ts
 */
import { TrackResolver } from '../src/TrackResolver';
import { SmartPlaylistRouter } from '../src/SmartPlaylistRouter';
import { InMemoryRoutingWeightsStore } from '../src/InMemoryRoutingWeightsStore';
import { analyzeLibrary } from '../src/LibraryAnalyzer';
import { computeMusicDNA, compareMusicDNA } from '../src/MusicDNA';
import { CanonicalTrack, ProviderPlaylist } from '../src/types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL ${label}`);
  }
}

async function main() {
  console.log('== TrackResolver ==');
  {
    const track: CanonicalTrack = { id: 't1', isrc: 'USUG11904206', title: 'Blinding Lights', artist: 'The Weeknd', providerIds: { spotify: 'spotify123' } };
    const resolver = new TrackResolver([track]);
    check('résout par ISRC exact', resolver.findExisting({ isrc: 'USUG11904206' })?.id === 't1');
  }
  {
    const track: CanonicalTrack = { id: 't2', title: "Harry's House", artist: 'Harry Styles', providerIds: {} };
    const resolver = new TrackResolver([track]);
    check('résout par fuzzy titre+artiste (casse/accents)', resolver.findExisting({ title: 'harrys house', artist: 'harry styles' })?.id === 't2');
  }
  {
    const track: CanonicalTrack = { id: 't3', title: 'Levitating', artist: 'Dua Lipa', providerIds: {} };
    const resolver = new TrackResolver([track]);
    check('ne force pas un rapprochement différent', resolver.findExisting({ title: 'Bad Guy', artist: 'Billie Eilish' }) === null);
  }
  {
    const resolver = new TrackResolver();
    const first = resolver.resolveFromRecognition({ confidence: 0.9, title: 'Levitating', artist: 'Dua Lipa', isrc: 'USUM72007546' });
    const second = resolver.resolveFromRecognition({ confidence: 0.88, title: 'Levitating', artist: 'Dua Lipa', isrc: 'USUM72007546' });
    check('déduplique un même morceau reconnu deux fois (pas de doublon)', second.id === first.id && resolver.size() === 1);
  }
  {
    const resolver = new TrackResolver();
    const track = resolver.resolveFromRecognition({ confidence: 0.9, title: 'Levitating', artist: 'Dua Lipa' });
    resolver.linkProviderId(track, 'appleMusic', 'apple-987');
    check('lie un ID provider supplémentaire (cas Compare cross-provider)', resolver.findExisting({ provider: 'appleMusic', providerId: 'apple-987' })?.id === track.id);
  }

  console.log('== SmartPlaylistRouter ==');
  const playlists: ProviderPlaylist[] = [
    { id: 'p-piscine', name: 'Piscine', description: 'Sons d’été, ambiance chill au bord de l’eau', trackCount: 10 },
    { id: 'p-afro', name: 'Afro House', description: 'Rythmes afro house', trackCount: 20 },
    { id: 'p-voiture', name: 'Voiture', description: 'Pour la route', trackCount: 15 },
  ];
  {
    const router = new SmartPlaylistRouter(new InMemoryRoutingWeightsStore());
    const track: CanonicalTrack = { id: 't1', title: 'Afro House Sunset', artist: 'DJ Test', genres: ['afro house'], providerIds: {} };
    const recs = await router.recommend('user-1', track, playlists);
    check('recommande selon mots-clés sans historique', recs[0].playlistId === 'p-afro');
  }
  {
    const store = new InMemoryRoutingWeightsStore();
    const router = new SmartPlaylistRouter(store);
    const track: CanonicalTrack = { id: 't2', title: 'Deep Cut', artist: 'Obscure Artist', genres: [], providerIds: {} };
    const before = await router.recommend('user-2', track, playlists);
    await router.recordCorrection('user-2', {
      trackId: track.id, artist: track.artist, genres: [],
      recommendedPlaylistId: before[0]?.playlistId ?? null,
      chosenPlaylistId: 'p-piscine', createdAt: new Date().toISOString(),
    });
    const after = await router.recommend('user-2', track, playlists);
    const piscineBefore = before.find((r) => r.playlistId === 'p-piscine')!.score;
    const piscineAfter = after.find((r) => r.playlistId === 'p-piscine')!.score;
    check('la correction fait remonter le score de la playlist choisie', piscineAfter > piscineBefore);
    check('la playlist corrigée devient la recommandation n°1', after[0].playlistId === 'p-piscine');
  }
  {
    const store = new InMemoryRoutingWeightsStore();
    const router = new SmartPlaylistRouter(store);
    const track: CanonicalTrack = { id: 't3', title: 'Track X', artist: 'Shared Artist', genres: [], providerIds: {} };
    await router.recordCorrection('user-A', { trackId: track.id, artist: track.artist, genres: [], recommendedPlaylistId: null, chosenPlaylistId: 'p-piscine', createdAt: new Date().toISOString() });
    await router.recordCorrection('user-B', { trackId: track.id, artist: track.artist, genres: [], recommendedPlaylistId: null, chosenPlaylistId: 'p-voiture', createdAt: new Date().toISOString() });
    const recsA = await router.recommend('user-A', track, playlists);
    const recsB = await router.recommend('user-B', track, playlists);
    check('deux utilisateurs apprennent des rangements différents (personnalisation)', recsA[0].playlistId === 'p-piscine' && recsB[0].playlistId === 'p-voiture');
  }

  console.log('== LibraryAnalyzer ==');
  {
    const dup: CanonicalTrack = { id: 'd1', isrc: 'FR001', title: 'Dup Song', artist: 'Artist Dup', providerIds: {} };
    const dup2: CanonicalTrack = { id: 'd2', isrc: 'FR001', title: 'Dup Song', artist: 'Artist Dup', providerIds: {} };
    const unique: CanonicalTrack = { id: 'u1', title: 'Unique Song', artist: 'Solo Artist', providerIds: {}, genres: ['pop'] };
    const analysis = analyzeLibrary([
      { playlist: { id: 'p1', name: 'P1', trackCount: 2 }, tracks: [dup, unique] },
      { playlist: { id: 'p2', name: 'P2', trackCount: 1 }, tracks: [dup2] },
    ]);
    check('détecte le doublon cross-playlist par ISRC', analysis.duplicateCount === 1 && analysis.duplicateGroups.length === 1);
    check('compte correctement le total de morceaux', analysis.totalTracks === 3);
    check('détecte les morceaux non classés (sans genre)', analysis.unclassifiedCount === 2);
  }

  console.log('== MusicDNA ==');
  {
    const dna = computeMusicDNA([
      { artist: 'A', genres: ['afro house'], decision: 'KEPT', createdAt: '2026-01-01' },
      { artist: 'B', genres: ['afro house'], decision: 'KEPT', createdAt: '2026-01-02' },
      { artist: 'C', genres: ['metal'], decision: 'PASSED', createdAt: '2026-01-03' },
    ]);
    check('ignore les PASSER dans le calcul de l’ADN', dna.totalDecisions === 2 && dna.topGenres[0].genre === 'afro house');
  }
  {
    const dnaA = computeMusicDNA([{ artist: 'A', genres: ['pop', 'afro house'], decision: 'KEPT', createdAt: '2026-01-01' }]);
    check('deux ADN identiques -> compatibilité ~1', Math.abs(compareMusicDNA(dnaA, dnaA) - 1) < 1e-6);
    const dnaB = computeMusicDNA([{ artist: 'B', genres: ['classical'], decision: 'KEPT', createdAt: '2026-01-01' }]);
    check('deux ADN sans genre commun -> compatibilité 0', compareMusicDNA(dnaA, dnaB) === 0);
  }

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main();
