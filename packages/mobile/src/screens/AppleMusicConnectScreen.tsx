import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppleMusicAuthScreen from './auth/AppleMusicAuthScreen';
import { getAppleMusicDeveloperToken, musicEngine } from '../services/musicEngine';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

type State = { kind: 'loadingToken' } | { kind: 'ready'; developerToken: string } | { kind: 'error'; message: string } | { kind: 'success' };

/**
 * Écran de connexion Apple Music réel — récupère le developer token auprès
 * du backend KEEP (voir services/musicEngine.ts) puis lance le flux
 * MusicKit JS (WebView). Premier point d'entrée UI réel pour
 * AppleMusicAuthScreen, jusqu'ici jamais atteignable depuis la navigation.
 */
export default function AppleMusicConnectScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'loadingToken' });

  const loadToken = async () => {
    setState({ kind: 'loadingToken' });
    try {
      const developerToken = await getAppleMusicDeveloperToken();
      setState({ kind: 'ready', developerToken });
    } catch (e: any) {
      setState({ kind: 'error', message: e?.message ?? 'Erreur inconnue.' });
    }
  };

  useEffect(() => {
    loadToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuccess = () => {
    musicEngine.resetSession();
    setState({ kind: 'success' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Apple Music</Text>
      </View>

      {state.kind === 'loadingToken' && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.keep} size="large" />
          <Text style={styles.hint}>Préparation de la connexion…</Text>
        </View>
      )}

      {state.kind === 'ready' && (
        <AppleMusicAuthScreen
          developerToken={state.developerToken}
          onSuccess={handleSuccess}
          onError={(message) => setState({ kind: 'error', message })}
        />
      )}

      {state.kind === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{state.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadToken}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.kind === 'success' && (
        <View style={styles.centered}>
          <Text style={styles.successEmoji}>✓</Text>
          <Text style={styles.successText}>Apple Music connecté.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}>
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
  hint: { color: colors.textSecondary, fontSize: 14 },
  errorEmoji: { fontSize: 40 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  successEmoji: { fontSize: 40, color: colors.keep },
  successText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  retryBtn: {
    marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  retryBtnText: { color: colors.white, fontWeight: '700' },
});
