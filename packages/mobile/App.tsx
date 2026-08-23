import './src/polyfills/bindFetch';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import { useUserStore } from './src/store/useUserStore';
import { useSessionStore } from './src/store/useSessionStore';
import { useSessionHistoryStore } from './src/store/useSessionHistoryStore';
import { colors } from './src/theme/colors';
import { supabase, isSupabaseConfigured, ensureGuestSession } from './src/services/supabaseClient';
import { createAuthService } from './src/services/authService';
import { WebAlertHost } from './src/utils/AppAlert';

// __DEV__ uniquement, jamais en build production/TestFlight -- pratique pour
// débugger (console/web) sans dépendre de flux UI natifs (ex. Alert.alert,
// non implémenté par react-native-web).
if (__DEV__) {
  (globalThis as any).__keepStores = { useUserStore, useSessionStore, useSessionHistoryStore };
}

export default function App() {
  const user = useUserStore((s) => s.user);

  // Reflète la session Supabase réelle dans useUserStore dès qu'elle change
  // (connexion, rafraîchissement de jeton, déconnexion). No-op tant que
  // Supabase n'est pas configuré (voir services/supabaseClient.ts).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const authService = createAuthService(supabase);
    const syncFromAuthSession = useUserStore.getState().syncFromAuthSession;

    authService.getCurrentSession().then((session) => {
      syncFromAuthSession(session);
      // Invité automatique et silencieux (cf. demande explicite du
      // 23/08/2026 : "KEEP doit être testable immédiatement sans
      // inscription"). Une session Mode Démo déjà active reste prioritaire
      // (voir syncFromAuthSession) -- ensureGuestSession() ne fait rien si
      // une session (réelle ou déjà invitée) existe déjà.
      if (!session && !useUserStore.getState().isDemoMode) {
        ensureGuestSession();
      }
    });
    const unsubscribe = authService.onSessionChange(syncFromAuthSession);
    return unsubscribe;
  }, []);

  return (
    <>
      {user ? <Navigation /> : <OnboardingScreen />}
      <StatusBar style="light" backgroundColor={colors.background} />
      <WebAlertHost />
    </>
  );
}
