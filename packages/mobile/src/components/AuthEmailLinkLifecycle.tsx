import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { consumeWebAuthAndOpenNative, subscribeToNativeAuthLinks } from '../services/authLinkHandoff';
import { supabase } from '../services/supabaseClient';
import { createAuthService } from '../services/authService';
import { colors } from '../theme/colors';

/**
 * Consomme les liens e-mail Supabase sans introduire une nouvelle navigation.
 * Le composant ne rend rien : il s'occupe uniquement du handoff sécurisé
 * Web <-> app native et laisse les stores/auth listeners existants réagir à la
 * session Supabase réellement créée.
 */
export default function AuthEmailLinkLifecycle() {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return undefined;

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryOpen(true);
    });

    if (Platform.OS === 'web') {
      const recoveryLink = typeof window !== 'undefined'
        && (window.location.href.includes('type=recovery') || window.location.href.includes('keep_auth=recovery'));
      void consumeWebAuthAndOpenNative(supabase).then((consumed) => {
        if (consumed && recoveryLink) setRecoveryOpen(true);
      }).catch(() => {
        // Une URL expirée ne doit pas mettre Loki en écran blanc. L'utilisateur
        // reste sur l'app et peut demander un nouveau lien depuis Connexion.
      });
      return () => authListener.subscription.unsubscribe();
    }

    const unsubscribeLinks = subscribeToNativeAuthLinks(
      supabase,
      (type) => { if (type === 'recovery') setRecoveryOpen(true); },
      () => {
        // Même règle côté natif : le lien peut être redemandé sans casser l'app.
      },
    );
    return () => {
      unsubscribeLinks();
      authListener.subscription.unsubscribe();
    };
  }, []);

  const savePassword = async () => {
    if (!supabase) return;
    if (password.length < 10) return setError('Utilise au moins 10 caractères.');
    if (password !== confirmation) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError('');
    try {
      const result = await createAuthService(supabase).updatePassword(password);
      if (result.error) return setError('Impossible de modifier le mot de passe. Demande un nouveau lien.');
      setRecoveryOpen(false);
      setPassword('');
      setConfirmation('');
    } finally {
      setBusy(false);
    }
  };

  return <Modal visible={recoveryOpen} transparent animationType="fade" onRequestClose={() => setRecoveryOpen(false)}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>Nouveau mot de passe Loki</Text>
        <Text style={styles.subtitle}>Choisis au moins 10 caractères. Ce nouveau mot de passe remplacera immédiatement l’ancien.</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Nouveau mot de passe" placeholderTextColor={colors.textMuted} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <TextInput style={styles.input} value={confirmation} onChangeText={setConfirmation} placeholder="Confirmer le mot de passe" placeholderTextColor={colors.textMuted} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={savePassword} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.primary} onPress={savePassword} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>ENREGISTRER LE NOUVEAU MOT DE PASSE</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={() => setRecoveryOpen(false)} disabled={busy}><Text style={styles.cancelText}>Plus tard</Text></TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 430, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, padding: 20, gap: 12 },
  title: { color: colors.textPrimary, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, paddingHorizontal: 14, fontSize: 15 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  primary: { minHeight: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  cancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
});
