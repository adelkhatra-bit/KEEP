/**
 * Vérification exécutable réelle de AudDRecognitionProvider, avec un fetch
 * simulé qui reproduit fidèlement les réponses de l'API AudD documentées
 * (vérifiées le 21/08/2026, voir commentaires en tête de
 * AudDRecognitionProvider.ts pour la source). Vérifie aussi la CONSTRUCTION
 * réelle de la requête multipart (champs présents, fichier attaché), pas
 * seulement le traitement de la réponse.
 *
 * Usage: npx tsx packages/music/scripts/verify-audd.ts
 */
import { AudDRecognitionProvider, AudDRecognitionError } from '../src/providers/AudDRecognitionProvider';

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let lastForm: FormData | null = null;

const SUCCESS_MATCH = {
  status: 'success',
  result: {
    artist: 'The Weeknd',
    title: 'Blinding Lights',
    album: 'After Hours',
    song_link: 'https://lis.tn/BlindingLights',
    apple_music: {
      isrc: 'USUG11904206',
      artwork: { url: 'https://is1-ssl.mzstatic.com/image/thumb/xyz/{w}x{h}cc.jpeg' },
      playParams: { id: 'c.blindinglights' },
    },
    spotify: {
      external_ids: { isrc: 'USUG11904206' },
      album: { images: [{ url: 'https://spotify.example/cover.jpg' }] },
      id: 's.blindinglights',
    },
  },
};

const mockFetch: typeof fetch = async (_input, init) => {
  lastForm = init?.body as FormData;
  const token = lastForm.get('api_token');
  if (token === 'bad-token') {
    return jsonResponse(200, { status: 'error', error: { error_code: 901, error_message: 'Invalid token' } });
  }
  if (token === 'no-match-token') {
    return jsonResponse(200, { status: 'success', result: null });
  }
  if (token === 'empty-array-token') {
    return jsonResponse(200, { status: 'success', result: [] });
  }
  if (token === 'spotify-only-token') {
    return jsonResponse(200, {
      status: 'success',
      result: { artist: 'Dua Lipa', title: 'Levitating', spotify: { external_ids: { isrc: 'USUM72007546' } } },
    });
  }
  return jsonResponse(200, SUCCESS_MATCH);
};

async function main() {
  console.log('== AudDRecognitionProvider ==');

  const provider = new AudDRecognitionProvider({ apiToken: 'good-token' }, mockFetch);
  const sample = new Blob([new Uint8Array([1, 2, 3, 4])]);

  const result = await provider.recognize(sample);
  check('reconnaît un morceau avec correspondance', result?.title === 'Blinding Lights' && result?.artist === 'The Weeknd');
  check("préfère l'ISRC Apple Music (cohérent avec spotify ici, mais priorité documentée)", result?.isrc === 'USUG11904206');
  check("résout l'URL d'artwork Apple Music avec la taille demandée (pas de {w}/{h} restants)", result?.artworkUrl === 'https://is1-ssl.mzstatic.com/image/thumb/xyz/300x300cc.jpeg');
  check('confidence = 1.0 sur un match (AudD ne fournit pas de score continu -- pas de nombre inventé)', result?.confidence === 1.0);
  check('recognitionProviderTrackId résolu depuis apple_music.playParams.id', result?.recognitionProviderTrackId === 'c.blindinglights');

  check('envoie bien api_token dans le form multipart', lastForm?.get('api_token') === 'good-token');
  check('envoie bien return=apple_music,spotify (nécessaire pour obtenir un ISRC)', lastForm?.get('return') === 'apple_music,spotify');
  check('attache le fichier audio sous le champ "file"', lastForm?.get('file') instanceof Blob);

  const noMatchNull = await new AudDRecognitionProvider({ apiToken: 'no-match-token' }, mockFetch).recognize(sample);
  check('result:null -> renvoie null (pas de faux positif)', noMatchNull === null);

  const noMatchArray = await new AudDRecognitionProvider({ apiToken: 'empty-array-token' }, mockFetch).recognize(sample);
  check('result:[] -> renvoie aussi null (les deux formes "pas de match" gérées)', noMatchArray === null);

  const spotifyOnly = await new AudDRecognitionProvider({ apiToken: 'spotify-only-token' }, mockFetch).recognize(sample);
  check("repli sur l'ISRC Spotify quand apple_music est absent de la réponse", spotifyOnly?.isrc === 'USUM72007546');

  let apiErrorCaught = false;
  try {
    await new AudDRecognitionProvider({ apiToken: 'bad-token' }, mockFetch).recognize(sample);
  } catch (e) {
    apiErrorCaught = e instanceof AudDRecognitionError;
  }
  check("une erreur API AudD (status:error) lève une AudDRecognitionError explicite (pas un null silencieux)", apiErrorCaught);

  let missingTokenCaught = false;
  try {
    await new AudDRecognitionProvider({ apiToken: '' }, mockFetch).recognize(sample);
  } catch (e) {
    missingTokenCaught = e instanceof AudDRecognitionError;
  }
  check('api_token vide refusé avant même l\'appel réseau (jamais un appel avec une clé vide)', missingTokenCaught);

  console.log(`\n${passed} passés, ${failed} échoués sur ${passed + failed} vérifications.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
