import React from 'react';
import { registerRootComponent } from 'expo';
import { ShareIntentProvider } from 'expo-share-intent';
import { Text, TouchableOpacity, View } from 'react-native';
import App from './App';
import MandatoryProfileRequirementsGate from './src/components/MandatoryProfileRequirementsGate';
import SharedMusicHandoff from './src/components/SharedMusicHandoff';
import { RobotSummonWrapper } from './src/components/RobotSummonWrapper';
import BackgroundListeningLifecycle from './src/components/BackgroundListeningLifecycle';
import AuthEmailLinkLifecycle from './src/components/AuthEmailLinkLifecycle';
import PushRegistrationLifecycle from './src/components/PushRegistrationLifecycle';
import ActiveBattleResumeLifecycle from './src/components/ActiveBattleResumeLifecycle';
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
  const readViewport = () => ({
    h: Math.max(1, Math.round(
      window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      1
    )),
    w: Math.max(1, Math.round(
      window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth ||
      1
    )),
  });
  const applyViewport = () => {
    // Chrome desktop can fire resize before the final viewport is settled
    // (notably when DevTools is docked/undocked or the window is maximised).
    // Re-read dimensions on every pass: never reuse the first transient size.
    const { h, w } = readViewport();
    document.documentElement.style.setProperty('--keep-visible-height', `${h}px`);
    document.documentElement.style.setProperty('--keep-visible-width', `${w}px`);
    const root = document.getElementById('root');
    if (!root) return;
    root.style.width = '100%';
    root.style.height = `${h}px`;
    root.style.minHeight = `${h}px`;
    root.style.maxHeight = `${h}px`;
    // iPhone Safari (02/10/2026, « je ne vois plus ce que j'écris ») : à
    // l'ouverture du clavier, Safari fait défiler la page (visualViewport.
    // offsetTop > 0) alors que #root est fixé en haut de la page : toute
    // l'application remontait hors de l'écran, seule la barre d'onglets
    // restait visible, noir dessous. Sur téléphone, #root suit donc la zone
    // réellement visible. Ordinateur (≥ 900 px) : inchangé.
    const offsetTop = window.innerWidth < 900 ? Math.max(0, Math.round(window.visualViewport?.offsetTop || 0)) : 0;
    root.style.top = window.innerWidth < 900 ? `${offsetTop}px` : '';
  };
  let viewportSettleTimers = [];
  const syncViewport = () => {
    applyViewport();
    window.requestAnimationFrame(() => {
      applyViewport();
      window.requestAnimationFrame(applyViewport);
    });
    viewportSettleTimers.forEach((timer) => window.clearTimeout(timer));
    viewportSettleTimers = [80, 220, 500].map((delay) => window.setTimeout(applyViewport, delay));
  };
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncViewport, { passive: true });
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
  window.addEventListener('pageshow', syncViewport, { passive: true });
  window.addEventListener('focus', syncViewport, { passive: true });
  document.addEventListener('fullscreenchange', syncViewport, { passive: true });

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

const ROOT_DIAGNOSTIC_SESSION_PREFIX = 'keep-root-diagnostic:';

function shortDiagnosticText(value, max = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function reportRootDiagnostic(code, error, context = {}) {
  try {
    const profileId = useUserStore.getState().user?.id;
    if (!profileId || !supabase) return;

    // A production client can have millions of sessions. Never flood telemetry:
    // one identical crash signature per browser session is enough to diagnose it.
    const message = shortDiagnosticText(error?.message || error || code, 500);
    const signature = `${code}:${message.slice(0, 120)}`;
    if (typeof sessionStorage !== 'undefined') {
      const storageKey = ROOT_DIAGNOSTIC_SESSION_PREFIX + signature;
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    }

    void supabase.from('client_diagnostics').insert({
      profile_id: profileId,
      area: 'root_runtime',
      code,
      message,
      platform: typeof document === 'undefined' ? 'native' : 'web',
      context: {
        ...context,
        path: typeof location !== 'undefined' ? location.pathname : undefined,
        viewport: typeof window !== 'undefined' ? {
          width: window.innerWidth,
          height: window.innerHeight,
        } : undefined,
      },
    }).then(() => undefined).catch(() => undefined);
  } catch {
    // Diagnostics must never become a second application failure.
  }
}

class RootRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportRootDiagnostic('ROOT_RENDER_CRASH', error, {
      componentStack: shortDiagnosticText(info?.componentStack, 1800),
    });
    if (typeof document !== 'undefined') {
      document.getElementById('keep-web-refresh-shield')?.remove();
    }
  }

  retry = () => {
    this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  reloadLatest = () => {
    if (typeof window === 'undefined') {
      this.retry();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('__keep_recovery', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (!this.state.error) {
      return React.createElement(React.Fragment, { key: this.state.retryKey }, this.props.children);
    }

    return React.createElement(
      View,
      {
        accessibilityRole: 'alert',
        style: {
          flex: 1,
          minHeight: '100%',
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        },
      },
      React.createElement(Text, {
        style: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center' },
      }, 'Loki Music reste disponible'),
      React.createElement(Text, {
        style: { color: '#B8B3C7', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10, maxWidth: 420 },
      }, 'Une erreur d’affichage a été isolée. Tes données restent dans ton compte. Réessaie sans te déconnecter.'),
      React.createElement(
        TouchableOpacity,
        {
          accessibilityRole: 'button',
          accessibilityLabel: 'Réessayer sans se déconnecter',
          onPress: this.retry,
          style: {
            minHeight: 48,
            minWidth: 210,
            marginTop: 20,
            paddingHorizontal: 20,
            borderRadius: 24,
            backgroundColor: '#7C5CFC',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        React.createElement(Text, { style: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 } }, 'RÉESSAYER'),
      ),
      React.createElement(
        TouchableOpacity,
        {
          accessibilityRole: 'button',
          accessibilityLabel: 'Recharger la dernière version',
          onPress: this.reloadLatest,
          style: { minHeight: 44, marginTop: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
        },
        React.createElement(Text, { style: { color: '#B9A8FF', fontWeight: '800', fontSize: 13 } }, 'RECHARGER LA DERNIÈRE VERSION'),
      ),
    );
  }
}

function KeepRoot() {
  return React.createElement(
    RootRenderBoundary,
    null,
    React.createElement(
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
          React.createElement(ActiveBattleResumeLifecycle),
          React.createElement(RobotSummonWrapper, null, React.createElement(App)),
          React.createElement(WebRefreshSurfaceGuard),
        ),
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
