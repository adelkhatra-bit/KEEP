import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import GlobalNotificationBanner from './src/components/GlobalNotificationBanner';
import AlertHost from './src/components/AlertHost';
import { useUserStore } from './src/store/useUserStore';
import { useSessionStore } from './src/store/useSessionStore';
import { useSessionHistoryStore } from './src/store/useSessionHistoryStore';
import { useBattleAvailabilityStore } from './src/store/useBattleAvailabilityStore';
import { colors } from './src/theme/colors';
import { supabase, isSupabaseConfigured } from './src/services/supabaseClient';
import { createAuthService, KeepAuthSession } from './src/services/authService';
import { createProfileService } from './src/services/profileService';
import { importStagedGuestCreditsForAuthenticatedAccount } from './src/services/creditService';
import { registerForPushNotifications } from './src/services/pushNotificationService';
import {
  clearLocalGuestMarker,
  clearStagedGuestProfile,
  loadStagedGuestProfile,
  mergeStagedGuestProfile,
} from './src/services/guestUpgradeService';

// __DEV__ uniquement, jamais en build production/TestFlight -- pratique pour
// débugger (console/web) sans dépendre de flux UI natifs.
if (__DEV__) {
  (globalThis as any).__keepStores = { useUserStore, useSessionStore, useSessionHistoryStore };
}

// La preview/showroom doit être utilisable dès le PREMIER rendu. L'ancienne
// activation dans useEffect laissait brièvement l'onboarding à l'écran et
// rendait les tests navigateur non déterministes. Cette variable n'est jamais
// activée dans les builds natifs réels/TestFlight.
if (process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1' && !useUserStore.getState().user) {
  useUserStore.getState().enterDemoMode();
}

export default function App() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const updateUser = useUserStore((s) => s.updateUser);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_KEEP_PREVIEW !== '1') return;
    const state = useUserStore.getState();
    if (!state.user) state.enterDemoMode();
  }, []);

  useEffect(() => {
    if (!user || isDemoMode || (user.city && user.countryCode)) return;
    let cancelled = false;

    const autoFillLocation = async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted' && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (cancelled || permission.status !== 'granted') return;

        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const places = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (cancelled || !places[0]) return;

        const place = places[0];
        const city = place.city || place.subregion || place.region || user.city;
        const countryCode = place.isoCountryCode?.toUpperCase() || user.countryCode;
        if (city !== user.city || countryCode !== user.countryCode) {
          updateUser({ city: city || undefined, countryCode: countryCode || undefined, locationOptIn: true });
        }
      } catch (error) {
        if (__DEV__) console.warn('[KEEP] automatic location unavailable', error);
      }
    };

    void autoFillLocation();
    return () => { cancelled = true; };
  }, [isDemoMode, updateUser, user?.city, user?.countryCode, user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const authService = createAuthService(supabase);
    const profileService = createProfileService(supabase);
    let profileLoadedFor: string | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSession = async (session: KeepAuthSession | null) => {
      if (!session) {
        profileLoadedFor = null;
        useBattleAvailabilityStore.getState().reset();
        if (process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1') {
          const state = useUserStore.getState();
          if (!state.user) state.enterDemoMode();
          return;
        }
        useUserStore.getState().syncFromAuthSession(null);
        return;
      }

      useUserStore.getState().syncFromAuthSession(session);

      try {
        let profile = await profileService.loadOrCreateOwnProfile(session);

        if (!session.isAnonymous) {
          const staged = await loadStagedGuestProfile();
          if (staged) {
            const merged = mergeStagedGuestProfile(profile, staged);
            try {
              await profileService.saveOwnProfile(merged);
              profile = merged;
              await clearStagedGuestProfile();
            } catch (upgradeError) {
              if (merged.username !== profile.username) {
                const withoutConflictingUsername = { ...merged, username: profile.username };
                await profileService.saveOwnProfile(withoutConflictingUsername);
                profile = withoutConflictingUsername;
                await clearStagedGuestProfile();
              } else {
                throw upgradeError;
              }
            }
          }

          // Même si le lien de confirmation e-mail ouvre directement KEEP et
          // crée la session sans repasser par le formulaire, on conserve le
          // compteur de l'essai local. Exemple : 3 essais consommés + 20 bonus
          // = 20 crédits restants, et les cadenas des morceaux en attente sont
          // retirés automatiquement sans les valider à la place de l'utilisateur.
          await importStagedGuestCreditsForAuthenticatedAccount().catch(() => null);
          await useSessionHistoryStore.getState().syncUnsyncedKeeps();
          await useSessionHistoryStore.getState().refreshCreditLocks().catch(() => {});
          await clearLocalGuestMarker();
        }

        profileLoadedFor = session.userId;
        useUserStore.getState().setUser(profile);
        void useBattleAvailabilityStore.getState().syncFromServer();
        if (!session.isAnonymous) {
          registerForPushNotifications().catch(() => {});
        }
      } catch (error) {
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
      {user ? <GlobalNotificationBanner /> : null}
      <AlertHost />
      <StatusBar style="light" backgroundColor={colors.background} />
    </>
  );
}
