import { resolveTrackArtworkUrl, resolveTrackPreviewUrl, scoreTrackSearchResult } from '../trackPreviewResolver';

const itunes = (results: any[]) => ({ ok: true, json: async () => ({ results }) });

describe('pochette de secours (titre + artiste)', () => {
  const realFetch = (global as any).fetch;
  afterEach(() => { (global as any).fetch = realFetch; });

  it('garde la pochette fournie sans aucune requête', async () => {
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    await expect(resolveTrackArtworkUrl({ title: 'A', artist: 'B', artworkUrl: 'https://x/y.jpg' })).resolves.toBe('https://x/y.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retrouve la pochette et la passe en 600x600 quand titre ET artiste correspondent', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(itunes([
      { trackName: 'Instru Test', artistName: 'Artiste Zéro', artworkUrl100: 'https://is1.mzstatic.com/image/thumb/abc/100x100bb.jpg' },
    ]));
    await expect(resolveTrackArtworkUrl({ title: 'Instru Test', artist: 'Artiste Zero' })).resolves
      .toBe('https://is1.mzstatic.com/image/thumb/abc/600x600bb.jpg');
  });

  it('refuse une pochette au hasard : mauvais titre ou mauvais artiste', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(itunes([
      { trackName: 'Autre chanson', artistName: 'Quelqu\'un d\'autre', artworkUrl100: 'https://is1.mzstatic.com/z/100x100bb.jpg' },
    ]));
    await expect(resolveTrackArtworkUrl({ title: 'Titre Introuvable', artist: 'Artiste Inconnu Rare' })).resolves.toBeNull();
  });

  it('ne casse jamais l\'écoute si le réseau échoue', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('réseau coupé'));
    await expect(resolveTrackArtworkUrl({ title: 'Panne Réseau', artist: 'Test Hors Ligne' })).resolves.toBeNull();
  });
  it('ne confond pas deux artistes ayant le même titre : aucun extrait erroné', async () => {
    const wanted = { title: 'Same Title - Preview Check', artist: 'Artiste Correct' } as any;
    const homonym = {
      trackName: 'Same Title - Preview Check',
      artistName: 'Autre Artiste',
      previewUrl: 'https://example.com/wrong-preview.m4a',
      artworkUrl100: 'https://example.com/wrong-cover.jpg',
    };
    expect(scoreTrackSearchResult(wanted, homonym)).toBe(0);
    (global as any).fetch = jest.fn().mockResolvedValue(itunes([homonym]));
    await expect(resolveTrackPreviewUrl(wanted)).resolves.toBeNull();
  });

  it('accepte la même œuvre quand le titre et l’artiste correspondent vraiment', async () => {
    const wanted = { title: 'Same Title - Good Preview', artist: 'Artiste Correct' } as any;
    const exact = { trackName: wanted.title, artistName: wanted.artist, previewUrl: 'https://example.com/good-preview.m4a' };
    expect(scoreTrackSearchResult(wanted, exact)).toBeGreaterThan(7);
    (global as any).fetch = jest.fn().mockResolvedValue(itunes([exact]));
    await expect(resolveTrackPreviewUrl(wanted)).resolves.toBe(exact.previewUrl);
  });

});
