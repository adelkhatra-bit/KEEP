import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

// Adel (29/09/2026) : « il faut qu'il sache comment regagner des Free :
// partager son lien, ou prendre un abonnement ». Une ligne discrète qui se
// déplie en 3 petits boutons (chaque bouton = une action, pas de texte long).
type Props = { onShare: () => void; onSolo: () => void; onOffers?: () => void; highlight?: boolean };

export default function FreeEarnHelp({ onShare, onSolo, onOffers, highlight = false }: Props) {
  const [open, setOpen] = useState(highlight);
  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.row} onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Comment regagner des Free" hitSlop={6}>
        <Text style={[s.label, highlight && s.labelHot]}>💡 Regagner des Free</Text>
        <Text style={[s.chevron, highlight && s.labelHot]}>{open ? '˄' : '›'}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={s.actions}>
          <TouchableOpacity style={s.chip} onPress={onShare} accessibilityRole="button" accessibilityLabel="Partager mon lien pour gagner des Free"><Text style={s.chipText}>↗ Partager</Text></TouchableOpacity>
          <TouchableOpacity style={s.chip} onPress={onSolo} accessibilityRole="button" accessibilityLabel="Jouer en Solo pour gagner des Free"><Text style={s.chipText}>◎ Solo</Text></TouchableOpacity>
          {onOffers ? <TouchableOpacity style={[s.chip, s.chipPrimary]} onPress={onOffers} accessibilityRole="button" accessibilityLabel="Voir les formules"><Text style={[s.chipText, s.chipTextPrimary]}>★ Formules</Text></TouchableOpacity> : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 2, alignSelf: 'stretch', alignItems: 'center' },
  row: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: colors.textMutedGrey, fontSize: 12, fontWeight: '800' },
  labelHot: { color: colors.warning },
  chevron: { color: colors.textMutedGrey, fontSize: 16, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  chipPrimary: { borderColor: colors.primaryLight, backgroundColor: colors.primary },
  chipText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  chipTextPrimary: { color: '#FFFFFF' },
});
