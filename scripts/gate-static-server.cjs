#!/usr/bin/env node
/**
 * Serveur statique minimal pour le garde-fou navigateur sur PR (mobile-ci.yml).
 * Reproduit ce que fait GitHub Pages pour l'application : tout chemin inconnu retombe sur /KEEP/index.html
 * (l'app lit alors l'URL et remonte la bonne route). Sans ce repli, un rechargement sur une URL réécrite
 * par l'app renvoie 404 (run Mobile CI 4577 : « #root = -1px » après reload, 11/10/2026).
 * Usage : node scripts/gate-static-server.cjs <racine> <port>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.map': 'application/json' };

http.createServer((req, res) => {
  const requested = decodeURIComponent(String(req.url || '/').split('?')[0]);
  let file = path.join(root, requested);
  if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(root, 'KEEP', 'index.html');
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`gate-static-server http://127.0.0.1:${port} -> ${root}`));
