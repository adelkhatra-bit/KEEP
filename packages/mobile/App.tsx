import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import GlobalNotificationBanner from './src/components/GlobalNotificationBanner';
import GlobalChatDock from './src/components/GlobalChatDock';
import AppUpdateBanner from './src/components/AppUpdateBanner';
import AlertHost from './src/components/AlertHost';
import AccountGateModal from './src/components/AccountGateModal';
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
import { syncCurrentEntitlements } from './src/services/iapService';
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
  const [authReady, setAuthReady] = useState(() => process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1' || !isSupabaseConfigured || !supabase);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_KEEP_PREVIEW !== '1') return;
    const state = useUserStore.getState();
    if (!state.user) state.enterDemoMode();
  }, []);

  // Adel (02/09/2026) : "quand je réfraîchis ... faut que je le remette avec
  // mes doigts" -- sur iPhone Safari uniquement (jamais reproduit sur
  // Chromium desktop/mobile, testé en direct), un rafraîchissement pouvait
  // laisser la page avec un décalage de défilement horizontal résiduel
  // (l'historique du navigateur tente de restaurer une position de scroll
  // après reload ; iOS Safari peut aussi garder un léger rebond horizontal
  // d'un précédent overscroll). Le texte semblait alors "coupé" à droite
  // jusqu'à ce qu'un geste tactile force Safari à recalculer -- exactement
  // ce que l'utilisateur décrit. Ce correctif désactive la restauration
  // automatique de scroll du navigateur et force explicitement la page à
  // x=0 dès le montage, sans toucher au Design d'aucun écran.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
      window.scrollTo(0, window.scrollY);
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';
    } catch {
      // Le navigateur peut refuser certains réglages (mode privé, etc.) :
      // l'app reste utilisable, seul ce filet de sécurité est perdu.
    }
  }, []);

  useEffect(() => {
    if (!authReady || !user || isDemoMode || (user.city && user.countryCode)) return;
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
  }, [authReady, isDemoMode, updateUser, user?.city, user?.countryCode, user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthReady(true);
      return;
    }

    let active = true;
    const authService = createAuthService(supabase);
    const profileService = createProfileService(supabase);
    let profileLoadedFor: string | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlightSessionKey: string | null = null;
    let inFlightSessionPromise: Promise<boolean> | null = null;
    let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let bootstrapRetryAttempt = 0;
    let initialBootstrapSettled = false;

    const handleSession = async (session: KeepAuthSession | null): Promise<boolean> => {
      if (!session) {
        profileLoadedFor = null;
        useBattleAvailabilityStore.getState().reset();
        if (process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1') {
          const state = useUserStore.getState();
          if (!state.user) state.enterDemoMode();
          return;
        }
        useUserStore.getState().syncFromAuthSession(null);
        return true;
      }

      if (profileLoadedFor === session.userId && useUserStore.getState().user?.id === session.userId) {
        return true;
      }

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
        }

        profileLoadedFor = session.userId;
        useUserStore.getState().setUser(profile);

        if (!session.isAnonymous) {
          void (async () => {
            await useSessionHistoryStore.getState().syncUnsyncedKeeps();
            await useSessionHistoryStore.getState().refreshCreditLocks().catch(() => {});
            await clearLocalGuestMarker();
          })().catch((error) => {
            if (__DEV__) console.warn('[KEEP] post-auth sync unavailable', error);
          });
        }
        if (!session.isAnonymous) {
          void syncCurrentEntitlements().catch((error) => {
            if (__DEV__) console.warn('[KEEP] StoreKit entitlement sync unavailable', error);
          });
        }
        void useBattleAvailabilityStore.getState().syncFromServer();
        if (!session.isAnonymous) {
          registerForPushNotifications().catch(() => {});
        }
        return true;
      } catch (error) {
        if (__DEV__) console.error('[KEEP] profile load failed', error);
        return false;
      }
    };

    const handleSessionOnce = (session: KeepAuthSession | null): Promise<boolean> => {
      const key = session ? `${session.userId}:${session.isAnonymous ? 'anonymous' : 'account'}` : 'signed-out';
      if (inFlightSessionPromise && inFlightSessionKey === key) return inFlightSessionPromise;
      const promise = handleSession(session).finally(() => {
        if (inFlightSessionPromise === promise) {
          inFlightSessionPromise = null;
          inFlightSessionKey = null;
        }
      });
      inFlightSessionKey = key;
      inFlightSessionPromise = promise;
      return promise;
    };

    const finishInitialBootstrap = async (session: KeepAuthSession | null) => {
      const hydrated = await handleSessionOnce(session);
      if (active && hydrated) {
        initialBootstrapSettled = true;
        bootstrapRetryAttempt = 0;
        if (bootstrapRetryTimer) {
          clearTimeout(bootstrapRetryTimer);
          bootstrapRetryTimer = null;
        }
        setAuthReady(true);
      }
      return hydrated;
    };

    // Incident 02/10/2026 : lors d'un pic Supabase, /auth/v1/user et plusieurs
    // RPC ont renvoyé 500/504 pendant un refresh web. L'ancien bootstrap faisait
    // seulement UNE relance puis laissait authReady=false pour toujours : écran
    // noir vide. On ne monte toujours JAMAIS Navigation avec un faux profil :
    // on garde l'écran de récupération visible et on retente silencieusement
    // jusqu'à ce que la vraie session + le vrai profil Supabase soient hydratés.
    const scheduleBootstrapRetry = () => {
      if (!active || initialBootstrapSettled || bootstrapRetryTimer) return;
      const delay = Math.min(5000, 600 * (2 ** Math.min(bootstrapRetryAttempt, 3)));
      bootstrapRetryAttempt += 1;
      bootstrapRetryTimer = setTimeout(() => {
        bootstrapRetryTimer = null;
        if (!active || initialBootstrapSettled) return;
        void authService.getCurrentSession()
          .then(async (retrySession) => {
            const hydrated = await finishInitialBootstrap(retrySession);
            if (!hydrated) scheduleBootstrapRetry();
          })
          .catch(() => scheduleBootstrapRetry());
      }, delay);
    };

    void authService.getCurrentSession()
      .then(async (session) => {
        const hydrated = await finishInitialBootstrap(session);
        if (!hydrated) scheduleBootstrapRetry();
      })
      .catch(() => scheduleBootstrapRetry());

    const unsubscribeAuth = authService.onSessionChange((session) => {
      // Supabase peut émettre un événement null transitoire pendant sa propre
      // restauration locale. Tant que le bootstrap initial n'a pas tranché,
      // ce null ne doit jamais faire apparaître l'onboarding ni effacer le compte.
      if (!initialBootstrapSettled && !session) return;
      void handleSessionOnce(session).then((hydrated) => {
        if (active && hydrated) {
          initialBootstrapSettled = true;
          setAuthReady(true);
        } else if (active && !initialBootstrapSettled) {
          scheduleBootstrapRetry();
        }
      }).catch(() => {
        if (active && !initialBootstrapSettled) scheduleBootstrapRetry();
      });
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
      active = false;
      if (saveTimer) clearTimeout(saveTimer);
      if (bootstrapRetryTimer) clearTimeout(bootstrapRetryTimer);
      unsubscribeStore();
      unsubscribeAuth();
    };
  }, []);

  return (
    <>
      {authReady ? (user ? <Navigation /> : <OnboardingScreen />) : (
        <View
          testID="auth-bootstrap-recovery"
          accessibilityLabel="Connexion Loki Music en cours"
          style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}
        >
          <ActivityIndicator size="large" color={colors.primaryLight} />
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 18 }}>Loki Music</Text>
          <Text style={{ color: colors.textMutedGrey, fontSize: 14, textAlign: 'center', marginTop: 8 }}>
            Connexion à ton compte…
          </Text>
        </View>
      )}
      {authReady && user ? <GlobalNotificationBanner /> : null}
      {authReady && user ? <GlobalChatDock /> : null}
      <AppUpdateBanner authReady={authReady} />
      <AlertHost />
      <AccountGateModal />
      <StatusBar style="light" backgroundColor={colors.background} />
    </>
  );
}
