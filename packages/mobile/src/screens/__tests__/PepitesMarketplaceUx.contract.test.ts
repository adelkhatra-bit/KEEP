import fs from 'fs';
import path from 'path';

describe('Pépites marketplace professional flow', () => {
  const myMusic = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx'), 'utf8');

  it('separates FREE and euro collections visibly', () => {
    expect(panel).toContain("offerFilter === 'FREE'");
    expect(panel).toContain("offerFilter === 'MONEY'");
    expect(panel).toContain('COLLECTIONS FREE');
    expect(panel).toContain('COLLECTIONS EN EUROS');
  });

  it('uses a clear three-step creation wizard', () => {
    expect(myMusic).toContain('ÉTAPE 1 SUR 3');
    expect(myMusic).toContain('ÉTAPE 2 SUR 3');
    expect(myMusic).toContain('ÉTAPE 3 SUR 3');
    expect(myMusic).toContain("saleWizardCard:{width:'100%',maxWidth:560");
  });

  it('marks and blocks tracks already published instead of silently ignoring taps', () => {
    expect(myMusic).toContain('DÉJÀ PUBLIÉE');
    expect(myMusic).toContain('Déjà dans une collection');
    expect(myMusic).toContain('Gérer la collection');
    expect(myMusic).toContain("lockedByAnotherOffer = Boolean(offered && (!saleEditOfferTarget || !includedInEditedOffer))");
  });

  it('makes payout setup self-testable before euro publishing', () => {
    expect(myMusic).toContain('TESTER MON LIEN');
    expect(myMusic).toContain('testPayoutDirect');
    expect(myMusic).toContain('void Linking.openURL(clean)');
    expect(myMusic).toContain('setMyPayoutLink(clean)');
    expect(myMusic).toContain('ENREGISTRER LE LIEN');
    expect(myMusic).toContain('OUVRIR PAYPAL.ME');
    expect(myMusic).not.toContain("navigation.navigate('ProfileCreatorTools')");
  });
});
