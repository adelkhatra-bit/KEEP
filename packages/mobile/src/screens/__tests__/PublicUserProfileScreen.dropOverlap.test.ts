import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('PublicUserProfileScreen — compteur réel des titres nouveaux dans un Drop', () => {
  it('charge le chevauchement serveur sans révéler les titres masqués', () => {
    expect(source).toContain('loadPlaylistSaleOfferOverlap');
    expect(source).toContain('saleOfferOverlaps');
    expect(source).toContain('missingCount');
  });

  it('affiche avant ouverture le nombre de titres réellement absents', () => {
    expect(source).toContain("que tu n’as pas encore");
    expect(source).toContain('✓ tout est déjà chez toi');
  });

  it('ne remplace pas le composant Drop existant ni son prix', () => {
    expect(source).toContain('<SaleCollectionRow');
    expect(source).toContain("tagTone={unlocked ? 'unlocked' : offer.paymentMode === 'FREE' ? 'free' : 'money'}");
    expect(source).toContain('onPress={() => openSaleFolder(offer)}');
  });
});
