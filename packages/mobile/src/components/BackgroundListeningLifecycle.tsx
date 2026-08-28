import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { useSessionStore } from '../store/useSessionStore';
import { cancelAudioCapture } from '../services/micCapture';
import { ensureBackgroundListeningService, stopBackgroundListeningService } from '../services/backgroundListeningService';

const WEB_BACKGROUND_MESSAGE = 'KEEP Web est en pause pendant que Safari est en arrière-plan. L’écoute reprend automatiquement à ton retour. Pour TikTok / Instagram / Snapchat, utilise aussi Partager → KEEP ou le build natif KEEP.';

function notifyWebBackgroundPause() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('KEEP — écoute Web en pause', {
      body: 'Safari suspend le microphone en arrière-plan. KEEP reprendra à ton retour ; Partager → KEEP reste disponible.',
      tag: 'keep-web-listening-paused',
      silent: true,
    });
  } catch {
    // Les notifications Web ne sont pas disponibles dans tous les contextes iOS.
  }
}

/**
 * Cycle global de l'écoute KEEP.
 *
 * Android : démarre le foreground service microphone pendant que KEEP est
 * encore visible, conformément aux restrictions Android 14+.
 *
 * Web/Safari : un onglet Web ne peut pas garantir le microphone une fois mis
 * en arrière-plan. On ne simule donc jamais une écoute fictive : la capture en
 * cours est libérée proprement, la session KEEP reste active, puis la boucle
 * reprend automatiquement quand la page redevient visible. Si l'utilisateur a
 * déjà autorisé les notifications Web, un rappel explicite est affiché.
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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !isActive) return;

    const onVisibilityChange = () => {
      if (!useSessionStore.getState().isActive) return;
      if (document.visibilityState === 'hidden') {
        notifyWebBackgroundPause();
        void cancelAudioCapture().finally(() => {
          if (!useSessionStore.getState().isActive) return;
          useSessionStore.setState({
            recognizing: false,
            micLevel: 0,
            error: WEB_BACKGROUND_MESSAGE,
          });
        });
        return;
      }

      const current = useSessionStore.getState();
      if (current.error === WEB_BACKGROUND_MESSAGE) {
        useSessionStore.setState({ recognizing: false, micLevel: 0, error: null });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isActive]);

  useEffect(() => () => { void stopBackgroundListeningService(); }, []);
  return null;
}
