import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
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
  // Adel (03/09/2026) : "dans Soirées tu mets que du fixe, la notification tu
  // l'intègres uniquement dans Profil/Playlists/Découvertes/Écoute" -- le
  // classement (onglet Soirées, Battle fermé) affiche déjà son propre
  // bandeau fixe pour la même invitation/revanche (voir PartiesScreen) ;
  // `battleScreenOpen` ne couvrait que l'arène elle-même grande ouverte, pas
  // tout l'onglet Soirées. Ce flag reflète "l'écran Parties est monté",
  // quel que soit son sous-onglet -- superset de `battleScreenOpen`.
  partiesTabOpen: boolean;
  setAvailable: (value: boolean) => Promise<void>;
  autoEnable: () => Promise<void>;
  autoDisable: () => Promise<void>;
  syncFromServer: () => Promise<void>;
  setBattleScreenOpen: (value: boolean) => void;
  setPartiesTabOpen: (value: boolean) => void;
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
  // Adel (05/09/2026) : setInterval seul ne déclenche rien avant la première
  // échéance (4 minutes) -- si last_seen_at était déjà périmé au moment où
  // startPing() démarre (ex. syncFromServer() au chargement de l'app après
  // une longue absence), la présence restait invisible jusqu'à 4 minutes de
  // plus après le retour. Un premier ping immédiat comble ce trou.
  void pingManualBattleAvailability().catch(() => {});
  pingTimer = setInterval(() => {
    void pingManualBattleAvailability().catch(() => {});
  }, PING_INTERVAL_MS);
}

export const useBattleAvailabilityStore = create<BattleAvailabilityState>((set, get) => ({
  available: false,
  activatedManually: false,
  busy: false,
  battleScreenOpen: false,
  partiesTabOpen: false,
  setBattleScreenOpen: (value) => set({ battleScreenOpen: value }),
  setPartiesTabOpen: (value) => set({ partiesTabOpen: value }),
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

// Adel (05/09/2026) : "l'utilisateur Flo souvent on la trouve pas comme si
// elle était pas connectée et pourtant elle est bien connectée, il faut
// qu'elle aille se connecter et se déconnecter pour que je puisse la voir"
// -- BUG RÉEL : le setInterval de 4 minutes qui maintient last_seen_at à
// jour (bien en dessous du TTL serveur de 30 minutes) peut être
// throttled/suspendu par le navigateur ou l'OS dès que l'onglet/l'appli
// passe en arrière-plan (écran verrouillé, autre appli au premier plan,
// onglet non actif...) -- aucune désactivation explicite de sa part, juste
// un ping qui ne part plus jusqu'à dépasser le TTL. Se déconnecter/se
// reconnecter forçait un syncFromServer() qui rafraîchit last_seen_at une
// fois -- mais rien ne le refaisait automatiquement au retour au premier
// plan. Un ping immédiat dès que l'onglet/l'appli redevient visible
// rattrape ça pour TOUS les utilisateurs disponibles, pas seulement Flo.
function pingIfAvailable() {
  if (useBattleAvailabilityStore.getState().available) {
    void pingManualBattleAvailability().catch(() => {});
  }
}
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pingIfAvailable();
  });
} else {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') pingIfAvailable();
  });
}
