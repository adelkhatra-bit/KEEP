import { useAlertStore } from '../store/useAlertStore';

type AlertButtonStyle = 'default' | 'cancel' | 'destructive';
type AlertButton = { text?: string; onPress?: () => void; style?: AlertButtonStyle };

/**
 * Popup Loki Music unique pour web + iOS + Android.
 *
 * AlertHost est monté une seule fois au niveau racine de l'application.
 * Tous les écrans qui importent ce module passent donc par la même file FIFO
 * et par la même charte (fond sombre, violet Loki, danger corail), au lieu
 * d'afficher les boîtes système iOS/Android ou les dialogues navigateur.
 *
 * Les seules fenêtres qui restent volontairement système sont celles que
 * l'OS impose lui-même (permission micro/GPS, sélecteur de photos, etc.) :
 * une application n'a pas le droit de les recolorer.
 */
function brandedAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const list = buttons && buttons.length ? buttons : [{ text: 'OK' } as AlertButton];
  useAlertStore.getState().show(title, message, list);
}

export const Alert = { alert: brandedAlert };
