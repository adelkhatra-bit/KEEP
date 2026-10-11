import { Audio } from 'expo-av';

export type LokiNotificationCue = 'MONEY' | 'DEFAULT' | 'SILENT';

let currentSound: Audio.Sound | null = null;

export async function playLokiNotificationCue(kind: LokiNotificationCue = 'DEFAULT'): Promise<void> {
  if (kind === 'SILENT') return;
  try {
    if (currentSound) {
      await currentSound.stopAsync().catch(() => {});
      await currentSound.unloadAsync().catch(() => {});
      currentSound = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/keep_money.wav'),
      {
        shouldPlay: false,
        volume: kind === 'MONEY' ? 0.82 : 0.48,
      },
    );
    currentSound = sound;
    if (kind === 'DEFAULT') {
      await sound.setRateAsync(1.24, true).catch(() => {});
    }
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      const finished = sound;
      if (currentSound === finished) currentSound = null;
      void finished.unloadAsync().catch(() => {});
    });
    await sound.playAsync();
  } catch {
    // Best effort only: a notification must never block the app.
  }
}

export async function stopLokiNotificationCue(): Promise<void> {
  const sound = currentSound;
  currentSound = null;
  if (!sound) return;
  await sound.stopAsync().catch(() => {});
  await sound.unloadAsync().catch(() => {});
}
