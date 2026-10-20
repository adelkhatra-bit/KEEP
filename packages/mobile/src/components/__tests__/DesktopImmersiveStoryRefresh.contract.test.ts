import fs from 'fs';
import path from 'path';

const deck = fs.readFileSync(path.resolve(__dirname,'..','MusicSwipeDeckModal.tsx'),'utf8');
const storyBar = fs.readFileSync(path.resolve(__dirname,'..','ProfileStoryBar.tsx'),'utf8');

describe('desktop immersive Story/Swipe layout and reliable rehydration', () => {
  it('uses an actually enabled two-column design with full-size player', () => {
    expect(deck).toContain("desktopOuter:{flexDirection:'row'");
    expect(deck).toContain('desktopSwipeLayout && s.desktopOuter');
    expect(deck).toContain('desktopSwipeLayout && s.desktopPlayer');
    expect(deck).toContain('width:560');
    expect(deck).toContain('width:340');
    expect(deck).toContain("maxWidth:'35%'");
    expect(deck).toContain("maxWidth:'55%'");
    expect(deck).toContain('testID="loki-desktop-story-aside"');
    expect(deck).not.toContain('false && desktopStoryLayout');
  });

  it('shows the real current track and progress without revealing paid story items', () => {
    expect(deck).toContain('testID="desktop-story-now-playing"');
    expect(deck).toContain('ownerMasked || isSaleStoryTrack(current)');
    expect(deck).toContain('desktopProgressFill');
    expect(deck).toContain('Math.min(index + 1, deckTracks.length)');
    expect(deck).not.toContain('testID="desktop-story-next-track"');
    expect(deck).toContain('void advance();');
  });

  it('keeps mobile portrait layout independent from desktop styling', () => {
    expect(deck).toContain("Platform.OS === 'web' && windowWidth >= Math.max(1040, DESKTOP_MIN_WIDTH)");
    expect(deck).toContain('desktopSwipeLayout && s.desktopStoryCard');
    expect(deck).toContain('testID="story-player"');
  });

  it('preserves previous fresh Story bubbles instead of clearing on a temporary loading issue', () => {
    expect(storyBar).toContain('reconcileStoryRefresh(storiesRef.current, Array.from(collected.values()), storyMissingRefreshRef.current)');
    expect(storyBar).not.toContain('if (!degraded) setStories(Array.from(collected.values()));');
    expect(storyBar).toContain('setEventStories((current) => current.filter((event) => eventStoryStillVisible(event)))');
  });
});
