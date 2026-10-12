import React, { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { resolveEmbeddedMusicPlayer } from '../services/embeddedMusicPlayer';

/**
 * Licensed/provider-owned player: the video/audio never passes through Loki's
 * servers or Supabase Storage. The URL is validated against known music
 * providers before it reaches an iframe/WebView.
 *
 * IMPORTANT: never mount this player for a song on sale. Provider embeds reveal
 * their own title, artist and artwork, so sale teasers must remain masked.
 */
export default function StoryEmbeddedSourcePlayer({ sourceUrl }: { sourceUrl: string }) {
  const player = resolveEmbeddedMusicPlayer(sourceUrl);
  const [opened, setOpened] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  if (!player) return null;

  const message = player.provider === 'YOUTUBE' ? 'Voir et écouter la vidéo dans Loki' : 'Écouter depuis Loki Music';
  return (
    <View testID="story-official-embedded-player" style={{ marginHorizontal: 4, marginBottom: 8, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: '#6956BB', backgroundColor: '#171020' }}>
      {!opened ? (
        <TouchableOpacity testID="story-embedded-play" onPress={() => { setUnavailable(false); setOpened(true); }}
          accessibilityRole="button" accessibilityLabel={message}
          style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#2DE1C2', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#2DE1C2', fontSize: 12, fontWeight: '900' }}>▶ {message}</Text>
        </TouchableOpacity>
      ) : unavailable ? (
        <Text testID="story-embedded-unavailable" style={{ color: '#F5CE87', fontSize: 12, textAlign: 'center', padding: 10 }}>
          Le fournisseur bloque l’intégration de ce morceau. Aucun autre titre n’a été substitué.
        </Text>
      ) : (
        <View testID="story-embedded-frame" style={{ width: '100%', height: player.provider === 'YOUTUBE' ? 160 : 125, overflow: 'hidden', borderRadius: 10, backgroundColor: '#090713' }}>
          {Platform.OS === 'web' ? (
            React.createElement('iframe' as any, {
              key: player.url,
              src: player.url,
              title: player.label,
              width: '100%',
              height: '100%',
              style: { border: 0, backgroundColor: '#090713' },
              allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
              allowFullScreen: true,
              referrerPolicy: 'strict-origin-when-cross-origin',
            })
          ) : (
            React.createElement(require('react-native-webview').WebView, {
              key: player.url,
              source: { uri: player.url },
              style: { flex: 1 },
              javaScriptEnabled: true,
              domStorageEnabled: true,
              allowsInlineMediaPlayback: true,
              allowsFullscreenVideo: false,
              mediaPlaybackRequiresUserAction: true,
              setSupportMultipleWindows: false,
              onError: () => setUnavailable(true),
              onShouldStartLoadWithRequest: (request: { url: string; isTopFrame?: boolean }) => (
                request.isTopFrame === false || request.url.startsWith(player.url.split('?')[0])
              ),
            })
          )}
        </View>
      )}
      {opened && !unavailable ? (
        <Text style={{ color: '#D1CBE5', fontSize: 11, paddingTop: 5, textAlign: 'center' }}>
          Appuie sur ▶ dans le lecteur si la vidéo ne démarre pas automatiquement.
        </Text>
      ) : null}
    </View>
  );
}
