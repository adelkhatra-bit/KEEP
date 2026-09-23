import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import UsernameAccountForm, { UsernameAccountMode } from '../../components/UsernameAccountForm';
import OnboardingGenresScreen from './OnboardingGenresScreen';
import { loadStagedGuestProfile, mergeStagedGuestProfile } from '../../services/guestUpgradeService';
import { claimPendingReferral, stageReferralFromUrl } from '../../services/referralService';
import { useUserStore } from '../../store/useUserStore';
import { colors } from '../../theme/colors';
import { radius, spacing, typography } from '../../theme/spacing';

const LOCAL_GUEST_ID_KEY = '@keep/local-guest-id-v1';

type WebIntent = { mode: UsernameAccountMode | null; followUsername: string };

function createLocalGuestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

function readWebIntent(): WebIntent {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return { mode: null, followUsername: '' };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('__keep_auth');
  return {
    mode: requested === 'login' ? 'login' : requested === 'create' ? 'create' : null,
    followUsername: (params.get('__keep_follow') || '').trim().replace(/^@+/, ''),
  };
}

function clearWebIntent() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('__keep_auth');
  url.searchParams.delete('__keep_follow');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

const TERMS_URL = 'https://adelkhatra-bit.github.io/KEEP/terms/';
const PRIVACY_URL = 'https://adelkhatra-bit.github.io/KEEP/privacy/';

function LegalNotice({ style }: { style: any }) {
  const { t, i18n } = useTranslation();
  const full = t('onboarding.legalNotice');
  const isFr = (i18n.language || '').startsWith('fr');
  const termsWord = isFr ? 'CGU' : 'Terms';
  const privacyWord = isFr ? 'politique de confidentialité' : 'Privacy Policy';
  const termsIdx = full.indexOf(termsWord);
  const privacyIdx = full.indexOf(privacyWord);
  if (termsIdx < 0 || privacyIdx < 0 || privacyIdx < termsIdx) {
    return <Text style={style}>{full}</Text>;
  }
  const before = full.slice(0, termsIdx);
  const between = full.slice(termsIdx + termsWord.length, privacyIdx);
  const after = full.slice(privacyIdx + privacyWord.length);
  return (
    <Text style={style}>
      {before}
      <Text style={styles.legalLink} onPress={() => { void Linking.openURL(TERMS_URL); }} accessibilityRole="link">
        {termsWord}
      </Text>
      {between}
      <Text style={styles.legalLink} onPress={() => { void Linking.openURL(PRIVACY_URL); }} accessibilityRole="link">
        {privacyWord}
      </Text>
      {after}
    </Text>
  );
}

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const enterGuestMode = useUserStore((s) => s.enterGuestMode);
  const [intent] = useState<WebIntent>(() => readWebIntent());
  const [accountOpen, setAccountOpen] = useState(Boolean(intent.mode || intent.followUsername));
  const [accountMode, setAccountMode] = useState<UsernameAccountMode>(intent.mode || (intent.followUsername ? 'login' : 'create'));
  const [busy, setBusy] = useState(false);
  // Maquette validée (docs/mockups/Onboarding.html, 22/09/2026) : après une
  // création de compte réussie, on propose le choix des styles musicaux
  // avant de rejoindre l'app. Ignoré pour une simple connexion (compte déjà
  // configuré) et skippable à tout moment ("Passer cette étape").
  const [genresOpen, setGenresOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Les liens de profil partagés sont déjà des invitations préremplies :
    // aucun code ami à recopier. Le pseudo du profil est stocké localement et
    // sera réclamé seulement après la création d'un vrai compte.
    void stageReferralFromUrl(window.location.href).catch(() => {});
  }, []);

  const restoreGuest = async (guestId: string) => {
    enterGuestMode(guestId);
    const staged = await loadStagedGuestProfile();
    const current = useUserStore.getState().user;
    if (staged && current) useUserStore.getState().setUser(mergeStagedGuestProfile(current, staged));
  };

  const handleGuestPress = async () => {
    setBusy(true);
    let guestId = createLocalGuestId();
    try {
      const existing = await AsyncStorage.getItem(LOCAL_GUEST_ID_KEY);
      guestId = existing || guestId;
      if (!existing) await AsyncStorage.setItem(LOCAL_GUEST_ID_KEY, guestId);
    } catch {
      // L'essai gratuit reste utilisable même si le stockage local échoue.
    }
    try {
      await restoreGuest(guestId);
    } finally {
      setBusy(false);
    }
  };

  // Architecture B (22/09/2026, "zéro friction" façon Shazam -- inspirée de
  // l'audit concurrence Spotify/Shazam/SoundHound/Apple Music/Deezer, maquette
  // validée) : au premier lancement, on ne demande plus à l'utilisateur de
  // choisir entre "Essayer gratuitement" et "Se connecter" avant d'avoir vu
  // la moindre valeur -- l'essai démarre automatiquement, qu'un identifiant
  // invité existe déjà sur l'appareil (ancien essai repris) ou non (premier
  // lancement, un nouvel identifiant est créé par handleGuestPress lui-même).
  // Une intention explicite (lien "+ Suivre" depuis un profil partagé, ou
  // ?__keep_auth=create|login) garde la priorité et n'est jamais écrasée --
  // c'est une vraie intention de compte, pas un mur imposé par défaut. Le
  // choix manuel (les 2 boutons ci-dessous) reste intégralement rendu et
  // fonctionnel pendant ce court instant, en repli si cette entrée
  // automatique échoue (ex. stockage local indisponible).
  useEffect(() => {
    if (accountOpen || intent.followUsername) return;
    if (useUserStore.getState().user) return;
    void handleGuestPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen, intent.followUsername]);

  const closeAccount = () => {
    clearWebIntent();
    setAccountOpen(false);
  };

  const finishAccount = () => {
    void claimPendingReferral().catch(() => false);
    const createdAccount = accountMode === 'create';
    const hasGenres = (useUserStore.getState().user?.favoriteGenres.length ?? 0) > 0;
    if (createdAccount && !hasGenres) {
      setGenresOpen(true);
      return;
    }
    closeAccount();
  };

  const continueWithoutSignup = async () => {
    clearWebIntent();
    await handleGuestPress();
  };

  // Le vrai parcours de test utilisateur est ESSAYER GRATUITEMENT. Le compte
  // démo interne ne doit jamais apparaître par accident dans une preview ou un
  // lien partagé : il reste disponible uniquement si un développeur l'active
  // explicitement dans un build __DEV__.
  const showDemo = __DEV__ && process.env.EXPO_PUBLIC_KEEP_SHOW_DEMO === '1';

  if (genresOpen) {
    return (
      <OnboardingGenresScreen
        onDone={() => { setGenresOpen(false); closeAccount(); }}
        onSkip={() => { setGenresOpen(false); closeAccount(); }}
      />
    );
  }

  if (accountOpen) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.accountScroll}
          contentContainerStyle={styles.accountScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.accountCard}>
            <TouchableOpacity style={styles.backChoice} onPress={closeAccount} accessibilityRole="button" accessibilityLabel="Retour sans créer de compte">
              <Text style={styles.backChoiceText}>← Retour</Text>
            </TouchableOpacity>
            <UsernameAccountForm
              initialMode={accountMode}
              followUsername={intent.followUsername}
              onSuccess={finishAccount}
            />
            <TouchableOpacity
              style={[styles.button, styles.accountButton, styles.continueTrialButton]}
              onPress={continueWithoutSignup}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Continuer sans inscription"
            >
              {busy ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={styles.accountButtonText}>CONTINUER SANS INSCRIPTION</Text>}
            </TouchableOpacity>
            <Text style={styles.continueTrialHint}>Tu peux revenir à l’essai gratuit maintenant et créer ton compte Loki Music plus tard.</Text>
            <LegalNotice style={styles.legal} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Loki Music</Text>
        <Text style={styles.tagline}>{t('onboarding.welcomeSubtitle')}</Text>
        <Text style={styles.valueLine}>Partage tes goûts musicaux. Crée ta communauté.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.trialButton]}
          onPress={handleGuestPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Essayer gratuitement"
          testID="onboarding-trial-button"
        >
          {busy ? <ActivityIndicator color={colors.white} /> : <>
            <Text style={styles.trialButtonText}>ESSAYER GRATUITEMENT</Text>
            <Text style={styles.trialHint}>3 téléchargements sans inscription</Text>
          </>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.accountGhostButton} onPress={() => { setAccountMode('create'); setAccountOpen(true); }} disabled={busy}>
          <Text style={styles.accountGhostText}>Se connecter / Créer mon compte</Text>
        </TouchableOpacity>

        {showDemo ? (
          <TouchableOpacity style={styles.demoButton} onPress={() => enterDemoMode()} accessibilityRole="button" accessibilityLabel="Entrer en mode démo" testID="onboarding-demo-button">
            <Text style={styles.demoButtonText}>Mode démo</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.legal}>{t('onboarding.legalNotice')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background,justifyContent:'space-between'},
  hero:{flex:1,justifyContent:'center',alignItems:'center'},
  logo:{fontSize:56,fontWeight:'800',color:colors.primaryLight,letterSpacing:4},
  tagline:{marginTop:spacing.md,fontSize:16,color:colors.textSecondary,textAlign:'center',paddingHorizontal:spacing.xl},
  valueLine:{marginTop:spacing.sm,color:colors.primaryLight,fontSize:12,fontWeight:'800',textAlign:'center'},
  actions:{paddingHorizontal:spacing.xl,paddingBottom:spacing.xxl,gap:spacing.md},
  button:{minHeight:52,borderRadius:radius.pill,justifyContent:'center',alignItems:'center'},
  trialButton:{minHeight:58,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight},
  trialButtonText:{...typography.button,color:colors.white,fontWeight:'900'},
  trialHint:{color:colors.white,fontSize:10,opacity:.82,marginTop:2},
  accountButton:{backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  accountButtonText:{...typography.button,color:colors.textPrimary,fontWeight:'800'},
  // Maquette validée (22/09/2026, architecture B) : un seul CTA dominant sur
  // l'écran d'accueil -- Essayer gratuitement reste le bouton plein, celui-ci
  // devient un lien discret sans fond ni bordure.
  accountGhostButton:{minHeight:44,alignItems:'center',justifyContent:'center'},
  accountGhostText:{color:colors.primaryLight,fontSize:14,fontWeight:'800'},
  accountScroll:{flex:1},
  accountScrollContent:{flexGrow:1,justifyContent:'center',paddingHorizontal:spacing.xl,paddingVertical:spacing.xl},
  accountCard:{width:'100%',maxWidth:520,alignSelf:'center',gap:spacing.sm},
  backChoice:{minHeight:40,alignSelf:'flex-start',justifyContent:'center',paddingHorizontal:spacing.xs},
  backChoiceText:{color:colors.primaryLight,fontSize:13,fontWeight:'800'},
  continueTrialButton:{marginTop:spacing.xs},
  continueTrialHint:{color:colors.textMuted,fontSize:10,lineHeight:15,textAlign:'center'},
  demoButton:{minHeight:38,alignItems:'center',justifyContent:'center'},
  demoButtonText:{color:colors.textMuted,fontSize:11,fontWeight:'700'},
  legal:{marginTop:spacing.sm,fontSize:11,color:colors.textMuted,textAlign:'center'},
  legalLink:{color:colors.primaryLight,textDecorationLine:'underline',fontWeight:'700'},
});
