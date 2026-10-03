// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PlaylistSaleImmersivePreview — compact unlock popup', () => {
  const source = readNormalized(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx');
  const profile = readNormalized(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx');

  it('loads only masked previews and keeps swipe navigation', () => {
    expect(source).toContain("import SwipeDeck from './SwipeDeck';");
    expect(source).toContain('loadPlaylistSaleOfferPreviewTracks(offer.playlistId, offer.offerId)');
    expect(source).toContain('<SwipeDeck');
    expect(source).toContain('onSwipeLeft={() => { unlockWebAudioForGesture(); playTrackAt(trackIndex - 1); }}');
    expect(source).toContain('onSwipeRight={() => { unlockWebAudioForGesture(); playTrackAt(trackIndex + 1); }}');
    expect(source).not.toMatch(/track\.(title|artist|artworkUrl)/);
  });

  it('starts the first masked excerpt after the opening gesture and never auto-advances to another track', () => {
    expect(source).toContain('if (loaded.length > 0) playTrackAt(0);');
    expect(source).toContain('() => { clearCountdown(); setPlaying(false); setSecondsLeft(0); }');
    expect(source).not.toContain('() => { clearCountdown(); playTrackAt(safeIdx + 1); }');
    expect(source).toContain('SUIVANT ›');
  });

  it('keeps the seller profile and total price aligned on one compact row', () => {
    expect(source).toContain('style={s.sellerPriceRow}');
    expect(source).toContain('<Text style={s.profileLinkText}>{normalizedUsername}</Text>');
    expect(source).toContain("freeAccess ? 'FREE' : 'PAYPAL'");
    expect(profile).toContain("navigation.navigate('PublicProfile', { username: profile.username })");
  });

  it('shows a red inline shortage state and a direct FREE recharge action', () => {
    expect(source).toContain('FREE INSUFFISANTS');
    expect(source).toContain('RECHARGER MES FREE');
    expect(source).toContain('freeBlocked');
    expect(source).toContain('disabled={!waiverAccepted || busy || freeBlocked || allAlreadyOwned}');
    expect(source).toContain("backgroundColor: 'rgba(255,92,114,0.10)'");
    expect(profile).toContain("navigation.navigate('Offers', { sourceFeature: 'PLAYLIST_FREE_SHORTFALL' })");
  });

  it('keeps explicit confirmation but uses short FREE wording', () => {
    expect(source).toContain('const [waiverAccepted, setWaiverAccepted] = useState(false);');
    expect(source).toContain('setWaiverAccepted(false);');
    expect(source).not.toContain("loadMarketplacePaymentTermsAccepted()");
    expect(source).toContain("acceptMarketplacePaymentTerms('playlist_sale')");
    expect(source).toContain('CONDITIONS À ACCEPTER');
    expect(source).toContain('CONDITIONS ACCEPTÉES');
    expect(source).toContain('waiverRowPending');
    expect(source).toContain('waiverRowAccepted');
    expect(source).toContain('ACCEPTE LES CONDITIONS POUR CONTINUER');
    expect(source).toContain(`J’accepte les Conditions générales Loki Music et l’utilisation de ${priceLabel} pour débloquer toute cette collection.`);
    expect(source).toContain('LIRE LES CONDITIONS GÉNÉRALES');
    expect(source).not.toContain('Aucun débit n’est effectué morceau par morceau.');
  });

  it('retains money-payment legal disclosure while matching the compact FREE visual language', () => {
    expect(source).toContain('PAYPAL DIRECT · tu paies le créateur · il confirme la réception · Loki débloque la collection');
    expect(source).toContain('totalPricePillMoney');
    expect(source).toContain('totalPricePillFree');
    expect(source).toContain('aucun remboursement possible');
    expect(source).toContain('{!freeAccess ? <Text style={s.noRefund}>');
  });

  it('offers a clear FREE or PayPal choice for dual-mode collections', () => {
    expect(source).toContain("offer.paymentMode === 'BOTH'");
    expect(source).toContain('CHOISIS TON MODE DE DÉBLOCAGE');
    expect(source).toContain('moneyPurchaseEnabled');
    expect(source).toContain("{ ...offer, paymentMode: selectedPaymentMode }");
  });

  it('uses a concise unlock CTA and never a generic purchase label', () => {
    expect(source).toContain('DÉBLOQUER LA COLLECTION · ${priceLabel}');
    expect(source).toContain('COMMENCER MA TRANSACTION · ${priceLabel}');
    expect(source).toContain('FREE INSUFFISANTS');
    expect(source).not.toContain('Acheter et ajouter à mon Loki Music');
    expect(source).not.toMatch(/buyButton:.*success/);
    expect(source).toContain("buyButton: { width: '100%'");
  });

  it('is wired into the public profile boutique instead of purchasing on list-row tap', () => {
    // 02/10/2026 : la boutique vendeur ouvre la même fenêtre via openSaleFolder.
    expect(profile).toContain('onOpenOffer={(offer) => openSaleFolder(offer)}');
    expect(profile).toContain('setImmersivePreviewOffer(offer);');
    expect(profile).toContain('onConfirmPurchase={(offer) => void buyPlaylistOffer(offer)}');
  });
});
