import './src/polyfills/bindFetch';
import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent appelle AppRegistry.registerComponent('main', ...) et
// prépare l'environnement (Expo Go ou natif) — voir docs Expo "app entry".
registerRootComponent(App);
