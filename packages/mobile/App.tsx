import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import GlobalNotificationBanner from './src/components/GlobalNotificationBanner';
import PushRegistrationLifecycle from './src/components/PushRegistrationLifecycle';
import { RootChatDock } from './src/components/ChatDockHost';
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
  const [authRecoveryVisible, setAuthRecoveryVisible] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const manualAuthExitRef = useRef(false);

  useEffect(() => {
    if (authReady) {
      setAuthRecoveryVisible(false);
      return;
    }
    const timer = setTimeout(() => setAuthRecoveryVisible(true), 8000);
    return () => clearTimeout(timer);
  }, [authReady]);

  const retryAuthRecovery = () => {
    manualAuthExitRef.current = false;
    setAuthRecoveryVisible(false);
    setAuthReady(false);
    setAuthRetryKey((value) => value + 1);
  };

  const leaveAuthRecovery = () => {
    manualAuthExitRef.current = true;
    setAuthRecoveryVisible(false);
    useUserStore.getState().logout();
    void clearLocalGuestMarker().catch(() => {});
    setAuthReady(true);

    if (!supabase) {
      manualAuthExitRef.current = false;
      return;
    }

    void createAuthService(supabase).signOut()
      .catch(() => {})
      .finally(() => {
        manualAuthExitRef.current = false;
        setAuthRetryKey((value) => value + 1);
      });
  };

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
    let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let profileRetryAttempt = 0;
    let pendingProfileSession: KeepAuthSession | null = null;
    let applyingRemoteProfile = false;
    let initialBootstrapSettled = false;

    const handleSession = async (session: KeepAuthSession | null): Promise<boolean> => {
      if (manualAuthExitRef.current && session) return false;
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

        }

        // Un profil réellement lu depuis Supabase peut monter immédiatement.
        // On évite toute auto-sauvegarde pendant cette hydratation distante.
        if (manualAuthExitRef.current) return false;
        applyingRemoteProfile = true;
        useUserStore.getState().setUser(profile);
        applyingRemoteProfile = false;
        profileLoadedFor = session.userId;

        // Les données secondaires n'empêchent jamais d'entrer dans l'app.
        void profileService.loadOwnProfileExtras(session)
          .then((extras) => {
            if (!active || useUserStore.getState().user?.id !== session.userId) return;
            applyingRemoteProfile = true;
            useUserStore.getState().updateUser(extras);
            applyingRemoteProfile = false;
          })
          .catch((error) => {
            if (__DEV__) console.warn('[KEEP] profile extras unavailable', error);
          });

        if (!session.isAnonymous) {
          void (async () => {
            // Le vrai profil est déjà visible. Crédits, historique et cadenas
            // se resynchronisent ensuite sans bloquer la reconnaissance du compte.
            await importStagedGuestCreditsForAuthenticatedAccount().catch(() => null);
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

    const cancelProfileRetry = () => {
      if (profileRetryTimer) clearTimeout(profileRetryTimer);
      profileRetryTimer = null;
    };

    const scheduleProfileRetry = (session: KeepAuthSession) => {
      if (!active || profileRetryTimer) return;
      pendingProfileSession = session;
      const delay = Math.min(5000, 700 * (2 ** Math.min(profileRetryAttempt, 3)));
      profileRetryAttempt += 1;
      profileRetryTimer = setTimeout(() => {
        profileRetryTimer = null;
        const retrySession = pendingProfileSession;
        if (!active || !retrySession) return;
        void handleSessionOnce(retrySession)
          .then((hydrated) => {
            if (!active) return;
            if (hydrated) {
              pendingProfileSession = null;
              profileRetryAttempt = 0;
              initialBootstrapSettled = true;
              setAuthReady(true);
              return;
            }
            scheduleProfileRetry(retrySession);
          })
          .catch(() => scheduleProfileRetry(retrySession));
      }, delay);
    };

    const finishInitialBootstrap = async (session: KeepAuthSession | null) => {
      // Une session Supabase réellement restaurée suffit pour conserver le shell
      // du MÊME compte déjà présent localement pendant que le profil distant se
      // réhydrate. Le cache n'authentifie jamais l'utilisateur : il n'est utilisé
      // qu'après confirmation de la vraie session Supabase.
      const currentUser = useUserStore.getState().user;
      if (active && session && currentUser?.id === session.userId) {
        setAuthReady(true);
      }

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
      // Un null transitoire pendant la restauration ne doit jamais effacer le compte.
      if (!initialBootstrapSettled && !session) return;

      if (!session) {
        pendingProfileSession = null;
        profileRetryAttempt = 0;
        cancelProfileRetry();
        void handleSessionOnce(null).then((hydrated) => {
          if (!active) return;
          if (hydrated) {
            initialBootstrapSettled = true;
            setAuthReady(true);
          }
        }).catch(() => {});
        return;
      }

      // Mot de passe/session acceptés : une panne temporaire de profiles ne doit
      // jamais masquer de nouveau un compte déjà affiché. Pour un changement
      // réel de compte on attend le nouveau profil ; pour le même compte on garde
      // Navigation visible et on réhydrate en arrière-plan.
      pendingProfileSession = session;
      const currentUserId = useUserStore.getState().user?.id ?? null;
      const sameAuthenticatedAccount = currentUserId === session.userId;
      if (!sameAuthenticatedAccount) setAuthReady(false);

      void handleSessionOnce(session).then((hydrated) => {
        if (!active) return;
        if (hydrated) {
          pendingProfileSession = null;
          profileRetryAttempt = 0;
          cancelProfileRetry();
          initialBootstrapSettled = true;
          setAuthReady(true);
          return;
        }
        scheduleProfileRetry(session);
      }).catch(() => {
        if (active) scheduleProfileRetry(session);
      });
    });

    const unsubscribeStore = useUserStore.subscribe((state, previousState) => {
      if (applyingRemoteProfile) return;
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
      if (profileRetryTimer) clearTimeout(profileRetryTimer);
      unsubscribeStore();
      unsubscribeAuth();
    };
  }, [authRetryKey]);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {authReady ? (user ? <Navigation /> : <OnboardingScreen />) : (
        <View
          testID="auth-bootstrap-recovery"
          accessibilityLabel="Connexion Loki Music en cours"
          style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}
        >
          <ActivityIndicator size="large" color={colors.primaryLight} />
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 18 }}>Loki Music</Text>
          <Text style={{ color: colors.textMutedGrey, fontSize: 14, textAlign: 'center', marginTop: 8 }}>
            {authRecoveryVisible ? 'Le service met plus de temps que prévu.' : 'Connexion à ton compte…'}
          </Text>

          {authRecoveryVisible ? (
            <View style={{ width: '100%', maxWidth: 320, marginTop: 18, gap: 10 }}>
              <TouchableOpacity
                testID="auth-recovery-retry"
                accessibilityRole="button"
                accessibilityLabel="Réessayer la connexion Loki Music"
                onPress={retryAuthRecovery}
                style={{
                  minHeight: 46,
                  borderRadius: 23,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 18,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>RÉESSAYER</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="auth-recovery-change-account"
                accessibilityRole="button"
                accessibilityLabel="Changer de compte Loki Music"
                onPress={leaveAuthRecovery}
                style={{
                  minHeight: 46,
                  borderRadius: 23,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.backgroundCard,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 18,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '900' }}>CHANGER DE COMPTE</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
      {authReady && user ? <PushRegistrationLifecycle /> : null}
      {authReady && user ? <GlobalNotificationBanner /> : null}
      {authReady && user ? <RootChatDock /> : null}
      <AppUpdateBanner authReady={authReady} />
      <AlertHost />
      <AccountGateModal />
      <StatusBar style="light" backgroundColor={colors.background} />
    </SafeAreaProvider>
  );
}
