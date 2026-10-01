import fs from 'fs';
import path from 'path';

describe('Pépites collection creation UX', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');
  const music = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');

  it('separates FREE and euro collections visibly', () => {
    expect(panel).toContain("offerFilter");
    expect(panel).toContain("['FREE', '⚡ FREE'");
    expect(panel).toContain("['MONEY', '€ EUROS'");
    expect(panel).toContain('offerCardFree');
    expect(panel).toContain('offerCardMoney');
  });

  it('prevents duplicate tracks and explains why with a popup', () => {
    expect(music).toContain("'Déjà publiée'");
    expect(music).toContain('Un morceau ne peut pas être ajouté deux fois');
    expect(music).toContain("'◆ DÉJÀ PUBLIÉE'");
    expect(music).toContain("Boolean(offered && (!saleEditOfferTarget || !includedInEditedOffer))");
  });

  it('uses a roomy three-step wizard', () => {
    expect(music).toContain('ÉTAPE 1 SUR 3');
    expect(music).toContain('ÉTAPE 2 SUR 3');
    expect(music).toContain('ÉTAPE 3 SUR 3');
    expect(music).toContain('saleModalScroll');
    expect(music).toContain('showsVerticalScrollIndicator={false}');
  });

  it('configures PayPal directly in the collection flow with no dead route', () => {
    expect(music).toContain('setMyPayoutLink(clean)');
    expect(music).toContain("Linking.openURL('https://www.paypal.com/paypalme/')");
    expect(music).toContain('ENREGISTRER LE LIEN');
    expect(music).not.toContain("navigation.navigate('ProfileCreatorTools')");
  });
});
