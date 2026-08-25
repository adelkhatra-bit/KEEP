/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel
 * uniquement -- le Mode Démo n'appelle jamais ce module, voir
 * useSessionStore.ts). Premier plan uniquement pour cette itération : voir
 * docs/PLATFORM_COMPLIANCE.md section 8 pour les contraintes iOS/Android
 * qui bornent la continuité en arrière-plan.
 */
import { Audio } from 'expo-av';

/** Durée d'échantillon -- assez long pour qu'AudD trouve une empreinte fiable, assez court pour rester réactif. */
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

async function ensurePermission(): Promise<void> {
  if (permissionGranted) return;
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') throw new MicPermissionDeniedError();
  permissionGranted = true;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
}

/**
 * Interrompt immédiatement l'échantillon en cours, si présent.
 * Utilisé lorsqu'une session KEEP est arrêtée afin que le micro ne continue
 * jamais à enregistrer pendant les secondes restantes de l'échantillon.
 */
export async function cancelAudioCapture(): Promise<void> {
  cancellationVersion += 1;
  const recording = activeRecording;
  activeRecording = null;
  if (!recording) return;
  try {
    await recording.stopAndUnloadAsync();
  } catch {
    // L'enregistrement peut déjà être arrêté/déchargé : dans ce cas l'objectif
    // d'interruption est déjà atteint.
  }
}

/**
 * Enregistre un échantillon micro de SAMPLE_DURATION_MS et le renvoie sous
 * forme de Blob (format attendu par AudDRecognitionProvider.recognize).
 */
export async function captureAudioSample(): Promise<Blob> {
  await ensurePermission();

  const versionAtStart = cancellationVersion;
  const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  activeRecording = recording;

  await new Promise((resolve) => setTimeout(resolve, SAMPLE_DURATION_MS));

  if (versionAtStart !== cancellationVersion || activeRecording !== recording) {
    throw new MicCaptureCancelledError();
  }

  activeRecording = null;
  await recording.stopAndUnloadAsync();

  const uri = recording.getURI();
  if (!uri) {
    throw new Error('Capture micro : aucun fichier produit par expo-av.');
  }

  const response = await fetch(uri);
  return response.blob();
}
