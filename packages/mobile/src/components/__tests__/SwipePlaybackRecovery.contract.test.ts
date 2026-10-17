import fs from 'fs';
import path from 'path';

describe('Loki Music Swipe iPhone / desktop audio recovery', () => {
  const modal = fs.readFileSync(path.resolve(__dirname, '..', 'MusicSwipeDeckModal.tsx'), 'utf8');
  const deck = fs.readFileSync(path.resolve(__dirname, '..', 'SwipeDeck.tsx'), 'utf8');

  it('stops outgoing sound as soon as a new card appears instead of waiting for Apple lookup', () => {
    expect(modal).toContain('lastPlaybackCardKeyRef.current !== visiblePlaybackKey');
    expect(modal).toContain('lastPlaybackCardKeyRef.current = visiblePlaybackKey;');
    expect(modal).toMatch(/lastPlaybackCardKeyRef\.current = visiblePlaybackKey;\s*stopTrackPreviewFast\(\);/);
  });

  it('always moves past a completely unavailable snippet instead of freezing on a silent card', () => {
    expect(modal).toContain("skipUnavailablePreview('catalog_no_playable_preview')");
    expect(modal).toContain("skipUnavailablePreview('catalog_preview_lookup_failed')");
    expect(modal).toContain("skipUnavailablePreview('web_preview_play_failed')");
    expect(modal).toContain('if (index + 1 < deckTracks.length || loop)');
    expect(modal).toContain('if (!isSaleStoryTrack(current) && resolveEmbeddedMusicPlayer(source)) {');
    expect(modal).toContain('scheduleEmbeddedStoryNext();');
  });

  it('does not freeze the queue after the 30-second official YouTube/Spotify story embed', () => {
    expect(modal).toContain('const scheduleEmbeddedStoryNext = () => {');
    expect(modal).toContain('if (!(index + 1 < deckTracks.length || loop)) return;');
    expect(modal).toContain('if (trackAddedAt && preferCleanStoryPlayer) {');
    expect(modal).toContain('STORY_PREVIEW_NO_AD_FREE_AUDIO');
    expect(modal).toContain('}, 30000);');
    expect(modal).toContain('scheduleEmbeddedStoryNext();');
  });

  it('distinguishes a Safari autoplay permission from broken previews', () => {
    expect(modal).toContain('isWebAudioGestureRequired(initialPlayError)');
    expect(modal).toContain('isWebAudioGestureRequired(playError)');
    expect(modal).toContain('setAutoplayBlocked(true)');
  });

  it('reports a genuine listen only once and never floods Supabase on each native status callback', () => {
    expect(modal).toContain('if (listenedIdsRef.current.has(trackId)) return;');
    expect(modal).toContain('if (!fromProfileId || profileListenSentRef.current.has(trackId)) return;');
    expect(modal).toContain('profileListenSentRef.current.add(trackId);');
    expect(modal.match(/recordProfileSwipeListen\(fromProfileId, trackId\)/g)).toHaveLength(1);
    expect(modal.match(/recordSwipeListenOnce\(current.id, currentSourceProfileId\)/g)).toHaveLength(5);
    expect(modal).toContain('listenedIdsRef.current.clear();');
  });

  it('has no Next button on the card (Adel 17/10/2026: swipe up) and preserves the original three action buttons', () => {
    expect(modal).not.toContain('testID="swipe-next-without-gesture"');
    expect(modal).toContain('onSwipeUp={() => {');
    expect(modal).toContain('>PASSER</Text>');
    expect(modal).toContain('>ARRÊTER</Text>');
    expect(modal).toContain('♡ GARDER');
  });

  it('recognizes actual drags rather than stealing initial taps from embedded playback and controls', () => {
    expect(deck).toContain('onStartShouldSetPanResponder: () => false');
    expect(deck).toContain('onMoveShouldSetPanResponderCapture');
    expect(deck).toContain("return commitSwipe('UP')");
  });
});
