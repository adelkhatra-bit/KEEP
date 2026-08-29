/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel uniquement).
 *
 * Web = Web Audio API + WAV manuel. Natif = expo-av.
 * `onLevel` (optionnel, 0-1) pilote l'animation avec le niveau micro réel.
 */
import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { ensureBackgroundListeningService, stopBackgroundListeningService } from './backgroundListeningService';

const DEFAULT_SAMPLE_DURATION_MS = 4000;
const MIN_SAMPLE_DURATION_MS = 2500;
const MAX_SAMPLE_DURATION_MS = 8000;
const NATIVE_VISUAL_NOISE_FLOOR_DB = -52;
const WEB_VISUAL_RMS_FLOOR = 0.008;

function safeSampleDuration(durationMs?: number) {
  if (!Number.isFinite(durationMs)) return DEFAULT_SAMPLE_DURATION_MS;
  return Math.max(MIN_SAMPLE_DURATION_MS, Math.min(MAX_SAMPLE_DURATION_MS, Math.round(Number(durationMs))));
}

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
let nativeRecordingModeDesired = false;
let nativeAudioModeQueue: Promise<void> = Promise.resolve();

/**
 * expo-av applique le mode audio de façon asynchrone. Sans sérialisation, un
 * ancien ARRÊTER pouvait terminer après un nouveau DÉMARRER et remettre iOS en
 * `allowsRecordingIOS:false` alors qu'une nouvelle capture venait de partir.
 * Chaque opération lit donc le dernier état désiré au moment où elle s'exécute.
 */
function setNativeRecordingMode(desired: boolean): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  nativeRecordingModeDesired = desired;
  nativeAudioModeQueue = nativeAudioModeQueue
    .catch(() => {})
    .then(async () => {
      const target = nativeRecordingModeDesired;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: target,
        playsInSilentModeIOS: true,
        staysActiveInBackground: target,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    });
  return nativeAudioModeQueue;
}

async function ensurePermission(): Promise<void> {
  if (!permissionGranted) {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') throw new MicPermissionDeniedError();
    permissionGranted = true;
  }
  // `cancelAudioCapture` repasse explicitement iOS hors mode enregistrement
  // pour libérer le micro. Chaque nouvel échantillon réactive donc le mode ici,
  // y compris quand l'autorisation avait déjà été accordée auparavant.
  await setNativeRecordingMode(true);
}

function waitForSampleOrCancel(durationMs: number, versionAtStart: number): Promise<void> {
  return new Promise((resolve) => {
    // Couvre la course où ARRÊTER est pressé juste avant que l'attente soit
    // installée : on ne doit jamais patienter encore plusieurs secondes.
    if (versionAtStart !== cancellationVersion) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      activeDelayCancel = null;
      resolve();
    }, durationMs);

    activeDelayCancel = () => {
      clearTimeout(timer);
      activeDelayCancel = null;
      resolve();
    };

    // Couvre aussi une annulation intervenue entre le premier test et
    // l'installation de `activeDelayCancel`.
    if (versionAtStart !== cancellationVersion) activeDelayCancel();
  });
}

async function stopRecordingQuietly(recording: Audio.Recording): Promise<void> {
  try {
    await recording.stopAndUnloadAsync();
  } catch {
    // Déjà arrêté/déchargé : l'objectif de libération est atteint.
  }
}

// ---- Natif (iOS/Android) ----

async function captureAudioSampleNative(onLevel?: (level: number) => void, durationMs = DEFAULT_SAMPLE_DURATION_MS): Promise<Blob> {
  // Le numéro doit être capturé AVANT la permission/mise en mode audio. Si
  // ARRÊTER arrive pendant cette phase asynchrone, la capture ne doit surtout
  // pas créer un nouvel Audio.Recording après l'arrêt demandé.
  const versionAtStart = cancellationVersion;
  await ensurePermission();
  if (versionAtStart !== cancellationVersion) throw new MicCaptureCancelledError();

  // Android 14+ n'autorise le micro en arrière-plan que si un foreground
  // service de type `microphone` a été démarré pendant que KEEP est encore au
  // premier plan et après l'accord RECORD_AUDIO. Le module est idempotent :
  // les échantillons suivants réutilisent le même service tant que la session
  // d'écoute reste active.
  if (Platform.OS === 'android') {
    await ensureBackgroundListeningService();
    if (versionAtStart !== cancellationVersion) {
      await stopBackgroundListeningService();
      throw new MicCaptureCancelledError();
    }
  }

  const preset = Audio.RecordingOptionsPresets.HIGH_QUALITY;
  const recognitionOptions = {
    ...preset,
    isMeteringEnabled: true,
    android: { ...preset.android, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
    ios: { ...preset.ios, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
  };

  const { recording } = await Audio.Recording.createAsync(
    recognitionOptions,
    onLevel ? (status) => {
      if (typeof status.metering !== 'number') return;
      const db = Math.max(-160, Math.min(0, status.metering));
      // Important : le visuel ne doit PAS inventer du mouvement à partir du
      // souffle du micro. Sous le plancher de bruit on envoie un vrai 0.
      if (db <= NATIVE_VISUAL_NOISE_FLOOR_DB) {
        onLevel(0);
        return;
      }
      const normalized = (db - NATIVE_VISUAL_NOISE_FLOOR_DB) / Math.abs(NATIVE_VISUAL_NOISE_FLOOR_DB);
      // Courbe sensible au-dessus du plancher : petite musique = réaction visible,
      // musique forte = tourbillon rapide.
      onLevel(Math.min(1, Math.pow(Math.max(0, normalized), 0.38) * 1.24));
    } : undefined,
    40
  );
  activeRecording = recording;

  // ARRÊTER peut être pressé pendant `Audio.Recording.createAsync`. Dans cette
  // fenêtre l'ancien code ne voyait pas encore `activeRecording` et pouvait
  // laisser le nouvel enregistrement vivant jusqu'au prochain cycle.
  if (versionAtStart !== cancellationVersion) {
    activeRecording = null;
    await stopRecordingQuietly(recording);
    throw new MicCaptureCancelledError();
  }

  await waitForSampleOrCancel(safeSampleDuration(durationMs), versionAtStart);

  if (versionAtStart !== cancellationVersion || activeRecording !== recording) {
    if (activeRecording === recording) activeRecording = null;
    await stopRecordingQuietly(recording);
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

export function prepareAudioCaptureFromUserGesture(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const ctx = getWebAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  } catch {
    // La capture réelle remontera une erreur lisible si le navigateur refuse.
  }
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

async function captureAudioSampleWeb(onLevel?: (level: number) => void, durationMs = DEFAULT_SAMPLE_DURATION_MS): Promise<Blob> {
  const versionAtStart = cancellationVersion;
  const stream = await ensureWebStream();

  // Même garde-fou que sur natif : si ARRÊTER est pressé pendant la demande
  // getUserMedia, le flux qui arrive ensuite est fermé immédiatement.
  if (versionAtStart !== cancellationVersion) {
    releaseCaptureResources();
    throw new MicCaptureCancelledError();
  }

  const audioCtx = getWebAudioCtx();
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
  if (audioCtx.state !== 'running') {
    throw new Error("Micro indisponible (contexte audio suspendu par le navigateur) -- réessaie d'écouter.");
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(2048, 1, 1);
  const chunks: Float32Array[] = [];
  const muteGain = audioCtx.createGain();
  muteGain.gain.value = 0;

  processor.onaudioprocess = (e) => {
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    if (onLevel) {
      let squareSum = 0;
      for (let i = 0; i < chunk.length; i++) {
        squareSum += chunk[i] * chunk[i];
      }
      const rms = Math.sqrt(squareSum / Math.max(1, chunk.length));
      if (rms <= WEB_VISUAL_RMS_FLOOR) {
        onLevel(0);
      } else {
        const normalized = Math.min(1, (rms - WEB_VISUAL_RMS_FLOOR) * 12);
        onLevel(Math.min(1, Math.pow(normalized, 0.46) * 1.15));
      }
    }
  };

  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(audioCtx.destination);

  await waitForSampleOrCancel(safeSampleDuration(durationMs), versionAtStart);

  processor.disconnect();
  source.disconnect();
  muteGain.disconnect();

  if (versionAtStart !== cancellationVersion) {
    releaseCaptureResources();
    throw new MicCaptureCancelledError();
  }

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
  if (recording) await stopRecordingQuietly(recording);

  if (Platform.OS === 'web') {
    releaseCaptureResources();
    return;
  }

  if (Platform.OS === 'android') {
    await stopBackgroundListeningService();
  }

  // Sur iOS, `stopAndUnloadAsync` arrête le fichier mais la session audio peut
  // rester en mode enregistrement. La file de mode audio garantit qu'un ancien
  // ARRÊTER ne peut pas désactiver un nouveau démarrage concurrent.
  try {
    await setNativeRecordingMode(false);
  } catch {
    // Le micro est déjà arrêté : une erreur de changement de mode ne doit pas
    // empêcher l'interface de revenir à l'état inactif.
  }
}

export async function captureAudioSample(onLevel?: (level: number) => void, durationMs = DEFAULT_SAMPLE_DURATION_MS): Promise<Blob> {
  const duration = safeSampleDuration(durationMs);
  return Platform.OS === 'web' ? captureAudioSampleWeb(onLevel, duration) : captureAudioSampleNative(onLevel, duration);
}
