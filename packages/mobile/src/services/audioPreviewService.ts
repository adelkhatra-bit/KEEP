import { Audio, AVPlaybackStatus } from 'expo-av';

let activeSound: Audio.Sound | null = null;
let activeKey: string | null = null;
let activeStateListener: ((playing: boolean) => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeStartTimer: ReturnType<typeof setTimeout> | null = null;
let operation = Promise.resolve();

// Safari iOS peut rebloquer l'autoplay si un nouvel élément audio est recréé entre
// deux manches. Sur le web, Loki Battle réutilise donc le même HTMLAudioElement
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

// BUG REEL trouve en test reel (31/08/2026, retour Adel : "il faut appuyer
// deux ou trois fois pour ecouter l'extrait"). Quand la source changeait
// (nouveau morceau), le code appelait element.play() immediatement apres
// avoir change .src -- sur un <audio> dont le nouveau media n'a pas encore
// fini de charger, .play() echoue silencieusement (rejette ou ne demarre
// rien) la plupart du temps. Le tap suivant reussissait seulement parce que
// le chargement avait eu le temps de finir en arriere-plan entretemps, pas
// grace a une vraie correction. Attend maintenant que le navigateur signale
// le media pret (canplay / readyState suffisant) avant de lancer la lecture,
// avec un timeout de securite pour ne jamais bloquer indefiniment sur un
// flux qui ne declenche jamais l'evenement.
function waitForPlayable(element: any, timeoutMs = 4000): Promise<void> {
  if (element.readyState >= 2) return Promise.resolve(); // HAVE_CURRENT_DATA ou plus : deja lisible.
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener('canplay', finish);
      element.removeEventListener('loadeddata', finish);
      element.removeEventListener('error', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    element.addEventListener('canplay', finish);
    element.addEventListener('loadeddata', finish);
    element.addEventListener('error', finish);
  });
}

async function playWebSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
  durationMillis: number,
  onStateChange?: (playing: boolean) => void,
  onEnded?: () => void,
): Promise<void> {
  const element = getWebAudio();
  if (!element) throw new Error('WEB_AUDIO_UNAVAILABLE');

  clearActiveTimer();
  try { element.pause(); } catch {}
  webAudioKey = key;
  webAudioListener = onStateChange ?? null;

  const sourceChanged = element.src !== previewUrl;
  if (sourceChanged) {
    element.src = previewUrl;
    try { element.load(); } catch {}
  }
  if (webAudioKey !== key) return;
  // Adel (02/09/2026) : vérifie toujours readyState, pas seulement quand la
  // source vient de changer -- un préchargement lancé en avance (voir
  // scheduleTrackPreviewSegment) peut ne pas encore être terminé au moment où
  // .play() doit réellement démarrer sur un réseau mobile lent ; waitForPlayable
  // se termine immédiatement si le flux est déjà prêt, donc ce garde-fou ne
  // coûte rien dans le cas normal.
  await waitForPlayable(element);
  if (webAudioKey !== key) return;

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
    onEnded?.();
  }, Math.max(1000, Math.round(durationMillis)));
}

/**
 * Joue un extrait promotionnel fourni par le catalogue. Loki ne télécharge et
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
    // BUG RÉEL (Adel, 01/09/2026 : "les musiques ne partent pas" puis "j'appuie
    // sur passer, ça bloque", dans le Swipe de Mes Sessions). Cette fonction
    // n'avait pas le même repli web que playTrackPreviewSegment/
    // scheduleTrackPreviewSegment plus haut dans ce fichier -- sur le web, elle
    // tombait dans le chemin expo-av natif ci-dessous au lieu de réutiliser le
    // <audio> HTML partagé. Résultat : pas de lecture fiable, et l'appel suivant
    // (stopTrackPreview, appelé par PASSER) attendait dans la même file
    // `serialize` derrière cette tentative expo-av qui ne se termine jamais
    // proprement sur ce moteur -- d'où le blocage.
    if (canUseWebAudio()) {
      if (webAudioKey === key) {
        clearActiveTimer();
        await stopWebAudio();
        return;
      }
      await playWebSegment(key, previewUrl, 0, 30000, onStateChange, onEnded);
      return;
    }

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
 * Lit un segment court pour Loki Battle. Quand aucun point de départ explicite
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
  onEnded?: () => void,
): Promise<void> {
  return serialize(async () => {
    if (canUseWebAudio()) {
      await playWebSegment(key, previewUrl, positionMillis, durationMillis, onStateChange, onEnded);
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
      onEnded?.();
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
      // Adel (02/09/2026) : "la musique démarre en retard, c'est déloyal" --
      // avant, le fichier ne commençait à charger qu'à l'instant de départ
      // synchronisé lui-même (dans le setTimeout ci-dessous). Sur un réseau
      // mobile plus lent que celui de l'autre joueur, le premier appel réseau
      // du morceau démarrait pile à ce moment-là, avec jusqu'à 4s de retard
      // réel avant que l'audio ne soit audible -- alors que le chrono visuel
      // tourne pour tout le monde depuis le même instant serveur. On précharge
      // maintenant le fichier dès que la manche est connue (le serveur laisse
      // ~3s avant `startAtEpochMs`, voir keep_battle_arena_start), pour que
      // .play() n'ait plus qu'à démarrer un flux déjà bufferisé.
      const element = getWebAudio();
      if (element) {
        webAudioKey = key;
        const sourceChanged = element.src !== previewUrl;
        if (sourceChanged) {
          try { element.pause(); } catch {}
          element.src = previewUrl;
          try { element.load(); } catch {}
        }
        void waitForPlayable(element).catch(() => {});
      }
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

// Adel (03/09/2026) : "j'ai pris un Battle, sur mon mobile j'entends pas le
// son" -- vraie cause trouvée en lisant le code : une manche d'arène démarre
// TOUJOURS via scheduleTrackPreviewSegment déclenché par un setTimeout
// synchronisé serveur (aucun tap direct à cet instant), jamais depuis un
// vrai geste utilisateur. Safari iOS bloque silencieusement .play() sur un
// <audio> qui n'a encore jamais été débloqué par un appel .play() survenu
// PENDANT un vrai geste (tap) -- une fois débloqué, le même élément reste
// utilisable ensuite pour des .play() programmatiques (minuteur, callback
// réseau), ce que ce fichier exploite déjà en réutilisant un seul
// <audio> partagé. Si l'utilisateur n'a jamais, plus tôt dans la page,
// tapé un bouton d'aperçu ailleurs dans l'app (Découvertes, Playlists...),
// ce même élément n'a jamais été débloqué -- silence total dès la première
// manche de Battle, sans exception ni log, donc invisible à la simple
// lecture des retries déjà en place. Doit être appelée de façon SYNCHRONE
// (avant tout `await`) depuis le gestionnaire onPress qui mène à un Battle
// (jouer solo, rejoindre en ligne, accepter un défi/une revanche) --
// jouer puis mettre en pause immédiatement sur le MÊME élément partagé
// suffit à obtenir ce déblocage pour le reste de la session.
export function unlockWebAudioForGesture(): void {
  const element = getWebAudio();
  if (!element) return;
  try {
    const playPromise = element.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => { try { element.pause(); } catch {} }).catch(() => {});
    } else {
      try { element.pause(); } catch {}
    }
  } catch {}
}
