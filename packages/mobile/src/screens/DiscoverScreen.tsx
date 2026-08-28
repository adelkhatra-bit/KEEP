import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { computeMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { supabase } from '../services/supabaseClient';
import { loadCurrentPlanCode } from '../services/planService';
import { DiscoveryAccess, getDiscoveryAccess } from '../services/growthAccessService';
import { loadPublicProfileSnapshot, PublicProfileSnapshot } from '../services/publicProfileStateService';
import SwipeDeck from '../components/SwipeDeck';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';

type DiscoveryProfile = {
  id: string;
  username: string;
  avatarUrl?: string;
  bio: string;
  city?: string;
  countryCode?: string;
  kind: string;
  favoriteGenres: string[];
  favoriteArtists: string[];
  approxLat?: number;
  approxLng?: number;
};

const PROFILE_KIND_LABELS: Record<string, string> = {
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Établissement',
};
const FREE_LOCAL_DISCOVERY_LIMIT = 3;
const DISCOVERY_RADII = [10, 50, 100, 300, 1000, 20000] as const;

type SearchPosition = { latitude: number; longitude: number };

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function normalizeProfile(row: any): DiscoveryProfile {
  return {
    id: String(row.id),
    username: String(row.username || ''),
    avatarUrl: row.avatar_url || undefined,
    bio: String(row.bio || ''),
    city: row.city || undefined,
    countryCode: row.country_code || undefined,
    kind: String(row.kind || 'USER'),
    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres : [],
    favoriteArtists: Array.isArray(row.favorite_artists) ? row.favorite_artists : [],
    approxLat: Number.isFinite(Number(row.approx_lat)) ? Number(row.approx_lat) : undefined,
    approxLng: Number.isFinite(Number(row.approx_lng)) ? Number(row.approx_lng) : undefined,
  };
}

function overlapScore(me: string[], them: string[]) {
  const a = new Set(me.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const b = new Set(them.map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!a.size || !b.size) return null;
  let common = 0;
  a.forEach((value) => { if (b.has(value)) common += 1; });
  return Math.round((common / Math.max(a.size, b.size)) * 100);
}

export default function DiscoverScreen({ navigation }: any) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [profileIndex, setProfileIndex] = useState(0);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [planCode, setPlanCode] = useState('FREE');
  const [accessLoading, setAccessLoading] = useState(false);
  const [discoveryAccess, setDiscoveryAccess] = useState<DiscoveryAccess | null>(null);
  const [guestSeenIds, setGuestSeenIds] = useState<string[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [followNotice, setFollowNotice] = useState('');
  const [avatarFailedFor, setAvatarFailedFor] = useState<string | null>(null);
  const [currentProfileSnapshot, setCurrentProfileSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(100);
  const [searchPosition, setSearchPosition] = useState<SearchPosition | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  const myDna = useMemo(() => {
    const decisions: DnaSourceDecision[] = sessions.flatMap((session) =>
      session.tracks
        .filter((track) => track.status === 'kept')
        .map((track) => ({ artist: track.track.artist, genres: track.track.genres ?? [], decision: 'KEPT' as const, createdAt: track.detectedAt }))
    );
    return computeMusicDNA(decisions);
  }, [sessions]);

  const trends = useMemo(() => {
    const counts = new Map<string, number>();
    sessions.forEach((session) => session.tracks.forEach((track) => {
      if (track.status !== 'kept') return;
      counts.set(track.track.artist, (counts.get(track.track.artist) ?? 0) + 1);
    }));
    return Array.from(counts.entries()).map(([artist, count]) => ({ artist, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [sessions]);

  useEffect(() => {
    let live = true;
    const loadPlan = async () => {
      if (!user || isLocalGuest || isDemoMode) {
        if (live) setPlanCode(isDemoMode ? 'DEMO' : 'FREE');
        return;
      }
      try {
        const code = await loadCurrentPlanCode(user.id);
        if (live) setPlanCode(code || 'FREE');
      } catch { if (live) setPlanCode('FREE'); }
    };
    void loadPlan();
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadPlan(); });
    return () => { live = false; unsubscribe?.(); };
  }, [user?.id, isLocalGuest, isDemoMode, navigation]);

  useEffect(() => {
    let live = true;
    const loadProfiles = async () => {
      setLoadingProfiles(true);
      if (!supabase) { if (live) setLoadingProfiles(false); return; }
      try {
        let query = supabase
          .from('profiles')
          .select('id,username,avatar_url,bio,city,country_code,kind,favorite_genres,favorite_artists,approx_lat,approx_lng')
          .eq('is_public', true)
          .eq('discovery_hidden', false)
          .limit(80);
        if (user?.id && !isLocalGuest) query = query.neq('id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        if (!live) return;
        const normalized = (data ?? []).map(normalizeProfile).filter((profile) => profile.username);
        normalized.sort((a, b) => {
          const aCity = Boolean(user?.city && a.city && a.city.toLowerCase() === user.city.toLowerCase());
          const bCity = Boolean(user?.city && b.city && b.city.toLowerCase() === user.city.toLowerCase());
          if (aCity !== bCity) return aCity ? -1 : 1;
          const aCountry = Boolean(user?.countryCode && a.countryCode === user.countryCode);
          const bCountry = Boolean(user?.countryCode && b.countryCode === user.countryCode);
          if (aCountry !== bCountry) return aCountry ? -1 : 1;
          const aAvatar = Boolean(a.avatarUrl);
          const bAvatar = Boolean(b.avatarUrl);
          if (aAvatar !== bAvatar) return aAvatar ? -1 : 1;
          return a.username.localeCompare(b.username);
        });
        setProfiles(normalized);
        setProfileIndex(0);
      } catch {
        if (live) setProfiles([]);
      } finally { if (live) setLoadingProfiles(false); }
    };
    void loadProfiles();
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadProfiles(); });
    return () => { live = false; unsubscribe?.(); };
  }, [user?.id, user?.city, user?.countryCode, isLocalGuest, navigation]);

  const filteredProfiles = useMemo(() => {
    if (!searchPosition) return profiles;
    const ranked = profiles.map((profile) => {
      const hasCoordinates = Number.isFinite(profile.approxLat) && Number.isFinite(profile.approxLng);
      const distance = hasCoordinates
        ? distanceKm(searchPosition.latitude, searchPosition.longitude, profile.approxLat as number, profile.approxLng as number)
        : null;
      return { profile, distance };
    }).filter((item) => radiusKm >= 20000 ? true : item.distance !== null && item.distance <= radiusKm);
    ranked.sort((a, b) => {
      if (a.distance === null && b.distance === null) return a.profile.username.localeCompare(b.profile.username);
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
    return ranked.map((item) => item.profile);
  }, [profiles, radiusKm, searchPosition]);

  const currentProfile = filteredProfiles.length ? filteredProfiles[profileIndex % filteredProfiles.length] : null;

  useEffect(() => {
    let live = true;
    const check = async () => {
      if (!currentProfile) { if (live) setDiscoveryAccess(null); return; }
      setAccessLoading(true);
      try {
        if (isDemoMode) {
          if (live) setDiscoveryAccess({ planCode: 'DEMO', allowed: true, used: 0, limit: null, remaining: null, unlimited: true, newlyCounted: false });
          return;
        }
        if (!user || isLocalGuest) {
          const alreadySeen = guestSeenIds.includes(currentProfile.id);
          const allowed = alreadySeen || guestSeenIds.length < FREE_LOCAL_DISCOVERY_LIMIT;
          if (allowed && !alreadySeen && live) setGuestSeenIds((ids) => [...ids, currentProfile.id]);
          if (live) setDiscoveryAccess({
            planCode: 'FREE',
            allowed,
            used: alreadySeen ? guestSeenIds.length : Math.min(guestSeenIds.length + (allowed ? 1 : 0), FREE_LOCAL_DISCOVERY_LIMIT),
            limit: FREE_LOCAL_DISCOVERY_LIMIT,
            remaining: Math.max(FREE_LOCAL_DISCOVERY_LIMIT - guestSeenIds.length - (!alreadySeen && allowed ? 1 : 0), 0),
            unlimited: false,
            newlyCounted: allowed && !alreadySeen,
          });
          return;
        }
        const access = await getDiscoveryAccess(currentProfile.id);
        if (live) setDiscoveryAccess(access);
      } catch {
        if (live) setDiscoveryAccess({ planCode, allowed: planCode !== 'FREE', used: 0, limit: planCode === 'FREE' ? 3 : null, remaining: planCode === 'FREE' ? 0 : null, unlimited: planCode !== 'FREE', newlyCounted: false });
      } finally { if (live) setAccessLoading(false); }
    };
    void check();
    return () => { live = false; };
  }, [currentProfile?.id, user?.id, isLocalGuest, isDemoMode, planCode]);

  useEffect(() => {
    setAvatarFailedFor(null);
  }, [currentProfile?.id, currentProfile?.avatarUrl]);

  useEffect(() => {
    let live = true;
    setCurrentProfileSnapshot(null);
    if (!currentProfile?.id || discoveryAccess?.allowed === false) return () => { live = false; };
    void loadPublicProfileSnapshot(currentProfile.id)
      .then((snapshot) => { if (live) setCurrentProfileSnapshot(snapshot); })
      .catch(() => { if (live) setCurrentProfileSnapshot(null); });
    return () => { live = false; };
  }, [currentProfile?.id, discoveryAccess?.allowed]);

  const searchAroundMe = async () => {
    if (searchBusy) return;
    setSearchBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Localisation', 'Autorise la localisation pour rechercher les profils autour de toi.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setSearchPosition(next);
      setProfileIndex(0);
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        await supabase.from('profiles').update({
          approx_lat: Math.round(next.latitude * 1000) / 1000,
          approx_lng: Math.round(next.longitude * 1000) / 1000,
          location_opt_in: true,
        }).eq('id', user.id);
      }
    } catch {
      Alert.alert('Localisation', 'Impossible de récupérer ta position pour le moment.');
    } finally {
      setSearchBusy(false);
    }
  };

  const nextProfile = () => {
    setFollowNotice('');
    if (filteredProfiles.length) setProfileIndex((value) => (value + 1) % filteredProfiles.length);
  };

  const openPremium = () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'SOCIAL_DISCOVERY' });
  const openCurrentProfile = () => { if (currentProfile && discoveryAccess?.allowed) navigation.navigate('PublicProfile', { username: currentProfile.username }); };
  const openAccount = () => navigation.navigate('Main', { screen: 'Profile' });

  const followCurrent = async () => {
    if (!currentProfile || followBusy || !discoveryAccess?.allowed) return;
    if (!user || isLocalGuest || isDemoMode || !supabase) {
      setFollowNotice('Crée ton compte KEEP pour pouvoir suivre cet utilisateur.');
      Alert.alert('Compte KEEP requis', 'Crée ton compte KEEP pour pouvoir suivre cet utilisateur.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer mon compte', onPress: openAccount },
      ]);
      return;
    }
    setFollowBusy(true);
    setFollowNotice('');
    try {
      const { error } = await supabase.from('follows').upsert(
        { follower_id: user.id, followee_id: currentProfile.id },
        { onConflict: 'follower_id,followee_id', ignoreDuplicates: true },
      );
      if (error) throw error;
      nextProfile();
    } catch { Alert.alert('Suivre', 'Impossible de suivre ce profil pour le moment.'); }
    finally { setFollowBusy(false); }
  };

  const compatibility = currentProfile
    ? overlapScore(
        [...(user?.favoriteGenres ?? []), ...(user?.favoriteArtists ?? [])],
        [...currentProfile.favoriteGenres, ...currentProfile.favoriteArtists],
      )
    : null;

  const currentDistance = currentProfile && searchPosition && Number.isFinite(currentProfile.approxLat) && Number.isFinite(currentProfile.approxLng)
    ? distanceKm(searchPosition.latitude, searchPosition.longitude, currentProfile.approxLat as number, currentProfile.approxLng as number)
    : null;

  const proximity = currentProfile
    ? currentDistance !== null
      ? `${currentDistance < 1 ? '< 1' : Math.round(currentDistance)} km · ${[currentProfile.city, currentProfile.countryCode].filter(Boolean).join(' · ') || 'autour de toi'}`
      : user?.city && currentProfile.city && user.city.toLowerCase() === currentProfile.city.toLowerCase()
      ? `Même ville · ${currentProfile.city}`
      : user?.countryCode && currentProfile.countryCode === user.countryCode
        ? `Même pays · ${currentProfile.countryCode}`
        : [currentProfile.city, currentProfile.countryCode].filter(Boolean).join(' · ')
    : '';

  const discoveryUnlocked = isDemoMode || discoveryAccess?.allowed === true;
  const freeRemaining = discoveryAccess?.planCode === 'FREE' ? discoveryAccess.remaining : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('nav.discover')}</Text>

        <View style={styles.discoveryHeader}>
          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Profils autour de moi</Text><Text style={styles.mutedHint}>Découvre des personnes par proximité et affinités musicales.</Text></View>
          {!discoveryUnlocked && !accessLoading ? <TouchableOpacity style={styles.lockBadge} onPress={openPremium}><Text style={styles.lockText}>🔒 Premium</Text></TouchableOpacity> : freeRemaining !== null ? <TouchableOpacity style={styles.trialBadge} onPress={openPremium} accessibilityRole="button" accessibilityLabel="Voir Premium pour plus de découvertes"><Text style={styles.trialText}>FREE · {freeRemaining} RESTANT{freeRemaining === 1 ? '' : 'S'}</Text></TouchableOpacity> : null}
        </View>

        <View style={styles.searchPanel}>
          <View style={styles.radiusHeader}>
            <Text style={styles.radiusLabel}>1 · DISTANCE</Text>
            <View style={styles.radiusValue}><Text style={styles.radiusValueText}>{radiusKm >= 20000 ? 'MONDE' : `${radiusKm} KM`}</Text></View>
          </View>
          <View style={styles.radiusTrack}><View style={[styles.radiusFill, { width: `${(DISCOVERY_RADII.indexOf(radiusKm as any) / (DISCOVERY_RADII.length - 1)) * 100}%` }]} /></View>
          <View style={styles.radiusChoices}>{DISCOVERY_RADII.map((value) => (
            <TouchableOpacity key={value} style={[styles.radiusChoice, radiusKm === value && styles.radiusChoiceOn]} onPress={() => { setRadiusKm(value); setProfileIndex(0); }} accessibilityLabel={value >= 20000 ? 'Rayon Monde' : `Rayon ${value} kilomètres`}>
              <Text style={[styles.radiusChoiceText, radiusKm === value && styles.radiusChoiceTextOn]}>{value >= 20000 ? 'Monde' : value}</Text>
            </TouchableOpacity>
          ))}</View>
          <TouchableOpacity style={styles.searchButton} onPress={() => void searchAroundMe()} disabled={searchBusy} accessibilityLabel="Rechercher des profils autour de moi">
            {searchBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.searchButtonText}>2 · ⌖ RECHERCHER</Text>}
          </TouchableOpacity>
          <Text style={styles.searchHint}>{searchPosition ? `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} dans ce rayon` : 'Choisis d’abord la distance, puis appuie sur Rechercher.'}</Text>
        </View>

        {accessLoading || loadingProfiles ? <ActivityIndicator color={colors.primaryLight} /> : !discoveryUnlocked && currentProfile ? (
          <TouchableOpacity style={styles.lockCard} onPress={openPremium}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.lockTitle}>Tes découvertes Free sont utilisées</Text>
            <Text style={styles.lockBody}>Le compte Free découvre 3 profils. Premium 2,99 €/mois passe Découvertes en illimité. Tu peux aussi gagner des profils supplémentaires en partageant KEEP et en faisant grandir tes abonnés.</Text>
            <Text style={styles.lockCta}>VOIR PREMIUM 2,99 €</Text>
          </TouchableOpacity>
        ) : !currentProfile ? (
          <View style={styles.emptyCard}><Text style={styles.mutedHint}>{searchPosition ? 'Aucun profil public dans ce rayon. Élargis la jauge puis relance la recherche.' : 'Aucun profil public disponible pour le moment.'}</Text></View>
        ) : (
          <>
            <SwipeDeck resetKey={currentProfile.id} enabled={!followBusy} onSwipeLeft={nextProfile} onSwipeRight={followCurrent} leftLabel="PASSER" rightLabel="SUIVRE" hint="Glisse ← pour passer · → pour suivre">
              <View style={styles.swipeCard}>
                {currentProfile.avatarUrl && avatarFailedFor !== currentProfile.id ? <Image source={{ uri: currentProfile.avatarUrl }} style={styles.heroAvatar} resizeMode="cover" onError={() => setAvatarFailedFor(currentProfile.id)} /> : <View style={[styles.heroAvatar,styles.heroFallback]}><Text style={styles.heroLetter}>{currentProfile.username.slice(0,1).toUpperCase()}</Text></View>}
                <View style={styles.heroInfo}>
                  <View style={styles.heroNameRow}>
                    <Text style={styles.heroName}>@{currentProfile.username}</Text>
                    {currentProfileSnapshot ? <ProfileCertificationBadge tier={currentProfileSnapshot.certificationTier} compact /> : null}
                    {compatibility !== null ? <View style={styles.compatBadge}><Text style={styles.compatText}>{compatibility}% ADN</Text></View> : null}
                  </View>
                  {proximity ? <Text style={styles.location}>{proximity}</Text> : <Text style={styles.location}>Localisation non partagée</Text>}
                  <View style={styles.kindMusicRow}>
                    <Text style={styles.kind}>{PROFILE_KIND_LABELS[currentProfile.kind] ?? currentProfile.kind}</Text>
                    {currentProfileSnapshot ? <Text style={styles.musicCount}>{currentProfileSnapshot.totalPublicKeeps} KEEP public{currentProfileSnapshot.totalPublicKeeps > 1 ? 's' : ''}</Text> : null}
                  </View>
                  {currentProfile.bio ? <Text style={styles.bio} numberOfLines={2}>{currentProfile.bio}</Text> : null}
                  {(currentProfile.favoriteGenres.length || currentProfile.favoriteArtists.length) ? <View style={styles.chips}>{[...currentProfile.favoriteGenres,...currentProfile.favoriteArtists].slice(0,4).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View> : null}
                </View>
              </View>
            </SwipeDeck>
            <View style={styles.swipeActions}>
              <TouchableOpacity style={[styles.roundAction,styles.passAction]} onPress={nextProfile} accessibilityLabel="Passer ce profil"><Text style={styles.passActionText}>✕</Text></TouchableOpacity>
              <TouchableOpacity style={styles.profileAction} onPress={openCurrentProfile} accessibilityLabel="Voir le profil"><Text style={styles.profileActionText}>VOIR PROFIL</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.roundAction,styles.followAction]} onPress={() => void followCurrent()} disabled={followBusy} accessibilityLabel="Suivre ce profil">{followBusy ? <ActivityIndicator color="#111"/> : <Text style={styles.followActionText}>＋</Text>}</TouchableOpacity>
            </View>
            {followNotice ? <TouchableOpacity style={styles.followNotice} onPress={openAccount} accessibilityRole="button" accessibilityLabel="Créer un compte KEEP pour suivre"><Text style={styles.followNoticeText}>{followNotice} <Text style={styles.followNoticeCta}>CRÉER MON COMPTE</Text></Text></TouchableOpacity> : null}
          </>
        )}

        {!user?.city && <TouchableOpacity style={styles.locationHint} onPress={() => navigation.navigate('ProfileSettings')}><Text style={styles.locationHintText}>📍 Ajoute ta ville ou utilise ta position pour améliorer les profils autour de toi.</Text></TouchableOpacity>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('discover.yourTrends')}</Text>
          {trends.length === 0 ? <Text style={styles.mutedHint}>{t('discover.emptyTrends')}</Text> : <View style={styles.chipsWrap}>{trends.map((trend) => <View key={trend.artist} style={styles.trendChip}><Text style={styles.trendChipText}>{trend.artist} · {trend.count}</Text></View>)}</View>}
        </View>

        <Text style={styles.footerNote}>KEEP utilise seulement les informations musicales et de localisation que l’utilisateur choisit de partager. Aucun système de rencontre n’est créé : il s’agit uniquement de découverte musicale et communautaire.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},content:{paddingHorizontal:11,paddingTop:8,flexGrow:1,paddingBottom:10},title:{...typography.h2,color:colors.textPrimary,marginBottom:4},section:{marginTop:8},sectionTitle:{...typography.h3,color:colors.textPrimary},mutedHint:{color:colors.textMuted,fontSize:11,lineHeight:15,marginTop:2},
  discoveryHeader:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:5},lockBadge:{paddingHorizontal:9,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},lockText:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},trialBadge:{paddingHorizontal:8,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(104,242,177,.12)',borderWidth:1,borderColor:'#2C8A60'},trialText:{color:'#68F2B1',fontSize:8,fontWeight:'900'},
  searchPanel:{marginBottom:6,padding:7,borderRadius:14,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},radiusHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},radiusLabel:{color:'#D9C8F7',fontSize:9,fontWeight:'900',letterSpacing:.4},radiusValue:{minHeight:26,paddingHorizontal:10,borderRadius:13,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},radiusValueText:{color:'#7CF2B9',fontSize:8,fontWeight:'900'},radiusTrack:{height:4,borderRadius:2,backgroundColor:'#332A3C',marginTop:6,overflow:'hidden'},radiusFill:{height:4,borderRadius:2,backgroundColor:'#A884FA'},radiusChoices:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:5},radiusChoice:{minWidth:29,minHeight:21,paddingHorizontal:3,borderRadius:11,alignItems:'center',justifyContent:'center'},radiusChoiceOn:{backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},radiusChoiceText:{color:'#A99DB9',fontSize:7,fontWeight:'800'},radiusChoiceTextOn:{color:'#FFFFFF'},searchButton:{height:32,marginTop:6,borderRadius:16,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},searchButtonText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},searchHint:{color:'#C8C0D3',fontSize:8,textAlign:'center',marginTop:3},
  lockCard:{padding:13,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',alignItems:'center'},lockIcon:{fontSize:24},lockTitle:{color:'#FFF',fontSize:15,fontWeight:'900',marginTop:6,textAlign:'center'},lockBody:{color:'#A99DB9',fontSize:11,lineHeight:16,textAlign:'center',marginTop:6},lockCta:{color:'#FFF',fontSize:10,fontWeight:'900',marginTop:10,backgroundColor:colors.primary,paddingHorizontal:16,paddingVertical:9,borderRadius:20,overflow:'hidden'},emptyCard:{padding:14,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  swipeCard:{height:228,borderRadius:20,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},heroAvatar:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},heroFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},heroLetter:{color:colors.primaryLight,fontSize:52,fontWeight:'900'},heroInfo:{padding:9,paddingTop:40,backgroundColor:'rgba(9,6,16,.72)'},heroNameRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},heroName:{color:'#FFF',fontSize:18,fontWeight:'900'},compatBadge:{paddingHorizontal:7,paddingVertical:3,borderRadius:radius.pill,backgroundColor:'rgba(104,242,177,.16)'},compatText:{color:'#68F2B1',fontSize:8,fontWeight:'900'},location:{color:'#E1D8EA',fontSize:10,fontWeight:'800',marginTop:3},kindMusicRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:3,flexWrap:'wrap'},kind:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},musicCount:{color:'#68F2B1',fontSize:9,fontWeight:'900'},bio:{color:'#C8C0D3',fontSize:9,lineHeight:12,marginTop:3},chips:{flexDirection:'row',flexWrap:'wrap',gap:3,marginTop:4},chip:{paddingHorizontal:6,paddingVertical:2,borderRadius:radius.pill,backgroundColor:'rgba(0,0,0,.45)',borderWidth:1,borderColor:'#4B3A61'},chipText:{color:'#FFF',fontSize:8,fontWeight:'800'},
  swipeActions:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,marginTop:6},roundAction:{width:39,height:39,borderRadius:20,alignItems:'center',justifyContent:'center',borderWidth:2},passAction:{borderColor:'#FF5F83',backgroundColor:'#151020'},passActionText:{color:'#FF5F83',fontSize:21,fontWeight:'800'},followAction:{borderColor:'#E5F266',backgroundColor:'#E5F266'},followActionText:{color:'#111',fontSize:24,fontWeight:'900'},profileAction:{minHeight:36,paddingHorizontal:14,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},profileActionText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  followNotice:{marginTop:6,alignSelf:'center',paddingHorizontal:10,paddingVertical:6,borderRadius:12,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',maxWidth:340},followNoticeText:{color:'#C8C0D3',fontSize:9,lineHeight:13,textAlign:'center'},followNoticeCta:{color:colors.primaryLight,fontWeight:'900'},
  locationHint:{marginTop:6,padding:7,borderRadius:12,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},locationHintText:{color:'#FFFFFF',fontSize:9,lineHeight:13,textAlign:'center',fontWeight:'800'},chipsWrap:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:5},trendChip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:8,paddingVertical:4},trendChipText:{color:colors.smartBadgeText,fontSize:10,fontWeight:'700'},footerNote:{color:colors.textMuted,fontSize:7,lineHeight:9,textAlign:'center',marginTop:7},
});