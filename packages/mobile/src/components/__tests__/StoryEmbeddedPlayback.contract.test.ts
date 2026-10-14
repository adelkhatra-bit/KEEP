import fs from 'fs';
import path from 'path';

describe('Story player on iPhone and desktop', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'StoryEmbeddedSourcePlayer.tsx'), 'utf8');
  const deck = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

  it('identifies the app in native YouTube requests to avoid iframe error 153', () => {
    expect(source).toContain("player.provider === 'YOUTUBE' ? { headers: { Referer: 'https://com.adelkhatra.keep' } } : {}");
    expect(deck).toContain("sourcePlayer.provider === 'YOUTUBE' ? { headers: { Referer: 'https://com.adelkhatra.keep' } } : {}");
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
