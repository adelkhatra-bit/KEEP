import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { formatCompactNumber } from '../utils/formatCompactNumber';

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
            <Text style={styles.value}>{formatCompactNumber(item.value)}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </>
        );
        return item.onPress ? (
          <TouchableOpacity
            key={item.label}
            style={[styles.item, styles.itemClickable, item.active && styles.itemActive]}
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
  // Adel (07/09/2026) : "fais un contour ... pour qu'on comprenne que c'est
  // cliquable" -- un chiffre cliquable (Morceaux, Reprises, Abonnés...) doit
  // se voir avant même d'être touché, pas seulement au survol/à l'appui.
  itemClickable: { margin: 3, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(139,92,246,.45)' },
  itemActive: { backgroundColor: 'rgba(139,92,246,.16)' },
  value: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  // Adel (11/09/2026) : retours utilisateurs "le profil c'est trop petit,
  // on a du mal à voir" -- 11px illisible pour Abonnés/Reprises/Morceaux/
  // Abonnements sur un vrai écran de téléphone, remonté à 13px partout où
  // ce composant est utilisé (profil propriétaire, visité, partagé, Discover).
  label: { color: '#FFFFFF', fontSize: 13, width: '100%', lineHeight: 16, marginTop: 3, textAlign: 'center', fontWeight: '700' },
});
