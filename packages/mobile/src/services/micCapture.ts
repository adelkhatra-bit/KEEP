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
  /** Cf. demande explicite du 23/08/2026 -- prouver, pas supposer, quelle capture a été déclenchée par quoi. */
  captureTrigger?: 'USER_TAP' | 'AUTO' | 'RESIDUAL_LOOP';
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

/**
 * BUG RÉEL diagnostiqué le 23/08/2026 (capture réelle iPhone, point orange
 * micro allumé alors qu'aucune session n'était active, à l'écran idle) :
 * `webStream` est délibérément réutilisé entre chaque tick (voir commentaire
 * ci-dessus sur l'AudioContext), mais ses tracks n'étaient JAMAIS arrêtées --
 * même à la fin d'une session. Résultat : dès la toute première vraie
 * capture de l'appareil, l'indicateur micro de l'OS reste allumé en
 * permanence pour toute la durée de vie de l'onglet, y compris à l'écran
 * idle. Appelé depuis useSessionStore.ts à la fin d'une session ET quand
 * l'onglet passe en arrière-plan (voir listener visibilitychange plus bas)
 * -- `ensureWebStream()`/`getWebAudioCtx()` recréent proprement au tick
 * suivant si besoin, aucune perte de fonctionnalité.
 */
export function releaseCaptureResources(): void {
  detachLiveLevelMeter();
  if (webStream) {
    webStream.getTracks().forEach((t) => t.stop());
    webStream = null;
  }
  if (webAudioCtx && webAudioCtx.state !== 'closed') {
    webAudioCtx.close().catch(() => {});
    webAudioCtx = null;
  }
}

let meterSource: MediaStreamAudioSourceNode | null = null;
let meterProcessor: ScriptProcessorNode | null = null;
let meterGain: GainNode | null = null;

function detachLiveLevelMeter(): void {
  if (meterProcessor) {
    meterProcessor.onaudioprocess = null;
    meterProcessor.disconnect();
    meterProcessor = null;
  }
  if (meterSource) {
    meterSource.disconnect();
    meterSource = null;
  }
  if (meterGain) {
    meterGain.disconnect();
    meterGain = null;
  }
}

/**
 * Retour visuel micro RÉELLEMENT en direct pendant toute la session (cf.
 * demande explicite du 24/08/2026 -- "si le micro écoute réellement, je veux
 * que le visuel réagisse en temps réel au son... quand je parle ou qu'il y a
 * de la musique, les barres doivent bouger immédiatement"). Root cause du gel
 * observé : le niveau n'était jusqu'ici mis à jour QUE pendant les ~10s
 * d'une capture d'empreinte (voir captureAudioSampleWeb), avec un silence
 * total de 8 à 53s entre deux captures (recognitionSettings.ts) -- pendant ce
 * silence, `micLevel` restait figé à sa dernière valeur, indiscernable d'un
 * micro mort. Ce graphe audio est COMPLÈTEMENT séparé de celui de la capture
 * d'empreinte (jamais touché, jamais réutilisé) -- juste un deuxième noeud
 * source sur le MÊME flux partagé (ensureWebStream), tournant en continu
 * pendant toute la durée de la session, indépendamment du cycle de capture.
 * Web uniquement -- voir captureAudioSampleNative pour le natif (metering
 * limité aux fenêtres de capture, pas encore de solution continue vérifiable
 * sans appareil réel, honnêtement non traité ici).
 */
export function startLiveLevelMeter(onLevel: (level: number) => void): () => void {
  if (Platform.OS !== 'web') return () => {};
  let stopped = false;

  const attach = async () => {
    if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const stream = await ensureWebStream();
      if (stopped) return;
      const ctx = getWebAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      if (stopped) return;
      detachLiveLevelMeter(); // au cas où un ancien graphe traînerait (reconnexion après onglet caché).
      meterSource = ctx.createMediaStreamSource(stream);
      // Buffer plus petit que celui de la capture d'empreinte (2048 vs 4096)
      // -- réactivité visuelle prioritaire ici (~46ms/mise à jour à 44.1kHz),
      // jamais utilisé pour fingerprinter quoi que ce soit.
      meterProcessor = ctx.createScriptProcessor(2048, 1, 1);
      meterGain = ctx.createGain();
      meterGain.gain.value = 0; // jamais renvoyé vers les haut-parleurs (effet Larsen), même raison que captureAudioSampleWeb.
      meterProcessor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i]);
          if (v > peak) peak = v;
        }
        onLevel(Math.min(1, peak));
      };
      meterSource.connect(meterProcessor);
      meterProcessor.connect(meterGain);
      meterGain.connect(ctx.destination);
    } catch {
      // Permission refusée/erreur -- silencieux ici, le prochain tick de
      // reconnaissance produira sa propre erreur explicite (micPermissionDenied).
    }
  };

  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      detachLiveLevelMeter();
      onLevel(0);
    } else {
      attach();
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  attach();

  return () => {
    stopped = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    detachLiveLevelMeter();
  };
}

// BUG RÉEL diagnostiqué le 23/08/2026 : aucun listener de visibilité n'existait
// -- un onglet mis en arrière-plan (écran verrouillé, changement d'app) sur un
// vrai iPhone laisse le `setTimeout` du tick suivant armé ; iOS Safari suspend
// puis reprend l'exécution JS à la remise au premier plan, ce qui peut relancer
// une capture sans nouveau tap explicite. On coupe le micro et on ne laisse
// jamais un tick se déclencher pendant que l'onglet est caché -- le tick suivant
// (programmé par useSessionStore.ts tant que la session reste active) rouvrira
// le micro proprement à la prochaine capture réelle au premier plan.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseCaptureResources();
  });
}

async function captureAudioSampleWeb(
  sampleDurationMs: number,
  silencePeakThreshold: number,
  diag: CaptureDiagnostics,
  onLevel?: (level: number) => void
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
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    // Réactivé le 24/08/2026 (cf. demande explicite -- "l'animation ne
    // bouge pas, le micro a l'air mort") : la fiabilité de la reconnaissance
    // (motif du gel initial, voir doc de cette fonction) est maintenant
    // acquise (AudD confirmé fonctionnel en direct) -- niveau réel calculé
    // par chunk (~93ms à 44.1kHz/4096) pour un retour visuel vraiment vivant,
    // jamais un chiffre inventé.
    if (onLevel) {
      let chunkPeak = 0;
      for (let i = 0; i < chunk.length; i++) {
        const v = Math.abs(chunk[i]);
        if (v > chunkPeak) chunkPeak = v;
      }
      onLevel(Math.min(1, chunkPeak));
    }
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
  // BUG RÉEL trouvé le 24/08/2026 (Adel, test réel : "l'animation reste
  // quasiment fixe" malgré une session active) : cette ligne fermait le
  // AudioContext partagé à la fin de CHAQUE capture d'empreinte (~10s toutes
  // les 8-53s selon recognitionSettings.ts), alors que le commentaire de
  // `webAudioCtx` plus haut affirme explicitement "un seul AudioContext créé
  // UNE FOIS, jamais fermé entre les ticks" -- contradiction directe. Cette
  // fermeture périodique est aussi ce qui empêchait tout metering CONTINU
  // (voir startLiveLevelMeter ci-dessous) : le contexte partagé ne survivait
  // jamais assez longtemps entre deux fenêtres de capture. Seul
  // releaseCaptureResources() (fin de session / onglet caché) doit fermer le
  // contexte partagé désormais -- jamais ce point-ci.

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

/** dBFS (expo-av metering, ~-160 à 0) -> 0-1 pour le même contrat que le niveau web (amplitude crête). */
function meteringToLevel(dbfs: number): number {
  return Math.max(0, Math.min(1, (dbfs + 60) / 60));
}

async function captureAudioSampleNative(
  sampleDurationMs: number,
  diag: CaptureDiagnostics,
  onLevel?: (level: number) => void
): Promise<Blob> {
  await ensureNativePermission();
  diag.micPermission = 'granted';
  const { recording } = await Audio.Recording.createAsync(
    { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
    onLevel ? (status) => { if (typeof status.metering === 'number') onLevel(meteringToLevel(status.metering)); } : undefined,
    100
  );
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
 * `onLevel` (0-1) : niveau micro RÉEL en direct pendant la capture --
 * réactivé le 24/08/2026 (cf. demande explicite -- "l'animation ne bouge
 * pas"), voir onaudioprocess (web) / metering expo-av (natif) ci-dessous.
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
  const diag: CaptureDiagnostics = {
    platform: Platform.OS === 'web' ? 'web' : 'native',
    micPermission: 'unknown',
    micDeviceFound: false,
    requestedCaptureDurationMs: sampleDurationMs,
  };
  try {
    const blob =
      Platform.OS === 'web'
        ? await captureAudioSampleWeb(sampleDurationMs, silencePeakThreshold, diag, onLevel)
        : await captureAudioSampleNative(sampleDurationMs, diag, onLevel);
    onDiagnostic?.(diag);
    return blob;
  } catch (e: any) {
    if (e instanceof MicPermissionDeniedError) diag.micPermission = 'denied';
    diag.error = e?.message ?? String(e);
    onDiagnostic?.(diag);
    throw e;
  }
}
