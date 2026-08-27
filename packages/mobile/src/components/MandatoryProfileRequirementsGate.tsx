import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { pickAndUploadAvatar } from '../services/avatarService';
import { useUserStore } from '../store/useUserStore';
import { GenderOption, SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

type Requirement = 'BIRTH_DATE' | 'GENDER' | 'AVATAR' | 'CITY' | 'COUNTRY' | 'BIO' | 'SOCIAL_LINK' | 'WEBSITE';

const LABELS: Record<Requirement, string> = {
  BIRTH_DATE: 'Date de naissance',
  GENDER: 'Genre',
  AVATAR: 'Photo de profil',
  CITY: 'Ville',
  COUNTRY: 'Pays',
  BIO: 'Bio',
  SOCIAL_LINK: 'Au moins un réseau social',
  WEBSITE: 'Site web',
};

const SOCIALS: Array<{ key: SocialLink['platform']; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'snapchat', label: 'Snapchat' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'x', label: 'X' },
  { key: 'facebook', label: 'Facebook' },
];

const GENDERS: Array<{ key: GenderOption; label: string }> = [
  { key: 'MALE', label: 'Homme' },
  { key: 'FEMALE', label: 'Femme' },
  { key: 'OTHER', label: 'Autre' },
  { key: 'PREFER_NOT_TO_SAY', label: 'Ne pas préciser' },
];

function missingRequirements(user: User, requirements: Requirement[]): Requirement[] {
  return requirements.filter((item) => {
    if (item === 'BIRTH_DATE') return !user.privateInfo.birthDate;
    if (item === 'GENDER') return !user.privateInfo.gender;
    if (item === 'AVATAR') return !user.avatar;
    if (item === 'CITY') return !user.city?.trim();
    if (item === 'COUNTRY') return !user.countryCode?.trim();
    if (item === 'BIO') return !user.bio?.trim();
    if (item === 'SOCIAL_LINK') return !user.socialLinks.some((link) => link.url.trim());
    if (item === 'WEBSITE') return !user.website?.trim();
    return false;
  });
}

export default function MandatoryProfileRequirementsGate({ children }: { children: React.ReactNode }) {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const setUser = useUserStore((s) => s.setUser);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [birthDate, setBirthDate] = useState(user?.privateInfo.birthDate ?? '');
  const [gender, setGender] = useState<GenderOption | undefined>(user?.privateInfo.gender);
  const [avatar, setAvatar] = useState(user?.avatar ?? '');
  const [socialPlatform, setSocialPlatform] = useState<SocialLink['platform']>('instagram');
  const [socialUrl, setSocialUrl] = useState('');

  useEffect(() => {
    setBio(user?.bio ?? '');
    setCity(user?.city ?? '');
    setCountryCode(user?.countryCode ?? '');
    setWebsite(user?.website ?? '');
    setBirthDate(user?.privateInfo.birthDate ?? '');
    setGender(user?.privateInfo.gender);
    setAvatar(user?.avatar ?? '');
  }, [user?.id]);

  useEffect(() => {
    let live = true;
    if (!user || isDemoMode || isLocalGuest || !supabase) {
      setRequirements([]);
      setLoaded(true);
      return () => { live = false; };
    }
    setLoaded(false);
    void supabase
      .from('user_profile_requirements')
      .select('requirements')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const raw = Array.isArray(data?.requirements) ? data.requirements : [];
        const supported = raw.filter((item: unknown): item is Requirement => typeof item === 'string' && Object.prototype.hasOwnProperty.call(LABELS, item));
        setRequirements(supported);
        setLoaded(true);
      })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [isDemoMode, isLocalGuest, user?.id]);

  const draftUser = useMemo<User | null>(() => user ? {
    ...user,
    bio: bio.trim(),
    city: city.trim() || undefined,
    countryCode: countryCode.trim().toUpperCase() || undefined,
    website: website.trim() || undefined,
    avatar,
    privateInfo: { ...user.privateInfo, birthDate: birthDate.trim() || undefined, gender },
    socialLinks: socialUrl.trim()
      ? [
          ...user.socialLinks.filter((link) => link.platform !== socialPlatform),
          { platform: socialPlatform, url: socialUrl.trim(), visibility: 'PUBLIC' as const },
        ]
      : user.socialLinks,
  } : null, [avatar, bio, birthDate, city, countryCode, gender, socialPlatform, socialUrl, user, website]);

  const missing = useMemo(() => draftUser ? missingRequirements(draftUser, requirements) : [], [draftUser, requirements]);

  if (!user || isDemoMode || isLocalGuest || !loaded || requirements.length === 0 || missing.length === 0) return <>{children}</>;

  const chooseAvatar = async () => {
    setAvatarBusy(true);
    try {
      const url = await pickAndUploadAvatar(user.id);
      if (url) setAvatar(url);
    } catch (e: any) {
      Alert.alert('Photo de profil', e?.message || 'Impossible de mettre à jour la photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const save = async () => {
    if (!draftUser || !supabase) return;
    const stillMissing = missingRequirements(draftUser, requirements);
    if (stillMissing.length) {
      Alert.alert('Informations requises', `Complète encore : ${stillMissing.map((item) => LABELS[item]).join(', ')}.`);
      return;
    }
    setSaving(true);
    try {
      await createProfileService(supabase).saveOwnProfile(draftUser);
      setUser(draftUser);
    } catch (e: any) {
      Alert.alert('Profil KEEP', e?.message || 'Impossible d’enregistrer les informations demandées.');
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView style={s.container}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={s.logo}>KEEP</Text>
      <Text style={s.title}>Action requise sur ton profil</Text>
      <Text style={s.subtitle}>Le Super Admin KEEP demande ces informations avant de poursuivre. Dès qu’elles sont enregistrées, ton application se débloque automatiquement.</Text>

      <View style={s.requirementCard}>
        {missing.map((item) => <View key={item} style={s.requirementRow}><Text style={s.dot}>•</Text><Text style={s.requirementText}>{LABELS[item]}</Text></View>)}
      </View>

      {requirements.includes('AVATAR') ? <View style={s.fieldBlock}>
        <Text style={s.label}>Photo de profil</Text>
        <View style={s.avatarRow}>
          {avatar ? <Image source={{ uri: avatar }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>K</Text></View>}
          <TouchableOpacity style={s.secondaryButton} onPress={chooseAvatar} disabled={avatarBusy}>{avatarBusy ? <ActivityIndicator color={colors.primaryLight}/> : <Text style={s.secondaryText}>CHOISIR UNE PHOTO</Text>}</TouchableOpacity>
        </View>
      </View> : null}

      {requirements.includes('BIO') ? <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Quelques mots sur toi" multiline/> : null}
      {requirements.includes('CITY') ? <Field label="Ville" value={city} onChangeText={setCity} placeholder="Ville"/> : null}
      {requirements.includes('COUNTRY') ? <Field label="Pays" value={countryCode} onChangeText={setCountryCode} placeholder="FR" autoCapitalize="characters" maxLength={2}/> : null}
      {requirements.includes('WEBSITE') ? <Field label="Site web" value={website} onChangeText={setWebsite} placeholder="https://..." autoCapitalize="none"/> : null}
      {requirements.includes('BIRTH_DATE') ? <Field label="Date de naissance" value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-JJ" autoCapitalize="none"/> : null}

      {requirements.includes('GENDER') ? <View style={s.fieldBlock}><Text style={s.label}>Genre</Text><View style={s.chips}>{GENDERS.map((item) => <TouchableOpacity key={item.key} style={[s.chip,gender===item.key&&s.chipOn]} onPress={()=>setGender(item.key)}><Text style={[s.chipText,gender===item.key&&s.chipTextOn]}>{item.label}</Text></TouchableOpacity>)}</View></View> : null}

      {requirements.includes('SOCIAL_LINK') ? <View style={s.fieldBlock}>
        <Text style={s.label}>Réseau social</Text>
        <View style={s.chips}>{SOCIALS.map((item) => <TouchableOpacity key={item.key} style={[s.chip,socialPlatform===item.key&&s.chipOn]} onPress={()=>setSocialPlatform(item.key)}><Text style={[s.chipText,socialPlatform===item.key&&s.chipTextOn]}>{item.label}</Text></TouchableOpacity>)}</View>
        <TextInput style={s.input} value={socialUrl} onChangeText={setSocialUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false}/>
      </View> : null}

      <TouchableOpacity style={s.primary} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>ENREGISTRER ET CONTINUER</Text>}</TouchableOpacity>
      <Text style={s.lockHint}>Cet écran ne peut pas être ignoré tant que les informations demandées ne sont pas complétées.</Text>
    </ScrollView>
  </SafeAreaView>;
}

function Field({ label, ...props }: any) {
  return <View style={s.fieldBlock}><Text style={s.label}>{label}</Text><TextInput style={[s.input,props.multiline&&s.multiline]} placeholderTextColor={colors.textMuted} {...props}/></View>;
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},
  content:{padding:20,paddingBottom:40,maxWidth:560,width:'100%',alignSelf:'center'},
  logo:{color:colors.primaryLight,fontSize:28,fontWeight:'900',letterSpacing:3,marginTop:8},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:22},
  subtitle:{color:colors.textSecondary,fontSize:13,lineHeight:19,marginTop:8},
  requirementCard:{marginTop:18,padding:14,borderRadius:radius.lg,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated},
  requirementRow:{flexDirection:'row',gap:8,alignItems:'center',minHeight:28},
  dot:{color:colors.primaryLight,fontSize:20},
  requirementText:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},
  fieldBlock:{marginTop:18},
  label:{color:colors.textSecondary,fontSize:12,fontWeight:'800',marginBottom:7},
  input:{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.backgroundCard,color:colors.textPrimary,paddingHorizontal:13,fontSize:14},
  multiline:{minHeight:88,paddingTop:12,textAlignVertical:'top'},
  avatarRow:{flexDirection:'row',alignItems:'center',gap:12},
  avatar:{width:72,height:72,borderRadius:36,backgroundColor:colors.backgroundCard},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontSize:26,fontWeight:'900'},
  secondaryButton:{minHeight:44,flex:1,borderRadius:22,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center'},
  secondaryText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},
  chip:{minHeight:36,paddingHorizontal:11,borderRadius:18,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  chipOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},
  chipText:{color:colors.textSecondary,fontSize:11,fontWeight:'800'},
  chipTextOn:{color:'#FFF'},
  primary:{minHeight:52,borderRadius:26,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:24},
  primaryText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  lockHint:{color:colors.textMuted,fontSize:10,lineHeight:15,textAlign:'center',marginTop:10},
});
