import React from 'react';
import { registerRootComponent } from 'expo';
import { ShareIntentProvider } from 'expo-share-intent';
import App from './App';
import MandatoryProfileRequirementsGate from './src/components/MandatoryProfileRequirementsGate';
import SharedMusicHandoff from './src/components/SharedMusicHandoff';

function KeepRoot() {
  return React.createElement(
    ShareIntentProvider,
    null,
    React.createElement(
      MandatoryProfileRequirementsGate,
      null,
      React.createElement(React.Fragment, null,
        React.createElement(SharedMusicHandoff),
        React.createElement(App),
      ),
    ),
  );
}

// Les wrappers fonctionnels natifs restent volontairement placés ici :
// App.tsx, son responsive, Navigation.tsx et la barre des 5 onglets ne sont
// pas modifiés. Les exigences définies par le Super Admin sont ainsi appliquées
// au vrai utilisateur connecté sans créer une deuxième navigation.
registerRootComponent(KeepRoot);
