import { create } from 'zustand';

type FloatingChatSide = 'LEFT' | 'RIGHT';

type OpenChatPayload = {
  roomSlug?: string | null;
  targetProfileId?: string | null;
  targetUsername?: string | null;
  messageId?: number | null;
};

type FloatingChatStore = {
  open: boolean;
  side: FloatingChatSide;
  bottomOffset: number;
  roomSlug: string | null;
  targetProfileId: string | null;
  targetUsername: string | null;
  messageId: number | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setSide: (side: FloatingChatSide) => void;
  setBottomOffset: (bottomOffset: number) => void;
  openChat: (payload?: OpenChatPayload) => void;
  clearChatTarget: () => void;
};

export const useFloatingChatStore = create<FloatingChatStore>((set) => ({
  open: false,
  side: 'RIGHT',
  bottomOffset: 88,
  roomSlug: null,
  targetProfileId: null,
  targetUsername: null,
  messageId: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setSide: (side) => set({ side }),
  setBottomOffset: (bottomOffset) => set({ bottomOffset }),
  openChat: (payload = {}) => set({
    open: true,
    roomSlug: payload.roomSlug ?? null,
    targetProfileId: payload.targetProfileId ?? null,
    targetUsername: payload.targetUsername ?? null,
    messageId: payload.messageId ?? null,
  }),
  clearChatTarget: () => set({
    roomSlug: null,
    targetProfileId: null,
    targetUsername: null,
    messageId: null,
  }),
}));
