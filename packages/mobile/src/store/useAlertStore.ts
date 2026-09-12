import { create } from 'zustand';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';
export type AlertButton = { text?: string; onPress?: () => void; style?: AlertButtonStyle };
export type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };

type AlertStoreState = {
  current: AlertRequest | null;
  queue: AlertRequest[];
  show: (title: string, message: string | undefined, buttons: AlertButton[]) => void;
  hide: () => void;
};

/**
 * Adel (01/09/2026, capture d'écran à l'appui) : les popups Loki sur le web
 * utilisent window.alert/confirm -- fonctionnel (fix du 31/08 pour le no-op
 * react-native-web, voir keepAlert.ts) mais visuellement une boîte système
 * générique, pas la charte Loki. AlertHost.tsx rend cette file d'attente avec
 * le design de l'app ; keepAlert.ts pousse ici sur web au lieu de
 * window.alert/confirm, sans changer le moindre site d'appel Alert.alert().
 *
 * Adel (02/09/2026, "invitation expirée, il bloque") : `show` écrasait
 * silencieusement `current` -- deux Alert.alert() rapprochés (ex: un backlog
 * de plusieurs invitations Battle expirées, relayées une par tick de 650ms)
 * faisaient disparaître la première boîte sous la suivante avant que
 * l'utilisateur ait pu la fermer, donnant l'impression qu'un popup reste
 * bloqué indéfiniment. C'est un bug transverse : les 144 sites Alert.alert()
 * de l'app passent tous par ce store sur web. Vraie file FIFO : `show`
 * n'écrase `current` que s'il est vide, sinon empile ; `hide` dépile le
 * suivant au lieu de tout effacer.
 */
export const useAlertStore = create<AlertStoreState>((set, get) => ({
  current: null,
  queue: [],
  show: (title, message, buttons) => {
    const request: AlertRequest = { title, message, buttons };
    if (get().current) {
      set((state) => ({ queue: [...state.queue, request] }));
    } else {
      set({ current: request });
    }
  },
  hide: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
}));
