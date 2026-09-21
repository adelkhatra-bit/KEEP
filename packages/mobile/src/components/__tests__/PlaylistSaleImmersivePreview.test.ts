// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PlaylistSaleImmersivePreview (Adel, 21/09/2026 : aperçu immersif + renonciation obligatoire au droit de rétractation)', () => {
  const source = readNormalized(__dirname, '..', 'PlaylistSaleImmersivePreview.tsx');
  const profile = readNormalized(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx');

  it('reuses the existing masked 15s preview component instead of reinventing the audio/masking logic', () => {
    expect(source).toContain("import PlaylistSalePreview from './PlaylistSalePreview';");
    expect(source).toContain('<PlaylistSalePreview playlistId={offer.playlistId} trackCount={offer.trackCount} />');
    expect(source).not.toContain('loadPlaylistSaleOfferPreviewTracks');
  });

  it('never renders track-level title/artist/artwork before purchase', () => {
    expect(source).not.toMatch(/track\.(title|artist|artworkUrl)/);
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

  it('is wired into the public profile boutique instead of buying directly on card tap', () => {
    expect(profile).toContain('onPress={() => setImmersivePreviewOffer(offer)}');
    expect(profile).not.toMatch(/onPress=\{\(\) => void buyPlaylistOffer\(offer\)\}[^]*?accessibilityLabel=\{`Acheter/);
    expect(profile).toContain('onConfirmPurchase={(offer) => void buyPlaylistOffer(offer)}');
  });
});
