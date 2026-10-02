import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const boutique = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'SellerBoutique.tsx'), 'utf8');

describe('PublicUserProfileScreen — compteur réel des titres nouveaux dans un Drop', () => {
  it('charge le chevauchement serveur sans révéler les titres masqués', () => {
    expect(source).toContain('loadPlaylistSaleOfferOverlap');
    expect(source).toContain('saleOfferOverlaps');
    expect(source).toContain('missingCount');
  });

  it('affiche avant ouverture le nombre de titres réellement absents', () => {
    // 02/10/2026 : boutique vendeur validée par Adel (SellerBoutique : Drop du moment 3 max + étagère + boutique).
    expect(source).toContain('overlaps={saleOfferOverlaps}');
    expect(boutique).toContain("NOUVEAU{overlap.missingCount > 1 ? 'X' : ''}");
    expect(boutique).toContain('✓ DÉJÀ CHEZ TOI');
    expect(boutique).toContain("nouveau${dropNew > 1 ? 'x' : ''} pour toi");
  });

  it('ne remplace pas le composant Drop existant ni son prix', () => {
    expect(source).toContain('<SellerBoutique');
    expect(boutique).toContain("const free = offer.paymentMode === 'FREE';");
    expect(boutique).toContain('✓ DÉBLOQUÉE');
    expect(source).toContain('onOpenOffer={(offer) => openSaleFolder(offer)}');
  });
});
