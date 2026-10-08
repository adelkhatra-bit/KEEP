#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DEVICES, SCREENSHOTS, validateScreenshotDirectory } = require('./app-store-screenshot-contract.cjs');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.appstoreconnect.apple.com';
const REQUIRED_ENV = ['ASC_API_KEY_P8_BASE64', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_APP_ID'];
const targetFileName = (device, file) => `keep-v1.0.0-iphone-${device.key}-${file}`;
let jwt;
let jwtExpiresAt = 0;

function makeJwt() {
  if (REQUIRED_ENV.some((name) => !process.env[name]?.trim())) {
    throw new Error('Configuration App Store Connect manquante : vérifier les secrets ASC_* existants.');
  }
  const key = Buffer.from(process.env.ASC_API_KEY_P8_BASE64.trim(), 'base64');
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'ES256', kid: process.env.ASC_KEY_ID.trim(), typ: 'JWT' })}.${encode({
    iss: process.env.ASC_ISSUER_ID.trim(),
    iat: now - 30,
    exp: now + 900,
    aud: 'appstoreconnect-v1',
  })}`;
  jwtExpiresAt = now + 900;
  return `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function api(route, { method = 'GET', body } = {}) {
  const now = Math.floor(Date.now() / 1000);
  if (!jwt || jwtExpiresAt - now < 90) jwt = makeJwt();
  const response = await fetch(API + route, {
    method,
    headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} HTTP ${response.status}: ${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : null;
}

async function getSet(localizationId, displayType) {
  const result = await api(`/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?filter[screenshotDisplayType]=${displayType}&fields[appScreenshotSets]=screenshotDisplayType&limit=50`);
  const matches = (result.data || []).filter((entry) => entry.attributes?.screenshotDisplayType === displayType);
  if (matches.length > 1) throw new Error(`Plusieurs ensembles ${displayType} existent pour fr-FR.`);
  if (matches.length === 1) return matches[0];
  const created = await api('/v1/appScreenshotSets', {
    method: 'POST',
    body: {
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: displayType },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: localizationId } } },
      },
    },
  });
  return created.data;
}

async function listScreenshots(setId) {
  const result = await api(`/v1/appScreenshotSets/${setId}/appScreenshots?fields[appScreenshots]=fileName,assetDeliveryState&limit=200`);
  return result.data || [];
}

async function deleteScreenshot(shot) {
  await api(`/v1/appScreenshots/${shot.id}`, { method: 'DELETE' });
}

async function uploadBinary(operation, buffer) {
  const headers = Object.fromEntries((operation.requestHeaders || []).map(({ name, value }) => [name, value]));
  const chunk = buffer.subarray(operation.offset, operation.offset + operation.length);
  const response = await fetch(operation.url, { method: operation.method || 'PUT', headers, body: chunk });
  if (!response.ok) throw new Error(`Envoi du JPEG à Apple échoué (HTTP ${response.status}).`);
}

async function waitForComplete(id, fileName) {
  let lastState = 'UNKNOWN';
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const result = await api(`/v1/appScreenshots/${id}?fields[appScreenshots]=fileName,assetDeliveryState`);
    const attributes = result.data?.attributes || {};
    lastState = attributes.assetDeliveryState?.state || 'UNKNOWN';
    if (lastState === 'COMPLETE') return attributes;
    if (lastState === 'FAILED') {
      throw new Error(`${fileName} rejetée par Apple : ${JSON.stringify(attributes.assetDeliveryState?.errors || [])}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${fileName} n’est pas COMPLETE après 90 s (dernier état : ${lastState}).`);
}

async function createAndUpload(setId, device, file) {
  const name = targetFileName(device, file);
  const buffer = fs.readFileSync(path.join(ROOT, 'artifacts', `app-store-${device.key}`, file));
  const reservation = await api('/v1/appScreenshots', {
    method: 'POST',
    body: {
      data: {
        type: 'appScreenshots',
        attributes: { fileName: name, fileSize: buffer.length },
        relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
      },
    },
  });
  const shot = reservation.data;
  const operations = shot.attributes?.uploadOperations || [];
  if (!operations.length) throw new Error(`Apple n’a fourni aucune opération d’upload pour ${name}.`);
  for (const operation of operations) await uploadBinary(operation, buffer);
  const checksum = crypto.createHash('md5').update(buffer).digest('hex');
  await api(`/v1/appScreenshots/${shot.id}`, {
    method: 'PATCH',
    body: { data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: checksum } } },
  });
  await waitForComplete(shot.id, name);
  console.log(`${device.type}: ${name} — COMPLETE`);
}

async function verifyExactSet(setId, device) {
  const expected = SCREENSHOTS.map(({ file }) => targetFileName(device, file)).sort();
  let last = [];
  for (let attempt = 0; attempt < 15; attempt += 1) {
    last = await listScreenshots(setId);
    const names = last.map((shot) => shot.attributes?.fileName).sort();
    const complete = last.every((shot) => shot.attributes?.assetDeliveryState?.state === 'COMPLETE');
    if (last.length === 5 && complete && names.every((name, index) => name === expected[index])) {
      console.log(`Vérifié dans l’API ASC : ${device.type}, 5 captures COMPLETE.`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${device.type}: vérification ASC échouée ; ${last.length} captures, états ${JSON.stringify(last.map((shot) => shot.attributes?.assetDeliveryState?.state))}.`);
}

async function verifyTargetCaptures(setId, device) {
  const expected = new Set(SCREENSHOTS.map(({ file }) => targetFileName(device, file)));
  let last = [];
  for (let attempt = 0; attempt < 15; attempt += 1) {
    last = await listScreenshots(setId);
    const targets = last.filter((shot) => expected.has(shot.attributes?.fileName));
    if (targets.length === expected.size && targets.every((shot) => shot.attributes?.assetDeliveryState?.state === 'COMPLETE')) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${device.type}: les cinq nouvelles captures ne sont pas toutes COMPLETE dans l’API ASC.`);
}

async function main() {
  for (const device of DEVICES) {
    validateScreenshotDirectory(path.join(ROOT, 'artifacts', `app-store-${device.key}`), device);
  }

  const versions = await api(`/v1/apps/${encodeURIComponent(process.env.ASC_APP_ID.trim())}/appStoreVersions?filter[platform]=IOS&fields[appStoreVersions]=versionString,appStoreState&limit=50`);
  const version = (versions.data || []).find((entry) => entry.attributes?.versionString === '1.0.0'
    && entry.attributes?.appStoreState === 'PREPARE_FOR_SUBMISSION');
  if (!version) throw new Error('La version iOS 1.0.0 en PREPARE_FOR_SUBMISSION est introuvable ; aucune autre version ne sera modifiée.');

  const localizations = await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale&limit=50`);
  const localization = (localizations.data || []).find((entry) => entry.attributes?.locale === 'fr-FR');
  if (!localization) throw new Error('La localisation fr-FR de la version 1.0.0 est introuvable.');

  const plans = [];
  for (const device of DEVICES) {
    const set = await getSet(localization.id, device.type);
    const existing = await listScreenshots(set.id);
    const targets = new Map(SCREENSHOTS.map(({ file }) => [targetFileName(device, file), file]));
    const byName = new Map();
    for (const shot of existing) {
      const name = shot.attributes?.fileName;
      if (targets.has(name)) byName.set(name, [...(byName.get(name) || []), shot]);
    }
    for (const [name, shots] of byName) {
      if (shots.length > 1) throw new Error(`${device.type}: doublon ASC pour ${name}.`);
    }
    const completeTargets = existing.filter((shot) => targets.has(shot.attributes?.fileName)
      && shot.attributes?.assetDeliveryState?.state === 'COMPLETE');
    const incompleteTargets = existing.filter((shot) => targets.has(shot.attributes?.fileName)
      && shot.attributes?.assetDeliveryState?.state !== 'COMPLETE');
    const completeNames = new Set(completeTargets.map((shot) => shot.attributes.fileName));
    const missing = [...targets].filter(([name]) => !completeNames.has(name)).map(([, file]) => file);
    const oldShots = existing.filter((shot) => !completeNames.has(shot.attributes?.fileName));
    const slotsToFree = Math.max(0, existing.length - incompleteTargets.length + missing.length - 10);
    if (oldShots.length - incompleteTargets.length < slotsToFree) {
      throw new Error(`${device.type}: capacité App Store insuffisante pour ajouter 5 captures sans supprimer de capture cible COMPLETE.`);
    }
    const toRemove = [...incompleteTargets, ...oldShots.filter((shot) => !incompleteTargets.includes(shot)).slice(0, slotsToFree)];
    plans.push({ device, set, targets, existing, completeTargets, missing, toRemove });
  }

  for (const plan of plans) {
    for (const shot of plan.toRemove) await deleteScreenshot(shot);
    for (const file of plan.missing) await createAndUpload(plan.set.id, plan.device, file);
  }
  for (const plan of plans) await verifyTargetCaptures(plan.set.id, plan.device);

  for (const plan of plans) {
    const current = await listScreenshots(plan.set.id);
    const expected = new Set([...plan.targets.keys()]);
    for (const shot of current) {
      if (!expected.has(shot.attributes?.fileName)) await deleteScreenshot(shot);
    }
  }
  for (const plan of plans) await verifyExactSet(plan.set.id, plan.device);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
