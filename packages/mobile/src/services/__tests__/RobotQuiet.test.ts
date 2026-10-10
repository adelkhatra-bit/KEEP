jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));
import fs from 'fs';
import path from 'path';
import { composeQuietOffer, DISMISS_WINDOW_MS, pushDismissal, QUIET_ACTIONS, isRobotQuiet, setRobotQuiet } from '../robotQuietService';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

describe('Robot discret : fermer une info, silence proposé après 3 fermetures', () => {
  it('la 3e fermeture en 20 min déclenche l\'offre, pas avant, pas si espacées', () => {
    const t0 = 1_000_000;
    let r = pushDismissal([], t0); expect(r.offerQuiet).toBe(false);
    r = pushDismissal(r.history, t0 + 1000); expect(r.offerQuiet).toBe(false);
    r = pushDismissal(r.history, t0 + 2000); expect(r.offerQuiet).toBe(true);
    expect(r.history).toEqual([]);
    const spaced = pushDismissal(pushDismissal([t0], t0 + DISMISS_WINDOW_MS + 5).history, t0 + DISMISS_WINDOW_MS * 2 + 10);
    expect(spaced.offerQuiet).toBe(false);
  });
  it('offre avec punchline et deux boutons', () => {
    const offer = composeQuietOffer(1);
    expect(offer.text.length).toBeGreaterThan(30);
    expect(QUIET_ACTIONS.map((a) => a.key)).toEqual(['QUIET', 'CONTINUE']);
  });
  it('silence de 2 h mémorisé', async () => {
    expect(await isRobotQuiet(1000)).toBe(false);
    await setRobotQuiet(2 * 3600 * 1000, 1000);
    expect(await isRobotQuiet(5000)).toBe(true);
    expect(await isRobotQuiet(1000 + 3 * 3600 * 1000)).toBe(false);
  });
  it('bulle et bandeau se ferment d\'un toucher, via le même service', () => {
    expect(src('src/components/GlobalChatDock.tsx')).toContain('testID="robot-says-close"');
    expect(src('src/components/LedTicker.tsx')).toContain('onDismiss');
    expect(src('src/screens/HomeScreenCompact.tsx')).toContain('closeRobotInfo');
    expect(src('src/services/robotCoachService.ts')).toContain("await isRobotQuiet()");
  });
});
