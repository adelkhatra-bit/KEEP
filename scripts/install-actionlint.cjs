#!/usr/bin/env node
'use strict';

// Official MIT-licensed release, pinned independently of the downloaded bytes.
const VERSION = '1.7.7';
const SHA256 = '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757';
const URL = `https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_linux_amd64.tar.gz`;
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function verifyArchive(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== SHA256) {
    throw new Error('actionlint: archive SHA256 mismatch; nothing will be executed');
  }
}

async function install(destination, fetchImpl = fetch) {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Pinned actionlint installer supports Linux x64 only');
  }
  const response = await fetchImpl(URL, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`actionlint download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyArchive(bytes);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-actionlint-'));
  try {
    const archive = path.join(temp, 'release.tar.gz');
    fs.writeFileSync(archive, bytes, { mode: 0o600 });
    // Extract only the executable, never arbitrary archive entries.
    execFileSync('tar', ['-xzf', archive, '-C', temp, 'actionlint']);
    const binary = path.join(temp, 'actionlint');
    fs.chmodSync(binary, 0o755);
    const version = execFileSync(binary, ['-version'], { encoding: 'utf8' });
    if (version.split(/\r?\n/)[0] !== VERSION) throw new Error('actionlint version mismatch');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(binary, destination);
    fs.chmodSync(destination, 0o755);
    return destination;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const destination = path.resolve(process.argv[2] || path.join(os.tmpdir(), `keep-actionlint-${VERSION}`, 'actionlint'));
  install(destination).then(() => {
    console.log(`actionlint ${VERSION} : SHA256 officiel vérifié ; installé dans ${destination}`);
  }).catch(() => {
    // Do not print network/proxy diagnostics which can contain credentials.
    console.error('Installation actionlint impossible (réseau, intégrité ou plateforme) ; aucun binaire non vérifié exécuté');
    process.exitCode = 1;
  });
}

module.exports = { VERSION, SHA256, URL, verifyArchive, install };
