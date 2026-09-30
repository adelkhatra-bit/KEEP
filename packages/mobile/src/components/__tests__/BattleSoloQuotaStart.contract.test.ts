import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Battle Solo quota start contract', () => {
  const game = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const service = read(__dirname, '..', '..', 'services', 'keepBattleExperienceService.ts');

  it('does not consume a daily Solo while only preparing the pack', () => {
    const packStart = service.indexOf('export async function loadKeepBattleSoloPack');
    const packEnd = service.indexOf('export async function isKeepBattleEnabled', packStart);
    const packBody = service.slice(packStart, packEnd);
    expect(packBody).not.toContain("rpc('keep_battle_solo_consume_daily_start')");
  });

  it('consumes exactly when the first playable audio has started', () => {
    expect(service).toContain('export async function consumeKeepBattleSoloDailyStart');
    expect(game).toContain('const soloDailyConsumedRef = React.useRef(false);');
    expect(game).toContain('const consumed = await consumeKeepBattleSoloDailyStart();');
    const playable = game.indexOf('if (ok) {');
    const consume = game.indexOf('const consumed = await consumeKeepBattleSoloDailyStart();');
    expect(playable).toBeGreaterThanOrEqual(0);
    expect(consume).toBeGreaterThan(playable);
  });

  it('labels the multiplayer choice EN LIGNE beside SOLO', () => {
    expect(game).toContain('<Text style={s.modeTitle}>SOLO</Text>');
    expect(game).toContain('<Text style={s.modeTitle}>EN LIGNE</Text>');
    expect(game).not.toContain('<Text style={s.modeTitle}>BATTLE</Text>');
  });
});
