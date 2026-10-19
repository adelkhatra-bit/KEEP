// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const embed = read('StoryEmbeddedSourcePlayer.tsx');
const deck = read('MusicSwipeDeckModal.tsx');
const viewer = read('ProfileStoryBar.tsx');
const watch = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'storyWatchService.ts'), 'utf8');

describe('Story player: same behavior on mobile and PC', () => {
  it('renders a provider-owned player immediately, without the second video button', () => {
    expect(embed).toContain('testID="story-embedded-frame"');
    expect(embed).not.toContain('story-embedded-play');
    expect(embed).not.toContain('Voir et écouter la vidéo');
    expect(embed).toContain('&end=30&autoplay=1');
    expect(embed).toContain('mediaPlaybackRequiresUserAction: false');
    expect(embed).toContain("allow: 'autoplay; encrypted-media; picture-in-picture'");
    expect(deck).toContain('<StoryEmbeddedSourcePlayer sourceUrl={storyEmbeddedSource} compact={compactDeck} onSwipe={handleEmbeddedSwipe} />');
    expect(deck).toContain('style={s.storyEmbeddedInCard}');
    expect(deck).toContain('!resolvedPreviewUrl && !previewResolving && sourcePlayer && !sourcePlayerOpen');
  });
  it('keeps the paid story music hidden and does not expose the provider player', () => {
    expect(deck).toContain('!isSaleStoryTrack(current) && !currentOffered && !ownerMasked');
  });
});

describe('Story analytics: unique people and real viewed tracks', () => {
  it('distinguishes viewers from songs seen in the owner panel', () => {
    expect(viewer).toContain('spectateur${viewers.length > 1');
    expect(viewer).toContain('1 spectateur = 1 personne');
  });
  it('never interprets index 9 as ten viewed songs', () => {
    expect(watch).toContain('seenTrackKeys.add(viewedKey)');
    expect(watch).toContain('tracksSeen = Math.min(Math.max(0, tracksTotal), seenTrackKeys.size)');
    expect(watch).not.toContain('tracksSeen = maxIndex + 1');
  });
});
