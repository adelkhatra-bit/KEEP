// Règle d'Adel (07/10/2026, définitive) : jamais de texte foncé sur fond foncé (violet foncé, gris foncé, noir).
// Tout texte doit avoir un contraste d'au moins 4,5:1 sur le fond de carte le plus clair (#1c1930). Bloque le build sinon.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const files = [];
for (const dir of ['pages', 'components', 'styles']) for (const f of fs.readdirSync(path.join(root, dir))) if (/\.(tsx|css)$/.test(f)) files.push(path.join(dir, f));
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (rgb) => { const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const ratio = (a, b) => { const x = lum(hex(a)), y = lum(hex(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const CARD = '#1c1930';
const vars = {}; const css = fs.readFileSync(path.join(root, 'styles/globals.css'), 'utf8');
for (const m of css.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,6})/g)) vars[m[1]] = m[2];
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  // couleur de TEXTE seulement (color:), pas background / border
  const re = /(?<![-a-zA-Z])color\s*:\s*['"]?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\b|var\(--([a-z-]+)\))/g;
  for (const m of src.matchAll(re)) {
    const value = m[1].startsWith('var') ? vars[m[2]] : m[1];
    if (!value) continue;
    // Texte foncé volontaire sur un fond CLAIR (bouton vert, rose…) : lisible, autorisé.
    const around = src.slice(Math.max(0, m.index - 220), m.index + 220);
    const bg = [...around.matchAll(/background(?:Color)?\s*:\s*['"]?(?:linear-gradient\([^#]*)?(#[0-9a-fA-F]{6})/g)].map((b) => b[1]);
    if (bg.some((b) => lum(hex(b)) > 0.25) && ratio(value, bg.find((b) => lum(hex(b)) > 0.25)) >= 4.5) continue;
    const r = ratio(value, CARD);
    if (r < 4.5) { const line = src.slice(0, m.index).split('\n').length; bad.push(`${f}:${line} ${m[1]} contraste ${r.toFixed(2)}:1`); }
  }
}
if (bad.length) { console.error('Texte trop foncé sur fond foncé (règle Adel) :\n' + bad.join('\n')); process.exit(1); }
console.log('OK : aucun texte foncé sur fond foncé.');
