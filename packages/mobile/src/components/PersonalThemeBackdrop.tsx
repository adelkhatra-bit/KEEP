import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';

/**
 * Personnalisation ado Loki Music.
 * - Fille / femme => univers "Rose nuit"
 * - tous les autres choix => design Loki sombre actuel inchangé
 *
 * Le genre reste privé dans profile_private_info. Ce décor ne change jamais
 * les couleurs fonctionnelles PASSER / GARDER.
 */
export default function PersonalThemeBackdrop() {
  const gender = useUserStore((state) => state.user?.privateInfo.gender);
  if (gender !== 'FEMALE') return null;

  return (
    <View pointerEvents="none" style={s.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.glowTop} />
      <View style={s.glowBottom} />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#120812',
  },
  glowTop: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    right: -155,
    top: -125,
    backgroundColor: 'rgba(236,72,153,0.20)',
  },
  glowBottom: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    left: -160,
    bottom: -130,
    backgroundColor: 'rgba(244,114,182,0.14)',
  },
});
