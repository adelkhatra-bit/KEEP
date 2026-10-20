#!/usr/bin/env node
// Garde-fou des robots navigateur (ERR-SUPABASE-EGRESS-IMAGES-20261021).
//
// Chargé par NODE_OPTIONS="--require <dépôt>/scripts/robot-storage-guard.cjs"
// dans les workflows qui ouvrent l'app avec Playwright contre la PRODUCTION
// Supabase. Il ne change rien au reste du parcours (API, auth, données) : il
// sert seulement les IMAGES Storage (avatars, images de soirée, QR) par une
// image locale de 1×1 px. Ainsi un robot qui ouvre 50 navigateurs neufs ne
// retélécharge plus 50 fois des avatars de plusieurs Mo, ce qui consommait le
// quota « Cached Egress » du plan gratuit.
//
// - Ne touche que les requêtes GET vers /storage/v1/object|render/... ;
//   les envois (POST/PUT) et toutes les autres requêtes passent normalement.
// - Les routes déclarées ensuite par un script restent prioritaires
//   (règle Playwright : la dernière route enregistrée gagne).
// - Désactivable pour un diagnostic : LOKI_ROBOT_ALLOW_STORAGE=1.
// - Sans Playwright dans le processus, le fichier ne fait rien.
'use strict';

const Module = require('module');

const ENABLED = process.env.LOKI_ROBOT_ALLOW_STORAGE !== '1';
const STORAGE_IMAGE = /\/storage\/v1\/(object|render\/image)\/(public|sign|authenticated)\//;
// PNG 1×1 transparent (70 octets).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PLAYWRIGHT_MODULES = new Set(['playwright', 'playwright-core', '@playwright/test', 'playwright-chromium']);
const GUARD = Symbol.for('loki.robotStorageGuard');

const stats = { contexts: 0, served: 0 };

function isStorageImage(url) {
  try {
    return STORAGE_IMAGE.test(new URL(typeof url === 'string' ? url : url.href).pathname);
  } catch {
    return false;
  }
}

async function guardContext(context) {
  if (!ENABLED || !context || context[GUARD]) return context;
  context[GUARD] = true;
  stats.contexts += 1;
  await context.route((url) => isStorageImage(url), (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.fallback();
    stats.served += 1;
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-loki-robot-storage-guard': '1' },
      body: TINY_PNG,
    });
  });
  return context;
}

function patchBrowserPrototype(proto) {
  if (!proto || proto[GUARD]) return;
  proto[GUARD] = true;
  const newContext = proto.newContext;
  if (typeof newContext === 'function') {
    proto.newContext = async function guardedNewContext(...args) {
      return guardContext(await newContext.apply(this, args));
    };
  }
  const newPage = proto.newPage;
  if (typeof newPage === 'function') {
    proto.newPage = async function guardedNewPage(...args) {
      const page = await newPage.apply(this, args);
      await guardContext(page.context());
      return page;
    };
  }
}

function patchBrowserTypePrototype(proto) {
  if (!proto || proto[GUARD]) return;
  proto[GUARD] = true;
  for (const method of ['launch', 'connect', 'connectOverCDP']) {
    const original = proto[method];
    if (typeof original !== 'function') continue;
    proto[method] = async function guardedLaunch(...args) {
      const browser = await original.apply(this, args);
      patchBrowserPrototype(Object.getPrototypeOf(browser));
      for (const context of browser.contexts?.() || []) await guardContext(context);
      return browser;
    };
  }
  const persistent = proto.launchPersistentContext;
  if (typeof persistent === 'function') {
    proto.launchPersistentContext = async function guardedPersistent(...args) {
      return guardContext(await persistent.apply(this, args));
    };
  }
}

function patchLibrary(library) {
  if (!library) return;
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const browserType = library[name];
    if (browserType) patchBrowserTypePrototype(Object.getPrototypeOf(browserType));
  }
}

if (ENABLED && !Module[GUARD]) {
  Module[GUARD] = true;
  const load = Module._load;
  Module._load = function guardedLoad(request, parent, isMain) {
    const exported = load.apply(this, arguments);
    if (PLAYWRIGHT_MODULES.has(request)) {
      try { patchLibrary(exported); } catch { /* ne jamais casser un robot */ }
    }
    return exported;
  };
  process.on('exit', () => {
    if (stats.contexts > 0) {
      process.stderr.write(`[robot-storage-guard] ${stats.served} image(s) Storage servie(s) localement sur ${stats.contexts} contexte(s) navigateur — 0 octet de Cached Egress.\n`);
    }
  });
}

module.exports = { isStorageImage, guardContext, stats, TINY_PNG };
