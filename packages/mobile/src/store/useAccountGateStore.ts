import { create } from 'zustand';

export type AccountGateMode = 'create' | 'login';

type AccountGateState = {
  visible: boolean;
  mode: AccountGateMode;
  followUsername: string;
  celebrate: boolean;
  // Adel (08/09/2026) : "pourquoi ça me met sur le profil ... le Popo doit
  // s'ouvrir au bon endroit et se refermer ... il doit rester au même
  // endroit" -- un seul popup de création/connexion de compte, monté une
  // fois à la racine de l'appli (voir App.tsx), déclenchable depuis
  // N'IMPORTE quel écran SANS jamais naviguer ailleurs. L'utilisateur ne
  // quitte donc jamais l'écran où il se trouvait.
  requestAccount: (mode?: AccountGateMode, followUsername?: string) => void;
  handleSuccess: () => void;
  close: () => void;
};

export const useAccountGateStore = create<AccountGateState>((set) => ({
  visible: false,
  mode: 'create',
  followUsername: '',
  celebrate: false,
  requestAccount: (mode = 'create', followUsername = '') => set({
    visible: true,
    mode,
    followUsername: followUsername.replace(/^@+/, ''),
    celebrate: false,
  }),
  handleSuccess: () => set({ celebrate: true }),
  close: () => set({ visible: false, celebrate: false, followUsername: '' }),
}));
