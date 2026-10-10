import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../theme/colors';
import {
  claimDesktopPairing,
  createDesktopPairing,
  DesktopPairingChallenge,
  rememberPendingWebPairing,
} from '../services/webPairingService';

export default function WebCompanionPairingScreen() {
  const [challenge, setChallenge] = React.useState<DesktopPairingChallenge | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('Préparation de la connexion…');
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  const create = React.useCallback(async () => {
    setLoading(true);
    setMessage('Préparation de la connexion…');
    try {
      const next = await createDesktopPairing();
      setChallenge(next);
      setSecondsLeft(Math.max(0, Math.ceil((new Date(next.expiresAt).getTime() - Date.now()) / 1000)));
      setMessage('Scanne ce QR code avec ton téléphone connecté à Loki Music.');
    } catch {
      setChallenge(null);
      setMessage('Impossible de créer le QR pour le moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void create();
  }, [create]);

  React.useEffect(() => {
    if (!challenge) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!active) return;
      const remaining = Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setMessage('Ce QR code a expiré. Appuie sur « Rafraîchir le QR » pour en obtenir un nouveau.');
        return;
      }
      try {
        const result = await claimDesktopPairing(challenge.pairingId, challenge.token);
        if (!active) return;
        if (result.status === 'CANCELLED') {
          setMessage('Connexion refusée sur le téléphone.');
          setSecondsLeft(0);
          return;
        }
        if (result.status === 'APPROVED' && result.actionLink) {
          rememberPendingWebPairing(challenge.pairingId, challenge.token);
          setMessage('Téléphone validé. Connexion de cet ordinateur…');
          window.location.assign(result.actionLink);
          return;
        }
      } catch {
        // Une coupure réseau ne détruit pas le QR : on retente tant qu'il est valide.
      }
      timer = setTimeout(() => { void tick(); }, 2500);
    };

    timer = setTimeout(() => { void tick(); }, 700);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [challenge]);

  const locked = !loading && (!challenge || secondsLeft <= 0);

  return (
    <View style={s.container} testID="loki-web-companion-pairing">
      <View style={s.card}>
        <Text style={s.logo}>Loki Music</Text>
        <Text style={s.title}>Connexion ordinateur</Text>
        <Text style={s.body}>Ouvre Loki Music sur ton téléphone déjà connecté, puis scanne ce QR code.</Text>

        <View style={s.qrBox}>
          {loading ? <ActivityIndicator color={colors.primaryLight} size="large" /> : locked ? (
            <Text style={s.error} testID="loki-web-qr-locked">QR expiré — non scannable</Text>
          ) : challenge ? (
            <QRCode value={challenge.qrUrl} size={220} backgroundColor="#FFFFFF" color="#000000" />
          ) : <Text style={s.error}>QR indisponible</Text>}
        </View>

        <Text style={s.status}>{message}</Text>
        {challenge && secondsLeft > 0 ? <Text style={s.timer}>Valable encore {secondsLeft} s</Text> : null}

        {!loading && (!challenge || secondsLeft <= 0) ? (
          <TouchableOpacity style={s.button} onPress={() => { void create(); }} accessibilityRole="button" accessibilityLabel="Rafraîchir le QR">
            <Text style={s.buttonText}>RAFRAÎCHIR LE QR</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={s.foot}>Aucune création de compte sur ordinateur. La connexion est autorisée depuis ton téléphone.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, minHeight: '100vh' as any, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 520, alignItems: 'center', borderRadius: 28, paddingHorizontal: 28, paddingVertical: 32, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  logo: { color: colors.primaryLight, fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 12, color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  body: { marginTop: 10, color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  qrBox: { width: 252, height: 252, marginTop: 24, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 16 },
  status: { marginTop: 18, color: colors.textPrimary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  timer: { marginTop: 6, color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, fontWeight: '800' },
  button: { marginTop: 18, minHeight: 46, paddingHorizontal: 24, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  buttonText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  foot: { marginTop: 20, color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
