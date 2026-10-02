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
export default function AppUpdateBanner({ authReady = true }: { authReady?: boolean }) {
  const latestSha = useAppUpdateStore((state) => state.latestSha);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const webReloadingRef = useRef(false);

  useEffect(() => {
    if (!authReady || Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 60_000);
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
  }, [authReady, checkNow]);

  useEffect(() => {
    if (!authReady || Platform.OS !== 'web' || !latestSha || webReloadingRef.current) return undefined;
    // Incident 02/10/2026 : la page se rechargeait en pleine utilisation (clic
    // sur Recherche, profil en cours de chargement) à chaque publication -- et
    // il y en a eu des dizaines dans la journée. Chaque rechargement relançait
    // tout le chargement du profil, qui n'aboutissait jamais : profils « vides ».
    // La mise à jour reste silencieuse et automatique, mais ne s'applique
    // JAMAIS sous les doigts de l'utilisateur : seulement quand l'onglet passe
    // en arrière-plan (changement d'onglet, écran verrouillé, fenêtre réduite).
    const applyUpdate = () => {
      if (webReloadingRef.current) return;
      webReloadingRef.current = true;
      reloadToLatest();
    };
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') {
      applyUpdate();
      return undefined;
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') applyUpdate();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [authReady, latestSha]);

  useEffect(() => {
    if (!authReady || Platform.OS === 'web' || __DEV__) return undefined;
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
