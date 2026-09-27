const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'github-ai-command-center.json'), 'utf8'));
const ci = config.ciArchitecture || {};
const modules = ci.modules || {};
const STANDARD_FIELDS = ci.standardOutputFields || [
  'MODULE',
  'DÉPENDANCES IMPACTÉES',
  'FICHIERS MODIFIÉS',
  'TESTS LANCÉS',
  'TESTS NON NÉCESSAIRES',
  'SHA',
  'VERSION WEB TESTÉE',
  'DESKTOP',
  '390×844',
  'DÉPLOIEMENT',
  'ERREURS RESTANTES',
];

function arg(name, fallback = '') {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1] ?? fallback;
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function matcherMatches(filePath, matcher) {
  if (matcher.startsWith('prefix:')) return filePath.startsWith(matcher.slice('prefix:'.length));
  if (matcher.startsWith('regex:')) return new RegExp(matcher.slice('regex:'.length), 'i').test(filePath);
  return filePath === matcher;
}

function moduleMatches(filePath, definition) {
  return (definition.matchers || []).some((matcher) => matcherMatches(filePath, matcher));
}

function detectSupabaseSubmodules(filePath, definition) {
  const submodules = definition.submodules || {};
  return Object.entries(submodules)
    .filter(([, submodule]) => (submodule.matchers || []).some((matcher) => matcherMatches(filePath, matcher)))
    .map(([name]) => name);
}

function buildConsumersMap() {
  const map = {};
  for (const [moduleName, definition] of Object.entries(modules)) {
    for (const dependency of definition.dependsOn || []) {
      if (!map[dependency]) map[dependency] = [];
      map[dependency].push(moduleName);
    }
  }
  return Object.fromEntries(Object.entries(map).map(([name, entries]) => [name, unique(entries)]));
}

function readChangedFiles() {
  const filesFrom = arg('--files-from', '');
  if (filesFrom) {
    return fs.readFileSync(path.resolve(filesFrom), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return process.argv.slice(2).filter((value) => !value.startsWith('--'));
}

function resolveImpact(changedFiles) {
  const consumersMap = buildConsumersMap();
  const touched = new Map();
  const touchedSupabaseSubmodules = new Set();

  for (const filePath of changedFiles) {
    for (const [moduleName, definition] of Object.entries(modules)) {
      if (!moduleMatches(filePath, definition)) continue;
      const bucket = touched.get(moduleName) || { files: [], submodules: [] };
      bucket.files.push(filePath);
      if (moduleName === 'SUPABASE') {
        for (const submodule of detectSupabaseSubmodules(filePath, definition)) {
          bucket.submodules.push(submodule);
          touchedSupabaseSubmodules.add(submodule);
        }
      }
      touched.set(moduleName, bucket);
    }
  }

  const touchedModules = unique(Array.from(touched.keys()));
  const dependencies = unique(touchedModules.flatMap((moduleName) => modules[moduleName]?.dependsOn || []));

  const directConsumers = new Set();
  for (const moduleName of touchedModules) {
    for (const consumer of consumersMap[moduleName] || []) directConsumers.add(consumer);
  }
  if (touched.has('SUPABASE')) {
    const supabase = modules.SUPABASE || {};
    for (const submoduleName of touchedSupabaseSubmodules) {
      for (const consumer of supabase.submodules?.[submoduleName]?.consumers || []) directConsumers.add(consumer);
    }
    if (!touchedSupabaseSubmodules.size) {
      for (const consumer of ['AUTH', 'PROFILE', 'PROFILE_MARKETPLACE', 'PLAYLISTS', 'BATTLE', 'PARTIES', 'SUPER_ADMIN']) directConsumers.add(consumer);
    }
  }
  touchedModules.forEach((moduleName) => directConsumers.delete(moduleName));

  const testsToRun = unique([
    ...touchedModules.flatMap((moduleName) => modules[moduleName]?.tests || []),
    ...Array.from(directConsumers).flatMap((moduleName) => modules[moduleName]?.tests || []),
  ]);
  const allKnownTests = unique(Object.values(modules).flatMap((definition) => definition.tests || []));
  const testsNotNeeded = allKnownTests.filter((testName) => !testsToRun.includes(testName));
  const buildTargets = unique([
    ...touchedModules.flatMap((moduleName) => modules[moduleName]?.buildTargets || []),
    ...Array.from(directConsumers).flatMap((moduleName) => modules[moduleName]?.buildTargets || []),
  ]);
  const webRuntimeImpact = unique([...touchedModules, ...Array.from(directConsumers)]).some((moduleName) => modules[moduleName]?.runtimeWebImpact);
  const shouldRunProfileMarketplaceContract = testsToRun.includes('profile-marketplace-contract-browser');

  return {
    changedFiles,
    touchedModules,
    touchedSupabaseSubmodules: unique(Array.from(touchedSupabaseSubmodules)),
    dependencies,
    directConsumers: unique(Array.from(directConsumers)),
    testsToRun,
    testsNotNeeded,
    buildTargets,
    webRuntimeImpact,
    shouldRunProfileMarketplaceContract,
    touchedDetails: Object.fromEntries(Array.from(touched.entries()).map(([name, detail]) => [name, { files: unique(detail.files), submodules: unique(detail.submodules || []) }]))
  };
}

function renderStandard(summary) {
  const mapping = {
    'MODULE': summary.module,
    'DÉPENDANCES IMPACTÉES': summary.dependencies,
    'FICHIERS MODIFIÉS': summary.files,
    'TESTS LANCÉS': summary.testsLaunched,
    'TESTS NON NÉCESSAIRES': summary.testsNotNeeded,
    'SHA': summary.sha,
    'VERSION WEB TESTÉE': summary.webVersion,
    'DESKTOP': summary.desktop,
    '390×844': summary.mobile390,
    'DÉPLOIEMENT': summary.deployment,
    'ERREURS RESTANTES': summary.errors,
  };
  return STANDARD_FIELDS.map((field) => `${field} : ${mapping[field] ?? 'N/A'}`).join('\n');
}

const changedFiles = readChangedFiles();
const impact = resolveImpact(changedFiles);
const sha = arg('--sha', process.env.GITHUB_SHA || 'LOCAL_ONLY');
const summary = {
  module: impact.touchedModules.length ? impact.touchedModules.join(', ') : 'AUCUN MODULE RUNTIME',
  dependencies: impact.dependencies.length ? impact.dependencies.join(', ') : 'AUCUNE',
  files: changedFiles.length ? changedFiles.join(', ') : 'AUCUN',
  testsLaunched: (splitCsv(arg('--executed-tests'))[0] ? splitCsv(arg('--executed-tests')) : impact.testsToRun).join(', ') || 'AUCUN',
  testsNotNeeded: impact.testsNotNeeded.join(', ') || 'AUCUN',
  sha,
  webVersion: arg('--web-version', impact.webRuntimeImpact ? 'À TESTER' : 'NON NÉCESSAIRE'),
  desktop: arg('--desktop', 'NON TESTÉ'),
  mobile390: arg('--mobile390', 'NON TESTÉ'),
  deployment: arg('--deployment', impact.webRuntimeImpact ? 'PREVIEW CIBLÉE REQUISE' : 'AUCUN REBUILD APPLICATION'),
  errors: arg('--errors', 'AUCUNE'),
};

const payload = {
  base: arg('--base', ''),
  head: arg('--head', ''),
  sha,
  impact,
  summary,
  standardOutput: renderStandard(summary),
};

const jsonOut = arg('--json-out', '');
const mdOut = arg('--md-out', '');
if (jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(payload, null, 2));
if (mdOut) fs.writeFileSync(path.resolve(mdOut), `${payload.standardOutput}\n`);
console.log(payload.standardOutput);
