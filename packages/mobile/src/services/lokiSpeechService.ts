import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { duckActivePreviewForSpeech, restoreActivePreviewAfterSpeech } from './audioPreviewService';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let speechSerial = 0;
let activeDuckToken: number | null = null;

export async function stopLokiSpeech(): Promise<void> {
  speechSerial += 1;
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
  } else {
    try {
      await Speech.stop();
    } catch {}
  }

  const duck = activeDuckToken;
  activeDuckToken = null;
  if (duck !== null) {
    await restoreActivePreviewAfterSpeech(duck).catch(() => {});
  }
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  const mySerial = ++speechSerial;
  await stopLokiSpeech().catch(() => {});
  // stopLokiSpeech increments the serial, so claim a fresh generation after
  // cleaning up an older utterance.
  const generation = ++speechSerial;

  const duckToken = await duckActivePreviewForSpeech(0.12).catch(() => null);
  if (generation !== speechSerial) {
    if (duckToken !== null) await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
    return;
  }
  activeDuckToken = duckToken;

  const restore = async () => {
    if (generation !== speechSerial) return;
    const token = activeDuckToken;
    activeDuckToken = null;
    if (token !== null) await restoreActivePreviewAfterSpeech(token).catch(() => {});
  };

  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      const Utterance = (globalThis as any)?.SpeechSynthesisUtterance;
      if (synth && Utterance) {
        synth.cancel?.();
        synth.resume?.();
        const utterance = new Utterance(clean);
        utterance.lang = options.language || 'fr-FR';
        utterance.rate = options.rate ?? 0.95;
        utterance.pitch = options.pitch ?? 1;
        utterance.volume = 1;
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          utterance.onend = done;
          utterance.onerror = done;
          synth.speak(utterance);
          setTimeout(done, Math.max(1800, Math.min(12000, clean.length * 85)));
        });
        await restore();
        return;
      }
    } catch {
      // Browser speech can be blocked until the first user gesture.
    }
    await restore();
    return;
  }

  // Native/TestFlight : AccessibilityInfo.announceForAccessibility n'est pas
  // une vraie voix off et ne parle que si VoiceOver est actif. expo-speech est
  // déjà embarqué dans le binaire Loki Music : on l'utilise réellement et on
  // attend la fin avant de restaurer le volume de la musique.
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      Speech.speak(clean, {
        language: options.language || 'fr-FR',
        rate: options.rate ?? 0.95,
        pitch: options.pitch ?? 1,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
      setTimeout(finish, Math.max(2200, Math.min(14000, clean.length * 95)));
    } catch {
      finish();
    }
  });
  await restore();

  // Silence TypeScript/lint on the generation captured before stop. This also
  // documents that every call owns an independent speech generation.
  void mySerial;
}
