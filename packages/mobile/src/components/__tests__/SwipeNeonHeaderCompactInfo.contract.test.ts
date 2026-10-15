import fs from 'fs';
import path from 'path';

const source = (relative: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', relative), 'utf8');
const swipe = source('components/MusicSwipeDeckModal.tsx');
const glow = source('components/GlowRing.tsx');

describe('Loki Swipe responsive desktop header + compact help', () => {
  it('moves the three music reaction counters into the real header above the title', () => {
    const counter = swipe.indexOf('testID="deck-reactions-near-title"');
    const title = swipe.indexOf('testID="deck-title-profile"');
    const body = swipe.indexOf('testID="swipe-metadata-below-artwork"');
    expect(counter).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(counter);
    expect(body).toBeGreaterThan(title);
    expect(swipe).toContain('desktopSwipeLayout && s.headerCountHaloDesktop');
    expect(swipe).toContain('desktopSwipeLayout && s.headerTopLineDesktop');
    expect(swipe).toMatch(/headerCountHaloDesktop:\{position:'absolute',top:-\d+,right:\d+/);
    expect(swipe).toMatch(/headerTopLineDesktop:\{position:'relative',minHeight:\d+/);
  });

  it('retains original reaction numbers, semantics, and glow rather than inventing counters', () => {
    expect(swipe).toContain('likes={trackLikes.counts[likeKey(current.id)] ?? 0}');
    expect(swipe).toContain('mehs={trackLikes.mehCounts[likeKey(current.id)] ?? 0}');
    expect(swipe).toContain('dislikes={trackLikes.dislikeCounts[likeKey(current.id)] ?? 0}');
    expect(swipe).toContain('testID="deck-reactions-animated-edge"');
    expect(glow).toContain('AccessibilityInfo.isReduceMotionEnabled');
    expect(glow).toContain('Animated.loop');
    expect(swipe).toContain('perspective:980');
  });

  it('never places reaction counters over the cover or listening controls', () => {
    expect(swipe).toContain('style={[s.headerTopLine, desktopSwipeLayout && s.headerTopLineDesktop]} testID="deck-reactions-above-title"');
    expect(swipe).toContain('testID="swipe-metadata-below-artwork"');
    expect(swipe).toContain('desktopSwipeLayout && s.desktopPlayer');
    expect(swipe).not.toContain('testID="desktop-story-next-track"');
    expect(swipe).toContain('testID="loki-desktop-story-aside"');
  });

  it('shows Plus instead of verbose En savoir plus across the app', () => {
    const tests: [string,string][] = [
      ['screens/HomeScreenCompact.tsx', "homeAboutOpen ? 'Moins' : 'Plus'"],
      ['screens/NotificationsScreen.tsx', "expandedNotificationIds.has(item.id) ? 'Moins ‹' : 'Plus ›'"],
      ['screens/PartiesScreen.tsx', '>Plus ›</Text>'],
      ['screens/OffersScreen.tsx', "introExpanded ? 'Moins' : 'Plus'"],
      ['screens/ProfilePublicScreen.tsx', "ownerMusicInfoOpen ? 'Moins' : 'Plus'"],
      ['components/PayoutCheckoutSheet.tsx', "qrHelpOpen ? 'MOINS' : 'PLUS'"],
      ['components/ClampedText.tsx', "{open ? 'Moins' : 'Plus'}"],
    ];
    for (const [relative, phrase] of tests) expect(source(relative)).toContain(phrase);
  });
});
