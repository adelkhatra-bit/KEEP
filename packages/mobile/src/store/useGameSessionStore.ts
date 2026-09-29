import { create } from 'zustand';

// Adel (29/09/2026) : « s'il appuie sur la barre du bas pour sortir du Solo,
// il faut un popup qui lui dit que ça va lui débiter sa partie ». Une seule
// source de vérité : KeepBattleMobileGameV3 déclare une partie SOLO en cours
// (et le message exact à afficher) ; la garde centrale (gameExitGuard) lit
// ce store depuis la barre d'onglets et demande l'arrêt propre du Solo.
interface GameSessionState {
  isGameInProgress: boolean;
  gameMode: 'SOLO' | 'EN_LIGNE' | undefined;
  quitNotice: string;
  quitRequest: number;
  setGameInProgress: (inProgress: boolean, mode?: 'SOLO' | 'EN_LIGNE', quitNotice?: string) => void;
  requestQuit: () => void;
  clearGameSession: () => void;
}

export const useGameSessionStore = create<GameSessionState>((set) => ({
  isGameInProgress: false,
  gameMode: undefined,
  quitNotice: '',
  quitRequest: 0,
  setGameInProgress: (inProgress, mode, quitNotice = '') =>
    set({ isGameInProgress: inProgress, gameMode: inProgress ? mode : undefined, quitNotice: inProgress ? quitNotice : '' }),
  requestQuit: () => set((s) => ({ quitRequest: s.quitRequest + 1, isGameInProgress: false, gameMode: undefined, quitNotice: '' })),
  clearGameSession: () => set({ isGameInProgress: false, gameMode: undefined, quitNotice: '' }),
}));
