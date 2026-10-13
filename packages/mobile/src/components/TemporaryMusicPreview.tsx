import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import TrackCover from './TrackCover';
import { resolveEmbeddedMusicPlayer } from '../services/embeddedMusicPlayer';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { playTrackPreviewSegment, stopTrackPreviewFast, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { KeepVisibilityChoiceContent } from './KeepVisibilityChoiceModal';

export type TemporaryMusicResult = {
  title: string;
  artist: string;
  artworkUrl?: string;
  previewUrl?: string;
  sourceUrl?: string | null;
  identified: boolean;
  /** Exact provider-video metadata, not a cross-catalog audio identification. */
  sourceOnly?: boolean;
};

/**
 * The player is temporary; the HOME flow auto-queues identified music as
 * PENDING without spending FREE. Explicit GARDER remains necessary for the
 * user's profile, credit debit and Story publication.
 */
export default function TemporaryMusicPreview({
  visible, result, onClose, onNext, onReplaceLink, onSave, onSeeSessions, saved = false, saving = false,
  onKeep, keepChoiceOpen = false, onChooseVisibility, onCancelKeep, keepCostFree = 3, keptVisibility = null, storyPublished = false,
  playlists = [], selectedPlaylistId, onSelectPlaylist,
}: {
  visible: boolean;
  result: TemporaryMusicResult | null;
  onClose: () => void;
  onNext?: () => void;
  onReplaceLink?: (link: string) => void;
  onSave?: () => void;
  onSeeSessions?: () => void;
  saved?: boolean;
  saving?: boolean;
  onKeep?: () => void;
  keepChoiceOpen?: boolean;
  onChooseVisibility?: (visibility: 'PUBLIC' | 'PRIVATE') => void;
  onCancelKeep?: () => void;
  keepCostFree?: number;
  playlists?: { id: string; name: string }[];
  selectedPlaylistId?: string;
  onSelectPlaylist?: (playlistId: string) => void;
  keptVisibility?: 'PUBLIC' | 'PRIVATE' | null;
  storyPublished?: boolean;
}) {
  const embed = resolveEmbeddedMusicPlayer(result?.sourceUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [providerError, setProviderError] = useState(false);
  const [providerAttempt, setProviderAttempt] = useState(0);
  const autoPreviewKey = useRef<string | null>(null);
  const [nextLink, setNextLink] = useState('');
  // A provider may refuse to embed on iOS or inside a browser. The legally
  // available catalogue excerpt is the in-Loki fallback, with no external navigation.
  useEffect(() => {
    let alive = true;
    stopTrackPreviewFast('temporary:music-share');
    setPreviewPlaying(false);
    setPreviewError(false);
    setProviderError(false);
    setProviderAttempt(0);
    autoPreviewKey.current = null;
    setPreviewUrl(null);
    setNextLink('');
    if (visible && result?.identified && !result.sourceOnly && result.title && result.artist) {
      void resolveTrackPreviewUrl({ title: result.title, artist: result.artist,
        id: 'temporary-preview', providerIds: {}, artworkUrl: result.artworkUrl,
        previewUrl: result.previewUrl,
      }).then((url) => { if (alive) setPreviewUrl(url); }).catch(() => {});
    }
    return () => { alive = false; stopTrackPreviewFast('temporary:music-share'); };
  }, [visible, result?.title, result?.artist, result?.sourceUrl, result?.sourceOnly, result?.previewUrl]);

  useEffect(() => { if (keepChoiceOpen) stopTrackPreviewFast('temporary:music-share'); }, [keepChoiceOpen]);

  // Direct catalogue snippets begin automatically when the provider's official
  // player is unavailable. For an exact YouTube link never guess an Apple song.
  useEffect(() => {
    if (!visible || !result?.identified || embed || !previewUrl || keepChoiceOpen) return;
    const key = result.sourceUrl || result.title + ':' + result.artist;
    if (autoPreviewKey.current === key) return;
    autoPreviewKey.current = key;
    void playTrackPreviewSegment('temporary:music-share', previewUrl, 0, 20000, setPreviewPlaying, undefined, true)
      .catch(() => { setPreviewPlaying(false); setPreviewError(true); });
  }, [visible, result?.identified, result?.title, result?.artist, result?.sourceUrl, embed?.url, previewUrl, keepChoiceOpen]);

  const restartProvider = () => {
    stopTrackPreviewFast('temporary:music-share');
    setPreviewPlaying(false);
    setProviderError(false);
    setProviderAttempt((n) => n + 1);
  };

  const togglePreview = () => {
    if (!previewUrl) return;
    if (previewPlaying) { stopTrackPreviewFast('temporary:music-share'); setPreviewPlaying(false); return; }
    setPreviewError(false);
    unlockWebAudioForGesture();
    void playTrackPreviewSegment('temporary:music-share', previewUrl, 0, 20000, setPreviewPlaying, undefined, true)
      .catch(() => { setPreviewPlaying(false); setPreviewError(true); });
  };

  if (!result || !visible) return null;
  // Use the exact same GARDER component as Swipe/Écouter, inside the already
  // opened Loki sheet. Avoid stacking two native iOS Modals.
  if (keepChoiceOpen && onChooseVisibility && onCancelKeep) {
    return (
      <View testID="temporary-music-keep-choice" style={{ flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,6,19,0.94)' }}>
        <KeepVisibilityChoiceContent
          title="Garder ce morceau" trackLabel={`${result.title} · ${result.artist}`}
          costFree={keepCostFree} busy={saving}
          playlists={playlists} selectedPlaylistId={selectedPlaylistId} onSelectPlaylist={onSelectPlaylist}
          body="Le morceau est déjà dans Mes Sessions. Le débit FREE et la publication sur le profil n’auront lieu qu’après ton choix."
          onPublic={() => onChooseVisibility('PUBLIC')}
          onPrivate={() => onChooseVisibility('PRIVATE')}
          onCancel={onCancelKeep}
        />
      </View>
    );
  }
  const NativeWebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;
  // Same provider identity as the Story/Swipe players. Autoplay may still be
  // blocked by iOS or the provider; retain an explicit retry gesture.
  const limitedYouTubeEmbed = embed?.provider === 'YOUTUBE'
    ? `${embed.url}&start=0&end=20&autoplay=1&playsinline=1`
    : embed?.provider === 'SPOTIFY' ? `${embed.url}?autoplay=1` : embed?.url;

  return (
    <View testID="temporary-music-preview" style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7,6,19,0.94)', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
        <ScrollView testID="temporary-music-preview-scroll" keyboardShouldPersistTaps="always" showsVerticalScrollIndicator contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 10 }} style={{ width: '100%', maxWidth: 620, maxHeight: '92%', borderRadius: 22, backgroundColor: '#171020', borderColor: '#A78BFA', borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>ÉCOUTER · SWIPE</Text>
            <TouchableOpacity testID="temporary-music-close" onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer et effacer cet aperçu" style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 24 }}>×</Text>
            </TouchableOpacity>
          </View>
          <View testID="temporary-music-swipe-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4, padding: 12, borderRadius: 16, borderColor: '#A78BFA', borderWidth: 1, backgroundColor: '#100D1A' }}>
            <TrackCover track={result} style={{ width: 70, height: 70, borderRadius: 12 }} fallbackStyle={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#2B2341', alignItems: 'center', justifyContent: 'center' }} fallbackTextStyle={{ color: '#A899E7', fontSize: 25, fontWeight: '900' }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }} numberOfLines={2}>{result.title}</Text>
              <Text style={{ color: '#D1CBE5', fontSize: 12, marginTop: 5 }} numberOfLines={2}>{result.artist}</Text>
              {result.sourceOnly ? <Text style={{ color: '#F5CE87', fontSize: 11, marginTop: 5 }}>Vidéo YouTube exacte · pas de correspondance audio au catalogue</Text> : !result.identified ? <Text style={{ color: '#F5CE87', fontSize: 11, marginTop: 5 }}>Lien affiché, morceau non identifié</Text> : null}
            </View>
          </View>
          {onReplaceLink ? (
            <View testID="temporary-music-replace-link" style={{ marginBottom: 4 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Une autre musique ? Colle son lien ici</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput testID="temporary-music-next-link-input" value={nextLink} onChangeText={setNextLink}
                  placeholder="Nouveau lien YouTube, Spotify…" placeholderTextColor="#C9C3E0"
                  autoCapitalize="none" autoCorrect={false} selectTextOnFocus keyboardType="url" returnKeyType="search"
                  onSubmitEditing={() => { if (nextLink.trim()) onReplaceLink(nextLink.trim()); }}
                  style={{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#A78BFA', backgroundColor: '#090713', color: '#FFFFFF', fontSize: 13 }} />
                <TouchableOpacity testID="temporary-music-next-link-search" disabled={!nextLink.trim()} onPress={() => { if (nextLink.trim()) onReplaceLink(nextLink.trim()); }} accessibilityRole="button" accessibilityLabel="Rechercher le nouveau lien musical" style={{ minWidth: 92, minHeight: 48, paddingHorizontal: 12, backgroundColor: nextLink.trim() ? '#68F2B1' : '#4A3A65', borderRadius: 12, borderWidth: 1, borderColor: '#A78BFA', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#10101A', fontSize: 12, fontWeight: '800' }}>Chercher</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {embed ? (
            <View key={embed.url} testID="temporary-music-embedded-player" style={{ width: '100%', height: embed.provider === 'YOUTUBE' ? 220 : 185, minHeight: 170, borderRadius: 14, borderWidth: 1.5, borderColor: '#A78BFA', overflow: 'hidden', backgroundColor: '#090713' }}>
              {Platform.OS === 'web' ?
                React.createElement('iframe' as any, {
                  key: `${limitedYouTubeEmbed}:${providerAttempt}`,
                  src: limitedYouTubeEmbed,
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
                    key={`${limitedYouTubeEmbed}:${providerAttempt}`}
                    source={{ uri: limitedYouTubeEmbed!, ...(embed.provider === 'YOUTUBE' ? { headers: { Referer: 'https://com.adelkhatra.keep' } } : {}) }}
                    style={{ flex: 1 }}
                    javaScriptEnabled
                    domStorageEnabled
                    allowsInlineMediaPlayback
                    allowsFullscreenVideo
                    mediaPlaybackRequiresUserAction={false}
                    setSupportMultipleWindows={false}
                    onError={() => setProviderError(true)}
                    onHttpError={() => setProviderError(true)}
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
          {embed ? (
            <TouchableOpacity testID="temporary-music-restart-provider" onPress={restartProvider} accessibilityRole="button" accessibilityLabel="Lancer ou relancer la préécoute musicale" style={{ minHeight: 48, borderRadius: 13, borderWidth: 1.5, borderColor: '#68F2B1', backgroundColor: 'rgba(104,242,177,.12)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text style={{ color: '#68F2B1', fontSize: 12, fontWeight: '900' }}>▶ LANCER / RELANCER L'ÉCOUTE</Text>
            </TouchableOpacity>
          ) : null}
          {embed && providerError ? <Text testID="temporary-music-provider-error" style={{ color: '#F5CE87', fontSize: 12, lineHeight: 18 }}>Le lecteur officiel a refusé ce chargement. Réessaie ou utilise l'extrait du catalogue disponible ci-dessous.</Text> : null}
          {embed ? <Text style={{ color: '#D1CBE5', fontSize: 11, lineHeight: 16 }}>La lecture démarre automatiquement lorsque le fournisseur l'autorise ; sinon touche ▶ dans son lecteur.</Text> : null}
          {previewUrl ? (
            <TouchableOpacity testID="temporary-music-play-catalog-excerpt" onPress={togglePreview} accessibilityRole="button"
              accessibilityLabel={previewPlaying ? 'Arrêter l’extrait musical' : 'Écouter un extrait du catalogue dans Loki Music'}
              style={{ minHeight: 48, borderRadius: 13, borderWidth: 1.5, borderColor: '#68F2B1', backgroundColor: 'rgba(104,242,177,.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#2DE1C2', fontWeight: '800', fontSize: 12 }}>{previewPlaying ? '■ ARRÊTER L’EXTRAIT' : '▶ PRÉÉCOUTER 20s'}</Text>
            </TouchableOpacity>
          ) : null}
          {previewError ? <Text style={{ color: '#F5CE87', fontSize: 11, marginTop: 6 }}>Extrait indisponible : utilise le lecteur de la plateforme ci-dessus.</Text> : null}
          {embed?.provider === 'YOUTUBE' ? <Text style={{ color: '#D1CBE5', fontSize: 11, marginTop: 6 }}>Aperçu vidéo limité aux 20 premières secondes via le lecteur officiel YouTube ; certaines vidéos peuvent refuser l’intégration.</Text> : null}
          <Text style={{ color: '#C9C3E0', fontSize: 11, lineHeight: 17, marginTop: 12 }}>
            {keptVisibility === 'PUBLIC'
              ? storyPublished ? '✓ Gardé sur ton profil et publié en Story · 24 h.' : '✓ Gardé sur ton profil. La publication Story n’est pas encore confirmée.'
              : keptVisibility === 'PRIVATE'
                ? '✓ Gardé en privé dans ton profil. Aucun partage en Story.'
                : saved ? '✓ Dans Mes Sessions, en attente. La vidéo reste chez YouTube ; un débit FREE n’a lieu que si tu choisis GARDER.'
                  : 'Préécoute dans Loki : aucun FREE débité ni publication sans ton choix.'}
          </Text>
          {result.identified && onKeep && keptVisibility == null ? (
            <TouchableOpacity testID="temporary-music-keep" accessibilityRole="button" accessibilityLabel="Garder ce morceau sur mon profil avec les FREE" onPress={onKeep} disabled={saving} style={{ marginTop: 12, backgroundColor: '#2DE1C2', minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#10101A', fontWeight: '900', fontSize: 13 }}>{saving ? 'Vérification…' : `♡ GARDER · ${keepCostFree} FREE · PUBLIC OU PRIVÉ`}</Text>
            </TouchableOpacity>
          ) : null}
          {result.identified && onSave && !saved ? (
            <TouchableOpacity testID="temporary-music-add-session" accessibilityRole="button" accessibilityLabel="Réessayer l’enregistrement du morceau dans Mes Sessions" disabled={saving} onPress={onSave} style={{ marginTop: 12, backgroundColor: '#2DE1C2', minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
              <Text style={{ color: '#10101A', fontWeight: '900', fontSize: 13 }}>
                {saving ? 'Enregistrement…' : '↻ Enregistrer dans Mes Sessions'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {saved && onSeeSessions ? (
            <TouchableOpacity testID="temporary-music-see-sessions" accessibilityRole="button" accessibilityLabel="Ouvrir Mes Sessions pour garder ce morceau avec mes FREE" onPress={onSeeSessions} style={{ marginTop: 8, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2DE1C2' }}>
              <Text style={{ color: '#2DE1C2', fontWeight: '800', fontSize: 12 }}>MES SESSIONS · {saved ? 'EN ATTENTE' : 'REVOIR'}</Text>
            </TouchableOpacity>
          ) : null}
          {onNext ? (
            <TouchableOpacity testID="temporary-music-next" accessibilityRole="button" accessibilityLabel="Rechercher une autre musique sans sortir de Loki" onPress={onNext} style={{ marginTop: 8, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#A78BFA', backgroundColor: '#211936' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12 }}>♫ Autre musique</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer cet aperçu sans enregistrer" onPress={onClose} style={{ marginTop: 8, backgroundColor: '#211936', minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#A78BFA', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>FERMER L’APERÇU</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}
