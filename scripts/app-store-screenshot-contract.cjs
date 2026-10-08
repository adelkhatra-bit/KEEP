'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCREENSHOTS = [
  { file: '01-ecouter-orbe.jpg', label: 'Écouter · orbe' },
  { file: '02-loki-pulse.jpg', label: 'Loki Pulse' },
  { file: '03-profil-story.jpg', label: 'Profil · story' },
  { file: '04-battle.jpg', label: 'Battle' },
  { file: '05-offres.jpg', label: 'Offres' },
];

const DEVICES = [
  { key: '67', type: 'APP_IPHONE_67', width: 1290, height: 2796, viewport: { width: 430, height: 932 } },
  { key: '65', type: 'APP_IPHONE_65', width: 1284, height: 2778, viewport: { width: 428, height: 926 } },
];

function readJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('Fichier JPEG invalide');
  }

  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7) break;
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }
  throw new Error('Dimensions JPEG introuvables');
}

function validateScreenshotDirectory(directory, device) {
  const entries = fs.readdirSync(directory).filter((name) => /\.jpe?g$/i.test(name)).sort();
  const expected = SCREENSHOTS.map(({ file }) => file).sort();
  if (entries.length !== expected.length || entries.some((name, index) => name !== expected[index])) {
    throw new Error(`${directory}: cinq fichiers JPEG attendus dans l’ordre du contrat, reçus ${entries.join(', ') || 'aucun'}`);
  }

  return SCREENSHOTS.map(({ file, label }) => {
    const size = readJpegDimensions(fs.readFileSync(path.join(directory, file)));
    if (size.width !== device.width || size.height !== device.height) {
      throw new Error(`${file}: ${size.width}x${size.height}, attendu ${device.width}x${device.height}`);
    }
    return { file, label, ...size };
  });
}

module.exports = { DEVICES, SCREENSHOTS, readJpegDimensions, validateScreenshotDirectory };
