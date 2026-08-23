import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlanCode } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

/**
 * Badge de certification affiché à côté du pseudo -- reflète l'abonnement
 * PAYÉ de l'utilisateur (cf. demande explicite du 22/08/2026 : "une fois que
 * le client a payé, le certifier"). Un par palier de `docs/PRICING_STRATEGY.md` :
 * FREE = aucun badge, PREMIUM = coche simple, CREATOR PRO = étoile (DJ/artistes/
 * créateurs), VENUE PRO = bâtiment (clubs/bars/hôtels).
 *
 * STATUT HONNÊTE : le badge reflète `user.plan`, qui ne devient réel que
 * lorsque le paiement (Stripe ou équivalent, pas encore branché) l'attribue
 * réellement côté backend -- en Mode Démo, ce champ est modifiable librement
 * depuis Profil pour prévisualiser chaque rendu, jamais en Mode Réel sans
 * paiement effectif.
 */
export default function VerifiedBadge({ plan, size = 'md' }: { plan: PlanCode; size?: 'sm' | 'md' }) {
  if (plan === 'FREE') return null;

  const config = {
    PREMIUM: { icon: '✓', bg: colors.primary, label: 'Premium' },
    CREATOR_PRO: { icon: '★', bg: '#FFB454', label: 'Creator Pro' },
    VENUE_PRO: { icon: '◆', bg: colors.keep, label: 'Venue Pro' },
  }[plan];

  const small = size === 'sm';
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, small && styles.badgeSmall]}>
      <Text style={[styles.icon, small && styles.iconSmall]}>{config.icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 20, height: 20, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  badgeSmall: { width: 15, height: 15 },
  icon: { color: colors.black, fontSize: 11, fontWeight: '900' },
  iconSmall: { fontSize: 8 },
});
