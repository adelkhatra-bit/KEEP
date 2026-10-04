import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8');

describe('Loki home stable layout contract', () => {
  it('keeps En savoir plus inside a reserved slot so lower content does not jump', () => {
    expect(source).toContain('<View style={s.idleLearnMoreSlot}>');
    expect(source).toContain('minHeight: 78');
  });

  it('keeps Pulse bubbles near the tab bar and slightly larger', () => {
    expect(source).toContain("homePulseWrap:{width:'100%',maxWidth:692,marginTop:'auto'");
    expect(source).toContain('marginBottom:-30');
    expect(source).toContain('width:74,height:74');
  });

  it('uses high-contrast primary text for the main home explanation', () => {
    expect(source).toContain("idleSubtitle: { color: C.text");
    expect(source).toContain("idleLearnMoreBody: { color: C.text");
  });
});
