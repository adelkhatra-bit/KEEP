const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/keep-product-contract.json'), 'utf8'));
const MIN_FONT_SIZE = CONTRACT.typography.minimumFontSizePx;
const DEFAULT_ROOTS = [
  path.join(ROOT, 'packages/mobile/src'),
  path.join(ROOT, 'packages/admin'),
];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const FONT_SIZE_PATTERNS = [
  { name: 'fontSize', regex: /\bfontSize\s*:\s*(['"]?)(\d+(?:\.\d+)?)(?:px)?\1/g },
  { name: 'font-size', regex: /\bfont-size\s*:\s*(['"]?)(\d+(?:\.\d+)?)(?:px)?\1/g },
];

function sourceFiles(roots) {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['.next', 'coverage', 'dist', 'node_modules'].includes(entry.name)) visit(file);
      } else if (EXTENSIONS.has(path.extname(entry.name))) {
        files.push(file);
      }
    }
  };
  roots.forEach(visit);
  return files;
}

function findFontSizeViolationsInSource(source, file = '<source>') {
  const violations = [];
  for (const { name, regex } of FONT_SIZE_PATTERNS) {
    for (const match of source.matchAll(regex)) {
      const size = Number(match[2]);
      if (size < MIN_FONT_SIZE) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        violations.push(`${file}:${line} ${name} ${size}px (< ${MIN_FONT_SIZE}px)`);
      }
    }
  }
  return violations;
}

function findFontSizeViolations(roots = DEFAULT_ROOTS) {
  return sourceFiles(roots).flatMap((file) => (
    findFontSizeViolationsInSource(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file))
  ));
}

if (require.main === module) {
  const violations = findFontSizeViolations();
  if (violations.length) {
    console.error(`Texte inférieur à ${MIN_FONT_SIZE}px interdit :`);
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exitCode = 1;
  } else {
    console.log(`Taille minimale des textes OK (≥ ${MIN_FONT_SIZE}px) : packages/mobile/src + packages/admin.`);
  }
}

module.exports = {
  DEFAULT_ROOTS,
  MIN_FONT_SIZE,
  findFontSizeViolations,
  findFontSizeViolationsInSource,
};
