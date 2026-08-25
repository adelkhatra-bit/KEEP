import { useEffect, useState } from 'react';
import { useUserStore } from '../store/useUserStore';
import { fetchCreditStatus, CreditStatus } from '../services/billingApi';

/**
 * Hook partagé -- SEUL endroit qui appelle fetchCreditStatus() pour
 * l'affichage (cf. demande explicite du 24/08/2026 -- "le compteur doit
 * venir de la même source de vérité partout : Session KEEP, Profil et
 * backend"). CreditCounter.tsx et ProfileScreen.tsx utilisent tous les deux
 * CE hook, jamais un fetch/calcul dupliqué -- toute divergence entre écrans
 * serait alors structurellement impossible, pas juste évitée par convention.
 *
 * Re-fetch dès que `successCount` (useUserStore, incrémenté au moment exact
 * d'un GARDER réel) ou l'identité (user/isAnonymous) changent -- jamais un
 * polling, une mise à jour immédiate après action réelle uniquement.
 */
export function useCreditStatus(): CreditStatus | null {
  const successCount = useUserStore((s) => s.successCount);
  const user = useUserStore((s) => s.user);
  const isAnonymous = useUserStore((s) => s.isAnonymous);
  const [status, setStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCreditStatus().then((s) => {
      if (cancelled) return;
      if (s) setStatus(s);
      else setStatus((prev) => (prev ? { ...prev, state: 'sync_error' } : { state: 'sync_error', remaining: 0, limit: 0, isGuest: !user || isAnonymous, guestSuccessLimit: 0, signupBonusSuccesses: 0 }));
    });
    return () => {
      cancelled = true;
    };
  }, [successCount, user, isAnonymous]);

  return status;
}
