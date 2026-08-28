import React from 'react';
import { registerRootComponent } from 'expo';
import { ShareIntentProvider } from 'expo-share-intent';
import App from './App';
import MandatoryProfileRequirementsGate from './src/components/MandatoryProfileRequirementsGate';
import SharedMusicHandoff from './src/components/SharedMusicHandoff';
import BackgroundListeningLifecycle from './src/components/BackgroundListeningLifecycle';

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
        React.createElement(App),
      ),
    ),
  );
}

// Les wrappers fonctionnels natifs restent volontairement placés ici :
// App.tsx, son responsive, Navigation.tsx et la barre des 5 onglets ne sont
// pas modifiés. Les exigences définies par le Super Admin et le cycle natif
// d'écoute sont ainsi appliqués au vrai utilisateur sans créer une navigation
// parallèle ni modifier le design validé.
registerRootComponent(KeepRoot);
