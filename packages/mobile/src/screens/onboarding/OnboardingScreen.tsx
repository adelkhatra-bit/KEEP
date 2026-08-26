import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import UsernameAccountForm, { UsernameAccountMode } from '../../components/UsernameAccountForm';
import { loadStagedGuestProfile, mergeStagedGuestProfile } from '../../services/guestUpgradeService';
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

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const enterGuestMode = useUserStore((s) => s.enterGuestMode);
  const [intent] = useState<WebIntent>(() => readWebIntent());
  const [accountOpen, setAccountOpen] = useState(Boolean(intent.mode || intent.followUsername));
  const [accountMode, setAccountMode] = useState<UsernameAccountMode>(intent.mode || 'create');
  const [busy, setBusy] = useState(false);

  const restoreGuest = async (guestId: string) => {
    enterGuestMode(guestId);
    const staged = await loadStagedGuestProfile();
    const current = useUserStore.getState().user;
    if (staged && current) useUserStore.getState().setUser(mergeStagedGuestProfile(current, staged));
  };

  // L'essai est local et ne crée aucun utilisateur Supabase. Une intention
  // explicite de création/connexion (ex. + Suivre depuis un profil partagé)
  // doit avoir priorité et ne peut pas être écrasée par un ancien essai local.
  // Le profil préparé pendant l'essai est rechargé sur le même appareil : un
  // refresh navigateur ne doit jamais effacer pseudo, bio, ville ou réseaux.
  useEffect(() => {
    if (accountOpen || intent.followUsername) return;
    let active = true;
    void AsyncStorage.getItem(LOCAL_GUEST_ID_KEY)
      .then(async (guestId) => {
        if (!active || !guestId || useUserStore.getState().user) return;
        await restoreGuest(guestId);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [accountOpen, enterGuestMode, intent.followUsername]);

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

  const closeAccount = () => {
    clearWebIntent();
    setAccountOpen(false);
  };

  const continueWithoutSignup = async () => {
    clearWebIntent();
    await handleGuestPress();
  };

  const showDemo = __DEV__ || process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1';

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
              onSuccess={closeAccount}
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
            <Text style={styles.continueTrialHint}>Tu peux revenir à l’essai gratuit maintenant et créer ton compte KEEP plus tard.</Text>
            <Text style={styles.legal}>{t('onboarding.legalNotice')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

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

        <TouchableOpacity style={[styles.button, styles.accountButton]} onPress={() => { setAccountMode('create'); setAccountOpen(true); }} disabled={busy}>
          <Text style={styles.accountButtonText}>SE CONNECTER / CRÉER MON COMPTE</Text>
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
});
