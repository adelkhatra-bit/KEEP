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
  const [genres, setGenres] = useState<MusicGenreOption[]>([]);
  const [countries, setCountries] = useState<MusicCountryOption[]>([]);
  const [languages, setLanguages] = useState<MusicLanguageOption[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

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
        const shortLang = (detectedTag || '').split('-')[0].toLowerCase();
        const aliases: Record<string,string> = { fr:'fra', en:'eng', es:'spa', pt:'por', de:'deu', it:'ita', ar:'ara', tr:'tur', ru:'rus', zh:'zho', ja:'jpn', ko:'kor', hi:'hin' };
        const wanted = aliases[shortLang] || shortLang;
        const detectedLanguage = languageRows.find((row) => row.code === wanted || row.code === shortLang)?.code || '';
        const savedGenres = state?.favoriteGenres ?? [];
        const suggestedGenres = state?.suggestedGenres ?? [];
        const savedCountries = state?.countryCodes ?? [];
        const savedLanguages = state?.languageCodes ?? [];
        setSelectedGenres(savedGenres.length ? savedGenres : suggestedGenres.slice(0, 12));
        setSelectedCountries(savedCountries.length ? savedCountries : (detectedCountry ? [detectedCountry] : []));
        setSelectedLanguages(savedLanguages.length ? savedLanguages : (detectedLanguage ? [detectedLanguage] : []));
        setGenres(genreRows);
        setLanguages(languageRows);
        setCountries(countryRows);
      } finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return undefined;
    let live = true;
    setCatalogBusy(true);
    const timer = setTimeout(() => {
      const request = tab === 'STYLES'
        ? searchMusicGenres(query, 120)
        : tab === 'LANGUAGES'
          ? searchMusicLanguages(query, 220)
          : searchMusicCountries(query, 260);
      void request.then((rows: any[]) => {
        if (!live) return;
        if (tab === 'STYLES') setGenres(rows as MusicGenreOption[]);
        else if (tab === 'LANGUAGES') setLanguages(rows as MusicLanguageOption[]);
        else setCountries(rows as MusicCountryOption[]);
      }).catch(() => {}).finally(() => { if (live) setCatalogBusy(false); });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [searchQuery, tab]);

  const changeTab = (next: Tab) => {
    setTab(next);
    setSearchQuery('');
    setCatalogBusy(false);
  };

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
  const selectedLabels = tab === 'STYLES'
    ? selectedGenres.map((value) => ({ key: value, label: value }))
    : tab === 'LANGUAGES'
      ? selectedLanguages.map((code) => {
          const row = languages.find((item) => item.code === code);
          return { key: code, label: localDisplayName('language', code, row?.name || code) };
        })
      : selectedCountries.map((code) => {
          const row = countries.find((item) => item.code === code);
          return { key: code, label: localDisplayName('region', code, row?.name || code) };
        });
  const removeSelected = (value: string) => {
    if (tab === 'STYLES') setSelectedGenres((rows) => rows.filter((item) => item !== value));
    else if (tab === 'LANGUAGES') setSelectedLanguages((rows) => rows.filter((item) => item !== value));
    else setSelectedCountries((rows) => rows.filter((item) => item !== value));
  };

  const body = tab === 'STYLES' ? <>
    <Text style={s.helper}>Touche simplement les styles que tu aimes. Tu peux en choisir plusieurs.</Text>
    <View style={s.chips}>{shortcutRows.map((row) => {
      const on = selectedGenres.some((g) => g.toLowerCase() === row.key);
      return <TouchableOpacity key={row.key} style={[s.chip,on&&s.chipOn]} onPress={() => toggle(row.label,selectedGenres,setSelectedGenres,30)}><Text style={[s.chipText,on&&s.chipTextOn]}>{row.label}</Text></TouchableOpacity>;
    })}</View>
    <Text style={s.subTitle}>PLUS DE STYLES</Text>
    <View style={s.chips}>{genres.map((row) => {
      const on = selectedGenres.some((g) => g.toLowerCase() === row.label.toLowerCase());
      return <TouchableOpacity key={row.genreKey} style={[s.chip,s.catalogChip,on&&s.chipOn]} onPress={() => toggle(row.label,selectedGenres,setSelectedGenres,30)}>
        <Text style={[s.chipText,on&&s.chipTextOn]} numberOfLines={1}>{row.label}</Text>
        {row.trackCount > 0 ? <Text style={[s.countMini,on&&s.countMiniOn]}>{row.trackCount}</Text> : null}
      </TouchableOpacity>;
    })}</View>
  </> : tab === 'LANGUAGES' ? <>
    <Text style={s.helper}>Ta langue est déjà choisie. Ajoute-en une autre seulement si tu écoutes aussi de la musique dans cette langue.</Text>
    <View style={s.chips}>{languages.map((row) => {
      const on = selectedLanguages.includes(row.code);
      const label = localDisplayName('language',row.code,row.name);
      return <TouchableOpacity key={row.code} style={[s.chip,on&&s.chipOn]} onPress={() => toggle(row.code,selectedLanguages,setSelectedLanguages,20)}><Text style={[s.chipText,on&&s.chipTextOn]}>{label}</Text></TouchableOpacity>;
    })}</View>
  </> : <>
    <Text style={s.helper}>Ton pays est déjà choisi. Ajoute d’autres pays seulement si tu veux découvrir plus loin.</Text>
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
      <View style={s.heroCopy}><Text style={s.eyebrow}>LOKI PULSE · POUR TOI</Text><Text style={s.title}>Choisis les musiques que tu aimes</Text><Text style={s.subtitle}>Commence par tes styles. Langues et pays sont facultatifs. Loki apprend ensuite avec tes écoutes.</Text></View>
    </View>
    <View style={s.detected}><Text style={s.detectedTitle}>DÉJÀ PRÉPARÉ POUR TOI</Text><Text style={s.detectedText}>{detectedTag || 'Ta langue'}{detectedCountry ? ' · ' + localDisplayName('region',detectedCountry,detectedCountry) : ''} · change seulement si tu veux</Text></View>
    <View style={s.tabs}>{([['STYLES','STYLES · ' + selectedGenres.length],['LANGUAGES','LANGUES · ' + selectedLanguages.length],['COUNTRIES','PAYS · ' + selectedCountries.length]] as const).map(([key,label]) => <TouchableOpacity key={key} style={[s.tab,tab===key&&s.tabOn]} onPress={()=>changeTab(key)}><Text style={[s.tabText,tab===key&&s.tabTextOn]}>{label}</Text></TouchableOpacity>)}</View>
    <View style={s.searchWrap}>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={tab === 'STYLES' ? 'Chercher un style' : tab === 'LANGUAGES' ? 'Chercher une langue' : 'Chercher un pays'}
        placeholderTextColor={colors.textMutedGrey}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.searchInput}
      />
      {catalogBusy ? <ActivityIndicator size="small" color={colors.keep}/> : searchQuery ? <TouchableOpacity style={s.searchClear} onPress={() => setSearchQuery('')}><Text style={s.searchClearText}>×</Text></TouchableOpacity> : null}
    </View>
    <Text style={s.readyHint}>{searchQuery ? 'Résultats trouvés' : 'Touche un choix pour l’ajouter'}</Text>
    <View style={s.selectedBox}>
      <Text style={s.selectedTitle}>TES CHOIX · TOUCHE × POUR RETIRER</Text>
      {selectedLabels.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.selectedRail}>
          {selectedLabels.map((item) => (
            <TouchableOpacity key={item.key} style={s.selectedChip} onPress={() => removeSelected(item.key)} accessibilityLabel={`Retirer ${item.label}`}>
              <Text style={s.selectedChipText} numberOfLines={1}>{item.label}</Text>
              <Text style={s.selectedChipClose}>×</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : <Text style={s.selectedEmpty}>Aucun choix dans cette rubrique pour le moment.</Text>}
    </View>
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      nestedScrollEnabled
    >{body}</ScrollView>
    <View style={s.footer}>
      <Text style={s.summary}>{selectedGenres.length + ' style' + (selectedGenres.length>1?'s':'') + ' · ' + (selectedLanguages.length || 'toutes') + ' langue' + (selectedLanguages.length===1?'':'s') + ' · ' + (selectedCountries.length || 'monde')}</Text>
      <View style={s.footerActions}>
        <TouchableOpacity style={[s.primary,s.footerAction,saving&&s.disabled]} onPress={()=>void confirm()} disabled={saving}>{saving ? <ActivityIndicator color="#FFF"/> : <Text style={s.primaryText}>ENREGISTRER MES GOÛTS</Text>}</TouchableOpacity>
        <TouchableOpacity style={[s.cancel,s.footerAction]} onPress={()=>void later()} disabled={saving}><Text style={s.cancelText}>PLUS TARD</Text></TouchableOpacity>
      </View>
      <Text style={s.reminderText}>Tu pourras changer tes goûts à tout moment depuis ton profil.</Text>
    </View>
  </View>;
}

const s=StyleSheet.create({
  // Adel (02/10/2026) : sur téléphone le contenu dépassait 84 % et le bas
  // (liste + CRÉER / ANNULER) était coupé : impossible de valider ou sortir.
  // Hauteur fixe + liste qui défile + boutons toujours visibles.
  root:{width:'100%',maxWidth:640,height:'92%',maxHeight:860,alignSelf:'center',backgroundColor:colors.backgroundCard,borderRadius:24,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
  compact:{width:'100%',maxWidth:640,height:'100%',maxHeight:'100%',alignSelf:'center',borderRadius:18,borderWidth:1,flex:1},
  loading:{minHeight:260,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:colors.backgroundCard,borderRadius:24},
  loadingText:{color:colors.textMuted,fontSize:12,fontWeight:'800'},
  hero:{padding:18,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:colors.border},
  pulseOrb:{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)',alignItems:'center',justifyContent:'center'},
  pulseOrbText:{color:colors.keep,fontSize:28,fontWeight:'900'},heroCopy:{flex:1,minWidth:0},
  eyebrow:{color:colors.keep,fontSize:11,fontWeight:'900',letterSpacing:1.2},title:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginTop:3},subtitle:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:5},
  detected:{marginHorizontal:14,marginTop:12,padding:11,borderRadius:14,borderWidth:1,borderColor:colors.primary,backgroundColor:'rgba(139,92,246,.10)'},detectedTitle:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:.9},detectedText:{color:colors.textPrimary,fontSize:11,fontWeight:'800',marginTop:3},
  tabs:{flexDirection:'row',gap:6,paddingHorizontal:14,paddingTop:12},tab:{flex:1,minHeight:44,borderRadius:12,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',paddingHorizontal:4},tabOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},tabText:{color:colors.textMuted,fontSize:11,fontWeight:'900'},tabTextOn:{color:'#FFF'},
  searchWrap:{marginHorizontal:14,marginTop:12,minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',paddingLeft:12,paddingRight:8,gap:8},
  searchInput:{flex:1,minWidth:0,color:colors.textPrimary,fontSize:11,fontWeight:'800',paddingVertical:9},
  searchClear:{width:44,height:44,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  searchClearText:{color:colors.primaryLight,fontSize:18,fontWeight:'900',lineHeight:20},
  readyHint:{marginHorizontal:14,marginTop:8,color:colors.textMutedGrey,fontSize:11,fontWeight:'800',textAlign:'center'},
  selectedBox:{marginHorizontal:14,marginTop:10,paddingVertical:9,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},
  selectedTitle:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:.8,marginBottom:7},
  selectedRail:{gap:7,paddingRight:8},
  selectedChip:{maxWidth:190,minHeight:44,paddingHorizontal:9,borderRadius:15,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)',flexDirection:'row',alignItems:'center',gap:6},
  selectedChipText:{maxWidth:150,color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  selectedChipClose:{color:colors.keep,fontSize:15,fontWeight:'900'},
  selectedEmpty:{color:colors.textMutedGrey,fontSize:11},
  scroll:{flex:1,minHeight:120},scrollContent:{padding:14,paddingBottom:22},helper:{color:colors.textMuted,fontSize:11,lineHeight:16,marginBottom:10},subTitle:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:1,marginTop:18,marginBottom:8},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{minHeight:44,maxWidth:'100%',paddingHorizontal:11,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:5},catalogChip:{maxWidth:210},chipOn:{backgroundColor:colors.keep,borderColor:colors.keep},chipText:{maxWidth:165,color:colors.textPrimary,fontSize:11,fontWeight:'800'},chipTextOn:{color:colors.black,fontWeight:'900'},countMini:{color:colors.textMuted,fontSize:11,fontWeight:'900'},countMiniOn:{color:'rgba(0,0,0,.65)'},
  footer:{padding:14,borderTopWidth:1,borderTopColor:colors.border,gap:8},summary:{color:colors.textMuted,fontSize:11,textAlign:'center'},footerActions:{flexDirection:'row',alignItems:'stretch',gap:8},footerAction:{flex:1,minWidth:0},primary:{minHeight:48,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10},disabled:{opacity:.6},primaryText:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.4,textAlign:'center'},cancel:{minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:10},cancelText:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:.4},reminderText:{color:colors.textMuted,fontSize:11,lineHeight:13,textAlign:'center'},later:{minHeight:44,alignItems:'center',justifyContent:'center'},laterText:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},
});
