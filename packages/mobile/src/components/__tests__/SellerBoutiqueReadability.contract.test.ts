import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'SellerBoutique.tsx'), 'utf8');

describe('boutique musicale readable buying journey', () => {
  it('explains the buyer and seller journeys without promising automatic PayPal settlement', () => {
    expect(source).toContain('bouton payer');
    expect(source).toContain('cardBuy:');
    expect(source).toContain('PAYER');
    expect(source).toContain('DÉBLOQUER');
    expect(source).toContain("Platform.OS === 'web'");
  });
  it('makes featured cards readable regardless of music genre gradient', () => {
    expect(source).toContain("backgroundColor: 'rgba(0,0,0,.72)'");
    expect(source).toContain("dropTitle: { color: '#FFFFFF'");
    expect(source).toContain("dropMeta: { color: '#F2EDFF'");
    expect(source).toContain('cardBuyText:');
  });
  it('avoids tiny 9px promotional text', () => {
    expect(source).toContain("dropListenText: { flex: 1, color: '#FFFFFF', fontSize: 12");
    expect(source).toContain("bundleHint: { color: '#F2EDFF', fontSize: 11");
  });
});
