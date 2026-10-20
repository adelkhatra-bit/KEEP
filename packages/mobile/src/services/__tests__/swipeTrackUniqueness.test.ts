import { displayedSongIdentity, uniqueSwipeTracks } from '../swipeTrackUniqueness';

describe('Swipe / profile / Story: one audible song, one card', () => {
  const title = (id: string, genres: string[], name = 'Cabo Verde', artist = 'Rey Salinero') =>
    ({ id, title: name, artist, genres, providerIds: {} });

  it('collapses the same title and artist from many catalogues or different styles', () => {
    const tracks = [
      title('provider-one',['Electronic']),
      title('provider-two',['New Age']),
      title('provider-three',['Lounge']),
      title('provider-four',['Ambient']),
    ];
    expect(uniqueSwipeTracks(tracks).map(x => x.id)).toEqual(['provider-one']);
  });

  it('does not conflate separate remixes, live performances or artists', () => {
    const songs = [
      title('studio',[], 'Never Give Up', 'Sam'),
      title('live',[], 'Never Give Up (Live)', 'Sam'),
      title('remix',[], 'Never Give Up (Remix)', 'Sam'),
      title('other',[], 'Never Give Up', 'Other Sam'),
    ];
    expect(uniqueSwipeTracks(songs)).toHaveLength(4);
  });

  it('deduplicates accents/punctuation but not unrelated music', () => {
    expect(displayedSongIdentity('Ça va!', 'L’Artiste')).toBe(displayedSongIdentity('Ca va', 'L Artiste'));
    expect(uniqueSwipeTracks([
      title('source-a',[],"Ça va!", 'L’Artiste'),
      title('source-b',[],'Ca va', 'L Artiste'),
    ])).toHaveLength(1);
  });

  it('uses strong provider IDs even when the track labels are different', () => {
    const songs = [
      {id:'a', title:'Title',artist:'Singer', providerIds:{spotify:'123'}},
      {id:'b', title:'Title alternative',artist:'Singer',providerIds:{spotify:'123'}},
    ];
    expect(uniqueSwipeTracks(songs)).toHaveLength(1);
  });
});
