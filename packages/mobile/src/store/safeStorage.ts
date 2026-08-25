import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * BUG RÉEL corrigé le 24/08/2026 -- Adel a signalé "page blanche" côté
 * navigateur, non reproductible depuis un environnement de test frais
 * (AsyncStorage/localStorage vierge). Root cause probable, confirmée par
 * élimination : `createJSONStorage(() => AsyncStorage)` (utilisé par les 5
 * stores persistés du projet) appelle `JSON.parse()` en interne SANS
 * protection -- une entrée corrompue dans le localStorage réel d'Adel
 * (accumulée sur des heures de tests/changements de schéma aujourd'hui,
 * ex. `SessionTrackEntry.discoverySource` étendu, `successCount` ajouté à
 * useUserStore) fait planter zustand/persist AU CHARGEMENT DU MODULE --
 * AVANT le premier rendu React, donc jamais récupérable par un simple
 * refresh puisque la donnée corrompue reste en stockage d'une tentative à
 * l'autre. Cette fabrique remplace `createJSONStorage(() => AsyncStorage)`
 * partout : un JSON.parse qui échoue efface SEULEMENT la clé corrompue et
 * repart de l'état initial du store concerné, plutôt que de planter toute
 * l'application pour un problème de stockage local sur UN SEUL appareil.
 */
export function createSafeStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      let raw: string | null;
      try {
        raw = await AsyncStorage.getItem(name);
      } catch (e) {
        console.warn(`[KEEP][storage] lecture impossible pour "${name}" -- état initial utilisé:`, e);
        return null;
      }
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch (e) {
        console.warn(`[KEEP][storage] JSON corrompu pour "${name}" -- clé effacée, état initial utilisé:`, e);
        AsyncStorage.removeItem(name).catch(() => {});
        return null;
      }
    },
    setItem: async (name, value) => {
      try {
        await AsyncStorage.setItem(name, JSON.stringify(value));
      } catch (e) {
        console.warn(`[KEEP][storage] écriture impossible pour "${name}":`, e);
      }
    },
    removeItem: async (name) => {
      await AsyncStorage.removeItem(name);
    },
  };
}
