const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || 'dist';
const outputRoot = path.resolve(process.cwd(), outDir);
const indexPath = path.join(outputRoot, 'index.html');
const canonicalRoot = 'https://adelkhatra-bit.github.io/KEEP/';
const buildId = (process.env.GITHUB_SHA || `local-${Date.now()}`).slice(0, 16);

if (!fs.existsSync(indexPath)) {
  throw new Error(`KEEP web export introuvable: ${indexPath}`);
}

let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('<script type="module" src=')) {
  html = html.replace(/<script\s+src=/g, '<script type="module" src=');
}

// Hygiène de cache : à chaque nouvelle version publiée, on invalide uniquement
// les caches navigateur/service-worker. On ne touche JAMAIS à localStorage
// métier (session, profil, préférences) afin de ne pas déconnecter l'utilisateur.
const cacheHygiene = [
  '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
  '<meta http-equiv="Pragma" content="no-cache" />',
  '<meta http-equiv="Expires" content="0" />',
  `<meta name="keep-build" content="${buildId}" />`,
  `<script id="keep-cache-hygiene">(function(){try{var k='__keep_web_build';var n='${buildId}';var p=localStorage.getItem(k);if(p!==n){if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister().catch(function(){})})}).catch(function(){})}if('caches' in window){caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return caches.delete(key)}))}).catch(function(){})}localStorage.setItem(k,n)}}catch(e){}})();</script>`,
].join('');
if (!html.includes('keep-cache-hygiene') && html.includes('</head>')) {
  html = html.replace('</head>', `${cacheHygiene}</head>`);
}

// iOS Safari zoome automatiquement lorsqu'un input a une taille de police
// inférieure à 16px. On corrige uniquement les champs sur petit écran web,
// sans désactiver le pinch-to-zoom ni modifier le design natif Android/iOS.
const mobileFormCss = '<style id="keep-mobile-form-nozoom">@media (max-width: 767px){input,textarea,select{font-size:16px!important}}</style>';
if (!html.includes('keep-mobile-form-nozoom') && html.includes('</head>')) {
  html = html.replace('</head>', `${mobileFormCss}</head>`);
}

// SEO sans toucher au rendu React Native : toutes les routes de l'application
// web sont des variantes du même shell, donc elles déclarent la racine Loki
// comme URL canonique. Les profils publics ont leur propre canonical dynamique
// dans share-profile.html.
const seoTags = [
  '<meta name="description" content="Loki reconnaît les morceaux de tes moments, construit ton Loki DNA et te permet de partager ton univers musical." />',
  '<meta name="robots" content="index,follow" />',
  `<link rel="canonical" href="${canonicalRoot}" />`,
  '<meta property="og:type" content="website" />',
  '<meta property="og:site_name" content="Loki" />',
  '<meta property="og:title" content="Loki · Ton univers musical" />',
  '<meta property="og:description" content="Reconnais, garde et partage les musiques de tes moments avec Loki." />',
  `<meta property="og:url" content="${canonicalRoot}" />`,
  '<meta name="twitter:card" content="summary" />',
  '<meta name="twitter:title" content="Loki · Ton univers musical" />',
  '<meta name="twitter:description" content="Reconnais, garde et partage les musiques de tes moments avec Loki." />',
].join('');

if (!/rel=["']canonical["']/i.test(html) && html.includes('</head>')) {
  html = html.replace('</head>', `${seoTags}</head>`);
}
if (/<title>[^<]*<\/title>/i.test(html)) {
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>Loki · Ton univers musical</title>');
}

// "Ajouter à l'écran d'accueil" (30/08/2026, demande d'Adel : pouvoir tester
// une expérience proche d'une vraie app installée, gratuitement, sans Mac ni
// compte développeur). Ces balises font que Safari iOS et Chrome Android
// lancent le site en plein écran (sans barre d'adresse) avec sa propre icône
// quand l'utilisateur fait "Ajouter à l'écran d'accueil" -- ça ne remplace pas
// l'app native (pas de micro en arrière-plan, pas de notifications push),
// mais ça donne une icône et un lancement en mode application, gratuitement.
const homeScreenTags = [
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Loki" />',
  '<meta name="application-name" content="Loki" />',
  '<meta name="theme-color" content="#0B0A12" />',
  `<link rel="apple-touch-icon" href="${canonicalRoot}keep-share.png" />`,
].join('');
if (!html.includes('apple-mobile-web-app-capable') && html.includes('</head>')) {
  html = html.replace('</head>', `${homeScreenTags}</head>`);
}

fs.writeFileSync(indexPath, html);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${canonicalRoot}</loc></url>\n</urlset>\n`;
fs.writeFileSync(path.join(outputRoot, 'sitemap.xml'), sitemap, 'utf8');

console.log(`[KEEP] web bootstrap ES module + cache hygiene + SEO + formulaires mobiles corrigés: ${indexPath}`);
console.log(`[KEEP] build id: ${buildId}`);
console.log(`[KEEP] sitemap: ${path.join(outputRoot, 'sitemap.xml')}`);
