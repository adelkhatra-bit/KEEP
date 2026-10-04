import { Platform } from 'react-native';
import { duckActivePreviewForSpeech, prepareAudioSessionForSpeech, restoreActivePreviewAfterSpeech } from './audioPreviewService';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

let activeDuckToken: number | null = null;
let nativeSpeechSerial = 0;

async function restoreDuck(): Promise<void> {
  const token = activeDuckToken;
  activeDuckToken = null;
  if (token !== null) await restoreActivePreviewAfterSpeech(token).catch(() => {});
}

export async function stopLokiSpeech(): Promise<void> {
  nativeSpeechSerial += 1;
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    await restoreDuck();
    return;
  }
  try {
    const Speech = require('expo-speech') as typeof import('expo-speech');
    await Speech.stop();
  } catch {}
  await restoreDuck();
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  await stopLokiSpeech().catch(() => {});
  const serial = ++nativeSpeechSerial;
  activeDuckToken = await duckActivePreviewForSpeech(0.16).catch(() => null);

  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      const Utterance = (globalThis as any)?.SpeechSynthesisUtterance;
      if (synth && Utterance) {
        const utterance = new Utterance(clean);
        utterance.lang = options.language || 'fr-FR';
        utterance.rate = options.rate ?? 0.95;
        utterance.pitch = options.pitch ?? 1;
        utterance.volume = 1;
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => { if (done) return; done = true; resolve(); };
          utterance.onend = finish;
          utterance.onerror = finish;
          synth.speak(utterance);
          setTimeout(finish, Math.max(3500, clean.length * 95));
        });
      }
    } finally {
      if (serial === nativeSpeechSerial) await restoreDuck();
    }
    return;
  }

  try {
    await prepareAudioSessionForSpeech().catch(() => {});
    const Speech = require('expo-speech') as typeof import('expo-speech');
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      try {
        Speech.speak(clean, {
          language: options.language || 'fr-FR',
          rate: options.rate ?? 0.94,
          pitch: options.pitch ?? 1,
          volume: 1,
          onDone: finish,
          onStopped: finish,
          onError: finish,
        });
        setTimeout(finish, Math.max(4500, clean.length * 110));
      } catch {
        finish();
      }
    });
  } finally {
    if (serial === nativeSpeechSerial) await restoreDuck();
  }
}
