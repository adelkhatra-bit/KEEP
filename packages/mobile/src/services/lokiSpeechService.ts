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

async function restoreDuck(token: number | null) {
  if (token == null) return;
  await restoreActivePreviewAfterSpeech(token).catch(() => {});
  if (activeDuckToken === token) activeDuckToken = null;
}

export async function stopLokiSpeech(): Promise<void> {
  speechSerial += 1;
  const duckToken = activeDuckToken;
  activeDuckToken = null;

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

  await restoreDuck(duckToken);
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  const serial = ++speechSerial;
  const previousDuck = activeDuckToken;
  activeDuckToken = null;
  await restoreDuck(previousDuck);

  // La voix doit rester intelligible pendant un extrait Battle : baisse
  // temporairement la preview, puis restaure exactement son volume précédent.
  const duckToken = await duckActivePreviewForSpeech(0.16).catch(() => null);
  activeDuckToken = duckToken;

  const finish = async () => {
    if (serial !== speechSerial) return;
    await restoreDuck(duckToken);
  };

  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      const Utterance = (globalThis as any)?.SpeechSynthesisUtterance;
      if (synth && Utterance) {
        synth.cancel?.();
        synth.resume?.();
        await new Promise<void>((resolve) => {
          const utterance = new Utterance(clean);
          utterance.lang = options.language || 'fr-FR';
          utterance.rate = options.rate ?? 0.95;
          utterance.pitch = options.pitch ?? 1;
          utterance.volume = 1;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          synth.speak(utterance);
        });
        await finish();
        return;
      }
    } catch {}
    await finish();
    return;
  }

  // TestFlight/iOS/Android : vraie synthèse vocale native. L'ancien fallback
  // AccessibilityInfo n'était pas une voix TTS et pouvait rester totalement
  // silencieux lorsque VoiceOver était désactivé.
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      Speech.speak(clean, {
        language: options.language || 'fr-FR',
        rate: options.rate ?? 0.95,
        pitch: options.pitch ?? 1,
        volume: 1,
        onDone: done,
        onStopped: done,
        onError: done,
      });
    } catch {
      done();
    }
    // Filet de sécurité : ne jamais laisser la musique duckée si iOS ne
    // renvoie pas de callback de fin.
    setTimeout(done, Math.min(12000, Math.max(1800, clean.length * 85)));
  });

  await finish();
}
