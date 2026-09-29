import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { colors } from '../theme/colors';

// Adel (29/09/2026) : « pas la peine de mettre tout ce pavé pour un bouton…
// plutôt Se connecter, qui mène directement à identifiant + mot de passe ;
// s'il n'a pas de compte, il pourra en créer un ». Comme sur les grandes
// plateformes : une pastille « Se connecter » en haut de l'écran, qui ouvre
// la fenêtre de compte UNIQUE (AccountGateModal) directement en connexion.
export default function LoginPill({ followUsername = '' }: { followUsername?: string }) {
  return (
    <TouchableOpacity
      style={s.pill}
      onPress={() => useAccountGateStore.getState().requestAccount('login', followUsername)}
      accessibilityRole="button"
      accessibilityLabel="Se connecter"
      hitSlop={6}
    >
      <Text style={s.text}>Se connecter</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  pill: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: .2 },
});
