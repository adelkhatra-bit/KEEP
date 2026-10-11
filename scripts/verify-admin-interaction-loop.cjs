const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const roots = [
  path.join(root, 'packages/admin/pages'),
  path.join(root, 'packages/admin/components'),
];
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(tsx|jsx)$/.test(entry.name) ? [full] : [];
  });
}

function openingTags(source, tag) {
  const out = [];
  const needle = '<' + tag;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) >= 0) {
    const next = source[cursor + needle.length] || '';
    if (/[A-Za-z0-9:_-]/.test(next)) {
      cursor += needle.length;
      continue;
    }
    let i = cursor + needle.length;
    let braces = 0;
    let quote = null;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') braces += 1;
      else if (ch === '}') braces = Math.max(0, braces - 1);
      else if (ch === '>' && braces === 0) {
        out.push({ start: cursor, text: source.slice(cursor, i + 1) });
        cursor = i + 1;
        break;
      }
    }
    if (i >= source.length) break;
  }
  return out;
}

for (const file of roots.flatMap(walk)) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replace(/\\/g, '/');

  for (const opening of openingTags(source, 'button')) {
    const valid = /\bonClick\s*=/.test(opening.text)
      || /\btype\s*=\s*["']submit["']/.test(opening.text);
    if (valid) continue;
    const line = source.slice(0, opening.start).split(/\r?\n/).length;
    failures.push(`${rel}:${line} <button> sans action réelle`);
  }

  for (const opening of openingTags(source, 'a')) {
    if (!/\bhref\s*=/.test(opening.text)) {
      const line = source.slice(0, opening.start).split(/\r?\n/).length;
      failures.push(`${rel}:${line} <a> sans href`);
    }
  }
}

if (failures.length) {
  console.error('\nKEEP SUPER ADMIN INTERACTION CHECK FAILED');
  console.error('Règle: 1 clic = action/accès réel; 2e clic uniquement pour confirmation sensible.\n');
  failures.forEach((item) => console.error('- ' + item));
  process.exit(1);
}

console.log('KEEP Super Admin interaction loop: PASS');
console.log('Every native button/link in admin pages/components has a concrete handler or destination.');
