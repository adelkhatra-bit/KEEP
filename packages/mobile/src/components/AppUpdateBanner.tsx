import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';

const AUTO_RELOAD_KEY = 'keep_auto_reloaded_sha_v1';

/**
 * Loki Music se met à jour sans bouton utilisateur.
 * Web : vérifie rapidement version.json et recharge automatiquement une fois
 * par SHA publié. Native/TestFlight : applique silencieusement une OTA EAS
 * compatible au lancement.
 */
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 15_000);
    return () => clearInterval(interval);
  }, [checkNow]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !latestSha || reloadingRef.current) return;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_RELOAD_KEY) === latestSha) return;
      if (typeof localStorage !== 'undefined') localStorage.setItem(AUTO_RELOAD_KEY, latestSha);
    } catch {
      // Le cache navigateur peut être indisponible en navigation privée.
    }
    reloadingRef.current = true;
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
