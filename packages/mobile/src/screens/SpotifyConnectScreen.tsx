import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { connectSpotify, isSpotifyConfigured } from '../services/spotifyAuth';
import { useMusicServiceStore } from '../store/useMusicServiceStore';
import { musicEngine } from '../services/musicEngine';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

type State = { kind: 'idle' } | { kind: 'connecting' } | { kind: 'error'; message: string } | { kind: 'success' };

/**
 * Écran de connexion Spotify réel -- lance le flux PKCE (voir
 * services/spotifyAuth.ts) via le navigateur système, pas de simulation.
 * Premier point d'entrée UI réel pour ce provider.
 */
export default function SpotifyConnectScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const connectReal = useMusicServiceStore((s) => s.connectReal);

  const handleConnect = async () => {
    setState({ kind: 'connecting' });
    try {
      await connectSpotify();
      musicEngine.resetSession();
      connectReal('spotify');
      setState({ kind: 'success' });
    } catch (e: any) {
      setState({ kind: 'error', message: e?.message ?? 'Erreur inconnue.' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Spotify</Text>
      </View>

      {!isSpotifyConfigured() && (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>
            EXPO_PUBLIC_SPOTIFY_CLIENT_ID manquant. Crée une app gratuite sur developer.spotify.com/dashboard, ajoute
            "keep://spotify-auth" comme Redirect URI, et renseigne le Client ID dans packages/mobile/.env.
          </Text>
        </View>
      )}

      {isSpotifyConfigured() && state.kind === 'idle' && (
        <View style={styles.centered}>
          <Text style={styles.hint}>Connecte ton compte Spotify pour ranger tes GARDER dedans.</Text>
          <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
            <Text style={styles.connectBtnText}>Se connecter à Spotify</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.kind === 'connecting' && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.keep} size="large" />
          <Text style={styles.hint}>Connexion en cours…</Text>
        </View>
      )}

      {state.kind === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{state.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleConnect}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.kind === 'success' && (
        <View style={styles.centered}>
          <Text style={styles.successEmoji}>✓</Text>
          <Text style={styles.successText}>Spotify connecté.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.retryBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backArrow: { color: colors.textPrimary, fontSize: 22 },
  title: { ...typography.h2, color: colors.textPrimary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  hint: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  errorEmoji: { fontSize: 40 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  successEmoji: { fontSize: 40, color: colors.keep },
  successText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  connectBtn: { marginTop: spacing.md, backgroundColor: colors.keep, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  connectBtnText: { color: colors.black, fontWeight: '700' },
  retryBtn: {
    marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  retryBtnText: { color: colors.white, fontWeight: '700' },
});
