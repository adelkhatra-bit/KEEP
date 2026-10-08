// @ts-nocheck
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('[ECONOMIE-FREE-ADMIN] clés canoniques et grandfathering', () => {
  const admin = read('packages','admin','pages','plans.tsx');
  const migration = read('supabase','migrations','20261005005000_free_economy_admin_canonical.sql');
  const state = read('PROJECT_STATE.md');

  it('le Super Admin pilote la limite écoute quotidienne et affiche la règle réelle', () => {
    expect(admin).toContain("| 'listens_per_day'");
    expect(admin).toContain("Écoutes reconnues (chaque jour)");
    expect(admin).toContain("une reconnaissance réussie coûte 1 FREE");
    expect(admin).not.toContain("L’écoute reste gratuite.");
  });

  it('les RPC admin lisent et écrivent uniquement les clés nouvelles', () => {
    expect(migration).toContain("key='guest_recognition_limit'");
    expect(migration).toContain("key='signup_bonus_recognitions'");
    expect(migration).toContain("'listens_per_day'");
    expect(migration).not.toContain("key='guest_success_limit'");
    expect(migration).not.toContain("key='signup_bonus_successes'");
  });

  it('la documentation active ne promet plus 23 FREE aux nouveaux comptes', () => {
    expect(state).toContain("nouveau compte = +5 FREE");
    expect(state).not.toContain("bonus inscription (+20 Free) = 23 Free");
  });
});
