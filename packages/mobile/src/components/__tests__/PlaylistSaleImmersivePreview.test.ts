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
    expect(source).toContain('<Text style={s.profileLinkText}>@{normalizedUsername}</Text>');
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
    expect(source).toContain("Confirmer l'utilisation de ${priceLabel} pour toute la collection");
    expect(source).toContain('Utiliser ${priceLabel} pour révéler et ajouter cette collection à mon Loki Music.');
    expect(source).not.toContain('Aucun débit n’est effectué morceau par morceau.');
  });

  it('retains money-payment legal disclosure while matching the compact FREE visual language', () => {
    expect(source).toContain('PAYPAL DIRECT · tu paies le créateur · il confirme la réception · Loki débloque la collection');
    expect(source).toContain('totalPricePillMoney');
    expect(source).toContain('totalPricePillFree');
    expect(source).toContain('aucun remboursement possible');
    expect(source).toContain('{!freeAccess ? <Text style={s.noRefund}>');
  });

  it('uses a concise unlock CTA and never a generic purchase label', () => {
    expect(source).toContain('RÉVÉLER + AJOUTER · ${priceLabel}');
    expect(source).toContain('FREE INSUFFISANTS');
    expect(source).not.toContain('Acheter et ajouter à mon Loki Music');
    expect(source).not.toMatch(/buyButton:.*success/);
  });

  it('is wired into the public profile boutique instead of purchasing on list-row tap', () => {
    expect(profile).toContain('onPress={() => openSaleFolder(offer)}');
    expect(profile).toContain('setImmersivePreviewOffer(offer);');
    expect(profile).toContain('onConfirmPurchase={(offer) => void buyPlaylistOffer(offer)}');
  });
});
