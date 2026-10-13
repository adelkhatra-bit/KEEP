import fs from 'fs';
import path from 'path';

const component = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const history = component('../screens/SessionHistoryScreen.tsx');
const recap = component('../screens/SessionRecapScreen.tsx');
const playlist = component('TrackPreviewButton.tsx');
const shared = component('TrackListenControls.tsx');

describe('Sessions: one tap must open audio instead of an inert recap page', () => {
  it('opens Swipe from the actual Session row for pending AND completed sessions', () => {
    expect(history).toContain("navigation.replace('SessionRecap', { sessionId: item.id, openSwipe: true })");
    expect(history).toContain('unlockWebAudioForGesture()');
    expect(recap).toContain("if (!isFocused || !route.params?.openSwipe || !session?.tracks.length || swipeOpen) return;");
    expect(recap).toContain('const playable = previewOnly ? sortedTracks.map((entry) => entry.track) : pending;');
    expect(recap).toContain('previewOnly={swipePreviewOnly}');
    expect(recap).toContain('tracks={swipeTracks}');
  });

  it('does not falsely claim operating-system audio permissions are guaranteed', () => {
    expect(recap).toContain('InteractionManager.runAfterInteractions');
    expect(shared).toContain('unlockWebAudioForGesture');
    expect(shared).toContain('▶ PRÉÉCOUTER · 20s');
  });
});

describe('Playlists: in-app preview never sends Play directly to YouTube', () => {
  it('renders a provider-owned embedded player for exact YouTube, Spotify or Deezer links', () => {
    expect(playlist).toContain('resolveEmbeddedMusicPlayer(resolvedFallbackUrl)');
    expect(playlist).toContain('testID="playlist-preview-inline-player"');
    expect(playlist).toContain("Referer: 'https://com.adelkhatra.keep'");
    expect(playlist).toContain('mediaPlaybackRequiresUserAction={false}');
    expect(playlist).toContain('onShouldStartLoadWithRequest');
    expect(playlist).toContain('onLoadEnd={() => setProviderLoading(false)}');
  });

  it('separates intentional external navigation from pressing Play', () => {
    expect(playlist).toContain("accessibilityLabel=\"Ouvrir volontairement la plateforme musicale\"");
    expect(playlist).toContain("Alert.alert('Préécoute indisponible'");
    expect(playlist).toContain('if (embedded) {');
    expect(playlist).toContain('setProviderOpen(true)');
    expect(playlist).not.toContain('if (resolvedFallbackUrl) void openFallback();');
  });

  it('explains loading and possible provider advertisements without falsely claiming to remove them', () => {
    expect(playlist).toContain('testID="provider-audio-loading"');
    expect(playlist).toContain('Une publicité du fournisseur peut précéder le morceau');
    expect(playlist).toContain('ne peut pas être supprimée par Loki');
  });

  it('preserves the microphone session when the player closes', () => {
    expect(playlist).toContain('micPausedByPlayer.current = true');
    expect(playlist).toContain('if (session.isActive && session.micPaused) session.resumeListening()');
    expect(playlist).toContain('setProviderOpen(false)');
  });
});
