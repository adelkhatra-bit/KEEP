import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');

describe('Loki home stable layout contract', () => {
  it('keeps En savoir plus inside a reserved slot so lower content does not jump', () => {
    expect(source).toContain('<View style={s.idleLearnMoreSlot}>');
    expect(source).toContain("idleLearnMoreSlot: { width: '100%', height: 108");
  });

  it('keeps Pulse bubbles near the tab bar and slightly larger', () => {
    expect(source).toContain("homePulseWrap:{width:'100%',maxWidth:692,marginTop:'auto'");
    expect(source).toContain("homePulseWrap:{width:'100%',maxWidth:692,marginTop:'auto',paddingTop:4,marginBottom:-8}");
    expect(source).toContain('width:86,height:86');
  });

  it('uses high-contrast primary text for the main home explanation', () => {
    expect(source).toContain("idleSubtitle: { color: colors.white");
    expect(source).toContain("idleLearnMoreBody: { color: colors.white");
  });
});
