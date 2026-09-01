import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

// Source de vérité visuelle commune aux compteurs de profil propriétaire, visité et partagé.
export type ProfileCounterItem = {
  label: string;
  value: number;
  // Adel (02/09/2026) : "on pourra cliquer directement sur les chiffres
  // au-dessus" -- un item avec onPress devient le déclencheur direct (ex:
  // Abonnés/Abonnements), les autres (Morceaux/Reprises) restent tels quels.
  onPress?: () => void;
  active?: boolean;
};

type Props = {
  items: ProfileCounterItem[];
  kind?: 'connections' | 'keeps';
  compact?: boolean;
  style?: ViewStyle;
};

export default function ProfileCounterRow({ items, kind = 'keeps', style }: Props) {
  return (
    <View style={[styles.row, kind === 'connections' ? styles.connections : styles.keeps, style]}>
      {items.map((item) => {
        const content = (
          <>
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </>
        );
        return item.onPress ? (
          <TouchableOpacity
            key={item.label}
            style={[styles.item, item.active && styles.itemActive]}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${item.value} ${item.label}`}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View key={item.label} style={styles.item}>{content}</View>
        );
      })}
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
  itemActive: { backgroundColor: 'rgba(139,92,246,.16)' },
  value: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  label: { color: '#FFFFFF', fontSize: 11, width: '100%', lineHeight: 14, marginTop: 3, textAlign: 'center', fontWeight: '700' },
});
