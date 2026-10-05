// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('HomeScreenCompact Loki Music branding contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'HomeScreenCompact.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the idle home free of redundant microphone instructions', () => {
    expect(source.toLowerCase()).not.toContain('micro prêt');
    expect(source.toLowerCase()).not.toContain('arrêt si 1 min');
    expect(source).toContain('<LokiMusic3DTitle />');
  });

  it('keeps microphone guidance inside the actual listening flow', () => {
    expect(source).toContain('TROUVER LE MORCEAU');
    expect(source).toContain('Le micro est utilisé uniquement pendant l’écoute.');
  });
});
