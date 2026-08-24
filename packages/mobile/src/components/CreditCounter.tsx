import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../store/useUserStore';
import { fetchRecognitionConfig, fetchMySubscription } from '../services/billingApi';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

type CreditState = 'unlimited' | 'available' | 'low' | 'zero' | 'sync_error';

/**
 * Compteur de crédits (cf. demande explicite du 24/08/2026 -- "très visible
 * et simple, affiche les crédits AVANT une reconnaissance, mets à jour
 * IMMÉDIATEMENT après"). Réutilise EXACTEMENT la même logique de palier que
 * useSessionStore.ts (isPremiumTier via fetchMySubscription, guestSuccessLimit
 * + signupBonusSuccesses via fetchRecognitionConfig) -- jamais une deuxième
 * règle de quota inventée ici, juste son affichage.
 *
 * `successCount` (useUserStore, Zustand) est le MÊME compteur que celui qui
 * pilote guestLimitReached/freeLimitReached -- s'abonner dessus ici suffit à
 * une mise à jour immédiate : incrementSuccessCount() (useSessionStore,
 * appelé au moment exact d'une nouvelle reconnaissance réelle) redéclenche
 * ce composant sans action supplémentaire.
 */
export default function CreditCounter() {
  const { t } = useTranslation();
  const successCount = useUserStore((s) => s.successCount);
  const user = useUserStore((s) => s.user);
  const isAnonymous = useUserStore((s) => s.isAnonymous);

  const [limit, setLimit] = useState<number | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSyncError(false);
    Promise.all([fetchRecognitionConfig(), fetchMySubscription()])
      .then(([config, sub]) => {
        if (cancelled) return;
        const planCode = sub?.plans?.code ?? null;
        const premium = planCode !== null && planCode !== 'FREE';
        setIsPremium(premium);
        const isGuest = !user || isAnonymous;
        setLimit(isGuest ? config.guestSuccessLimit : config.guestSuccessLimit + config.signupBonusSuccesses);
      })
      .catch(() => {
        if (!cancelled) setSyncError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAnonymous]);

  // BUG RÉEL trouvé le 24/08/2026 (Adel, test réel : "est-ce que tu penses
  // vraiment que c'est sa place en plein milieu" -- un pill rouge plein
  // encastré entre l'animation et le bouton principal, trop lourd/alarmant
  // pour une info de statut). Repli sur un simple texte discret avec une
  // puce de couleur, jamais un bloc plein qui capte l'œil avant le bouton
  // d'action -- même esprit que idleSubtitle, juste la couleur de la puce
  // change selon l'état.
  if (syncError) return <Caption dot={colors.textMuted} label={`⚠ ${t('credits.syncError')}`} />;
  if (isPremium) return <Caption dot={colors.keep} label={`✦ ${t('credits.unlimited')}`} />;

  // Config pas encore résolue -- jamais afficher un chiffre inventé le temps du chargement.
  if (limit === null) return null;

  const remaining = Math.max(0, limit - successCount);
  const state: CreditState = remaining === 0 ? 'zero' : remaining === 1 ? 'low' : 'available';
  const dotColor = state === 'zero' ? colors.pass : state === 'low' ? colors.smartBadgeText : colors.keep;
  const label = state === 'zero' ? t('credits.zero') : t('credits.remaining', { count: remaining, total: limit });

  return <Caption dot={dotColor} label={label} />;
}

function Caption({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginBottom: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
});
