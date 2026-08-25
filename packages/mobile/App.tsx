import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
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
import { registerForPushNotifications } from './src/services/pushNotificationService';

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

  // Garde-fou si le store est réinitialisé pendant une preview web.
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_KEEP_PREVIEW !== '1') return;
    const state = useUserStore.getState();
    if (!state.user) state.enterDemoMode();
  }, []);

  // Si le profil réel n'a pas encore de ville/pays, KEEP utilise la
  // localisation du téléphone pour les préremplir automatiquement. La mise à
  // jour passe par le store puis par saveOwnProfile ci-dessous : elle est donc
  // persistée dans Supabase et ne disparaît pas lors d'une mise à jour.
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
        // Fire-and-forget -- un compte réel (jamais un invité, "suivre" un
        // invité n'a pas de sens) enregistre son token push si l'OS l'autorise.
        // Ne bloque jamais le chargement du profil, ne relance jamais si ça échoue.
        if (!session.isAnonymous) {
          registerForPushNotifications().catch(() => {});
        }
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

  // REVERT le 26/08/2026 : un essai de colonne centrée largeur-téléphone pour
  // le web (maxWidth 480) a été ajouté ici puis retiré dans la même session --
  // vérifié à 1440x840 AVANT cet essai, le rendu plein largeur était déjà
  // correct (barre du bas, boutons, proportions -- capture d'écran réelle à
  // l'appui). La fenêtre réelle d'Adel étant déjà réduite à la moitié de son
  // écran, ajouter un deuxième rétrécissement par-dessus produisait un rendu
  // encore plus étroit ("coupures en deux, je vois la moitié") -- pire, pas
  // mieux. Jamais de changement de layout web non demandé et non vérifié en
  // conditions réelles.
  return (
    <>
      {user ? <Navigation /> : <OnboardingScreen />}
      <StatusBar style="light" backgroundColor={colors.background} />
    </>
  );
}
