import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { resolveEmbeddedMusicPlayer } from '../services/embeddedMusicPlayer';

/**
 * Official provider player displayed INSIDE a public Loki story.
 *
 * Prefer the licensed audio preview upstream. This is a fallback only when
 * there is no catalogue preview; provider ads and browser autoplay restrictions
 * cannot be removed by Loki. Never embed a track hidden in a paid collection.
 */
export default function StoryEmbeddedSourcePlayer({ sourceUrl }: { sourceUrl: string }) {
  const player = resolveEmbeddedMusicPlayer(sourceUrl);
  const [unavailable, setUnavailable] = useState(false);
  if (!player) return null;

  // A story must not require an extra "voir/écouter la vidéo" action.
  // On YouTube keep the provider's official embed, inside Loki, and stop it
  // at 30 seconds. A browser may still require a gesture to enable sound.
  const excerptUrl = player.provider === 'YOUTUBE'
    ? `${player.url}&start=0&end=30&autoplay=1&playsinline=1`
    : player.provider === 'SPOTIFY'
      ? `${player.url}?autoplay=1`
      : player.url;

  return (
    <View testID="story-official-embedded-player" style={{ marginHorizontal: 4, marginBottom: 8, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: '#6956BB', backgroundColor: '#171020' }}>
      {unavailable ? (
        <Text testID="story-embedded-unavailable" style={{ color: '#F5CE87', fontSize: 12, textAlign: 'center', padding: 10 }}>
          Le fournisseur empêche la lecture intégrée. Tu restes sur ta Story Loki Music.
        </Text>
      ) : (
        <View testID="story-embedded-frame" style={{ width: '100%', height: player.provider === 'YOUTUBE' ? 160 : 125, overflow: 'hidden', borderRadius: 10, backgroundColor: '#090713' }}>
          {Platform.OS === 'web' ? (
            React.createElement('iframe' as any, {
              key: excerptUrl,
              src: excerptUrl,
              title: player.label,
              width: '100%',
              height: '100%',
              style: { border: 0, backgroundColor: '#090713' },
              allow: 'autoplay; encrypted-media; picture-in-picture',
              referrerPolicy: 'strict-origin-when-cross-origin',
            })
          ) : (
            React.createElement(require('react-native-webview').WebView, {
              key: excerptUrl,
              source: { uri: excerptUrl },
              style: { flex: 1 },
              javaScriptEnabled: true,
              domStorageEnabled: true,
              allowsInlineMediaPlayback: true,
              allowsFullscreenVideo: false,
              mediaPlaybackRequiresUserAction: false,
              setSupportMultipleWindows: false,
              onError: () => setUnavailable(true),
              onShouldStartLoadWithRequest: (request: { url: string; isTopFrame?: boolean }) => (
                request.isTopFrame === false || request.url.startsWith(player.url.split('?')[0])
              ),
            })
          )}
        </View>
      )}
    </View>
  );
}
