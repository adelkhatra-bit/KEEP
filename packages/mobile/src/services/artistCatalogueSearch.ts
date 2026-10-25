// Recherche par artiste : « Artiste » seul -> toutes ses musiques (Deezer, catalogue public sans clé),
// comme la barre de recherche de YouTube / Spotify / Deezer. Lecture seule, aucune écriture,
// aucun quota consommé : la préécoute reste gratuite et le GARDER reste un choix séparé.
import type { RecognitionResult } from '@keep/music';

export type ArtistTrackResult = RecognitionResult & { deezerId: string };

const DEEZER = 'https://api.deezer.com';
const MAX_TRACKS = 50;

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Une saisie « Artiste – Titre », un lien ou une URL n'est PAS une recherche d'artiste. */
export function isArtistOnlyQuery(input: string): boolean {
  const value = input.trim();
  if (value.length < 2) return false;
  if (/https?:\/\/|www\.|youtu\.?be|spotify|deezer\.com/i.test(value)) return false;
  if (/\s[–—-]\s/.test(value) || /\s-\S|\S-\s/.test(value)) return false;
  return true;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DEEZER_HTTP_${response.status}`);
  return response.json();
}

/** Mappe une piste Deezer vers le format de résultat utilisé par l'app. */
export function deezerRowToArtistTrack(row: any): ArtistTrackResult | null {
  if (!row?.id || !row?.title || !row?.artist?.name) return null;
  return {
    deezerId: String(row.id),
    confidence: 1,
    title: String(row.title),
    artist: String(row.artist.name),
    album: row.album?.title ? String(row.album.title) : undefined,
    durationSec: typeof row.duration === 'number' ? row.duration : undefined,
    artworkUrl: row.album?.cover_xl || row.album?.cover_big || undefined,
    previewUrl: row.preview || undefined,
    availableOn: ['DEEZER'],
    externalUrls: row.link ? { deezer: String(row.link) } : undefined,
  } as ArtistTrackResult;
}

/**
 * Toutes les musiques d'un artiste : on prend l'artiste dont le nom correspond
 * exactement à la saisie (sinon le premier résultat), puis ses titres les plus
 * écoutés. Renvoie [] si aucun artiste ne correspond.
 */
export async function searchArtistTracks(query: string): Promise<{ artistName: string; tracks: ArtistTrackResult[]; exactArtist: boolean }> {
  const wanted = normalizeName(query);
  if (!isArtistOnlyQuery(query) || !wanted) return { artistName: '', tracks: [], exactArtist: false };
  const search = await getJson(`${DEEZER}/search/artist?q=${encodeURIComponent(query.trim().slice(0, 120))}&limit=5`);
  const artists: any[] = Array.isArray(search?.data) ? search.data : [];
  const exact = artists.find((a) => normalizeName(String(a?.name ?? '')) === wanted);
  const artist = exact ?? artists[0];
  if (!artist?.id) return { artistName: '', tracks: [], exactArtist: false };
  const top = await getJson(`${DEEZER}/artist/${encodeURIComponent(String(artist.id))}/top?limit=${MAX_TRACKS}`);
  const tracks = (Array.isArray(top?.data) ? top.data : [])
    .map(deezerRowToArtistTrack)
    .filter((t: ArtistTrackResult | null): t is ArtistTrackResult => Boolean(t));
  // exactArtist=false : nom seulement approchant (« Djadja » -> « Djadja & Dinaz »). L'écran ne doit
  // alors l'utiliser qu'en dernier recours, si la recherche titre n'a rien trouvé (Adel, 25/10/2026).
  return { artistName: String(artist.name ?? query), tracks, exactArtist: Boolean(exact) };
}
