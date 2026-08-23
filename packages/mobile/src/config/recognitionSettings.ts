/**
 * Réglages qui pilotent la cadence d'appel au provider de reconnaissance
 * (AudD ou autre -- voir MusicRecognitionProvider). Objectif explicite (cf.
 * demande du 23/08/2026) : une soirée de plusieurs heures ne doit PAS
 * consommer des centaines de requêtes inutiles.
 *
 * Valeurs par défaut si le Super Admin n'a rien changé (voir
 * packages/admin -> Feature Flags -> Réglages reconnaissance). PAS ENCORE
 * persisté côté Supabase (aucun projet KEEP déployé) -- CODÉ, pas CONNECTÉ,
 * même statut honnête que DEFAULT_SESSION_SILENCE_TIMEOUT_MIN dans
 * useSessionStore.ts.
 */
export interface RecognitionSettings {
  /** Intervalle entre deux tentatives quand rien n'attend de décision et qu'aucun cooldown n'est actif. */
  tickIntervalMs: number;
  /** Durée d'un échantillon micro (recommandation AudD : 2-12s). */
  sampleDurationMs: number;
  /** Amplitude crête en dessous de laquelle un échantillon est considéré silencieux -- jamais envoyé au provider (0 requête consommée). */
  silencePeakThreshold: number;
  /** Après une reconnaissance réussie, pause avant de retenter -- le même morceau joue probablement encore. */
  cooldownAfterSuccessMs: number;
  /** Backoff de base après une erreur transitoire (réseau, etc.) -- doublé à chaque échec consécutif, plafonné à backoffMaxMs. */
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = {
  tickIntervalMs: 8000,
  // 6s -> 10s (cf. diagnostic réel du 23/08/2026 : AcoustID a répondu
  // "no_match" sur un extrait de 6s capté au micro, AudD est retombé sur
  // son quota épuisé -- pas un bug, une limite connue d'AcoustID/Chromaprint
  // pour les extraits courts et bruités, documentée par AcoustID lui-même.
  // Un extrait plus long donne plus de matière au fingerprint Chromaprint,
  // reste dans la plage "2-12s" recommandée par AudD -- ne dégrade rien
  // pour ce provider quand son quota redevient disponible.
  sampleDurationMs: 10000,
  silencePeakThreshold: 0.01,
  cooldownAfterSuccessMs: 45000,
  backoffBaseMs: 15000,
  backoffMaxMs: 120000,
};
