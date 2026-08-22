import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, TextInput, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/colors';
import { spacing, radius, typography } from '../../theme/spacing';
import { useUserStore } from '../../store/useUserStore';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { createAuthService } from '../../services/authService';
import { AppAlert as Alert } from '../../utils/AppAlert';

type EmailStep = 'idle' | 'codeSent';

/**
 * Écran d'onboarding — premier écran vu par un nouvel utilisateur.
 *
 * "Continuer avec e-mail" est le seul flux réellement branché (Supabase
 * Auth, code à 6 chiffres -- pas de deep link à gérer) dès que
 * EXPO_PUBLIC_SUPABASE_URL/ANON_KEY sont configurées. Apple/Google restent
 * honnêtement "pas encore connecté" (Sign in with Apple et l'OAuth Google
 * demandent chacun une configuration native séparée, voir
 * docs/RESTE_A_FAIRE.md) -- jamais de simulation de connexion réussie.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);

  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const authService = supabase ? createAuthService(supabase) : null;

  const handleAuthPress = (provider: 'apple' | 'google') => {
    Alert.alert(
      t('common.notConnected'),
      provider === 'apple'
        ? "Sign in with Apple n'est pas encore connecté sur ce backend. Veux-tu explorer KEEP en Mode Démo en attendant ?"
        : "La connexion Google n'est pas encore connectée sur ce backend. Veux-tu explorer KEEP en Mode Démo en attendant ?",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Mode Démo', onPress: () => enterDemoMode() },
      ]
    );
  };

  const handleEmailPress = () => {
    if (!isSupabaseConfigured || !authService) {
      Alert.alert(
        t('common.notConnected'),
        "L'authentification réelle (Supabase Auth) n'est pas encore connectée sur ce backend. Veux-tu explorer KEEP en Mode Démo en attendant ?",
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Mode Démo', onPress: () => enterDemoMode() },
        ]
      );
      return;
    }
    setEmailFormVisible(true);
    setErrorMsg(null);
  };

  const handleSendCode = async () => {
    if (!authService) return;
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setErrorMsg('Adresse e-mail invalide.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    const { error } = await authService.requestEmailCode(trimmed);
    setBusy(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    setEmailStep('codeSent');
  };

  const handleVerifyCode = async () => {
    if (!authService) return;
    if (code.trim().length < 6) {
      setErrorMsg('Code à 6 chiffres requis.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    const { error } = await authService.verifyEmailCode(email.trim(), code.trim());
    setBusy(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    // Succès : App.tsx écoute onSessionChange et bascule automatiquement
    // vers <Navigation /> -- rien d'autre à faire ici.
  };

  const showEmailForm = isSupabaseConfigured && emailFormVisible;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>KEEP</Text>
        <Text style={styles.tagline}>{t('onboarding.welcomeSubtitle')}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.demoButton]} onPress={() => enterDemoMode()}>
          <Text style={styles.demoButtonText}>{t('onboarding.tryDemoMode')}</Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <TouchableOpacity style={[styles.button, styles.appleButton]} onPress={() => handleAuthPress('apple')}>
            <Text style={styles.appleButtonText}> {t('onboarding.continueApple')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={() => handleAuthPress('google')}>
          <Text style={styles.googleButtonText}>{t('onboarding.continueGoogle')}</Text>
        </TouchableOpacity>

        {!showEmailForm && (
          <TouchableOpacity style={styles.emailButton} onPress={handleEmailPress}>
            <Text style={styles.emailButtonText}>{t('onboarding.continueEmail')}</Text>
          </TouchableOpacity>
        )}

        {showEmailForm && emailStep === 'idle' && (
          <View style={styles.emailForm}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ton@email.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              onSubmitEditing={handleSendCode}
            />
            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleSendCode} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Envoyer le code</Text>}
            </TouchableOpacity>
          </View>
        )}

        {showEmailForm && emailStep === 'codeSent' && (
          <View style={styles.emailForm}>
            <Text style={styles.codeHint}>Code envoyé à {email.trim()}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              onSubmitEditing={handleVerifyCode}
            />
            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleVerifyCode} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Valider</Text>}
            </TouchableOpacity>
          </View>
        )}

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
  demoButton: {
    backgroundColor: colors.primary,
  },
  demoButtonText: {
    ...typography.button,
    color: colors.white,
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
  emailForm: {
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  codeHint: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  legal: {
    marginTop: spacing.sm,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
