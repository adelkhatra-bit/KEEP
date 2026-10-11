import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

// Adel (29/09/2026) : « trop de texte… tu laisses juste les deux premiers
// mots, puis une flèche pour en savoir plus qui se déroule ». Règle UI :
// une information longue s'affiche en UNE ligne courte + ›, jamais dans un
// bouton, jamais en gros bloc rouge. Le détail se déplie au toucher.
type Tone = 'info' | 'warn';

export default function MoreInfoLine({ short, full, tone = 'info', icon }: { short: string; full: string; tone?: Tone; icon?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.row} onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${short}. ${open ? 'Masquer le détail' : 'En savoir plus'}`} hitSlop={6}>
        {icon ? <Text style={[s.icon, tone === 'warn' && s.warn]}>{icon}</Text> : null}
        <Text style={[s.short, tone === 'warn' && s.warn]} numberOfLines={1}>{short}</Text>
        <Text style={[s.chevron, tone === 'warn' && s.warn]}>{open ? '˄' : '›'}</Text>
      </TouchableOpacity>
      {open ? <Text style={s.full}>{full}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 6 },
  row: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { color: colors.textMutedGrey, fontSize: 13 },
  short: { flexShrink: 1, color: colors.textMutedGrey, fontSize: 12, fontWeight: '800' },
  warn: { color: colors.warning },
  chevron: { color: colors.textMutedGrey, fontSize: 16, fontWeight: '900' },
  full: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 2, marginBottom: 4 },
});
