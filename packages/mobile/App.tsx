import './src/polyfills/bindFetch';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import './src/i18n';
import Navigation from './src/navigation/Navigation';
import OnboardingScreen from './src/screens/onboarding/OnboardingScreen';
import { useUserStore } from './src/store/useUserStore';
import { useSessionStore } from './src/store/useSessionStore';
import { useSessionHistoryStore } from './src/store/useSessionHistoryStore';
import { colors } from './src/theme/colors';
import { supabase, isSupabaseConfigured } from './src/services/supabaseClient';
import { createAuthService } from './src/services/authService';
import { WebAlertHost } from './src/utils/AppAlert';

// __DEV__ uniquement, jamais en build production/TestFlight -- pratique pour
// débugger (console/web) sans dépendre de flux UI natifs (ex. Alert.alert,
// non implémenté par react-native-web).
if (__DEV__) {
  (globalThis as any).__keepStores = { useUserStore, useSessionStore, useSessionHistoryStore };
}

const OnboardingStack = createNativeStackNavigator();

/**
 * BUG RÉEL P0 corrigé le 24/08/2026 (trouvé par l'agent Playwright dédié --
 * "8/8 tests échouent, page blanche systématique, chaque chargement, pas
 * seulement les nouveaux utilisateurs") : `<OnboardingScreen />` était rendu
 * directement ici, HORS de tout `NavigationContainer`, dès que `user` est
 * falsy -- ce qui est le cas au tout premier rendu, TOUJOURS (la lecture
 * AsyncStorage est asynchrone, `user` démarre à `null` même pour un invité
 * déjà connu). `OnboardingScreen.tsx` appelle `useFocusEffect` (ajouté le
 * même jour pour corriger un autre bug -- l'état qui restait affiché après
 * réouverture de la modale CreateAccount) : ce hook exige un
 * `NavigationContainer`, absent ici -- exception non attrapée, écran blanc
 * permanent, sur CHAQUE chargement, pas juste au premier lancement.
 *
 * Fix = pattern officiel React Navigation "auth flow" (deux arbres
 * NavigationContainer distincts, jamais imbriqués, choisis par rendu
 * conditionnel) -- jamais rendre un composant qui utilise les hooks de
 * navigation sans un vrai conteneur autour, même pour un cas "avant
 * connexion".
 */
function OnboardingGate() {
  return (
    <NavigationContainer>
      <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
        <OnboardingStack.Screen name="Onboarding" component={OnboardingScreen} />
      </OnboardingStack.Navigator>
    </NavigationContainer>
  );
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
    // Cf. demande explicite du 24/08/2026 -- "profil → Supabase →
    // fermeture/réouverture → profil toujours présent" : dès qu'une
    // session réelle est reflétée localement, va chercher le VRAI profil
    // serveur pour que rien ne dépende plus uniquement du stockage local
    // de cet appareil/onglet (voir useUserStore.hydrateFromServer).
    const syncAndHydrate = (session: Parameters<typeof syncFromAuthSession>[0]) => {
      syncFromAuthSession(session);
      if (session) {
        // .catch() explicite -- une hydratation fire-and-forget qui rejette
        // sans être attrapée nulle part est une rejection non gérée ; jamais
        // laisser un souci réseau/donnée dégrader l'app au-delà d'un simple
        // log (cf. bug réel du 24/08/2026, page blanche signalée juste après
        // l'ajout du hydrate de useSessionHistoryStore).
        useUserStore.getState().hydrateFromServer().catch((e: any) => console.warn('[KEEP][hydrate] useUserStore:', e?.message));
        // Cf. bug réel du 24/08/2026 -- "que son album reste préenregistré" :
        // même logique que le profil, les KEEP réels doivent survenir même
        // sur un appareil/stockage neuf, pas seulement depuis l'AsyncStorage
        // locale (voir useSessionHistoryStore.hydrateFromServer).
        useSessionHistoryStore.getState().hydrateFromServer().catch((e: any) => console.warn('[KEEP][hydrate] useSessionHistoryStore:', e?.message));
      }
    };

    authService.getCurrentSession().then((session) => {
      syncAndHydrate(session);
      // BUG RÉEL corrigé le 24/08/2026 : un invité automatique et silencieux
      // au chargement empêchait l'écran d'entrée redessiné de jamais
      // s'afficher (la session invité se créait avant que l'écran n'ait le
      // temps de se rendre, basculant immédiatement vers l'app principale --
      // exactement l'inverse de "je veux un écran d'entrée clair avec des
      // choix explicites"). La session invité se crée maintenant uniquement
      // sur action explicite ("Essayer sans compte", voir OnboardingScreen)
      // ou paresseusement au premier vrai tick (garde-fou déjà en place
      // dans useSessionStore.ts) -- jamais plus en arrière-plan au chargement.
    });
    const unsubscribe = authService.onSessionChange(syncAndHydrate);
    return unsubscribe;
  }, []);

  return (
    <>
      {user ? <Navigation /> : <OnboardingGate />}
      <StatusBar style="light" backgroundColor={colors.background} />
      <WebAlertHost />
    </>
  );
}
