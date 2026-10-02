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
  // Messages non lus par conversation (`g:<groupe>` / `p:<expéditeur>`) :
  // id des notifications à marquer lues quand la conversation est ouverte.
  unreadByTarget: Record<string, string[]>;
  setUnreadByTarget: (map: Record<string, string[]>) => void;
  addUnread: (key: string, notificationId: string) => void;
  consumeUnread: (key: string) => string[];
};

export const useGlobalChatStore = create<GlobalChatState>((set, get) => ({
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
  unreadByTarget: {},
  setUnreadByTarget: (unreadByTarget) => set({ unreadByTarget }),
  addUnread: (key, notificationId) => set((state) => {
    const current = state.unreadByTarget[key] ?? [];
    if (current.includes(notificationId)) return state;
    return { unreadByTarget: { ...state.unreadByTarget, [key]: [...current, notificationId] } };
  }),
  consumeUnread: (key) => {
    const ids = get().unreadByTarget[key] ?? [];
    if (!ids.length) return [];
    const next = { ...get().unreadByTarget };
    delete next[key];
    set({ unreadByTarget: next });
    return ids;
  },
}));
