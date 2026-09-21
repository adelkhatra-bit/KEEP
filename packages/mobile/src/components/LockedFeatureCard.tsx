import React, { useState } from 'react';
import { Modal, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

/**
 * Principe produit (Adel, 21/09/2026) : "On n'efface jamais une
 * fonctionnalité parce que l'utilisateur n'a pas atteint le palier
 * requis. On la montre toujours, mais verrouillée." Réutilisable pour
 * toute fonctionnalité à palier (abonnés, ventes, KEEPs, niveau...).
 *
 * Quand `unlocked` est vrai, ce composant ne rend RIEN de particulier --
 * juste `children` (la vraie fonctionnalité). Quand c'est faux, il rend
 * `lockedTeaser` (fourni par l'appelant, pour matcher le contexte visuel
 * exact : petit bouton, bannière, entrée de menu...) enveloppé dans une
 * zone tapable qui ouvre ce popup d'explication.
 */
export type LockedFeatureCardProps = {
  unlocked: boolean;
  title: string;
  requirementLabel: string;
  current: number;
  required: number;
  benefit: string;
  actionLabel?: string;
  onAction?: () => void;
  lockedTeaser: React.ReactNode;
  children: React.ReactNode;
};

export default function LockedFeatureCard({
  unlocked,
  title,
  requirementLabel,
  current,
  required,
  benefit,
  actionLabel,
  onAction,
  lockedTeaser,
  children,
}: LockedFeatureCardProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  if (unlocked) return <>{children}</>;

  const progress = required > 0 ? Math.max(0, Math.min(1, current / required)) : 0;

  return (
    <>
      <TouchableOpacity onPress={() => setInfoOpen(true)} accessibilityLabel={`${title}, verrouillé -- appuie pour voir comment débloquer`} accessibilityRole="button">
        {lockedTeaser}
      </TouchableOpacity>
      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <View style={s.backdrop}>
          <TouchableOpacity style={s.backdropTouch} activeOpacity={1} onPress={() => setInfoOpen(false)} />
          <View style={s.card}>
            <Text style={s.lockIcon}>🔒</Text>
            <Text style={s.title}>{title}</Text>
            <Text style={s.requirement}>Il te faut {required} {requirementLabel}. Tu en as {current}.</Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={s.progressLabel}>{current}/{required}</Text>
            <Text style={s.benefit}>{benefit}</Text>
            {actionLabel && onAction ? (
              <TouchableOpacity style={s.actionButton} onPress={() => { setInfoOpen(false); onAction(); }}>
                <Text style={s.actionButtonText}>{actionLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.closeButton} onPress={() => setInfoOpen(false)}>
              <Text style={s.closeButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,2,7,0.82)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  backdropTouch: { ...StyleSheet.absoluteFillObject },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center' },
  lockIcon: { fontSize: 28, marginBottom: 4 },
  title: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  requirement: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.backgroundCard, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  progressLabel: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', marginTop: 4 },
  benefit: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: spacing.md },
  actionButton: { minHeight: 46, width: '100%', borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  actionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  closeButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  closeButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
});
