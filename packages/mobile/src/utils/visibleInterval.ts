import { AppState, AppStateStatus } from 'react-native';

// Source unique des rafraîchissements périodiques réseau
// (ERR-SUPABASE-API-POLLING-20261021).
//
// Constat (journaux Supabase, 24 h) : un onglet ordinateur laissé ouvert a fait
// à lui seul 18 967 appels API ; les compteurs et rafraîchissements tournaient
// toutes les 8 à 90 s même quand personne ne regardait l'écran.
//
// Règle : un minuteur qui interroge le serveur ne tourne que lorsque l'app est
// au premier plan (iPhone/Android : AppState « active » ; PC/web :
// react-native-web relie AppState à `document.visibilityState`, donc onglet
// caché = « background »). Au retour au premier plan, un seul rattrapage
// immédiat si au moins un passage a été sauté (option `catchUp`).
// Les minuteurs purement visuels (compte à rebours, animation) n'ont pas
// besoin de ce module.

export type VisibleIntervalOptions = {
  /** Rejouer une fois immédiatement au retour si un passage a été sauté (défaut : true). */
  catchUp?: boolean;
};

export function isAppForeground(state: AppStateStatus | string | null | undefined = AppState.currentState): boolean {
  // `null`/inconnu au tout premier rendu : on considère l'app visible.
  return state == null || state === 'active' || state === 'unknown';
}

/**
 * Comme setInterval, mais sans aucun appel tant que l'app ou l'onglet est
 * en arrière-plan. Renvoie la fonction d'arrêt (à appeler dans le cleanup).
 */
export function setVisibleInterval(callback: () => void, ms: number, options: VisibleIntervalOptions = {}): () => void {
  const catchUp = options.catchUp !== false;
  let skipped = false;
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) return;
    if (!isAppForeground()) {
      skipped = true;
      return;
    }
    skipped = false;
    callback();
  }, ms);

  const subscription = AppState.addEventListener('change', (state) => {
    if (stopped || !isAppForeground(state)) return;
    if (skipped && catchUp) {
      skipped = false;
      callback();
    }
  });

  return () => {
    stopped = true;
    clearInterval(timer);
    subscription?.remove?.();
  };
}
