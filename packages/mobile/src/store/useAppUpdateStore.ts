import { create } from 'zustand';
import { Platform } from 'react-native';
import { fetchLatestBuildSha, getCurrentBuildSha } from '../services/appUpdateService';

const DISMISSED_KEY = 'keep_dismissed_update_sha';

function readDismissedSha(): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(DISMISSED_KEY); } catch { return null; }
}

function writeDismissedSha(sha: string): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(DISMISSED_KEY, sha); } catch {}
}

type AppUpdateState = {
  // Non-null uniquement quand une version PLUS RÉCENTE existe ET n'a pas
  // déjà été explicitement refusée par l'utilisateur -- un composant peut
  // se fier à `Boolean(latestSha)` directement pour savoir s'il faut
  // afficher le bandeau, sans relire lui-même le localStorage.
  latestSha: string | null;
  checkNow: () => Promise<void>;
  dismiss: () => void;
};

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  latestSha: null,
  checkNow: async () => {
    const current = getCurrentBuildSha();
    if (!current) return; // build local/dev sans EXPO_PUBLIC_BUILD_SHA : rien à comparer
    const latest = await fetchLatestBuildSha();
    // Adel (02/09/2026) : "toujours avoir la possibilité de dire je la ferai
    // plus tard" -- "plus tard" ne doit jamais redevenir "jamais" : on
    // retient QUELLE version a été refusée, pas juste "refusé une fois".
    // Un sondage périodique qui retrouve la MÊME version déjà refusée ne
    // doit pas faire réapparaître le bandeau ; une version PLUS RÉCENTE que
    // celle refusée doit, elle, le refaire apparaître.
    if (latest && latest !== current && latest !== readDismissedSha()) {
      set({ latestSha: latest });
    } else {
      set({ latestSha: null });
    }
  },
  dismiss: () => {
    const { latestSha } = get();
    if (latestSha) writeDismissedSha(latestSha);
    set({ latestSha: null });
  },
}));
