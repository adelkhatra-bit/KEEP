import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

/**
 * Contenu masqué pour les visiteurs en plan FREE -- incitation à
 * l'abonnement (cf. demande explicite du 22/08/2026 : "on masque les noms
 * des artistes des musiques pour ne pas que l'utilisateur puisse voir tout
 * le profil"). Affiche un nombre de caractères réaliste (pas juste "•••")
 * pour donner une vraie impression de contenu caché plutôt qu'un vide.
 */
export default function LockedText({ text, locked }: { text: string; locked: boolean }) {
  if (!locked) return <Text style={styles.plain}>{text}</Text>;
  const maskedLength = Math.max(4, Math.min(text.length, 10));
  return (
    <View style={styles.maskWrap}>
      <Text style={styles.masked}>{'█'.repeat(maskedLength)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plain: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  maskWrap: { backgroundColor: colors.backgroundCard, borderRadius: radius.sm, paddingHorizontal: 4 },
  masked: { color: colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1, opacity: 0.5 },
});
