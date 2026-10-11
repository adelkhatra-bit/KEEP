import fs from 'fs';
import path from 'path';

const srcRoot = path.join(__dirname, '..', '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full, out); }
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('Alertes au-dessus des fenêtres ouvertes (Adel 05/10/2026 : « le popup est arrivé quand j\'ai fermé la page »)', () => {
  it('aucun écran ni composant n\'utilise <Modal> de react-native directement : tout passe par KeepModal (couche d\'alerte incluse)', () => {
    const offenders = walk(srcRoot)
      .filter((file) => !/AlertHost\.tsx$|KeepModal\.tsx$/.test(file))
      .filter((file) => /<Modal[\s>]/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcRoot, file));
    expect(offenders).toEqual([]);
  });
  it('KeepModal monte la couche d\'alerte et AlertHost se tait quand une couche existe', () => {
    expect(fs.readFileSync(path.join(srcRoot, 'components', 'KeepModal.tsx'), 'utf8')).toContain('<ModalAlertLayer />');
    const host = fs.readFileSync(path.join(srcRoot, 'components', 'AlertHost.tsx'), 'utf8');
    expect(host).toContain('hostStack.length > 0');
    expect(host).toContain('if (!current || insideModal) return null;');
  });
});
