import React from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { navigationRef } from '../navigation/navigationRef';
import {
  listWebCompanionSessions,
  revokeWebCompanionSession,
  WebCompanionSession,
  PC_TARGET_SCREENS,
  PcTargetScreen,
  isPcTargetScreen,
  requestWebCompanionScreen,
} from '../services/webPairingService';
import { loadPcShareFreeCost, pcShareHoursLeft, pcShareMessage } from '../services/pcShareService';

function label(session: WebCompanionSession) {
  return session.device_label || 'Ordinateur Loki';
}

export default function WebCompanionSessionsPanel({ buttonOnly = false }: { buttonOnly?: boolean } = {}) {
  const [sessions, setSessions] = React.useState<WebCompanionSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (Platform.OS === 'web' || buttonOnly) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [buttonOnly]);

  const refresh = React.useCallback(async () => {
    if (Platform.OS === 'web' || buttonOnly) return;
    setLoading(true);
    try {
      setSessions(await listWebCompanionSessions());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [buttonOnly]);

  React.useEffect(() => {
    if (Platform.OS === 'web' || buttonOnly) return;
    void refresh();
    // Les sessions PC peuvent être approuvées ou révoquées sur un autre appareil.
    // Les actualiser aussi au retour de l'application évite un état périmé.
    const interval = setInterval(() => { void refresh(); }, 30000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, [refresh, buttonOnly]);

  if (Platform.OS === 'web') return null;

  if (buttonOnly) return (
    <TouchableOpacity style={s.quickShare} onPress={() => { void explainShare(); }} accessibilityRole="button"
      accessibilityLabel="Transférer l'écran Loki sur mon ordinateur connecté" testID="home-transfer-to-pc">
      <Text style={s.quickShareText}>PC ↗ Transférer sur mon ordinateur</Text>
    </TouchableOpacity>
  );

  const active = sessions.filter((s) => !s.revoked_at && pcShareHoursLeft(s.created_at, now) > 0);

  const timeLeft = (createdAt: string) => {
    const seconds = Math.max(0, Math.ceil((new Date(createdAt).getTime() + 24 * 3600000 - now) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const sendScreen = async (session: WebCompanionSession, screen: PcTargetScreen) => {
    if (sendingId) return;
    setSendingId(session.id);
    try {
      await requestWebCompanionScreen(session.id, screen);
      const title = PC_TARGET_SCREENS.find((item) => item.name === screen)?.label ?? screen;
      Alert.alert('Partager sur mon PC', title + ' : ouverture demandée sur cet ordinateur.');
    } catch {
      Alert.alert('Partager sur mon PC', 'Envoi impossible. Vérifie que ton ordinateur est toujours connecté, puis réessaie.');
    } finally {
      setSendingId(null);
    }
  };

  const explainShare = async () => {
    try {
      const fresh = await listWebCompanionSessions();
      setSessions(fresh);
      setLoadError(false);
      const online = fresh.filter((s) => !s.revoked_at && pcShareHoursLeft(s.created_at, now) > 0
        && Date.now() - new Date(s.last_seen_at).getTime() < 60000);
      if (online.length === 1) {
        const route = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null;
        await sendScreen(online[0], isPcTargetScreen(route) ? route : 'Profile');
        return;
      }
      if (online.length > 1) {
        Alert.alert('Partager sur mon PC', 'Choisis un ordinateur et un onglet dans la liste ci-dessous.');
        return;
      }
      const cost = await loadPcShareFreeCost();
      Alert.alert('Partager sur mon PC', pcShareMessage(cost));
    } catch {
      setLoadError(true);
      Alert.alert('Partager sur mon PC', 'Impossible de vérifier la connexion à l’ordinateur pour le moment.');
    }
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
      <TouchableOpacity style={s.share} onPress={() => { void explainShare(); }} accessibilityRole="button" accessibilityLabel="Partager sur mon PC" testID="pc-share-button">
        <Text style={s.shareText}>🖥️ Partager sur mon PC · 24 h</Text>
      </TouchableOpacity>
      <Text style={s.title}>Ordinateurs connectés</Text>
      <Text style={s.help}>Les connexions ordinateur se font uniquement avec le QR Loki Music affiché sur le Web.</Text>
      {loadError ? <Text style={s.error}>État du PC indisponible — impossible de vérifier la connexion.</Text> : null}
      {loading ? <Text style={s.muted}>Vérification…</Text> : !loadError && active.length === 0 ? (
        <Text style={s.muted}>Aucun ordinateur connecté.</Text>
      ) : active.map((session) => (
        <View key={session.id}>
        <View style={s.row}>
          <View style={s.info}>
            <Text style={s.device}>{label(session)}</Text>
            <Text style={s.muted}>{now - new Date(session.last_seen_at).getTime() < 60000 ? 'En ligne' : 'Hors ligne'} · Dernière activité : {new Date(session.last_seen_at).toLocaleString('fr-FR')}</Text>
            <Text style={s.muted}>Déconnexion automatique dans {timeLeft(session.created_at)}</Text>
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
        <View style={s.targets}>
          {PC_TARGET_SCREENS.map((item) => (
            <TouchableOpacity key={item.name} style={s.target} disabled={sendingId !== null}
              onPress={() => { void sendScreen(session, item.name); }}
              accessibilityRole="button"
              accessibilityLabel={'Afficher ' + item.label + ' sur ' + label(session)}>
              <Text style={s.targetText}>{sendingId === session.id ? 'Envoi…' : item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
  error: { color: colors.danger, fontSize: 12, marginTop: 7 },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  target: { minHeight: 48, paddingHorizontal: 11, borderRadius: 19, borderWidth: 1, borderColor: colors.primary, justifyContent: 'center' },
  targetText: { color: colors.textPrimary, fontSize: 11, fontWeight: '800' },
  row: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, flexDirection: 'row', alignItems: 'center', gap: 10 },
  info: { flex: 1 },
  device: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  disconnect: { minHeight: 48, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  disconnectText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  quickShare: { alignSelf: 'center', minHeight: 44, maxWidth: '100%', paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,92,252,.18)', borderWidth: 1, borderColor: colors.primary },
  quickShareText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  share: { minHeight: 48, marginBottom: 12, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  shareText: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  refresh: { minHeight: 48, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.primaryLight, fontSize: 12, fontWeight: '800' },
});
