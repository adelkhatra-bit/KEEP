// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PlaylistSaleImmersivePreview (Adel, 21/09/2026 : swipe multi-morceaux + renonciation obligatoire au droit de rétractation)', () => {
  const source = readNormalized(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx');
  const profile = readNormalized(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx');

  it('loads the masked 15s previews directly and swipes through them (mission 21/09/2026 : "swipe immersif avec extraits 15s")', () => {
    expect(source).toContain("import SwipeDeck from './SwipeDeck';");
    expect(source).toContain("import { loadPlaylistSaleOfferPreviewTracks, PlaylistSalePreviewTrack, PublicPlaylistSaleOffer } from '../services/playlistSaleService';");
    expect(source).toContain('loadPlaylistSaleOfferPreviewTracks(offer.playlistId)');
    expect(source).toContain('<SwipeDeck');
    expect(source).toContain('onSwipeLeft={() => playTrackAt(trackIndex - 1)}');
    expect(source).toContain('onSwipeRight={() => playTrackAt(trackIndex + 1)}');
  });

  it('auto-advances to the next masked track when a 15s extract ends, instead of stopping', () => {
    expect(source).toContain('() => { clearCountdown(); playTrackAt(safeIdx + 1); }');
  });

  it('never renders track-level title/artist/artwork before purchase', () => {
    expect(source).not.toMatch(/track\.(title|artist|artworkUrl)/);
    expect(source).not.toContain('coverUrl');
  });

  it('rotates marketing and explainer copy automatically', () => {
    expect(source).toContain('const MARKETING_LINES = [');
    expect(source).toContain('const EXPLAINER_LINES = [');
    expect(source).toContain('setInterval(() => setMarketingIndex');
    expect(source).toContain('setInterval(() => setExplainerIndex');
  });

  it('respects Reduce Motion instead of forcing the waveform animation', () => {
    expect(source).toContain('AccessibilityInfo.isReduceMotionEnabled');
    expect(source).toContain('if (reduceMotionRef.current) return undefined;');
  });

  it('requires an explicit, unchecked-by-default withdrawal-right waiver before the purchase button activates', () => {
    expect(source).toContain('const [waiverAccepted, setWaiverAccepted] = useState(false);');
    expect(source).toContain('setWaiverAccepted(false);'); // reset every time the modal opens
    expect(source).toContain('disabled={!waiverAccepted || busy}');
    expect(source).toContain('je renonce expressément à mon droit de rétractation de 14 jours');
  });

  it('states the no-refund policy explicitly next to the purchase action', () => {
    expect(source).toContain('aucun remboursement possible');
  });

  it('discloses the manual/external payment mechanism before purchase (Adel, décision 21/09/2026)', () => {
    expect(source).toContain('Loki Music ne voit ni ne garantit ce paiement');
  });

  it('uses the exact persistent purchase wording from the mission spec, never green', () => {
    expect(source).toContain('Acheter et ajouter à mon Loki Music');
    expect(source).not.toMatch(/buyButton:.*success/);
  });

  it('is wired into the public profile boutique instead of buying directly on card tap', () => {
    expect(profile).toContain('onPress={() => setImmersivePreviewOffer(offer)}');
    expect(profile).not.toMatch(/onPress=\{\(\) => void buyPlaylistOffer\(offer\)\}[^]*?accessibilityLabel=\{`Acheter/);
    expect(profile).toContain('onConfirmPurchase={(offer) => void buyPlaylistOffer(offer)}');
  });
});
