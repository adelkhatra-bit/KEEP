import { canonicalArtistIdentity, primaryArtistName, type CanonicalTrack } from '@keep/music';

/** Taxonomie partagée avec la base : variantes orthographiques d'un genre = même dossier. */
function styleKey(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aliases: Record<string, string> = {
    rap: 'hiphoprap', hiphop: 'hiphoprap', hiphoprap: 'hiphoprap', hiphoprapmusic: 'hiphoprap',
    rb: 'rbsoul', rbsoul: 'rbsoul', rhythmandblues: 'rbsoul',
    afrobeat: 'afrobeats', afrobeats: 'afrobeats',
    rai: 'rai', raimaghreb: 'rai', raidumaghreb: 'rai',
    electronic: 'electronic', electronique: 'electronic', electronica: 'electronic',
    classique: 'classical', classical: 'classical',
    kpop: 'kpop', koreanpop: 'kpop',
  };
  return aliases[normalized] || normalized;
}

/** Source unique du tri par style (onglet Styles de « Trier ma musique » et profil) : un morceau apparaît dans chacun de ses genres, jamais deux fois dans le même. */
export function groupTracksByStyle(tracks: CanonicalTrack[]): Array<{ genre: string; tracks: CanonicalTrack[] }> {
  const map = new Map<string, { label: string; tracks: CanonicalTrack[] }>();
  for (const track of tracks) {
    const genres = (track.genres ?? []).map((genre) => genre.trim()).filter(Boolean);
    const labels = genres.length ? genres : ['Sans genre'];
    for (const genre of labels) {
      const key = styleKey(genre);
      const current = map.get(key) ?? { label: genre, tracks: [] };
      if (!current.tracks.some((row) => row.id === track.id)) current.tracks.push(track);
      map.set(key, current);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.tracks.length - a.tracks.length || a.label.localeCompare(b.label))
    .map(({ label, tracks: rows }) => ({ genre: label, tracks: rows }));
}

/** Une carte par artiste PRINCIPAL (le « feat. » reste chez l'artiste principal) avec UNIQUEMENT ses morceaux ; tri alphabétique (Adel 05/10/2026 : « si c'est Jul, il n'y a que du Jul »). */
export function groupEntriesByArtist<E extends { track: CanonicalTrack }>(entries: E[]): Array<{ key: string; label: string; entries: E[] }> {
  const map = new Map<string, { label: string; entries: E[] }>();
  for (const entry of entries) {
    const key = canonicalArtistIdentity(entry.track);
    if (!key) continue;
    const current = map.get(key) ?? { label: primaryArtistName(entry.track.artist) || entry.track.artist.trim(), entries: [] };
    if (!current.entries.some((row) => row.track.id === entry.track.id)) current.entries.push(entry);
    map.set(key, current);
  }
  return Array.from(map.entries()).map(([key, value]) => ({ key, ...value })).sort((a, b) => a.label.localeCompare(b.label));
}
