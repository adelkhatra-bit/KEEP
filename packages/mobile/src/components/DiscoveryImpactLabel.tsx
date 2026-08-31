import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DiscoveryImpact } from '../services/publicProfileStateService';

type Props = {
  impact?: DiscoveryImpact | null;
};

export default function DiscoveryImpactLabel({ impact }: Props) {
  if (!impact || impact.recoveryCount <= 0) return null;
  const keepWord = impact.recoveryCount > 1 ? 'reprises générées' : 'reprise générée';
  const userWord = impact.uniqueUsers > 1 ? 'utilisateurs' : 'utilisateur';
  return (
    <View style={styles.row} accessibilityLabel={`${impact.recoveryCount} reprises générées par cette découverte`}>
      <Text style={styles.text}>↗ {impact.recoveryCount} {keepWord} par {impact.uniqueUsers} {userWord}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 4, alignSelf: 'flex-start' },
  text: { color: '#7CF2B9', fontSize: 9, lineHeight: 13, fontWeight: '900' },
});
