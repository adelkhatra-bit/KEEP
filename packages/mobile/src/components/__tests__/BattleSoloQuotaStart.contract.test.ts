import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Battle Solo quota start contract', () => {
  const game = read(__dirname, '..', 'KeepBattleMobileGameV3.tsx');
  const service = read(__dirname, '..', '..', 'services', 'keepBattleExperienceService.ts');
  const copy = read(__dirname, '..', '..', 'services', 'battleHomeInfo.ts');

  it('does not consume a daily Solo while only preparing the pack', () => {
    const packStart = service.indexOf('export async function loadKeepBattleSoloPack');
    const packEnd = service.indexOf('export async function isKeepBattleEnabled', packStart);
    const packBody = service.slice(packStart, packEnd);
    expect(packBody).not.toContain("rpc('keep_battle_solo_consume_daily_start')");
  });

  it('consumes exactly when the first playable audio has started', () => {
    expect(service).toContain('export async function consumeKeepBattleSoloDailyStart(sessionToken: string)');
    expect(service).toContain("{ p_session_token: token, p_timezone: deviceTimeZone() }");
    expect(game).toContain("const soloDailySessionTokenRef = React.useRef('');");
    expect(game).toContain('const soloDailyConsumedRef = React.useRef(false);');
    expect(game).toContain('soloDailyConsumedRef.current = true;');
    expect(game).toContain('const consumed = await consumeKeepBattleSoloDailyStart(soloDailySessionTokenRef.current);');
    const playable = game.indexOf('if (ok) {');
    const lock = game.indexOf('soloDailyConsumedRef.current = true;', playable);
    const consume = game.indexOf('const consumed = await consumeKeepBattleSoloDailyStart(soloDailySessionTokenRef.current);', lock);
    const ready = game.indexOf('setAudioReady(true)', consume);
    expect(playable).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(playable);
    expect(consume).toBeGreaterThan(lock);
    expect(ready).toBeGreaterThan(consume);
  });

  it('does not subtract the same Solo twice in the quit message', () => {
    expect(copy).toContain('const left = Math.max(0, status.remaining ?? 0);');
    expect(copy).not.toContain('const left = Math.max(0, (status.remaining ?? 0) - 1);');
  });

  it('labels the multiplayer choice EN LIGNE beside SOLO', () => {
    expect(game).toContain('<Text style={s.modeTitle}>SOLO</Text>');
    expect(game).toContain('<Text style={s.modeTitle}>EN LIGNE</Text>');
    expect(game).not.toContain('<Text style={s.modeTitle}>BATTLE</Text>');
  });
});
