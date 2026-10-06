import { composeVisitorInvite, visitorInviteVariantCount } from '../visitorInvite';
describe('invitation du visiteur par le robot', () => {
  it('nomme la personne qui a invité, sans double arobase', () => {
    expect(composeVisitorInvite('@bruno')).toContain('@bruno');
    expect(composeVisitorInvite('@bruno')).not.toContain('@@');
  });
  it('plusieurs formulations, aucune vide, repli si pas de nom', () => {
    const seen = new Set(['a', 'bruno', 'chloe', 'dylan', 'emma', 'farid', 'gaia', 'hugo'].map((n) => composeVisitorInvite(n).replace(n, 'X')));
    expect(visitorInviteVariantCount).toBeGreaterThanOrEqual(4);
    expect(seen.size).toBeGreaterThan(1);
    expect(composeVisitorInvite('')).toContain('@un ami');
  });
  it('parle d’inscription, d’abonnement et de rangement des plateformes', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => composeVisitorInvite('x', i)).join(' ');
    expect(all).toMatch(/plateformes/);
    expect(all).toMatch(/compte|Inscris|Rejoins|Connecte/);
  });
});
