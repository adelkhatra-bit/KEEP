/**
 * Capture micro réelle pour la reconnaissance en session (Mode Réel
 * uniquement -- le Mode Démo n'appelle jamais ce module, voir
 * useSessionStore.ts). Premier plan uniquement pour cette itération : voir
 * docs/PLATFORM_COMPLIANCE.md section 8 pour les contraintes iOS/Android
 * qui bornent la continuité en arrière-plan.
 *
 * STATUT HONNÊTE : écrit et cohérent avec l'API documentée d'expo-av, mais
 * jamais exécuté sur un vrai appareil (nécessite une vraie clé AudD pour
 * être testé de bout en bout -- voir docs/PROJECT_STATUS.md). Le format de
 * sortie (.m4a, préréglage HIGH_QUALITY) est celui accepté par l'API AudD
 * (voir packages/music/src/providers/AudDRecognitionProvider.ts, champ
 * "file" en multipart -- AudD accepte les formats audio courants, m4a inclus).
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

let permissionGranted = false;

async function ensurePermission(): Promise<void> {
  if (permissionGranted) return;
  const { status } = await Audio.requestPermissionsAsync();
  if (status !== 'granted') throw new MicPermissionDeniedError();
  permissionGranted = true;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
}

/**
 * Enregistre un échantillon micro de SAMPLE_DURATION_MS et le renvoie sous
 * forme de Blob (format attendu par AudDRecognitionProvider.recognize).
 * Chaque appel crée et détruit son propre enregistrement -- pas d'état
 * partagé entre deux échantillons successifs.
 */
export async function captureAudioSample(): Promise<Blob> {
  await ensurePermission();

  const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await new Promise((resolve) => setTimeout(resolve, SAMPLE_DURATION_MS));
  await recording.stopAndUnloadAsync();

  const uri = recording.getURI();
  if (!uri) {
    throw new Error('Capture micro : aucun fichier produit par expo-av.');
  }

  // Astuce RN standard : fetch() sait lire une URI de fichier local et la
  // convertir en Blob -- pas besoin d'expo-file-system pour ce cas précis.
  const response = await fetch(uri);
  return response.blob();
}
