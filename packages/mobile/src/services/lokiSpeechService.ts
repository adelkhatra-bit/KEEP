import { AccessibilityInfo, Platform } from 'react-native';

type LokiSpeechOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
};

export async function stopLokiSpeech(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      const synth = (globalThis as any)?.speechSynthesis;
      synth?.cancel?.();
    } catch {}
    return;
  }
  try {
    const Speech = require('expo-speech') as typeof import('expo-speech');
    await Speech.stop();
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
  } else {
    // TestFlight/iOS + Android : utiliser une vraie synthèse vocale native.
    // L'ancienne implémentation se contentait d'announceForAccessibility(),
    // qui n'est pas une voix off fiable et rendait la promesse immédiatement :
    // le volume musical était donc restauré avant même qu'une phrase puisse
    // être prononcée. La promesse ci-dessous ne se résout qu'à la fin réelle
    // de la phrase (ou si le moteur TTS échoue).
    try {
      // Chargement paresseux : le TestFlight actuellement installé a été
      // compilé avant l'ajout du module natif expo-speech. Une OTA 1.0.0 doit
      // donc rester compatible avec cet ancien binaire au lieu de planter au
      // chargement du fichier. La prochaine build native embarque le module.
      const Speech = require('expo-speech') as typeof import('expo-speech');
      await Speech.stop().catch(() => {});
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
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
            // Sur iOS, laisser le système créer sa session TTS réduit les
            // conflits avec expo-av et améliore le ducking/mixage.
            useApplicationAudioSession: Platform.OS === 'ios' ? false : undefined,
            onDone: done,
            onStopped: done,
            onError: done,
          });
          // Garde-fou : ne jamais garder la musique baissée indéfiniment si
          // le moteur natif ne renvoie aucun callback.
          setTimeout(done, Math.max(3500, Math.min(12000, clean.length * 105)));
        } catch {
          done();
        }
      });
      return;
    } catch {
      // Fallback accessibility below.
    }
  }

  try {
    AccessibilityInfo.announceForAccessibility?.(clean);
  } catch {
    // Voice is optional and must never block Loki Music.
  }
}
