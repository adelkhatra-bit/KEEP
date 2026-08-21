/**
 * Vérification exécutable réelle de AppleMusicProvider, avec un fetch simulé
 * qui reproduit fidèlement les formes de réponse de l'API Apple Music
 * documentées par Apple (vérifiées le 21/08/2026, voir les commentaires en
 * tête de AppleMusicProvider.ts pour les sources exactes). Aucun réseau
 * réel n'est utilisé — mais la logique de pagination, d'authentification à
 * deux jetons, de résolution ISRC/fuzzy et de gestion d'erreurs est, elle,
 * réellement exécutée et vérifiée, pas seulement écrite.
 *
 * Usage: npx tsx packages/music/scripts/verify-apple-music.ts
 */
import { AppleMusicProvider, AppleMusicUnsupportedOperationError, DeveloperTokenProvider } from '../src/providers/AppleMusicProvider';
import { CanonicalTrack, ProviderSession } from '../src/types';

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

const DEV_TOKEN = 'fake-developer-jwt';
const USER_TOKEN = 'fake-music-user-token';

const devTokenProvider: DeveloperTokenProvider = {
  async getDeveloperToken() {
    return DEV_TOKEN;
  },
};

let requestLog: { url: string; method: string; headers: Record<string, string> }[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const mockFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';
  const headers: Record<string, string> = (init?.headers as Record<string, string>) ?? {};
  requestLog.push({ url, method, headers });

  // Auth check systématique, comme le ferait réellement l'API Apple.
  if (headers['Authorization'] !== `Bearer ${DEV_TOKEN}` || headers['Music-User-Token'] !== USER_TOKEN) {
    return jsonResponse(401, { errors: [{ detail: 'jetons manquants ou invalides' }] });
  }

  if (url.endsWith('/v1/me/storefront')) {
    return jsonResponse(200, { data: [{ id: 'fr' }] });
  }

  if (url.includes('/v1/me/library/playlists?limit=100') && method === 'GET') {
    return jsonResponse(200, {
      data: [{ id: 'p.aaa', attributes: { name: 'Voiture', description: { standard: 'Route' } } }],
      next: '/v1/me/library/playlists?offset=100',
    });
  }
  if (url.includes('/v1/me/library/playlists?offset=100')) {
    return jsonResponse(200, { data: [{ id: 'p.bbb', attributes: { name: 'Piscine' } }] });
  }

  if (url.includes('/v1/me/library/playlists/p.aaa/tracks')) {
    return jsonResponse(200, {
      data: [
        {
          id: 'i.song1',
          attributes: {
            name: 'Blinding Lights',
            artistName: 'The Weeknd',
            albumName: 'After Hours',
            durationInMillis: 200000,
            isrc: 'USUG11904206',
            genreNames: ['Pop'],
            playParams: { catalogId: 'c.song1' },
          },
        },
        {
          id: 'i.song2',
          // Pas d'ISRC ici volontairement -- vérifie le fallback fuzzy.
          attributes: {
            name: "Harry's House",
            artistName: 'Harry Styles',
            playParams: { catalogId: 'c.song2' },
          },
        },
      ],
    });
  }

  if (url.includes('/v1/me/library/playlists') && method === 'POST') {
    return jsonResponse(201, { data: [{ id: 'p.new', attributes: { name: 'Chill Evening' } }] });
  }

  if (url.includes('/v1/catalog/fr/search')) {
    return jsonResponse(200, {
      results: {
        songs: {
          data: [
            {
              id: 'c.levitating',
              attributes: {
                name: 'Levitating',
                artistName: 'Dua Lipa',
                isrc: 'USUM72007546',
                playParams: { catalogId: 'c.levitating' },
              },
            },
          ],
        },
      },
    });
  }

  if (url.includes('/tracks') && method === 'POST') {
    const body = JSON.parse((init!.body as string) ?? '{}');
    if (!body?.data?.[0]?.id) return jsonResponse(400, { errors: [{ detail: "id catalogue manquant" }] });
    return new Response(null, { status: 204 });
  }

  return jsonResponse(404, { errors: [{ detail: `route mock non gérée: ${method} ${url}` }] });
};

async function main() {
  console.log('== AppleMusicProvider ==');
  const provider = new AppleMusicProvider(devTokenProvider, mockFetch);

  requestLog = [];
  const session = await provider.connect(USER_TOKEN);
  check('connect() résout un userId stable dérivé du storefront', session.userId.startsWith('apple-music:fr:'));
  check('connect() envoie les deux headers Authorization + Music-User-Token', requestLog.some((r) => r.headers['Authorization'] === `Bearer ${DEV_TOKEN}` && r.headers['Music-User-Token'] === USER_TOKEN));

  const badSession: ProviderSession = { provider: 'apple-music', userId: 'x', accessToken: 'wrong-token' };
  let authFailed = false;
  try {
    await provider.refreshAuthorization(badSession);
  } catch {
    authFailed = true;
  }
  check('un Music User Token invalide échoue explicitement (pas de faux succès)', authFailed);

  const playlists = await provider.getPlaylists(session);
  check('getPlaylists() suit la pagination (next) et renvoie les 2 pages', playlists.length === 2 && playlists.map((p) => p.name).includes('Voiture') && playlists.map((p) => p.name).includes('Piscine'));

  const tracks = await provider.getPlaylistTracks(session, 'p.aaa');
  check('getPlaylistTracks() mappe correctement le morceau avec ISRC', tracks[0].isrc === 'USUG11904206' && tracks[0].providerIds.appleMusic === 'c.song1');
  check('getPlaylistTracks() mappe correctement le morceau SANS ISRC (best-effort, jamais inventé)', tracks[1].isrc === undefined && tracks[1].title === "Harry's House");

  const found = await provider.searchTrack(session, { title: 'Levitating', artist: 'Dua Lipa', isrc: 'USUM72007546' });
  check('searchTrack() résout un morceau catalogue avec son ID Apple Music', found?.providerIds.appleMusic === 'c.levitating');

  const created = await provider.createPlaylist(session, 'Chill Evening', 'Pour se détendre');
  check('createPlaylist() renvoie l\'ID réel renvoyé par l\'API', created.id === 'p.new');

  const trackToAdd: CanonicalTrack = found!;
  let addOk = true;
  try {
    await provider.addTrackToPlaylist(session, created.id, trackToAdd);
  } catch {
    addOk = false;
  }
  check('addTrackToPlaylist() réussit quand le morceau a un ID catalogue résolu', addOk);

  const trackWithoutCatalogId: CanonicalTrack = { id: 'x', title: 'Inconnu', artist: 'Inconnu', providerIds: {} };
  let rejectedMissingId = false;
  try {
    await provider.addTrackToPlaylist(session, created.id, trackWithoutCatalogId);
  } catch {
    rejectedMissingId = true;
  }
  check("addTrackToPlaylist() refuse honnêtement un morceau sans ID catalogue (n'invente rien)", rejectedMissingId);

  let unsupported = false;
  try {
    await provider.removeTrackFromPlaylist(session, 'p.aaa', 'i.song1');
  } catch (e) {
    unsupported = e instanceof AppleMusicUnsupportedOperationError;
  }
  check("removeTrackFromPlaylist() lève une erreur explicite (limitation réelle de l'API Apple, jamais un faux succès)", unsupported);

  const isInByIsrc = await provider.isTrackInPlaylist(session, 'p.aaa', { id: 'z', isrc: 'USUG11904206', title: 'x', artist: 'y', providerIds: {} });
  check('isTrackInPlaylist() détecte par ISRC', isInByIsrc === true);
  const isInByFuzzy = await provider.isTrackInPlaylist(session, 'p.aaa', { id: 'z', title: "harry's house", artist: 'harry styles', providerIds: {} });
  check('isTrackInPlaylist() détecte par titre+artiste quand pas d\'ISRC', isInByFuzzy === true);

  const profile = await provider.getProfile(session);
  check("getProfile() n'invente jamais un nom/email qu'Apple ne fournit pas", profile.displayName === 'Compte Apple Music connecté' && !('email' in profile && profile.email));

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
