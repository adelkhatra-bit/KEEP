import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261014001000_solo_exact_requested_rounds.sql'),
  'utf8',
);
const client = fs.readFileSync(path.resolve(__dirname, '..', 'keepBattleExperienceService.ts'), 'utf8');
const game = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx'), 'utf8');

describe('Solo 8/8 or recoverable error, never silent 7/8', () => {
  test('draws spare candidates BEFORE validation and caps the final questions exactly', () => {
    expect(migration).toContain('greatest(v_round_count + 12, v_round_count * 3)');
    expect(migration).toContain('valid_choices as (');
    expect(migration).toContain('where jsonb_array_length(x.choices)=4');
    expect(migration).toContain('selected as (');
    expect(migration).toContain('select * from valid_choices order by position limit v_round_count');
    expect(migration).toContain('numbered as (');
    expect(migration).toContain('row_number() over(order by position)::integer as final_position');
    expect(migration).toContain("'position',x.final_position");
    expect(migration).toContain('if jsonb_array_length(coalesce(v_rounds,\'[]\'::jsonb)) <> v_round_count then');
  });

  test('preserves four different and country-correct artist choices', () => {
    expect(migration).toContain('d.country_code is not distinct from p.country_code');
    expect(migration).toContain('d.display_artist_key<>p.display_artist_key');
    expect(migration).toContain('count(distinct regexp_replace');
    expect(migration).toContain('BATTLE_THEME_CATALOG_TOO_SMALL');
    expect(migration).toContain('keep_battle_remember_content');
    expect(migration).toContain("'stakeFree',0,'rewardFree',0");
  });

  test('client refuses a partial 7/8 response BEFORE opening a game', () => {
    expect(client).toContain('const expectedRoundCount = Math.max(5, Math.min(roundCount, 30))');
    expect(client).toContain('rounds.length !== expectedRoundCount');
    expect(client).toContain('Number(raw.roundCount) !== expectedRoundCount');
    expect(client).toContain('BATTLE_THEME_CATALOG_TOO_SMALL: requested=');
    expect(game).toContain("loadKeepBattleSoloPack('MIX', roundCount, undefined)");
  });
});
