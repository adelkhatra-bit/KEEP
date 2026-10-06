import React, { useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { CLAMP_WORDS, clampWords } from '../services/clampWords';

// Adel (06/10/2026, soir) : 2 mots puis « En savoir plus »
// (repli, rien n'est supprimé) pour que les offres et les boutons d'achat
// restent visibles sans défiler sur iPhone 390.
export default function ClampedText({ text, style, max = CLAMP_WORDS }: { text: string; style?: StyleProp<TextStyle>; max?: number }) {
  const [open, setOpen] = useState(false);
  const { short, clamped } = clampWords(text, max);
  if (!clamped) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {open ? text : short}{' '}
      <Text
        style={{ color: colors.primaryLight, fontWeight: '800' }}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Réduire le texte' : 'En savoir plus'}
        accessibilityState={{ expanded: open }}
      >
        {open ? 'Réduire' : 'En savoir plus'}
      </Text>
    </Text>
  );
}
