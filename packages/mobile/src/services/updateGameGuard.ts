import { useGameSessionStore } from '../store/useGameSessionStore';

/**
 * Adel (02/10/2026) : « quand on fait des mises à jour, s'il y a des Battle en
 * cours il ne faut pas y toucher ». Recharger l'app en pleine partie fait
 * manquer des questions (3 absences = mise perdue). Règle unique : une mise à
 * jour (web ou iPhone/Android) n'est JAMAIS appliquée tant qu'un Solo ou un
 * Battle en ligne est en cours (useGameSessionStore, la même source que la
 * garde de sortie) ; elle s'applique d'elle-même juste après la partie.
 */
export function runWhenNoGameInProgress(apply: () => void): () => void {
  if (!useGameSessionStore.getState().isGameInProgress) {
    apply();
    return () => {};
  }
  let done = false;
  const unsubscribe = useGameSessionStore.subscribe((state) => {
    if (done || state.isGameInProgress) return;
    done = true;
    unsubscribe();
    apply();
  });
  return () => { done = true; unsubscribe(); };
}
