import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { useUserStore } from '../store/useUserStore';

/**
 * Mises à jour Loki Music entièrement silencieuses :
 * - aucun bouton "Actualiser" / "Mettre à jour" visible ;
 * - web : contrôle toutes les 30 s et au retour sur l'onglet, puis recharge
 *   automatiquement uniquement une fois l'authentification restaurée ;
 * - iOS/Android : applique silencieusement une OTA compatible après bootstrap.
 */
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const authReady = useUserStore((state) => state.authReady);
  const webReloadingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 30_000);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void checkNow();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkNow]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !authReady || !latestSha || webReloadingRef.current) return;
    webReloadingRef.current = true;
    reloadToLatest();
  }, [authReady, latestSha]);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !authReady) return undefined;

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
  }, [authReady]);

  return null;
}
