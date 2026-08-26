const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || 'dist';
const outputRoot = path.resolve(process.cwd(), outDir);
const indexPath = path.join(outputRoot, 'index.html');
const canonicalRoot = 'https://adelkhatra-bit.github.io/KEEP/';

if (!fs.existsSync(indexPath)) {
  throw new Error(`KEEP web export introuvable: ${indexPath}`);
}

let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('<script type="module" src=')) {
  html = html.replace(/<script\s+src=/g, '<script type="module" src=');
}

// SEO sans toucher au rendu React Native : toutes les routes de l'application
// web sont des variantes du même shell, donc elles déclarent la racine KEEP
// comme URL canonique. Les profils publics ont leur propre canonical dynamique
// dans share-profile.html.
const seoTags = [
  '<meta name="description" content="KEEP reconnaît les morceaux de tes moments, construit ton KEEP DNA et te permet de partager ton univers musical." />',
  '<meta name="robots" content="index,follow" />',
  `<link rel="canonical" href="${canonicalRoot}" />`,
  '<meta property="og:type" content="website" />',
  '<meta property="og:site_name" content="KEEP" />',
  '<meta property="og:title" content="KEEP · Ton univers musical" />',
  '<meta property="og:description" content="Reconnais, garde et partage les musiques de tes moments avec KEEP." />',
  `<meta property="og:url" content="${canonicalRoot}" />`,
  '<meta name="twitter:card" content="summary" />',
  '<meta name="twitter:title" content="KEEP · Ton univers musical" />',
  '<meta name="twitter:description" content="Reconnais, garde et partage les musiques de tes moments avec KEEP." />',
].join('');

if (!/rel=["']canonical["']/i.test(html) && html.includes('</head>')) {
  html = html.replace('</head>', `${seoTags}</head>`);
}
if (/<title>[^<]*<\/title>/i.test(html)) {
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>KEEP · Ton univers musical</title>');
}

fs.writeFileSync(indexPath, html);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${canonicalRoot}</loc></url>\n</urlset>\n`;
fs.writeFileSync(path.join(outputRoot, 'sitemap.xml'), sitemap, 'utf8');

console.log(`[KEEP] web bootstrap ES module + SEO corrigés: ${indexPath}`);
console.log(`[KEEP] sitemap: ${path.join(outputRoot, 'sitemap.xml')}`);
