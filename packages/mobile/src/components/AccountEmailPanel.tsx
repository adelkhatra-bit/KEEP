import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import {
  confirmAccountEmailVerification,
  getAccountEmailStatus,
  requestAccountEmailVerification,
  AccountEmailStatus,
} from '../services/accountEmailService';

export default function AccountEmailPanel({ enabled, username }: { enabled: boolean; username: string }) {
  const [status, setStatus] = React.useState<AccountEmailStatus | null>(null);
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [codeSent, setCodeSent] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const next = await getAccountEmailStatus();
      setStatus(next);
      if (next.email) setEmail(next.email);
      setCodeSent(Boolean(next.pendingEmailHint && !next.emailVerified));
    } catch { }
    finally { setLoading(false); }
  }, [enabled]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const sendCode = async () => {
    if (!email.trim()) return void Alert.alert('Adresse e-mail', 'Saisis une adresse e-mail.');
    setBusy(true);
    try {
      const result = await requestAccountEmailVerification(email);
      setCodeSent(true);
      setCode('');
      await refresh();
      Alert.alert('Code envoyé', `KEEP a envoyé un code à ${result.emailHint}. Il expire dans 10 minutes.`);
    } catch (e: any) {
      Alert.alert('Validation e-mail', e?.message || 'Impossible d’envoyer le code.');
    } finally { setBusy(false); }
  };

  const confirmCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) return void Alert.alert('Code', 'Saisis le code à 6 chiffres reçu par e-mail.');
    setBusy(true);
    try {
      const next = await confirmAccountEmailVerification(email, code);
      setStatus(next);
      setCodeSent(false);
      setCode('');
      Alert.alert('Adresse validée', `Tu peux maintenant te connecter à KEEP avec @${username} ou ${next.email}.`);
    } catch (e: any) {
      Alert.alert('Validation e-mail', e?.message || 'Impossible de valider ce code.');
    } finally { setBusy(false); }
  };

  if (!enabled) {
    return <View style={s.card}>
      <Text style={s.title}>Sécurité du compte</Text>
      <Text style={s.help}>Crée ou connecte ton compte KEEP pour ajouter une adresse e-mail de récupération facultative.</Text>
    </View>;
  }

  const verified = Boolean(status?.emailVerified && status?.email);
  return <View style={s.card}>
    <View style={s.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Sécurité du compte</Text>
        <Text style={s.help}>Ton pseudo reste ton identité publique. L’e-mail est privé et facultatif : il sert à la connexion et à la récupération du compte.</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.primaryLight} size="small" /> : null}
    </View>

    {verified ? <View style={s.verifiedBox}>
      <Text style={s.verifiedTitle}>✓ Adresse e-mail validée</Text>
      <Text style={s.verifiedEmail}>{status?.email}</Text>
      <Text style={s.help}>Connexion possible avec @${username} ou cette adresse e-mail, avec le même mot de passe.</Text>
    </View> : null}

    <Text style={s.label}>{verified ? 'Changer l’adresse e-mail' : 'Adresse e-mail de récupération'}</Text>
    <TextInput
      style={s.input}
      value={email}
      onChangeText={(value) => { setEmail(value); setCodeSent(false); setCode(''); }}
      placeholder="nom@exemple.com"
      placeholderTextColor={colors.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      autoComplete="email"
    />
    <TouchableOpacity style={s.primary} onPress={sendCode} disabled={busy || loading} accessibilityRole="button" accessibilityLabel="Envoyer l’e-mail de validation">
      <Text style={s.primaryText}>{busy ? 'Envoi…' : 'Envoyer l’e-mail de validation'}</Text>
    </TouchableOpacity>

    {(codeSent || status?.pendingEmailHint) ? <View style={s.codeArea}>
      <Text style={s.pending}>Code envoyé{status?.pendingEmailHint ? ` à ${status.pendingEmailHint}` : ''}</Text>
      <TextInput
        style={[s.input, s.codeInput]}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={6}
      />
      <TouchableOpacity style={s.secondary} onPress={confirmCode} disabled={busy || code.length !== 6} accessibilityRole="button" accessibilityLabel="Valider le code e-mail">
        <Text style={s.secondaryText}>Valider le code</Text>
      </TouchableOpacity>
    </View> : null}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  help: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  verifiedBox: { marginTop: 12, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: colors.backgroundElevated, borderRadius: radius.md, padding: 11 },
  verifiedTitle: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  verifiedEmail: { color: colors.textPrimary, fontSize: 12, fontWeight: '800', marginTop: 4, marginBottom: 3 },
  label: { color: colors.textPrimary, fontSize: 12, fontWeight: '900', marginTop: 13, marginBottom: 7 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.textPrimary, backgroundColor: colors.background },
  primary: { minHeight: 42, marginTop: 9, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  codeArea: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  pending: { color: colors.primaryLight, fontSize: 10, fontWeight: '800', marginBottom: 7 },
  codeInput: { textAlign: 'center', fontSize: 20, fontWeight: '900', letterSpacing: 6 },
  secondary: { minHeight: 40, marginTop: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
});
