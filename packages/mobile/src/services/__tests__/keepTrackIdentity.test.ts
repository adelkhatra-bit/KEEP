import { keepProviderIdentities, normalizeKeepTrackText, tracksRepresentSameKeep } from '../keepTrackIdentity';

const base = {
  id: 'keep-local-a',
  title: 'Me gustas tù',
  artist: 'Josas',
  providerIds: { appleMusic: '1659483185' },
};

describe('KEEP duplicate track identity', () => {
  it('reconnaît le même morceau via Apple Music même sans ISRC et avec un titre différent', () => {
    expect(tracksRepresentSameKeep(base as any, {
      id: 'provider-b',
      title: 'Me Gustas Tu - Single Version',
      artist: 'Josas',
      providerIds: { appleMusic: '1659483185' },
    } as any)).toBe(true);
  });

  it('reconnaît le même morceau via Spotify même si les ids KEEP diffèrent', () => {
    expect(tracksRepresentSameKeep({
      id: 'keep-a', title: 'Bad Girl', artist: 'Usher', isrc: undefined,
      providerIds: { spotify: '5rPzPAaOUceS8HiAculegz' },
    } as any, {
      id: 'provider-b', title: 'Bad Girl (Album Version)', artist: 'Usher', isrc: undefined,
      providerIds: { spotify: '5rPzPAaOUceS8HiAculegz' },
    } as any)).toBe(true);
  });

  it('reconnaît le même ISRC indépendamment de la casse', () => {
    expect(tracksRepresentSameKeep({ ...base, isrc: 'fr1s70400012' } as any, {
      ...base, id: 'other', isrc: 'FR1S70400012', providerIds: {},
    } as any)).toBe(true);
  });

  it('normalise accents, casse et mentions de version avant le filet texte', () => {
    expect(normalizeKeepTrackText("N'tya (Album Version)")).toBe(normalizeKeepTrackText("N'TYA"));
  });

  it('ne confond pas deux morceaux différents du même artiste', () => {
    expect(tracksRepresentSameKeep({
      id: 'a', title: 'Bad Girl', artist: 'Usher', providerIds: {},
    } as any, {
      id: 'b', title: 'Yeah!', artist: 'Usher', providerIds: {},
    } as any)).toBe(false);
  });

  it('ignore les identifiants fournisseurs vides', () => {
    expect(keepProviderIdentities({ providerIds: { spotify: '', appleMusic: '123' } } as any))
      .toEqual([{ provider: 'appleMusic', value: '123' }]);
  });
});
