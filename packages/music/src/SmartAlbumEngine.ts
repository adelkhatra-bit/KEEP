import type { CanonicalTrack } from './types';

export type SmartAlbumKey =
  | 'slow-love'
  | 'rai-maghreb'
  | 'afro-vibes'
  | 'rap-hiphop'
  | 'rnb-soul'
  | 'electro-night'
  | 'latin'
  | 'reggae-dancehall'
  | 'pop'
  | 'rock-alt'
  | 'jazz-blues'
  | 'classical'
  | 'world-oriental';

export interface SmartAlbumSuggestion {
  key: SmartAlbumKey;
  name: string;
  description: string;
  trackIds: string[];
  trackCount: number;
  matchedGenres: string[];
}

export interface SmartAlbumOptions {
  minTracks?: number;
  maxAlbums?: number;
}

type Rule = {
  key: SmartAlbumKey;
  name: string;
  description: string;
  tokens: string[];
};

const RULES: Rule[] = [
  { key: 'slow-love', name: 'SLOW & LOVE', description: 'Ballades, slows et morceaux doux détectés par KEEP.', tokens: ['slow', 'ballad', 'love song', 'romantic', 'easy listening', 'adult contemporary'] },
  { key: 'rai-maghreb', name: 'RAÏ / MAGHREB', description: 'Raï, chaâbi et sonorités maghrébines.', tokens: ['rai', 'raï', 'chaabi', 'chaâbi', 'maghreb', 'algerian', 'gnawa', 'kabyle'] },
  { key: 'afro-vibes', name: 'AFRO VIBES', description: 'Afrobeats, amapiano, zouk, kompa et sons afro.', tokens: ['afrobeat', 'afrobeats', 'afro pop', 'afropop', 'amapiano', 'zouk', 'kompa', 'coupe decale', 'coupé-décalé'] },
  { key: 'rap-hiphop', name: 'RAP / HIP-HOP', description: 'Rap, trap, drill et hip-hop.', tokens: ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'grime'] },
  { key: 'rnb-soul', name: 'R&B / SOUL', description: 'R&B, soul et neo-soul.', tokens: ['r&b', 'rnb', 'rhythm and blues', 'soul', 'neo soul', 'neo-soul'] },
  { key: 'electro-night', name: 'ELECTRO / NIGHT', description: 'Techno, house, EDM et musiques électroniques.', tokens: ['techno', 'house', 'electro', 'electronic', 'edm', 'trance', 'minimal', 'deep house', 'dance'] },
  { key: 'latin', name: 'LATIN', description: 'Reggaeton, salsa, bachata et musiques latines.', tokens: ['latin', 'reggaeton', 'salsa', 'bachata', 'merengue'] },
  { key: 'reggae-dancehall', name: 'REGGAE / DANCEHALL', description: 'Reggae, dancehall et dub.', tokens: ['reggae', 'dancehall', 'dub'] },
  { key: 'pop', name: 'POP', description: 'Pop et variantes contemporaines.', tokens: ['pop', 'synthpop', 'synth-pop', 'k-pop', 'kpop', 'french pop'] },
  { key: 'rock-alt', name: 'ROCK / ALT', description: 'Rock, métal, punk et alternatif.', tokens: ['rock', 'metal', 'punk', 'alternative', 'indie rock'] },
  { key: 'jazz-blues', name: 'JAZZ / BLUES', description: 'Jazz, blues et swing.', tokens: ['jazz', 'blues', 'swing'] },
  { key: 'classical', name: 'CLASSIQUE', description: 'Classique, orchestral, opéra et piano.', tokens: ['classical', 'orchestral', 'orchestra', 'opera', 'piano'] },
  { key: 'world-oriental', name: 'WORLD / ORIENTAL', description: 'World, oriental et sonorités arabes.', tokens: ['world', 'oriental', 'arabic', 'middle eastern', 'arab pop'] },
];

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreRule(genres: string[], rule: Rule) {
  let score = 0;
  const matched = new Set<string>();
  for (const genre of genres) {
    const normalizedGenre = normalize(genre);
    for (const token of rule.tokens) {
      const normalizedToken = normalize(token);
      if (!normalizedToken || !normalizedGenre.includes(normalizedToken)) continue;
      matched.add(genre);
      score += normalizedGenre === normalizedToken ? 4 : 2;
    }
  }
  return { score, matched: Array.from(matched) };
}

export function classifySmartAlbum(track: Pick<CanonicalTrack, 'genres'>): { key: SmartAlbumKey; matchedGenres: string[] } | null {
  const genres = (track.genres ?? []).filter(Boolean);
  if (!genres.length) return null;

  let best: { rule: Rule; score: number; matched: string[] } | null = null;
  for (const rule of RULES) {
    const result = scoreRule(genres, rule);
    if (result.score <= 0) continue;
    if (!best || result.score > best.score) best = { rule, score: result.score, matched: result.matched };
  }
  return best ? { key: best.rule.key, matchedGenres: best.matched } : null;
}

export function buildSmartAlbumSuggestions(
  tracks: Array<Pick<CanonicalTrack, 'id' | 'genres'>>,
  options: SmartAlbumOptions = {},
): SmartAlbumSuggestion[] {
  const minTracks = Math.max(1, Math.floor(options.minTracks ?? 2));
  const maxAlbums = Math.max(1, Math.floor(options.maxAlbums ?? 10));
  const buckets = new Map<SmartAlbumKey, { trackIds: string[]; genres: Set<string> }>();

  for (const track of tracks) {
    const classification = classifySmartAlbum(track);
    if (!classification) continue;
    const bucket = buckets.get(classification.key) ?? { trackIds: [], genres: new Set<string>() };
    if (!bucket.trackIds.includes(track.id)) bucket.trackIds.push(track.id);
    for (const genre of classification.matchedGenres) bucket.genres.add(genre);
    buckets.set(classification.key, bucket);
  }

  return RULES
    .map((rule) => {
      const bucket = buckets.get(rule.key);
      if (!bucket || bucket.trackIds.length < minTracks) return null;
      return {
        key: rule.key,
        name: rule.name,
        description: rule.description,
        trackIds: bucket.trackIds,
        trackCount: bucket.trackIds.length,
        matchedGenres: Array.from(bucket.genres).slice(0, 6),
      } satisfies SmartAlbumSuggestion;
    })
    .filter((item): item is SmartAlbumSuggestion => Boolean(item))
    .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name))
    .slice(0, maxAlbums);
}

export function smartAlbumTaxonomy() {
  return RULES.map(({ key, name, description, tokens }) => ({ key, name, description, tokens: [...tokens] }));
}
