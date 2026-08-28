import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

// Source de vérité visuelle commune aux compteurs de profil propriétaire, visité et partagé.
export type ProfileCounterItem = {
  label: string;
  value: number;
};

type Props = {
  items: ProfileCounterItem[];
  kind?: 'connections' | 'keeps';
  style?: ViewStyle;
};

export default function ProfileCounterRow({ items, kind = 'keeps', style }: Props) {
  return (
    <View style={[styles.row, kind === 'connections' ? styles.connections : styles.keeps, style]}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={styles.value}>{item.value}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    flexShrink: 1,
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  connections: { marginTop: 8 },
  keeps: { marginTop: 10 },
  item: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 6 },
  value: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  label: { color: '#FFFFFF', fontSize: 11, width: '100%', lineHeight: 14, marginTop: 3, textAlign: 'center', fontWeight: '700' },
});
