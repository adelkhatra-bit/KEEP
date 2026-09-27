const fs = require('fs');
const path = require('path');

function arg(name, fallback = '') {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] ?? fallback;
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function readList(filePath) {
  if (!filePath) return [];
  return fs.readFileSync(path.resolve(filePath), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const changedFiles = readList(arg('--files-from', ''));
const impactJsonPath = arg('--impact-json', '');
const impactPayload = impactJsonPath ? JSON.parse(fs.readFileSync(path.resolve(impactJsonPath), 'utf8')) : {};
const impact = impactPayload.impact || {};
const touchedModules = new Set(impact.touchedModules || []);

const adminOnlyFiles = changedFiles.every((filePath) => (
  filePath.startsWith('packages/admin/') ||
  filePath === '.github/workflows/web-preview-pages.yml' ||
  filePath === 'scripts/resolve-web-deploy-scope.cjs' ||
  filePath === 'scripts/resolve-ci-impact.cjs' ||
  filePath === 'config/github-ai-command-center.json'
));

const hasRuntimeWebImpact = Boolean(impact.webRuntimeImpact);
const hasAdminImpact = touchedModules.has('SUPER_ADMIN') || changedFiles.some((filePath) => filePath.startsWith('packages/admin/'));

let deployMode = 'full-site';
if (!hasRuntimeWebImpact && hasAdminImpact && adminOnlyFiles) deployMode = 'admin-only';

const payload = {
  deployMode,
  hasRuntimeWebImpact,
  hasAdminImpact,
  shouldRunBrowserMatrix: hasRuntimeWebImpact,
  shouldRunFullHttpSmoke: hasRuntimeWebImpact,
  shouldRunAdminSmoke: hasAdminImpact || deployMode === 'admin-only',
  summaryLines: [
    `SCOPE DÉPLOIEMENT : ${deployMode}`,
    `RUNTIME WEB IMPACTÉ : ${hasRuntimeWebImpact ? 'OUI' : 'NON'}`,
    `SUPER ADMIN IMPACTÉ : ${hasAdminImpact ? 'OUI' : 'NON'}`,
    `MATRICE NAVIGATEUR : ${hasRuntimeWebImpact ? 'OUI' : 'NON'}`,
    `SMOKE HTTP COMPLET : ${hasRuntimeWebImpact ? 'OUI' : 'NON'}`,
    `SMOKE ADMIN : ${hasAdminImpact || deployMode === 'admin-only' ? 'OUI' : 'NON'}`,
  ],
};

const jsonOut = arg('--json-out', '');
const mdOut = arg('--md-out', '');
if (jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(payload, null, 2));
if (mdOut) fs.writeFileSync(path.resolve(mdOut), `${payload.summaryLines.join('\n')}\n`);

console.log(payload.summaryLines.join('\n'));
