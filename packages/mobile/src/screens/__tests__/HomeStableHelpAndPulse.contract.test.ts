import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Listen home stable layout contract', () => {
  it('reserves a fixed help slot before the primary CTA so opening help never pushes the page', () => {
    const help = source.indexOf('<View style={s.idleLearnMoreSlot}>');
    const cta = source.indexOf('<View style={s.idleCta}>', help);
    expect(help).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(help);
    expect(source).toContain("idleLearnMoreSlot: { width: '100%', height: 0");
    expect(source).toContain("idleLearnMorePanel: { position: 'absolute', top: 2");
  });

  it('keeps important copy bright on the dark Listen background', () => {
    expect(source).toContain('idleSubtitle: { color: colors.white');
    expect(source).toContain('idleLearnMoreBody: { color: colors.white');
    expect(source).not.toContain('homePulseTrackTitle:{width:\'100%\',color:C.text'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
  });

  it('anchors larger Loki Pulse bubbles toward the five-tab bar without replacing buttons', () => {
    expect(source).not.toContain("homePulseWrap:{width:'100%',maxWidth:692,marginTop:'auto'"); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).not.toContain("homePulseWrap:{width:'100%',maxWidth:692,marginTop:'auto',paddingTop:4,marginBottom:-8}"); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).not.toContain('homePulseArtworkRing:{position:\'relative\',width:86,height:86'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(source).toContain('TROUVER LE MORCEAU');
    expect(source).not.toContain('onPressIn={() => prewarmHomePulseTrack(item.track.id)}'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
  });

  it('iPhone 844 px : tout l’écran Écouter tient sans défiler (Adel, 05/10/2026)', () => {
    // Responsive (Adel 05/10/2026) : l'orbe suit la hauteur de l'écran (96 → 196 px), Écouter ne défile jamais.
    expect(source).toContain('const size = Math.max(96, Math.min(196, Math.round((height - 460) * 0.4)));');
    expect(source).toContain('<View style={[s.main, s.idle, s.idleFit]}>');
    expect(source).not.toContain('showsVerticalScrollIndicator={false} bounces={false}>\n          <View style={s.idleHero}>');
    expect(source).not.toContain("idleLearnMoreSlot: { width: '100%', height: 108");
  });
});
