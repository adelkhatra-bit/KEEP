import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import TrackCover from './TrackCover';
import { resolveEmbeddedMusicPlayer } from '../services/embeddedMusicPlayer';

export type TemporaryMusicResult = {
  title: string;
  artist: string;
  artworkUrl?: string;
  sourceUrl?: string | null;
  identified: boolean;
};

/**
 * A temporary, read-only result; no session, playlist, quota or database writes.
 * Closing this Loki-branded modal destroys the embedded player and its result.
 */
export default function TemporaryMusicPreview({
  visible, result, onClose, onNext, onSave, onSeeSessions, saved = false, saving = false,
}: {
  visible: boolean;
  result: TemporaryMusicResult | null;
  onClose: () => void;
  onNext?: () => void;
  onSave?: () => void;
  onSeeSessions?: () => void;
  saved?: boolean;
  saving?: boolean;
}) {
  if (!result || !visible) return null;
  const embed = resolveEmbeddedMusicPlayer(result.sourceUrl);
  const NativeWebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

  return (
    <View testID="temporary-music-preview" style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,6,19,0.88)', justifyContent: 'center', alignItems: 'center', padding: 14 }}>
        <View style={{ width: '100%', maxWidth: 620, maxHeight: '92%', borderRadius: 22, overflow: 'hidden', padding: 16, backgroundColor: '#181326', borderColor: '#6956BB', borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>LOKI MUSIC · APERÇU</Text>
            <TouchableOpacity testID="temporary-music-close" onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer et effacer cet aperçu" style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 24 }}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <TrackCover track={result} style={{ width: 66, height: 66, borderRadius: 10 }} fallbackStyle={{ width: 66, height: 66, borderRadius: 10, backgroundColor: '#2B2341', alignItems: 'center', justifyContent: 'center' }} fallbackTextStyle={{ color: '#A899E7', fontSize: 25, fontWeight: '900' }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }} numberOfLines={2}>{result.title}</Text>
              <Text style={{ color: '#D1CBE5', fontSize: 12, marginTop: 5 }} numberOfLines={2}>{result.artist}</Text>
              {!result.identified ? <Text style={{ color: '#F5CE87', fontSize: 11, marginTop: 5 }}>Lien affiché, morceau non identifié</Text> : null}
            </View>
          </View>
          {embed ? (
            <View testID="temporary-music-embedded-player" style={{ width: '100%', height: embed.provider === 'YOUTUBE' ? 280 : 185, minHeight: 170, borderRadius: 12, overflow: 'hidden', backgroundColor: '#090713' }}>
              {Platform.OS === 'web' ?
                React.createElement('iframe' as any, {
                  src: embed.url,
                  title: embed.label,
                  width: '100%',
                  height: '100%',
                  style: { border: 0, backgroundColor: '#090713' },
                  allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
                  allowFullScreen: true,
                  referrerPolicy: 'strict-origin-when-cross-origin',
                })
                : NativeWebView ? (
                  <NativeWebView
                    source={{ uri: embed.url }}
                    style={{ flex: 1 }}
                    javaScriptEnabled
                    domStorageEnabled
                    allowsInlineMediaPlayback
                    allowsFullscreenVideo
                    mediaPlaybackRequiresUserAction
                    setSupportMultipleWindows={false}
                    onShouldStartLoadWithRequest={(request: { url: string; isTopFrame?: boolean }) => {
                      if (request.isTopFrame === false) return true;
                      return request.url.startsWith(embed.url.split('?')[0]);
                    }}
                  />
                ) : null}
            </View>
          ) : (
            <Text style={{ color: '#D1CBE5', fontSize: 12, lineHeight: 20 }}>
              {result.identified ? 'Titre trouvé. Cette plateforme ne fournit pas de lecteur intégré pour ce lien.' : 'Ce lien ne permet pas d’intégrer directement un lecteur.'}
            </Text>
          )}
          <Text style={{ color: '#C9C3E0', fontSize: 11, lineHeight: 17, marginTop: 12 }}>
            {saved
              ? 'Morceau ajouté à Mes Sessions. Tu peux le préécouter puis choisir GARDER avec tes FREE et Public pour ta Story.'
              : 'Préécoute dans Loki : aucun achat, aucune session ni Story sans ta confirmation.'}
          </Text>
          {result.identified && onSave ? (
            <TouchableOpacity testID="temporary-music-add-session" accessibilityRole="button" accessibilityLabel={saved ? 'Morceau ajouté dans Mes Sessions' : 'Ajouter ce morceau à Mes Sessions'} disabled={saved || saving} onPress={onSave} style={{ marginTop: 12, backgroundColor: saved ? '#285A52' : '#2DE1C2', minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text style={{ color: saved ? '#FFFFFF' : '#10101A', fontWeight: '900', fontSize: 13 }}>
                {saving ? 'Ajout…' : saved ? '✓ Dans Mes Sessions' : '＋ Ajouter à Mes Sessions'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {saved && onSeeSessions ? (
            <TouchableOpacity testID="temporary-music-see-sessions" accessibilityRole="button" accessibilityLabel="Ouvrir Mes Sessions pour garder ce morceau avec mes FREE" onPress={onSeeSessions} style={{ marginTop: 8, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2DE1C2' }}>
              <Text style={{ color: '#2DE1C2', fontWeight: '800', fontSize: 12 }}>Mes Sessions · GARDER / FREE / Story</Text>
            </TouchableOpacity>
          ) : null}
          {onNext ? (
            <TouchableOpacity testID="temporary-music-next" accessibilityRole="button" accessibilityLabel="Rechercher une autre musique sans sortir de Loki" onPress={onNext} style={{ marginTop: 8, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#6956BB' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>♫ Autre musique</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer cet aperçu sans enregistrer" onPress={onClose} style={{ marginTop: 12, backgroundColor: '#6956BB', minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>FERMER · NE PAS ENREGISTRER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
