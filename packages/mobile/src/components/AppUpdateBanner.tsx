import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { reloadToLatest } from '../services/appUpdateService';
import { colors } from '../theme/colors';

// Sur ordinateur, le contrôle reste toujours visible pour permettre un
// rechargement cache-busté manuel. Quand un nouveau SHA est détecté, le même
// bouton devient explicitement « nouvelle version ». Il reste absent sur mobile.
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

  if (Platform.OS !== 'web' || width < 768) return null;

  return (
    <View
      style={s.wrap}
      pointerEvents="box-none"
      testID="keep-manual-update-control"
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={latestSha ? 'Appliquer la nouvelle version de Loki Music' : 'Actualiser Loki Music'}
        style={[s.button, latestSha && s.buttonReady]}
        onPress={() => { void checkNow().finally(reloadToLatest); }}
      >
        <View style={[s.iconCircle, latestSha && s.iconCircleReady]}><Text style={s.icon}>↻</Text></View>
        <View style={s.copy}>
          <Text style={[s.title, latestSha && s.titleReady]}>{latestSha ? 'NOUVELLE VERSION DISPONIBLE' : 'ACTUALISER LOKI MUSIC'}</Text>
          <Text style={s.subtitle}>{latestSha ? 'Clique ici pour charger immédiatement le nouveau visuel' : 'Recharge la dernière version publiée'}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 86,
    alignItems: 'center',
    zIndex: 190,
    pointerEvents: 'box-none',
  },
  button: {
    width: 286,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    backgroundColor: 'rgba(20,14,31,.98)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  buttonReady: {
    borderColor: colors.keep,
    backgroundColor: 'rgba(13,36,31,.98)',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryFaint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iconCircleReady: {
    borderColor: colors.keep,
    backgroundColor: 'rgba(45,225,194,.10)',
  },
  icon: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.35,
  },
  titleReady: { color: colors.keep },
  subtitle: {
    color: colors.textMutedGrey,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    marginTop: 2,
  },
});
