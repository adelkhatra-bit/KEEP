import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { buildNativeYouTubeEmbedDocument, resolveEmbeddedMusicPlayer, withSwipeLayer } from '../services/embeddedMusicPlayer';

/**
 * Official provider player displayed INSIDE a public Loki story.
 *
 * Prefer the licensed audio preview upstream. This is a fallback only when
 * there is no catalogue preview; provider ads and browser autoplay restrictions
 * cannot be removed by Loki. Never embed a track hidden in a paid collection.
 */
export default function StoryEmbeddedSourcePlayer({ sourceUrl, compact = false, onSwipe }: { sourceUrl: string; compact?: boolean; onSwipe?: (direction: 'UP' | 'LEFT' | 'RIGHT') => void }) {
  const player = resolveEmbeddedMusicPlayer(sourceUrl);
  const [unavailable, setUnavailable] = useState(false);
  const nativeYouTubeDocument = Platform.OS !== 'web' && player
    ? withSwipeLayer(buildNativeYouTubeEmbedDocument(player, { autoplay: true, startSeconds: 0, endSeconds: 30 }), Boolean(onSwipe))
    : null;
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
          Lecture indisponible. Passe à la suite de ta Story.
        </Text>
      ) : (
        <View testID="story-embedded-frame" style={{ width: '100%', height: compact ? 104 : player.provider === 'YOUTUBE' ? 140 : 120, overflow: 'hidden', borderRadius: 10, backgroundColor: '#090713' }}>
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
              source: nativeYouTubeDocument ? { html: nativeYouTubeDocument.html, baseUrl: nativeYouTubeDocument.baseUrl } : { uri: excerptUrl },
              style: { flex: 1 },
              // Audit tactile : un WebView qui défile avale le geste vers le haut du Swipe. Sans défilement propre, le doigt reste au Swipe (les appuis ▶ marchent toujours).
              scrollEnabled: false,
              bounces: false,
              overScrollMode: 'never',
              javaScriptEnabled: true,
              domStorageEnabled: true,
              allowsInlineMediaPlayback: true,
              allowsFullscreenVideo: false,
              mediaPlaybackRequiresUserAction: false,
              setSupportMultipleWindows: false,
              onError: () => setUnavailable(true),
              onMessage: (event: { nativeEvent?: { data?: string } }) => {
                try {
                  const message = JSON.parse(String(event?.nativeEvent?.data || '{}'));
                  if (message?.type === 'youtube-error') setUnavailable(true);
                  if (message?.type === 'loki-swipe' && ['UP', 'LEFT', 'RIGHT'].includes(message.direction)) onSwipe?.(message.direction);
                } catch {}
              },
              onShouldStartLoadWithRequest: (request: { url: string; isTopFrame?: boolean }) => (
                request.isTopFrame === false
                || Boolean(nativeYouTubeDocument && request.url.startsWith(nativeYouTubeDocument.baseUrl))
                || request.url.startsWith(player.url.split('?')[0])
              ),
            })
          )}
        </View>
      )}
    </View>
  );
}
