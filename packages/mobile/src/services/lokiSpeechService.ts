import { AccessibilityInfo, Platform } from 'react-native';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let nativeSpeechModule: typeof import('expo-speech') | null = null;

function nativeSpeech(): typeof import('expo-speech') {
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
    await nativeSpeech().stop();
  } catch {
    // La voix reste optionnelle : un problème TTS ne doit jamais bloquer Loki.
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
        synth.resume?.();
        const utterance = new Utterance(clean);
        utterance.lang = options.language || 'fr-FR';
        utterance.rate = options.rate ?? 0.95;
        utterance.pitch = options.pitch ?? 1;
        utterance.volume = 1;
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          utterance.onend = finish;
          utterance.onerror = finish;
          synth.speak(utterance);
          setTimeout(finish, Math.max(2500, clean.length * 95));
        });
        return;
      }
    } catch {
      // Browser speech can be blocked until the first user gesture.
    }
  } else {
    try {
      // BUG mobile confirmé le 03/10/2026 : l'ancien code n'utilisait jamais
      // expo-speech sur iOS/Android. Il appelait seulement
      // announceForAccessibility(), donc aucune vraie voix off Loki n'était
      // garantie sur TestFlight. expo-speech est déjà embarqué dans le projet.
      const Speech = nativeSpeech();
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
        // Filet de sécurité : ne jamais laisser le ducking audio bloqué si
        // l'OS ne renvoie pas de callback de fin.
        setTimeout(finish, Math.max(3500, clean.length * 115));
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
