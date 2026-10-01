import { create } from 'zustand';
import { fetchLatestBuildSha, getCurrentBuildSha } from '../services/appUpdateService';

type AppUpdateState = {
  // Non-null uniquement quand le SHA réellement publié est différent du
  // bundle actuellement chargé. Aucune ancienne décision "plus tard" ne peut
  // bloquer la mise à jour silencieuse : il n'existe plus d'UI de mise à jour.
  latestSha: string | null;
  checkNow: () => Promise<void>;
  dismiss: () => void;
};

export const useAppUpdateStore = create<AppUpdateState>((set) => ({
  latestSha: null,
  checkNow: async () => {
    const current = getCurrentBuildSha();
    if (!current) return; // build local/dev sans EXPO_PUBLIC_BUILD_SHA : rien à comparer
    const latest = await fetchLatestBuildSha();
    if (latest && latest !== current) {
      set({ latestSha: latest });
    } else {
      set({ latestSha: null });
    }
  },
  // Compatibilité API interne uniquement. Il n'y a plus de bouton "plus tard"
  // et cette action ne persiste jamais un SHA qui pourrait bloquer un reload.
  dismiss: () => set({ latestSha: null }),
}));
