import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import { useUserStore } from './src/store/useUserStore';
import { useSessionStore } from './src/store/useSessionStore';
import { useSessionHistoryStore } from './src/store/useSessionHistoryStore';
import { colors } from './src/theme/colors';
import { supabase, isSupabaseConfigured } from './src/services/supabaseClient';
import { createAuthService, KeepAuthSession } from './src/services/authService';
import { createProfileService } from './src/services/profileService';

// __DEV__ uniquement, jamais en build production/TestFlight -- pratique pour
// débugger (console/web) sans dépendre de flux UI natifs.
if (__DEV__) {
  (globalThis as any).__keepStores = { useUserStore, useSessionStore, useSessionHistoryStore };
}

export default function App() {
  const user = useUserStore((s) => s.user);

  // La preview web publique sert de showroom/test humain du nouveau design.
  // Elle entre automatiquement en Mode Démo afin que l'URL ouvre directement
  // l'application. Cette variable n'est PAS activée dans les builds natifs,
  // TestFlight ou production : l'authentification normale y reste inchangée.
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_KEEP_PREVIEW !== '1') return;
    const state = useUserStore.getState();
    if (!state.user) state.enterDemoMode();
  }, []);

  // Une session Supabase réelle charge maintenant le vrai profil KEEP
  // (profiles + social_links + profile_private_info + compteurs follows).
  // Les changements du store sont ensuite persistés avec un petit debounce :
  // l'ancien ProfileScreen peut donc rester l'écran de réglages sans perdre
  // les fonctions déjà construites, tout en écrivant réellement en base.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const authService = createAuthService(supabase);
    const profileService = createProfileService(supabase);
    let profileLoadedFor: string | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSession = async (session: KeepAuthSession | null) => {
      if (!session) {
        profileLoadedFor = null;
        // Dans la preview publique on conserve le Mode Démo au lieu de
        // retourner à l'onboarding quand aucune session Supabase n'existe.
        if (process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1') {
          const state = useUserStore.getState();
          if (!state.user) state.enterDemoMode();
          return;
        }
        useUserStore.getState().syncFromAuthSession(null);
        return;
      }

      // Donne immédiatement une identité minimale pendant le chargement.
      useUserStore.getState().syncFromAuthSession(session);

      try {
        const profile = await profileService.loadOrCreateOwnProfile(session);
        profileLoadedFor = session.userId;
        useUserStore.getState().setUser(profile);
      } catch (error) {
        // L'auth reste utilisable même si la lecture du profil échoue : on
        // conserve l'identité minimale et on rend l'erreur visible en dev.
        if (__DEV__) console.error('[KEEP] profile load failed', error);
      }
    };

    void authService.getCurrentSession().then(handleSession);
    const unsubscribeAuth = authService.onSessionChange((session) => {
      void handleSession(session);
    });

    const unsubscribeStore = useUserStore.subscribe((state, previousState) => {
      if (!state.user || state.isDemoMode || state.user.id !== profileLoadedFor) return;
      if (state.user === previousState.user) return;

      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const current = useUserStore.getState();
        if (!current.user || current.isDemoMode || current.user.id !== profileLoadedFor) return;
        void profileService.saveOwnProfile(current.user).catch((error) => {
          if (__DEV__) console.error('[KEEP] profile save failed', error);
        });
      }, 450);
    });

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      unsubscribeStore();
      unsubscribeAuth();
    };
  }, []);

  return (
    <>
      {user ? <Navigation /> : <OnboardingScreen />}
      <StatusBar style="light" backgroundColor={colors.background} />
    </>
  );
}
