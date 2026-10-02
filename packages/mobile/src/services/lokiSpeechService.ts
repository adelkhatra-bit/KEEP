import { AccessibilityInfo, Platform } from 'react-native';

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

  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      const Utterance = (globalThis as any)?.SpeechSynthesisUtterance;
      if (synth && Utterance) {
        synth.cancel?.();
        await new Promise<void>((resolve) => {
          const utterance = new Utterance(clean);
          utterance.lang = options.language || 'fr-FR';
          utterance.rate = options.rate ?? 0.95;
          utterance.pitch = options.pitch ?? 1;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          synth.speak(utterance);
        });
        return;
      }
    } catch {
      // Browser TTS can be blocked before the first user gesture.
    }
  } else {
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
        Speech.speak(clean, {
          language: options.language || 'fr-FR',
          rate: options.rate ?? 0.95,
          pitch: options.pitch ?? 1,
          volume: 1,
          onDone: finish,
          onStopped: finish,
          onError: finish,
        });
        setTimeout(finish, Math.min(7000, Math.max(1200, clean.length * 90)));
      });
      return;
    } catch {
      // Fall through to accessibility announcement.
    }
  }

  try {
    AccessibilityInfo.announceForAccessibility?.(clean);
  } catch {}
}
