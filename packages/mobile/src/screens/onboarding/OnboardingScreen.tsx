import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, TextInput, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { spacing, radius, typography } from '../../theme/spacing';
import { useUserStore } from '../../store/useUserStore';
import { supabase, isSupabaseConfigured, ensureGuestSession } from '../../services/supabaseClient';
import { createAuthService, translateAuthError, isEmailAlreadyRegisteredError } from '../../services/authService';
import { AppAlert as Alert } from '../../utils/AppAlert';

type Step = 'entry' | 'email' | 'code';

/** "ad**@live.fr" -- assez pour confirmer la bonne adresse sans l'exposer entière (cf. demande explicite du 24/08/2026). */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

/**
 * Écran d'onboarding — premier écran vu par un nouvel utilisateur.
 *
 * Refonte UX complète du 24/08/2026 (cf. demande explicite -- capture d'un
 * vrai test montrant trop d'actions sur un seul écran + un message d'erreur
 * Supabase brut en anglais visible) : 3 écrans DISTINCTS l'un après l'autre
 * (entrée -> email -> code), jamais tout affiché en même temps. Aucune
 * erreur provider brute affichée -- voir translateAuthError() dans
 * authService.ts, seule source des textes d'erreur ici.
 *
 * "Continuer avec e-mail" est le seul flux réellement branché (Supabase
 * Auth, code à 6 chiffres -- pas de deep link à gérer) dès que
 * EXPO_PUBLIC_SUPABASE_URL/ANON_KEY sont configurées. Apple/Google restent
 * honnêtement "pas encore connecté" (Sign in with Apple et l'OAuth Google
 * demandent chacun une configuration native séparée, voir
 * docs/RESTE_A_FAIRE.md) -- jamais de simulation de connexion réussie.
 */
interface OnboardingScreenProps {
  /** Étape de départ -- cf. bug réel du 24/08/2026 : un invité qui a déjà consommé ses essais gratuits et tape "Créer mon compte" depuis ProfileScreen doit atterrir directement sur l'e-mail, pas revoir Apple/Google/"essayer sans compte" (choix déjà fait). */
  initialStep?: Step;
  /** Rendu à l'intérieur d'une Modal (voir ProfileScreen) plutôt qu'en écran racine (voir App.tsx) -- affiche une croix de fermeture au lieu du flux "Retour vers l'entrée". */
  embedded?: boolean;
  /** Appelé après vérification réussie du code, ou fermeture explicite en mode embedded. Ignoré à la racine (App.tsx bascule déjà seul via onSessionChange). */
  onDone?: () => void;
}

export default function OnboardingScreen({ initialStep, embedded, onDone }: OnboardingScreenProps = {}) {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);

  const [step, setStep] = useState<Step>(initialStep ?? 'entry');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [guestBusy, setGuestBusy] = useState(false);
  /** Décidé en direct dans handleSendCode (session invité active ou non) -- détermine si handleVerifyCode doit lier (préserve les KEEP invité) ou créer un compte neuf. */
  const [linkingMode, setLinkingMode] = useState(false);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const authService = supabase ? createAuthService(supabase) : null;

  useEffect(() => () => {
    if (resendTimer.current) clearInterval(resendTimer.current);
  }, []);

  // BUG RÉEL corrigé le 24/08/2026 (Adel : "j'ai rien fait du tout et ça me
  // met trop de tentatives... j'étais même pas sur l'ordinateur") : ce
  // Screen reste MONTÉ dans la pile de navigation entre deux ouvertures de
  // la modale "CreateAccount" (comportement par défaut du stack navigator),
  // donc `errorMsg`/`step`/`resendIn` d'une tentative précédente (échec réel
  // ou rate-limit Supabase) restaient affichés tels quels à la RÉOUVERTURE,
  // sans qu'aucune action n'ait eu lieu cette fois-ci. Repartir de zéro à
  // chaque fois que cet écran reprend le focus -- jamais montrer l'état
  // d'une tentative passée comme si elle venait de se produire maintenant.
  useFocusEffect(
    React.useCallback(() => {
      setStep(initialStep ?? 'entry');
      setErrorMsg(null);
      setCode('');
      setResendIn(0);
      setLinkingMode(false);
      if (resendTimer.current) {
        clearInterval(resendTimer.current);
        resendTimer.current = null;
      }
    }, [initialStep])
  );

  const startResendCountdown = (seconds: number) => {
    setResendIn(seconds);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) {
          if (resendTimer.current) clearInterval(resendTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  /**
   * "Essayer sans compte" (cf. demande explicite du 24/08/2026) -- une VRAIE
   * session invité Supabase (anonyme, réelle reconnaissance/quota serveur),
   * PAS le Mode Démo (données fictives) -- deux choses différentes, cf. bug
   * réel trouvé le même jour (le bouton appelait par erreur enterDemoMode()).
   * App.tsx bascule automatiquement vers <Navigation /> via onSessionChange
   * dès que la session existe -- rien à faire ici après l'appel.
   */
  const handleTryWithoutAccount = async () => {
    if (!isSupabaseConfigured) {
      enterDemoMode(); // repli honnête : pas de backend réel configuré, seul le Mode Démo peut fonctionner.
      return;
    }
    setGuestBusy(true);
    const token = await ensureGuestSession();
    setGuestBusy(false);
    if (!token) {
      Alert.alert(t('common.notConnected'), 'Impossible de démarrer une session invité pour le moment. Réessaie dans un instant.');
    }
  };

  const handleAuthPress = (provider: 'apple' | 'google') => {
    Alert.alert(
      t('common.notConnected'),
      provider === 'apple'
        ? "Sign in with Apple n'est pas encore connecté sur ce backend. Veux-tu essayer KEEP sans compte en attendant ?"
        : "La connexion Google n'est pas encore connectée sur ce backend. Veux-tu essayer KEEP sans compte en attendant ?",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Essayer sans compte', onPress: () => enterDemoMode() },
      ]
    );
  };

  const goToEmailStep = () => {
    if (!isSupabaseConfigured || !authService) {
      Alert.alert(
        t('common.notConnected'),
        "L'authentification réelle (Supabase Auth) n'est pas encore connectée sur ce backend. Veux-tu essayer KEEP sans compte en attendant ?",
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Essayer sans compte', onPress: () => enterDemoMode() },
        ]
      );
      return;
    }
    setErrorMsg(null);
    setStep('email');
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
    // Vérifié en direct (pas seulement via `embedded`) : si une session
    // invité est active, on DOIT lier ce mail à cette session (préserve
    // auth.uid() donc les KEEP déjà faits), jamais créer un compte séparé
    // -- cf. bug réel du 24/08/2026, vérifié contre la doc officielle
    // Supabase ("Converting an anonymous user to a permanent one").
    const currentSession = await authService.getCurrentSession();
    let linking = !!currentSession?.isAnonymous;
    let result = linking ? await authService.requestEmailLink(trimmed) : await authService.requestEmailCode(trimmed);
    // BUG RÉEL corrigé le 24/08/2026 -- Adel avait déjà un vrai compte
    // (créé plus tôt dans la session) et retentait depuis une NOUVELLE
    // session invitée fraîche : la LIAISON échoue à raison (Supabase refuse
    // de réclamer l'identité d'un AUTRE compte -- `error_code:"email_exists"`,
    // vérifié en direct contre l'API réelle), mais lui veut juste se
    // CONNECTER à son compte existant, pas en créer/lier un nouveau. Repli
    // automatique et transparent vers une connexion normale (jamais montrer
    // une erreur pour "ton compte existe déjà" -- c'est exactement ce qu'il
    // veut, il faut juste basculer vers le bon flux Supabase).
    if (linking && result.error && isEmailAlreadyRegisteredError(result.error)) {
      linking = false;
      result = await authService.requestEmailCode(trimmed);
    }
    setLinkingMode(linking);
    const { error } = result;
    setBusy(false);
    if (error) {
      const { message, retryAfterSec } = translateAuthError(error);
      setErrorMsg(message);
      if (retryAfterSec) startResendCountdown(retryAfterSec);
      return;
    }
    setCode('');
    startResendCountdown(30);
    setStep('code');
  };

  const handleResend = async () => {
    if (resendIn > 0 || busy) return;
    setErrorMsg(null);
    await handleSendCode();
  };

  const handleVerifyCode = async () => {
    if (!authService) return;
    if (code.trim().length < 6) {
      setErrorMsg('Code à 6 chiffres requis.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    const { error } = linkingMode
      ? await authService.verifyEmailLink(email.trim(), code.trim())
      : await authService.verifyEmailCode(email.trim(), code.trim());
    setBusy(false);
    if (error) {
      setErrorMsg(translateAuthError(error).message);
      return;
    }
    // Succès : App.tsx écoute onSessionChange et met à jour isAnonymous/user
    // automatiquement -- en mode embedded (voir ProfileScreen), on ferme
    // juste la Modal par-dessus cet état déjà à jour.
    onDone?.();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {step === 'entry' && (
          <View style={styles.flex}>
            <View style={styles.hero}>
              <Text style={styles.logo}>KEEP</Text>
              <Text style={styles.tagline}>{t('onboarding.welcomeSubtitle')}</Text>
            </View>

            <View style={styles.actions}>
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={[styles.button, styles.appleButton]} onPress={() => handleAuthPress('apple')}>
                  <Text style={styles.appleButtonText}>{t('onboarding.continueApple')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={() => handleAuthPress('google')}>
                <Text style={styles.googleButtonText}>{t('onboarding.continueGoogle')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={goToEmailStep}>
                <Text style={styles.primaryButtonText}>{t('onboarding.continueEmail')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.subtleLink} onPress={handleTryWithoutAccount} disabled={guestBusy}>
                {guestBusy ? <ActivityIndicator color={colors.textMuted} /> : <Text style={styles.subtleLinkText}>{t('onboarding.tryWithoutAccount')}</Text>}
              </TouchableOpacity>

              <Text style={styles.legal}>{t('onboarding.legalNotice')}</Text>
            </View>
          </View>
        )}

        {step === 'email' && (
          <View style={styles.flex}>
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => (embedded ? onDone?.() : setStep('entry'))}
              hitSlop={12}
            >
              <Text style={styles.backText}>{embedded ? '✕' : '← Retour'}</Text>
            </TouchableOpacity>

            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Créer mon profil KEEP</Text>
              <Text style={styles.stepSubtitle}>Entre ton adresse e-mail pour continuer.</Text>

              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="adresse@email.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoFocus
                keyboardType="email-address"
                onSubmitEditing={handleSendCode}
              />
              {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

              <TouchableOpacity style={[styles.button, styles.primaryButton, styles.stepButton]} onPress={handleSendCode} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Continuer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'code' && (
          <View style={styles.flex}>
            <TouchableOpacity style={styles.backRow} onPress={() => { setStep('email'); setErrorMsg(null); }} hitSlop={12}>
              <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>

            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Vérifie ton e-mail</Text>
              <Text style={styles.stepSubtitle}>Nous avons envoyé un code à {maskEmail(email.trim())}</Text>

              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="_ _ _ _ _ _"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                onSubmitEditing={handleVerifyCode}
              />
              {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

              <TouchableOpacity style={[styles.button, styles.primaryButton, styles.stepButton]} onPress={handleVerifyCode} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Valider</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={resendIn > 0 || busy} hitSlop={8}>
                <Text style={styles.resendText}>
                  {resendIn > 0 ? `Renvoyer le code dans ${resendIn}s` : 'Renvoyer le code'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 52, fontWeight: '800', color: colors.primaryLight, letterSpacing: 4 },
  tagline: { marginTop: spacing.sm, fontSize: 15, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
  actions: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm },
  button: {
    minHeight: 48, // 46 -> 48 (audit Design System du 24/08/2026) -- taille CTA principal unifiée.
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: { backgroundColor: colors.primary },
  primaryButtonText: { ...typography.button, fontSize: 14, color: colors.white },
  appleButton: { backgroundColor: colors.white },
  appleButtonText: { ...typography.button, fontSize: 14, color: colors.black },
  googleButton: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  googleButtonText: { ...typography.button, fontSize: 14, color: colors.textPrimary },
  subtleLink: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  subtleLinkText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  legal: { marginTop: spacing.xs, fontSize: 11, color: colors.textMuted, textAlign: 'center' },

  backRow: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  backText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  stepBody: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: spacing.sm, paddingBottom: spacing.xxl },
  stepTitle: { ...typography.h2, color: colors.textPrimary },
  stepSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md },
  stepButton: { marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  codeInput: { textAlign: 'center', fontSize: 22, letterSpacing: 6, fontWeight: '700' },
  errorText: { color: colors.danger, fontSize: 12 },
  resendRow: { alignItems: 'center', paddingVertical: spacing.sm },
  resendText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
