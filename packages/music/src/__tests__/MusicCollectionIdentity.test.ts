import { canonicalAlbumIdentity, groupTracksByAlbum, groupTracksByArtist, primaryArtistName } from '../MusicCollectionIdentity';
import type { CanonicalTrack } from '../types';

function track(overrides: Partial<CanonicalTrack>): CanonicalTrack {
  return {
    id: overrides.id ?? Math.random().toString(36),
    title: overrides.title ?? 'Titre',
    artist: overrides.artist ?? 'Artiste',
    album: overrides.album,
    isrc: overrides.isrc,
    artworkUrl: overrides.artworkUrl,
    providerIds: overrides.providerIds ?? {},
  };
}

describe('MusicCollectionIdentity', () => {
  it('ne mélange pas deux albums portant le même titre chez deux artistes', () => {
    const groups = groupTracksByAlbum([
      track({ id: '1', artist: 'Artist A', album: 'Greatest Hits', title: 'A1' }),
      track({ id: '2', artist: 'Artist B', album: 'Greatest Hits', title: 'B1' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((group) => group.artist))).toEqual(new Set(['Artist A', 'Artist B']));
  });

  it('regroupe les morceaux feat sous le même artiste principal', () => {
    expect(primaryArtistName('Artist A feat. Guest')).toBe('Artist A');
    const groups = groupTracksByArtist([
      track({ id: '1', artist: 'Artist A', title: 'Solo' }),
      track({ id: '2', artist: 'Artist A feat. Guest', title: 'Duo' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].trackCount).toBe(2);
  });

  it('utilise un identifiant de release group quand il existe', () => {
    const a = track({ artist: 'Artist A', album: 'Album', providerIds: { musicBrainzReleaseGroup: 'rg-123' } });
    const b = track({ artist: 'Artist A', album: 'Album Deluxe', providerIds: { musicBrainzReleaseGroup: 'rg-123' } });
    expect(canonicalAlbumIdentity(a)).toBe(canonicalAlbumIdentity(b));
  });

  it('garde les éditions distinctes sans identifiant catalogue commun', () => {
    const groups = groupTracksByAlbum([
      track({ id: '1', artist: 'Artist A', album: 'Album', title: 'A1' }),
      track({ id: '2', artist: 'Artist A', album: 'Album Deluxe', title: 'A2' }),
    ]);
    expect(groups).toHaveLength(2);
  });
});
