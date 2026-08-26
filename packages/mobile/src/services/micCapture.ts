/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel uniquement).
 *
 * Web = Web Audio API + WAV manuel. Natif = expo-av.
 * `onLevel` (optionnel, 0-1) pilote l'animation avec le niveau micro réel.
 */
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

const SAMPLE_DURATION_MS = 5000;

export class MicPermissionDeniedError extends Error {
  constructor() {
    super('Permission microphone refusée -- KEEP ne peut pas identifier les morceaux sans elle.');
    this.name = 'MicPermissionDeniedError';
  }
}

export class MicCaptureCancelledError extends Error {
  constructor() {
    super('Capture micro interrompue.');
    this.name = 'MicCaptureCancelledError';
  }
}

let permissionGranted = false;
let activeRecording: Audio.Recording | null = null;
let cancellationVersion = 0;
let activeDelayCancel: (() => void) | null = null;

async function ensurePermission(): Promise<void> {
  if (permissionGranted) return;
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') throw new MicPermissionDeniedError();
  permissionGranted = true;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
}

function waitForSampleOrCancel(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      activeDelayCancel = null;
      resolve();
    }, durationMs);

    activeDelayCancel = () => {
      clearTimeout(timer);
      activeDelayCancel = null;
      resolve();
    };
  });
}

// ---- Natif (iOS/Android) ----

async function captureAudioSampleNative(onLevel?: (level: number) => void): Promise<Blob> {
  await ensurePermission();

  const versionAtStart = cancellationVersion;
  const { recording } = await Audio.Recording.createAsync(
    { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
    onLevel ? (status) => {
      if (typeof status.metering !== 'number') return;
      const linear = Math.max(0, Math.min(1, (status.metering + 60) / 60));
      // L'animation doit rester lisible même avec une musique captée à faible volume.
      onLevel(Math.min(1, Math.pow(linear, 0.62) * 1.55));
    } : undefined,
    100
  );
  activeRecording = recording;

  await waitForSampleOrCancel(SAMPLE_DURATION_MS);

  if (versionAtStart !== cancellationVersion || activeRecording !== recording) {
    throw new MicCaptureCancelledError();
  }

  activeRecording = null;
  await recording.stopAndUnloadAsync();

  const uri = recording.getURI();
  if (!uri) throw new Error('Capture micro : aucun fichier produit par expo-av.');

  const response = await fetch(uri);
  return response.blob();
}

// ---- Web : Web Audio API brute + encodage WAV manuel ----

let webStream: MediaStream | null = null;
let webAudioCtx: AudioContext | null = null;

function getWebAudioCtx(): AudioContext {
  if (webAudioCtx && webAudioCtx.state !== 'closed') return webAudioCtx;
  const AudioCtxCtor: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  webAudioCtx = new AudioCtxCtor();
  return webAudioCtx;
}

async function ensureWebStream(): Promise<MediaStream> {
  if (webStream && webStream.active) return webStream;
  try {
    webStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
  } catch (e: any) {
    if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') throw new MicPermissionDeniedError();
    throw e;
  }
  return webStream;
}

function writeAsciiString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAsciiString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAsciiString(view, 8, 'WAVE');
  writeAsciiString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAsciiString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += bytesPerSample) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function captureAudioSampleWeb(onLevel?: (level: number) => void): Promise<Blob> {
  const versionAtStart = cancellationVersion;
  const stream = await ensureWebStream();
  const audioCtx = getWebAudioCtx();
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
  if (audioCtx.state !== 'running') {
    throw new Error("Micro indisponible (contexte audio suspendu par le navigateur) -- réessaie d'écouter.");
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const muteGain = audioCtx.createGain();
  muteGain.gain.value = 0;

  processor.onaudioprocess = (e) => {
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    if (onLevel) {
      let peak = 0;
      for (let i = 0; i < chunk.length; i++) {
        const v = Math.abs(chunk[i]);
        if (v > peak) peak = v;
      }
      onLevel(Math.min(1, Math.pow(Math.min(1, peak * 4.5), 0.68)));
    }
  };

  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(audioCtx.destination);

  await waitForSampleOrCancel(SAMPLE_DURATION_MS);

  processor.disconnect();
  source.disconnect();
  muteGain.disconnect();

  if (versionAtStart !== cancellationVersion) throw new MicCaptureCancelledError();

  const sampleRate = audioCtx.sampleRate;
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  let peak = 0;
  for (let i = 0; i < merged.length; i++) {
    const v = Math.abs(merged[i]);
    if (v > peak) peak = v;
  }
  if (totalLength === 0 || peak < 0.004) {
    throw new Error('Aucun son détecté -- vérifie que le micro capte bien la musique (volume, autorisation navigateur).');
  }

  // Normalisation locale avant envoi à la reconnaissance : on n'invente aucun
  // son, on remonte simplement un signal réellement capté mais trop faible.
  const gain = Math.min(10, 0.88 / peak);
  if (gain > 1.15) {
    for (let i = 0; i < merged.length; i++) {
      merged[i] = Math.max(-1, Math.min(1, merged[i] * gain));
    }
  }

  return encodeWav(merged, sampleRate);
}

export function releaseCaptureResources(): void {
  if (webStream) {
    webStream.getTracks().forEach((t) => t.stop());
    webStream = null;
  }
  if (webAudioCtx && webAudioCtx.state !== 'closed') {
    webAudioCtx.close().catch(() => {});
    webAudioCtx = null;
  }
}

/** Interrompt immédiatement le micro ET l'attente d'échantillonnage. */
export async function cancelAudioCapture(): Promise<void> {
  cancellationVersion += 1;
  activeDelayCancel?.();

  const recording = activeRecording;
  activeRecording = null;
  if (recording) {
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // Déjà arrêté/déchargé : l'objectif d'interruption est atteint.
    }
  }
  if (Platform.OS === 'web') releaseCaptureResources();
}

export async function captureAudioSample(onLevel?: (level: number) => void): Promise<Blob> {
  return Platform.OS === 'web' ? captureAudioSampleWeb(onLevel) : captureAudioSampleNative(onLevel);
}
