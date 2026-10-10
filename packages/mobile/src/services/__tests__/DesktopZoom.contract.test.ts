import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'scripts', 'fix-web-export.cjs'), 'utf8');

describe('Ordinateur : application agrandie sans toucher au téléphone (Adel 10/10/2026)', () => {
  it('zoom uniquement au-delà de 1100 px, #root garde la taille de la fenêtre', () => {
    expect(index).toContain('min-width: 1100px');
    expect(shell).toContain('min-width:1100px');
    expect(shell).toContain('zoom:1.2');
    expect(index).toContain('zoom:1.2');
    expect(index).toContain('height:calc(100dvh / 1.2)');
    expect(index).toContain('zoom:1.4');
  });
  it('jamais height:auto sur html/body/#root (incident page noire 29/09)', () => {
    expect(index).not.toMatch(/#root[^}]*height:\s*auto/);
    expect(shell).not.toMatch(/#root[^}]*height:\s*auto/);
  });
  it('règles téléphone (< 900 px) inchangées', () => {
    expect(index).toContain('@media (max-width: 899px)');
    expect(index).toContain('#root { position:fixed; inset:0; height:100dvh');
  });
});
