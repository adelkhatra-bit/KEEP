import {
  buildKeepTrackIdentityIndex,
  filterTracksNotAlreadyKept,
  keepProviderIdentities,
  normalizeKeepTrackText,
  trackExistsInKeepIndex,
  tracksRepresentSameKeep,
} from '../keepTrackIdentity';

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

  it('retire avant le Swipe tous les morceaux déjà possédés', () => {
    const own = [
      { id: 'keep-1', title: 'Bad Girl', artist: 'Usher', isrc: 'USAR10400214', providerIds: { spotify: '5rPzPAaOUceS8HiAculegz' } },
      { id: 'keep-2', title: 'Me gustas tù', artist: 'Josas', providerIds: { appleMusic: '1659483185' } },
    ] as any[];
    const candidate = [
      { id: 'remote-a', title: 'Bad Girl (Album Version)', artist: 'Usher', providerIds: { spotify: '5rPzPAaOUceS8HiAculegz' } },
      { id: 'remote-b', title: 'Me Gustas Tu - Single Version', artist: 'Josas', providerIds: { appleMusic: '1659483185' } },
      { id: 'remote-c', title: 'Nouveau morceau', artist: 'Nouvel artiste', providerIds: { spotify: 'new-track' } },
    ] as any[];

    const index = buildKeepTrackIdentityIndex(own as any);
    expect(trackExistsInKeepIndex(index, candidate[0])).toBe(true);
    expect(trackExistsInKeepIndex(index, candidate[1])).toBe(true);
    expect(filterTracksNotAlreadyKept(candidate as any, index).map((track: any) => track.id)).toEqual(['remote-c']);
  });

  it('retire aussi un morceau via le filet titre/artiste quand aucun id fournisseur n’est disponible', () => {
    const index = buildKeepTrackIdentityIndex([
      { id: 'keep-x', title: "N'tya (Album Version)", artist: 'Kayliah', providerIds: {} },
    ] as any);
    const filtered = filterTracksNotAlreadyKept([
      { id: 'remote-x', title: "N'TYA", artist: 'Kayliah', providerIds: {} },
      { id: 'remote-y', title: 'Autre', artist: 'Kayliah', providerIds: {} },
    ] as any, index);
    expect(filtered.map((track: any) => track.id)).toEqual(['remote-y']);
  });
});
