import React from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { pcShareHoursLeft } from '../services/pcShareService';
import KeepModal from './KeepModal';
import { buildAffiliatedPublicProfileLink, shareProfileByEmail } from '../services/sharingService';
import { useUserStore } from '../store/useUserStore';

function label(session: WebCompanionSession) {
  return session.device_label || 'Ordinateur Loki';
}

export default function WebCompanionSessionsPanel({ buttonOnly = false }: { buttonOnly?: boolean } = {}) {
  const [sessions, setSessions] = React.useState<WebCompanionSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [destinationOpen, setDestinationOpen] = React.useState(false);
  const [destinationSessions, setDestinationSessions] = React.useState<WebCompanionSession[]>([]);
  const [destinationLoading, setDestinationLoading] = React.useState(false);
  const [destinationError, setDestinationError] = React.useState(false);
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

  // Le bouton compact doit aussi fonctionner sur un navigateur mobile ;
  // le panneau complet reste réservé à l'application native.
  // Son callback est déclaré avant le retour anticipé (pas de variable non initialisée).
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

  // Le QR autorise un ordinateur précis. WhatsApp et e-mail ne reçoivent jamais le QR :
  // ces canaux ne partagent que le lien public du profil.
  const sharePublicProfile = async (channel: 'WHATSAPP' | 'EMAIL') => {
    const username = String(useUserStore.getState().user?.username || '').replace(/^@+/, '').trim();
    if (!username) {
      Alert.alert('Partage public', 'Connecte-toi à ton profil Loki Music avant de le partager.');
      return;
    }
    try {
      if (channel === 'EMAIL') {
        await shareProfileByEmail(username);
      } else {
        const link = await buildAffiliatedPublicProfileLink(username);
        await Linking.openURL('https://api.whatsapp.com/send?text=' + encodeURIComponent('Découvre mon profil Loki Music : ' + link));
      }
      setDestinationOpen(false);
    } catch {
      Alert.alert('Partage public', 'Impossible d’ouvrir cette application. Réessaie depuis le partage de ton profil.');
    }
  };

  const explainShare = async () => {
    setDestinationOpen(true);
    setDestinationLoading(true);
    setDestinationError(false);
    try {
      const fresh = await listWebCompanionSessions();
      setSessions(fresh);
      setLoadError(false);
      setDestinationSessions(fresh.filter((session) => !session.revoked_at
        && pcShareHoursLeft(session.created_at) > 0
        && Date.now() - new Date(session.last_seen_at).getTime() < 60000));
    } catch {
      setDestinationSessions([]);
      setDestinationError(true);
      setLoadError(true);
    } finally {
      setDestinationLoading(false);
    }
  };

  const destinationModal = <KeepModal visible={destinationOpen} transparent animationType="fade" onRequestClose={() => setDestinationOpen(false)}>
    <View style={s.destinationBackdrop}>
      <View style={s.destinationCard}>
        <Text style={s.destinationTitle}>Où veux-tu partager ?</Text>
        <Text style={s.destinationHint}>Le QR connecte ton ordinateur. WhatsApp et e-mail partagent uniquement ton profil public.</Text>
        <Text style={s.destinationSection}>MES ORDINATEURS CONNECTÉS</Text>
        {destinationLoading ? <Text style={s.muted}>Recherche des ordinateurs autorisés…</Text> : destinationError ? (
          <Text style={s.error}>Impossible de vérifier les PC. Réessaie sans choisir un appareil au hasard.</Text>
        ) : destinationSessions.length ? destinationSessions.map((session, index) => (
          <TouchableOpacity key={session.id} style={s.destinationButton} disabled={sendingId !== null}
            accessibilityRole="button" accessibilityLabel={'Ouvrir sur ' + label(session)}
            onPress={() => { setDestinationOpen(false); const route = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null; void sendScreen(session, isPcTargetScreen(route) ? route : 'Profile'); }}>
            <Text style={s.destinationButtonText}>PC {index + 1} · {label(session)}</Text>
            <Text style={s.destinationSub}>En ligne · accès QR autorisé</Text>
          </TouchableOpacity>
        )) : <Text style={s.muted}>Aucun PC connecté en ligne. Ouvre Loki Music sur l’ordinateur et scanne son QR avec ton téléphone.</Text>}
        <Text style={s.destinationSection}>PARTAGER MON PROFIL PUBLIC</Text>
        <View style={s.destinationChannels}>
          <TouchableOpacity style={[s.destinationButton, s.destinationChannel]} accessibilityRole="button" onPress={() => { void sharePublicProfile('WHATSAPP'); }}><Text style={s.destinationButtonText}>WhatsApp</Text></TouchableOpacity>
          <TouchableOpacity style={[s.destinationButton, s.destinationChannel]} accessibilityRole="button" onPress={() => { void sharePublicProfile('EMAIL'); }}><Text style={s.destinationButtonText}>E-mail</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={s.destinationCancel} accessibilityRole="button" onPress={() => setDestinationOpen(false)}><Text style={s.destinationCancelText}>Annuler</Text></TouchableOpacity>
      </View>
    </View>
  </KeepModal>;

  if (buttonOnly) return <>
    <TouchableOpacity style={s.quickShare} onPress={() => { void explainShare(); }} accessibilityRole="button"
      accessibilityLabel="Choisir un ordinateur, WhatsApp ou e-mail" testID="home-transfer-to-pc">
      <Text style={s.quickShareText}>PC ↗ Transférer ou partager</Text>
    </TouchableOpacity>
    {destinationModal}
  </>;
  if (Platform.OS === 'web') return null;

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
      {destinationModal}
      <TouchableOpacity style={s.refresh} onPress={() => { void refresh(); }} accessibilityRole="button">
        <Text style={s.refreshText}>Actualiser</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  destinationBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.8)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  destinationCard: { width: '100%', maxWidth: 470, maxHeight: '90%', backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primary, borderRadius: 22, padding: 18, gap: 10 },
  destinationTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  destinationHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  destinationSection: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', marginTop: 7 },
  destinationButton: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center' },
  destinationButtonText: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  destinationSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  destinationChannels: { flexDirection: 'row', gap: 8 },
  destinationChannel: { flex: 1, alignItems: 'center' },
  destinationCancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  destinationCancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
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
