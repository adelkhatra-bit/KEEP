import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabaseClient';
import { createProfileService } from '../../services/profileService';
import {
  detectMusicLocale,
  loadMusicCountries,
  loadMusicGenres,
  MusicCountryOption,
  MusicGenreOption,
} from '../../services/musicTaxonomyService';
import { useUserStore } from '../../store/useUserStore';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';

const FALLBACK_GENRES = [
  'Pop', 'Hip-Hop', 'Rap', 'R&B', 'Rock', 'Dance', 'House', 'Afrobeats',
  'Reggae', 'Jazz', 'Soul', 'Funk', 'Electronic', 'Latin', 'Arabic Pop',
  'K-Pop', 'Bollywood', 'Classical', 'Country', 'Metal',
];

type Props = {
  onDone: () => void;
  onSkip: () => void;
};

export default function OnboardingGenresScreen({ onDone, onSkip }: Props) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const locale = useMemo(() => detectMusicLocale(), []);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(user?.favoriteGenres ?? []);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    user?.musicCountryCodes?.length
      ? user.musicCountryCodes
      : [user?.countryCode || locale.countryCode].filter(Boolean).map((value) => String(value).toUpperCase()),
  );
  const [genres, setGenres] = useState<MusicGenreOption[]>(FALLBACK_GENRES.map((label) => ({ key: label.toLowerCase(), label, trackCount: 0, featured: true })));
  const [countries, setCountries] = useState<MusicCountryOption[]>([]);
  const [genreQuery, setGenreQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoadingGenres(true);
      loadMusicGenres(genreQuery, genreQuery.trim() ? 120 : 80)
        .then((rows) => { if (live && rows.length) setGenres(rows); })
        .catch(() => {})
        .finally(() => { if (live) setLoadingGenres(false); });
    }, genreQuery.trim() ? 220 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [genreQuery]);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoadingCountries(true);
      loadMusicCountries(countryQuery, countryQuery.trim() ? 80 : 300)
        .then((rows) => { if (live) setCountries(rows); })
        .catch(() => {})
        .finally(() => { if (live) setLoadingCountries(false); });
    }, countryQuery.trim() ? 220 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [countryQuery]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      if (prev.length >= 30) return prev;
      return [...prev, genre];
    });
  };

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) return prev.filter((value) => value !== code);
      if (prev.length >= 12) return prev;
      return [...prev, code];
    });
  };

  const confirm = async () => {
    if (!user) return onDone();
    const nextUser = {
      ...user,
      favoriteGenres: selectedGenres.length ? selectedGenres : user.favoriteGenres,
      preferredLanguageTag: locale.languageTag,
      musicCountryCodes: selectedCountries.length ? selectedCountries : user.musicCountryCodes,
    };
    setBusy(true);
    try {
      if (supabase) await createProfileService(supabase).saveOwnProfile(nextUser).catch(() => null);
      setUser(nextUser);
    } finally {
      setBusy(false);
      onDone();
    }
  };

  const shownCountries = countries
    .filter((row) => countryQuery.trim() || selectedCountries.includes(row.code) || row.code === locale.countryCode)
    .slice(0, countryQuery.trim() ? 80 : 16);

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Text style={s.eyebrow}>TON LOKI MUSICAL</Text>
          <Text style={s.title}>Qu’est-ce qui te fait vibrer ?</Text>
          <Text style={s.subtitle}>Choisis plusieurs styles et pays. Loki les combine avec tes écoutes, tes découvertes et tes Battles pour personnaliser ton Pulse.</Text>
          <View style={s.detectedRow}>
            <Text style={s.detectedLabel}>LANGUE DÉTECTÉE</Text>
            <Text style={s.detectedValue}>{locale.languageTag}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Styles musicaux</Text>
          <Text style={s.sectionHint}>Recherche mondiale · sous-genres inclus · 30 maximum</Text>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>⌕</Text>
            <TextInput
              value={genreQuery}
              onChangeText={setGenreQuery}
              placeholder="Rap drill, amapiano, raï, indie, k-pop…"
              placeholderTextColor={colors.textMuted}
              style={s.search}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loadingGenres ? <ActivityIndicator size="small" color={colors.keep} /> : null}
          </View>
          <View style={s.chips}>
            {genres.map((genre) => {
              const on = selectedGenres.includes(genre.label);
              return (
                <TouchableOpacity key={genre.key} style={[s.chip, on && s.chipOn]} onPress={() => toggleGenre(genre.label)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{genre.label}</Text>
                  {genre.trackCount > 0 ? <Text style={[s.chipCount, on && s.chipCountOn]}>{genre.trackCount}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.count}>{selectedGenres.length} style{selectedGenres.length > 1 ? 's' : ''} sélectionné{selectedGenres.length > 1 ? 's' : ''}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Pays / scènes musicales</Text>
          <Text style={s.sectionHint}>Ton pays est proposé automatiquement, mais tu peux suivre plusieurs scènes.</Text>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>⌕</Text>
            <TextInput
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder="France, Brésil, Corée, Nigeria…"
              placeholderTextColor={colors.textMuted}
              style={s.search}
              autoCorrect={false}
            />
            {loadingCountries ? <ActivityIndicator size="small" color={colors.keep} /> : null}
          </View>
          <View style={s.countryList}>
            {shownCountries.map((country) => {
              const on = selectedCountries.includes(country.code);
              return (
                <TouchableOpacity key={country.code} style={[s.countryRow, on && s.countryRowOn]} onPress={() => toggleCountry(country.code)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <View style={s.countryCopy}>
                    <Text style={[s.countryName, on && s.countryNameOn]}>{country.name}</Text>
                    <Text style={s.countryLanguages} numberOfLines={1}>{country.languageCodes.slice(0, 5).join(' · ') || '—'}</Text>
                  </View>
                  <Text style={[s.countryCode, on && s.countryCodeOn]}>{on ? '✓ ' : ''}{country.code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.count}>{selectedCountries.length} pays sélectionné{selectedCountries.length > 1 ? 's' : ''}</Text>
        </View>

        <TouchableOpacity style={s.primary} onPress={confirm} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>CRÉER MON PULSE</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.ghost} onPress={onSkip} disabled={busy} accessibilityRole="button" accessibilityLabel="Passer cette étape">
          <Text style={s.ghostText}>Je choisirai plus tard</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},
  content:{paddingHorizontal:spacing.lg,paddingTop:spacing.xl,paddingBottom:spacing.xxl,gap:16},
  hero:{gap:6},
  eyebrow:{color:colors.keep,fontSize:9,fontWeight:'1000',letterSpacing:1.4,textAlign:'center'},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'1000',textAlign:'center'},
  subtitle:{color:colors.textMuted,fontSize:12,lineHeight:18,textAlign:'center',paddingHorizontal:6},
  detectedRow:{alignSelf:'center',marginTop:4,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:10,minHeight:28,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard},
  detectedLabel:{color:colors.textMuted,fontSize:8,fontWeight:'900',letterSpacing:.8},
  detectedValue:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},
  section:{borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:14,gap:10},
  sectionTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'1000'},
  sectionHint:{color:colors.textMuted,fontSize:10,lineHeight:15},
  searchWrap:{minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8},
  searchIcon:{color:colors.primaryLight,fontSize:17,fontWeight:'900'},
  search:{flex:1,color:colors.textPrimary,fontSize:13,paddingVertical:8},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{minHeight:36,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:6},
  chipOn:{backgroundColor:colors.keep,borderColor:colors.keep},
  chipText:{color:colors.textPrimary,fontSize:11,fontWeight:'800'},
  chipTextOn:{color:colors.black,fontWeight:'1000'},
  chipCount:{color:colors.textMuted,fontSize:8,fontWeight:'900'},
  chipCountOn:{color:'rgba(0,0,0,.62)'},
  count:{color:colors.textMutedGrey,fontSize:10,textAlign:'right'},
  countryList:{gap:7},
  countryRow:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:10},
  countryRowOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)'},
  countryCopy:{flex:1,minWidth:0},
  countryName:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  countryNameOn:{color:colors.keep},
  countryLanguages:{color:colors.textMuted,fontSize:9,marginTop:2},
  countryCode:{color:colors.textMuted,fontSize:10,fontWeight:'1000'},
  countryCodeOn:{color:colors.keep},
  primary:{minHeight:54,borderRadius:radius.pill,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  primaryText:{color:'#FFF',fontSize:14,fontWeight:'1000',letterSpacing:.5},
  ghost:{minHeight:42,alignItems:'center',justifyContent:'center'},
  ghostText:{color:colors.primaryLight,fontSize:13,fontWeight:'800'},
});
