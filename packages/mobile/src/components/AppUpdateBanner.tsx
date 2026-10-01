import React, { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Mise à jour silencieuse uniquement.
 *
 * Aucun bouton, aucune bannière et aucun écran « dernière version » ne doit
 * interrompre l'utilisateur, sur mobile comme sur ordinateur. Une OTA native
 * compatible est appliquée silencieusement ; sur le web, le mécanisme global
 * de contrôle de version continue de fonctionner sans UI bloquante.
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
        // Une update ne doit jamais bloquer Loki Music ni afficher un écran.
      }
    };

    void applySilently();
    return () => { active = false; };
  }, []);

  return null;
}
