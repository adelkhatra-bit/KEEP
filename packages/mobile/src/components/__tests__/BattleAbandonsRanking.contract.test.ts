import fs from 'fs';
import path from 'path';
import { ABANDON_RANKING_NOTE, soloQuitNotice } from '../../services/battleHomeInfo';

// Adel (02/10/2026, retour d'un joueur) : dire qu'abandonner pèse sur le
// classement, et compter les abandons (Battle + Solo) dans le classement.
const root = path.join(__dirname, '..', '..', '..', '..', '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261003006000_battle_abandons_in_leaderboard.sql'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
const parties = fs.readFileSync(path.join(__dirname, '..', '..', 'screens', 'PartiesScreen.tsx'), 'utf8');

describe('abandons et classement', () => {
  it('quit messages (Solo and Battle) mention the ranking', () => {
    expect(soloQuitNotice({ limit: 10, remaining: 4, unlimited: false })).toContain(ABANDON_RANKING_NOTE);
    expect(soloQuitNotice(null)).toContain(ABANDON_RANKING_NOTE);
    expect(game).toContain('Free seront débités. ${ABANDON_RANKING_NOTE}');
  });

  it('records Battle abandons from the notifications the server already sends, without touching game functions', () => {
    expect(migration).toContain("if new.type in ('BATTLE_ARENA_FORFEIT','BATTLE_ARENA_AFK_ELIMINATED') then");
    expect(migration).toContain('create trigger notifications_record_battle_abandon');
    expect(migration).not.toMatch(/function public\.keep_battle_arena_forfeit/);
  });

  it('counts Solo abandons as started minus finished, never negative', () => {
    expect(migration).toContain('greatest(0, coalesce(sum(u.starts),0) - coalesce((select count(*) from public.keep_battle_solo_history h where h.profile_id = u.profile_id),0))');
  });

  it('ranks fewer abandons first at equal wins and shows them', () => {
    expect(migration).toContain('order by b.wins desc, (coalesce(ba.n,0) + coalesce(sa.n,0)) asc, b.total_score desc');
    expect(migration).toContain('grant execute on function public.keep_battle_global_leaderboard(integer) to anon, authenticated, service_role;');
    expect(parties).toContain("{entry.abandons != null ? ` · ${entry.abandons} abandon${entry.abandons > 1 ? 's' : ''}` : ''}");
  });

  it('is additive (no user content destroyed)', () => {
    expect(migration).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
  });
});
