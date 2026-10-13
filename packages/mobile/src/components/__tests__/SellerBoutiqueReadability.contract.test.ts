import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'SellerBoutique.tsx'), 'utf8');

describe('boutique musicale readable buying journey', () => {
  it('no longer repeats a buyer/seller how-to block inside the Boutique (Lot 5)', () => {
    expect(source).not.toContain('COMMENT ACHETER UNE COLLECTION');
    expect(source).not.toContain('COMMENT VENDRE MES COLLECTIONS');
    expect(source).not.toContain('buyerGuideText');
    expect(source).toContain("Platform.OS === 'web'");
  });
  it('makes featured cards readable regardless of music genre gradient', () => {
    expect(source).toContain("backgroundColor: 'rgba(0,0,0,.72)'");
    expect(source).toContain("dropTitle: { color: '#FFFFFF'");
    expect(source).toContain("dropMeta: { color: '#F2EDFF'");
  });
  it('avoids tiny 9px promotional text', () => {
    expect(source).toContain("dropListenText: { flex: 1, color: '#FFFFFF', fontSize: 12");
    expect(source).toContain("bundleHint: { color: '#F2EDFF', fontSize: 11");
  });
});
