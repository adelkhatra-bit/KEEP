import { AccessibilityInfo, Platform } from 'react-native';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let nativeSpeechModule: typeof import('expo-speech') | null = null;
let activeWebSpeechToken = 0;

function getNativeSpeech() {
  if (!nativeSpeechModule) nativeSpeechModule = require('expo-speech') as typeof import('expo-speech');
  return nativeSpeechModule;
}

export async function stopLokiSpeech(): Promise<void> {
  activeWebSpeechToken += 1;
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    return;
  }
  try {
    await getNativeSpeech().stop();
  } catch {
    // Optional voice capability.
  }
}

async function speakWeb(clean: string, options: LokiSpeechOptions): Promise<boolean> {
  try {
    const synth = (globalThis as any)?.speechSynthesis;
    const Utterance = (globalThis as any)?.SpeechSynthesisUtterance;
    if (!synth || !Utterance) return false;

    const token = ++activeWebSpeechToken;
    synth.cancel?.();
    synth.resume?.();

    // Chromium/Safari peuvent exposer les voix quelques centaines de ms après
    // le premier accès. Attendre ce court délai rend l'annonce déterministe.
    if (typeof synth.getVoices === 'function' && !synth.getVoices().length) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          try { synth.removeEventListener?.('voiceschanged', finish); } catch {}
          resolve();
        };
        try { synth.addEventListener?.('voiceschanged', finish, { once: true }); } catch {}
        setTimeout(finish, 450);
      });
    }
    if (token !== activeWebSpeechToken) return true;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const utterance = new Utterance(clean);
      utterance.lang = options.language || 'fr-FR';
      utterance.rate = options.rate ?? 0.95;
      utterance.pitch = options.pitch ?? 1;
      utterance.volume = 1;
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
      setTimeout(finish, Math.min(9000, Math.max(1800, clean.length * 95)));
    });
    return true;
  } catch {
    return false;
  }
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  if (Platform.OS === 'web') {
    if (await speakWeb(clean, options)) return;
  } else {
    try {
      const Speech = getNativeSpeech();
      await Speech.stop().catch(() => {});
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
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
        setTimeout(finish, Math.min(9000, Math.max(1800, clean.length * 95)));
      });
      return;
    } catch {
      // Accessibility fallback below.
    }
  }

  try {
    AccessibilityInfo.announceForAccessibility?.(clean);
  } catch {
    // Voice is optional and must never block Loki Music.
  }
}
