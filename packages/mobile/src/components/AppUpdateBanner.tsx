import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { reloadToLatest } from '../services/appUpdateService';

// Mise à jour silencieuse : aucun bandeau ni bouton ne doit masquer Loki Music.
// Web : version.json est vérifié périodiquement et une nouvelle version publiée
// est appliquée automatiquement avec cache-bust.
// iOS/Android production : EAS Update est appliqué automatiquement au lancement.
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((s) => s.latestSha);
  const checkNow = useAppUpdateStore((s) => s.checkNow);
  const webReloadingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const timer = setInterval(() => { void checkNow(); }, 60_000);
    return () => clearInterval(timer);
  }, [checkNow]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !latestSha || webReloadingRef.current) return;
    webReloadingRef.current = true;
    reloadToLatest();
  }, [latestSha]);

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return undefined;
    let active = true;
    const applyLatestNativeUpdate = async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!active || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!active) return;
        await Updates.reloadAsync();
      } catch {
        // Une panne OTA ne doit jamais empêcher l'application de démarrer.
      }
    };
    void applyLatestNativeUpdate();
    return () => { active = false; };
  }, []);

  return null;
}
