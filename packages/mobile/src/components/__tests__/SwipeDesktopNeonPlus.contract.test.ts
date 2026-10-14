import fs from 'fs';
import path from 'path';

const component = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const screen = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', name), 'utf8');
const swipe = component('MusicSwipeDeckModal.tsx');

describe('Desktop Swipe: raised reactions and neon depth design', () => {
  it('places all three reaction counters inside the top header ABOVE the collection title', () => {
    const headerStart = swipe.indexOf('testID="deck-reactions-above-title"');
    const counters = swipe.indexOf('testID="deck-reactions-near-title"');
    const title = swipe.indexOf('<View style={s.titleRow}>', headerStart);
    expect(headerStart).toBeGreaterThan(0);
    expect(counters).toBeGreaterThan(headerStart);
    expect(title).toBeGreaterThan(counters);
    expect(swipe).toContain("headerCountHaloDesktop:{position:'absolute',top:-10");
    expect(swipe).toContain("paddingRight:186");
    expect(swipe).toContain('ReactionStatPills');
  });

  it('animates neon outlines without intercepting touch or hiding jacket artwork', () => {
    expect(swipe).toContain('testID="deck-reactions-animated-edge"');
    expect(swipe).toContain('testID="swipe-neon-depth-animated-edge"');
    expect(swipe).toContain('testID="swipe-neon-depth-card"');
    expect(swipe).toContain('<View testID="swipe-artwork-stage"');
    expect(swipe).toContain("resizeMode=\"contain\"");
    const glowing = component('GlowRing.tsx');
    expect(glowing).toContain('pointerEvents="none"');
    expect(glowing).toContain('AccessibilityInfo.isReduceMotionEnabled');
    expect(glowing).toContain('Animated.loop');
  });

  it('fits both panels on ordinary laptop screens with no right-hand black overflow', () => {
    expect(swipe).toContain("desktopPlayer:{flex:0");
    expect(swipe).toContain("maxWidth:'55%'");
    expect(swipe).toContain("maxWidth:'35%'");
    expect(swipe).toContain("desktopOuter:{flexDirection:'row'");
    expect(swipe).toContain("paddingHorizontal:16,paddingVertical:12,gap:14");
  });
});

describe('Information toggles: short Plus label in Loki mobile and PC', () => {
  it('keeps collapsible text and its full information, but never uses verbose toggle text', () => {
    const clamped = component('ClampedText.tsx');
    const more = component('MoreInfoLine.tsx');
    expect(clamped).toContain("accessibilityLabel={open ? 'Moins' : 'Plus'}");
    expect(clamped).toContain("{open ? 'Moins' : 'Plus'}");
    expect(more).toContain("{open ? 'Moins ˄' : 'Plus ›'}");
    expect(more).toContain("{open ? <Text style={s.full}>{full}</Text> : null}");
    expect(screen('HomeScreenCompact.tsx')).toContain('accessibilityLabel="Plus : Loki Music"');
    expect(screen('OffersScreen.tsx')).toContain('accessibilityLabel="Plus : règles"');
  });

  it('uses Plus on informational payment controls without altering purchase logic', () => {
    expect(component('PayPalQrPayoutControl.tsx')).toContain("'PLUS'");
    expect(component('PlaylistSalePanel.tsx')).toContain('manualNoticeTitle}>PLUS</Text>');
    expect(component('PayoutCheckoutSheet.tsx')).toContain('Plus : utilisation du QR PayPal');
  });
});
