import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { reloadToLatest } from '../services/appUpdateService';
import { colors } from '../theme/colors';

// Mise à jour web volontairement non bloquante : rien n'est affiché tant que
// version.json ne signale pas un nouveau build. Quand un nouveau push est
// réellement déployé, un seul petit bouton apparaît. L'utilisateur choisit
// quand l'appliquer afin de ne jamais interrompre un test en cours.
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((s) => s.latestSha);
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web') return null;

  return (
    <View
      style={[s.wrap, width < 768 && s.wrapCompact]}
      pointerEvents="box-none"
      testID="keep-update-available-button"
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Appliquer la nouvelle version de Loki Music"
        style={[s.button, latestSha && s.buttonHot]}
        onPress={reloadToLatest}
      >
        <Text style={s.text}>{latestSha ? '↻ Nouvelle version' : '↻ Mise à jour'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 82,
    alignItems: 'center',
    zIndex: 190,
    pointerEvents: 'box-none',
  },
  wrapCompact: {
    bottom: 132,
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  button: {
    minHeight: 36,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  buttonHot: {
    borderWidth: 2,
    shadowOpacity: 0.38,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '900',
  },
});
