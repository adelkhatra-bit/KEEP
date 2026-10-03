import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { duckActivePreviewForSpeech, restoreActivePreviewAfterSpeech } from './audioPreviewService';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let activeSpeechToken = 0;

export async function stopLokiSpeech(): Promise<void> {
  activeSpeechToken += 1;
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    return;
  }
  try {
    await Speech.stop();
  } catch {}
}

async function speakNative(clean: string, options: LokiSpeechOptions): Promise<void> {
  const callToken = ++activeSpeechToken;
  const duckToken = await duckActivePreviewForSpeech(0.18).catch(() => 0);
  try {
    await Speech.stop().catch(() => {});
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timeout = setTimeout(finish, 12000);
      const done = () => {
        clearTimeout(timeout);
        finish();
      };
      try {
        Speech.speak(clean, {
          language: options.language || 'fr-FR',
          rate: options.rate ?? 0.94,
          pitch: options.pitch ?? 1,
          volume: 1,
          // iOS/TestFlight: TTS must not fight the expo-av Battle preview
          // for the same application audio session. The preview is already
          // ducked above; use the system speech session, then restore it.
          ...(Platform.OS === 'ios' ? { useApplicationAudioSession: false } : {}),
          onDone: done,
          onStopped: done,
          onError: done,
        });
      } catch {
        done();
      }
    });
  } finally {
    // Si une autre phrase Loki a commencé entre-temps, elle possède son
    // propre ducking et sa propre restauration.
    if (callToken === activeSpeechToken && duckToken) {
      await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
    }
  }
}

async function speakWeb(clean: string, options: LokiSpeechOptions): Promise<void> {
  const callToken = ++activeSpeechToken;
  const duckToken = await duckActivePreviewForSpeech(0.18).catch(() => 0);
  try {
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
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  } finally {
    if (callToken === activeSpeechToken && duckToken) {
      await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
    }
  }
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;
  if (Platform.OS === 'web') {
    await speakWeb(clean, options).catch(() => {});
    return;
  }
  await speakNative(clean, options).catch(() => {});
}
