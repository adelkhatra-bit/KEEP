import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { reloadToLatest } from '../services/appUpdateService';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { runWhenNoGameInProgress } from '../services/updateGameGuard';

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
  const lastInteractionRef = useRef(Date.now());

  // Observer les gestes AVANT la détection d'un nouveau SHA : sinon un onglet
  // utilisé activement pourrait recharger immédiatement à la première alerte.
  useEffect(() => {
    if (!authReady || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const markActivity = () => { lastInteractionRef.current = Date.now(); };
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    activityEvents.forEach((event) => document.addEventListener(event, markActivity, { passive: true }));
    return () => activityEvents.forEach((event) => document.removeEventListener(event, markActivity));
  }, [authReady]);

  useEffect(() => {
    if (!authReady || Platform.OS !== 'web') return undefined;
    void checkNow();
    const interval = setInterval(() => { void checkNow(); }, 15_000);
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
    // Un utilisateur resté sur l'onglet doit recevoir la version publiée sans
    // devoir changer d'onglet. Attendre 30 s sans geste empêche de couper une
    // saisie, un clic ou une navigation active. Solo/Battle restent protégés.
    const VISIBLE_IDLE_MS = 30_000;
    let cancelGameWait: () => void = () => {};
    let queuedForGame = false;

    const editing = () => {
      if (typeof document === 'undefined') return false;
      const element = document.activeElement;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName || '')
        || Boolean(element?.closest?.('[contenteditable="true"]'));
    };
    const isSafe = () => typeof document === 'undefined'
      || document.visibilityState === 'hidden'
      || (Date.now() - lastInteractionRef.current >= VISIBLE_IDLE_MS && !editing());
    const applyUpdate = () => {
      if (webReloadingRef.current || queuedForGame || !isSafe()) return;
      queuedForGame = true;
      cancelGameWait = runWhenNoGameInProgress(() => {
        queuedForGame = false;
        if (webReloadingRef.current || !isSafe()) return;
        webReloadingRef.current = true;
        reloadToLatest();
      });
    };
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') {
      applyUpdate();
      return () => cancelGameWait();
    }

    const onHidden = () => { if (document.visibilityState === 'hidden') applyUpdate(); };
    document.addEventListener('visibilitychange', onHidden);
    // La détection SHA est séparée (15 s). Dès qu'elle signale un changement,
    // ce contrôle applique la mise à jour sur l'onglet visible au repos.
    // Contrôle local du temps d'inactivité, sans requête réseau (>= 5 s).
    const visibleIdleCheck = setInterval(applyUpdate, 5_000);
    applyUpdate();
    return () => {
      clearInterval(visibleIdleCheck);
      document.removeEventListener('visibilitychange', onHidden);
      cancelGameWait();
    };
  }, [authReady, latestSha]);

  useEffect(() => {
    if (!authReady || Platform.OS === 'web' || __DEV__) return undefined;
    let active = true;
    let cancelGameWait: () => void = () => {};

    const applySilently = async () => {
      try {
        const Updates = await import('expo-updates');
        if (!active || !Updates.isEnabled) return;
        const check = await Updates.checkForUpdateAsync();
        if (!active || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!active) return;
        // Téléchargée maintenant, installée seulement hors partie.
        cancelGameWait = runWhenNoGameInProgress(() => {
          if (!active) return;
          Updates.reloadAsync().catch(() => {});
        });
      } catch {
        // Une panne OTA ne doit jamais empêcher Loki Music de démarrer.
      }
    };

    void applySilently();
    return () => { active = false; cancelGameWait(); };
  }, [authReady]);

  return null;
}
