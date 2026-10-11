import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export type NotificationCue = 'DEFAULT' | 'MONEY';

let nativeSound: Audio.Sound | null = null;
let webAudioContext: AudioContext | null = null;

function getWebAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!webAudioContext) webAudioContext = new Ctx();
  return webAudioContext;
}

export function primeNotificationAudio(): void {
  if (Platform.OS !== 'web') return;
  try {
    const ctx = getWebAudioContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  } catch {
    // Best effort only.
  }
}

async function playWebCue(kind: NotificationCue): Promise<void> {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  if (ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === 'MONEY' ? 0.18 : 0.11, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
  gain.connect(ctx.destination);

  const frequencies = kind === 'MONEY' ? [1318.51, 1760] : [880, 1174.66];
  frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now + index * 0.12);
    osc.connect(gain);
    osc.start(now + index * 0.12);
    osc.stop(now + 0.42 + index * 0.05);
  });
}

async function playNativeCue(kind: NotificationCue): Promise<void> {
  try {
    if (nativeSound) {
      await nativeSound.unloadAsync().catch(() => {});
      nativeSound = null;
    }
    const created = await Audio.Sound.createAsync(
      require('../../assets/keep_money.wav'),
      { shouldPlay: true, volume: kind === 'MONEY' ? 1 : 0.72 },
    );
    nativeSound = created.sound;
    created.sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      const finished = nativeSound;
      nativeSound = null;
      if (finished) void finished.unloadAsync().catch(() => {});
    });
  } catch {
    // Notifications must stay functional even if the device is muted or audio
    // focus is temporarily owned by another app.
  }
}

export async function playNotificationCue(kind: NotificationCue = 'DEFAULT'): Promise<void> {
  if (Platform.OS === 'web') {
    await playWebCue(kind).catch(() => {});
    return;
  }
  await playNativeCue(kind);
}
