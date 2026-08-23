/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel
 * uniquement -- le Mode Démo n'appelle jamais ce module, voir
 * useSessionStore.ts). Premier plan uniquement pour cette itération : voir
 * docs/PLATFORM_COMPLIANCE.md section 8 pour les contraintes iOS/Android
 * qui bornent la continuité en arrière-plan.
 *
 * Deux implémentations distinctes :
 * - Natif (iOS/Android) : expo-av `Audio.Recording`, format m4a.
 * - Web : Web Audio API brute (`AudioContext` + `ScriptProcessorNode`),
 *   PAS `MediaRecorder`. Historique du diagnostic (22-23/08/2026, tests
 *   réels iPhone/Safari) : plusieurs correctifs successifs sur le blob produit
 *   par `MediaRecorder` (extension de fichier, DSP désactivé) n'ont RIEN
 *   changé -- AudD échouait toujours avec "problem with creating an audio
 *   fingerprint" sur des fichiers audio/webm;codecs=opus pourtant de taille
 *   normale. Cause la plus probable, une fois les hypothèses précédentes
 *   épuisées : le muxer WebM de `MediaRecorder` sur Safari est récent et
 *   connu pour produire des conteneurs non-standard côté audio (le blob a
 *   l'air valide -- bon MIME, bonne taille -- mais son contenu binaire ne
 *   l'est pas forcément). Solution définitive : ne plus jamais dépendre d'un
 *   muxer de navigateur -- on lit les échantillons PCM bruts du micro et on
 *   fabrique nous-mêmes un fichier WAV (format non compressé, sans
 *   ambiguïté de conteneur possible, qu'aucun décodeur ne peut mal
 *   interpréter).
 */
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { DEFAULT_RECOGNITION_SETTINGS } from '../config/recognitionSettings';

export class MicPermissionDeniedError extends Error {
  constructor() {
    super('Permission microphone refusée -- KEEP ne peut pas identifier les morceaux sans elle.');
    this.name = 'MicPermissionDeniedError';
  }
}

/**
 * Diagnostic RÉEL d'une capture -- cf. demande explicite du 23/08/2026 :
 * "Ne suppose rien : mesure-le." Jamais affiché à l'utilisateur normal
 * (voir useSessionStore.ts -- envoyé uniquement en DEV via /api/dev/diagnostic-log).
 * Rempli au maximum même en cas d'échec (silence, permission refusée) --
 * un diagnostic partiel reste plus utile qu'aucun diagnostic.
 */
export interface CaptureDiagnostics {
  platform: 'web' | 'native';
  micPermission: 'granted' | 'denied' | 'unknown';
  micDeviceFound: boolean;
  micDeviceLabel?: string;
  audioContextStateBefore?: string;
  audioContextStateDuring?: string;
  audioContextStateAfter?: string;
  inputSampleRate?: number;
  requestedCaptureDurationMs: number;
  actualChunksReceived?: number;
  rmsLevel?: number;
  peakLevel?: number;
  wavSizeBytes?: number;
  wavDurationSec?: number;
  error?: string;
}

let permissionGranted = false;

async function ensureNativePermission(): Promise<void> {
  if (permissionGranted) return;
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') throw new MicPermissionDeniedError();
  permissionGranted = true;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
}

function throwIfTooSmall(blob: Blob, minBytes: number): void {
  // Un WAV PCM 16 bits de 6s mono fait plusieurs centaines de Ko -- un blob
  // très en dessous signale une capture ratée côté navigateur, pas assez
  // pour qu'AudD fingerprinte quoi que ce soit -- diagnostic clair plutôt
  // qu'un échec AudD énigmatique en aval.
  if (blob.size < minBytes) {
    throw new Error(
      `Capture micro : fichier audio trop petit (${blob.size} octets, type ${blob.type || 'inconnu'}) -- l'enregistrement n'a probablement pas fonctionné sur ce navigateur.`
    );
  }
}

function writeAsciiString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/** Encode des échantillons PCM float32 [-1,1] en un WAV mono 16 bits -- format sans ambiguïté de conteneur, décodable par n'importe quel service. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAsciiString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAsciiString(view, 8, 'WAVE');
  writeAsciiString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // taille du sous-bloc fmt (PCM)
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // 1 canal (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // débit octets/s
  view.setUint16(32, bytesPerSample, true); // alignement bloc
  view.setUint16(34, 16, true); // bits par échantillon
  writeAsciiString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += bytesPerSample) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

let webStream: MediaStream | null = null;

async function ensureWebStream(): Promise<MediaStream> {
  if (webStream && webStream.active) return webStream;
  try {
    webStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Désactivés explicitement : pensés pour la voix en appel, pas pour
        // fingerprinter de la musique ambiante (voir commentaire d'en-tête).
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (e: any) {
    if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
      throw new MicPermissionDeniedError();
    }
    throw e;
  }
  return webStream;
}

// Instance UNIQUE réutilisée pour toute la session, jamais recréée à chaque
// tick. Root cause du bug réel iPhone/Safari diagnostiqué le 23/08/2026 :
// chaque tick recréait un `new AudioContext()`, puis le fermait. Le tout
// premier tick se déclenche de façon synchrone dans le tap utilisateur sur
// "Capturer ce moment" (vrai geste), donc `resume()` fonctionnait. Mais
// chaque tick suivant est programmé via `setTimeout` -- sur Safari iOS réel,
// créer un NOUVEL AudioContext hors d'un geste utilisateur le laisse
// `suspended` en permanence, et `resume()` échoue silencieusement (catch
// vide plus bas). Résultat : `onaudioprocess` ne se déclenche jamais, 0
// échantillon capté, l'erreur "signal quasi silencieux" se déclenche à
// CHAQUE tick après le premier -- ce qui explique le message générique
// répété côté utilisateur alors que le backend ne reçoit strictement aucune
// requête (confirmé par les logs serveur). Un navigateur d'automatisation
// desktop applique une politique d'autoplay plus permissive, ce qui masquait
// le bug lors des tests précédents. Fix : un seul AudioContext créé UNE FOIS
// (dans le geste utilisateur initial), jamais fermé entre les ticks --
// seulement `resume()` si besoin, ce qui reste autorisé sur un contexte déjà
// démarré une fois, contrairement à la création d'un nouveau contexte.
let webAudioCtx: AudioContext | null = null;

function getWebAudioCtx(): AudioContext {
  if (webAudioCtx && webAudioCtx.state !== 'closed') return webAudioCtx;
  const AudioCtxCtor: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  webAudioCtx = new AudioCtxCtor();
  return webAudioCtx;
}

async function captureAudioSampleWeb(
  sampleDurationMs: number,
  silencePeakThreshold: number,
  diag: CaptureDiagnostics
): Promise<Blob> {
  const stream = await ensureWebStream();
  diag.micPermission = 'granted';
  const audioTrack = stream.getAudioTracks()[0];
  diag.micDeviceFound = !!audioTrack;
  diag.micDeviceLabel = audioTrack?.label || undefined;

  const audioCtx = getWebAudioCtx();
  diag.audioContextStateBefore = audioCtx.state;
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});

  const source = audioCtx.createMediaStreamSource(stream);
  // ScriptProcessorNode est dépréciée mais reste la façon la plus universellement
  // supportée (y compris Safari) de lire des échantillons PCM bruts sans passer
  // par un muxer de conteneur -- AudioWorklet demanderait de charger un module
  // séparé, complexité inutile ici.
  const bufferSize = 4096;
  const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  const chunks: Float32Array[] = [];

  // Nécessaire sur certains navigateurs pour que `onaudioprocess` se déclenche,
  // mais brancher directement sur `destination` renverrait le micro vers les
  // haut-parleurs (effet Larsen) -- on coupe le volume via un GainNode à 0.
  const muteGain = audioCtx.createGain();
  muteGain.gain.value = 0;

  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(audioCtx.destination);

  diag.audioContextStateDuring = audioCtx.state;
  const captureStartedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, sampleDurationMs));

  const stateDuringCapture = audioCtx.state;
  diag.audioContextStateAfter = audioCtx.state;
  diag.actualChunksReceived = chunks.length;
  processor.disconnect();
  source.disconnect();
  muteGain.disconnect();
  const sampleRate = audioCtx.sampleRate;
  diag.inputSampleRate = sampleRate;
  diag.requestedCaptureDurationMs = Date.now() - captureStartedAt;
  await audioCtx.close().catch(() => {});

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Un WAV valide mais SILENCIEUX passerait les vérifications précédentes
  // (taille correcte, type correct) tout en étant infingerprintable côté
  // AudD -- cause plausible des échecs répétés malgré un fichier "valide"
  // (cf. échecs persistants 21-23/08/2026 sur webm ET wav). On mesure le pic
  // ET la RMS réels du signal capté (cf. demande explicite du 23/08/2026 --
  // "le message peut lui-même être faux si le seuil est mal réglé, logue les
  // vraies valeurs avant de décider") et on échoue tôt avec un diagnostic
  // exploitable plutôt que de laisser AudD renvoyer une erreur générique.
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < merged.length; i++) {
    const v = Math.abs(merged[i]);
    if (v > peak) peak = v;
    sumSquares += merged[i] * merged[i];
  }
  const rms = merged.length > 0 ? Math.sqrt(sumSquares / merged.length) : 0;
  diag.peakLevel = peak;
  diag.rmsLevel = rms;
  diag.wavDurationSec = sampleRate > 0 ? merged.length / sampleRate : 0;

  if (peak < silencePeakThreshold) {
    throw new Error(
      `Capture micro : signal quasi silencieux (pic = ${peak.toFixed(4)}, rms = ${rms.toFixed(4)}, ${merged.length} échantillons, ${diag.actualChunksReceived} chunks reçus, contexte audio "${stateDuringCapture}") -- le micro n'a capté aucun son exploitable. Vérifie que la musique joue assez fort près du téléphone et que l'onglet a bien la permission micro active.`
    );
  }

  const blob = encodeWav(merged, sampleRate);
  diag.wavSizeBytes = blob.size;
  throwIfTooSmall(blob, 50000);
  return blob;
}

async function captureAudioSampleNative(sampleDurationMs: number, diag: CaptureDiagnostics): Promise<Blob> {
  await ensureNativePermission();
  diag.micPermission = 'granted';
  const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await new Promise((resolve) => setTimeout(resolve, sampleDurationMs));
  await recording.stopAndUnloadAsync();

  const uri = recording.getURI();
  if (!uri) {
    throw new Error('Capture micro : aucun fichier produit par expo-av.');
  }
  const response = await fetch(uri);
  const blob = await response.blob();
  diag.wavSizeBytes = blob.size;
  throwIfTooSmall(blob, 1000);
  return blob;
}

/**
 * Enregistre un échantillon micro et le renvoie sous forme de Blob (format
 * attendu par AudDRecognitionProvider.recognize). Durée et seuil de silence
 * pilotables depuis useSessionStore.ts (config Super Admin, voir
 * config/recognitionSettings.ts) -- valeurs par défaut si non précisés.
 *
 * `onLevel` (0-1) : réservé pour une future réactivation de l'animation
 * réactive au son réel -- désactivé pour l'instant, la fiabilité de la
 * reconnaissance prime (voir historique dans le commentaire d'en-tête).
 *
 * `onDiagnostic` (cf. demande explicite du 23/08/2026 -- "ne suppose rien,
 * mesure-le") : reçoit TOUJOURS le diagnostic rempli au maximum, même en
 * cas d'échec (permission refusée, silence) -- jamais affiché à
 * l'utilisateur normal, voir useSessionStore.ts pour l'envoi DEV-only vers
 * le log backend.
 */
export async function captureAudioSample(
  onLevel?: (level: number) => void,
  sampleDurationMs: number = DEFAULT_RECOGNITION_SETTINGS.sampleDurationMs,
  silencePeakThreshold: number = DEFAULT_RECOGNITION_SETTINGS.silencePeakThreshold,
  onDiagnostic?: (diag: CaptureDiagnostics) => void
): Promise<Blob> {
  void onLevel;
  const diag: CaptureDiagnostics = {
    platform: Platform.OS === 'web' ? 'web' : 'native',
    micPermission: 'unknown',
    micDeviceFound: false,
    requestedCaptureDurationMs: sampleDurationMs,
  };
  try {
    const blob =
      Platform.OS === 'web' ? await captureAudioSampleWeb(sampleDurationMs, silencePeakThreshold, diag) : await captureAudioSampleNative(sampleDurationMs, diag);
    onDiagnostic?.(diag);
    return blob;
  } catch (e: any) {
    if (e instanceof MicPermissionDeniedError) diag.micPermission = 'denied';
    diag.error = e?.message ?? String(e);
    onDiagnostic?.(diag);
    throw e;
  }
}
