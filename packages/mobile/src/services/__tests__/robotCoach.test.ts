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

describe('Robot intelligent et jeune (Adel 05/10/2026)', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  it('salut personnel avec le pseudo, jeune, jamais la même phrase', () => {
    const lines = Array.from({ length: 80 }, (_, i) => composeRobotLine('GREETING', `g${i}`, 0, '@teyou'));
    expect(new Set(lines).size).toBeGreaterThan(20);
    for (const line of lines) {
      expect(line).toContain('@teyou 👋');
      expect(line.length).toBeLessThanOrEqual(120);
    }
    expect(lines.some((line) => /salon|amis|collègues|communauté|musique/i.test(line))).toBe(true);
    expect(composeRobotLine('GREETING', 'x', 0, '')).toMatch(/👋/);
    expect(robotCoachCombinationCount('GREETING')).toBeGreaterThanOrEqual(100);
  });
  it('solde bas : dit le nombre restant et propose d’en gagner (Battle / parrainage)', () => {
    const lines = Array.from({ length: 60 }, (_, i) => composeRobotLine('LOW_FREE', `l${i}`, 2));
    for (const line of lines) { expect(line).toContain('2 FREE'); expect(line).not.toContain('{n}'); expect(line.length).toBeLessThanOrEqual(110); }
    expect(lines.some((line) => /Battle|Parraine|lien/.test(line))).toBe(true);
    expect(composeRobotLine('LOW_FREE', 'z', 1)).not.toContain('1 FREE restants');
  });
  it('plus de FREE : propose aussi d’en gagner, pas seulement de recharger', () => {
    const lines = Array.from({ length: 80 }, (_, i) => composeRobotLine('NO_FREE', `n${i}`));
    expect(lines.some((line) => /Battle|parrain/i.test(line))).toBe(true);
  });
  it('jamais envahissant : salut 2/jour et 6 h d’écart, solde bas 1/jour et 12 h', () => {
    expect(canRobotSpeak({ GREETING: { lastAt: now - 3600 * 1000, day: '2026-10-05', count: 1 } }, 'GREETING', now)).toBe(false);
    expect(canRobotSpeak({ GREETING: { lastAt: now - 7 * 3600 * 1000, day: '2026-10-05', count: 2 } }, 'GREETING', now)).toBe(false);
    expect(canRobotSpeak({ GREETING: { lastAt: now - 7 * 3600 * 1000, day: '2026-10-05', count: 1 } }, 'GREETING', now)).toBe(true);
    expect(canRobotSpeak({ LOW_FREE: { lastAt: now - 13 * 3600 * 1000, day: '2026-10-05', count: 1 } }, 'LOW_FREE', now)).toBe(false);
    expect(ROBOT_ACTIONS.LOW_FREE.route).toBe('Offers');
  });
  it('branché : accueil à l’ouverture, secousse, vibration, appui du salut = salon', () => {
    const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
    const dock = read('components', 'GlobalChatDock.tsx');
    expect(dock).toContain('robotWelcome(welcomeUserId, welcomeUsername');
    expect(dock).toContain('robotShake');
    expect(dock).toContain("if (kind === 'GREETING') { useGlobalChatStore.getState().open(); return; }");
    const svc = read('services', 'robotCoachService.ts');
    expect(svc).toContain('Vibration.vibrate(kind ===');
    expect(svc).toContain("robotSay('LOW_FREE'");
    expect(svc).toContain("robotSay('GREETING'");
  });
});
