import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { composeVisitorInvite } from '../services/visitorInvite';
import { colors } from '../theme/colors';

/** Petit robot du visiteur sans compte : nomme la personne qui l'a invité, propose de s'inscrire, disparaît d'un appui (jamais bloquant). */
export default function VisitorInviteRobot({ inviter }: { inviter: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || !inviter) return null;
  return (
    <View style={s.box} testID="visitor-invite-robot" accessibilityLabel="Invitation du robot">
      <Text style={s.text}>🤖 {composeVisitorInvite(inviter)}</Text>
      <View style={s.row}>
        <TouchableOpacity style={s.cta} onPress={() => useAccountGateStore.getState().requestAccount('create', inviter)} accessibilityRole="button" accessibilityLabel="Créer mon compte" testID="visitor-invite-create"><Text style={s.ctaText}>Créer mon compte</Text></TouchableOpacity>
        <TouchableOpacity style={s.later} onPress={() => setHidden(true)} accessibilityRole="button" accessibilityLabel="Plus tard"><Text style={s.laterText}>Plus tard</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { marginHorizontal: 18, marginTop: 8, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primaryLight, backgroundColor: colors.primaryFaint },
  text: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  cta: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  later: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: colors.white, fontSize: 13, fontWeight: '800' },
});
