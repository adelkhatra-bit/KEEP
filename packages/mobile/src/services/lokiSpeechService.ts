import { Platform } from 'react-native';
import { duckActivePreviewForSpeech, restoreActivePreviewAfterSpeech } from './audioPreviewService';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

type SpeechModule = typeof import('expo-speech');
let nativeSpeechModule: SpeechModule | null = null;

function getNativeSpeech(): SpeechModule {
  if (!nativeSpeechModule) nativeSpeechModule = require('expo-speech') as SpeechModule;
  return nativeSpeechModule;
}

let nativeSpeechSerial = 0;

export async function stopLokiSpeech(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    return;
  }
  try {
    nativeSpeechSerial += 1;
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
        synth.resume?.();
        const utterance = new Utterance(clean);
        utterance.lang = options.language || 'fr-FR';
        utterance.rate = options.rate ?? 0.95;
        utterance.pitch = options.pitch ?? 1;
        utterance.volume = 1;
        synth.speak(utterance);
        return;
      }
    } catch {
      // Browser speech can be blocked until the first user gesture.
    }
    return;
  }

  // Natif : utiliser un vrai moteur TTS. L'ancien fallback
  // AccessibilityInfo.announceForAccessibility ne produit pas forcément une
  // voix audible et dépend de VoiceOver/TalkBack, d'où le robot silencieux sur
  // TestFlight alors qu'il parlait correctement sur ordinateur.
  const Speech = getNativeSpeech();
  const serial = ++nativeSpeechSerial;
  const duckToken = await duckActivePreviewForSpeech(0.12).catch(() => 0);

  await Speech.stop().catch(() => {});
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      void restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
      resolve();
    };
    const watchdog = setTimeout(finish, 12_000);
    try {
      Speech.speak(clean, {
        language: options.language || 'fr-FR',
        rate: options.rate ?? 0.95,
        pitch: options.pitch ?? 1,
        volume: 1,
        // iOS : une session système séparée évite de voler/casser la session
        // expo-av Battle et laisse iOS gérer correctement le mélange/ducking.
        useApplicationAudioSession: Platform.OS === 'ios' ? false : undefined,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    } catch {
      finish();
    }
  });

  // Si une autre phrase a été demandée entre-temps, sa propre restauration
  // audio reste prioritaire ; restoreActivePreviewAfterSpeech protège déjà par
  // token, ce test évite seulement un travail inutile.
  if (serial !== nativeSpeechSerial) return;
}
