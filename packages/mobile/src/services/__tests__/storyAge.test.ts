import fs from 'fs';
import path from 'path';
import { formatStoryAge } from '../storyActivity';

describe('Âge d\'une story (Adel 05/10/2026)', () => {
  const now = Date.parse('2026-10-05T18:53:00Z');
  it('indique depuis quand et combien de temps encore (fenêtre 24 h)', () => {
    expect(formatStoryAge('2026-10-05T16:50:00Z', now)).toBe('Ajoutée il y a 2 h 03 · encore visible 21 h 57');
  });
  it('tombe à 0 min restant au-delà de 24 h et ignore une date invalide', () => {
    expect(formatStoryAge('2026-10-04T10:00:00Z', now)).toContain('encore visible 0 min');
    expect(formatStoryAge('nope', now)).toBeNull();
    expect(formatStoryAge(null, now)).toBeNull();
  });
  it('le deck affiche la ligne et ProfileStoryBar lui transmet addedAt', () => {
    const deck = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'MusicSwipeDeckModal.tsx'), 'utf8');
    const bar = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'ProfileStoryBar.tsx'), 'utf8');
    expect(deck).toContain('testID="deck-story-age"');
    expect(bar).toContain('trackAddedAt={openStory?.addedAt}');
  });
});

describe('Collection entière en story (Adel 05/10/2026)', () => {
  const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
  it('lit toutes les musiques d\'une collection < 24 h via le serveur et les masque', () => {
    expect(svc).toContain("supabase.rpc('keep_playlist_sale_story_tracks'");
    expect(svc).toContain('MAX_COLLECTION_TRACKS_PER_STORY');
    expect(svc).toContain('mergeSaleTracks(withPins, collection, MAX_COLLECTION_TRACKS_PER_STORY)');
  });
});

describe('Collection déjà en story = bouton « + » éteint (Adel 05/10/2026)', () => {
  it('loadMyStoryTrackIds compte les titres de mes collections < 24 h', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', 'musicStoriesService.ts'), 'utf8');
    expect(svc).toContain('loadSaleCollectionStoryTracks([uid])');
  });
});
