import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import {
  listWebCompanionSessions,
  revokeWebCompanionSession,
  WebCompanionSession,
} from '../services/webPairingService';
import { loadPcShareFreeCost, pcShareHoursLeft, pcShareMessage } from '../services/pcShareService';

function label(session: WebCompanionSession) {
  return session.device_label || 'Ordinateur Loki';
}

export default function WebCompanionSessionsPanel() {
  const [sessions, setSessions] = React.useState<WebCompanionSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (Platform.OS === 'web') return;
    setLoading(true);
    try {
      setSessions(await listWebCompanionSessions());
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (Platform.OS === 'web') return null;

  const active = sessions.filter((s) => !s.revoked_at && pcShareHoursLeft(s.created_at) > 0);

  const explainShare = () => {
    void loadPcShareFreeCost().then((cost) => Alert.alert('Partager sur mon PC', pcShareMessage(cost)));
  };

  const disconnect = (session: WebCompanionSession) => {
    Alert.alert(
      'Déconnecter cet ordinateur ?',
      `${label(session)} sera déconnecté de ton compte Loki Music.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: () => {
            setBusyId(session.id);
            void revokeWebCompanionSession(session.id)
              .then(() => refresh())
              .catch(() => Alert.alert('Ordinateurs connectés', 'Impossible de déconnecter cet ordinateur pour le moment.'))
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.share} onPress={explainShare} accessibilityRole="button" accessibilityLabel="Partager sur mon PC" testID="pc-share-button">
        <Text style={s.shareText}>🖥️ Partager sur mon PC · 24 h</Text>
      </TouchableOpacity>
      <Text style={s.title}>Ordinateurs connectés</Text>
      <Text style={s.help}>Les connexions ordinateur se font uniquement avec le QR Loki Music affiché sur le Web.</Text>
      {loading ? <Text style={s.muted}>Vérification…</Text> : active.length === 0 ? (
        <Text style={s.muted}>Aucun ordinateur connecté.</Text>
      ) : active.map((session) => (
        <View key={session.id} style={s.row}>
          <View style={s.info}>
            <Text style={s.device}>{label(session)}</Text>
            <Text style={s.muted}>Dernière activité : {new Date(session.last_seen_at).toLocaleString('fr-FR')} · déconnexion auto dans {pcShareHoursLeft(session.created_at)} h</Text>
          </View>
          <TouchableOpacity
            style={s.disconnect}
            onPress={() => disconnect(session)}
            disabled={busyId === session.id}
            accessibilityRole="button"
            accessibilityLabel={`Déconnecter ${label(session)}`}
          >
            <Text style={s.disconnectText}>{busyId === session.id ? '…' : 'Déconnecter'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.refresh} onPress={() => { void refresh(); }} accessibilityRole="button">
        <Text style={s.refreshText}>Actualiser</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  muted: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
  row: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, flexDirection: 'row', alignItems: 'center', gap: 10 },
  info: { flex: 1 },
  device: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  disconnect: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  disconnectText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  share: { minHeight: 46, marginBottom: 12, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  shareText: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  refresh: { minHeight: 38, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.primaryLight, fontSize: 12, fontWeight: '800' },
});
