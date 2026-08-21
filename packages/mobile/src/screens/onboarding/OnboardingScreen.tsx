import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/colors';
import { spacing, radius, typography } from '../../theme/spacing';
import { useUserStore } from '../../store/useUserStore';

/**
 * Écran d'onboarding — premier écran vu par un nouvel utilisateur.
 *
 * IMPORTANT (honnêteté / "aucun faux résultat") : tant que Supabase Auth +
 * Sign in with Apple / Google ne sont pas réellement connectés (voir
 * docs/PROJECT_STATUS.md), ces boutons ne simulent PAS une connexion
 * réussie silencieusement. Ils informent clairement l'utilisateur que le
 * backend n'est pas encore branché, puis proposent d'explorer en Mode Démo
 * explicite (qui n'écrit jamais en base — cf. règles Mode Démo).
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);

  const handleAuthPress = (provider: 'apple' | 'google' | 'email') => {
    Alert.alert(
      t('common.notConnected'),
      "L'authentification réelle (Supabase Auth + Sign in with Apple/Google) n'est pas encore connectée sur ce backend. Veux-tu explorer KEEP en Mode Démo en attendant ?",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Mode Démo', onPress: () => enterDemoMode() },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>KEEP</Text>
        <Text style={styles.tagline}>{t('onboarding.welcomeSubtitle')}</Text>
      </View>

      <View style={styles.actions}>
        {Platform.OS === 'ios' && (
          <TouchableOpacity style={[styles.button, styles.appleButton]} onPress={() => handleAuthPress('apple')}>
            <Text style={styles.appleButtonText}> {t('onboarding.continueApple')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={() => handleAuthPress('google')}>
          <Text style={styles.googleButtonText}>{t('onboarding.continueGoogle')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.emailButton} onPress={() => handleAuthPress('email')}>
          <Text style={styles.emailButtonText}>{t('onboarding.continueEmail')}</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>{t('onboarding.legalNotice')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.primaryLight,
    letterSpacing: 4,
  },
  tagline: {
    marginTop: spacing.md,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleButton: {
    backgroundColor: colors.white,
  },
  appleButtonText: {
    ...typography.button,
    color: colors.black,
  },
  googleButton: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  emailButton: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emailButtonText: {
    ...typography.bodyBold,
    color: colors.primaryLight,
  },
  legal: {
    marginTop: spacing.sm,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
