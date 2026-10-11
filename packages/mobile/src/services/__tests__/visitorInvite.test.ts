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
  it('message rapide du robot : 5 mots maximum (Adel 06/10/2026)', () => {
    ['x', 'bruno', 'chloe', 'dylan', 'emma'].forEach((n) => expect(composeVisitorInvite(n).split(/\s+/).length).toBeLessThanOrEqual(5));
  });
});
