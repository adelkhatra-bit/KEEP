/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel uniquement).
 */
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

function waitForSampleOrCancel(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      activeDelayCancel = null;
      resolve();
    }, SAMPLE_DURATION_MS);

    activeDelayCancel = () => {
      clearTimeout(timer);
      activeDelayCancel = null;
      resolve();
    };
  });
}

/** Interrompt immédiatement le micro ET l'attente d'échantillonnage. */
export async function cancelAudioCapture(): Promise<void> {
  cancellationVersion += 1;
  activeDelayCancel?.();

  const recording = activeRecording;
  activeRecording = null;
  if (!recording) return;

  try {
    await recording.stopAndUnloadAsync();
  } catch {
    // Déjà arrêté/déchargé : l'objectif d'interruption est atteint.
  }
}

export async function captureAudioSample(): Promise<Blob> {
  await ensurePermission();

  const versionAtStart = cancellationVersion;
  const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  activeRecording = recording;

  await waitForSampleOrCancel();

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
