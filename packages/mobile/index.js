import React from 'react';
import { registerRootComponent } from 'expo';
import { ShareIntentProvider } from 'expo-share-intent';
import { View } from 'react-native';
import App from './App';
import MandatoryProfileRequirementsGate from './src/components/MandatoryProfileRequirementsGate';
import SharedMusicHandoff from './src/components/SharedMusicHandoff';
import BackgroundListeningLifecycle from './src/components/BackgroundListeningLifecycle';
import AuthEmailLinkLifecycle from './src/components/AuthEmailLinkLifecycle';
import PushRegistrationLifecycle from './src/components/PushRegistrationLifecycle';
import { useUserStore } from './src/store/useUserStore';
import { isSupabaseConfigured, supabase } from './src/services/supabaseClient';
import { colors } from './src/theme/colors';


// Samsung Internet / Chrome Android changent la hauteur du viewport lorsque
// la barre du navigateur apparaît/disparaît pendant un swipe. Sans ce verrou,
// la racine React Native Web peut devenir plus haute que la zone visible et la
// barre KEEP des 5 onglets se retrouve sous le viewport. On ne touche ni à
// Navigation.tsx ni au design : on stabilise seulement le conteneur web.
if (typeof document !== 'undefined') {
  const styleId = 'keep-mobile-viewport-lock';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html, body, #root { margin:0; width:100%; min-height:100%; background:#0B0A12; }
      html, body { overscroll-behavior:none; }
      @media (max-width: 899px) {
        html, body { height:100%; overflow:hidden; }
        #root { position:fixed; inset:0; height:100dvh; min-height:100dvh; max-height:100dvh; overflow:hidden; }
        @supports not (height: 100dvh) { #root { height:100vh; min-height:100vh; max-height:100vh; } }
      }
      @media (min-width: 900px) {
        html, body { height:100%; min-height:100%; overflow:hidden; }
        #root { position:relative; inset:auto; width:100%; height:100dvh; min-height:100vh; max-height:100dvh; overflow:hidden; }
        @supports not (height: 100dvh) { #root { height:100vh; max-height:100vh; } }
      }
    `;
    document.head.appendChild(style);
  }
  const syncViewport = () => {
    const h = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--keep-visible-height', `${Math.round(h)}px`);
  };
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });

  // Adel (02/09/2026) : "il y a un problème de zoom ... il faudrait bloquer
  // le système qui ne puisse pas zoomer" -- diagnostic revu : ce qui
  // ressemblait à un texte "coupé" après un rafraîchissement sur iPhone
  // était en fait la page chargée déjà zoomée (iOS Safari peut restaurer un
  // niveau de zoom précédent au reload), pas un souci de mise en page.
  // La balise viewport par défaut d'Expo (initial-scale=1) n'empêche pas ce
  // zoom résiduel ni le pincement manuel qui a pu le déclencher au départ.
  // On verrouille le zoom explicitement : plus aucun niveau de zoom à
  // restaurer, jamais.
  let viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) {
    viewportMeta = document.createElement('meta');
    viewportMeta.setAttribute('name', 'viewport');
    document.head.appendChild(viewportMeta);
  }
  viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover');
}


// Bouclier DOM immédiat : il est créé avant le premier rendu React pour que
// le navigateur ne puisse jamais montrer l'ancien Onboarding ("Loki Music")
// sous l'écran courant pendant la restauration de session après un refresh.
if (typeof document !== 'undefined' && process.env.EXPO_PUBLIC_KEEP_PREVIEW !== '1') {
  const mountShield = () => {
    if (document.getElementById('keep-web-refresh-shield')) return;
    const shield = document.createElement('div');
    shield.id = 'keep-web-refresh-shield';
    shield.setAttribute('aria-hidden', 'true');
    shield.style.position = 'fixed';
    shield.style.inset = '0';
    shield.style.zIndex = '2147483647';
    shield.style.background = '#0B0A12';
    shield.style.pointerEvents = 'auto';
    (document.body || document.documentElement).appendChild(shield);
  };
  if (document.body) mountShield();
  else document.addEventListener('DOMContentLoaded', mountShield, { once: true });
}

// Un refresh web ne doit jamais révéler un second écran sous la page courante.
// Avant ce garde, App démarrait avec user=null pendant la lecture de la session
// Supabase : l'Onboarding pouvait donc être monté quelques millisecondes derrière
// Écouter/Profil/Playlists. Sur une transition ou un viewport desktop plus large,
// on percevait ce "deuxième design". Le garde ne change aucun écran : il conserve
// simplement le fond Loki unique jusqu'à ce que l'identité web soit résolue.
function WebRefreshSurfaceGuard() {
  const user = useUserStore((state) => state.user);
  const [waitingForSessionUser, setWaitingForSessionUser] = React.useState(false);
  const [ready, setReady] = React.useState(typeof document === 'undefined');

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      setReady(true);
      return undefined;
    }
    if (process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1') {
      setReady(true);
      return undefined;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has('__keep_auth') || params.has('__keep_follow')) {
      setReady(true);
      return undefined;
    }

    let live = true;
    let settleTimer;
    const hardStop = window.setTimeout(() => {
      if (live) setReady(true);
    }, 2500);

    if (!isSupabaseConfigured || !supabase) {
      settleTimer = window.setTimeout(() => { if (live) setReady(true); }, 250);
      return () => {
        live = false;
        window.clearTimeout(hardStop);
        if (settleTimer) window.clearTimeout(settleTimer);
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      if (data.session) {
        setWaitingForSessionUser(true);
        if (useUserStore.getState().user) setReady(true);
        return;
      }
      // Sans session Supabase, Onboarding restaure/crée automatiquement l'essai
      // local. Laisser un très court battement évite son flash sans ralentir
      // réellement un premier lancement.
      settleTimer = window.setTimeout(() => { if (live) setReady(true); }, 250);
    }).catch(() => {
      if (live) setReady(true);
    });

    return () => {
      live = false;
      window.clearTimeout(hardStop);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, []);

  React.useEffect(() => {
    if (waitingForSessionUser && user) setReady(true);
  }, [waitingForSessionUser, user]);

  React.useEffect(() => {
    if (!ready || typeof document === 'undefined') return;
    document.getElementById('keep-web-refresh-shield')?.remove();
  }, [ready]);

  if (typeof document === 'undefined' || ready) return null;
  return React.createElement(View, {
    pointerEvents: 'auto',
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      zIndex: 999999,
      backgroundColor: colors.background,
    },
  });
}

function KeepRoot() {
  return React.createElement(
    ShareIntentProvider,
    null,
    React.createElement(
      MandatoryProfileRequirementsGate,
      null,
      React.createElement(React.Fragment, null,
        React.createElement(SharedMusicHandoff),
        React.createElement(BackgroundListeningLifecycle),
        React.createElement(AuthEmailLinkLifecycle),
        React.createElement(PushRegistrationLifecycle),
        React.createElement(App),
        React.createElement(WebRefreshSurfaceGuard),
      ),
    ),
  );
}

// Les wrappers fonctionnels natifs restent volontairement placés ici :
// App.tsx, son responsive, Navigation.tsx et la barre des 5 onglets ne sont
// pas modifiés. Les exigences définies par le Super Admin, le cycle natif
// d'écoute, les liens d'auth e-mail et l'enregistrement push sont ainsi
// appliqués au vrai utilisateur sans créer une navigation parallèle ni
// modifier le design validé.
registerRootComponent(KeepRoot);
