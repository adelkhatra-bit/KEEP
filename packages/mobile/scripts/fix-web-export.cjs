const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || 'dist';
const outputRoot = path.resolve(process.cwd(), outDir);
const indexPath = path.join(outputRoot, 'index.html');
const canonicalRoot = 'https://adelkhatra-bit.github.io/KEEP/';
const buildSha = process.env.GITHUB_SHA || `local-${Date.now()}`;
const buildId = buildSha.slice(0, 16);

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
const liveVersionGuard = `<script id="keep-live-version-guard">(function(){try{var current='${buildSha}';if(!/^([0-9a-f]{40})$/i.test(current))return;var checking=false;var check=function(){if(checking)return;checking=true;fetch('/KEEP/version.json?ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(v){var latest=v&&String(v.sha||'');if(!latest||latest===current)return;var key='__keep_forced_build';if(sessionStorage.getItem(key)===latest)return;sessionStorage.setItem(key,latest);var u=new URL(location.href);u.searchParams.set('__keep_build',latest.slice(0,16));location.replace(u.toString())}).catch(function(){}).finally(function(){checking=false})};check();setInterval(check,30000);addEventListener('focus',check,{passive:true});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check()},{passive:true})}catch(e){}})();</script>`;
if (!html.includes('keep-cache-hygiene') && html.includes('</head>')) {
  html = html.replace('</head>', `${cacheHygiene}${liveVersionGuard}</head>`);
}

// Anti-flash refresh : Safari/Chrome peuvent conserver la dernière frame peinte
// pendant que le nouveau bundle se charge. Sur Loki cela donnait l'impression
// qu'un ancien design/modal restait "derrière" l'écran courant. On masque donc
// le DOM applicatif derrière un fond opaque jusqu'au premier rendu React réel.
// Aucun état métier/localStorage n'est touché et le garde-fou s'enlève aussi
// automatiquement après 8 s si le bundle plante, afin de ne jamais bloquer l'UI.
const bootShield = [
  '<style id="keep-boot-shield">html.keep-booting,html.keep-booting body{background:#0B0A12!important}html.keep-booting body>*{visibility:hidden!important}html.keep-booting #root{visibility:hidden!important}</style>',
  '<script id="keep-boot-shield-script">(function(){try{var d=document.documentElement;d.classList.add("keep-booting");var done=false;var release=function(){if(done)return;done=true;requestAnimationFrame(function(){requestAnimationFrame(function(){d.classList.remove("keep-booting")})})};var watch=function(){var r=document.getElementById("root");if(r&&r.childNodes&&r.childNodes.length){release();return true}return false};if(!watch()){var o=new MutationObserver(function(){if(watch())o.disconnect()});o.observe(document,{childList:true,subtree:true});setTimeout(function(){try{o.disconnect()}catch(e){}release()},8000)}}catch(e){try{document.documentElement.classList.remove("keep-booting")}catch(_){}}})();</script>',
].join('');
if (!html.includes('keep-boot-shield') && html.includes('</head>')) {
  html = html.replace('</head>', `${bootShield}</head>`);
}

// iOS Safari zoome automatiquement lorsqu'un input a une taille de police
// inférieure à 16px. On corrige uniquement les champs sur petit écran web,
// sans désactiver le pinch-to-zoom ni modifier le design natif Android/iOS.
// Le navigateur peint parfois le canvas AVANT que le bundle Expo ne démarre.
// Utiliser exactement le même fond que le thème Loki évite tout flash/halo
// d'un ancien fond lors d'un refresh ou d'un changement de route.
const shellBackgroundCss = '<style id="keep-shell-background">html,body,#root{margin:0;background:#0B0A12!important}html,body{min-height:100%}</style>';
if (!html.includes('keep-shell-background') && html.includes('</head>')) {
  html = html.replace('</head>', `${shellBackgroundCss}</head>`);
}

const mobileFormCss = '<style id="keep-mobile-form-nozoom">@media (max-width: 767px){input,textarea,select{font-size:16px!important}}</style>';
if (!html.includes('keep-mobile-form-nozoom') && html.includes('</head>')) {
  html = html.replace('</head>', `${mobileFormCss}</head>`);
}

// Desktop web must use the whole browser surface instead of behaving like a
// frozen phone viewport. Keep mobile untouched; on wide screens, allow natural
// page height/scroll and remove any accidental root width cap left by the web shell.
const desktopShellCss = '<style id="keep-desktop-shell">@media (min-width: 900px){html,body{width:100%!important;height:100%!important;min-height:100%!important;overflow:hidden!important}#root{width:100%!important;max-width:none!important;height:100dvh!important;min-height:100vh!important;max-height:100dvh!important;overflow:hidden!important}#root>div{width:100%!important;max-width:none!important;height:100%!important;min-height:100%!important}}@media (min-width:1100px){#root{zoom:1;width:100vw!important;height:100dvh!important;min-height:100vh!important;max-height:100dvh!important}}</style>';
if (!html.includes('keep-desktop-shell') && html.includes('</head>')) {
  html = html.replace('</head>', `${desktopShellCss}</head>`);
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
