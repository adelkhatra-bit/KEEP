import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('Pépites direct configuration contract', () => {
  it('opens configuration directly after a valid multi-track selection', () => {
    const createStart = source.indexOf('const createSaleSelection = () =>');
    const createEnd = source.indexOf('// (21/09/2026, Partie 4)', createStart);
    const createBlock = source.slice(createStart, createEnd);
    expect(createBlock).toContain('openSellModal({');
    expect(createBlock).not.toContain('setSaleCartReviewOpen');
    expect(source).not.toContain('visible={saleCartReviewOpen}');
    expect(source).not.toContain('OUI, TOUT EST BON');
  });

  it('keeps publish as the final sensitive validation', () => {
    expect(source).toContain('CONFIGURATION');
    expect(source).toContain('VALIDATION');
    expect(source).toContain('PUBLIER LA COLLECTION');
    expect(source).toContain("selectedSaleTrackIds.size < 2 ? 'PANIER EN COURS' : 'CONTINUER'");
  });
});
