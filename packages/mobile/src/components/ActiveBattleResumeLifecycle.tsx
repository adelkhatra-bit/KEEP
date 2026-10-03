import React from 'react';
import { AppState } from 'react-native';
import { loadMyActiveKeepBattleArena } from '../services/keepBattleService';
import { navigationRef, navigateToBattleArena } from '../navigation/navigationRef';
import { useGameSessionStore } from '../store/useGameSessionStore';
import { supabase } from '../services/supabaseClient';

let lastResumedArenaId = '';
let lastResumeAt = 0;

async function waitForNavigationReady(maxAttempts = 24): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (navigationRef.isReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return navigationRef.isReady();
}

/**
 * Source de vérité globale pour un Battle EN LIGNE encore actif.
 *
 * Un changement d'onglet est déjà bloqué par gameExitGuard. Ce composant
 * couvre le cas plus dur : app tuée/rechargée, reprise après background,
 * reconnexion de session. Il ne touche ni App.tsx, ni Navigation.tsx, ni la
 * barre des 5 onglets.
 */
export default function ActiveBattleResumeLifecycle() {
  React.useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    let running = false;

    const resume = async () => {
      if (!alive || running) return;
      running = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive || !data.session?.user?.id) return;

        const active = await loadMyActiveKeepBattleArena().catch(() => null);
        if (!alive || !active?.id || active.me?.status !== 'ACTIVE') {
          const game = useGameSessionStore.getState();
          if (game.gameMode === 'EN_LIGNE') game.clearGameSession();
          lastResumedArenaId = '';
          return;
        }

        useGameSessionStore.getState().setGameInProgress(
          true,
          'EN_LIGNE',
          'Tu es engagé dans ce Battle. Pour sortir, utilise QUITTER LE BATTLE.',
          active.id,
        );

        const now = Date.now();
        if (active.id === lastResumedArenaId && now - lastResumeAt < 2500) return;
        if (!(await waitForNavigationReady())) return;
        if (!alive) return;

        lastResumedArenaId = active.id;
        lastResumeAt = Date.now();
        navigateToBattleArena(active.id);
      } finally {
        running = false;
      }
    };

    void resume();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user?.id) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setTimeout(() => { void resume(); }, 0);
      }
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resume();
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  return null;
}
