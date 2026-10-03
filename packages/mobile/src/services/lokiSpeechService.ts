import { Platform } from 'react-native';
import { duckActivePreviewForSpeech, restoreActivePreviewAfterSpeech } from './audioPreviewService';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let nativeSpeechModule: typeof import('expo-speech') | null = null;
function getNativeSpeech() {
  if (!nativeSpeechModule) nativeSpeechModule = require('expo-speech') as typeof import('expo-speech');
  return nativeSpeechModule;
}

export async function stopLokiSpeech(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    return;
  }
  try {
    await getNativeSpeech().stop();
  } catch {}
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  // Le robot doit rester audible pendant une preview : la musique descend
  // temporairement, puis retrouve exactement son volume initial quand Loki
  // termine ou est interrompu.
  const duckToken = await duckActivePreviewForSpeech(0.16).catch(() => 0);
  const restore = async () => {
    if (duckToken) await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
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
          const done = () => resolve();
          utterance.onend = done;
          utterance.onerror = done;
          synth.speak(utterance);
        });
        await restore();
        return;
      }
    } catch {
      // Repli silencieux ci-dessous.
    }
    await restore();
    return;
  }

  try {
    const Speech = getNativeSpeech();
    await Speech.stop().catch(() => {});
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
      } catch {
        finish();
      }
      // Filet de sécurité : une callback TTS iOS ne doit jamais laisser la
      // preview duckée indéfiniment.
      setTimeout(finish, Math.max(5000, Math.min(18000, clean.length * 95)));
    });
  } finally {
    await restore();
  }
}
