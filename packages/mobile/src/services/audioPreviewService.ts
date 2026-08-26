import { Audio, AVPlaybackStatus } from 'expo-av';

let activeSound: Audio.Sound | null = null;
let activeKey: string | null = null;
let activeStateListener: ((playing: boolean) => void) | null = null;
let operation = Promise.resolve();

async function unloadActive() {
  const sound = activeSound;
  const listener = activeStateListener;
  activeSound = null;
  activeKey = null;
  activeStateListener = null;
  listener?.(false);
  if (!sound) return;
  try { await sound.stopAsync(); } catch {}
  try { await sound.unloadAsync(); } catch {}
}

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = operation.then(task, task);
  operation = next.then(() => undefined, () => undefined);
  return next;
}

/**
 * Joue un extrait promotionnel fourni par le catalogue. KEEP ne télécharge et
 * ne stocke jamais le fichier audio. Un seul extrait peut jouer à la fois :
 * lancer un autre morceau coupe automatiquement le précédent.
 */
export async function toggleTrackPreview(
  key: string,
  previewUrl: string,
  onStateChange: (playing: boolean) => void,
): Promise<void> {
  return serialize(async () => {
    if (activeKey === key && activeSound) {
      await unloadActive();
      return;
    }

    await unloadActive();
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: previewUrl },
      { shouldPlay: true, progressUpdateIntervalMillis: 250 },
      (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish && activeSound === sound) {
          void serialize(async () => { await unloadActive(); });
        }
      },
    );

    activeSound = sound;
    activeKey = key;
    activeStateListener = onStateChange;
    onStateChange(true);
  });
}

export async function stopTrackPreview(key?: string): Promise<void> {
  return serialize(async () => {
    if (key && activeKey !== key) return;
    await unloadActive();
  });
}

export function isTrackPreviewActive(key: string): boolean {
  return activeKey === key && activeSound !== null;
}
