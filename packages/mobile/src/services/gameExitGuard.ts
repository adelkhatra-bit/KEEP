import { BackHandler, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useGameSessionStore } from '../store/useGameSessionStore';

// Garde UNIQUE de sortie d'une partie Solo en cours (barre d'onglets,
// fermeture / rechargement de l'onglet web). Le bouton ‹ du Solo utilise le
// même message (soloQuitNotice). Sans partie en cours : on laisse passer.
export function confirmLeaveGame(onLeave: () => void): boolean {
  const state = useGameSessionStore.getState();
  if (!state.isGameInProgress) { onLeave(); return true; }
  // Un Battle en ligne ne doit jamais être perdu par un tap accidentel sur
  // un autre onglet. La seule vraie sortie reste le bouton QUITTER LE BATTLE,
  // qui libère le siège côté serveur. Ici on bloque simplement la navigation.
  if (state.gameMode === 'EN_LIGNE') {
    Alert.alert(
      'Battle en cours',
      'Tu es toujours dans ce Battle. Pour quitter réellement, utilise QUITTER LE BATTLE dans l’écran du match.',
      [{ text: 'RETOURNER AU BATTLE', style: 'cancel' }],
    );
    return false;
  }
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

// Adel (29/09/2026) : « un utilisateur est sorti en plein Solo, pas de popup ».
// Sorties qui ne passent ni par ‹ ni par la barre d'onglets :
// - web : bouton / glissement « retour » du navigateur (Safari iPhone
//   compris). Au lancement d'un Solo on ajoute une entrée d'historique à la
//   MÊME adresse ; un « retour » la consomme sans changer d'écran, on la
//   remet et on affiche le popup. « Quitter » arrête le Solo (débit déjà fait).
// - Android : bouton retour physique.
function askFromSystemBack() {
  const state = useGameSessionStore.getState();
  if (state.gameMode === 'EN_LIGNE') {
    Alert.alert(
      'Battle en cours',
      'Le Battle continue. Utilise QUITTER LE BATTLE dans le match si tu veux vraiment abandonner.',
      [{ text: 'RETOURNER AU BATTLE', style: 'cancel' }],
    );
    return;
  }
  Alert.alert('Quitter la partie ?', state.quitNotice || 'Ta partie en cours sera perdue.', [
    { text: 'Continuer à jouer', style: 'cancel' },
    { text: 'Quitter', style: 'destructive', onPress: () => useGameSessionStore.getState().requestQuit() },
  ]);
}

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.pushState) {
  let guarded = false;
  useGameSessionStore.subscribe((state) => {
    if (state.isGameInProgress && !guarded) {
      guarded = true;
      try { window.history.pushState({ ...(window.history.state || {}), keepSoloGuard: true }, '', window.location.href); } catch {}
    } else if (!state.isGameInProgress) {
      guarded = false;
    }
  });
  window.addEventListener('popstate', () => {
    if (!useGameSessionStore.getState().isGameInProgress) return;
    try { window.history.pushState({ ...(window.history.state || {}), keepSoloGuard: true }, '', window.location.href); } catch {}
    askFromSystemBack();
  });
}

if (Platform.OS === 'android') {
  BackHandler.addEventListener('hardwareBackPress', () => {
    if (!useGameSessionStore.getState().isGameInProgress) return false;
    askFromSystemBack();
    return true;
  });
}
