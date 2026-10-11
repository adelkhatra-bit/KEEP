import { Alert } from '../utils/keepAlert';
import { useSessionStore } from '../store/useSessionStore';

/**
 * Ouvrir « Mes Sessions » : si le micro écoute, on demande d'abord d'arrêter l'écoute.
 * Source unique pour l'écran Loki (téléphone) et la barre latérale du bureau.
 */
export function openSessionHistoryGuarded(navigate: () => void) {
  if (!useSessionStore.getState().isActive) { navigate(); return; }
  Alert.alert('Terminer l’écoute pour ouvrir Mes Sessions ?',
    'Le micro sera arrêté. Les morceaux détectés restent dans ta session pour être réécoutés, swipés et sélectionnés. Tu pourras ensuite relancer une écoute.',
    [
      { text: 'Continuer l’écoute', style: 'cancel' },
      { text: 'Arrêter et ouvrir Mes Sessions', onPress: () => {
        useSessionStore.getState().requestEndSession();
        navigate();
      } },
    ],
    { cancelable: true },
  );
}
