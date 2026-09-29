// Détecteur "musique ou pas musique" pour l'arrêt automatique de l'écoute
// (Adel, 29/09/2026 : "on est capable aujourd'hui de détecter s'il y a de la
// musique ou des conversations, nous on s'occupe uniquement de la musique").
//
// Une seule logique pour le web ET l'app native : elle travaille sur
// l'enveloppe de niveau (valeurs 0..1 déjà émises toutes les ~40 ms par
// micCapture.ts via onLevel, sur les deux plateformes). Aucun envoi réseau,
// aucun enregistrement conservé : quelques nombres analysés en mémoire.
//
// Principe (classique en discrimination parole/musique) : la voix est hachée
// -- syllabes puis micro-pauses -- donc son niveau varie beaucoup (coefficient
// de variation élevé) et beaucoup de trames tombent sous le niveau moyen. La
// musique garde un niveau continu. En cas de doute on répond "musique" : couper
// une vraie soirée par erreur est pire que laisser tourner une minute de plus.
//
// Seuils calibrés le 29/09/2026 sur du vrai son (voix TIMIT/DeepSpeech, deux
// morceaux MDN), enveloppes recalculées exactement comme le web ET le natif :
// voix CV >= 0.64 ; musique CV <= 0.34 sur 60 fenêtres de 4,5 s -> seuil 0.5.

export type MusicPresenceVerdict = 'music' | 'speech' | 'silence' | 'unknown';

export type MusicPresenceResult = {
  verdict: MusicPresenceVerdict;
  /** Part des trames nettement sous le niveau moyen (0..1). */
  lowFrameRatio: number;
  /** Écart-type / moyenne du niveau (variabilité). */
  levelCv: number;
  meanLevel: number;
  frames: number;
};

/** Trames minimum (~1,6 s à 40 ms) pour trancher ; en dessous : 'unknown'. */
export const MIN_PRESENCE_FRAMES = 40;
/** Niveau moyen sous lequel on considère la pièce silencieuse. */
export const SILENCE_MEAN_LEVEL = 0.06;
/** Une trame est "creuse" sous cette fraction du niveau moyen. */
export const LOW_FRAME_FACTOR = 0.5;
/** Au-delà de cette part de trames creuses, le signal est haché comme de la voix. */
export const SPEECH_LOW_FRAME_RATIO = 0.3;
/** Au-delà de ce coefficient de variation du niveau, le signal est haché comme de la voix. */
export const SPEECH_LEVEL_CV = 0.5;

export function classifyMusicPresence(levels: readonly number[]): MusicPresenceResult {
  const frames = levels.length;
  if (frames < MIN_PRESENCE_FRAMES) {
    return { verdict: 'unknown', lowFrameRatio: 0, levelCv: 0, meanLevel: 0, frames };
  }
  const clamped = levels.map((v) => Math.max(0, Math.min(1, v)));
  let sum = 0;
  for (const v of clamped) sum += v;
  const meanLevel = sum / frames;
  if (meanLevel < SILENCE_MEAN_LEVEL) {
    return { verdict: 'silence', lowFrameRatio: 1, levelCv: 0, meanLevel, frames };
  }
  const threshold = meanLevel * LOW_FRAME_FACTOR;
  let low = 0;
  let squares = 0;
  for (const v of clamped) {
    if (v < threshold) low += 1;
    squares += (v - meanLevel) * (v - meanLevel);
  }
  const lowFrameRatio = low / frames;
  const levelCv = Math.sqrt(squares / frames) / meanLevel;
  const choppy = lowFrameRatio >= SPEECH_LOW_FRAME_RATIO || levelCv >= SPEECH_LEVEL_CV;
  const verdict: MusicPresenceVerdict = choppy ? 'speech' : 'music';
  return { verdict, lowFrameRatio, levelCv, meanLevel, frames };
}

/** Seul 'music' (ou 'unknown', par prudence) maintient l'écoute active. */
export function keepsListeningAlive(verdict: MusicPresenceVerdict): boolean {
  return verdict === 'music' || verdict === 'unknown';
}
