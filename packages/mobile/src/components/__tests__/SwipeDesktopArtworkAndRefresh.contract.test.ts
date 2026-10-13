import fs from 'fs';
import path from 'path';

const swipe = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
const stories = fs.readFileSync(path.resolve(__dirname, '..', 'ProfileStoryBar.tsx'), 'utf8');

describe('Shared Swipe on desktop and iPhone', () => {
  it('renders the cover in its own frame with contained artwork and separate metadata', () => {
    expect(swipe).toContain('testID="swipe-card-artwork-safe"');
    expect(swipe).toContain('testID="swipe-cover-unobstructed"');
    expect(swipe).toContain('resizeMode="contain"');
    expect(swipe).toContain('testID="swipe-metadata-below-cover"');
    expect(swipe).toContain('artworkFrame:{flex:1,minHeight:60');
    expect(swipe).toContain('gradientFake:{flexShrink:0');
    expect(swipe).not.toContain('cover:{...StyleSheet.absoluteFillObject');
    expect(swipe).not.toContain('gradientFake:{padding:20,paddingTop:90');
  });

  it('uses desktop width for Story, session, profile and music instead of fixed 520px', () => {
    expect(swipe).toContain("windowWidth >= Math.max(1024, DESKTOP_MIN_WIDTH)");
    expect(swipe).toContain('{desktopStoryLayout ? <View style={s.desktopStoryAside}');
    expect(swipe).not.toContain('{false && desktopStoryLayout');
    expect(swipe).toContain('maxWidth:740');
    expect(swipe).toContain("desktopOuter:{flexDirection:'row'");
    expect(swipe).toContain('testID="desktop-swipe-next"');
    expect(swipe).toContain('testID="swipe-next-without-gesture"');
    expect(swipe).toContain('minHeight:44');
  });

  it('preserves purchases, creator credit and all keep/pass/story actions', () => {
    expect(swipe).toContain('ownerMasked ?');
    expect(swipe).toContain('priceBadge');
    expect(swipe).toContain('testID="deck-source-glow"');
    expect(swipe).toContain('KeepVisibilityChoiceModal');
    expect(swipe).toContain('testID="story-no-provider-ads"');
    expect(swipe).toContain('SwipeDeck');
  });
});

describe('24-hour Story bar refresh', () => {
  it('does not erase a valid Story after a single transient empty refresh', () => {
    expect(stories).toContain('storyMissingCyclesRef');
    expect(stories).toContain('const count = (storyMissingCyclesRef.current.get(id) ?? 0) + 1');
    expect(stories).toContain('if (count < 2) stable.set(id, valid)');
    expect(stories).toContain('const valid = pruneExpiredStory(old)');
    expect(stories).toContain('if (!degraded)');
    expect(stories).not.toContain('setStories(Array.from(collected.values()))');
  });

  it('keeps already displayed Event Stories when the event endpoint fails', () => {
    expect(stories).toContain('setEventStories(rows.filter((item) => eventStoryStillVisible(item)))');
    expect(stories).not.toContain('if (mounted) setEventStories([])');
    expect(stories).toContain("table: 'story_pins'");
    expect(stories).toContain('90000');
  });
});
