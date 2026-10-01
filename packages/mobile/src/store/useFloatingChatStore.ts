import { create } from 'zustand';

type FloatingChatSide = 'LEFT' | 'RIGHT';

type FloatingChatStore = {
  open: boolean;
  side: FloatingChatSide;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setSide: (side: FloatingChatSide) => void;
};

export const useFloatingChatStore = create<FloatingChatStore>((set) => ({
  open: false,
  side: 'RIGHT',
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setSide: (side) => set({ side }),
}));
