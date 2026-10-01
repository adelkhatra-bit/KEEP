import React, { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Mise à jour silencieuse uniquement.
 *
 * Aucun bouton, aucune bannière et aucun écran "télécharger/recharger la
 * dernière version" ne doit bloquer l'utilisateur. Sur une build native
 * compatible, EAS Update est vérifié dynamiquement puis appliqué. Si le module
 * natif n'existe pas dans l'ancienne build ou si le réseau échoue, Loki
 * continue normalement avec la version déjà installée.
 */
export default function AppUpdateBanner() {
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
        // Jamais de blocage ni de message "télécharger la dernière version".
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  return null;
}
