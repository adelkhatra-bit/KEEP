import { TrackResolver } from '../TrackResolver';
import { CanonicalTrack } from '../types';

describe('TrackResolver', () => {
  it('résout un morceau existant par ISRC exact', () => {
    const track: CanonicalTrack = {
      id: 't1',
      isrc: 'USUG11904206',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      providerIds: { spotify: 'spotify123' },
    };
    const resolver = new TrackResolver([track]);
    const found = resolver.findExisting({ isrc: 'USUG11904206' });
    expect(found?.id).toBe('t1');
  });

  it('résout par correspondance floue titre+artiste malgré une orthographe légèrement différente', () => {
    const track: CanonicalTrack = {
      id: 't2',
      title: "Harry's House",
      artist: 'Harry Styles',
      providerIds: {},
    };
    const resolver = new TrackResolver([track]);
    // "As It Was" par exemple réel, ici on teste juste la tolérance de casse/accents
    const found = resolver.findExisting({ title: 'harrys house', artist: 'harry styles' });
    expect(found?.id).toBe('t2');
  });

  it('ne force pas un rapprochement pour un morceau clairement différent (crée un nouveau canonique)', () => {
    const track: CanonicalTrack = { id: 't3', title: 'Levitating', artist: 'Dua Lipa', providerIds: {} };
    const resolver = new TrackResolver([track]);
    const found = resolver.findExisting({ title: 'Bad Guy', artist: 'Billie Eilish' });
    expect(found).toBeNull();
  });

  it('crée un morceau canonique unique à partir d’un résultat de reconnaissance, puis le réutilise', () => {
    const resolver = new TrackResolver();
    const first = resolver.resolveFromRecognition({ confidence: 0.9, title: 'Levitating', artist: 'Dua Lipa', isrc: 'USUM72007546' });
    const second = resolver.resolveFromRecognition({ confidence: 0.88, title: 'Levitating', artist: 'Dua Lipa', isrc: 'USUM72007546' });
    expect(second.id).toBe(first.id);
    expect(resolver.size()).toBe(1);
  });

  it('lie un ID provider supplémentaire à un morceau déjà connu (cas Compare cross-provider)', () => {
    const resolver = new TrackResolver();
    const track = resolver.resolveFromRecognition({ confidence: 0.9, title: 'Levitating', artist: 'Dua Lipa' });
    resolver.linkProviderId(track, 'appleMusic', 'apple-987');
    const found = resolver.findExisting({ provider: 'appleMusic', providerId: 'apple-987' });
    expect(found?.id).toBe(track.id);
  });
});
