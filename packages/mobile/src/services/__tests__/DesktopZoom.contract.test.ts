import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', '..');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'scripts', 'fix-web-export.cjs'), 'utf8');

describe('Ordinateur : vraie disposition desktop sans étirer l’application mobile', () => {
  it('pas de zoom global : la largeur CSS complète reste disponible au desktop', () => {
    expect(index).toContain('@media (min-width: 1100px)');
    expect(index).toMatch(/#root\s*\{\s*zoom:1;\s*width:100vw;/);
    expect(index).not.toMatch(/zoom:1\.[24]/);
    // Le script d'export n'écrit pas le shell 404 (créé par le workflow Pages).
    // Il ne doit pas écraser le viewport natif avec le zoom d'un écran mobile.
    expect(shell).toContain('keep-desktop-shell');
    expect(shell).toContain('#root{zoom:1;width:100vw!important;');
    expect(shell).not.toMatch(/zoom:1\.[24]/);
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
