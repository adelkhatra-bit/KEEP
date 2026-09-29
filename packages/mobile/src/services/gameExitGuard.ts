import { Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useGameSessionStore } from '../store/useGameSessionStore';

// Garde UNIQUE de sortie d'une partie Solo en cours (barre d'onglets,
// fermeture / rechargement de l'onglet web). Le bouton ‹ du Solo utilise le
// même message (soloQuitNotice). Sans partie en cours : on laisse passer.
export function confirmLeaveGame(onLeave: () => void): boolean {
  const state = useGameSessionStore.getState();
  if (!state.isGameInProgress) { onLeave(); return true; }
  Alert.alert('Quitter la partie ?', state.quitNotice || 'Ta partie en cours sera perdue.', [
    { text: 'Continuer à jouer', style: 'cancel' },
    { text: 'Quitter', style: 'destructive', onPress: () => { useGameSessionStore.getState().requestQuit(); onLeave(); } },
  ]);
  return false;
}

// Web : fermer ou recharger l'onglet pendant un Solo -> alerte du navigateur.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (!useGameSessionStore.getState().isGameInProgress) return;
    event.preventDefault();
    // Requis par certains navigateurs pour afficher l'alerte.
    (event as any).returnValue = '';
  });
}
