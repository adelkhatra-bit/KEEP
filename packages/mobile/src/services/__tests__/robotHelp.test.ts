import { composeWelcomeBack, spokenWelcome, composeCall, shouldWelcomeBack, TapSummonDetector, HELP_ACTIONS, pickTip, WELCOME_BACK_AFTER_MS } from '../robotHelp';

describe('robot d’accueil et d’aide (Adel, 06/10/2026)', () => {
  it('salut avec le pseudo SANS arobase, proposition de Solo et de Loki Pulse, formulations variées', () => {
    const lines = new Set(Array.from({ length: 40 }, (_, i) => composeWelcomeBack('@Adel', i)));
    expect(lines.size).toBeGreaterThan(8);
    for (const line of lines) {
      expect(line).toContain('Adel');
      expect(line).not.toContain('@');
      expect(line).toMatch(/Solo/);
      expect(line).toMatch(/Loki Pulse/);
      expect(line).toMatch(/communauté/);
    }
  });
  it('version parlée : sans emoji', () => {
    expect(spokenWelcome('Adel', 3)).not.toMatch(/[\u{1F300}-\u{1FAFF}✨]/u);
    expect(spokenWelcome('Adel', 3)).toContain('Adel');
  });
  it('appel : « Qu’est-ce que je peux faire pour toi, pseudo ? »', () => {
    expect(composeCall('@Adel', 0)).toContain('Adel');
    expect(composeCall('Adel', 1)).toContain('?');
    expect(composeCall('@Adel', 2)).not.toContain('@');
  });
  it('salut seulement après une absence de 4 h (ou première ouverture)', () => {
    const now = 1_000_000_000;
    expect(shouldWelcomeBack(null, now)).toBe(true);
    expect(shouldWelcomeBack(now - 3600 * 1000, now)).toBe(false);
    expect(shouldWelcomeBack(now - WELCOME_BACK_AFTER_MS, now)).toBe(true);
  });
  it('trois propositions qui mènent au bon endroit, avec une explication à l’arrivée', () => {
    expect(HELP_ACTIONS.map((a) => a.key)).toEqual(['SOLO', 'PULSE', 'COMMUNITY']);
    expect(HELP_ACTIONS[0].params).toMatchObject({ screen: 'Parties', params: { openBattle: true } });
    expect(HELP_ACTIONS[1].params).toMatchObject({ screen: 'Listen' });
    expect(HELP_ACTIONS[2].params).toMatchObject({ screen: 'Profile' });
    for (const a of HELP_ACTIONS) expect(pickTip(a.key, 1).length).toBeGreaterThan(20);
  });
  it('5 touchers rapprochés appellent le robot ; espacés ou éloignés non', () => {
    const d = new TapSummonDetector();
    expect([0, 300, 600, 900].map((t, i) => d.tap(100 + i, 200, t))).toEqual([false, false, false, false]);
    expect(d.tap(102, 201, 1200)).toBe(true);
    const slow = new TapSummonDetector();
    expect([0, 1000, 2000, 3000, 4000].map((t) => slow.tap(50, 50, t)).some(Boolean)).toBe(false);
    const far = new TapSummonDetector();
    expect([0, 200, 400, 600, 800].map((t, i) => far.tap(20 + i * 120, 20, t)).some(Boolean)).toBe(false);
  });
});

import * as fs from 'fs';
import * as path from 'path';
describe('branchement du robot d’aide', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('trois boutons dans la bulle, navigation directe, explication à l’arrivée, appel par 5 touchers non intrusif', () => {
    const dock = read('../../components/GlobalChatDock.tsx');
    expect(dock).toContain('testID={`robot-action-${action.key}`}');
    expect(dock).toContain('robotExplain(action.key)');
    expect(read('../../../index.js')).toContain('React.createElement(RobotSummonWrapper, null, React.createElement(App))');
    const wrapper = read('../../components/RobotSummonWrapper.tsx');
    expect(wrapper).toContain('onStartShouldSetResponderCapture');
    expect(wrapper).toContain('return false;');
    expect(wrapper).toContain('isGameInProgress');
    expect(read('../robotCoachService.ts')).toContain('export async function summonRobot');
  });
});
