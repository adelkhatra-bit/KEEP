'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DEVICES, SCREENSHOTS, readJpegDimensions, validateScreenshotDirectory } = require('./app-store-screenshot-contract.cjs');

const ROOT = path.resolve(__dirname, '..');

function jpegHeader(width, height) {
  const buffer = Buffer.alloc(13);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0xff, 0xd9]).copy(buffer);
  return buffer;
}

test('contrat App Store : cinq écrans réels dans les deux tailles iPhone exigées', () => {
  assert.deepEqual(SCREENSHOTS.map(({ file }) => file), [
    '01-ecouter-orbe.jpg',
    '02-loki-pulse.jpg',
    '03-profil-story.jpg',
    '04-battle.jpg',
    '05-offres.jpg',
  ]);
  assert.deepEqual(DEVICES.map(({ type, width, height }) => ({ type, width, height })), [
    { type: 'APP_IPHONE_67', width: 1290, height: 2796 },
    { type: 'APP_IPHONE_65', width: 1284, height: 2778 },
  ]);
});

test('détecte les dimensions JPEG et refuse tout lot incomplet ou hors format', () => {
  const jpeg = jpegHeader(1290, 2796);
  assert.deepEqual(readJpegDimensions(jpeg), { width: 1290, height: 2796 });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-app-store-'));
  try {
    for (const { file } of SCREENSHOTS) fs.writeFileSync(path.join(directory, file), jpeg);
    assert.equal(validateScreenshotDirectory(directory, DEVICES[0]).length, 5);
    assert.throws(() => validateScreenshotDirectory(directory, DEVICES[1]), /attendu 1284x2778/);
    fs.unlinkSync(path.join(directory, SCREENSHOTS[0].file));
    assert.throws(() => validateScreenshotDirectory(directory, DEVICES[0]), /cinq fichiers JPEG attendus/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('workflow manuel, fixtures isolées du QR production, upload/version/locale/types vérifiés explicitement', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/app-store-screenshots.yml'), 'utf8');
  const capture = fs.readFileSync(path.join(ROOT, 'scripts/capture-app-store-screenshots.cjs'), 'utf8');
  const upload = fs.readFileSync(path.join(ROOT, 'scripts/upload-app-store-screenshots.cjs'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /appstore-fixture\.supabase\.co/);
  assert.doesNotMatch(workflow, /EXPO_PUBLIC_DEMO_MODE:\s*['"]true/);
  assert.match(capture, /claude-audit-free-user@mailinator\.com/);
  assert.match(capture, /return route\.abort\(\)/);
  assert.match(upload, /versionString === '1\.0\.0'/);
  assert.match(upload, /appStoreState === 'PREPARE_FOR_SUBMISSION'/);
  assert.match(upload, /locale === 'fr-FR'/);
  assert.match(upload, /state === 'COMPLETE'/);
  assert.doesNotMatch(upload, /UPLOAD_COMPLETE/);
});
