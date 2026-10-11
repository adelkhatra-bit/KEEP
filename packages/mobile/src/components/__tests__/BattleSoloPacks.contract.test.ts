import fs from 'fs';
import path from 'path';

// Adel (02/10/2026) : Solos épuisés → « recharge à 2 h » + packs achetables en
// Free (10 / 25…), vendus par la plateforme, réglables dans le Super Admin ;
// les Solos achetés s'ajoutent et ne se perdent pas.
const root = path.join(__dirname, '..', '..', '..', '..', '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261003007000_battle_solo_packs.sql'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, '..', 'KeepBattleMobileGameV3.tsx'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'packages', 'admin', 'pages', 'remote-config.tsx'), 'utf8');

describe('packs de Solos', () => {
  it('packs are configurable in the Super Admin (10·3 and 25·6 by default)', () => {
    for (const key of ['battle_solo_pack_small_solos', 'battle_solo_pack_small_free', 'battle_solo_pack_large_solos', 'battle_solo_pack_large_free']) {
      expect(migration).toContain(`'${key}'`);
      expect(admin).toContain(`${key}:`);
    }
    expect(migration).toContain("('battle_solo_pack_small_solos', '10'::jsonb");
    expect(migration).toContain("on conflict (key) do nothing;");
  });

  it('bought Solos add to the plan limit and are kept until used', () => {
    expect(migration).toContain('return public.keep_battle_solo_plan_limit(p_uid) + public.keep_battle_solo_bonus_remaining(p_uid);');
    expect(migration).toContain('u.usage_date >= v_first and u.usage_date < public.keep_battle_solo_today()');
  });

  it('the Free balance stays computed: packs are subtracted, never reset', () => {
    expect(migration).toContain('marketplace_adjustment-solo_pack_spent');
    expect(migration).toContain("raise exception 'SOLO_PACK_NOT_ENOUGH_FREE'");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('solo_pack:' || uid::text))");
    expect(migration).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
  });

  it('the app offers the packs when Solos are exhausted, never fakes a card payment', () => {
    expect(game).toContain('＋ ACHETER DES SOLOS');
    expect(game).toContain("{ text: 'Acheter des Solos', onPress: () => { void openSoloPacks(); } },");
    expect(game).toContain('soloRechargeCopy(soloPacks?.packs, soloDailyStatus).full');
    expect(game).not.toContain('Deux packs au choix : +10 Solos ou +25 Solos.');
    expect(game).toContain('Paiement par carte / Apple Pay : bientôt');
    expect(game).toContain("Aucun Free n’a été débité, réessaie dans un instant.");
  });

  it('the exhausted-Solos window keeps 3 buttons max and offers Premium (lot n°5)', () => {
    expect(game).toContain("{ text: 'Passer Premium', onPress: () => { onOpenOffers(); } }");
    expect(game).not.toContain("{ text: 'Jouer en BATTLE', onPress");
    expect(game).toContain('choisis EN LIGNE pour jouer tout de suite');
  });
});
