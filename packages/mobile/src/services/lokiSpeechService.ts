import { AccessibilityInfo, Platform } from 'react-native';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

type SpeechModule = typeof import('expo-speech');
let nativeSpeech: SpeechModule | null = null;

function getNativeSpeech(): SpeechModule | null {
  if (Platform.OS === 'web') return null;
  if (!nativeSpeech) {
    try {
      nativeSpeech = require('expo-speech') as SpeechModule;
    } catch {
      nativeSpeech = null;
    }
  }
  return nativeSpeech;
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
    await getNativeSpeech()?.stop?.();
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
        return;
      }
    } catch {
      // Browser speech can be blocked until the first user gesture.
    }
  }

  const Speech = getNativeSpeech();
  if (Speech) {
    try {
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
          onDone: finish,
          onStopped: finish,
          onError: finish,
        });
        // Filet de sécurité : ne jamais garder la musique duckée si iOS
        // n'appelle pas le callback de synthèse pour une raison système.
        setTimeout(finish, Math.min(12000, Math.max(2200, clean.length * 85)));
      });
      return;
    } catch {
      // Fallback accessibilité ci-dessous.
    }
  }

  try {
    AccessibilityInfo.announceForAccessibility?.(clean);
  } catch {
    // Voice is optional and must never block Loki Music.
  }
}
