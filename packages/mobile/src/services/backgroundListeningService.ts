import { Platform } from 'react-native';
import KeepBackgroundListening from '../../modules/keep-background-listening';

let starting: Promise<boolean> | null = null;

/**
 * Android 14+ exige que le service microphone soit démarré pendant que KEEP est
 * encore visible et possède déjà RECORD_AUDIO. `micCapture` appelle donc cette
 * fonction juste après l'obtention de la permission et avant le premier
 * Audio.Recording. Web/iOS restent strictement inchangés.
 */
export async function ensureBackgroundListeningService(): Promise<boolean> {
  if (Platform.OS !== 'android' || !KeepBackgroundListening) return false;
  try {
    if (!KeepBackgroundListening.isSupported()) return false;
    if (KeepBackgroundListening.isRunning()) return true;
    if (!starting) {
      starting = KeepBackgroundListening.start()
        .then(() => true)
        .catch(() => false)
        .finally(() => { starting = null; });
    }
    return await starting;
  } catch {
    return false;
  }
}

/** Arrêt idempotent : ne doit jamais empêcher le bouton ARRÊTER de finir. */
export async function stopBackgroundListeningService(): Promise<void> {
  if (Platform.OS !== 'android' || !KeepBackgroundListening) return;
  try {
    await starting?.catch(() => false);
    starting = null;
    await KeepBackgroundListening.stop();
  } catch {
    // Le service peut déjà avoir été tué par Android ; le micro JS est malgré
    // tout libéré par `cancelAudioCapture`.
  }
}
