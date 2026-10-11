import { mergeTasteRecommendations } from '../tasteMerge';
import type { LokiPulseItem } from '../lokiPulseService';

function item(id: string, title: string, artist: string): LokiPulseItem {
  return { track: { id, title, artist, genres: [], providerIds: {}, externalUrls: {}, availableOn: [] }, relevanceScore: 1, isNew: true };
}

describe('Loki Pulse · ne rejoue pas la même chanson sous deux identifiants', () => {
  it('élimine les doublons du flux même sans recommandation personnalisée', () => {
    const result = mergeTasteRecommendations([
      item('itunes:1', 'Mon tube', 'Artiste'),
      item('spotify:1', 'Mon tube', 'Artiste'),
      item('itunes:2', 'Autre chanson', 'Artiste'),
    ], [], 60);
    expect(result.map(x => x.track.id)).toEqual(['itunes:1', 'itunes:2']);
  });
  it('priorise les suggestions puis conserve la diversité sans répétition', () => {
    const result = mergeTasteRecommendations([
      item('itunes:1', 'Mon tube', 'Artiste'),
      item('itunes:2', 'Autre chanson', 'Autre artiste'),
    ], [item('spotify:1', 'Mon tube', 'Artiste')], 60);
    expect(result.map(x => x.track.id)).toEqual(['spotify:1', 'itunes:2']);
  });
});
