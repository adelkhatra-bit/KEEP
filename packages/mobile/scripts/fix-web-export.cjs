const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || 'dist';
const indexPath = path.resolve(process.cwd(), outDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error(`KEEP web export introuvable: ${indexPath}`);
}
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('<script type="module" src=')) {
  html = html.replace(/<script\s+src=/g, '<script type="module" src=');
}
fs.writeFileSync(indexPath, html);
console.log(`[KEEP] web bootstrap ES module corrigé: ${indexPath}`);
