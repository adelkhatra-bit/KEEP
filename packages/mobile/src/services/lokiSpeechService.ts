import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { isNativeRecordingModeActive } from './micCapture';
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

let activeSpeechSerial = 0;

async function prepareNativeSpeechAudio(): Promise<void> {
  if (Platform.OS === 'web') return;
  // iOS/TestFlight: AVSpeechSynthesizer can inherit an audio session that was
  // previously configured by the microphone. Force a speaker-friendly mode
  // before Loki speaks, while preserving recording if a real capture is
  // currently active elsewhere in the app.
  const recordingActive = isNativeRecordingModeActive();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: recordingActive,
    playsInSilentModeIOS: true,
    staysActiveInBackground: recordingActive,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export async function stopLokiSpeech(): Promise<void> {
  activeSpeechSerial += 1;
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
    // Voice is optional and must never block Loki Music.
  }
}

export async function speakLokiText(text: string, options: LokiSpeechOptions = {}): Promise<void> {
  const clean = String(text || '').trim();
  if (!clean) return;

  const serial = ++activeSpeechSerial;
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
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        synth.speak(utterance);
        setTimeout(finish, Math.max(4500, clean.length * 95));
      });
      return;
    }

    const Speech = getNativeSpeech();
    await prepareNativeSpeechAudio().catch(() => {});
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
          volume: 1,
          useApplicationAudioSession: true,
          onStart: () => {},
          onDone: finish,
          onStopped: finish,
          onError: finish,
        });
      } catch {
        finish();
      }
      // Filet de sécurité : une voix système iOS interrompue peut parfois ne
      // pas rappeler onDone/onStopped. Ne jamais laisser le volume ducké.
      setTimeout(finish, Math.max(5000, clean.length * 110));
    });
  } finally {
    if (serial === activeSpeechSerial && duckToken) {
      await restoreActivePreviewAfterSpeech(duckToken).catch(() => {});
    }
  }
}
