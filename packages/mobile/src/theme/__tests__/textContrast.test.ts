import * as fs from 'fs';
import * as path from 'path';

// Règle d'Adel (07/10/2026, définitive) : jamais de texte foncé (noir, violet foncé, gris foncé) sur fond foncé.
// Refuse le retour des couleurs de texte violettes/grises foncées, sauf texte posé sur un fond clair du même style.
const hex = (h: string) => { let x = h.replace('#', ''); if (x.length === 3) x = x.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const lum = (rgb: number[]) => { const a = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const ratio = (a: string, b: string) => { const x = lum(hex(a)); const y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []);

describe('Règle contraste : jamais de texte foncé sur fond foncé', () => {
  it('aucune couleur de texte violette ou grise foncée en dur', () => {
    const forbidden = ['#8B5CF6', '#6B6478', '#7C5CFC', '#5B3FE0'];
    const offenders: string[] = [];
    for (const f of walk(path.join(__dirname, '..', '..'))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?<![-a-zA-Z])color:\s*'(#[0-9a-fA-F]{6})'/g)) {
        if (!forbidden.includes(m[1].toUpperCase())) continue;
        const around = src.slice(Math.max(0, (m.index ?? 0) - 260), (m.index ?? 0) + 260);
        const bgs = [...around.matchAll(/backgroundColor:\s*'(#[0-9a-fA-F]{6})'/g)].map((b) => b[1]);
        if (bgs.some((b) => lum(hex(b)) > 0.25 && ratio(m[1], b) >= 4.5)) continue;
        offenders.push(`${path.basename(f)} ${m[1]} (${ratio(m[1], '#1C1930').toFixed(2)}:1)`);
      }
      for (const m of src.matchAll(/(?<![-a-zA-Z])color:\s*colors\.(primary|primaryDark)\b(?!Light)/g)) {
        // Exception : ombre décorative derrière un grand mot (style « depth… »), ce n'est pas du texte à lire.
        if (/depth[A-Za-z]*:\s*\{[^}]*$/.test(src.slice(Math.max(0, (m.index ?? 0) - 80), m.index ?? 0))) continue;
        offenders.push(`${path.basename(f)} colors.${m[1]} en couleur de texte`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
