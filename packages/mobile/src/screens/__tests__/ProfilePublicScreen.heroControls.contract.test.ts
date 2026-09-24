// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs
  .readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('ProfilePublicScreen — owner actions stay together in the hero', () => {
  it('keeps preview, invite/share, sales and Battle controls before the collection', () => {
    const preview = source.indexOf('▶ PRÉVISUALISER MON UNIVERS');
    const invite = source.indexOf('↗ INVITER / PARTAGER');
    const sales = source.indexOf("playlistSaleOffers.length > 0 ? '💰 GÉRER MES VENTES' : '💰 VENDRE'");
    const battle = source.indexOf('⚡ BATTLE · {battleAvailable');
    const collection = source.indexOf('<View style={s.collectionHeader}>');

    expect(preview).toBeGreaterThanOrEqual(0);
    expect(invite).toBeGreaterThan(preview);
    expect(sales).toBeGreaterThan(invite);
    expect(battle).toBeGreaterThan(sales);
    expect(collection).toBeGreaterThan(battle);
  });

  it('keeps offer status and Battle help local to their controls', () => {
    expect(source).toContain("{playlistSaleOffers.length} offre{playlistSaleOffers.length > 1 ? 's' : ''} active");
    expect(source).toContain("Les autres peuvent t’inviter maintenant.");
    expect(source).toContain("Active pour recevoir des défis.");
    expect(source).toContain("visite le profil d’un joueur disponible ou ouvre Soirées → Loki Music BATTLE");
  });

  it('does not reintroduce the old duplicate sales status block below the hero', () => {
    expect(source).not.toContain('style={s.ownOffersStatus}');
    expect(source).not.toContain('Gérer mes découvertes en vente');
  });
});
