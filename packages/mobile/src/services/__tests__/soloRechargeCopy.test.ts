import { soloRechargeCopy } from '../battleHomeInfo';

// Adel (02/10/2026) : « ou attends la recharge de 2 h ça ne veut rien dire,
// marque ce que ça recharge, le prix, et un En savoir plus ».
describe('Bouton « Recharger mes Solos » : texte clair', () => {
  const status = { limit: 10, remaining: 0, unlimited: false };

  it('affiche sous le bouton le pack et son prix réglés dans le Super Admin', () => {
    const copy = soloRechargeCopy([{ code: 'SMALL', solos: 12, free: 4 }, { code: 'LARGE', solos: 30, free: 7 }], status);
    expect(copy.hint).toBe('+12 Solos pour 4 Free');
    expect(copy.full).toContain('12 Solos pour 4 Free, ou 30 Solos pour 7 Free');
  });

  it('valeurs par défaut (10 Solos · 3 Free) tant que les packs ne sont pas chargés', () => {
    expect(soloRechargeCopy(null, status).hint).toBe('+10 Solos pour 3 Free');
  });

  it('« En savoir plus » dit quand les Free sont retirés et ce qui revient gratuitement', () => {
    const { short, full } = soloRechargeCopy(null, status);
    expect(short).toBe('En savoir plus sur la recharge');
    expect(full).toContain('retiré de ton solde de Free au moment où tu confirmes');
    expect(full).toContain('Tes 10 Solos gratuits reviennent automatiquement chaque nuit à 2 h');
    expect(full).not.toMatch(/attends la recharge/);
  });
});
