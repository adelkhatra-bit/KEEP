import { create } from 'zustand';
import type { RobotCoachKind } from '../services/robotCoachMessages';

export type RobotMessage = { id: number; kind: RobotCoachKind; text: string };
type State = { message: RobotMessage | null; say: (kind: RobotCoachKind, text: string) => void; dismiss: () => void };

/** Message du robot du Tchat (Adel, 05/10/2026) : une bulle à côté du robot, jamais une notification. */
export const useRobotMessageStore = create<State>((set) => ({
  message: null,
  say: (kind, text) => set({ message: { id: Date.now(), kind, text } }),
  dismiss: () => set({ message: null }),
}));
