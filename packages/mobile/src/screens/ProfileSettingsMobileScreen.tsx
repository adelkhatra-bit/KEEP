import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { GenderOption } from '../types';

const GENDERS: { key: GenderOption; label: string }[] = [
  { key: 'MALE', label: 'Homme' }, { key: 'FEMALE', label: 'Femme' }, { key: 'OTHER', label: 'Autre' }, { key: 'PREFER_NOT_TO_SAY', label: 'Ne pas préciser' },
];
const COUNTRIES = [
  ['FR','France'],['BE','Belgique'],['CH','Suisse'],['LU','Luxembourg'],['MC','Monaco'],['ES','Espagne'],['IT','Italie'],['PT','Portugal'],['DE','Allemagne'],['NL','Pays-Bas'],['GB','Royaume-Uni'],['IE','Irlande'],['US','États-Unis'],['CA','Canada'],['MA','Maroc'],['DZ','Algérie'],['TN','Tunisie'],['AE','Émirats arabes unis'],['SA','Arabie saoudite'],['TR','Turquie'],['GR','Grèce'],['HR','Croatie'],['SE','Suède'],['NO','Norvège'],['DK','Danemark'],['FI','Finlande'],['PL','Pologne'],['CZ','Tchéquie'],['RO','Roumanie'],['JP','Japon'],['KR','Corée du Sud'],['AU','Australie'],['BR','Brésil'],['MX','Mexique'],['IN','Inde'],['ZA','Afrique du Sud']
] as const;

export default function ProfileSettingsMobileScreen({ navigation }: any) {
  const { user, updateUser, setPrivateInfo } = useUserStore();
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [birthDate, setBirthDate] = useState(user?.privateInfo.birthDate ?? '');
  const [gender, setGender] = useState<GenderOption | undefined>(user?.privateInfo.gender);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const parsed = useMemo(() => {
    const parts = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const now = new Date();
    return { year: parts ? Number(parts[1]) : 1990, month: parts ? Number(parts[2]) : 1, day: parts ? Number(parts[3]) : 1, currentYear: now.getFullYear() };
  }, [birthDate]);
  const [dateDraft, setDateDraft] = useState({ year: parsed.year, month: parsed.month, day: parsed.day });

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.muted}>Aucun compte actif.</Text></View></SafeAreaView>;

  const save = () => {
    const cleanUsername = username.trim().replace(/^@+/, '').replace(/\s+/g, '');
    if (cleanUsername.length < 3) return setError('Le pseudo doit contenir au moins 3 caractères.');
    setError('');
    updateUser({ username: cleanUsername, bio: bio.trim(), city: city.trim() || undefined, countryCode: countryCode || undefined, website: website.trim() || undefined });
    setPrivateInfo({ birthDate: birthDate || undefined, gender });
    navigation.goBack();
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return void Alert.alert('Localisation', 'Autorise la localisation pour remplir automatiquement la ville et le pays.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const place = places[0];
      if (place) {
        setCity(place.city || place.subregion || place.region || '');
        if (place.isoCountryCode) setCountryCode(place.isoCountryCode.toUpperCase());
      }
    } catch {
      Alert.alert('Localisation', 'Impossible de récupérer la position pour le moment.');
    } finally { setLocating(false); }
  };

  const confirmDate = () => {
    const maxDay = new Date(dateDraft.year, dateDraft.month, 0).getDate();
    const safeDay = Math.min(dateDraft.day, maxDay);
    setBirthDate(`${dateDraft.year}-${String(dateDraft.month).padStart(2,'0')}-${String(safeDay).padStart(2,'0')}`);
    setDateOpen(false);
  };

  return <SafeAreaView style={s.container}>
    <View style={s.header}>
      <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}><Text style={s.headerBtnText}>‹ Retour</Text></TouchableOpacity>
      <Text style={s.title}>Modifier le profil</Text>
      <TouchableOpacity style={s.headerBtn} onPress={save}><Text style={s.saveText}>Enregistrer</Text></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Section title="Identité">
        <Field label="Pseudo" value={username} onChangeText={setUsername} placeholder="tonpseudo" autoCapitalize="none" />
        <Text style={s.hint}>Visible publiquement sous la forme @{username.trim().replace(/^@+/, '') || 'pseudo'}.</Text>
        <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Quelques mots sur toi" multiline />
      </Section>

      <Section title="Localisation" subtitle="Tu peux remplir manuellement ou utiliser ta position.">
        <TouchableOpacity style={s.locationButton} onPress={useCurrentLocation} disabled={locating}>
          {locating ? <ActivityIndicator color={colors.primaryLight} /> : <Text style={s.locationButtonText}>⌖ Utiliser ma position</Text>}
        </TouchableOpacity>
        <Field label="Ville" value={city} onChangeText={setCity} placeholder="Lyon" />
        <Selector label="Pays" value={COUNTRIES.find((c) => c[0] === countryCode)?.[1] ?? 'Choisir un pays'} onPress={() => setCountryOpen(true)} />
        <Field label="Site web" value={website} onChangeText={setWebsite} placeholder="https://..." autoCapitalize="none" />
      </Section>

      <Section title="Informations privées" subtitle="Ces informations ne sont jamais affichées sur ton profil public.">
        <Selector label="Date de naissance" value={birthDate || 'Choisir une date'} onPress={() => { setDateDraft({ year: parsed.year, month: parsed.month, day: parsed.day }); setDateOpen(true); }} />
        <Text style={s.hint}>Utilisée pour les filtres d’âge et les événements 18+.</Text>
        <Text style={[s.label,{marginTop:18}]}>Genre</Text>
        <View style={s.genderWrap}>{GENDERS.map((item) => <TouchableOpacity key={item.key} style={[s.genderChip, gender === item.key && s.genderChipActive]} onPress={() => setGender(item.key)}><Text style={[s.genderText, gender === item.key && s.genderTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
      </Section>

      <Section title="KEEP">
        <QuickLink label="Notifications" onPress={() => navigation.navigate('Notifications')} />
        <QuickLink label="Services musicaux" onPress={() => navigation.navigate('MusicConnections')} />
        <QuickLink label="Offre & crédits" onPress={() => navigation.navigate('Offers')} />
      </Section>

      {error ? <Text style={s.error}>{error}</Text> : null}
      <TouchableOpacity style={s.primary} onPress={save}><Text style={s.primaryText}>Enregistrer les modifications</Text></TouchableOpacity>
      <TouchableOpacity style={s.playlists} onPress={() => navigation.navigate('Main', { screen: 'MyMusic' })}><Text style={s.playlistsText}>← Revenir aux Playlists</Text></TouchableOpacity>
      <TouchableOpacity style={s.advanced} onPress={() => navigation.navigate('AdvancedProfileSettings')}><Text style={s.advancedText}>Réglages avancés du profil</Text></TouchableOpacity>
    </ScrollView>

    <Modal visible={countryOpen} transparent animationType="slide" onRequestClose={() => setCountryOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.modalCard}><View style={s.modalHeader}><Text style={s.modalTitle}>Choisir le pays</Text><TouchableOpacity onPress={() => setCountryOpen(false)}><Text style={s.close}>Fermer</Text></TouchableOpacity></View><ScrollView>{COUNTRIES.map(([code,label]) => <TouchableOpacity key={code} style={s.option} onPress={() => { setCountryCode(code); setCountryOpen(false); }}><Text style={s.optionText}>{label}</Text><Text style={s.optionCode}>{code}</Text></TouchableOpacity>)}</ScrollView></View></View>
    </Modal>

    <Modal visible={dateOpen} transparent animationType="slide" onRequestClose={() => setDateOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.modalCard}><View style={s.modalHeader}><Text style={s.modalTitle}>Date de naissance</Text><TouchableOpacity onPress={() => setDateOpen(false)}><Text style={s.close}>Annuler</Text></TouchableOpacity></View>
        <View style={s.dateColumns}>
          <DateColumn title="Jour" values={Array.from({length:31},(_,i)=>i+1)} selected={dateDraft.day} onSelect={(v)=>setDateDraft(d=>({...d,day:v}))} />
          <DateColumn title="Mois" values={Array.from({length:12},(_,i)=>i+1)} selected={dateDraft.month} onSelect={(v)=>setDateDraft(d=>({...d,month:v}))} />
          <DateColumn title="Année" values={Array.from({length:parsed.currentYear-1920+1},(_,i)=>parsed.currentYear-i)} selected={dateDraft.year} onSelect={(v)=>setDateDraft(d=>({...d,year:v}))} />
        </View>
        <TouchableOpacity style={s.primary} onPress={confirmDate}><Text style={s.primaryText}>Valider la date</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

function Section({ title, subtitle, children }: { title:string; subtitle?:string; children:React.ReactNode }) { return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}{children}</View>; }
function Field({ label, ...props }: any) { return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={[s.input, props.multiline && s.multiline]} placeholderTextColor={colors.textMuted} {...props} /></View>; }
function Selector({ label, value, onPress }: { label:string; value:string; onPress:()=>void }) { return <View style={s.field}><Text style={s.label}>{label}</Text><TouchableOpacity style={s.selector} onPress={onPress}><Text style={s.selectorText}>{value}</Text><Text style={s.chevron}>›</Text></TouchableOpacity></View>; }
function QuickLink({ label, onPress }: { label:string; onPress:()=>void }) { return <TouchableOpacity style={s.quickLink} onPress={onPress}><Text style={s.quickLabel}>{label}</Text><Text style={s.chevron}>›</Text></TouchableOpacity>; }
function DateColumn({ title, values, selected, onSelect }: { title:string; values:number[]; selected:number; onSelect:(v:number)=>void }) { return <View style={s.dateCol}><Text style={s.dateTitle}>{title}</Text><ScrollView style={s.dateScroll}>{values.map(v => <TouchableOpacity key={v} style={[s.dateOption,selected===v&&s.dateOptionActive]} onPress={()=>onSelect(v)}><Text style={[s.dateText,selected===v&&s.dateTextActive]}>{String(v).padStart(title==='Année'?4:2,'0')}</Text></TouchableOpacity>)}</ScrollView></View>; }

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background}, center:{flex:1,alignItems:'center',justifyContent:'center'}, muted:{color:colors.textMuted}, header:{minHeight:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:colors.border}, headerBtn:{minWidth:72,minHeight:40,justifyContent:'center'}, headerBtnText:{color:colors.textSecondary,fontSize:13,fontWeight:'700'}, saveText:{color:colors.primaryLight,fontSize:13,fontWeight:'800',textAlign:'right'}, title:{color:colors.textPrimary,fontSize:18,fontWeight:'900'}, content:{padding:18,paddingBottom:38}, section:{backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:16,marginBottom:16}, sectionTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginBottom:4}, sectionSubtitle:{color:colors.textMuted,fontSize:12,lineHeight:17,marginBottom:10}, field:{marginTop:14}, label:{color:colors.textSecondary,fontSize:12,fontWeight:'700',marginBottom:7}, input:{minHeight:46,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,color:colors.textPrimary,paddingHorizontal:12,fontSize:14,backgroundColor:colors.background}, multiline:{minHeight:86,paddingTop:12,textAlignVertical:'top'}, hint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:7}, selector:{minHeight:46,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.background,paddingHorizontal:12,flexDirection:'row',alignItems:'center'}, selectorText:{flex:1,color:colors.textPrimary,fontSize:14}, chevron:{color:colors.primaryLight,fontSize:24,fontWeight:'800'}, locationButton:{minHeight:46,borderRadius:23,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12,backgroundColor:colors.backgroundElevated}, locationButtonText:{color:colors.primaryLight,fontSize:13,fontWeight:'900'}, genderWrap:{flexDirection:'row',flexWrap:'wrap',gap:8}, genderChip:{minHeight:38,paddingHorizontal:12,borderRadius:19,borderWidth:1,borderColor:colors.border,justifyContent:'center'}, genderChipActive:{backgroundColor:colors.primary,borderColor:colors.primary}, genderText:{color:colors.textSecondary,fontSize:12,fontWeight:'700'}, genderTextActive:{color:colors.white}, quickLink:{minHeight:50,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border}, quickLabel:{flex:1,color:colors.textPrimary,fontSize:13,fontWeight:'800'}, error:{color:colors.danger,textAlign:'center',marginBottom:12,fontSize:12,fontWeight:'700'}, primary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'}, primaryText:{color:colors.white,fontSize:14,fontWeight:'900'}, playlists:{minHeight:48,marginTop:12,borderRadius:24,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center'}, playlistsText:{color:colors.primaryLight,fontSize:13,fontWeight:'800'}, advanced:{minHeight:44,marginTop:8,alignItems:'center',justifyContent:'center'}, advancedText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'flex-end'}, modalCard:{maxHeight:'78%',backgroundColor:colors.backgroundCard,borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,borderWidth:1,borderColor:colors.border}, modalHeader:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, modalTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900'}, close:{color:colors.primaryLight,fontSize:13,fontWeight:'800'}, option:{minHeight:50,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border}, optionText:{flex:1,color:colors.textPrimary,fontSize:14,fontWeight:'700'}, optionCode:{color:colors.textMuted,fontSize:12,fontWeight:'800'}, dateColumns:{height:280,flexDirection:'row',gap:8,marginVertical:12}, dateCol:{flex:1}, dateTitle:{color:colors.textMuted,fontSize:11,fontWeight:'800',textAlign:'center',marginBottom:6}, dateScroll:{flex:1}, dateOption:{minHeight:42,alignItems:'center',justifyContent:'center',borderRadius:12}, dateOptionActive:{backgroundColor:colors.primary}, dateText:{color:colors.textSecondary,fontSize:14,fontWeight:'700'}, dateTextActive:{color:colors.white,fontWeight:'900'},
});