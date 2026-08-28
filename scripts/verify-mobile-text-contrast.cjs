const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'packages', 'mobile', 'src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
  });
}

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

function isGrayText(hex) {
  const channels = rgb(hex);
  const avg = channels.reduce((a, b) => a + b, 0) / 3;
  const sat = saturation(channels);
  // White is the KEEP readability baseline. Very dark text is allowed on bright
  // action surfaces (for example the mint KEEP button). Mid/light desaturated
  // hard-coded text is forbidden because it recreates the low-contrast gray UI.
  return avg >= 64 && avg < 245 && sat <= 0.25;
}

const findings = [];
const styleColor = /\bcolor\s*:\s*['"](#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)['"]/g;

for (const file of walk(ROOT)) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).replaceAll('\\', '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    let match;
    while ((match = styleColor.exec(line))) {
      if (isGrayText(match[1])) findings.push(`${rel}:${index + 1} ${match[1]} :: ${line.trim()}`);
    }
    styleColor.lastIndex = 0;
  });
}

if (findings.length) {
  console.error('\nKEEP MOBILE TEXT CONTRAST CHECK FAILED');
  console.error('Les couleurs de texte gris codées en dur doivent utiliser le thème global blanc ou une couleur de marque explicite.\n');
  findings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('KEEP MOBILE TEXT CONTRAST CHECK OK');
