import fs from 'fs';
import path from 'path';

// Lot n°9.2 (05/10/2026) : l'écran Offres se lit en 5 secondes — trois cartes
// (Gratuit · Premium · Recharger FREE) ; les textes longs sont repliés dans
// « En savoir plus », jamais supprimés.
const root = path.join(__dirname, '..', '..', '..', '..', '..');
const offers = fs.readFileSync(path.join(__dirname, '..', 'OffersScreen.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261005060000_premium_price_4_99.sql'), 'utf8');

describe('Offres — choix rapide', () => {
  it('shows the three cards before the long explanations', () => {
    const quick = offers.indexOf('offers-quick-free');
    const promise = offers.indexOf('<View style={s.promiseCard}>');
    expect(quick).toBeGreaterThan(0);
    expect(quick).toBeLessThan(promise);
    for (const id of ['offers-quick-free', 'offers-quick-premium', 'offers-quick-recharge']) expect(offers).toContain(id);
  });

  it('folds long texts behind "En savoir plus" without deleting them', () => {
    expect(offers).toContain('{introExpanded ? <>');
    expect(offers).toContain('COMMENT LOKI MUSIC GRANDIT AVEC TOI');
    expect(offers).toContain('TA MISSION POUR DÉMARRER');
  });

  it('Premium and recharge cards lead somewhere (no dead button)', () => {
    expect(offers).toContain("setExpandedPlanCode('PREMIUM'); scrollToSection('plans')");
    expect(offers).toContain("scrollToSection('recharge')");
    expect(offers).toContain('sectionY.current.recharge');
    expect(offers).toContain('sectionY.current.plans');
  });

  it('Premium price migration only touches the displayed EUR monthly price', () => {
    expect(migration).toContain('4.99');
    expect(migration).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
    expect(migration).not.toMatch(/update public\.subscriptions/i);
  });
});
