import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { requestMicPermission } from '../services/micCapture';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

// Maquette validée (docs/mockups/Permissions.html, 22/09/2026) : écran de
// mise en confiance avant la toute première demande d'autorisation micro
// native (iOS/Android). Affiché une seule fois par appareil -- l'appelant
// (HomeScreenCompact) gère la persistance de "déjà vu".
type Props = {
  onAuthorized: () => void;
  onLater: () => void;
};

export default function MicPermissionPrimerScreen({ onAuthorized, onLater }: Props) {
  const [busy, setBusy] = useState(false);

  const authorize = async () => {
    setBusy(true);
    try {
      await requestMicPermission();
    } finally {
      setBusy(false);
      onAuthorized();
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <View style={s.icon}><Text style={s.iconText}>🎤</Text></View>
        <Text style={s.title}>Autorise le micro</Text>
        <Text style={s.body}>Loki Music a besoin d'accéder au micro pour identifier les morceaux autour de toi.</Text>
        <View style={s.state}>
          <View style={s.dot} />
          <Text style={s.stateText}>En attente d'autorisation</Text>
        </View>
        <TouchableOpacity style={s.primary} onPress={authorize} disabled={busy} accessibilityRole="button" accessibilityLabel="Autoriser le microphone">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>AUTORISER LE MICRO</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.ghost} onPress={onLater} disabled={busy} accessibilityRole="button" accessibilityLabel="Plus tard">
          <Text style={s.ghostText}>Plus tard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm },
  icon: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  iconText: { fontSize: 40 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.textMutedGrey, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.backgroundCard, marginTop: spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  stateText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  primary: { minHeight: 52, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  ghost: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: colors.textMutedGrey, fontSize: 14, fontWeight: '700' },
});
