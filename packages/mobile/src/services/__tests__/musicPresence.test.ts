import { classifyMusicPresence, keepsListeningAlive, MIN_PRESENCE_FRAMES } from '../musicPresence';

// Enveloppes de niveau 0..1 échantillonnées toutes les ~40 ms, comme onLevel.
const repeat = (frames: number, fn: (i: number) => number) => Array.from({ length: frames }, (_, i) => fn(i));

describe('musicPresence -- musique ou pas musique (arrêt auto de l’écoute)', () => {
  it('musique continue (niveau soutenu avec battements) = music', () => {
    const levels = repeat(120, (i) => 0.62 + 0.18 * Math.sin(i / 3) + (i % 12 === 0 ? 0.15 : 0));
    const r = classifyMusicPresence(levels);
    expect(r.verdict).toBe('music');
    expect(keepsListeningAlive(r.verdict)).toBe(true);
  });

  it('conversation (syllabes puis micro-pauses) = speech, ne maintient pas l’écoute', () => {
    // ~200 ms de voix, ~120 ms de creux, pauses plus longues entre phrases.
    const levels = repeat(120, (i) => {
      if (i % 40 >= 32) return 0; // pause entre phrases
      return i % 8 < 5 ? 0.7 : 0.05;
    });
    const r = classifyMusicPresence(levels);
    expect(r.verdict).toBe('speech');
    expect(keepsListeningAlive(r.verdict)).toBe(false);
  });

  it('pièce silencieuse = silence, ne maintient pas l’écoute', () => {
    const r = classifyMusicPresence(repeat(120, () => 0.01));
    expect(r.verdict).toBe('silence');
    expect(keepsListeningAlive(r.verdict)).toBe(false);
  });

  it('échantillon trop court = unknown, et dans le doute on garde l’écoute', () => {
    const r = classifyMusicPresence(repeat(MIN_PRESENCE_FRAMES - 1, () => 0.5));
    expect(r.verdict).toBe('unknown');
    expect(keepsListeningAlive(r.verdict)).toBe(true);
  });

  it('valeurs hors bornes ignorées sans planter', () => {
    const r = classifyMusicPresence(repeat(80, (i) => (i % 2 ? 5 : -3)));
    expect(['music', 'speech', 'silence']).toContain(r.verdict);
  });
});
