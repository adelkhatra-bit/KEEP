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
type AlertOptions = { cancelable?: boolean; onDismiss?: () => void };

function brandedAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  // Compat signature React Native Alert.alert(title, message, buttons, options).
  // La popup Loki est pilotée par boutons (file FIFO branded) : le sheet appelant
  // fournit déjà un bouton "Annuler" qui résout sa promesse, donc onDismiss reste
  // une sécurité redondante. On l'accepte pour ne casser aucun site d'appel et,
  // si aucun bouton d'annulation n'est fourni, on rattache onDismiss à un bouton OK.
  let list = buttons && buttons.length ? buttons : [{ text: 'OK' } as AlertButton];
  if (options?.onDismiss && !list.some((b) => b.style === 'cancel')) {
    const onDismiss = options.onDismiss;
    list = list.map((b) => (b.text === 'OK' ? { ...b, onPress: () => { b.onPress?.(); onDismiss(); } } : b));
  }
  useAlertStore.getState().show(title, message, list);
}

export const Alert = { alert: brandedAlert };
