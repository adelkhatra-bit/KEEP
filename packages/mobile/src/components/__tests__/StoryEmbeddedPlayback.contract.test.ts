import fs from 'fs';
import path from 'path';

describe('Story player on iPhone and desktop', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'StoryEmbeddedSourcePlayer.tsx'), 'utf8');
  const deck = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

  it('identifies the app in native YouTube requests to avoid iframe error 153', () => {
    expect(source).toContain('buildNativeYouTubeEmbedDocument(player, { autoplay: true, startSeconds: 0, endSeconds: 30 })');
    expect(source).toContain('nativeYouTubeDocument.baseUrl');
    expect(source).toContain("message?.type === 'youtube-error'");
    expect(deck).toContain('buildNativeYouTubeEmbedDocument(sourcePlayer');
    expect(deck).toContain('nativeSourcePlayerDocument.baseUrl');
    expect(deck).toContain("message?.type === 'youtube-error'");
  });

  it('keeps the embedded story player inside its swipe card, without overlapping title and controls', () => {
    expect(deck).toContain('style={s.storyEmbeddedInCard}');
    expect(deck).toContain('storyEmbeddedSource && s.gradientStoryEmbed');
    expect(deck).toContain('storyEmbeddedSource && s.embeddedTrackTitle');
    expect(deck.match(/<StoryEmbeddedSourcePlayer /g)).toHaveLength(1);
    expect(deck).toContain('compact={compactDeck}');
    expect(source).toContain("height: compact ? 104 : player.provider === 'YOUTUBE' ? 140 : 120");
  });

  it('preserves time-limited story playback rather than exposing complete songs', () => {
    expect(source).toContain('&end=30&autoplay=1');
    expect(deck).toContain('fullListenLocked');
  });
});
