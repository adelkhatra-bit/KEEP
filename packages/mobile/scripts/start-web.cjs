const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'dist-web');

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : fallback;
}

const port = Number(readArg('--port', process.env.PORT || '8081'));
const shouldClear = process.argv.includes('--clear');

if (shouldClear && fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

const expoCli = require.resolve('expo/bin/cli');
const exportArgs = [expoCli, 'export', '--platform', 'web', '--output-dir', outDir];
if (shouldClear) exportArgs.push('--clear');

console.log(`[KEEP WEB] Exporting production-compatible web bundle to ${outDir}...`);
const exportResult = spawnSync(process.execPath, exportArgs, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

if (exportResult.status !== 0) {
  console.error(`[KEEP WEB] Expo export failed with code ${exportResult.status}`);
  process.exit(exportResult.status || 1);
}

console.log('[KEEP WEB] Applying ES-module bootstrap fix...');
const bootstrapFix = spawnSync(
  process.execPath,
  [path.join(projectRoot, 'scripts', 'fix-web-export.cjs'), path.basename(outDir)],
  { cwd: projectRoot, env: process.env, stdio: 'inherit' }
);
if (bootstrapFix.status !== 0) {
  console.error(`[KEEP WEB] Bootstrap fix failed with code ${bootstrapFix.status}`);
  process.exit(bootstrapFix.status || 1);
}

const indexPath = path.join(outDir, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('<script type="module" src=')) {
  console.error('[KEEP WEB] Refusing to serve: index.html is not using an ES-module bootstrap.');
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function safeFile(requestUrl) {
  const rawPath = decodeURIComponent((requestUrl || '/').split('?')[0]);
  const normalized = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(outDir, normalized === '/' ? 'index.html' : normalized);
  if (!candidate.startsWith(outDir)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return path.join(outDir, 'index.html');
}

const server = http.createServer((req, res) => {
  const file = safeFile(req.url);
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('KEEP web build not found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mime[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[KEEP WEB] READY http://localhost:${port}`);
  console.log('[KEEP WEB] Runtime source: Expo static export + ES-module bootstrap');
});
