import { create } from 'zustand';
import { setManualBattleAvailability, pingManualBattleAvailability } from '../services/keepBattleLiveService';

// Adel (02/09/2026) : "un utilisateur qui se connecte à la plateforme peut se
// rendre disponible même s'il est pas en train de faire des Battle ...
// recevra des notifications pour des Battle" -- ce store vit au niveau de
// l'app (pas de l'écran Battle) : le bouton peut être basculé depuis le
// Profil, et l'utilisateur reste "disponible" (et reçoit des invitations,
// voir GlobalNotificationBanner) même en naviguant ailleurs dans l'app.
// Ping toutes les 4 minutes tant que actif -- large marge sous le TTL
// serveur de 30 minutes (keep_battle_solo_presence.manual_available).
const PING_INTERVAL_MS = 4 * 60 * 1000;

type BattleAvailabilityState = {
  available: boolean;
  busy: boolean;
  setAvailable: (value: boolean) => Promise<void>;
  reset: () => void;
};

let pingTimer: ReturnType<typeof setInterval> | null = null;

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    void pingManualBattleAvailability().catch(() => {});
  }, PING_INTERVAL_MS);
}

export const useBattleAvailabilityStore = create<BattleAvailabilityState>((set, get) => ({
  available: false,
  busy: false,
  setAvailable: async (value) => {
    if (get().busy || get().available === value) return;
    set({ busy: true });
    try {
      await setManualBattleAvailability(value);
      set({ available: value });
      if (value) startPing(); else stopPing();
    } finally {
      set({ busy: false });
    }
  },
  reset: () => {
    stopPing();
    set({ available: false, busy: false });
  },
}));
