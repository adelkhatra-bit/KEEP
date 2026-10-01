import { create } from 'zustand';

export type GlobalChatTarget = {
  roomSlug?: string | null;
  targetProfileId?: string | null;
  targetUsername?: string | null;
  messageId?: number | null;
};

type GlobalChatState = {
  isOpen: boolean;
  side: 'left' | 'right';
  target: GlobalChatTarget | null;
  open: (target?: GlobalChatTarget | null) => void;
  close: () => void;
  toggle: () => void;
  setSide: (side: 'left' | 'right') => void;
  clearTarget: () => void;
};

export const useGlobalChatStore = create<GlobalChatState>((set) => ({
  isOpen: false,
  side: 'right',
  target: null,
  open: (target = null) => set({ isOpen: true, target }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setSide: (side) => set({ side }),
  clearTarget: () => set({ target: null }),
}));
