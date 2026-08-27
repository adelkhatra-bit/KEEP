import React from 'react';
import { registerRootComponent } from 'expo';
import { ShareIntentProvider } from 'expo-share-intent';
import App from './App';
import SharedMusicHandoff from './src/components/SharedMusicHandoff';

function KeepRoot() {
  return React.createElement(
    ShareIntentProvider,
    null,
    React.createElement(React.Fragment, null,
      React.createElement(SharedMusicHandoff),
      React.createElement(App),
    ),
  );
}

// Le wrapper natif est volontairement placé ici : App.tsx, son responsive,
// Navigation.tsx et la barre des 5 onglets restent inchangés.
registerRootComponent(KeepRoot);
