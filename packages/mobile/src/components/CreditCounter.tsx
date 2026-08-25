import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCreditStatus } from '../hooks/useCreditStatus';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

/**
 * Compteur de crédits (cf. demande explicite du 24/08/2026 -- "très visible
 * et simple, affiche les crédits AVANT une reconnaissance, mets à jour
 * IMMÉDIATEMENT après"). Toute la logique de calcul vit dans useCreditStatus
 * (hook partagé, voir hooks/useCreditStatus.ts) -- ce composant ne fait plus
 * QUE l'affichage, jamais un deuxième calcul du restant.
 */
export default function CreditCounter() {
  const { t } = useTranslation();
  const status = useCreditStatus();

  // BUG RÉEL trouvé le 24/08/2026 (Adel, test réel : "est-ce que tu penses
  // vraiment que c'est sa place en plein milieu" -- un pill rouge plein
  // encastré entre l'animation et le bouton principal, trop lourd/alarmant
  // pour une info de statut). Repli sur un simple texte discret avec une
  // puce de couleur, jamais un bloc plein qui capte l'œil avant le bouton
  // d'action -- même esprit que idleSubtitle, juste la couleur de la puce
  // change selon l'état.
  if (!status) return null; // config pas encore résolue -- jamais un chiffre inventé le temps du chargement.
  if (status.state === 'sync_error') return <Caption dot={colors.textMuted} label={`⚠ ${t('credits.syncError')}`} />;
  if (status.state === 'unlimited') return <Caption dot={colors.keep} label={`✦ ${t('credits.unlimited')}`} />;

  const dotColor = status.state === 'zero' ? colors.pass : status.remaining === 1 ? colors.smartBadgeText : colors.keep;
  const label = status.state === 'zero' ? t('credits.zero') : t('credits.remaining', { count: status.remaining });

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
