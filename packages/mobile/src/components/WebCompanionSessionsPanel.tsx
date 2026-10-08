import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import {
  listWebCompanionSessions,
  revokeWebCompanionSession,
  sendDesktopLinkEmail,
  WebCompanionSession,
} from '../services/webPairingService';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';

function label(session: WebCompanionSession) {
  return session.device_label || 'Ordinateur Loki';
}

export default function WebCompanionSessionsPanel({ showEmailLink = false }: { showEmailLink?: boolean }) {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const authenticated = Boolean(user && !isLocalGuest && !isDemoMode);
  const [sessions, setSessions] = React.useState<WebCompanionSession[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(false);
  const requestRef = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!authenticated) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(false);
    try {
      const result = await listWebCompanionSessions();
      if (request === requestRef.current) setSessions(result);
    } catch {
      if (request === requestRef.current) setError(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [authenticated, user?.id]);

  React.useEffect(() => {
    setSessions([]);
    if (authenticated) void refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  const sendLink = async () => {
    if (sending || !authenticated) return;
    setSending(true);
    try {
      await sendDesktopLinkEmail();
      Alert.alert('Lien envoyé', 'Ouvre l’e-mail sur ton ordinateur, puis scanne le QR et confirme sur ton téléphone.');
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      Alert.alert('Connexion ordinateur', code === 'verified_email_required'
        ? 'Ajoute et vérifie ton adresse e-mail dans les réglages du profil.'
        : code === 'email_rate_limited'
          ? 'Un lien vient déjà d’être demandé. Réessaie dans une minute.'
          : 'Impossible d’envoyer le lien pour le moment. Réessaie plus tard.');
    } finally {
      setSending(false);
    }
  };

  if (!authenticated) return (
    <View style={s.wrap}>
      <Text style={s.title}>Ordinateur</Text>
      <TouchableOpacity style={s.email} onPress={() => useAccountGateStore.getState().requestAccount('login')} accessibilityRole="button">
        <Text style={s.emailText}>Me connecter pour autoriser un ordinateur</Text>
      </TouchableOpacity>
    </View>
  );

  const active = sessions.filter((s) => !s.revoked_at);

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
              .then((revoked) => {
                if (!revoked) throw new Error('session_not_revoked');
                return refresh();
              })
              .catch(() => Alert.alert('Ordinateurs connectés', 'Impossible de déconnecter cet ordinateur pour le moment.'))
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  return (
    <View style={s.wrap}>
      {showEmailLink ? <>
        <Text style={s.title}>Ordinateur</Text>
        <TouchableOpacity style={s.email} onPress={() => { void sendLink(); }} disabled={sending} accessibilityRole="button" accessibilityLabel="M’envoyer le lien">
          <Text style={s.emailText}>{sending ? 'Envoi…' : 'M’envoyer le lien'}</Text>
        </TouchableOpacity>
        <Text style={s.help}>Ouvre l’e-mail sur l’ordinateur, scanne le QR puis confirme sur ton téléphone.</Text>
      </> : null}
      <Text style={s.title}>Ordinateurs connectés</Text>
      {loading ? <Text style={s.muted}>Vérification…</Text> : error ? (
        <Text style={s.muted}>Liste indisponible. Réessaie avec Actualiser.</Text>
      ) : active.length === 0 ? (
        <Text style={s.muted}>Aucun ordinateur connecté.</Text>
      ) : active.map((session) => (
        <View key={session.id} style={s.row}>
          <View style={s.info}>
            <Text style={s.device}>{label(session)}</Text>
            <Text style={s.muted}>Dernière activité : {new Date(session.last_seen_at).toLocaleString('fr-FR')}</Text>
          </View>
          <TouchableOpacity
            style={s.disconnect}
            onPress={() => disconnect(session)}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Déconnecter ${label(session)}`}
          >
            <Text style={s.disconnectText}>{busyId === session.id ? '…' : 'Déconnecter'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={s.refresh} onPress={() => { void refresh(); }} disabled={loading || busyId !== null} accessibilityRole="button">
        <Text style={s.refreshText}>Actualiser</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  help: { color: colors.textPrimary, fontSize: 12, lineHeight: 17, marginVertical: 10 },
  muted: { color: colors.textPrimary, fontSize: 11, marginTop: 7 },
  email: { minHeight: 48, marginTop: 12, borderRadius: 24, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  emailText: { color: colors.white, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  row: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, flexDirection: 'row', alignItems: 'center', gap: 10 },
  info: { flex: 1 },
  device: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  disconnect: { minHeight: 48, paddingHorizontal: 12, borderRadius: 24, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  disconnectText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  refresh: { minHeight: 48, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: colors.primaryLight, fontSize: 12, fontWeight: '800' },
});
