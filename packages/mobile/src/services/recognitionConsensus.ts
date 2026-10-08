import type { RecognitionResult } from '@keep/music';

export type RecognitionConsensusState = {
  signature: string;
  hits: number;
  scoreSum: number;
  maxScore: number;
  firstSeenAt: number;
};

const WINDOW_MS = 90 * 1000;
const MIN_CANDIDATE_SCORE = 20;
const MIN_ACCEPT_HITS = 2;
const MIN_ACCEPT_SCORE_SUM = 60;
const MIN_ACCEPT_MAX_SCORE = 35;

function signatureOf(recognition: RecognitionResult) {
  const norm = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return `${norm(recognition.artist)}|${norm(recognition.title)}`;
}

export function updateRecognitionConsensus(
  previous: RecognitionConsensusState | null,
  candidate: RecognitionResult | null | undefined,
  rawScore: number,
  now = Date.now(),
): { state: RecognitionConsensusState | null; accepted: RecognitionResult | null } {
  if (!candidate?.title || !candidate?.artist || !Number.isFinite(rawScore) || rawScore < MIN_CANDIDATE_SCORE) {
    return { state: previous && now - previous.firstSeenAt <= WINDOW_MS ? previous : null, accepted: null };
  }
  const signature = signatureOf(candidate);
  const same = previous && previous.signature === signature && now - previous.firstSeenAt <= WINDOW_MS;
  const state: RecognitionConsensusState = same
    ? { ...previous, hits: previous.hits + 1, scoreSum: previous.scoreSum + rawScore, maxScore: Math.max(previous.maxScore, rawScore) }
    : { signature, hits: 1, scoreSum: rawScore, maxScore: rawScore, firstSeenAt: now };
  const accepted = state.hits >= MIN_ACCEPT_HITS && state.scoreSum >= MIN_ACCEPT_SCORE_SUM && state.maxScore >= MIN_ACCEPT_MAX_SCORE
    ? candidate : null;
  return { state: accepted ? null : state, accepted };
}
