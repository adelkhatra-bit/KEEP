import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppleMusicAuthScreen from './auth/AppleMusicAuthScreen';
import { getAppleMusicDeveloperToken, musicEngine } from '../services/musicEngine';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

type State = { kind: 'loadingToken' } | { kind: 'ready'; developerToken: string } | { kind: 'error'; message: string } | { kind: 'success' };

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
    void loadToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'));

  const handleSuccess = () => {
    musicEngine.resetSession();
    setState({ kind: 'success' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SERVICES MUSICAUX</Text>
          <Text style={styles.title}>Apple Music</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {state.kind === 'loadingToken' ? (
        <View style={styles.centered}>
          <View style={styles.stateCard}>
            <View style={styles.iconCircle}>
              <ActivityIndicator color={colors.primaryLight} size="large" />
            </View>
            <Text style={styles.stateTitle}>Connexion sécurisée</Text>
            <Text style={styles.hint}>Loki Music prépare Apple Music sans exposer tes identifiants.</Text>
          </View>
        </View>
      ) : null}

      {state.kind === 'ready' ? (
        <View style={styles.authShell}>
          <View style={styles.introCard}>
            <Text style={styles.introKicker}>APPLE MUSIC</Text>
            <Text style={styles.introTitle}>Connecte ta bibliothèque</Text>
            <Text style={styles.introText}>Autorise Apple Music pour retrouver tes playlists et synchroniser tes choix avec ton compte Loki Music.</Text>
          </View>
          <View style={styles.authArea}>
            <AppleMusicAuthScreen
              developerToken={state.developerToken}
              onSuccess={handleSuccess}
              onError={(message) => setState({ kind: 'error', message })}
            />
          </View>
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.centered}>
          <View style={[styles.stateCard, styles.errorCard]}>
            <View style={[styles.iconCircle, styles.errorIcon]}><Text style={styles.errorEmoji}>!</Text></View>
            <Text style={styles.stateTitle}>Connexion impossible</Text>
            <Text style={styles.errorText}>{state.message}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void loadToken()}>
              <Text style={styles.primaryButtonText}>RÉESSAYER</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {state.kind === 'success' ? (
        <View style={styles.centered}>
          <View style={[styles.stateCard, styles.successCard]}>
            <View style={[styles.iconCircle, styles.successIcon]}><Text style={styles.successEmoji}>✓</Text></View>
            <Text style={styles.stateTitle}>Apple Music connecté</Text>
            <Text style={styles.hint}>Ta connexion est prête. Tu peux revenir à Loki Music.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={goBack}>
              <Text style={styles.primaryButtonText}>{String(t('common.back')).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backArrow: { color: colors.textPrimary, fontSize: 24, lineHeight: 26, fontWeight: '800' },
  headerCopy: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  headerSpacer: { width: 44, height: 44 },
  eyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { ...typography.h2, color: colors.textPrimary, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  stateCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderRadius: 24,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorCard: { borderColor: colors.danger },
  successCard: { borderColor: colors.keep },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  errorIcon: { borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,0.10)' },
  successIcon: { borderColor: colors.keep, backgroundColor: 'rgba(45,225,194,0.10)' },
  stateTitle: { color: colors.textPrimary, fontSize: 20, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  hint: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  errorEmoji: { color: colors.danger, fontSize: 32, lineHeight: 36, fontWeight: '900' },
  errorText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: spacing.sm },
  successEmoji: { color: colors.keep, fontSize: 32, lineHeight: 36, fontWeight: '900' },
  primaryButton: {
    minHeight: 52,
    minWidth: 180,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: .5 },
  authShell: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  introCard: {
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  introKicker: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  introTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 3 },
  introText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  authArea: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: radius.lg },
});
