import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';

/**
 * Mise à jour Loki Music sans UI visible :
 * - web : vérifie régulièrement version.json et recharge automatiquement
 *   avec cache-busting dès qu'un bundle plus récent est réellement publié ;
 * - iOS/Android production : récupère silencieusement l'OTA compatible au lancement.
 *
 * Aucun bouton "Actualiser Loki Music" ne doit encombrer la cloche ou le profil.
 */
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const webReloadingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 30_000);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void checkNow();
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkNow]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !latestSha || webReloadingRef.current) return;
    webReloadingRef.current = true;
    reloadToLatest();
  }, [latestSha]);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return undefined;
    let active = true;

    const applySilently = async () => {
      try {
        const Updates = await import('expo-updates');
        if (!active || !Updates.isEnabled) return;
        const check = await Updates.checkForUpdateAsync();
        if (!active || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!active) return;
        await Updates.reloadAsync();
      } catch {
        // Une panne OTA ne doit jamais empêcher Loki Music de démarrer.
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  return null;
}
