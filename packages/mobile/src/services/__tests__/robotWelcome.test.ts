jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, Vibration: { vibrate: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return { __esModule: true, default: { getItem: async (k: string) => store[k] ?? null, setItem: async (k: string, v: string) => { store[k] = v; }, removeItem: async (k: string) => { delete store[k]; } } };
});
jest.mock('../../store/useRobotMessageStore', () => {
  let message: any = null;
  return { useRobotMessageStore: { getState: () => ({ message, say: (kind: string, text: string) => { message = { id: Date.now(), kind, text }; }, dismiss: () => { message = null; } }) } };
});
let mockGame = false;
jest.mock('../../store/useGameSessionStore', () => ({ useGameSessionStore: { getState: () => ({ isGameInProgress: mockGame }) } }));
jest.mock('../notificationSoundService', () => ({ playNotificationCue: jest.fn(async () => {}) }));

const run = async (balance: number | null, profile = 'p1') => {
  let kind = '';
  let text = '';
  await jest.isolateModulesAsync(async () => {
    const { robotWelcome } = require('../robotCoachService');
    const { useRobotMessageStore } = require('../../store/useRobotMessageStore');
    await robotWelcome(profile, 'teyou', async () => balance);
    const message = useRobotMessageStore.getState().message;
    kind = message?.kind ?? '';
    text = message?.text ?? '';
  });
  return { kind, text };
};

describe('accueil du robot à l’ouverture (Adel 05/10/2026)', () => {
  it('solde à zéro → message « plus de FREE »', async () => { expect((await run(0)).kind).toBe('NO_FREE'); });
  it('solde bas → prévient avec le nombre restant', async () => {
    const r = await run(2);
    expect(r.kind).toBe('LOW_FREE');
    expect(r.text).toContain('2 FREE');
  });
  it('solde confortable → salut avec le pseudo', async () => {
    const r = await run(40);
    expect(r.kind).toBe('GREETING');
    expect(r.text).toContain('@teyou');
  });
  it('solde inconnu (réseau) → salut, jamais de faux avertissement', async () => { expect((await run(null)).kind).toBe('GREETING'); });
  it('une seule fois par lancement et par compte', async () => {
    let first = '';
    let second = '';
    await jest.isolateModulesAsync(async () => {
      const { robotWelcome } = require('../robotCoachService');
      const { useRobotMessageStore } = require('../../store/useRobotMessageStore');
      await robotWelcome('p9', 'teyou', async () => 40);
      first = useRobotMessageStore.getState().message?.text ?? '';
      useRobotMessageStore.getState().dismiss();
      await robotWelcome('p9', 'teyou', async () => 40);
      second = useRobotMessageStore.getState().message?.text ?? '';
    });
    expect(first).not.toBe('');
    expect(second).toBe('');
  });
});

describe('règles de bonne conduite du robot (Adel 05/10/2026)', () => {
  it('jamais pendant un Solo ou un Battle en ligne', async () => {
    mockGame = true;
    const r = await run(0, 'p-game');
    mockGame = false;
    expect(r.kind).toBe('');
  });
  it('jamais deux messages en même temps', async () => {
    let second = true;
    await jest.isolateModulesAsync(async () => {
      const { robotSay } = require('../robotCoachService');
      expect(await robotSay('GREETING', { username: 'a' })).toBe(true);
      second = await robotSay('SESSIONS', { count: 2 });
    });
    expect(second).toBe(false);
  });
  it('la bulle se ferme en la balayant sur le côté', () => {
    const fs = require('fs'); const path = require('path');
    const dock = fs.readFileSync(path.join(__dirname, '../../components/GlobalChatDock.tsx'), 'utf8');
    expect(dock).toContain('robotSwipe.panHandlers');
    expect(dock).toContain('onMoveShouldSetPanResponderCapture');
  });
});
