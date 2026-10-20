import { songDuplicateKey } from '../trackDuplicateKey';

describe('songDuplicateKey', () => {
  it('reconnaît la même chanson malgré remaster, accents et feat.', () => {
    const a = songDuplicateKey('Is This Love', 'Bob Marley & The Wailers');
    expect(songDuplicateKey('Is This Love - 2001 Remaster', 'Bob Marley & The Wailers')).toBe(a);
    expect(songDuplicateKey('Is This Love (Remastered)', 'Bob Marley & The Wailers')).toBe(a);
    expect(songDuplicateKey('IS THIS LOVE', 'bob marley & the wailers')).toBe(a);
  });
  it('sépare deux chansons différentes', () => {
    expect(songDuplicateKey('One Love', 'Bob Marley')).not.toBe(songDuplicateKey('Is This Love', 'Bob Marley'));
    expect(songDuplicateKey('Is This Love', 'Bob Marley')).not.toBe(songDuplicateKey('Is This Love', 'Whitesnake'));
  });
});
