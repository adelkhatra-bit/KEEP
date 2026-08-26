import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, Platform, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/colors';
import { spacing, radius, typography } from '../../theme/spacing';
import { useUserStore } from '../../store/useUserStore';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { createAuthService } from '../../services/authService';
import { consumeWebAuthAndOpenNative, subscribeToNativeAuthLinks } from '../../services/authLinkHandoff';

type EmailStep = 'idle' | 'linkSent';
type AuthStep = 'landing' | 'chooser' | 'email';

const LOCAL_GUEST_ID_KEY = '@keep/local-guest-id-v1';

function createLocalGuestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const enterGuestMode = useUserStore((s) => s.enterGuestMode);
  const [authStep, setAuthStep] = useState<AuthStep>('landing');
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const authService = supabase ? createAuthService(supabase) : null;

  // L'essai gratuit est un vrai mode invité LOCAL, stable sur l'appareil.
  // Il ne crée plus un auth.users Supabase à chaque navigateur/téléphone :
  // cela supprime la source du 429 "Too many requests" et rend le bouton
  // ESSAYER GRATUITEMENT instantané même si le réseau ou l'e-mail est en panne.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LOCAL_GUEST_ID_KEY)
      .then((guestId) => {
        if (!active || !guestId || useUserStore.getState().user) return;
        enterGuestMode(guestId);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [enterGuestMode]);

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
    setBusy(true);
    setErrorMsg(null);

    let guestId = createLocalGuestId();
    try {
      const existing = await AsyncStorage.getItem(LOCAL_GUEST_ID_KEY);
      guestId = existing || guestId;
      if (!existing) await AsyncStorage.setItem(LOCAL_GUEST_ID_KEY, guestId);
    } catch {
      // Même si le stockage local est momentanément indisponible, l'utilisateur
      // entre dans KEEP au lieu de rester bloqué sur une page blanche/429.
    }

    setBusy(false);
    enterGuestMode(guestId);
  };

  const openAccountChooser = () => {
    setAuthStep('chooser');
    setEmailStep('idle');
    setErrorMsg(null);
  };

  const openEmail = () => {
    if (!isSupabaseConfigured || !authService) {
      Alert.alert(t('common.notConnected'), "L'authentification KEEP n'est pas disponible pour le moment.");
      return;
    }
    setAuthStep('email');
    setEmailStep('idle');
    setErrorMsg(null);
  };

  const goBack = () => {
    if (authStep === 'email') {
      setAuthStep('chooser');
      setEmailStep('idle');
    } else {
      setAuthStep('landing');
    }
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
    const { error } = await authService.requestEmailMagicLink(trimmed);
    setBusy(false);
    if (error) {
      if (/rate limit|too many|429/i.test(error)) {
        setErrorMsg('Un lien vient déjà d’être demandé. Attends environ 60 secondes avant de le renvoyer.');
      } else {
        setErrorMsg('Impossible d’envoyer le lien. Réessaie dans un instant.');
      }
      return;
    }
    setEmailStep('linkSent');
  };

  const showDemo = __DEV__ || process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>KEEP</Text>
        <Text style={styles.tagline}>{t('onboarding.welcomeSubtitle')}</Text>
        <Text style={styles.valueLine}>Partage tes goûts musicaux. Crée ta communauté.</Text>
      </View>

      <View style={styles.actions}>
        {authStep === 'landing' && (
          <>
            <TouchableOpacity style={[styles.button, styles.trialButton]} onPress={handleGuestPress} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <>
                <Text style={styles.trialButtonText}>ESSAYER GRATUITEMENT</Text>
                <Text style={styles.trialHint}>3 téléchargements sans inscription</Text>
              </>}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.accountButton]} onPress={openAccountChooser} disabled={busy}>
              <Text style={styles.accountButtonText}>SE CONNECTER / CRÉER MON COMPTE</Text>
            </TouchableOpacity>
          </>
        )}

        {authStep === 'chooser' && (
          <>
            <TouchableOpacity style={styles.backChoice} onPress={goBack}>
              <Text style={styles.backChoiceText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.choiceTitle}>Choisis une méthode de connexion</Text>

            {Platform.OS === 'ios' && (
              <TouchableOpacity style={[styles.button, styles.appleButton]} onPress={() => handleAuthPress('apple')}>
                <Text style={styles.appleButtonText}>{t('onboarding.continueApple')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={() => handleAuthPress('google')}>
              <Text style={styles.googleButtonText}>{t('onboarding.continueGoogle')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.emailChoiceButton]} onPress={openEmail}>
              <Text style={styles.emailChoiceButtonText}>{t('onboarding.continueEmail')}</Text>
            </TouchableOpacity>
          </>
        )}

        {authStep === 'email' && emailStep === 'idle' && (
          <>
            <TouchableOpacity style={styles.backChoice} onPress={goBack}>
              <Text style={styles.backChoiceText}>← Autres méthodes</Text>
            </TouchableOpacity>
            <View style={styles.emailForm}>
              <Text style={styles.choiceTitle}>Continuer avec e-mail</Text>
              <Text style={styles.codeHint}>Entre ton e-mail. KEEP t’envoie un lien sécurisé : tu cliques dessus et tu es connecté.</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="ton@email.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" onSubmitEditing={handleSendLink} />
              {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleSendLink} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>M’ENVOYER LE LIEN</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {authStep === 'email' && emailStep === 'linkSent' && (
          <>
            <TouchableOpacity style={styles.backChoice} onPress={goBack}>
              <Text style={styles.backChoiceText}>← Autres méthodes</Text>
            </TouchableOpacity>
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
          </>
        )}

        {errorMsg && authStep !== 'email' ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        {showDemo && authStep === 'landing' && (
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
  accountButton: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  accountButtonText: { ...typography.button, color: colors.textPrimary, fontWeight: '800' },
  choiceTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: spacing.xs },
  backChoice: { minHeight: 32, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.xs },
  backChoiceText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  appleButton: { backgroundColor: colors.white },
  appleButtonText: { ...typography.button, color: colors.black },
  googleButton: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  googleButtonText: { ...typography.button, color: colors.textPrimary },
  emailChoiceButton: { backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight },
  emailChoiceButtonText: { ...typography.button, color: colors.white, fontWeight: '800' },
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
