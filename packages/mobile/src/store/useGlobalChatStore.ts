import { create } from 'zustand';

export type GlobalChatTarget = {
  roomSlug?: string | null;
  targetProfileId?: string | null;
  targetUsername?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  messageId?: number | null;
};

type GlobalChatState = {
  isOpen: boolean;
  side: 'left' | 'right';
  bottomOffset: number;
  target: GlobalChatTarget | null;
  settingsOpen: boolean;
  open: (target?: GlobalChatTarget | null) => void;
  prime: (target?: GlobalChatTarget | null) => void;
  close: () => void;
  toggle: () => void;
  setSide: (side: 'left' | 'right') => void;
  setBottomOffset: (value: number) => void;
  clearTarget: () => void;
  openSettings: () => void;
  closeSettings: () => void;
};

export const useGlobalChatStore = create<GlobalChatState>((set) => ({
  isOpen: false,
  side: 'right',
  bottomOffset: 88,
  target: null,
  settingsOpen: false,
  open: (target = null) => set({ isOpen: true, target, settingsOpen: false }),
  prime: (target = null) => set({ target }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setSide: (side) => set({ side }),
  setBottomOffset: (bottomOffset) => set({ bottomOffset }),
  clearTarget: () => set({ target: null }),
  openSettings: () => set({ settingsOpen: true, isOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),
}));
