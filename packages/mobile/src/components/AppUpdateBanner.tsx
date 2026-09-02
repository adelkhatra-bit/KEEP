import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppUpdateStore } from '../store/useAppUpdateStore';
import { reloadToLatest } from '../services/appUpdateService';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

// Adel (02/09/2026) : "comme une application normale ... popup pour qu'il
// puisse faire sa mise à jour, toujours avoir la possibilité de dire je la
// ferai plus tard" -- bandeau discret (pas un Alert bloquant : une mise à
// jour n'empêche jamais d'utiliser l'app en attendant), monté une fois au
// niveau racine comme GlobalNotificationBanner. Recharger la page suffit à
// "mettre à jour" puisque KEEP est un site statique : c'est le nouveau
// bundle déjà déployé qui se charge.
export default function AppUpdateBanner() {
  const latestSha = useAppUpdateStore((s) => s.latestSha);
  const dismiss = useAppUpdateStore((s) => s.dismiss);

  if (Platform.OS !== 'web' || !latestSha) return null;

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.card}>
        <Text style={s.title}>🔄 Nouvelle version de Loki disponible</Text>
        <Text style={s.body}>Recharge pour profiter des dernières fonctions.</Text>
        <View style={s.actions}>
          <TouchableOpacity accessibilityRole="button" style={s.later} onPress={dismiss}>
            <Text style={s.laterText}>Plus tard</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={s.update} onPress={reloadToLatest}>
            <Text style={s.updateText}>Mettre à jour</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 78, alignItems: 'center', paddingHorizontal: spacing.lg, zIndex: 200 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.backgroundCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  later: { flex: 1, minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  laterText: { color: colors.textPrimary, fontSize: 12, fontWeight: '800' },
  update: { flex: 1, minHeight: 40, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  updateText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
});
