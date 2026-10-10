import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : « samedi a perdu 3 Free ». Battle Arène où tous les
// joueurs ont été sortis dans la même manche pour absence : personne ne
// gagnait et les mises disparaissaient. Partie abandonnée = mises rendues.
const migration = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261003003000_battle_arena_all_absent_refund.sql'),
  'utf8',
);

describe('Battle Arène : partie abandonnée par tous', () => {
  it('detects that every remaining player is absent at once', () => {
    expect(migration).toContain('abandoned := absent_count>0 and absent_count=active_count;');
  });

  it('refunds the stake (RELEASED, no LOSS event) when nobody can win', () => {
    expect(migration).toMatch(/if abandoned then\s+update public\.keep_battle_arena_credit_holds set status='RELEASED'/);
  });

  it('keeps the 02/09 rule when others are still playing (absent player loses to the pot)', () => {
    expect(migration).toContain("values(a.id,a.match_no,afk.profile_id,'LOSS',-held)");
    expect(migration).toContain('Tu as manqué 3 questions d’affilée : tu es sorti de la partie et as perdu ta mise.');
  });

  it('explains the refund in the notification', () => {
    expect(migration).toContain('Personne ne perd : ta mise de %s Free t’est rendue.');
  });
});
