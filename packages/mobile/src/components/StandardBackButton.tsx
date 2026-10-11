import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

export default function StandardBackButton({
  label = 'Retour',
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={s.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || `Retour vers ${label}`}
      hitSlop={8}
      activeOpacity={0.78}
    >
      <Text style={s.chevron}>‹</Text>
      <Text style={s.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  button: { alignSelf:'flex-start', minHeight:44, flexDirection:'row', alignItems:'center', gap:4, paddingRight:12, marginBottom:8 },
  chevron: { color:colors.primaryLight, fontSize:32, lineHeight:34, fontWeight:'500', marginTop:-2 },
  label: { color:colors.textPrimary, fontSize:15, fontWeight:'800' },
});
