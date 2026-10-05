import { canRobotSpeak, composeRobotLine, robotCoachCombinationCount, ROBOT_ACTIONS } from '../robotCoachMessages';
import fs from 'fs';
import path from 'path';

describe('Robot coach (Adel 05/10/2026)', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('plus de FREE / de Solo : au plus 2 par jour et 6 h d\'écart', () => {
    expect(canRobotSpeak({}, 'NO_FREE', now)).toBe(true);
    expect(canRobotSpeak({ NO_FREE: { lastAt: now - 3600 * 1000, day: '2026-10-05', count: 1 } }, 'NO_FREE', now)).toBe(false);
    expect(canRobotSpeak({ NO_FREE: { lastAt: now - 7 * 3600 * 1000, day: '2026-10-05', count: 2 } }, 'NO_FREE', now)).toBe(false);
    expect(canRobotSpeak({ NO_FREE: { lastAt: now - 7 * 3600 * 1000, day: '2026-10-05', count: 1 } }, 'NO_FREE', now)).toBe(true);
    expect(canRobotSpeak({ NO_FREE: { lastAt: now - 30 * 3600 * 1000, day: '2026-10-04', count: 2 } }, 'NO_FREE', now)).toBe(true);
  });
  it('sessions : une fois par minute au plus', () => {
    expect(canRobotSpeak({ SESSIONS: { lastAt: now - 20000, day: '2026-10-05', count: 1 } }, 'SESSIONS', now)).toBe(false);
    expect(canRobotSpeak({ SESSIONS: { lastAt: now - 90000, day: '2026-10-05', count: 1 } }, 'SESSIONS', now)).toBe(true);
  });
  it('phrases variées, courtes, avec le nombre de morceaux', () => {
    const lines = new Set(Array.from({ length: 60 }, (_, i) => composeRobotLine('NO_FREE', `s${i}`)));
    expect(lines.size).toBeGreaterThan(8);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(110);
    expect(Array.from({ length: 40 }, (_, i) => composeRobotLine('SESSIONS', `x${i}`, 3)).some((line) => line.includes('3 morceaux'))).toBe(true);
    expect(robotCoachCombinationCount('NO_SOLO')).toBeGreaterThan(80);
  });
  it('un appui mène au bon endroit', () => {
    expect(ROBOT_ACTIONS.SESSIONS.route).toBe('SessionHistory');
    expect(ROBOT_ACTIONS.NO_FREE.route).toBe('Offers');
    expect(ROBOT_ACTIONS.NO_SOLO.route).toBe('Offers');
  });
  it('branché : accueil (FREE), Solo (quota) et fiche rapide des bulles sans story', () => {
    const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
    expect(read('screens', 'HomeScreenCompact.tsx')).not.toContain("robotSay('NO_FREE')"); // Adel 05/10 : plus de bulle verte sur l'accueil
    expect(read('components', 'KeepBattleMobileGameV3.tsx')).toContain("robotSay('NO_SOLO')");
    expect(read('components', 'ProfileStoryBar.tsx')).toContain('setQuickUsername(story.username)');
    expect(read('components', 'MusicSwipeDeckModal.tsx')).toContain('deck-title-profile');
  });
});
