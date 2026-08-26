import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createAuthService } from '../services/authService';
import { stageGuestProfileForUpgrade } from '../services/guestUpgradeService';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

export type UsernameAccountMode = 'create' | 'login';

type Props = {
  initialMode?: UsernameAccountMode;
  followUsername?: string;
  onSuccess?: () => void;
};

function errorText(code: string) {
  if (code === 'invalid_email') return 'Saisis une adresse e-mail valide.';
  if (code === 'email_taken') return 'Cette adresse e-mail possède déjà un compte KEEP. Connecte-toi.';
  if (code === 'invalid_username') return 'Choisis un pseudo KEEP de 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore.';
  if (code === 'invalid_password') return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (code === 'username_taken') return 'Ce pseudo KEEP est déjà utilisé. Choisis-en un autre.';
  if (code === 'username_conflict') return 'Ce pseudo nécessite une vérification. Choisis-en un autre pour le moment.';
  if (code === 'account_not_created') return 'Ce profil existe encore en mode essai. Crée son compte depuis l’appareil où il a été créé.';
  if (code === 'legacy_profile_requires_original_device') return 'Ce profil provient d’un ancien essai KEEP et doit être récupéré depuis le Super Admin pour éviter toute usurpation.';
  if (code === 'invalid_credentials') return 'Adresse e-mail ou mot de passe incorrect.';
  return 'Connexion KEEP indisponible pour le moment. Réessaie dans un instant.';
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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function UsernameAccountForm({ initialMode = 'create', followUsername = '', onSuccess }: Props) {
  const currentUser = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);

  const [mode, setMode] = useState<UsernameAccountMode>(initialMode);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState(currentUser?.username?.replace(/^invite-/i, '') || '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [passwordSuggested, setPasswordSuggested] = useState(false);

  const applyFollowIntent = async () => {
    if (!supabase || !followUsername) return true;
    const { data: sessionData } = await supabase.auth.getSession();
    const followerId = sessionData.session?.user?.id;
    if (!followerId) return false;

    const { data: targets, error: targetError } = await supabase
      .from('profiles')
      .select('id,username')
      .ilike('username', followUsername.replace(/^@+/, ''))
      .eq('is_public', true)
      .limit(1);
    if (targetError || !targets?.[0]) return false;
    const followeeId = String(targets[0].id);
    if (followeeId === followerId) return true;

    const { error: followError } = await supabase.from('follows').upsert(
      { follower_id: followerId, followee_id: followeeId },
      { onConflict: 'follower_id,followee_id', ignoreDuplicates: true },
    );
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

  const submit = async () => {
    if (!supabase) return setError('Connexion KEEP indisponible pour le moment.');
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().replace(/^@+/, '');
    if (!validEmail(cleanEmail)) return setError('Saisis une adresse e-mail valide.');
    if (mode === 'create' && (cleanUsername.length < 3 || cleanUsername.length > 30 || !/^[\p{L}\p{N}._-]+$/u.test(cleanUsername))) {
      return setError('Choisis un pseudo KEEP de 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore.');
    }
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (mode === 'create' && password !== password2) return setError('Les deux mots de passe ne correspondent pas.');

    setBusy(true);
    setError('');
    try {
      if (mode === 'create' && isLocalGuest && currentUser) {
        await stageGuestProfileForUpgrade({ ...currentUser, username: cleanUsername, email: cleanEmail });
      }

      const auth = createAuthService(supabase);
      const result = mode === 'create'
        ? await auth.signUpWithEmailIdentity(cleanEmail, cleanUsername, password)
        : await auth.signInWithEmailIdentity(cleanEmail, password);
      if (result.error) return setError(errorText(result.error));

      const followed = await applyFollowIntent();
      if (followUsername) {
        Alert.alert(
          mode === 'create' ? 'Compte KEEP créé' : 'Connexion réussie',
          followed ? 'Le profil que tu consultais est maintenant suivi.' : 'Ton compte est connecté. Le suivi pourra être terminé depuis le profil.',
        );
      } else if (mode === 'create') {
        Alert.alert('Compte KEEP créé', 'Ton profil d’essai est maintenant rattaché à ton compte KEEP.');
      }
      onSuccess?.();
    } catch {
      setError('Connexion KEEP indisponible pour le moment. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  const passwordAutocomplete = mode === 'create' ? 'new-password' : 'current-password';

  return <ScrollView
    style={s.scroll}
    contentContainerStyle={s.container}
    keyboardShouldPersistTaps="handled"
    nestedScrollEnabled
    showsVerticalScrollIndicator
  >
    <Text style={s.title}>{mode === 'create' ? 'Créer mon compte KEEP' : 'Se connecter à KEEP'}</Text>
    {followUsername ? <Text style={s.followHint}>Après connexion, le profil que tu consultais sera suivi automatiquement.</Text> : null}
    <Text style={s.subtitle}>{mode === 'create' ? 'Ton e-mail devient ton identifiant de connexion. Ton pseudo reste ton nom public sur KEEP.' : 'Connecte-toi avec ton adresse e-mail et ton mot de passe.'}</Text>

    <TextInput
      style={s.input}
      value={email}
      onChangeText={(value) => { setEmail(value); if (error) setError(''); }}
      placeholder="Adresse e-mail"
      placeholderTextColor={colors.textMuted}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      maxLength={160}
    />

    {mode === 'create' ? <>
      <TextInput
        style={s.input}
        value={username}
        onChangeText={(value) => { setUsername(value); if (error) setError(''); }}
        placeholder="Pseudo KEEP"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="none"
        maxLength={30}
      />
      <Text style={s.usernameHint}>Le pseudo est public. L’adresse e-mail reste privée et sert uniquement à la connexion.</Text>

      <TouchableOpacity style={s.suggestButton} onPress={suggestPassword} disabled={busy} accessibilityRole="button" accessibilityLabel="Suggérer un mot de passe sécurisé">
        <Text style={s.suggestText}>✦ SUGGÉRER UN MOT DE PASSE KEEP</Text>
      </TouchableOpacity>
    </> : null}

    <View style={s.passwordRow}>
      <TextInput
        style={s.passwordInput}
        value={password}
        onChangeText={(value) => { setPassword(value); setPasswordSuggested(false); }}
        placeholder="Mot de passe — 8 caractères minimum"
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={passwordAutocomplete as any}
        textContentType={mode === 'create' ? 'newPassword' : 'password'}
      />
      <TouchableOpacity style={s.eye} onPress={() => setShowPassword((v) => !v)} accessibilityLabel="Afficher ou masquer le mot de passe"><Text style={s.eyeText}>{showPassword ? '◉' : '◎'}</Text></TouchableOpacity>
    </View>

    {mode === 'create' ? <View style={s.passwordRow}>
      <TextInput
        style={s.passwordInput}
        value={password2}
        onChangeText={(value) => { setPassword2(value); setPasswordSuggested(false); }}
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
    </View> : null}

    <Text style={s.passwordRule}>8 caractères minimum. Utilise l’œil pour vérifier ce que tu as saisi.</Text>
    {passwordSuggested ? <Text style={s.passwordSavedHint}>Mot de passe proposé par KEEP : pense à l’enregistrer dans le gestionnaire de mots de passe de ton appareil.</Text> : null}
    {error ? <Text style={s.error}>{error}</Text> : null}
    <TouchableOpacity style={s.primary} onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>{mode === 'create' ? 'CRÉER MON COMPTE' : 'SE CONNECTER'}</Text>}</TouchableOpacity>
    <TouchableOpacity style={s.switchMode} onPress={() => { setMode(mode === 'create' ? 'login' : 'create'); setPassword(''); setPassword2(''); setPasswordSuggested(false); setError(''); }}><Text style={s.switchText}>{mode === 'create' ? 'J’ai déjà un compte' : 'Créer un nouveau compte'}</Text></TouchableOpacity>
    <Text style={s.recovery}>Ton e-mail sert d’identifiant unique. La récupération sécurisée du mot de passe pourra être activée ensuite sans changer ton profil KEEP.</Text>
  </ScrollView>;
}

const s = StyleSheet.create({
  scroll:{maxHeight:520},container:{gap:spacing.xs,paddingBottom:4},title:{color:colors.textPrimary,fontSize:18,fontWeight:'900',textAlign:'center'},subtitle:{color:colors.textSecondary,fontSize:11,lineHeight:16,textAlign:'center',marginBottom:2},followHint:{color:colors.primaryLight,fontSize:11,lineHeight:16,fontWeight:'800',textAlign:'center'},input:{minHeight:44,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:13,color:colors.textPrimary,fontSize:14},usernameHint:{color:colors.textMuted,fontSize:9,lineHeight:13,textAlign:'center'},passwordRow:{minHeight:44,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center'},passwordInput:{flex:1,height:42,paddingHorizontal:13,color:colors.textPrimary,fontSize:14},eye:{width:44,height:42,alignItems:'center',justifyContent:'center'},eyeText:{color:colors.primaryLight,fontSize:19,fontWeight:'900'},suggestButton:{minHeight:38,borderRadius:radius.md,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:10,paddingVertical:5},suggestText:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},passwordRule:{color:colors.textMuted,fontSize:9,lineHeight:13,textAlign:'center'},passwordSavedHint:{color:colors.textSecondary,fontSize:9,lineHeight:13,textAlign:'center'},error:{color:colors.danger,fontSize:11,lineHeight:15,textAlign:'center'},primary:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:2},primaryText:{color:'#FFF',fontSize:11,fontWeight:'900',letterSpacing:.4},switchMode:{minHeight:34,alignItems:'center',justifyContent:'center'},switchText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},recovery:{color:colors.textMuted,fontSize:9,lineHeight:13,textAlign:'center'},
});