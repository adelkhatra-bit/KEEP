import { create } from 'zustand';
import { setManualBattleAvailability, pingManualBattleAvailability, getManualBattleAvailability } from '../services/keepBattleLiveService';

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
  // Adel (02/09/2026) : "il aura la possibilité de l'activer manuellement et
  // ... notre système ne laissera activer tout le temps jusqu'à ce que lui
  // souhaite le désactiver, mais il ne faut pas le désactiver automatique" --
  // une activation MANUELLE (bascule du profil) ne doit jamais être coupée
  // par un événement automatique (quitter Battle). Une activation
  // AUTOMATIQUE (entrer en Battle seul/à plusieurs) peut, elle, être
  // annulée automatiquement en quittant -- sauf si l'utilisateur avait
  // déjà activé manuellement avant, auquel cas ça reste activé.
  activatedManually: boolean;
  busy: boolean;
  // Adel (02/09/2026) : "ici aussi tu peux mettre l'invite" -- le bandeau
  // d'invitation global (GlobalNotificationBanner) se cachait dès qu'on
  // était sur la route 'Parties', même sur la carte "Salon musical" AVANT
  // d'ouvrir le Battle -- où aucun bandeau interne n'existe pour prendre le
  // relais. Ce flag reflète si l'écran Battle est RÉELLEMENT monté (pas
  // juste "on est sur l'onglet Soirées"), pour ne masquer le bandeau global
  // que quand un bandeau interne existe déjà pour la même invitation.
  battleScreenOpen: boolean;
  setAvailable: (value: boolean) => Promise<void>;
  autoEnable: () => Promise<void>;
  autoDisable: () => Promise<void>;
  syncFromServer: () => Promise<void>;
  setBattleScreenOpen: (value: boolean) => void;
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
  activatedManually: false,
  busy: false,
  battleScreenOpen: false,
  setBattleScreenOpen: (value) => set({ battleScreenOpen: value }),
  setAvailable: async (value) => {
    if (get().busy) return;
    if (get().available === value) {
      // Un utilisateur qui rebascule "disponible" depuis le profil alors
      // qu'il l'était déjà automatiquement doit quand même passer en
      // manuel, sinon un futur exit automatique l'éteindrait encore.
      if (value && !get().activatedManually) set({ activatedManually: true });
      return;
    }
    set({ busy: true });
    try {
      await setManualBattleAvailability(value);
      set({ available: value, activatedManually: value });
      if (value) startPing(); else stopPing();
    } finally {
      set({ busy: false });
    }
  },
  autoEnable: async () => {
    if (get().busy || get().available) return;
    set({ busy: true });
    try {
      await setManualBattleAvailability(true);
      set({ available: true, activatedManually: false });
      startPing();
    } finally {
      set({ busy: false });
    }
  },
  autoDisable: async () => {
    if (get().busy || !get().available || get().activatedManually) return;
    set({ busy: true });
    try {
      await setManualBattleAvailability(false);
      set({ available: false, activatedManually: false });
      stopPing();
    } finally {
      set({ busy: false });
    }
  },
  syncFromServer: async () => {
    // Adel (02/09/2026) : "on va les laisser connecté par défaut ... lors de
    // la première inscription" -- le nouveau profil part "disponible" côté
    // serveur (voir le trigger de signup), mais le store côté client
    // démarrait toujours à false. Appelé une fois au chargement de l'app :
    // si le serveur dit "disponible", on le traite comme une activation
    // MANUELLE (jamais coupée automatiquement en quittant Battle), exactement
    // comme si l'utilisateur venait de l'activer lui-même depuis son profil.
    if (get().busy) return;
    try {
      const value = await getManualBattleAvailability();
      set({ available: value, activatedManually: value });
      if (value) startPing(); else stopPing();
    } catch {
      // Silencieux : reste sur l'état local par défaut si la lecture échoue.
    }
  },
  reset: () => {
    stopPing();
    set({ available: false, activatedManually: false, busy: false });
  },
}));
