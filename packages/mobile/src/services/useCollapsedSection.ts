import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Règle générale d'Adel (05/10/2026, IDEA-116) : toute grande section d'un profil (boutique, ventes privées du chat…) peut être masquée / affichée
 * d'un appui, et l'appareil se souvient du choix (même code application et ordinateur). Un nouveau profil reçoit l'état par défaut.
 */
export const collapsedSectionKey = (profileId: string, section: string) => `@loki/section-open/v1/${profileId}/${section}`;

export function useCollapsedSection(profileId: string, section: string, defaultOpen: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(defaultOpen);
  const key = collapsedSectionKey(profileId, section);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key).then((v) => { if (live && (v === '1' || v === '0')) setOpen(v === '1'); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  const toggle = useCallback(() => {
    setOpen((cur) => {
      const next = !cur;
      void AsyncStorage.setItem(key, next ? '1' : '0').catch(() => {});
      return next;
    });
  }, [key]);
  return [open, toggle];
}
