import { create } from 'zustand';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';
export type AlertButton = { text?: string; onPress?: () => void; style?: AlertButtonStyle };
export type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };

type AlertStoreState = {
  current: AlertRequest | null;
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
 */
export const useAlertStore = create<AlertStoreState>((set) => ({
  current: null,
  show: (title, message, buttons) => set({ current: { title, message, buttons } }),
  hide: () => set({ current: null }),
}));
