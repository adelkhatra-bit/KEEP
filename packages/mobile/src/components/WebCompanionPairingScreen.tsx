import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../theme/colors';
import { designProfileForWidth } from '../theme/designProfile';
import {
  claimDesktopPairing,
  clearDesktopChallenge,
  createDesktopPairing,
  DesktopPairingChallenge,
  loadDesktopChallenge,
  rememberPendingWebPairing,
  saveDesktopChallenge,
} from '../services/webPairingService';

/** Taille du QR selon la hauteur réellement visible (Adel 10/10/2026 : « l'écran est coupé, fais le QR plus petit »). */
export function pairingQrSize(windowHeight: number, pageZoom = 1): number {
  const visible = windowHeight / Math.max(1, pageZoom);
  return Math.max(120, Math.min(220, Math.round(visible - 420)));
}

function currentHash(): string {
  try { return String(window.location.hash || ''); } catch { return ''; }
}

/** Lien magique refusé (expiré / déjà utilisé) : Supabase revient avec `#error=…&error_code=otp_expired` (Adel 10/10/2026, photo PC). */
export function readLinkMessage(hash: string): string | null {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;
  return code === 'otp_expired' || code === 'access_denied'
    ? 'Le lien de connexion a expiré ou a déjà servi. Scanne le nouveau QR avec ton téléphone.'
    : 'La connexion de cet ordinateur a échoué. Scanne le nouveau QR avec ton téléphone.';
}

// Une seule création de QR à la fois (le double rendu de React créait 2 jumelages à 3 s d'écart).
let inflightCreate: Promise<DesktopPairingChallenge> | null = null;
function createOnce(): Promise<DesktopPairingChallenge> {
  if (!inflightCreate) inflightCreate = createDesktopPairing().finally(() => { inflightCreate = null; });
  return inflightCreate;
}

export default function WebCompanionPairingScreen() {
  const { width, height } = useWindowDimensions();
  const qrSize = pairingQrSize(height, designProfileForWidth(width).pageZoom);
  const [challenge, setChallenge] = React.useState<DesktopPairingChallenge | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('Préparation de la connexion…');
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  // Affichage seulement : l'adresse ne pilote AUCUNE action de sécurité. Elle est lue une fois, puis nettoyée sans condition.
  const linkErrorRef = React.useRef<string | null>(readLinkMessage(currentHash()));
  React.useEffect(() => {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sans effet */ }
  }, []);

  const create = React.useCallback(async (forceNew = true) => {
    setLoading(true);
    setMessage('Préparation de la connexion…');
    try {
      // Après un rechargement de la page, on reprend le MÊME QR (déjà scanné ou en cours) au lieu d'en créer un autre.
      const saved = forceNew ? null : loadDesktopChallenge();
      const next = saved ?? await createOnce();
      if (!saved) saveDesktopChallenge(next);
      setChallenge(next);
      setSecondsLeft(Math.max(0, Math.ceil((new Date(next.expiresAt).getTime() - Date.now()) / 1000)));
      setMessage(linkErrorRef.current ?? 'Scanne ce QR code avec ton téléphone connecté à Loki Music.');
    } catch {
      setChallenge(null);
      setMessage('Impossible de créer le QR pour le moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void create(false);
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
        // Une requête qui ne répond jamais ne doit pas arrêter la vérification du téléphone : délai max 8 s, puis on réessaie.
        const result = await Promise.race([
          claimDesktopPairing(challenge.pairingId, challenge.token),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('claim_timeout')), 8000)),
        ]);
        if (!active) return;
        if (result.status === 'CANCELLED') {
          setMessage('Connexion refusée sur le téléphone.');
          setSecondsLeft(0);
          return;
        }
        if (result.status === 'APPROVED' && result.actionLink) {
          rememberPendingWebPairing(challenge.pairingId, challenge.token);
          clearDesktopChallenge();
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
    <ScrollView style={s.scroll} contentContainerStyle={s.container} testID="loki-web-companion-pairing" showsVerticalScrollIndicator={false}>
      <View style={s.card}>
        <Text style={s.logo}>Loki Music</Text>
        <Text style={s.title}>Connexion ordinateur</Text>
        <Text style={s.body}>Ouvre Loki Music sur ton téléphone déjà connecté, puis scanne ce QR code.</Text>

        <View style={[s.qrBox, { width: qrSize + 32, height: qrSize + 32 }]}>
          {loading ? <ActivityIndicator color={colors.primaryLight} size="large" /> : locked ? (
            <Text style={s.error} testID="loki-web-qr-locked">QR expiré — non scannable</Text>
          ) : challenge ? (
            <QRCode value={challenge.qrUrl} size={qrSize} backgroundColor="#FFFFFF" color="#000000" />
          ) : <Text style={s.error}>QR indisponible</Text>}
        </View>

        <Text style={s.status}>{message}</Text>
        {challenge && secondsLeft > 0 ? <Text style={s.timer}>Valable encore {secondsLeft} s</Text> : null}

        {!loading && (!challenge || secondsLeft <= 0) ? (
          <TouchableOpacity style={s.button} onPress={() => { void create(true); }} accessibilityRole="button" accessibilityLabel="Rafraîchir le QR">
            <Text style={s.buttonText}>RAFRAÎCHIR LE QR</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={s.foot}>Aucune création de compte sur ordinateur. La connexion est autorisée depuis ton téléphone.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 520, alignItems: 'center', borderRadius: 28, paddingHorizontal: 24, paddingVertical: 20, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  logo: { color: colors.primaryLight, fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 12, color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  body: { marginTop: 10, color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  qrBox: { marginTop: 16, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 16 },
  status: { marginTop: 18, color: colors.textPrimary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  timer: { marginTop: 6, color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, fontWeight: '800' },
  button: { marginTop: 18, minHeight: 46, paddingHorizontal: 24, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  buttonText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  foot: { marginTop: 20, color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
