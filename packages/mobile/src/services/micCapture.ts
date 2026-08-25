/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel uniquement).
 *
 * BUG RÉEL trouvé le 26/08/2026, reproduit en direct dans un vrai navigateur
 * (Adel : "'fetch' called on an object that does not implement interface
 * Window", visible comme bannière d'erreur pendant une session active) :
 * cette fonction utilisait `Audio.Recording` (expo-av) SANS jamais distinguer
 * web/natif. Or expo-av est explicitement déprécié pour le web (warning
 * console confirmé : "Expo AV has been deprecated... Use expo-audio/expo-video")
 * et son shim web casse en interne (fetch appelé avec un mauvais contexte
 * `this`) -- confirmé par la trace réelle (getSession -> refresh -> fetch,
 * capturée en ouvrant un vrai Chrome sur l'app). Conséquence directe : la
 * reconnaissance ne fonctionnait plus DU TOUT sur web, la seule plateforme
 * réellement testée cette session.
 *
 * Ce même problème avait déjà été résolu plus tôt dans le projet (voir
 * historique : Web Audio API brute au lieu de MediaRecorder/expo-av sur web,
 * qui produisaient des conteneurs non standard) puis reperdu lors d'une
 * réécriture de ce fichier sur cette branche. Réappliqué ici avec la même
 * approche éprouvée : natif = expo-av (fonctionne réellement là), web = Web
 * Audio API + encodage WAV manuel (aucune ambiguïté de conteneur possible).
 *
 * `onLevel` (optionnel, 0-1) : niveau micro réel pendant la fenêtre de
 * capture -- permet à l'animation de réagir réellement au son (cf. demande
 * explicite du 26/08/2026), jamais une valeur inventée.
 */
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

const SAMPLE_DURATION_MS = 6000;

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

// ---- Natif (iOS/Android) : expo-av, fonctionne réellement sur ces plateformes ----

async function captureAudioSampleNative(onLevel?: (level: number) => void): Promise<Blob> {
  await ensurePermission();

  const versionAtStart = cancellationVersion;
  const { recording } = await Audio.Recording.createAsync(
    { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
    onLevel ? (status) => { if (typeof status.metering === 'number') onLevel(Math.max(0, Math.min(1, (status.metering + 60) / 60))); } : undefined,
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

// ---- Web : Web Audio API brute + encodage WAV manuel (jamais de conteneur ambigu) ----

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
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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
  // BUG RÉEL PLAUSIBLE identifié le 26/08/2026 (compte AudD actif, 166
  // requêtes reçues ce mois d'après le vrai tableau de bord d'Adel, mais
  // aucune reconnaissance ne remonte jamais) : la plupart des navigateurs
  // créent un AudioContext à l'état "suspended" tant qu'il n'est pas repris
  // dans le MÊME tick de user-gesture. Le .resume() ci-dessus peut échouer
  // silencieusement (.catch(()=>{})) selon le navigateur/le moment exact de
  // l'appel -- si le contexte reste suspendu, onaudioprocess ne capte aucune
  // donnée réelle et un WAV vide/silencieux part quand même vers AudD à
  // chaque tick, consommant le quota sans jamais pouvoir matcher. On
  // n'envoie plus vers AudD tant que le contexte n'est pas réellement actif.
  if (audioCtx.state !== 'running') {
    throw new Error("Micro indisponible (contexte audio suspendu par le navigateur) -- réessaie d'écouter.");
  }

  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const muteGain = audioCtx.createGain();
  muteGain.gain.value = 0; // jamais renvoyé vers les haut-parleurs (effet Larsen).

  processor.onaudioprocess = (e) => {
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    if (onLevel) {
      let peak = 0;
      for (let i = 0; i < chunk.length; i++) { const v = Math.abs(chunk[i]); if (v > peak) peak = v; }
      onLevel(Math.min(1, peak));
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
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  let peak = 0;
  for (let i = 0; i < merged.length; i++) { const v = Math.abs(merged[i]); if (v > peak) peak = v; }
  // Même logique que le SILENCE_FLOOR de l'animation (HomeScreenCompact.tsx) :
  // en dessous, il n'y a rien d'exploitable à envoyer -- mieux vaut un échec
  // visible ("aucun son détecté") qu'un WAV silencieux de plus consommé sur
  // le quota AudD pour un "no match" qui ne dit rien à personne.
  if (totalLength === 0 || peak < 0.008) {
    throw new Error('Aucun son détecté -- vérifie que le micro capte bien la musique (volume, autorisation navigateur).');
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
