import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Listen home stable layout contract', () => {
  it('reserves a fixed help slot before the primary CTA so opening help never pushes the page', () => {
    const help = source.indexOf('<View style={s.idleLearnMoreSlot}>');
    const cta = source.indexOf('<View style={s.idleCta}>', help);
    expect(help).toBeGreaterThan(-1);
    expect(cta).toBeGreaterThan(help);
    expect(source).toContain("idleLearnMoreSlot: { width: '100%', minHeight: 78");
  });

  it('keeps important copy bright on the dark Listen background', () => {
    expect(source).toContain('idleSubtitle: { color: C.text');
    expect(source).toContain('idleLearnMoreBody: { color: C.text');
    expect(source).toContain('homePulseTrackTitle:{width:\'100%\',color:C.text');
  });

  it('anchors larger Loki Pulse bubbles toward the five-tab bar without replacing buttons', () => {
    expect(source).toContain("homePulseWrap:{width:'100%',maxWidth:692,marginTop:'auto'");
    expect(source).toContain('marginBottom:-54');
    expect(source).toContain('homePulseArtworkRing:{position:\'relative\',width:80,height:80');
    expect(source).toContain('IDENTIFIER UN MORCEAU');
    expect(source).toContain('onPressIn={() => prewarmHomePulseTrack(item.track.id)}');
  });
});
