import { Platform } from 'react-native';
import { isNativeRecordingModeActive } from './micCapture';

type ExpoAVModule = typeof import('expo-av');
type AVPlaybackStatus = import('expo-av').AVPlaybackStatus;
type NativeSound = Awaited<ReturnType<ExpoAVModule['Audio']['Sound']['createAsync']>>['sound'];
let nativeExpoAVModule: ExpoAVModule | null = null;
function getNativeExpoAV(): ExpoAVModule {
  if (!nativeExpoAVModule) nativeExpoAVModule = require('expo-av') as ExpoAVModule;
  return nativeExpoAVModule;
}

let activeSound: NativeSound | null = null;
let activeKey: string | null = null;
let activeStateListener: ((playing: boolean) => void) | null = null;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeStartTimer: ReturnType<typeof setTimeout> | null = null;
let operation = Promise.resolve();

const AUDIO_CREATE_TIMEOUT_MS = 3200;
const AUDIO_CONTROL_TIMEOUT_MS = 1400;

function withAudioTimeout<T>(promise: Promise<T>, label: string, timeoutMs = AUDIO_CONTROL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label}_TIMEOUT`));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Préchargement de la manche suivante (Loki Battle solo). Distinct de
// activeSound : le son en cours de lecture n'est jamais touché pendant
// qu'un second son se charge en arrière-plan pendant la pause de 2,8s après
// une réponse. Natif uniquement -- voir canUseWebAudio() plus bas, le web
// réutilise un unique <audio> partagé pour contourner le blocage autoplay
// Safari iOS, donc un deuxième flux en parallèle n'a pas sa place ici.
let preloadedSound: NativeSound | null = null;
let preloadedKey: string | null = null;

// Préchargement séparé pour l'écoute profil/Swipe. Ne réutilise jamais le
// slot Battle ci-dessus : une prélecture sociale ne doit pas pouvoir évincer
// la manche Battle N+1 et inversement.
let profilePreloadedSound: NativeSound | null = null;
let profilePreloadedUrl: string | null = null;
let webProfilePreload: any = null;
let webProfilePreloadUrl: string | null = null;

// Safari iOS peut rebloquer l'autoplay si un nouvel élément audio est recréé entre
// deux manches. Sur le web, Loki Battle réutilise donc le même HTMLAudioElement
// pendant toute la session. L'élément est seulement mis en pause entre les titres ;
// il n'est pas détruit, ce qui conserve l'autorisation de lecture acquise.
let webAudio: any = null;
let webAudioKey: string | null = null;
let webAudioListener: ((playing: boolean) => void) | null = null;
let speechDuckSerial = 0;
let speechDuckWebElement: any = null;
let speechDuckWebVolume: number | null = null;
let speechDuckNativeSound: NativeSound | null = null;
let speechDuckNativeVolume: number | null = null;
const SILENT_UNLOCK_SOURCE = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

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

export async function duckActivePreviewForSpeech(targetVolume = 0.14): Promise<number> {
  const token = ++speechDuckSerial;
  const safeTarget = Math.max(0, Math.min(1, targetVolume));

  const element = webAudio;
  if (element && !element.paused) {
    // Deux prises de parole rapprochées ne doivent jamais mémoriser le volume
    // déjà ducké comme nouveau "volume normal". Conserver la première valeur
    // jusqu'à la restauration finale évite qu'un Swipe/Loki Pulse reste à
    // ~14-16 % de volume après que Loki a parlé.
    if (speechDuckWebElement !== element || speechDuckWebVolume === null) {
      speechDuckWebElement = element;
      speechDuckWebVolume = Number.isFinite(element.volume) ? Number(element.volume) : 1;
    }
    try { element.volume = Math.min(speechDuckWebVolume ?? 1, safeTarget); } catch {}
  }

  const sound = activeSound;
  if (sound) {
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        if (speechDuckNativeSound !== sound || speechDuckNativeVolume === null) {
          speechDuckNativeSound = sound;
          speechDuckNativeVolume = Number.isFinite((status as any).volume) ? Number((status as any).volume) : 1;
        }
        await sound.setVolumeAsync(Math.min(speechDuckNativeVolume ?? 1, safeTarget));
      }
    } catch {}
  }
  return token;
}

export async function restoreActivePreviewAfterSpeech(token: number): Promise<void> {
  if (token !== speechDuckSerial) return;

  const element = speechDuckWebElement;
  const webVolume = speechDuckWebVolume;
  speechDuckWebElement = null;
  speechDuckWebVolume = null;
  if (element && webVolume !== null) {
    try { element.volume = webVolume; } catch {}
  }

  const sound = speechDuckNativeSound;
  const nativeVolume = speechDuckNativeVolume;
  speechDuckNativeSound = null;
  speechDuckNativeVolume = null;
  if (sound && nativeVolume !== null) {
    try { await sound.setVolumeAsync(nativeVolume); } catch {}
  }
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
  try { await withAudioTimeout(sound.stopAsync(), 'AUDIO_STOP'); } catch {}
  try { await withAudioTimeout(sound.unloadAsync(), 'AUDIO_UNLOAD'); } catch {}
}

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = operation.then(task, task);
  operation = next.then(() => undefined, () => undefined);
  return next;
}

async function discardPreloaded() {
  const stale = preloadedSound;
  preloadedSound = null;
  preloadedKey = null;
  if (!stale) return;
  try { await withAudioTimeout(stale.stopAsync(), 'AUDIO_PRELOAD_STOP'); } catch {}
  try { await withAudioTimeout(stale.unloadAsync(), 'AUDIO_PRELOAD_UNLOAD'); } catch {}
}

async function discardProfilePreloaded() {
  const stale = profilePreloadedSound;
  profilePreloadedSound = null;
  profilePreloadedUrl = null;
  if (!stale) return;
  try { await withAudioTimeout(stale.stopAsync(), 'AUDIO_PRELOAD_STOP'); } catch {}
  try { await withAudioTimeout(stale.unloadAsync(), 'AUDIO_PRELOAD_UNLOAD'); } catch {}
}

// BUG RÉEL trouvé en audit runtime (Adel, 22/09/2026, "beaucoup de bugs quand
// il joue en solo avec la musique") : cette fonction forçait toujours
// allowsRecordingIOS:false sur l'état audio natif GLOBAL de l'app, sans savoir
// si micCapture.ts avait une capture micro active au même instant (session
// d'écoute en arrière-plan pendant qu'un extrait Battle/Swipe démarre). Les
// deux fichiers appellent Audio.setAudioModeAsync sur le MÊME état partagé,
// chacun dans sa propre file -- sans coordination, celui qui s'exécute en
// dernier gagne. Résultat possible : le micro se coupe silencieusement sous
// une capture en cours, sans erreur visible, dès qu'une preview audio démarre.
// On ne désactive donc plus jamais l'enregistrement si une capture est
// réellement en cours -- l'extrait joue par-dessus (MixWithOthers, comme
// micCapture.ts), sans jamais couper le micro.
export async function prepareAudioSessionForSpeech(): Promise<void> {
  if (Platform.OS === 'web') return;
  // TestFlight/iOS : expo-speech partage la session audio globale avec
  // expo-av. Après micro/Battle, forcer un mode de lecture audible avant la
  // synthèse évite une voix routée/silencieuse alors que la preview est active.
  await configurePreviewAudio();
}

async function configurePreviewAudio() {
  const { Audio, InterruptionModeIOS } = getNativeExpoAV();
  const recordingActive = isNativeRecordingModeActive();
  await withAudioTimeout(Audio.setAudioModeAsync({
    allowsRecordingIOS: recordingActive,
    playsInSilentModeIOS: true,
    staysActiveInBackground: recordingActive,
    // Hors capture micro, l'extrait doit être le son principal du téléphone :
    // ne pas le laisser se battre à bas volume avec Spotify/Tesla/autre audio.
    // Pendant une vraie capture on conserve MixWithOthers pour ne jamais couper
    // le microphone au milieu d'une identification.
    interruptionModeIOS: recordingActive ? InterruptionModeIOS.MixWithOthers : InterruptionModeIOS.DoNotMix,
    shouldDuckAndroid: recordingActive,
    playThroughEarpieceAndroid: false,
  }), 'AUDIO_MODE', 1800);
}

async function ensurePlaying(sound: NativeSound): Promise<void> {
  let status = await withAudioTimeout(sound.getStatusAsync(), 'AUDIO_STATUS');
  if (!status.isLoaded) throw new Error('AUDIO_PREVIEW_NOT_LOADED');
  // Chaque nouvel extrait repart à volume plein sauf s'il est précisément le
  // son que Loki est en train de duck-er pour une phrase vocale.
  if (speechDuckNativeSound !== sound) {
    try { await withAudioTimeout(sound.setVolumeAsync(1), 'AUDIO_VOLUME_RESET', 900); } catch {}
  }
  if (!status.isPlaying) {
    try { await withAudioTimeout(sound.playAsync(), 'AUDIO_PLAY', 1800); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 90));
    status = await withAudioTimeout(sound.getStatusAsync(), 'AUDIO_STATUS_CONFIRM');
  }
  if (!status.isLoaded || !status.isPlaying) throw new Error('AUDIO_PREVIEW_NOT_PLAYING');
}

async function createSoundWithRetry(
  previewUrl: string,
  positionMillis: number,
  onStatus: (status: AVPlaybackStatus, sound: NativeSound) => void,
  autoPlay = true,
): Promise<NativeSound> {
  const { Audio } = getNativeExpoAV();
  let lastError: unknown = null;
  // Réseau mobile / TestFlight : une première ouverture AV peut échouer pendant
  // la bascule de session audio. Un second essai court suffit généralement et
  // évite le symptôme « j'appuie mais je n'entends rien » sans multiplier les
  // requêtes ni masquer une vraie URL expirée.
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let createdSound: NativeSound | null = null;
    try {
      await configurePreviewAudio();
      const created = await withAudioTimeout(Audio.Sound.createAsync(
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
      ), 'AUDIO_CREATE', autoPlay ? AUDIO_CREATE_TIMEOUT_MS : 2200);
      createdSound = created.sound;
      if (autoPlay) {
        await ensurePlaying(created.sound);
      } else {
        const status = await withAudioTimeout(created.sound.getStatusAsync(), 'AUDIO_PRELOAD_STATUS');
        if (!status.isLoaded) throw new Error('AUDIO_PREVIEW_NOT_LOADED');
      }
      return created.sound;
    } catch (error) {
      lastError = error;
      if (createdSound) {
        try { await withAudioTimeout(createdSound.stopAsync(), 'AUDIO_CREATE_STOP'); } catch {}
        try { await withAudioTimeout(createdSound.unloadAsync(), 'AUDIO_CREATE_UNLOAD'); } catch {}
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
  defaultToBattleOffset = true,
  syncStartEpochMs?: number,
): Promise<void> {
  const element = getWebAudio();
  if (!element) throw new Error('WEB_AUDIO_UNAVAILABLE');

  // Le même élément audio est partagé entre Swipe, Battle et voix Loki.
  // Réinitialiser explicitement son état évite un "play" silencieux après
  // un duck/mute laissé par une interaction précédente.
  try {
    element.muted = false;
    element.volume = 1;
    element.playbackRate = 1;
    element.defaultPlaybackRate = 1;
  } catch {}

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

  const basePosition = positionMillis > 0 ? positionMillis : defaultToBattleOffset ? 9000 : 0;
  const lateByMs = syncStartEpochMs ? Math.max(0, Date.now() - syncStartEpochMs) : 0;
  const effectivePosition = basePosition + lateByMs;
  const effectiveDuration = syncStartEpochMs
    ? Math.max(700, durationMillis - lateByMs)
    : durationMillis;
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

  // BUG MINEUR trouvé en audit runtime (Adel, 22/09/2026) : cette fonction ne
  // se fiait qu'à une minuterie artificielle (durationMillis) pour signaler
  // "extrait terminé" -- si le fichier réel est plus court (fin naturelle
  // avant ce délai), l'élément <audio> s'arrête tout seul mais l'app continue
  // d'afficher "en lecture" jusqu'à l'expiration du minuteur. On écoute
  // maintenant aussi l'évènement natif `ended`, et on ne déclenche le
  // nettoyage qu'une seule fois, quel que soit celui des deux qui arrive en
  // premier.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
    element.removeEventListener('ended', finish);
    if (webAudioKey !== key || webAudio !== element) return;
    try { element.pause(); } catch {}
    webAudioListener?.(false);
    webAudioListener = null;
    webAudioKey = null;
    onEnded?.();
  };
  element.addEventListener('ended', finish);
  activeTimer = setTimeout(finish, Math.max(700, Math.round(effectiveDuration)));
}

/**
 * Joue un extrait promotionnel fourni par le catalogue. Loki ne télécharge et
 * ne stocke jamais le fichier audio. Un seul extrait peut jouer à la fois :
 * lancer un autre morceau coupe automatiquement le précédent.
 */
export function playTrackPreviewFromGesture(
  key: string,
  previewUrl: string,
  onStateChange: (playing: boolean) => void,
  onEnded?: () => void,
  durationMillis = 30000,
): Promise<void> {
  if (!canUseWebAudio()) {
    return toggleTrackPreview(key, previewUrl, onStateChange, onEnded);
  }

  const element = getWebAudio();
  if (!element) return Promise.reject(new Error('WEB_AUDIO_UNAVAILABLE'));

  // Geste manuel = priorité absolue au son audible. Le lecteur partagé peut
  // avoir été ducké/muté par une voix ou un ancien aperçu.
  try {
    element.muted = false;
    element.volume = 1;
    element.playbackRate = 1;
    element.defaultPlaybackRate = 1;
  } catch {}

  clearActiveTimer();
  try { element.pause(); } catch {}
  webAudioKey = key;
  webAudioListener = onStateChange;

  if (element.src !== previewUrl) {
    element.src = previewUrl;
    try { element.load(); } catch {}
  }
  try { element.currentTime = 0; } catch {}

  // IMPORTANT Safari/iOS : play() est appelé SYNCHRONIQUEMENT dans le vrai
  // onPress. On ne fait aucun await avant cet appel, sinon le navigateur peut
  // perdre l'activation utilisateur et produire un silence sans erreur visible.
  let playPromise: Promise<void> | void;
  try {
    playPromise = element.play();
  } catch (error) {
    webAudioKey = null;
    webAudioListener = null;
    return Promise.reject(error);
  }

  const started = Promise.resolve(playPromise).then(() => {
    if (webAudioKey !== key) return;
    onStateChange(true);
    const finish = () => {
      if (webAudioKey !== key) return;
      clearActiveTimer();
      try { element.pause(); } catch {}
      webAudioKey = null;
      webAudioListener = null;
      onStateChange(false);
      onEnded?.();
    };
    element.addEventListener('ended', finish, { once: true });
    activeTimer = setTimeout(finish, Math.max(700, Math.round(durationMillis)));
  }).catch((error) => {
    if (webAudioKey === key) {
      webAudioKey = null;
      webAudioListener = null;
    }
    throw error;
  });

  return started;
}

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
      // Écoute normale profil/Swipe : démarrer au début du preview.
      // Le décalage 9 s est réservé aux segments Battle protégés.
      await playWebSegment(key, previewUrl, 0, 30000, onStateChange, onEnded, false);
      return;
    }

    if (activeKey === key && activeSound) {
      await unloadActive();
      return;
    }

    const onStatus = (status: AVPlaybackStatus, sound: NativeSound) => {
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
    };

    let createdSound: NativeSound;
    if (profilePreloadedSound && profilePreloadedUrl === previewUrl) {
      const ready = profilePreloadedSound;
      profilePreloadedSound = null;
      profilePreloadedUrl = null;
      await unloadActive();
      await configurePreviewAudio();
      ready.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => onStatus(status, ready));
      try { await ready.setPositionAsync(0); } catch {}
      await ensurePlaying(ready);
      createdSound = ready;
    } else {
      await unloadActive();
      await configurePreviewAudio();
      createdSound = await createSoundWithRetry(previewUrl, 0, onStatus);
    }

    activeSound = createdSound;
    activeKey = key;
    activeStateListener = onStateChange;
    onStateChange(true);
  });
}

/**
 * Précharge le prochain extrait d'une écoute profil/Swipe sans le jouer.
 *
 * Web : un second HTMLAudioElement ne joue jamais ; il remplit uniquement le
 * cache média du navigateur pendant que l'élément partagé continue le titre N.
 * Natif : un NativeSound distinct est chargé avec shouldPlay:false puis
 * consommé par toggleTrackPreview lorsque N+1 démarre.
 */
export async function preloadTrackPreview(previewUrl: string): Promise<void> {
  if (!previewUrl) return;

  if (canUseWebAudio()) {
    try {
      if (webProfilePreload && webProfilePreloadUrl === previewUrl) return;
      const HtmlAudio = (globalThis as any).Audio;
      const element = new HtmlAudio();
      element.preload = 'auto';
      element.playsInline = true;
      element.src = previewUrl;
      try { element.load(); } catch {}
      webProfilePreload = element;
      webProfilePreloadUrl = previewUrl;
    } catch {}
    return;
  }

  return serialize(async () => {
    if (profilePreloadedSound && profilePreloadedUrl === previewUrl) return;
    await discardProfilePreloaded();
    try {
      const sound = await createSoundWithRetry(previewUrl, 0, () => {}, false);
      profilePreloadedSound = sound;
      profilePreloadedUrl = previewUrl;
    } catch {
      await discardProfilePreloaded();
    }
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
  startFromBeginning = false,
): Promise<void> {
  return serialize(async () => {
    if (canUseWebAudio()) {
      await playWebSegment(key, previewUrl, positionMillis, durationMillis, onStateChange, onEnded, !startFromBeginning);
      return;
    }

    const effectivePosition = startFromBeginning ? Math.max(0, positionMillis) : (positionMillis > 0 ? positionMillis : 9000);
    const onStatus = (status: AVPlaybackStatus, sound: NativeSound) => {
      if (!status.isLoaded) return;
      if (activeSound === sound) activeStateListener?.(status.isPlaying);
      if (!status.didJustFinish) return;
      if (activeSound === sound) {
        void serialize(async () => {
          if (activeSound !== sound) return;
          await unloadActive();
        });
      }
    };

    // Adel (22/09/2026) : "audit latence TestFlight" -- rien ne préchargeait
    // jamais l'extrait de la manche N+1 pendant que la manche N jouait, donc
    // chaque manche payait la latence réseau+décodage complète. Si
    // preloadTrackPreviewSegment a déjà préparé CETTE clé (déclenché pendant
    // la pause de 2,8s après une réponse, voir KeepBattleMobileGameV3), on
    // consomme ce son directement -- latence quasi nulle. Sinon, repli
    // inchangé sur le chargement normal.
    let createdSound: NativeSound | null = null;
    if (preloadedKey === key && preloadedSound) {
      const preloaded = preloadedSound;
      preloadedSound = null;
      preloadedKey = null;
      await unloadActive();
      await configurePreviewAudio();
      try {
        preloaded.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => onStatus(status, preloaded));
        await ensurePlaying(preloaded);
        createdSound = preloaded;
      } catch {
        try { await preloaded.stopAsync(); } catch {}
        try { await preloaded.unloadAsync(); } catch {}
        createdSound = null;
      }
    }

    if (!createdSound) {
      await unloadActive();
      await configurePreviewAudio();
      createdSound = await createSoundWithRetry(previewUrl, effectivePosition, onStatus);
    }

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

/**
 * Précharge en arrière-plan l'extrait d'une manche pas encore commencée,
 * sans le jouer (shouldPlay:false). N'affecte jamais activeSound : le son en
 * cours continue de jouer normalement pendant ce chargement. Best-effort --
 * un échec ne bloque rien, playTrackPreviewSegment retombera simplement sur
 * son chargement normal quand cette clé sera jouée pour de vrai.
 */
export async function preloadTrackPreviewSegment(
  key: string,
  previewUrl: string,
  positionMillis: number,
): Promise<void> {
  if (!previewUrl || canUseWebAudio()) return;
  return serialize(async () => {
    if (preloadedKey === key && preloadedSound) return;
    // iOS/Expo AV partage une seule session audio globale. Précharger un
    // deuxième NativeSound pendant qu'une manche joue peut reconfigurer cette
    // session et couper brièvement le morceau actif. Priorité absolue au son
    // entendu par le joueur : si une preview est encore en lecture, on saute
    // simplement ce préchargement et la manche suivante utilisera le chemin
    // normal + retry.
    if (activeSound) {
      try {
        const status = await activeSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) return;
      } catch {}
    }
    await discardPreloaded();
    const effectivePosition = positionMillis > 0 ? positionMillis : 9000;
    try {
      await configurePreviewAudio();
      const sound = await createSoundWithRetry(previewUrl, effectivePosition, () => {}, false);
      preloadedSound = sound;
      preloadedKey = key;
    } catch {
      await discardPreloaded();
    }
  });
}

/** Abandonne un préchargement en attente (ex. le joueur quitte le Battle avant que la manche préchargée ne démarre). */
export function discardPreloadedTrackPreview(key?: string): void {
  if (key && preloadedKey !== key) return;
  void serialize(async () => { await discardPreloaded(); });
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
          await playWebSegment(
            key,
            previewUrl,
            positionMillis,
            durationMillis,
            onStateChange,
            undefined,
            true,
            startAtEpochMs,
          );
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
      void (async () => {
        try {
          const lateByMs = Math.min(
            Math.max(0, Date.now() - startAtEpochMs),
            Math.max(0, durationMillis - 700),
          );
          const syncedPosition = effectivePosition + lateByMs;
          const remainingDuration = Math.max(700, durationMillis - lateByMs);
          if (lateByMs > 0) {
            try { await createdSound.setPositionAsync(syncedPosition); } catch {}
          }
          await createdSound.playAsync();
          if (activeSound !== createdSound) return;
          onStateChange?.(true);
          activeTimer = setTimeout(() => {
            if (activeSound !== createdSound) return;
            void serialize(async () => { await unloadActive(); });
          }, Math.max(700, Math.round(remainingDuration)));
        } catch {
          if (activeSound === createdSound) void serialize(async () => { await unloadActive(); });
        }
      })();
    }, delay);
  });
}

export async function stopTrackPreview(key?: string): Promise<void> {
  // La coupure doit être perceptible dès le geste de swipe. Si une lecture est
  // encore en train d'attendre `canplay`, attendre son tour dans `serialize`
  // peut laisser l'ancien extrait repartir brièvement sur la carte suivante.
  // On invalide donc la lecture web et on la met en pause immédiatement ; la
  // file sérialisée conserve ensuite la responsabilité du nettoyage complet.
  const matchesCurrent = !key || activeKey === key || webAudioKey === key;
  if (!matchesCurrent) return;
  clearActiveTimer();
  if (!key || webAudioKey === key) {
    const listener = webAudioListener;
    webAudioListener = null;
    webAudioKey = null;
    try { webAudio?.pause(); } catch {}
    listener?.(false);
  }
  if ((!key || activeKey === key) && activeSound) {
    void activeSound.stopAsync().catch(() => {});
  }
  return serialize(async () => {
    await unloadActive();
  });
}

// Aperçu masqué des collections : l'identité reste protégée par la RPC/UI,
// mais l'écoute doit rester agréable et fiable. L'ancien traitement ajoutait
// simultanément offset aléatoire, pitch-shift et voix off sur seulement 5-8 s ;
// sur mobile cela multipliait les seeks/rates/décodeurs et pouvait donner
// l'impression que Play bloquait. On garde une fenêtre courte et propre.
const SECRET_PREVIEW_DURATION_MS = 15000;

/**
 * Joue un extrait propre de 15 s. Aucun titre/artiste/visuel n'est exposé :
 * le masquage reste assuré côté serveur et UI, sans dégrader le flux audio.
 */
export async function playAntiShazamPreviewSegment(
  key: string,
  previewUrl: string,
  onStateChange?: (playing: boolean) => void,
  onEnded?: () => void,
): Promise<number> {
  const durationMs = SECRET_PREVIEW_DURATION_MS;
  return serialize(async () => {

    if (canUseWebAudio()) {
      // Démarrage à zéro : beaucoup de previews AAC iTunes sont courtes et
      // un seek 20-50 s pouvait tomber hors de la zone décodable sur iOS.
      await playWebSegment(key, previewUrl, 0, durationMs, onStateChange, onEnded, false);
      return durationMs;
    }

    await unloadActive();
    await configurePreviewAudio();
    const createdSound = await createSoundWithRetry(previewUrl, 0, () => {}, false);
    createdSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (activeSound === createdSound) activeStateListener?.(status.isPlaying);
    });
    activeSound = createdSound;
    activeKey = key;
    activeStateListener = onStateChange ?? null;
    await ensurePlaying(createdSound);
    onStateChange?.(true);
    activeTimer = setTimeout(() => {
      if (activeSound !== createdSound) return;
      void serialize(async () => { await unloadActive(); });
      onEnded?.();
    }, durationMs);
    return durationMs;
  });
}

/** Coupe l'extrait anti-Shazam en cours ET la voix off associée (voir playAntiShazamPreviewSegment). */
export async function stopAntiShazamPreview(key?: string): Promise<void> {
  if (canUseWebAudio()) {
    try {
      const element = getWebAudio();
      if (element) {
        element.playbackRate = 1;
        (element as any).preservesPitch = true;
        (element as any).mozPreservesPitch = true;
        (element as any).webkitPreservesPitch = true;
      }
    } catch {}
  }
  await stopTrackPreview(key);
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
    try {
      element.muted = false;
      element.volume = 1;
      element.playbackRate = 1;
      element.defaultPlaybackRate = 1;
    } catch {}
    // Un élément <audio> neuf n'a aucune source : `play()` rejetait donc la
    // promesse et ne déverrouillait rien. Une très courte piste silencieuse
    // permet d'acquérir l'autorisation pendant le tap qui ouvre Loki Swipe ;
    // le même élément est ensuite réutilisé pour les extraits réels.
    if (!element.src) {
      element.src = SILENT_UNLOCK_SOURCE;
      try { element.load(); } catch {}
    }
    const unlockSource = element.src;
    const playPromise = element.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        // Ne jamais mettre en pause un vrai extrait qui aurait remplacé la
        // piste silencieuse pendant la résolution de cette promesse.
        if (!webAudioKey && element.src === unlockSource) {
          try { element.pause(); } catch {}
        }
      }).catch(() => {});
    } else {
      try { element.pause(); } catch {}
    }
  } catch {}
}
