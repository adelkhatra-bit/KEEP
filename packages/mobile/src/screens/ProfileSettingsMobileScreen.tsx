import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { GenderOption, User } from '../types';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { createAuthService } from '../services/authService';
import { pickAndUploadAvatar } from '../services/avatarService';
import { clearLocalGuestMarker, stageGuestProfileForUpgrade } from '../services/guestUpgradeService';
import { getCurrentKeepLocation, KeepApproximateCoordinates, KeepLocationPermissionError, searchKeepCity } from '../services/locationService';
import UsernameAccountForm from '../components/UsernameAccountForm';

const GENDERS: { key: GenderOption; label: string }[] = [
  { key: 'MALE', label: 'Homme' }, { key: 'FEMALE', label: 'Femme' }, { key: 'OTHER', label: 'Autre' }, { key: 'PREFER_NOT_TO_SAY', label: 'Ne pas préciser' },
];
const COUNTRIES = [
  ['FR','France'],['BE','Belgique'],['CH','Suisse'],['LU','Luxembourg'],['MC','Monaco'],['ES','Espagne'],['IT','Italie'],['PT','Portugal'],['DE','Allemagne'],['NL','Pays-Bas'],['GB','Royaume-Uni'],['IE','Irlande'],['US','États-Unis'],['CA','Canada'],['MA','Maroc'],['DZ','Algérie'],['TN','Tunisie'],['AE','Émirats arabes unis'],['SA','Arabie saoudite'],['TR','Turquie'],['GR','Grèce'],['HR','Croatie'],['SE','Suède'],['NO','Norvège'],['DK','Danemark'],['FI','Finlande'],['PL','Pologne'],['CZ','Tchéquie'],['RO','Roumanie'],['JP','Japon'],['KR','Corée du Sud'],['AU','Australie'],['BR','Brésil'],['MX','Mexique'],['IN','Inde'],['ZA','Afrique du Sud']
] as const;

export default function ProfileSettingsMobileScreen({ navigation }: any) {
  const user = useUserStore((state) => state.user);
  const isDemoMode = useUserStore((state) => state.isDemoMode);
  const isLocalGuest = useUserStore((state) => state.isLocalGuest);
  const setUser = useUserStore((state) => state.setUser);
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [locationOptIn, setLocationOptIn] = useState(user?.locationOptIn ?? false);
  const [pendingCoords, setPendingCoords] = useState<KeepApproximateCoordinates | null>(null);
  const [locationEdited, setLocationEdited] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '');
  const [birthDate, setBirthDate] = useState(user?.privateInfo.birthDate ?? '');
  const [gender, setGender] = useState<GenderOption | undefined>(user?.privateInfo.gender);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [citySearching, setCitySearching] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const accountRequired = isDemoMode;
  const hasRealAccount = !isDemoMode && !isLocalGuest;

  const parsed = useMemo(() => {
    const parts = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const now = new Date();
    return { year: parts ? Number(parts[1]) : 1990, month: parts ? Number(parts[2]) : 1, day: parts ? Number(parts[3]) : 1, currentYear: now.getFullYear() };
  }, [birthDate]);
  const [dateDraft, setDateDraft] = useState({ year: parsed.year, month: parsed.month, day: parsed.day });

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.muted}>Aucun compte actif.</Text></View></SafeAreaView>;
  const keepSupportNumber = `KEEP-${user.id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;

  const goToTab = (screen: 'Listen' | 'Discover' | 'MyMusic' | 'Parties' | 'Profile') => {
    navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen } }] });
  };

  const requireAccount = () => {
    setError('');
    setCountryOpen(false);
    setDateOpen(false);
    setAccountOpen(true);
  };

  const signOutNow = async () => {
    if (sessionBusy) return;
    setSessionBusy(true);
    try {
      if (supabase) await createAuthService(supabase).signOut();
      await clearLocalGuestMarker();
    } catch {
      await clearLocalGuestMarker();
    } finally {
      useUserStore.getState().logout();
      setSessionBusy(false);
    }
  };

  const handleSessionAction = () => {
    if (!hasRealAccount) return requireAccount();
    const message = 'Tes données enregistrées dans KEEP restent sur ton compte. Tu pourras revenir avec ton identifiant KEEP et ton mot de passe.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Se déconnecter de KEEP ?\
\
${message}`)) void signOutNow();
      return;
    }
    Alert.alert('Se déconnecter de KEEP ?', message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => { void signOutNow(); } },
    ]);
  };

  const buildUser = (): User => {
    const cleanUsername = username.trim().replace(/^@+/, '').replace(/\s+/g, '');
    return {
      ...user,
      username: cleanUsername,
      avatar,
      bio: bio.trim(),
      city: city.trim() || undefined,
      countryCode: countryCode || undefined,
      website: website.trim() || undefined,
      locationOptIn,
      privateInfo: { ...user.privateInfo, birthDate: birthDate || undefined, gender },
    };
  };

  const save = async () => {
    if (accountRequired) return requireAccount();
    const cleanUsername = username.trim().replace(/^@+/, '').replace(/\s+/g, '');
    if (cleanUsername.length < 3) { setError('Le pseudo doit contenir au moins 3 caractères.'); return; }
    setError(''); setSaving(true);
    try {
      const nextUser = buildUser();
      setUser(nextUser);
      if (isLocalGuest) {
        await stageGuestProfileForUpgrade(nextUser);
        Alert.alert('Profil enregistré', 'Ton profil d’essai est conservé sur cet appareil. Crée ton compte plus tard pour le synchroniser et le partager publiquement.');
      } else if (supabase && !isDemoMode) {
        await createProfileService(supabase).saveOwnProfile(nextUser);
        if (locationEdited) {
          const { error: locationError } = await supabase.from('profiles').update({
            city: nextUser.city ?? null,
            country_code: nextUser.countryCode ?? null,
            approx_lat: pendingCoords?.lat ?? null,
            approx_lng: pendingCoords?.lng ?? null,
            location_opt_in: nextUser.locationOptIn,
          }).eq('id', user.id);
          if (locationError) throw locationError;
        }
        Alert.alert('Profil enregistré', 'Tes informations sont sauvegardées dans KEEP.');
      }
      goToTab('Profile');
    } catch (e: any) {
      setError(e?.message || 'Impossible de sauvegarder le profil.');
    } finally { setSaving(false); }
  };

  const changeAvatar = async () => {
    if (accountRequired) return requireAccount();
    setAvatarBusy(true);
    try {
      const url = await pickAndUploadAvatar(user.id);
      if (url) setAvatar(url);
    } catch (e: any) { Alert.alert('Photo de profil', e?.message || 'Impossible de mettre à jour la photo.'); }
    finally { setAvatarBusy(false); }
  };

  const handleCityChange = (text: string) => {
    setCity(text);
    setPendingCoords(null);
    setLocationEdited(true);
    setLocationOptIn(Boolean(text.trim() || countryCode));
    setLocationStatus(text.trim() ? 'Ville modifiée manuellement · elle sera enregistrée telle quelle.' : '');
  };

  const handleCountrySelect = (code: string) => {
    setCountryCode(code);
    setPendingCoords(null);
    setLocationEdited(true);
    setLocationOptIn(Boolean(city.trim() || code));
    setLocationStatus('Pays modifié manuellement · tu peux encore modifier la ville.');
    setCountryOpen(false);
  };

  const useCurrentLocation = async () => {
    if (accountRequired) return requireAccount();
    setLocating(true);
    setLocationStatus('');
    try {
      const resolved = await getCurrentKeepLocation();
      if (resolved.city) setCity(resolved.city);
      if (resolved.countryCode) setCountryCode(resolved.countryCode);
      setPendingCoords({ lat: resolved.lat, lng: resolved.lng });
      setLocationEdited(true);
      setLocationOptIn(true);
      setLocationStatus(resolved.city || resolved.countryCode
        ? 'Position trouvée · ville et pays préremplis. Tu peux les modifier avant d’enregistrer.'
        : 'Position trouvée · choisis ou saisis la ville et le pays avant d’enregistrer.');
    } catch (e) {
      if (e instanceof KeepLocationPermissionError) {
        Alert.alert('Localisation', 'Autorise la localisation pour préremplir automatiquement la ville et le pays. Tu peux aussi les saisir manuellement.');
      } else {
        Alert.alert('Localisation', 'Impossible de récupérer ta position pour le moment. Tu peux saisir la ville et le pays manuellement.');
      }
    } finally { setLocating(false); }
  };

  const searchCity = async () => {
    if (accountRequired) return requireAccount();
    const query = city.trim();
    if (query.length < 2) return void Alert.alert('Ville', 'Saisis au moins 2 caractères.');
    setCitySearching(true);
    setLocationStatus('');
    try {
      const resolved = await searchKeepCity(query);
      if (!resolved) {
        setPendingCoords(null);
        setLocationEdited(true);
        setLocationOptIn(Boolean(query || countryCode));
        if (Platform.OS === 'web') {
          setLocationStatus(countryCode ? 'Ville prête à enregistrer · la saisie manuelle est utilisée sur le Web.' : 'Ville prête à enregistrer · choisis maintenant le pays.');
          return;
        }
        return void Alert.alert('Ville', 'Aucune localisation trouvée. Tu peux conserver la ville saisie et choisir le pays manuellement.');
      }
      setCity(resolved.city || query);
      if (resolved.countryCode) setCountryCode(resolved.countryCode);
      setPendingCoords({ lat: resolved.lat, lng: resolved.lng });
      setLocationEdited(true);
      setLocationOptIn(true);
      setLocationStatus('Ville vérifiée · pays prérempli lorsque disponible.');
    } catch {
      Alert.alert('Ville', 'Impossible de rechercher cette localisation. La saisie manuelle reste disponible.');
    } finally { setCitySearching(false); }
  };

  const confirmDate = () => {
    const maxDay = new Date(dateDraft.year, dateDraft.month, 0).getDate();
    const safeDay = Math.min(dateDraft.day, maxDay);
    setBirthDate(`${dateDraft.year}-${String(dateDraft.month).padStart(2,'0')}-${String(safeDay).padStart(2,'0')}`);
    setDateOpen(false);
  };

  return <SafeAreaView style={s.container}>
    <View style={s.header}>
      <TouchableOpacity style={s.headerBtn} onPress={() => goToTab('Profile')} accessibilityLabel="Retour au profil"><Text style={s.headerBtnText}>‹ Retour</Text></TouchableOpacity>
      <Text style={s.title}>Modifier le profil</Text>
      <TouchableOpacity style={s.headerBtn} onPress={save} disabled={saving}><Text style={s.saveText}>{saving ? '...' : 'Enregistrer'}</Text></TouchableOpacity>
    </View>

    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {isLocalGuest ? <TouchableOpacity style={s.accountGate} onPress={requireAccount} accessibilityRole="button" accessibilityLabel="Créer mon compte KEEP">
        <Text style={s.accountGateTitle}>Créer mon compte KEEP</Text>
        <Text style={s.accountGateText}>Tu peux préparer tout ton profil maintenant. L’inscription débloque ensuite la synchronisation, le partage public et le suivi.</Text>
      </TouchableOpacity> : accountRequired ? <TouchableOpacity style={s.accountGate} onPress={requireAccount} accessibilityRole="button" accessibilityLabel="Créer mon compte KEEP">
        <Text style={s.accountGateTitle}>🔒 Créer mon compte KEEP</Text>
        <Text style={s.accountGateText}>Débloque photo, profil, localisation, réseaux et partage. Tout est facultatif.</Text>
      </TouchableOpacity> : null}

      <Section title="Photo" subtitle="Facultatif">
        <View style={s.avatarRow}>
          {avatar ? <Image source={{ uri: avatar }} style={s.avatar} /> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarK}>K</Text></View>}
          <TouchableOpacity style={s.locationButton} onPress={changeAvatar} disabled={avatarBusy}>{avatarBusy ? <ActivityIndicator color={colors.primaryLight}/> : <Text style={s.locationButtonText}>{accountRequired ? '🔒 Ajouter une photo' : 'Changer la photo'}</Text>}</TouchableOpacity>
        </View>
      </Section>

      <Section title="Identité" subtitle="Facultatif">
        <Field label="Pseudo" value={username} onChangeText={setUsername} placeholder="tonpseudo" autoCapitalize="none" editable={!accountRequired} onPressIn={accountRequired ? requireAccount : undefined} />
        <Text style={s.hint}>Visible publiquement sous la forme @{username.trim().replace(/^@+/, '') || 'pseudo'}.</Text>
        <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Quelques mots sur toi" multiline editable={!accountRequired} onPressIn={accountRequired ? requireAccount : undefined} />
      </Section>

      <Section title="Localisation" subtitle="Facultatif · KEEP peut préremplir automatiquement la ville et le pays.">
        <TouchableOpacity style={s.locationButton} onPress={useCurrentLocation} disabled={locating}>{locating ? <ActivityIndicator color={colors.primaryLight}/> : <Text style={s.locationButtonText}>{accountRequired ? '🔒 Utiliser ma position' : '⌖ Utiliser ma position'}</Text>}</TouchableOpacity>
        <Field label="Ville" value={city} onChangeText={handleCityChange} placeholder="Commence à saisir une ville" editable={!accountRequired} onPressIn={accountRequired ? requireAccount : undefined} />
        <TouchableOpacity style={s.lookupButton} onPress={searchCity} disabled={citySearching}>{citySearching ? <ActivityIndicator color={colors.primaryLight}/> : <Text style={s.lookupText}>{Platform.OS === 'web' ? 'Valider cette ville' : 'Rechercher et préremplir'}</Text>}</TouchableOpacity>
        <Selector label="Pays" value={COUNTRIES.find((c) => c[0] === countryCode)?.[1] ?? 'Choisir un pays'} onPress={() => accountRequired ? requireAccount() : setCountryOpen(true)} />
        {locationStatus ? <Text style={[s.hint,{color:'#74F3B6'}]}>{locationStatus}</Text> : null}
        <Text style={s.hint}>Confidentialité : KEEP n’affiche jamais ta position GPS précise. Avec « Utiliser ma position », seules la ville, le pays et une coordonnée approximative d’environ 1 km sont conservés pour la découverte locale.</Text>
        <Field label="Site web" value={website} onChangeText={setWebsite} placeholder="https://..." autoCapitalize="none" editable={!accountRequired} onPressIn={accountRequired ? requireAccount : undefined} />
      </Section>

      <Section title="Informations privées" subtitle="Facultatif · jamais affichées publiquement.">
        <Selector label="Date de naissance" value={birthDate || 'Choisir une date'} onPress={() => { if (accountRequired) return requireAccount(); setDateDraft({ year: parsed.year, month: parsed.month, day: parsed.day }); setDateOpen(true); }} />
        <Text style={s.hint}>Utilisée seulement si tu veux activer les filtres d’âge et événements 18+.</Text>
        <Text style={[s.label,{marginTop:18}]}>Genre</Text>
        <View style={s.genderWrap}>{GENDERS.map((item) => <TouchableOpacity key={item.key} style={[s.genderChip, gender===item.key&&s.genderChipActive]} onPress={()=>accountRequired ? requireAccount() : setGender(item.key)}><Text style={[s.genderText,gender===item.key&&s.genderTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
      </Section>

      <Section title="KEEP">
        <View style={s.supportCard}>
          <Text style={s.supportLabel}>N° membre / support</Text>
          <Text style={s.supportNumber}>{isLocalGuest || isDemoMode ? 'Créé après inscription' : keepSupportNumber}</Text>
          <Text style={s.hint}>À communiquer au support KEEP en cas de problème. Ce numéro n’est pas affiché sur ton profil public.</Text>
        </View>
        <QuickLink label="Notifications" onPress={()=>navigation.navigate('Notifications')} />
        <QuickLink label="Services musicaux" onPress={()=>navigation.navigate('MusicConnections')} />
        <QuickLink label="Offre & crédits" onPress={()=>navigation.navigate('Offers')} />
      </Section>

      {error ? <Text style={s.error}>{error}</Text> : null}
      <TouchableOpacity style={s.primary} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff"/> : <Text style={s.primaryText}>{accountRequired ? 'CRÉER MON COMPTE POUR ENREGISTRER' : isLocalGuest ? 'Enregistrer sur cet appareil' : 'Enregistrer les modifications'}</Text>}</TouchableOpacity>

      <TouchableOpacity
        style={hasRealAccount ? s.disconnectButton : s.connectButton}
        onPress={handleSessionAction}
        disabled={sessionBusy}
        accessibilityRole="button"
        accessibilityLabel={hasRealAccount ? 'Se déconnecter de KEEP' : 'Se connecter ou créer un compte KEEP'}
      >
        {sessionBusy ? <ActivityIndicator color={hasRealAccount ? '#FF7A86' : colors.primaryLight}/> : <Text style={hasRealAccount ? s.disconnectText : s.connectText}>{hasRealAccount ? 'SE DÉCONNECTER' : 'SE CONNECTER / CRÉER UN COMPTE'}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={s.playlists} onPress={()=>goToTab('MyMusic')}><Text style={s.playlistsText}>← Revenir aux Playlists</Text></TouchableOpacity>
      <TouchableOpacity style={s.advanced} onPress={()=>accountRequired ? requireAccount() : navigation.navigate('AdvancedProfileSettings')}><Text style={s.advancedText}>{accountRequired ? '🔒 Réseaux et réglages avancés' : 'Réglages avancés du profil'}</Text></TouchableOpacity>
    </ScrollView>

    <Modal visible={accountOpen} transparent animationType="fade" onRequestClose={()=>setAccountOpen(false)}><View style={s.modalBackdrop}><View style={s.modalCard}><View style={s.modalHeader}><Text style={s.modalTitle}>Débloquer mon profil</Text><TouchableOpacity onPress={()=>setAccountOpen(false)}><Text style={s.close}>Plus tard</Text></TouchableOpacity></View><UsernameAccountForm initialMode="create" onSuccess={()=>setAccountOpen(false)} /><TouchableOpacity style={s.continueTrial} onPress={()=>setAccountOpen(false)}><Text style={s.continueTrialText}>Continuer en mode essai</Text></TouchableOpacity></View></View></Modal>

    <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={()=>setCountryOpen(false)}><View style={s.modalBackdrop}><View style={s.modalCard}><View style={s.modalHeader}><Text style={s.modalTitle}>Choisir le pays</Text><TouchableOpacity onPress={()=>setCountryOpen(false)}><Text style={s.close}>Fermer</Text></TouchableOpacity></View><ScrollView>{COUNTRIES.map(([code,label])=><TouchableOpacity key={code} style={s.option} onPress={()=>handleCountrySelect(code)}><Text style={s.optionText}>{label}</Text><Text style={s.optionCode}>{code}</Text></TouchableOpacity>)}</ScrollView></View></View></Modal>

    <Modal visible={dateOpen} transparent animationType="slide" onRequestClose={()=>setDateOpen(false)}><View style={s.modalBackdrop}><View style={s.modalCard}><View style={s.modalHeader}><Text style={s.modalTitle}>Date de naissance</Text><TouchableOpacity onPress={()=>setDateOpen(false)}><Text style={s.close}>Annuler</Text></TouchableOpacity></View><View style={s.dateColumns}><DateColumn title="Jour" values={Array.from({length:31},(_,i)=>i+1)} selected={dateDraft.day} onSelect={(v)=>setDateDraft(d=>({...d,day:v}))}/><DateColumn title="Mois" values={Array.from({length:12},(_,i)=>i+1)} selected={dateDraft.month} onSelect={(v)=>setDateDraft(d=>({...d,month:v}))}/><DateColumn title="Année" values={Array.from({length:parsed.currentYear-1920+1},(_,i)=>parsed.currentYear-i)} selected={dateDraft.year} onSelect={(v)=>setDateDraft(d=>({...d,year:v}))}/></View><TouchableOpacity style={s.primary} onPress={confirmDate}><Text style={s.primaryText}>Valider la date</Text></TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
}

function Section({ title, subtitle, children }: { title:string; subtitle?:string; children:React.ReactNode }) { return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{subtitle?<Text style={s.sectionSubtitle}>{subtitle}</Text>:null}{children}</View>; }
function Field({ label, ...props }: any) { return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={[s.input,props.multiline&&s.multiline]} placeholderTextColor={colors.textMuted} {...props}/></View>; }
function Selector({ label, value, onPress }: { label:string; value:string; onPress:()=>void }) { return <View style={s.field}><Text style={s.label}>{label}</Text><TouchableOpacity style={s.selector} onPress={onPress}><Text style={s.selectorText}>{value}</Text><Text style={s.chevron}>›</Text></TouchableOpacity></View>; }
function QuickLink({ label, onPress }: { label:string; onPress:()=>void }) { return <TouchableOpacity style={s.quickLink} onPress={onPress}><Text style={s.quickLabel}>{label}</Text><Text style={s.chevron}>›</Text></TouchableOpacity>; }
function DateColumn({ title, values, selected, onSelect }: { title:string; values:number[]; selected:number; onSelect:(v:number)=>void }) { return <View style={s.dateCol}><Text style={s.dateTitle}>{title}</Text><ScrollView style={s.dateScroll}>{values.map(v=><TouchableOpacity key={v} style={[s.dateOption,selected===v&&s.dateOptionActive]} onPress={()=>onSelect(v)}><Text style={[s.dateText,selected===v&&s.dateTextActive]}>{String(v).padStart(title==='Année'?4:2,'0')}</Text></TouchableOpacity>)}</ScrollView></View>; }

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},center:{flex:1,alignItems:'center',justifyContent:'center'},muted:{color:colors.textMuted,fontSize:14},header:{minHeight:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:colors.border},headerBtn:{minWidth:72,minHeight:40,justifyContent:'center'},headerBtnText:{color:colors.textSecondary,fontSize:15,fontWeight:'700'},saveText:{color:colors.primaryLight,fontSize:15,fontWeight:'800',textAlign:'right'},title:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},content:{padding:18,paddingBottom:38},accountGate:{backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primary,borderRadius:radius.lg,padding:14,marginBottom:16},accountGateTitle:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},accountGateText:{color:colors.textSecondary,fontSize:13,lineHeight:19,marginTop:4},section:{backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:16,marginBottom:16},sectionTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900',marginBottom:4},sectionSubtitle:{color:colors.textMuted,fontSize:14,lineHeight:20,marginBottom:10},avatarRow:{flexDirection:'row',alignItems:'center',gap:14,marginTop:10},avatar:{width:74,height:74,borderRadius:37,backgroundColor:colors.background},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarK:{color:colors.primaryLight,fontSize:26,fontWeight:'900'},field:{marginTop:14},label:{color:colors.textSecondary,fontSize:14,fontWeight:'700',marginBottom:7},input:{minHeight:46,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,color:colors.textPrimary,paddingHorizontal:12,fontSize:16,backgroundColor:colors.background},multiline:{minHeight:86,paddingTop:12,textAlignVertical:'top'},hint:{color:colors.textMuted,fontSize:13,lineHeight:19,marginTop:7},selector:{minHeight:46,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.background,paddingHorizontal:12,flexDirection:'row',alignItems:'center'},selectorText:{flex:1,color:colors.textPrimary,fontSize:16},chevron:{color:colors.primaryLight,fontSize:24,fontWeight:'800'},locationButton:{minHeight:46,borderRadius:23,borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',paddingHorizontal:16,backgroundColor:'#5B3F8C'},locationButtonText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},lookupButton:{minHeight:40,marginTop:8,borderRadius:20,borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center',backgroundColor:'#123D2C'},lookupText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},genderWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},genderChip:{minHeight:40,paddingHorizontal:12,borderRadius:20,borderWidth:1,borderColor:colors.border,justifyContent:'center'},genderChipActive:{backgroundColor:colors.primary,borderColor:colors.primary},genderText:{color:colors.textSecondary,fontSize:14,fontWeight:'700'},genderTextActive:{color:colors.white},supportCard:{marginTop:10,marginBottom:4,padding:12,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.background},supportLabel:{color:colors.textMuted,fontSize:12,fontWeight:'800',textTransform:'uppercase',letterSpacing:.7},supportNumber:{color:colors.primaryLight,fontSize:16,fontWeight:'900',marginTop:5,letterSpacing:.5},quickLink:{minHeight:50,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},quickLabel:{flex:1,color:colors.textPrimary,fontSize:15,fontWeight:'800'},error:{color:colors.danger,textAlign:'center',marginBottom:12,fontSize:14,fontWeight:'700'},primary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.white,fontSize:16,fontWeight:'900'},connectButton:{minHeight:48,marginTop:12,borderRadius:24,borderWidth:1,borderColor:'#39C98A',backgroundColor:'#123D2C',alignItems:'center',justifyContent:'center'},connectText:{color:'#74F3B6',fontSize:14,fontWeight:'900'},disconnectButton:{minHeight:48,marginTop:12,borderRadius:24,borderWidth:1,borderColor:'#C84A58',backgroundColor:'#35161D',alignItems:'center',justifyContent:'center'},disconnectText:{color:'#FF8B96',fontSize:14,fontWeight:'900'},playlists:{minHeight:48,marginTop:12,borderRadius:24,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},playlistsText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},advanced:{minHeight:44,marginTop:8,borderRadius:22,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#24163A',alignItems:'center',justifyContent:'center'},advancedText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'flex-end'},modalCard:{maxHeight:'88%',backgroundColor:colors.backgroundCard,borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,borderWidth:1,borderColor:colors.border},modalHeader:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},modalTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},close:{color:colors.primaryLight,fontSize:15,fontWeight:'800'},continueTrial:{minHeight:40,alignItems:'center',justifyContent:'center',marginTop:6},continueTrialText:{color:colors.textMuted,fontSize:14,fontWeight:'800'},option:{minHeight:50,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},optionText:{flex:1,color:colors.textPrimary,fontSize:16,fontWeight:'700'},optionCode:{color:colors.textMuted,fontSize:14},dateColumns:{height:270,flexDirection:'row',gap:8,marginVertical:12},dateCol:{flex:1},dateTitle:{color:colors.textMuted,fontSize:13,fontWeight:'800',textAlign:'center',marginBottom:6},dateScroll:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:12},dateOption:{minHeight:42,alignItems:'center',justifyContent:'center'},dateOptionActive:{backgroundColor:colors.primary},dateText:{color:colors.textSecondary,fontSize:15,fontWeight:'700'},dateTextActive:{color:'#fff',fontWeight:'900'}
});