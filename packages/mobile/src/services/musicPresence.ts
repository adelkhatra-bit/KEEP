// Détecteur local musique / voix / silence pour l'arrêt automatique.
// Il n'identifie pas le titre : il décide uniquement si le compte à rebours
// "plus de musique" a le droit de démarrer.
//
// Une fenêtre audio est analysée via l'enveloppe 0..1 produite par micCapture.
// La décision combine continuité, creux, variabilité et durée des pauses.
// Deux fenêtres consécutives sans musique sont exigées avant d'armer le chrono.

export type MusicPresenceVerdict = 'music' | 'speech' | 'silence' | 'unknown';

export type MusicPresenceResult = {
  verdict: MusicPresenceVerdict;
  lowFrameRatio: number;
  silenceFrameRatio: number;
  levelCv: number;
  meanLevel: number;
  longestLowRun: number;
  frames: number;
};

export const MIN_PRESENCE_FRAMES = 40;
export const SILENCE_MEAN_LEVEL = 0.05;
export const LOW_FRAME_FACTOR = 0.48;
export const SPEECH_LOW_FRAME_RATIO = 0.28;
export const SPEECH_LEVEL_CV = 0.58;
export const REQUIRED_NON_MUSIC_WINDOWS = 2;

export function classifyMusicPresence(levels: readonly number[]): MusicPresenceResult {
  const frames = levels.length;
  if (frames < MIN_PRESENCE_FRAMES) {
    return { verdict: 'unknown', lowFrameRatio: 0, silenceFrameRatio: 0, levelCv: 0, meanLevel: 0, longestLowRun: 0, frames };
  }

  const clamped = levels.map((v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)));
  const meanLevel = clamped.reduce((sum, v) => sum + v, 0) / frames;
  if (meanLevel < SILENCE_MEAN_LEVEL) {
    return { verdict: 'silence', lowFrameRatio: 1, silenceFrameRatio: 1, levelCv: 0, meanLevel, longestLowRun: frames, frames };
  }

  const lowThreshold = Math.max(0.025, meanLevel * LOW_FRAME_FACTOR);
  const silenceThreshold = Math.max(0.018, meanLevel * 0.18);
  let low = 0, silent = 0, squares = 0, currentLowRun = 0, longestLowRun = 0;
  for (const v of clamped) {
    if (v < lowThreshold) {
      low += 1;
      currentLowRun += 1;
      longestLowRun = Math.max(longestLowRun, currentLowRun);
    } else currentLowRun = 0;
    if (v < silenceThreshold) silent += 1;
    squares += (v - meanLevel) * (v - meanLevel);
  }

  const lowFrameRatio = low / frames;
  const silenceFrameRatio = silent / frames;
  const levelCv = Math.sqrt(squares / frames) / Math.max(meanLevel, 0.001);
  const speechLike =
    (lowFrameRatio >= SPEECH_LOW_FRAME_RATIO && longestLowRun >= 3)
    || (levelCv >= SPEECH_LEVEL_CV && lowFrameRatio >= 0.14)
    || (silenceFrameRatio >= 0.18 && longestLowRun >= 5);

  return {
    verdict: speechLike ? 'speech' : 'music',
    lowFrameRatio,
    silenceFrameRatio,
    levelCv,
    meanLevel,
    longestLowRun,
    frames,
  };
}

export type MusicPresenceGateState = {
  candidateSince: number | null;
  consecutiveNonMusic: number;
  confirmedNoMusicSince: number | null;
};

export function createMusicPresenceGateState(): MusicPresenceGateState {
  return { candidateSince: null, consecutiveNonMusic: 0, confirmedNoMusicSince: null };
}

export function advanceMusicPresenceGate(state: MusicPresenceGateState, verdict: MusicPresenceVerdict, now: number): MusicPresenceGateState {
  if (verdict === 'music') return createMusicPresenceGateState();
  if (verdict === 'speech' || verdict === 'silence') {
    const candidateSince = state.candidateSince ?? now;
    const consecutiveNonMusic = state.consecutiveNonMusic + 1;
    return {
      candidateSince,
      consecutiveNonMusic,
      confirmedNoMusicSince: consecutiveNonMusic >= REQUIRED_NON_MUSIC_WINDOWS
        ? (state.confirmedNoMusicSince ?? candidateSince)
        : null,
    };
  }
  return state.confirmedNoMusicSince
    ? state
    : { ...state, consecutiveNonMusic: Math.max(0, state.consecutiveNonMusic - 1) };
}

export function keepsListeningAlive(verdict: MusicPresenceVerdict): boolean {
  return verdict === 'music' || verdict === 'unknown';
}
