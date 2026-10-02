import { AccessibilityInfo, Platform } from 'react-native';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

export async function stopLokiSpeech(): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const synth = (globalThis as any)?.speechSynthesis;
    synth?.cancel?.();
  } catch {
    // Optional browser capability.
  }
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
      // Fall through to the native/accessibility fallback.
    }
  }

  try {
    AccessibilityInfo.announceForAccessibility?.(clean);
  } catch {
    // Voice is optional and must never block Loki Music.
  }

  // Keep visual speaking state coherent even when native TTS is unavailable in
  // the installed binary. A future native build can replace this service only.
  await new Promise((resolve) => setTimeout(resolve, Math.min(5000, Math.max(700, clean.length * 38))));
}
