import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Localization from 'expo-localization';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import {
  detectedDeviceLanguageTag,
  loadPulsePreferenceState,
  savePulsePreferences,
  searchMusicCountries,
  searchMusicGenres,
  searchMusicLanguages,
  snoozePulsePreferences,
  MusicCountryOption,
  MusicGenreOption,
  MusicLanguageOption,
} from '../services/pulsePreferenceService';

type Tab = 'STYLES' | 'LANGUAGES' | 'COUNTRIES';
type Props = { onDone: () => void; onLater: () => void; compact?: boolean };

const FAMILY_SHORTCUTS = [
  'Pop','Hip-Hop','R&B','Rock','Electronic','Dance','House','Techno','Afrobeats','Amapiano',
  'Reggae','Dancehall','Funk','Soul','Jazz','Blues','Country','Folk','Latin','Reggaeton',
  'Salsa','Bachata','Cumbia','Brazilian','Sertanejo','Pagode','K-Pop','J-Pop','Bollywood',
  'Arabic Pop','Raï','Turkish','Classical','Metal','Alternative','Indie','Soundtrack',
];

function localDisplayName(kind: 'region' | 'language', code: string, fallback: string) {
  try {
    const locale = Localization.getLocales?.()?.[0]?.languageTag || 'en';
    const DisplayNames = (Intl as any).DisplayNames;
    if (!DisplayNames) return fallback;
    const names = new DisplayNames([locale], { type: kind });
    return names.of(code) || fallback;
  } catch { return fallback; }
}

export default function MusicTasteQuestionnaire({ onDone, onLater, compact = false }: Props) {
  const [tab, setTab] = useState<Tab>('STYLES');
  const [query, setQuery] = useState('');
  const [genres, setGenres] = useState<MusicGenreOption[]>([]);
  const [countries, setCountries] = useState<MusicCountryOption[]>([]);
  const [languages, setLanguages] = useState<MusicLanguageOption[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);

  const detectedTag = useMemo(() => detectedDeviceLanguageTag(), []);
  const detectedCountry = useMemo(() => {
    try { return Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase() || ''; } catch { return ''; }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [state, genreRows, languageRows, countryRows] = await Promise.all([
          loadPulsePreferenceState().catch(() => null),
          searchMusicGenres('', 140).catch(() => []),
          searchMusicLanguages('', 220).catch(() => []),
          searchMusicCountries('', 260).catch(() => []),
        ]);
        if (!live) return;
        if (state) {
          setSelectedGenres(state.favoriteGenres);
          setSelectedCountries(state.countryCodes);
          setSelectedLanguages(state.languageCodes);
        }
        setGenres(genreRows);
        setLanguages(languageRows);
        setCountries(countryRows);
      } finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!query.trim()) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      setCatalogBusy(true);
      const task = tab === 'STYLES'
        ? searchMusicGenres(query, 140).then(setGenres)
        : tab === 'LANGUAGES'
          ? searchMusicLanguages(query, 220).then(setLanguages)
          : searchMusicCountries(query, 260).then(setCountries);
      task.catch(() => {}).finally(() => { if (live) setCatalogBusy(false); });
    }, 260);
    return () => { live = false; clearTimeout(timer); };
  }, [query, tab]);

  const toggle = (value: string, current: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, max: number) => {
    setter((rows) => {
      if (rows.includes(value)) return rows.filter((x) => x !== value);
      if (rows.length >= max) {
        Alert.alert('Sélection complète', 'Tu peux sélectionner jusqu’à ' + max + ' choix dans cette rubrique.');
        return rows;
      }
      return [...rows, value];
    });
  };

  const selectDetected = () => {
    if (detectedCountry && !selectedCountries.includes(detectedCountry)) setSelectedCountries((rows) => [...rows, detectedCountry].slice(0, 20));
    const shortLang = (detectedTag || '').split('-')[0].toLowerCase();
    const aliases: Record<string,string> = { fr:'fra', en:'eng', es:'spa', pt:'por', de:'deu', it:'ita', ar:'ara', tr:'tur', ru:'rus', zh:'zho', ja:'jpn', ko:'kor', hi:'hin' };
    const wanted = aliases[shortLang] || shortLang;
    const match = languages.find((row) => row.code === wanted || row.code === shortLang);
    if (match && !selectedLanguages.includes(match.code)) setSelectedLanguages((rows) => [...rows, match.code].slice(0, 20));
  };

  const confirm = async () => {
    if (!selectedGenres.length) {
      Alert.alert('Choisis au moins un style', 'Loki Pulse a besoin d’au moins un style musical pour éviter de te proposer des sons au hasard.');
      setTab('STYLES');
      return;
    }
    setSaving(true);
    try {
      await savePulsePreferences({ genres: selectedGenres, languageCodes: selectedLanguages, countryCodes: selectedCountries, preferredLanguageTag: detectedTag });
      onDone();
    } catch (error: any) {
      Alert.alert('Loki Pulse', String(error?.message || '').includes('PULSE_STYLE') ? 'Choisis au moins un style musical.' : 'Impossible d’enregistrer tes préférences pour le moment.');
    } finally { setSaving(false); }
  };

  const later = async () => { await snoozePulsePreferences(24).catch(() => null); onLater(); };
  const shortcutRows = FAMILY_SHORTCUTS.map((label) => ({ label, key: label.toLowerCase() }));

  const body = tab === 'STYLES' ? <>
    <Text style={s.helper}>Choisis tes univers. Tu peux aussi rechercher n’importe quel sous-genre : la liste mondiale est synchronisée automatiquement.</Text>
    <View style={s.chips}>{shortcutRows.map((row) => {
      const on = selectedGenres.some((g) => g.toLowerCase() === row.key);
      return <TouchableOpacity key={row.key} style={[s.chip,on&&s.chipOn]} onPress={() => toggle(row.label,selectedGenres,setSelectedGenres,30)}><Text style={[s.chipText,on&&s.chipTextOn]}>{row.label}</Text></TouchableOpacity>;
    })}</View>
    <Text style={s.subTitle}>TOUS LES STYLES</Text>
    <View style={s.chips}>{genres.map((row) => {
      const on = selectedGenres.some((g) => g.toLowerCase() === row.label.toLowerCase());
      return <TouchableOpacity key={row.genreKey} style={[s.chip,s.catalogChip,on&&s.chipOn]} onPress={() => toggle(row.label,selectedGenres,setSelectedGenres,30)}>
        <Text style={[s.chipText,on&&s.chipTextOn]} numberOfLines={1}>{row.label}</Text>
        {row.trackCount > 0 ? <Text style={[s.countMini,on&&s.countMiniOn]}>{row.trackCount}</Text> : null}
      </TouchableOpacity>;
    })}</View>
  </> : tab === 'LANGUAGES' ? <>
    <Text style={s.helper}>Sélectionne les langues dans lesquelles tu veux découvrir de la musique. Aucun choix = toutes les langues.</Text>
    <View style={s.chips}>{languages.map((row) => {
      const on = selectedLanguages.includes(row.code);
      const label = localDisplayName('language',row.code,row.name);
      return <TouchableOpacity key={row.code} style={[s.chip,on&&s.chipOn]} onPress={() => toggle(row.code,selectedLanguages,setSelectedLanguages,20)}><Text style={[s.chipText,on&&s.chipTextOn]}>{label}</Text></TouchableOpacity>;
    })}</View>
  </> : <>
    <Text style={s.helper}>Choisis un ou plusieurs marchés musicaux. Aucun pays = Monde entier.</Text>
    <View style={s.chips}>{countries.map((row) => {
      const on = selectedCountries.includes(row.code);
      const label = localDisplayName('region',row.code,row.name);
      return <TouchableOpacity key={row.code} style={[s.chip,on&&s.chipOn]} onPress={() => toggle(row.code,selectedCountries,setSelectedCountries,20)}><Text style={[s.chipText,on&&s.chipTextOn]}>{label}</Text><Text style={[s.countMini,on&&s.countMiniOn]}>{row.code}</Text></TouchableOpacity>;
    })}</View>
  </>;

  if (busy) return <View style={[s.loading,compact&&s.compact]}><ActivityIndicator color={colors.keep}/><Text style={s.loadingText}>Préparation de ton Pulse…</Text></View>;

  return <View style={[s.root,compact&&s.compact]}>
    <View style={s.hero}>
      <View style={s.pulseOrb}><Text style={s.pulseOrbText}>◉</Text></View>
      <View style={s.heroCopy}><Text style={s.eyebrow}>LOKI PULSE · POUR TOI</Text><Text style={s.title}>Construis ton univers musical</Text><Text style={s.subtitle}>Styles + langues + pays. Plus tu précises, plus les trouvailles deviennent pertinentes.</Text></View>
    </View>
    <TouchableOpacity style={s.detected} onPress={selectDetected} accessibilityRole="button"><Text style={s.detectedTitle}>DÉTECTION APPAREIL</Text><Text style={s.detectedText}>{detectedTag || 'Langue inconnue'}{detectedCountry ? ' · ' + localDisplayName('region',detectedCountry,detectedCountry) : ''} · toucher pour ajouter</Text></TouchableOpacity>
    <View style={s.tabs}>{([['STYLES','STYLES · ' + selectedGenres.length],['LANGUAGES','LANGUES · ' + selectedLanguages.length],['COUNTRIES','PAYS · ' + selectedCountries.length]] as const).map(([key,label]) => <TouchableOpacity key={key} style={[s.tab,tab===key&&s.tabOn]} onPress={()=>{setTab(key);setQuery('');}}><Text style={[s.tabText,tab===key&&s.tabTextOn]}>{label}</Text></TouchableOpacity>)}</View>
    <View style={s.searchWrap}><Text style={s.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder={tab==='STYLES'?'Rechercher un style / sous-genre':tab==='LANGUAGES'?'Rechercher une langue':'Rechercher un pays'} placeholderTextColor={colors.textMuted} style={s.search} autoCorrect={false}/>{catalogBusy ? <ActivityIndicator size="small" color={colors.keep}/> : null}</View>
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{body}</ScrollView>
    <View style={s.footer}>
      <Text style={s.summary}>{selectedGenres.length + ' style' + (selectedGenres.length>1?'s':'') + ' · ' + (selectedLanguages.length || 'toutes') + ' langue' + (selectedLanguages.length===1?'':'s') + ' · ' + (selectedCountries.length || 'monde')}</Text>
      <View style={s.footerActions}>
        <TouchableOpacity style={[s.primary,s.footerAction,saving&&s.disabled]} onPress={()=>void confirm()} disabled={saving}>{saving ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>CRÉER MON PULSE</Text>}</TouchableOpacity>
        <TouchableOpacity style={[s.cancel,s.footerAction]} onPress={()=>void later()} disabled={saving}><Text style={s.cancelText}>ANNULER</Text></TouchableOpacity>
      </View>
      <Text style={s.reminderText}>Annuler ferme cette fenêtre et Loki te le reproposera plus tard.</Text>
    </View>
  </View>;
}

const s=StyleSheet.create({
  root:{width:'100%',maxHeight:'88%',backgroundColor:colors.backgroundCard,borderRadius:24,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
  compact:{maxHeight:'100%',borderRadius:0,borderWidth:0,flex:1},
  loading:{minHeight:260,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:colors.backgroundCard,borderRadius:24},
  loadingText:{color:colors.textMuted,fontSize:12,fontWeight:'800'},
  hero:{padding:18,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},
  pulseOrb:{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)',alignItems:'center',justifyContent:'center'},
  pulseOrbText:{color:colors.keep,fontSize:28,fontWeight:'900'},heroCopy:{flex:1,minWidth:0},
  eyebrow:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.2},title:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginTop:3},subtitle:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:5},
  detected:{marginHorizontal:14,marginTop:12,padding:11,borderRadius:14,borderWidth:1,borderColor:colors.primary,backgroundColor:'rgba(139,92,246,.10)'},detectedTitle:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.9},detectedText:{color:colors.textPrimary,fontSize:11,fontWeight:'800',marginTop:3},
  tabs:{flexDirection:'row',gap:6,paddingHorizontal:14,paddingTop:12},tab:{flex:1,minHeight:36,borderRadius:12,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',paddingHorizontal:4},tabOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},tabText:{color:colors.textMuted,fontSize:8,fontWeight:'900'},tabTextOn:{color:'#FFF'},
  searchWrap:{margin:12,marginBottom:4,minHeight:42,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},searchIcon:{color:colors.primaryLight,fontSize:17,fontWeight:'900'},search:{flex:1,color:colors.textPrimary,fontSize:12},
  scroll:{maxHeight:380},scrollContent:{padding:14,paddingBottom:18},helper:{color:colors.textMuted,fontSize:11,lineHeight:16,marginBottom:10},subTitle:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:18,marginBottom:8},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{minHeight:34,maxWidth:'100%',paddingHorizontal:11,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:5},catalogChip:{maxWidth:210},chipOn:{backgroundColor:colors.keep,borderColor:colors.keep},chipText:{maxWidth:165,color:colors.textPrimary,fontSize:11,fontWeight:'800'},chipTextOn:{color:colors.black,fontWeight:'900'},countMini:{color:colors.textMuted,fontSize:8,fontWeight:'900'},countMiniOn:{color:'rgba(0,0,0,.65)'},
  footer:{padding:14,borderTopWidth:1,borderTopColor:colors.border,gap:8},summary:{color:colors.textMuted,fontSize:10,textAlign:'center'},footerActions:{flexDirection:'row',alignItems:'stretch',gap:8},footerAction:{flex:1,minWidth:0},primary:{minHeight:48,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10},disabled:{opacity:.6},primaryText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.4,textAlign:'center'},cancel:{minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:10},cancelText:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:.4},reminderText:{color:colors.textMuted,fontSize:9,lineHeight:13,textAlign:'center'},later:{minHeight:36,alignItems:'center',justifyContent:'center'},laterText:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},
});
