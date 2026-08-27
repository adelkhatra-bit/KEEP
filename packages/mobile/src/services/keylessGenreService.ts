import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@keep/keyless-genre-v1:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CachedGenre = { genres: string[]; savedAt: number };

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cacheKey(title: string, artist: string) {
  return `${CACHE_PREFIX}${normalize(artist)}|${normalize(title)}`.slice(0, 420);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function localStyleHints(title: string, artist: string, catalogGenre: string, collection: string) {
  const text = normalize(`${title} ${artist} ${catalogGenre} ${collection}`);
  const hints: string[] = [];
  if (/\b(rai|raï|chaabi|chaâbi|kabyle|maghreb|gnawa)\b/i.test(`${title} ${artist} ${collection}`)) hints.push('Raï / Maghreb');
  if (/\b(amapiano|afrobeat|afrobeats|afropop|zouk|kompa)\b/i.test(text)) hints.push('Afrobeats');
  if (/\b(slow|love|romance|romantic|ballad|ballade)\b/i.test(text)) hints.push('Slow / Love');
  if (/\b(drill|trap|rap|hip hop|hip-hop)\b/i.test(text)) hints.push('Hip-Hop/Rap');
  if (/\b(techno|house|edm|trance|electro|electronic)\b/i.test(text)) hints.push('Electronic');
  return hints;
}

/**
 * Enrichissement gratuit et sans clé. KEEP utilise uniquement le catalogue
 * public déjà employé pour les jaquettes/extraits : aucune clé, aucun quota
 * payant et aucun secret n'est ajouté à l'application.
 */
export async function resolveKeylessGenres(title: string, artist: string): Promise<string[]> {
  const key = cacheKey(title, artist);
  try {
    const cachedRaw = await AsyncStorage.getItem(key);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as CachedGenre;
      if (Array.isArray(cached.genres) && Date.now() - Number(cached.savedAt ?? 0) <= CACHE_TTL_MS) return cached.genres;
    }
  } catch {}

  let genres: string[] = [];
  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const response = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=6&country=FR`);
    if (response.ok) {
      const body = await response.json();
      const results = Array.isArray(body?.results) ? body.results : [];
      const wantedTitle = normalize(title);
      const wantedArtist = normalize(artist);
      const best = results.find((item: any) => normalize(String(item?.trackName ?? '')) === wantedTitle && normalize(String(item?.artistName ?? '')) === wantedArtist)
        ?? results.find((item: any) => normalize(String(item?.trackName ?? '')).includes(wantedTitle) && normalize(String(item?.artistName ?? '')).includes(wantedArtist))
        ?? results[0];
      if (best) {
        const catalogGenre = String(best.primaryGenreName ?? '').trim();
        const collection = String(best.collectionName ?? '').trim();
        genres = unique([catalogGenre, ...localStyleHints(title, artist, catalogGenre, collection)]);
      }
    }
  } catch {}

  try { await AsyncStorage.setItem(key, JSON.stringify({ genres, savedAt: Date.now() } satisfies CachedGenre)); } catch {}
  return genres;
}

export async function enrichMissingGenres<T extends { title: string; artist: string; genres: string[] }>(tracks: T[]): Promise<T[]> {
  const result = tracks.map((track) => ({ ...track, genres: [...track.genres] }));
  const pending = result.map((track, index) => ({ track, index })).filter(({ track }) => track.genres.length === 0);
  const concurrency = 4;
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      const current = pending[cursor++];
      const genres = await resolveKeylessGenres(current.track.title, current.track.artist);
      result[current.index] = { ...current.track, genres };
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  return result;
}
