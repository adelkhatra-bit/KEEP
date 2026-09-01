import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DiscoveryImpact } from '../services/publicProfileStateService';

type Props = {
  impact?: DiscoveryImpact | null;
};

// Adel (02/09/2026) : "faut pas que ça dépasse Découvert par ... trop long"
// -- "1 reprise générée par 1 utilisateur" raccourci à "1 reprise", le détail
// complet reste dans le accessibilityLabel pour les lecteurs d'écran.
export default function DiscoveryImpactLabel({ impact }: Props) {
  if (!impact || impact.recoveryCount <= 0) return null;
  const keepWord = impact.recoveryCount > 1 ? 'reprises' : 'reprise';
  const userWord = impact.uniqueUsers > 1 ? 'utilisateurs' : 'utilisateur';
  return (
    <View style={styles.row} accessibilityLabel={`${impact.recoveryCount} reprises générées par ${impact.uniqueUsers} ${userWord}`}>
      <Text style={styles.text}>↗ {impact.recoveryCount} {keepWord}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 4, alignSelf: 'flex-start' },
  text: { color: '#7CF2B9', fontSize: 9, lineHeight: 13, fontWeight: '900' },
});
