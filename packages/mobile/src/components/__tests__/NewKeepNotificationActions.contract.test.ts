// @ts-nocheck
import fs from 'fs';
import path from 'path';

const actions = fs.readFileSync(path.resolve(__dirname, '..', 'NewKeepNotificationActions.tsx'), 'utf8').replace(/\r\n/g, '\n');
const notifications = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'NotificationsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('notification Nouveau morceau — écoute, garder, abonnement', () => {
  it('cache totalement le bouton AJOUTER GRATUITEMENT si le morceau est déjà possédé', () => {
    expect(actions).toContain('if (owned || kept) {');
    const ownedBranch = actions.slice(actions.indexOf('if (owned || kept) {'), actions.indexOf('return (', actions.indexOf('if (owned || kept) {')) + 7);
    expect(ownedBranch).toContain('✓ DÉJÀ DANS TA COLLECTION');
    expect(ownedBranch).not.toContain('testID="new-keep-keep"');
    expect(ownedBranch).not.toContain('AJOUTER GRATUITEMENT');
  });

  it('permet de réécouter puis de garder en Public ou Privé', () => {
    expect(actions).toContain('testID="new-keep-listen"');
    expect(actions).toContain('testID="new-keep-keep"');
    expect(actions).toContain("{ text: 'Privé'");
    expect(actions).toContain("{ text: 'Public'");
    expect(actions).toContain('AJOUTER GRATUITEMENT');
    expect(actions).toContain('sans retirer de Free');
  });

  it('propose uniquement S’ABONNER tant que le profil n’est pas suivi', () => {
    expect(actions).toContain('testID="new-keep-follow"');
    expect(actions).toContain("'+ S’ABONNER'");
    expect(actions).toContain('followingOwner');
    expect(actions).not.toContain('Se désabonner');
  });

  it('transforme ensuite le CTA en VOIR LE PROFIL et charge les abonnements en une requête groupée', () => {
    expect(actions).toContain('VOIR LE PROFIL');
    expect(notifications).toContain(".in('followee_id', ownerIds)");
    expect(notifications).toContain("supabase.rpc('keep_follow_profile'");
    expect(notifications).not.toContain("keep_unfollow_profile");
  });
});
