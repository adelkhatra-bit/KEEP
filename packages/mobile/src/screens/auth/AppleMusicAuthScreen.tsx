import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { buildAppleMusicAuthHtml, parseAppleMusicAuthMessage } from '../../services/appleMusicAuthHtml';
import { saveMusicUserToken } from '../../services/appleMusicAuth';
import { colors, spacing } from '../../theme';

/**
 * Écran d'autorisation Apple Music (WebView MusicKit JS).
 *
 * Statut : CODED, jamais exécuté sur un vrai appareil (nécessite un vrai
 * developer token backend -- voir docs/DEPLOYMENT_TESTFLIGHT.md). Ne pas
 * présenter cet écran comme fonctionnel avant un vrai test sur device.
 *
 * Ne jamais appeler ce composant avec un developerToken vide/factice : le
 * backend (`GET /api/music/apple/developer-token`) répond 501 tant que la
 * clé MusicKit n'est pas configurée -- c'est à l'appelant de gérer ce cas
 * en amont (afficher "Apple Music pas encore disponible", pas un WebView
 * qui échouera silencieusement).
 */
interface Props {
  developerToken: string;
  onSuccess: (musicUserToken: string) => void;
  onError: (message: string) => void;
}

export default function AppleMusicAuthScreen({ developerToken, onSuccess, onError }: Props) {
  const [loading, setLoading] = useState(true);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const message = parseAppleMusicAuthMessage(event.nativeEvent.data);
        if (message.type === 'success' && message.musicUserToken) {
          await saveMusicUserToken(message.musicUserToken);
          onSuccess(message.musicUserToken);
        } else {
          onError(message.message ?? 'Autorisation Apple Music refusée.');
        }
      } catch (err) {
        onError((err as Error).message);
      }
    },
    [onSuccess, onError]
  );

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.keep} size="large" />
          <Text style={styles.loadingText}>Connexion à Apple Music…</Text>
        </View>
      )}
      <WebView
        source={{ html: buildAppleMusicAuthHtml(developerToken) }}
        onMessage={handleMessage}
        onLoadEnd={() => setLoading(false)}
        onError={(e) => onError(e.nativeEvent.description ?? 'Erreur WebView Apple Music.')}
        javaScriptEnabled
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: { flex: 1, backgroundColor: colors.background },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  loadingText: { color: colors.textSecondary, marginTop: spacing.sm },
});
