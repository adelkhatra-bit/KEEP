const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BITS = 16;
const DURATION = 0.72;
const sampleCount = Math.floor(SAMPLE_RATE * DURATION);
const pcm = Buffer.alloc(sampleCount * 2);

function envelope(t, start, length) {
  if (t < start || t > start + length) return 0;
  const x = (t - start) / length;
  const attack = Math.min(1, x / 0.035);
  const decay = Math.exp(-5.2 * x);
  return attack * decay;
}

for (let i = 0; i < sampleCount; i += 1) {
  const t = i / SAMPLE_RATE;
  const first = envelope(t, 0.00, 0.34);
  const second = envelope(t, 0.19, 0.42);
  const shimmer = envelope(t, 0.08, 0.36);
  const value =
    first * (0.44 * Math.sin(2 * Math.PI * 1318.51 * t) + 0.17 * Math.sin(2 * Math.PI * 2637.02 * t)) +
    second * (0.42 * Math.sin(2 * Math.PI * 1760.00 * t) + 0.16 * Math.sin(2 * Math.PI * 3520.00 * t)) +
    shimmer * 0.09 * Math.sin(2 * Math.PI * 2349.32 * t);
  const clamped = Math.max(-1, Math.min(1, value));
  pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
}

const dataSize = pcm.length;
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataSize, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(CHANNELS, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28);
header.writeUInt16LE(CHANNELS * (BITS / 8), 32);
header.writeUInt16LE(BITS, 34);
header.write('data', 36);
header.writeUInt32LE(dataSize, 40);

const outDir = path.resolve(__dirname, '..', 'assets');
const outPath = path.join(outDir, 'keep-money.wav');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log('Generated Loki money notification sound:', path.relative(process.cwd(), outPath));
