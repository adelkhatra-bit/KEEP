import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  if (code === 'invalid_username') return 'L’identifiant KEEP n’est pas une adresse e-mail. Choisis un pseudo de 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore.';
  if (code === 'invalid_password') return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (code === 'username_taken') return 'Cet identifiant KEEP est déjà utilisé. Choisis-en un autre ou connecte-toi.';
  if (code === 'username_conflict') return 'Cet identifiant nécessite une vérification. Choisis-en un autre pour le moment.';
  if (code === 'account_not_created') return 'Ce profil existe encore en mode essai. Crée son compte depuis l’appareil où il a été créé.';
  if (code === 'legacy_profile_requires_original_device') return 'Ce profil provient d’un ancien essai KEEP et doit être récupéré depuis le Super Admin pour éviter toute usurpation.';
  if (code === 'invalid_credentials') return 'Identifiant ou mot de passe incorrect.';
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

export default function UsernameAccountForm({ initialMode = 'create', followUsername = '', onSuccess }: Props) {
  const currentUser = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);

  const [mode, setMode] = useState<UsernameAccountMode>(initialMode);
  const [username, setUsername] = useState('');
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
    const cleanUsername = username.trim().replace(/^@+/, '');
    if (cleanUsername.includes('@')) return setError('Ne mets pas ton adresse e-mail ici. Choisis simplement ton pseudo KEEP.');
    if (cleanUsername.length < 3 || cleanUsername.length > 30 || !/^[\p{L}\p{N}._-]+$/u.test(cleanUsername)) {
      return setError('Choisis un pseudo KEEP de 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore.');
    }
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (mode === 'create' && password !== password2) return setError('Les deux mots de passe ne correspondent pas.');

    setBusy(true);
    setError('');
    try {
      // L'essai gratuit reste local. Juste avant la création du vrai compte,
      // on met de côté le profil courant (pseudo, bio, photo locale, ville,
      // pays, réseaux, date, genre...) afin que le nouveau auth.uid() récupère
      // exactement ces données au lieu de repartir sur un deuxième profil.
      if (mode === 'create' && isLocalGuest && currentUser) {
        await stageGuestProfileForUpgrade({ ...currentUser, username: cleanUsername });
      }

      const auth = createAuthService(supabase);
      const result = mode === 'create'
        ? await auth.signUpWithUsername(cleanUsername, password)
        : await auth.signInWithUsername(cleanUsername, password);
      if (result.error) return setError(errorText(result.error));

      const followed = await applyFollowIntent();
      if (followUsername) {
        Alert.alert(
          mode === 'create' ? 'Compte KEEP créé' : 'Connexion réussie',
          followed ? 'Le profil que tu consultais est maintenant suivi.' : 'Ton compte est connecté. Le suivi pourra être terminé depuis le profil.',
        );
      } else if (mode === 'create') {
        Alert.alert('Compte KEEP créé', 'Ton profil d’essai est maintenant rattaché à ton vrai compte.');
      }
      onSuccess?.();
    } catch {
      setError('Connexion KEEP indisponible pour le moment. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  const passwordAutocomplete = mode === 'create' ? 'new-password' : 'current-password';
  const emailLikeUsername = username.includes('@');

  return <View style={s.container}>
    <Text style={s.title}>{mode === 'create' ? 'Créer mon compte KEEP' : 'Se connecter à KEEP'}</Text>
    {followUsername ? <Text style={s.followHint}>Après connexion, le profil que tu consultais sera suivi automatiquement.</Text> : null}
    <Text style={s.subtitle}>Aucun e-mail requis : choisis simplement un pseudo KEEP et un mot de passe.</Text>

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
      maxLength={64}
    />
    <Text style={[s.usernameHint, emailLikeUsername && s.usernameHintError]}>
      {emailLikeUsername ? 'Ce champ n’est pas l’e-mail : mets seulement ton pseudo KEEP.' : 'Pseudo : 3 à 30 caractères. Pas d’adresse e-mail.'}
    </Text>

    {mode === 'create' ? (
      <TouchableOpacity style={s.suggestButton} onPress={suggestPassword} disabled={busy} accessibilityRole="button" accessibilityLabel="Suggérer un mot de passe sécurisé">
        <Text style={s.suggestText}>✦ SUGGÉRER UN MOT DE PASSE KEEP</Text>
        <Text style={s.suggestHint}>Tu peux ensuite l’enregistrer dans le gestionnaire de mots de passe du téléphone.</Text>
      </TouchableOpacity>
    ) : null}

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
      <TouchableOpacity style={s.eye} onPress={() => setShowPassword((v) => !v)}><Text style={s.eyeText}>{showPassword ? '◉' : '◎'}</Text></TouchableOpacity>
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
      <TouchableOpacity style={s.eye} onPress={() => setShowPassword2((v) => !v)}><Text style={s.eyeText}>{showPassword2 ? '◉' : '◎'}</Text></TouchableOpacity>
    </View> : null}

    <Text style={s.passwordRule}>Mot de passe : 8 caractères minimum. KEEP ne demande pas 30 ou 40 caractères.</Text>
    {passwordSuggested ? <Text style={s.passwordSavedHint}>Mot de passe proposé par KEEP. Laisse-le affiché jusqu’à ce que ton téléphone te propose de l’enregistrer.</Text> : null}
    {error ? <Text style={s.error}>{error}</Text> : null}
    <TouchableOpacity style={s.primary} onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>{mode === 'create' ? 'CRÉER MON COMPTE' : 'SE CONNECTER'}</Text>}</TouchableOpacity>
    <TouchableOpacity style={s.switchMode} onPress={() => { setMode(mode === 'create' ? 'login' : 'create'); setPassword(''); setPassword2(''); setPasswordSuggested(false); setError(''); }}><Text style={s.switchText}>{mode === 'create' ? 'J’ai déjà un compte' : 'Créer un nouveau compte'}</Text></TouchableOpacity>
    <Text style={s.recovery}>Tu pourras ajouter plus tard une méthode de récupération ou une authentification renforcée dans les réglages.</Text>
  </View>;
}

const s = StyleSheet.create({
  container:{gap:spacing.sm},title:{color:colors.textPrimary,fontSize:19,fontWeight:'900',textAlign:'center'},subtitle:{color:colors.textSecondary,fontSize:12,lineHeight:18,textAlign:'center'},followHint:{color:colors.primaryLight,fontSize:12,lineHeight:18,fontWeight:'800',textAlign:'center'},input:{minHeight:50,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:14,color:colors.textPrimary,fontSize:15},usernameHint:{color:colors.textMuted,fontSize:10,lineHeight:14,textAlign:'center',marginTop:-2},usernameHintError:{color:colors.danger,fontWeight:'800'},passwordRow:{minHeight:50,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center'},passwordInput:{flex:1,height:48,paddingHorizontal:14,color:colors.textPrimary,fontSize:15},eye:{width:48,height:48,alignItems:'center',justifyContent:'center'},eyeText:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},suggestButton:{minHeight:48,borderRadius:radius.md,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:12,paddingVertical:7},suggestText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},suggestHint:{color:colors.textMuted,fontSize:9,lineHeight:13,textAlign:'center',marginTop:2},passwordRule:{color:colors.textMuted,fontSize:10,lineHeight:14,textAlign:'center'},passwordSavedHint:{color:colors.textSecondary,fontSize:10,lineHeight:15,textAlign:'center'},error:{color:colors.danger,fontSize:12,lineHeight:17,textAlign:'center'},primary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:4},primaryText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.4},switchMode:{minHeight:40,alignItems:'center',justifyContent:'center'},switchText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},recovery:{color:colors.textMuted,fontSize:10,lineHeight:15,textAlign:'center'},
});
