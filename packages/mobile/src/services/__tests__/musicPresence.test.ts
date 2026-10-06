import {
  advanceMusicPresenceGate,
  classifyMusicPresence,
  createMusicPresenceGateState,
  keepsListeningAlive,
  MIN_PRESENCE_FRAMES,
} from '../musicPresence';

const repeat = (frames: number, fn: (i: number) => number) => Array.from({ length: frames }, (_, i) => fn(i));

describe('musicPresence -- musique / voix / silence + hystérésis arrêt auto', () => {
  it('musique continue avec battements = music', () => {
    const levels = repeat(120, (i) => 0.62 + 0.18 * Math.sin(i / 3) + (i % 12 === 0 ? 0.15 : 0));
    const r = classifyMusicPresence(levels);
    expect(r.verdict).toBe('music');
    expect(keepsListeningAlive(r.verdict)).toBe(true);
  });

  it('conversation avec syllabes et pauses = speech', () => {
    const levels = repeat(120, (i) => {
      if (i % 40 >= 32) return 0;
      return i % 8 < 5 ? 0.7 : 0.05;
    });
    const r = classifyMusicPresence(levels);
    expect(r.verdict).toBe('speech');
    expect(r.longestLowRun).toBeGreaterThanOrEqual(3);
  });

  it('silence = silence', () => {
    expect(classifyMusicPresence(repeat(120, () => 0.01)).verdict).toBe('silence');
  });

  it('échantillon incomplet reste neutre', () => {
    expect(classifyMusicPresence(repeat(MIN_PRESENCE_FRAMES - 1, () => 0.5)).verdict).toBe('unknown');
  });

  it('une seule fenêtre voix ne déclenche jamais le chrono', () => {
    const one = advanceMusicPresenceGate(createMusicPresenceGateState(), 'speech', 1000);
    expect(one.confirmedNoMusicSince).toBeNull();
  });

  it('deux fenêtres sans musique arment le chrono', () => {
    const one = advanceMusicPresenceGate(createMusicPresenceGateState(), 'speech', 1000);
    const two = advanceMusicPresenceGate(one, 'silence', 6000);
    expect(two.confirmedNoMusicSince).toBe(1000);
  });

  it('le retour de musique annule immédiatement le chrono', () => {
    let gate = advanceMusicPresenceGate(createMusicPresenceGateState(), 'speech', 1000);
    gate = advanceMusicPresenceGate(gate, 'silence', 6000);
    gate = advanceMusicPresenceGate(gate, 'music', 7000);
    expect(gate.confirmedNoMusicSince).toBeNull();
    expect(gate.consecutiveNonMusic).toBe(0);
  });
});
