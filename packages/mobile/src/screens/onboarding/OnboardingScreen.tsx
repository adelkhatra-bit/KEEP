import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Platform, TextInput, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/colors';
import { spacing, radius, typography } from '../../theme/spacing';
import { useUserStore } from '../../store/useUserStore';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { createAuthService } from '../../services/authService';
import { consumeWebAuthAndOpenNative, subscribeToNativeAuthLinks } from '../../services/authLinkHandoff';

type EmailStep = 'idle' | 'linkSent';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const authService = supabase ? createAuthService(supabase) : null;

  // Solution e-mail gratuite pour les tests : pas de code à recopier et pas
  // de dépendance obligatoire à Brevo. Supabase envoie un lien de connexion.
  // Sur web, le lien établit la session. Sur téléphone, il tente ensuite de
  // rouvrir KEEP via keep://auth/callback ; l'écran ci-dessous récupère alors
  // la même session dans l'app native.
  useEffect(() => {
    if (!supabase) return;

    if (Platform.OS === 'web') {
      void consumeWebAuthAndOpenNative(supabase).catch(() => {
        setErrorMsg('Le lien de connexion est invalide ou expiré. Demande un nouveau lien.');
      });
      return;
    }

    return subscribeToNativeAuthLinks(
      supabase,
      () => setErrorMsg(null),
      () => setErrorMsg('Le lien de connexion est invalide ou expiré. Demande un nouveau lien.'),
    );
  }, []);

  const handleAuthPress = (provider: 'apple' | 'google') => {
    Alert.alert(
      t('common.notConnected'),
      provider === 'apple'
        ? "Sign in with Apple n'est pas encore connecté sur ce backend."
        : "La connexion Google n'est pas encore connectée sur ce backend.",
    );
  };

  const handleGuestPress = async () => {
    if (!isSupabaseConfigured || !authService) {
      Alert.alert('KEEP indisponible', 'La connexion au serveur KEEP est nécessaire pour activer les crédits gratuits.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    const { error } = await authService.signInAsGuest();
    setBusy(false);
    if (error) setErrorMsg('Impossible de démarrer l’essai gratuit. Réessaie dans un instant.');
  };

  const handleEmailPress = () => {
    if (!isSupabaseConfigured || !authService) {
      Alert.alert(t('common.notConnected'), "L'authentification KEEP n'est pas disponible pour le moment.");
      return;
    }
    setEmailFormVisible(true);
    setErrorMsg(null);
  };

  const handleSendLink = async () => {
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
      setErrorMsg('Impossible d’envoyer le lien. Réessaie dans un instant.');
      return;
    }
    setEmailStep('linkSent');
  };

  const showEmailForm = isSupabaseConfigured && emailFormVisible;
  const showDemo = __DEV__ || process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>KEEP</Text>
        <Text style={styles.tagline}>{t('onboarding.welcomeSubtitle')}</Text>
        <Text style={styles.valueLine}>Partage tes goûts musicaux. Crée ta communauté.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.trialButton]} onPress={handleGuestPress} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.white} /> : <>
            <Text style={styles.trialButtonText}>ESSAYER GRATUITEMENT</Text>
            <Text style={styles.trialHint}>3 téléchargements sans inscription</Text>
          </>}
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <TouchableOpacity style={[styles.button, styles.appleButton]} onPress={() => handleAuthPress('apple')}>
            <Text style={styles.appleButtonText}>{t('onboarding.continueApple')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={() => handleAuthPress('google')}>
          <Text style={styles.googleButtonText}>{t('onboarding.continueGoogle')}</Text>
        </TouchableOpacity>

        {!showEmailForm && <TouchableOpacity style={styles.emailButton} onPress={handleEmailPress}><Text style={styles.emailButtonText}>{t('onboarding.continueEmail')}</Text></TouchableOpacity>}

        {showEmailForm && emailStep === 'idle' && (
          <View style={styles.emailForm}>
            <Text style={styles.codeHint}>Entre ton e-mail. KEEP t’envoie un lien : tu cliques dessus et tu es connecté.</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="ton@email.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" onSubmitEditing={handleSendLink} />
            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleSendLink} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>M’ENVOYER LE LIEN</Text>}
            </TouchableOpacity>
          </View>
        )}

        {showEmailForm && emailStep === 'linkSent' && (
          <View style={[styles.emailForm, styles.linkSentCard]}>
            <Text style={styles.linkSentTitle}>Vérifie ton e-mail</Text>
            <Text style={styles.codeHint}>Un lien de connexion KEEP a été envoyé à {email.trim()}.</Text>
            <Text style={styles.linkSentHelp}>Ouvre l’e-mail puis touche le lien. Aucun code à recopier.</Text>
            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleSendLink} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>RENVOYER LE LIEN</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.emailButton} onPress={() => { setEmailStep('idle'); setErrorMsg(null); }}>
              <Text style={styles.emailButtonText}>Changer d’adresse e-mail</Text>
            </TouchableOpacity>
          </View>
        )}

        {errorMsg && !showEmailForm ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        {showDemo && (
          <TouchableOpacity style={styles.demoButton} onPress={() => enterDemoMode()} accessibilityRole="button" accessibilityLabel="Entrer en mode démo" testID="onboarding-demo-button">
            <Text style={styles.demoButtonText}>Mode démo</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.legal}>{t('onboarding.legalNotice')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 56, fontWeight: '800', color: colors.primaryLight, letterSpacing: 4 },
  tagline: { marginTop: spacing.md, fontSize: 16, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
  valueLine: { marginTop: spacing.sm, color: colors.primaryLight, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  actions: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  button: { minHeight: 52, borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center' },
  trialButton: { minHeight: 58, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight },
  trialButtonText: { ...typography.button, color: colors.white, fontWeight: '900' },
  trialHint: { color: colors.white, fontSize: 10, opacity: 0.82, marginTop: 2 },
  appleButton: { backgroundColor: colors.white },
  appleButtonText: { ...typography.button, color: colors.black },
  googleButton: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  googleButtonText: { ...typography.button, color: colors.textPrimary },
  emailButton: { minHeight: 46, justifyContent: 'center', alignItems: 'center' },
  emailButtonText: { ...typography.bodyBold, color: colors.primaryLight },
  demoButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  demoButtonText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  emailForm: { gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: 15 },
  primaryButton: { backgroundColor: colors.primary },
  primaryButtonText: { ...typography.button, color: colors.white },
  codeHint: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorText: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  legal: { marginTop: spacing.sm, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  linkSentCard: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  linkSentTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  linkSentHelp: { color: colors.primaryLight, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
