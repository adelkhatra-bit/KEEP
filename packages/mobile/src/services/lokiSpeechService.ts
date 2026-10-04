import { Platform } from 'react-native';
import { duckActivePreviewForSpeech, restoreActivePreviewAfterSpeech } from './audioPreviewService';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let speechSerial = 0;

function nativeSpeechModule(): typeof import('expo-speech') | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-speech') as typeof import('expo-speech');
  } catch {
    return null;
  }
}

export async function stopLokiSpeech(): Promise<void> {
  speechSerial += 1;
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    return;
  }
  try {
    const Speech = nativeSpeechModule();
    await Speech?.stop?.();
  } catch {}
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  const mySerial = ++speechSerial;
  const duckToken = await duckActivePreviewForSpeech(0.16).catch(() => 0);

  try {
    if (Platform.OS === 'web') {
      const synth = (globalThis as any)?.speechSynthesis;
      const Utterance = (globalThis as any)?.SpeechSynthesisUtterance;
      if (!synth || !Utterance) return;

      synth.cancel?.();
      synth.resume?.();
      await new Promise<void>((resolve) => {
        const utterance = new Utterance(clean);
        utterance.lang = options.language || 'fr-FR';
        utterance.rate = options.rate ?? 0.95;
        utterance.pitch = options.pitch ?? 1;
        utterance.volume = 1;
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
        synth.speak(utterance);
        setTimeout(done, Math.max(1800, Math.min(12000, clean.length * 95)));
      });
      return;
    }

    const Speech = nativeSpeechModule();
    if (!Speech) return;

    await Speech.stop().catch(() => {});
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
          onDone: done,
          onStopped: done,
          onError: done,
        });
      } catch {
        done();
      }
      // Filet de sécurité : une callback TTS iOS perdue ne doit jamais laisser
      // l'audio Battle ducké indéfiniment.
      setTimeout(done, Math.max(2200, Math.min(14000, clean.length * 105)));
    });
  } finally {
    if (mySerial === speechSerial && duckToken) {
      await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
    } else if (duckToken) {
      await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
    }
  }
}
