import { create } from 'zustand';
import type { RobotCoachKind } from '../services/robotCoachMessages';

export type RobotMessage = { id: number; kind: RobotCoachKind; text: string };
type State = { message: RobotMessage | null; quiet: number; say: (kind: RobotCoachKind, text: string) => void; dismiss: () => void; setQuiet: (active: boolean) => void };

/** Message du robot du Tchat (Adel, 05/10/2026) : une bulle à côté du robot, jamais une notification. */
export const useRobotMessageStore = create<State>((set) => ({
  message: null,
  // Silence du robot : > 0 tant qu'un lecteur plein écran (Swipe, story) est ouvert -- jamais de message qui gêne (Adel, 05/10/2026).
  quiet: 0,
  say: (kind, text) => set({ message: { id: Date.now(), kind, text } }),
  dismiss: () => set({ message: null }),
  setQuiet: (active) => set((state) => ({ quiet: Math.max(0, state.quiet + (active ? 1 : -1)) })),
}));
