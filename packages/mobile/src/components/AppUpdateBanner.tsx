import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';

/**
 * Diffusion silencieuse Loki Music.
 *
 * Web : vérifie version.json puis recharge automatiquement le bundle public
 * avec cache-bust lorsqu'un SHA plus récent est réellement déployé.
 * Native : applique silencieusement une OTA EAS compatible au lancement.
 *
 * Aucun bouton, bandeau ou écran de version ne doit interrompre l'utilisateur.
 */
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const webReloadingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 60_000);
    return () => clearInterval(interval);
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
