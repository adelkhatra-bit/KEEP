import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { ensureAuthAutofillStyleInjected } from '../utils/webAutofillFix';
import { createAuthService } from '../services/authService';
import {
  clearStagedGuestMusic,
  stageGuestProfileForUpgrade,
} from '../services/guestUpgradeService';
import { importStagedGuestCreditsForAuthenticatedAccount, stageLocalGuestCreditsForUpgrade } from '../services/creditService';
import { supabase } from '../services/supabaseClient';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

// Source-of-truth auth Loki (Adel, 24/08/2026) : pseudo + mot de passe +
// e-mail vérifié sont tous les trois obligatoires à la création, pour que
// "mot de passe oublié" fonctionne toujours. La connexion, elle, accepte
// toujours pseudo OU e-mail -- ne casse pas les anciens comptes pseudo-only.
export type UsernameAccountMode = 'create' | 'login';

type Props = {
  initialMode?: UsernameAccountMode;
  followUsername?: string;
  onSuccess?: () => void;
};

function errorText(code: string) {
  if (code === 'invalid_username') return 'Ce pseudo Loki Music ne peut pas être utilisé.';
  if (code === 'invalid_password') return 'Choisis un autre mot de passe.';
  if (code === 'invalid_email') return 'Cette adresse e-mail n’est pas valide.';
  if (code === 'email_taken') return 'Cette adresse e-mail est déjà utilisée par un autre compte Loki Music.';
  if (code === 'rate_limited') return 'Trop de demandes rapprochées. Attends un instant puis réessaie.';
  if (code === 'email_link_invalid') return 'Ce lien e-mail est expiré ou invalide. Demande un nouveau lien.';
  if (code === 'username_taken') return 'Ce pseudo Loki Music est déjà utilisé. Choisis-en un autre.';
  if (code === 'username_conflict') return 'Ce pseudo existe plusieurs fois dans les anciennes données. Le support Loki Music doit le régulariser.';
  if (code === 'account_not_created') return 'Ce profil existe, mais aucun accès par mot de passe n’est encore activé.';
  if (code === 'legacy_profile_requires_original_device') return 'Cet ancien profil doit être récupéré depuis son appareil d’origine ou par le Super Admin Loki Music.';
  if (code === 'invalid_credentials') return 'Identifiant Loki Music, e-mail ou mot de passe incorrect.';
  if (code === 'email_confirmation_required_config') return 'Configuration e-mail Loki Music indisponible pour le moment. Réessaie plus tard.';
  if (code === 'email_delivery_unavailable') return 'L’envoi de l’e-mail de confirmation est momentanément indisponible (ton adresse n’est pas en cause). Réessaie dans quelques minutes.';
  return 'Connexion Loki Music indisponible pour le moment. Réessaie dans un instant.';
}

function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

function generateKeepPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  const cryptoApi = (globalThis as any)?.crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  let body = '';
  for (let i = 0; i < bytes.length; i += 1) body += alphabet[bytes[i] % alphabet.length];
  return `K!${body}7`;
}

function cleanUsername(value: string) {
  return value.trim().replace(/^@+/, '').normalize('NFKC');
}

function isValidUsername(value: string) {
  return value.length >= 1 && value.length <= 30 && /^[\p{L}\p{N}._-]+$/u.test(value);
}

function passwordStrength(value: string) {
  if (!value) return 0;
  let score = value.length >= 6 ? 1 : 0;
  if (value.length >= 10) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

export default function UsernameAccountForm({ initialMode = 'create', followUsername = '', onSuccess }: Props) {
  const currentUser = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const initialUsername = isLocalGuest && currentUser?.username && !/^invite-/i.test(currentUser.username)
    ? cleanUsername(currentUser.username)
    : '';

  const [mode, setMode] = useState<UsernameAccountMode>(initialMode);
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [busy, setBusy] = useState(false);
  // Adel : e-mail obligatoire à la création (24/08/2026) pour que "mot de
  // passe oublié" fonctionne toujours -- un compte pseudo-only recevait un
  // e-mail interne @keep.local que la récupération refuse explicitement.
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [error, setError] = useState('');
  const [passwordSuggested, setPasswordSuggested] = useState(false);
  // Maquette validée (22/09/2026) : les hints longs sous Pseudo/E-mail
  // deviennent des tooltips ⓘ au tap au lieu d'un paragraphe toujours
  // visible -- le texte n'est pas supprimé, seulement replié par défaut.
  const [openTip, setOpenTip] = useState<'username' | 'email' | null>(null);
  const strength = useMemo(() => passwordStrength(password), [password]);
  const strengthLabel = strength <= 1 ? 'Faible' : strength === 2 ? 'Correct' : strength === 3 ? 'Bon' : 'Très bon';
  const strengthGood = strength >= 3;

  // Corrige le fond jaune du remplissage automatique sur le web (thème sombre).
  useEffect(() => { ensureAuthAutofillStyleInjected(); }, []);

  const applyFollowIntent = async () => {
    if (!supabase || !followUsername) return true;
    const { data: targets, error: targetError } = await supabase
      .from('profiles')
      .select('id,username')
      .ilike('username', cleanUsername(followUsername))
      .eq('is_public', true)
      .limit(1);
    if (targetError || !targets?.[0]) return false;
    const { error: followError } = await supabase.rpc('keep_follow_profile', { p_followee_id: String(targets[0].id) });
    return !followError;
  };

  const suggestPassword = () => {
    const value = generateKeepPassword();
    setPassword(value);
    setPassword2(value);
    setShowPassword(true);
    setShowPassword2(true);
    setPasswordSuggested(true);
    setError('');
  };

  const finishAuthenticatedFlow = async () => {
    await importStagedGuestCreditsForAuthenticatedAccount().catch(() => null);

    // Isolation stricte : une identité authentifiée ne récupère jamais les morceaux
    // d'un essai/d'une autre identité locale. Le serveur applique la même règle.
    useSessionHistoryStore.getState().clearSessions();
    await clearStagedGuestMusic().catch(() => {});
    await useSessionHistoryStore.getState().refreshCreditLocks().catch(() => {});

    const followed = await applyFollowIntent();
    if (followUsername) {
      Alert.alert(
        'Compte Loki Music prêt',
        followed
          ? `Tu es maintenant abonné(e) à ${cleanUsername(followUsername)}.`
          : `Ton compte est connecté. Ouvre ${cleanUsername(followUsername)} pour terminer le suivi.`,
      );
    }
    onSuccess?.();
  };

  const submit = async () => {
    if (!supabase) return setError('Connexion Loki Music indisponible pour le moment.');
    const identity = username.trim();
    const normalizedUsername = cleanUsername(identity);
    const loginByEmail = mode === 'login' && identity.includes('@');

    if (mode === 'create' && !isValidUsername(normalizedUsername)) return setError(errorText('invalid_username'));
    if (mode === 'create' && !isValidEmail(email)) return setError(errorText('invalid_email'));
    if (mode === 'login' && !loginByEmail && !isValidUsername(normalizedUsername)) return setError(errorText('invalid_username'));
    if (password.length < 6) return setError(errorText('invalid_password'));
    if (mode === 'create' && password !== password2) return setError('Les deux mots de passe ne correspondent pas.');

    setBusy(true);
    setError('');
    try {
      if (mode === 'create' && isLocalGuest && currentUser) {
        await Promise.all([
          stageGuestProfileForUpgrade({ ...currentUser, username: normalizedUsername }),
          stageLocalGuestCreditsForUpgrade(),
        ]);
      }

      const auth = createAuthService(supabase);
      const result = mode === 'create'
        ? await auth.signUpWithEmailIdentity(email.trim(), normalizedUsername, password, followUsername)
        : loginByEmail
          ? await auth.signInWithEmailIdentity(identity, password)
          : await auth.signInWithUsername(normalizedUsername, password);
      if (result.error) return setError(errorText(result.error));
      if (mode === 'create' && result.requiresEmailConfirmation) {
        setPendingConfirmationEmail(email.trim());
        return;
      }
      await finishAuthenticatedFlow();
    } catch {
      setError('Connexion Loki Music indisponible pour le moment. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  const resendConfirmation = async () => {
    if (!supabase || !pendingConfirmationEmail) return;
    setBusy(true);
    setError('');
    try {
      const result = await createAuthService(supabase).resendSignupConfirmation(pendingConfirmationEmail);
      if (result.error) return setError(errorText(result.error));
      Alert.alert('E-mail renvoyé', `Un nouveau lien de confirmation a été envoyé à ${pendingConfirmationEmail}.`);
    } catch {
      setError('Impossible de renvoyer l’e-mail pour le moment. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  const requestRecoveryLink = async () => {
    if (!supabase) return setError('Connexion Loki Music indisponible pour le moment.');
    const email = username.trim().toLowerCase();
    if (!email.includes('@')) {
      Alert.alert(
        'Récupération du compte',
        'Entre d’abord ton adresse e-mail de récupération vérifiée dans le champ « Pseudo Loki Music ou e-mail », puis appuie de nouveau sur « Mot de passe oublié ? ». Pour un ancien compte sans e-mail, le Super Admin Loki Music peut toujours rétablir l’accès.',
      );
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await createAuthService(supabase).requestPasswordReset(email);
      if (result.error) {
        setError(errorText(result.error));
        return;
      }
      Alert.alert(
        'Lien Loki Music envoyé',
        'Si cette adresse est liée à un compte Loki Music, ouvre l’e-mail reçu puis touche « CHANGER MON MOT DE PASSE ». Tu pourras choisir un nouveau mot de passe sécurisé.',
      );
    } catch {
      setError('Impossible d’envoyer le lien de récupération pour le moment. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  const passwordAutocomplete = mode === 'create' ? 'new-password' : 'current-password';

  if (pendingConfirmationEmail) {
    return <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Confirme ton e-mail</Text>
      <Text style={s.subtitle}>Loki Music a envoyé un lien de confirmation à {pendingConfirmationEmail}. Ouvre cet e-mail et touche le lien pour activer ton compte, puis reviens te connecter ici.</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <TouchableOpacity style={s.primary} onPress={resendConfirmation} disabled={busy}>
        {busy ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>RENVOYER L’E-MAIL</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.switchMode} onPress={() => { setPendingConfirmationEmail(''); setMode('login'); setUsername(''); setPassword(''); setPassword2(''); setError(''); }}>
        <Text style={s.switchText}>J’ai confirmé, me connecter</Text>
      </TouchableOpacity>
    </ScrollView>;
  }

  return <ScrollView
    style={s.scroll}
    contentContainerStyle={s.container}
    keyboardShouldPersistTaps="handled"
    nestedScrollEnabled
    showsVerticalScrollIndicator={false}
  >
    <Text style={s.title}>{mode === 'create' ? 'Créer mon compte Loki Music' : 'Se connecter à Loki Music'}</Text>
    {followUsername ? <Text style={s.followHint}>Après connexion, @{cleanUsername(followUsername)} sera suivi automatiquement.</Text> : null}
    <Text style={s.subtitle}>
      {mode === 'create'
        ? 'Ton pseudo, ton mot de passe et une adresse e-mail vérifiée sont nécessaires pour créer ton compte.'
        : 'Connecte-toi avec ton pseudo Loki Music ou ton e-mail, puis ton mot de passe.'}
    </Text>

    <View style={s.labelRow}>
      <Text style={s.label}>{mode === 'create' ? 'Pseudo Loki Music' : 'Pseudo Loki Music ou e-mail'}</Text>
      {mode === 'create' ? <TouchableOpacity
        style={s.info}
        onPress={() => setOpenTip((v) => (v === 'username' ? null : 'username'))}
        accessibilityRole="button"
        accessibilityLabel="Pourquoi ce champ ?"
      ><Text style={s.infoText}>i</Text></TouchableOpacity> : null}
    </View>
    <TextInput
      style={s.input}
      value={username}
      onChangeText={(value) => { setUsername(value); if (error) setError(''); }}
      placeholder={mode === 'create' ? 'Pseudo Loki Music' : 'Pseudo Loki Music ou e-mail'}
      placeholderTextColor={colors.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={mode === 'login' ? 'email' : 'username'}
      textContentType={mode === 'login' ? 'username' : 'username'}
      maxLength={160}
    />
    {mode === 'create' && openTip === 'username' ? <Text style={s.tooltip}>Ton pseudo est public et unique.</Text> : null}

    {mode === 'create' ? <>
      <View style={s.labelRow}>
        <Text style={s.label}>Adresse e-mail</Text>
        <TouchableOpacity
          style={s.info}
          onPress={() => setOpenTip((v) => (v === 'email' ? null : 'email'))}
          accessibilityRole="button"
          accessibilityLabel="Pourquoi ce champ ?"
        ><Text style={s.infoText}>i</Text></TouchableOpacity>
      </View>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={(value) => { setEmail(value); if (error) setError(''); }}
        placeholder="Adresse e-mail"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      {openTip === 'email' ? <Text style={s.tooltip}>Ton e-mail reste privé -- il sert uniquement à activer ton compte et à récupérer ton mot de passe.</Text> : null}
      <TouchableOpacity style={s.suggestButton} onPress={suggestPassword} disabled={busy} accessibilityRole="button" accessibilityLabel="Suggérer un mot de passe sécurisé">
        <Text style={s.suggestText}>✦ SUGGÉRER UN MOT DE PASSE Loki Music</Text>
      </TouchableOpacity>
    </> : null}

    <View style={s.labelRow}>
      <Text style={s.label}>Mot de passe</Text>
    </View>
    <View style={s.passwordRow}>
      <TextInput
        style={s.passwordInput}
        value={password}
        onChangeText={(value) => { setPassword(value); setPasswordSuggested(false); if (error) setError(''); }}
        placeholder="Mot de passe"
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={passwordAutocomplete as any}
        textContentType={mode === 'create' ? 'newPassword' : 'password'}
        onSubmitEditing={mode === 'login' ? submit : undefined}
      />
      <TouchableOpacity style={s.eye} onPress={() => setShowPassword((v) => !v)} accessibilityLabel="Afficher ou masquer le mot de passe"><Text style={s.eyeText}>{showPassword ? '◉' : '◎'}</Text></TouchableOpacity>
    </View>

    {mode === 'create' ? <>
      <View style={s.strengthRow}>
        {[1,2,3,4].map((step) => <View key={step} style={[s.strengthBar, step <= strength && (strengthGood ? s.strengthGood : s.strengthWeak)]} />)}
      </View>
      <Text style={[s.strengthText, strengthGood ? s.strengthTextGood : s.strengthTextWeak]}>Sécurité : {strengthLabel}</Text>
      <View style={s.labelRow}>
        <Text style={s.label}>Confirmer le mot de passe</Text>
      </View>
      <View style={s.passwordRow}>
        <TextInput
          style={s.passwordInput}
          value={password2}
          onChangeText={(value) => { setPassword2(value); setPasswordSuggested(false); if (error) setError(''); }}
          placeholder="Confirmer le mot de passe"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showPassword2}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
        <TouchableOpacity style={s.eye} onPress={() => setShowPassword2((v) => !v)} accessibilityLabel="Afficher ou masquer la confirmation"><Text style={s.eyeText}>{showPassword2 ? '◉' : '◎'}</Text></TouchableOpacity>
      </View>
    </> : null}

    {passwordSuggested ? <Text style={s.passwordSavedHint}>Mot de passe proposé par Loki Music : enregistre-le dans le gestionnaire de mots de passe de ton appareil.</Text> : null}
    {error ? <Text style={s.error}>{error}</Text> : null}

    <TouchableOpacity style={s.primary} onPress={submit} disabled={busy}>
      {busy ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>{mode === 'create' ? 'CRÉER MON COMPTE' : 'SE CONNECTER'}</Text>}
    </TouchableOpacity>

    {mode === 'login' ? <TouchableOpacity style={s.forgot} onPress={requestRecoveryLink} disabled={busy}>
      <Text style={s.forgotText}>Mot de passe oublié ?</Text>
    </TouchableOpacity> : null}

    <TouchableOpacity style={s.switchMode} onPress={() => { setMode(mode === 'create' ? 'login' : 'create'); setUsername(mode === 'create' ? '' : initialUsername); setPassword(''); setPassword2(''); setPasswordSuggested(false); setError(''); }}>
      <Text style={s.switchText}>{mode === 'create' ? 'J’ai déjà un compte' : 'Créer un nouveau compte'}</Text>
    </TouchableOpacity>
    <Text style={s.recovery}>Tu peux revenir à l’essai gratuit avec « Plus tard ». Pour protéger chaque bibliothèque, les morceaux d’essai ne sont jamais injectés dans un autre compte : après création ou connexion, Loki Music charge uniquement la musique de cette identité.</Text>
  </ScrollView>;
}

const s = StyleSheet.create({
  scroll:{maxHeight:640},
  container:{gap:8,paddingHorizontal:2,paddingTop:4,paddingBottom:12},
  title:{color:colors.textPrimary,fontSize:24,lineHeight:30,fontWeight:'800',textAlign:'center',marginBottom:2},
  subtitle:{color:colors.textMutedGrey ?? colors.textSecondary,fontSize:14,lineHeight:20,textAlign:'center',marginBottom:12,paddingHorizontal:8},
  followHint:{color:colors.primaryLight,fontSize:12,lineHeight:17,fontWeight:'800',textAlign:'center',marginBottom:2},
  input:{minHeight:52,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:16,color:colors.textPrimary,fontSize:16},
  labelRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:8,marginBottom:1},
  label:{color:colors.textMutedGrey ?? colors.textSecondary,fontSize:12,fontWeight:'800',textTransform:'uppercase',letterSpacing:.8},
  info:{width:18,height:18,borderRadius:9,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  infoText:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},
  tooltip:{color:colors.textSecondary,fontSize:12,lineHeight:17,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primaryLight,borderRadius:12,paddingHorizontal:12,paddingVertical:10,marginTop:1},
  passwordRow:{minHeight:52,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center'},
  passwordInput:{flex:1,height:50,paddingHorizontal:16,color:colors.textPrimary,fontSize:16},
  eye:{width:52,height:52,alignItems:'center',justifyContent:'center'},
  eyeText:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
  suggestButton:{minHeight:44,borderRadius:21,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:12,paddingVertical:7,marginTop:2},
  suggestText:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:.2},
  passwordSavedHint:{color:colors.textSecondary,fontSize:11,lineHeight:15,textAlign:'center',paddingHorizontal:8},
  strengthRow:{flexDirection:'row',gap:5,marginTop:2},
  strengthBar:{flex:1,height:5,borderRadius:3,backgroundColor:colors.border},
  strengthWeak:{backgroundColor:colors.warning},
  strengthGood:{backgroundColor:colors.success},
  strengthText:{fontSize:10,fontWeight:'800',textAlign:'right'},
  strengthTextWeak:{color:colors.warning},
  strengthTextGood:{color:colors.success},
  error:{color:colors.danger,fontSize:12,lineHeight:17,textAlign:'center',paddingHorizontal:8,marginTop:2},
  primary:{minHeight:52,borderRadius:26,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14,paddingHorizontal:16},
  primaryText:{color:'#FFF',fontSize:16,fontWeight:'900',letterSpacing:.3,textAlign:'center'},
  forgot:{minHeight:44,alignItems:'center',justifyContent:'center'},
  forgotText:{color:colors.primaryLight,fontSize:14,fontWeight:'800'},
  switchMode:{minHeight:44,alignItems:'center',justifyContent:'center'},
  switchText:{color:colors.primaryLight,fontSize:14,fontWeight:'800'},
  recovery:{color:colors.textMuted,fontSize:11,lineHeight:16,textAlign:'center',marginTop:2,paddingHorizontal:10},
});
