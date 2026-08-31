import React from 'react';
import { registerRootComponent } from 'expo';
import { ShareIntentProvider } from 'expo-share-intent';
import App from './App';
import MandatoryProfileRequirementsGate from './src/components/MandatoryProfileRequirementsGate';
import SharedMusicHandoff from './src/components/SharedMusicHandoff';
import BackgroundListeningLifecycle from './src/components/BackgroundListeningLifecycle';
import AuthEmailLinkLifecycle from './src/components/AuthEmailLinkLifecycle';
import PushRegistrationLifecycle from './src/components/PushRegistrationLifecycle';


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
      html, body, #root { margin:0; width:100%; height:100%; min-height:100%; }
      html, body { overflow:hidden; overscroll-behavior:none; background:#090610; }
      #root { position:fixed; inset:0; height:100dvh; min-height:100dvh; max-height:100dvh; overflow:hidden; }
      @supports not (height: 100dvh) { #root { height:100vh; min-height:100vh; max-height:100vh; } }
    `;
    document.head.appendChild(style);
  }
  const syncViewport = () => {
    const h = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--keep-visible-height', `${Math.round(h)}px`);
  };
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
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
