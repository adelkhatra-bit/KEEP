import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { useSessionStore } from '../store/useSessionStore';
import { ensureBackgroundListeningService, stopBackgroundListeningService } from '../services/backgroundListeningService';

/**
 * Cycle Android global de l'écoute KEEP.
 *
 * Le service microphone est démarré depuis une action utilisateur visible
 * (passage isActive=false -> true) conformément aux restrictions Android 14+.
 * Il est arrêté dès que la session s'arrête, quelle que soit la façon dont
 * l'utilisateur termine l'écoute. Aucun écran ni navigation n'a besoin de
 * connaître le service natif.
 */
export default function BackgroundListeningLifecycle() {
  const isActive = useSessionStore((state) => state.isActive);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;

    if (!isActive) {
      void stopBackgroundListeningService();
      return;
    }

    void (async () => {
      try {
        let permission = await Audio.getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          permission = await Audio.requestPermissionsAsync();
        }
        if (cancelled || !permission.granted || !useSessionStore.getState().isActive) return;
        await ensureBackgroundListeningService();
      } catch {
        // La capture expo-av affichera elle-même l'erreur de permission. Le
        // service natif est une garantie de continuité, jamais un second flux UI.
      }
    })();

    return () => { cancelled = true; };
  }, [isActive]);

  useEffect(() => () => { void stopBackgroundListeningService(); }, []);
  return null;
}
