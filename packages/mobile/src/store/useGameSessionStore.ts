import { create } from 'zustand';

interface GameSessionState {
  isGameInProgress: boolean;
  gameMode: 'SOLO' | 'EN_LIGNE' | undefined;
  setGameInProgress: (inProgress: boolean, mode?: 'SOLO' | 'EN_LIGNE') => void;
  clearGameSession: () => void;
}

export const useGameSessionStore = create<GameSessionState>((set) => ({
  isGameInProgress: false,
  gameMode: undefined,
  setGameInProgress: (inProgress, mode) =>
    set({ isGameInProgress: inProgress, gameMode: inProgress ? mode : undefined }),
  clearGameSession: () => set({ isGameInProgress: false, gameMode: undefined }),
}));
