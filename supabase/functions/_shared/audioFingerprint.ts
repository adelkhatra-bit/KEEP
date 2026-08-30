// Empreinte audio "façon Shazam" -- pics de spectrogramme combinés en hashs
// combinatoires (algorithme public, documenté depuis la thèse Wang 2003 et
// repris par des implémentations ouvertes comme Dejavu). Aucune dépendance à
// un service tiers : ce module calcule tout localement à partir d'un WAV
// PCM 16 bits mono, le même format que celui déjà produit par
// packages/mobile/src/services/micCapture.ts côté client.
//
// Usage prévu :
//  - à l'ensemencement : sur l'extrait légal déjà récupéré (Deezer/iTunes
//    previewUrl) d'un morceau que KEEP vient d'identifier avec confiance ;
//  - à la recherche : sur l'échantillon micro/onglet d'une écoute en cours.
// Les deux passent par exactement le même computeFingerprint() -- seule la
// provenance de l'audio diffère.

import FFT from "npm:fft.js@4.0.4";

const FRAME_SIZE = 4096;
const HOP_SIZE = 1024; // 75% de recouvrement -- dense exprès : deux décodages
// indépendants du même son (ex. mpg123 côté ensemencement vs un autre
// décodeur côté requête) ne tombent presque jamais sur des limites de frame
// identiques à l'échantillon près. Un recouvrement plus dense augmente la
// probabilité qu'une frame de chaque côté tombe assez près pour que le pic
// dominant soit le même.
// Bande 300-2000 Hz : là où vit l'essentiel de l'énergie musicale
// distinctive (voix, mélodie, percussions), en évitant le sub-bass et le
// bruit haute fréquence qui dominent souvent une capture ambiante bruitée.
const MIN_FREQ_HZ = 300;
const MAX_FREQ_HZ = 2000;
const PEAKS_PER_FRAME = 4;
const FAN_OUT = 5; // combien de cibles par ancre
const TARGET_ZONE_FRAMES = 12; // fenêtre future pour l'appariement ancre/cible
// Quantification des bins avant hachage : sur deux décodages indépendants,
// le bin exact "gagnant" d'un pic peut sauter de ±1 à cause d'un
// arrondi/filtrage légèrement différent, même pour un contenu quasi
// identique -- ça change le hash entier si on garde le bin brut. Diviser
// par ce facteur absorbe ce jitter sans perdre la distinctivité utile (la
// bande 300-2000 Hz ne compte de toute façon qu'environ 160 bins bruts).
const BIN_QUANTIZE = 3;

export type FingerprintHash = { hash: number; timeOffsetMs: number };

export function decodeWavPcm16(buffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== 0x52494646 /* "RIFF" */ || view.getUint32(8, false) !== 0x57415645 /* "WAVE" */) {
    throw new Error("Format WAV invalide (en-tête RIFF/WAVE manquant)");
  }
  let offset = 12;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let numChannels = 1;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x666d7420 /* "fmt " */) {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 0x64617461 /* "data" */) {
      dataOffset = offset + 8;
      dataLength = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0) throw new Error("Format WAV invalide (chunk data manquant)");
  if (bitsPerSample !== 16) throw new Error(`WAV 16 bits attendu, reçu ${bitsPerSample} bits`);

  const sampleCount = Math.floor(dataLength / 2 / numChannels);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    // Ne garde que le premier canal : suffisant pour l'empreinte, évite le
    // mixage stéréo->mono qui n'apporterait rien à la reconnaissance.
    const s = view.getInt16(dataOffset + i * numChannels * 2, true);
    samples[i] = s / 32768;
  }
  return { samples, sampleRate };
}

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return w;
}

type Peak = { frame: number; bin: number; magnitude: number };

export function computeFingerprint(samples: Float32Array, sampleRate: number): FingerprintHash[] {
  if (samples.length < FRAME_SIZE) return [];

  const fft = new FFT(FRAME_SIZE);
  const window = hannWindow(FRAME_SIZE);
  const complexOut = fft.createComplexArray();
  const complexIn = fft.createComplexArray();

  const binHz = sampleRate / FRAME_SIZE;
  const minBin = Math.max(1, Math.floor(MIN_FREQ_HZ / binHz));
  const maxBin = Math.min(FRAME_SIZE / 2 - 1, Math.ceil(MAX_FREQ_HZ / binHz));

  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const peaksByFrame: Peak[][] = [];

  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP_SIZE;
    complexIn.fill(0);
    for (let i = 0; i < FRAME_SIZE; i++) complexIn[2 * i] = samples[start + i] * window[i];
    fft.transform(complexOut, complexIn);

    const magnitudes = new Float32Array(maxBin - minBin + 1);
    for (let bin = minBin; bin <= maxBin; bin++) {
      const re = complexOut[2 * bin];
      const im = complexOut[2 * bin + 1];
      magnitudes[bin - minBin] = Math.sqrt(re * re + im * im);
    }

    const framePeaks: Peak[] = [];
    for (let k = 0; k < PEAKS_PER_FRAME; k++) {
      let bestIdx = -1;
      let bestMag = 0;
      for (let i = 0; i < magnitudes.length; i++) {
        if (magnitudes[i] > bestMag) { bestMag = magnitudes[i]; bestIdx = i; }
      }
      if (bestIdx < 0 || bestMag <= 0) break;
      framePeaks.push({ frame: f, bin: bestIdx + minBin, magnitude: bestMag });
      // Supprime un petit voisinage pour éviter de reprendre le même pic.
      const clearFrom = Math.max(0, bestIdx - 2);
      const clearTo = Math.min(magnitudes.length - 1, bestIdx + 2);
      for (let i = clearFrom; i <= clearTo; i++) magnitudes[i] = 0;
    }
    peaksByFrame.push(framePeaks);
  }

  const hashes: FingerprintHash[] = [];
  const msPerFrame = (HOP_SIZE / sampleRate) * 1000;
  for (let f = 0; f < peaksByFrame.length; f++) {
    for (const anchor of peaksByFrame[f]) {
      const targets: Peak[] = [];
      for (let g = f + 1; g < Math.min(peaksByFrame.length, f + TARGET_ZONE_FRAMES); g++) {
        targets.push(...peaksByFrame[g]);
        if (targets.length >= FAN_OUT * 3) break;
      }
      let paired = 0;
      for (const target of targets) {
        if (paired >= FAN_OUT) break;
        const deltaFrames = target.frame - anchor.frame;
        const anchorQ = Math.round(anchor.bin / BIN_QUANTIZE);
        const targetQ = Math.round(target.bin / BIN_QUANTIZE);
        // Combine (freq ancre quantifiée, freq cible quantifiée, écart
        // temporel) en un seul entier. 14 bits par fréquence (largement
        // suffisant pour des bins déjà quantifiés) + 10 bits pour l'écart.
        const hash = ((anchorQ & 0x3fff) << 18) | ((targetQ & 0x3fff) << 4) | (deltaFrames & 0xf);
        hashes.push({ hash, timeOffsetMs: Math.round(anchor.frame * msPerFrame) });
        paired++;
      }
    }
  }
  return hashes;
}
