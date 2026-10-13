import fs from 'fs';
import path from 'path';

const deck = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');

describe('shared iPhone / desktop Swipe: album art, metadata and exact source playback', () => {
  it('keeps artwork in a dedicated region above all text and controls', () => {
    const artwork = deck.indexOf('testID="swipe-artwork-stage"');
    const cover = deck.indexOf('resizeMode="contain"', artwork);
    const metadata = deck.indexOf('testID="swipe-metadata-below-artwork"', artwork);
    const trackTitle = deck.indexOf('s.trackTitle', metadata);
    expect(artwork).toBeGreaterThan(0);
    expect(cover).toBeGreaterThan(artwork);
    expect(metadata).toBeGreaterThan(cover);
    expect(trackTitle).toBeGreaterThan(metadata);
    expect(deck).toContain("gradientFake:{flexShrink:0");
    expect(deck).toContain("backgroundColor:'#181024',borderTopWidth:1");
    expect(deck).toContain("artworkStage:{flex:1,minHeight:90");
    expect(deck).toContain("card:{flex:1,minHeight:0");
    expect(deck).not.toContain("gradientFake:{padding:20,paddingTop:90");
    expect(deck).toContain('nudge && !compactDeck');
    expect(deck).toContain("nudgePill:{flexShrink:0");
    expect(deck).toContain("askBubble:{position:'relative'");
    expect(deck).not.toContain("nudgePill:{position:'absolute'");
  });

  it('moves discoverer identity outside the cover and keeps buttons accessible without scrolling', () => {
    const meta = deck.indexOf('testID="swipe-metadata-below-artwork"');
    const source = deck.indexOf('testID="deck-source-glow"', meta);
    const next = deck.indexOf('testID="swipe-next-without-gesture"', meta);
    expect(source).toBeGreaterThan(meta);
    expect(next).toBeGreaterThan(meta);
    expect(deck).toContain("nextInlineButton:{minHeight:40");
    expect(deck).toContain('testID="desktop-story-next-track"');
    expect(deck).toContain('desktopSwipeLayout && s.desktopStoryCard');
    expect(deck).toContain('testID="loki-desktop-story-aside"');
    expect(deck).toContain('accessibilityLabel="Passer cette musique"');
    expect(deck).toContain('accessibilityLabel="Arrêter l’écoute et revenir"');
  });

  it('preserves exact YouTube IDs for source-only personal profile discoveries', () => {
    expect(deck).toContain('const hasCatalogIdentity = Boolean(current.isrc');
    expect(deck).toContain('if (!current.previewUrl?.trim() && !hasCatalogIdentity');
    expect(deck).toContain('if (!trackAddedAt) { setSourcePlayerFailed(false); setSourcePlayerOpen(true); }');
    expect(deck).toContain('testID="swipe-exact-source-player"');
    expect(deck).toContain('https://com.adelkhatra.keep');
    expect(deck).toContain('&autoplay=1');
    expect(deck).toContain('sourcePlayerAttempt');
    expect(deck).toContain('↗ SOURCE');
    expect(deck).toContain('sourcePlayerFailed');
    expect(deck).toContain('scheduleEmbeddedStoryNext();');
  });

  it('never exposes a sale teaser as an unmasked provider video', () => {
    expect(deck).toContain('!isSaleStoryTrack(current)');
    expect(deck).toContain('!currentOffered && !ownerMasked');
    expect(deck).toContain('currentAlreadyKept');
    expect(deck).toContain('askVisibilityOnKeep');
    expect(deck).toContain('sourcePlayer.provider');
  });
});
