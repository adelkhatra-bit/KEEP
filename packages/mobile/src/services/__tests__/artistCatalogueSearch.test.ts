import { isArtistOnlyQuery, searchArtistTracks, deezerRowToArtistTrack } from '../artistCatalogueSearch';

describe('artist-only search (Deezer catalogue, no key)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('treats a bare artist name as an artist search', () => {
    expect(isArtistOnlyQuery('James Blunt')).toBe(true);
    expect(isArtistOnlyQuery('Jocelyn Brown')).toBe(true);
  });

  it('keeps "Artiste – Titre", links and URLs on the single-track path', () => {
    expect(isArtistOnlyQuery('James Blunt – 1973')).toBe(false);
    expect(isArtistOnlyQuery('James Blunt - 1973')).toBe(false);
    expect(isArtistOnlyQuery('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isArtistOnlyQuery('https://open.spotify.com/track/x')).toBe(false);
    expect(isArtistOnlyQuery('a')).toBe(false);
  });

  it('maps a Deezer track row to the app track shape with a free preview', () => {
    const track = deezerRowToArtistTrack({
      id: 42, title: '1973', duration: 200, preview: 'https://cdn/preview.mp3', link: 'https://www.deezer.com/track/42',
      artist: { name: 'James Blunt' }, album: { title: 'Back to Bedlam', cover_big: 'https://cdn/cover.jpg' },
    });
    expect(track).toMatchObject({ deezerId: '42', title: '1973', artist: 'James Blunt', previewUrl: 'https://cdn/preview.mp3', availableOn: ['DEEZER'] });
    expect(deezerRowToArtistTrack({ id: 1, title: '' })).toBeNull();
  });

  it('returns all top tracks of the exactly matching artist', async () => {
    const calls: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      calls.push(String(url));
      const body = String(url).includes('/search/artist')
        ? { data: [{ id: 9, name: 'James Blunt Tribute' }, { id: 7, name: 'James Blunt' }] }
        : { data: [{ id: 1, title: '1973', artist: { name: 'James Blunt' } }, { id: 2, title: 'Goodbye My Lover', artist: { name: 'James Blunt' } }] };
      return { ok: true, json: async () => body } as any;
    });
    const result = await searchArtistTracks('James Blunt');
    expect(calls[0]).toContain('/search/artist?q=James%20Blunt');
    expect(calls[1]).toContain('/artist/7/top?limit=50');
    expect(result.artistName).toBe('James Blunt');
    expect(result.tracks.map((t) => t.title)).toEqual(['1973', 'Goodbye My Lover']);
  });

  it('returns nothing for a link (never hijacks single-track lookup)', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const result = await searchArtistTracks('https://youtu.be/abc');
    expect(result.tracks).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
