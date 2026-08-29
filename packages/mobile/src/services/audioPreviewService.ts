import { Audio, AVPlaybackStatus } from 'expo-av';

let activeSound: Audio.Sound | null = null;
let activeKey: string | null = null;
let activeStateListener: ((playing: boolean) => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeStartTimer: ReturnType<typeof setTimeout> | null = null;
let operation = Promise.resolve();

// Safari iOS peut rebloquer l'autoplay si un nouvel élément audio est recréé entre
// deux manches. Sur le web, KEEP Battle réutilise donc le même HTMLAudioElement
// pendant toute la session. L'élément est seulement mis en pause entre les titres ;
// il n'est pas détruit, ce qui conserve l'autorisation de lecture acquise.
let webAudio: any = null;
let webAudioKey: string | null = null;
let webAudioListener: ((playing: boolean) => void) | null = null;

function canUseWebAudio(): boolean {
  return typeof (globalThis as any)?.Audio === 'function' && typeof (globalThis as any)?.document !== 'undefined';
}

function getWebAudio(): any {
  if (!canUseWebAudio()) return null;
  if (!webAudio) {
    const HtmlAudio = (globalThis as any).Audio;
    webAudio = new HtmlAudio();
    webAudio.preload = 'auto';
    webAudio.playsInline = true;
  }
  return webAudio;
}

function clearActiveTimer() {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeStartTimer) {
    clearTimeout(activeStartTimer);
    activeStartTimer = null;
  }
}

async function stopWebAudio() {
  if (!webAudio) return;
  const listener = webAudioListener;
  webAudioListener = null;
  webAudioKey = null;
  try { webAudio.pause(); } catch {}
  listener?.(false);
}

async function unloadActive() {
  const sound = activeSound;
  const listener = activeStateListener;
  clearActiveTimer();
  activeSound = null;
  activeKey = null;
  activeStateListener = null;
  listener?.(false);
  await stopWebAudio();
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

async function ensurePlaying(sound: Audio.Sound): Promise<void> {
  let status = await sound.getStatusAsync();
  if (!status.isLoaded) throw new Error('AUDIO_PREVIEW_NOT_LOADED');
  if (!status.isPlaying) {
    try { await sound.playAsync(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 90));
    status = await sound.getStatusAsync();
  }
  if (!status.isLoaded || !status.isPlaying) throw new Error('AUDIO_PREVIEW_NOT_PLAYING');
}

async function createSoundWithRetry(
  previewUrl: string,
  positionMillis: number,
  onStatus: (status: AVPlaybackStatus, sound: Audio.Sound) => void,
  autoPlay = true,
): Promise<Audio.Sound> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let createdSound: Audio.Sound | null = null;
    try {
      await configurePreviewAudio();
      const created = await Audio.Sound.createAsync(
        { uri: previewUrl },
        {
          shouldPlay: false,
          positionMillis: Math.max(0, Math.round(positionMillis)),
          progressUpdateIntervalMillis: 200,
          volume: 1,
        },
        (status: AVPlaybackStatus) => {
          if (createdSound) onStatus(status, createdSound);
        },
      );
      createdSound = created.sound;
      if (autoPlay) {
        await ensurePlaying(created.sound);
      } else {
        const status = await created.sound.getStatusAsync();
        if (!status.isLoaded) throw new Error('AUDIO_PREVIEW_NOT_LOADED');
      }
      return created.sound;
    } catch (error) {
      lastError = error;
      if (createdSound) {
        try { await createdSound.stopAsync(); } catch {}
        try { await createdSound.unloadAsync(); } catch {}
      }
      await configurePreviewAudio().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 160 + attempt * 120));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AUDIO_PREVIEW_LOAD_FAILED');
}

async function playWebSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
  durationMillis: number,
  onStateChange?: (playing: boolean) => void,
): Promise<void> {
  const element = getWebAudio();
  if (!element) throw new Error('WEB_AUDIO_UNAVAILABLE');

  clearActiveTimer();
  try { element.pause(); } catch {}
  webAudioKey = key;
  webAudioListener = onStateChange ?? null;

  if (element.src !== previewUrl) {
    element.src = previewUrl;
    try { element.load(); } catch {}
  }

  const effectivePosition = positionMillis > 0 ? positionMillis : 9000;
  try {
    if (Number.isFinite(element.duration) && element.duration > 0) {
      element.currentTime = Math.min(effectivePosition / 1000, Math.max(0, element.duration - 0.25));
    } else {
      element.currentTime = effectivePosition / 1000;
    }
  } catch {}

  const playPromise = element.play();
  if (playPromise && typeof playPromise.then === 'function') await playPromise;
  if (webAudioKey !== key) return;
  onStateChange?.(true);

  activeTimer = setTimeout(() => {
    if (webAudioKey !== key || webAudio !== element) return;
    try { element.pause(); } catch {}
    webAudioListener?.(false);
    webAudioListener = null;
    webAudioKey = null;
  }, Math.max(1000, Math.round(durationMillis)));
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
      if (!status.isLoaded) return;
      if (activeSound === sound) activeStateListener?.(status.isPlaying);
      if (!status.didJustFinish) return;
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
 * Lit un segment court pour KEEP Battle. Quand aucun point de départ explicite
 * n'est fourni, on saute les 9 premières secondes du preview : cela évite les
 * intros silencieuses/instrumentales et donne plus souvent une zone vocale ou
 * mélodique reconnaissable, sans exposer tout le morceau.
 */
export async function playTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
  durationMillis = 8000,
  onStateChange?: (playing: boolean) => void,
): Promise<void> {
  return serialize(async () => {
    if (canUseWebAudio()) {
      await playWebSegment(key, previewUrl, positionMillis, durationMillis, onStateChange);
      return;
    }

    await unloadActive();
    await configurePreviewAudio();
    const effectivePosition = positionMillis > 0 ? positionMillis : 9000;

    const createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
      if (!status.isLoaded) return;
      if (activeSound === sound) activeStateListener?.(status.isPlaying);
      if (!status.didJustFinish) return;
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

/** Précharge l'extrait et le lance sur un timestamp absolu partagé entre joueurs. */
export async function scheduleTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
  durationMillis: number,
  startAtEpochMs: number,
  onStateChange?: (playing: boolean) => void,
): Promise<void> {
  return serialize(async () => {
    if (canUseWebAudio()) {
      clearActiveTimer();
      const delay = Math.max(0, Math.round(startAtEpochMs - Date.now()));
      activeStartTimer = setTimeout(() => {
        activeStartTimer = null;
        void serialize(async () => {
          await playWebSegment(key, previewUrl, positionMillis, durationMillis, onStateChange);
        });
      }, delay);
      return;
    }

    await unloadActive();
    await configurePreviewAudio();
    const effectivePosition = positionMillis > 0 ? positionMillis : 9000;
    const createdSound = await createSoundWithRetry(previewUrl, effectivePosition, (status, sound) => {
      if (!status.isLoaded) return;
      if (activeSound === sound) activeStateListener?.(status.isPlaying);
      if (!status.didJustFinish) return;
      if (activeSound === sound) {
        void serialize(async () => {
          if (activeSound !== sound) return;
          await unloadActive();
        });
      }
    }, false);
    activeSound = createdSound;
    activeKey = key;
    activeStateListener = onStateChange ?? null;
    const delay = Math.max(0, Math.round(startAtEpochMs - Date.now()));
    activeStartTimer = setTimeout(() => {
      activeStartTimer = null;
      if (activeSound !== createdSound) return;
      void createdSound.playAsync().then(() => {
        if (activeSound !== createdSound) return;
        onStateChange?.(true);
        activeTimer = setTimeout(() => {
          if (activeSound !== createdSound) return;
          void serialize(async () => { await unloadActive(); });
        }, Math.max(1000, Math.round(durationMillis)));
      }).catch(() => {
        if (activeSound === createdSound) void serialize(async () => { await unloadActive(); });
      });
    }, delay);
  });
}

export async function stopTrackPreview(key?: string): Promise<void> {
  return serialize(async () => {
    if (key && activeKey !== key && webAudioKey !== key) return;
    await unloadActive();
  });
}

export function isTrackPreviewActive(key: string): boolean {
  return (activeKey === key && activeSound !== null) || webAudioKey === key;
}
