import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { reloadToLatest } from '../services/appUpdateService';
import { colors } from '../theme/colors';

// Contrôle web/PWA volontairement discret : rien n'est affiché tant qu'une
// nouvelle version réellement déployée n'est pas détectée. L'utilisateur
// applique la mise à jour quand il le souhaite afin de ne pas interrompre un test.
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((s) => s.latestSha);
  const checkNow = useAppUpdateStore((s) => s.checkNow);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    void checkNow();
    const timer = setInterval(() => { void checkNow(); }, 60_000);
    return () => clearInterval(timer);
  }, [checkNow]);

  if (Platform.OS !== 'web' || width < 768 || !latestSha) return null;

  return (
    <View
      style={s.wrap}
      pointerEvents="box-none"
      testID="keep-update-available-button"
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Appliquer la nouvelle version de Loki Music"
        style={s.button}
        onPress={reloadToLatest}
      >
        <Text style={s.text}>MISE À JOUR</Text>
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
  text: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
