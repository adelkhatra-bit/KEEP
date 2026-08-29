import { Audio, AVPlaybackStatus } from 'expo-av';

let activeSound: Audio.Sound | null = null;
let activeKey: string | null = null;
let activeStateListener: ((playing: boolean) => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let operation = Promise.resolve();

function clearActiveTimer() {
  if (!activeTimer) return;
  clearTimeout(activeTimer);
  activeTimer = null;
}

async function unloadActive() {
  const sound = activeSound;
  const listener = activeStateListener;
  clearActiveTimer();
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

async function configurePreviewAudio() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

async function createSoundWithRetry(
  previewUrl: string,
  positionMillis: number,
  onStatus: (status: AVPlaybackStatus, sound: Audio.Sound) => void,
): Promise<Audio.Sound> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let createdSound: Audio.Sound | null = null;
    try {
      const created = await Audio.Sound.createAsync(
        { uri: previewUrl },
        {
          shouldPlay: true,
          positionMillis: Math.max(0, Math.round(positionMillis)),
          progressUpdateIntervalMillis: 250,
          volume: 1,
        },
        (status: AVPlaybackStatus) => {
          if (createdSound) onStatus(status, createdSound);
        },
      );
      createdSound = created.sound;
      return created.sound;
    } catch (error) {
      lastError = error;
      if (createdSound) {
        try { await createdSound.unloadAsync(); } catch {}
      }
      await configurePreviewAudio().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AUDIO_PREVIEW_LOAD_FAILED');
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
  onEnded?: () => void,
): Promise<void> {
  return serialize(async () => {
    if (activeKey === key && activeSound) {
      await unloadActive();
      return;
    }

    await unloadActive();
    await configurePreviewAudio();

    const createdSound = await createSoundWithRetry(previewUrl, 0, (status, sound) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      if (activeSound === sound) {
        void serialize(async () => {
          if (activeSound !== sound) return;
          await unloadActive();
          onEnded?.();
        });
      }
    });

    activeSound = createdSound;
    activeKey = key;
    activeStateListener = onStateChange;
    onStateChange(true);
  });
}

/**
 * Lit un segment court à partir d'une position donnée. Cette variante est
 * utilisée par les boutons 0s / 10s / 20s de la session et partage le même
 * lecteur global : deux morceaux KEEP ne peuvent donc jamais se superposer.
 */
export async function playTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
  durationMillis = 7000,
  onStateChange?: (playing: boolean) => void,
): Promise<void> {
  return serialize(async () => {
    await unloadActive();
    await configurePreviewAudio();

    const createdSound = await createSoundWithRetry(previewUrl, positionMillis, (status, sound) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      if (activeSound === sound) {
        void serialize(async () => {
          if (activeSound !== sound) return;
          await unloadActive();
        });
      }
    });

    activeSound = createdSound;
    activeKey = key;
    activeStateListener = onStateChange ?? null;
    onStateChange?.(true);

    activeTimer = setTimeout(() => {
      if (activeSound !== createdSound) return;
      void serialize(async () => { await unloadActive(); });
    }, Math.max(1000, Math.round(durationMillis)));
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
