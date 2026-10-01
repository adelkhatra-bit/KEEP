import React, { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Mise à jour silencieuse uniquement.
 *
 * Aucun bouton, aucune bannière et aucun écran « dernière version » ne doit
 * interrompre l'utilisateur. Une OTA native compatible est appliquée en
 * arrière-plan ; en cas d'incompatibilité ou de panne réseau, la version déjà
 * installée continue de fonctionner normalement.
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
        // Une update ne doit jamais bloquer Loki Music.
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  return null;
}
