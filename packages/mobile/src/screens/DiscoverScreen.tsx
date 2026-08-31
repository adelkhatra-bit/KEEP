import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { getDiscoveryAccess, DiscoveryAccess } from '../services/growthAccessService';
import { loadCurrentPlanCode } from '../services/planService';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';
import ProfileCounterRow from '../components/ProfileCounterRow';
import { loadPublicProfileSnapshot, PublicProfileSnapshot } from '../services/publicProfileStateService';

const DISCOVERY_RADII = [5, 10, 25, 50, 100, 250, 500, 1000, 5000, 20000];
const FREE_LOCAL_DISCOVERY_LIMIT = 3;

type SearchPosition = { latitude: number; longitude: number };

type ProfileCard = {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  countryCode?: string;
  approxLat?: number | null;
  approxLng?: number | null;
  favoriteGenres: string[];
  favoriteArtists: string[];
  certificationTier?: 'FREE' | 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO' | 'UNVERIFIED';
};

function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function normalizeOptionalCoordinate(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function overlapScore(a: string[], b: string[]): number {
  const left = new Set(a.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const right = new Set(b.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!left.size || !right.size) return 0;
  const matches = [...left].filter((item) => right.has(item)).length;
  return Math.round((matches / Math.max(left.size, right.size)) * 100);
}

export default function DiscoverScreen({ navigation }: any) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [planCode, setPlanCode] = useState('FREE');
  const [radiusKm, setRadiusKm] = useState(25);
  const [profileIndex, setProfileIndex] = useState(0);
  const [discoveryAccess, setDiscoveryAccess] = useState<DiscoveryAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [guestSeenIds, setGuestSeenIds] = useState<string[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [followNotice, setFollowNotice] = useState('');
  const [avatarFailedFor, setAvatarFailedFor] = useState<string | null>(null);
  const [currentProfileSnapshot, setCurrentProfileSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [searchPosition, setSearchPosition] = useState<SearchPosition | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [profileQuery, setProfileQuery] = useState('');
  // BUG RÉEL trouvé le 30/08/2026 (audit Découvertes en direct, Adel : "je
  // fais une recherche... ça ne fonctionne pas") : filteredProfiles changeait
  // `currentProfile` à CHAQUE frappe, et l'effet de vérification d'accès
  // (getDiscoveryAccess/keep_discovery_profile_access) consomme réellement un
  // crédit Découvertes par profil vérifié -- taper un pseudo de quelques
  // lettres épuisait donc le quota gratuit (3) en une seconde, avant même que
  // l'utilisateur voie un résultat. `committedQuery` ne se met à jour que
  // 400ms après la dernière frappe : le champ reste réactif à l'écran, mais
  // le filtrage qui déclenche la vérification de crédit ne bouge plus à
  // chaque caractère.
  const [committedQuery, setCommittedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(profileQuery), 400);
    return () => clearTimeout(timer);
  }, [profileQuery]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (isDemoMode || !supabase) {
        if (live) setProfiles([
          { id: 'demo-julie', username: 'julie.vibes', bio: 'Pop française · Lyon', city: 'Lyon', countryCode: 'FR', approxLat: 45.764, approxLng: 4.836, favoriteGenres: ['Pop', 'Dance'], favoriteArtists: ['Dua Lipa', 'Angèle'] },
          { id: 'demo-maxime', username: 'maxime.mix', bio: 'Rap · Afro · soirées', city: 'Villeurbanne', countryCode: 'FR', approxLat: 45.771, approxLng: 4.88, favoriteGenres: ['Rap', 'Afro'], favoriteArtists: ['Damso', 'Burna Boy'] },
          { id: 'demo-lea', username: 'lea.keep', bio: 'R&B · Soul', city: 'Lyon', countryCode: 'FR', approxLat: 45.75, approxLng: 4.85, favoriteGenres: ['R&B', 'Soul'], favoriteArtists: ['SZA', 'The Weeknd'] },
        ]);
        return;
      }
      setLoadingProfiles(true);
      try {
        let query = supabase
          .from('profiles')
          .select('id,username,avatar_url,bio,city,country_code,approx_lat,approx_lng,favorite_genres,favorite_artists,certification_tier')
          .eq('is_public', true)
          .eq('discovery_hidden', false)
          .order('updated_at', { ascending: false })
          .limit(100);
        if (user?.id) query = query.neq('id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        if (live) setProfiles((data ?? []).map((row: any) => ({
          id: row.id,
          username: row.username || 'keep-user',
          avatarUrl: row.avatar_url || undefined,
          bio: row.bio || undefined,
          city: row.city || undefined,
          countryCode: row.country_code || undefined,
          approxLat: normalizeOptionalCoordinate(row.approx_lat),
          approxLng: normalizeOptionalCoordinate(row.approx_lng),
          favoriteGenres: normalizeList(row.favorite_genres),
          favoriteArtists: normalizeList(row.favorite_artists),
          certificationTier: row.certification_tier || undefined,
        })));
      } catch {
        if (live) setProfiles([]);
      } finally { if (live) setLoadingProfiles(false); }
    };
    void load();
    return () => { live = false; };
  }, [isDemoMode, user?.id]);

  useEffect(() => {
    let live = true;
    const loadPlan = async () => {
      if (isDemoMode) { if (live) setPlanCode('DEMO'); return; }
      if (!user || isLocalGuest) { if (live) setPlanCode('FREE'); return; }
      try {
        const code = await loadCurrentPlanCode(user.id);
        if (live) setPlanCode(code || 'FREE');
      } catch { if (live) setPlanCode('FREE'); }
    };
    void loadPlan();
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  useEffect(() => {
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setGuestSeenIds([]);
    setFollowNotice('');
    setSearchPosition(null);
    setHasSearched(false);
    setCurrentProfileSnapshot(null);
    setProfileQuery('');
  }, [user?.id]);

  const filteredProfiles = useMemo(() => {
    const needle = committedQuery.trim().replace(/^@/, '').toLowerCase();
    const candidates = needle
      ? profiles.filter((profile) => profile.username.toLowerCase().includes(needle))
      : profiles;

    // Découvertes doit être utile dès l'ouverture : le GPS affine le classement,
    // il ne doit jamais être une condition pour voir ou retrouver un profil public.
    if (!hasSearched || !searchPosition) return candidates;

    const ranked = candidates.map((profile) => {
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
  }, [profiles, committedQuery, radiusKm, searchPosition, hasSearched]);

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
            planCode: 'FREE', allowed,
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

  useEffect(() => { setAvatarFailedFor(null); }, [currentProfile?.id, currentProfile?.avatarUrl]);

  useEffect(() => {
    let live = true;
    setCurrentProfileSnapshot(null);
    if (!currentProfile?.id || discoveryAccess?.allowed === false) return () => { live = false; };
    void loadPublicProfileSnapshot(currentProfile.id)
      .then((snapshot) => { if (live) setCurrentProfileSnapshot(snapshot); })
      .catch(() => { if (live) setCurrentProfileSnapshot(null); });
    return () => { live = false; };
  }, [currentProfile?.id, discoveryAccess?.allowed]);

  const resetSearchResults = () => {
    setHasSearched(false);
    setSearchPosition(null);
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setCurrentProfileSnapshot(null);
    setFollowNotice('');
  };

  const searchAroundMe = async () => {
    if (searchBusy) return;
    setSearchBusy(true);
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setCurrentProfileSnapshot(null);
    setHasSearched(true);

    let persisted: SearchPosition | null = null;
    if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
      try {
        const { data } = await supabase.from('profiles').select('approx_lat,approx_lng').eq('id', user.id).maybeSingle();
        const lat = normalizeOptionalCoordinate(data?.approx_lat);
        const lng = normalizeOptionalCoordinate(data?.approx_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          persisted = { latitude: lat as number, longitude: lng as number };
          setSearchPosition(persisted);
        }
      } catch {}
    }

    try {
      const permission = await Promise.race([
        Location.requestForegroundPermissionsAsync(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPS_PERMISSION_TIMEOUT')), 7000)),
      ]);
      if (permission.status !== 'granted') {
        if (!persisted) setSearchPosition(null);
        Alert.alert('Localisation', persisted
          ? 'Loki utilise ta dernière position enregistrée. Tu peux autoriser le GPS plus tard pour l’actualiser.'
          : 'Le GPS n’est pas autorisé. Les profils publics restent disponibles et tu peux rechercher un pseudo directement.');
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPS_FIX_TIMEOUT')), 9000)),
      ]);
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setSearchPosition(next);
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        await supabase.from('profiles').update({ approx_lat: Math.round(next.latitude * 1000) / 1000, approx_lng: Math.round(next.longitude * 1000) / 1000, location_opt_in: true }).eq('id', user.id);
      }
    } catch {
      if (!persisted) setSearchPosition(null);
      Alert.alert('Localisation', persisted
        ? 'Position GPS lente : Loki utilise ta dernière position enregistrée pour cette recherche.'
        : 'Position GPS indisponible. Les profils publics restent visibles et la recherche par pseudo fonctionne quand même.');
    } finally { setSearchBusy(false); }
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
      setFollowNotice('Crée ton compte Loki pour pouvoir suivre cet utilisateur.');
      Alert.alert('Compte Loki requis', 'Crée ton compte Loki pour pouvoir suivre cet utilisateur.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer mon compte', onPress: openAccount },
      ]);
      return;
    }
    setFollowBusy(true);
    setFollowNotice('');
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: currentProfile.id });
      if (error) throw error;
      setFollowNotice(`Tu suis maintenant @${currentProfile.username}.`);
      nextProfile();
    } catch {
      setFollowNotice('Le suivi n’a pas abouti. Réessaie dans un instant.');
      Alert.alert('Suivre', 'Impossible de suivre ce profil pour le moment.');
    } finally { setFollowBusy(false); }
  };

  const compatibility = currentProfile ? overlapScore([...(user?.favoriteGenres ?? []), ...(user?.favoriteArtists ?? [])], [...currentProfile.favoriteGenres, ...currentProfile.favoriteArtists]) : null;
  const currentDistance = currentProfile && searchPosition && Number.isFinite(currentProfile.approxLat) && Number.isFinite(currentProfile.approxLng)
    ? distanceKm(searchPosition.latitude, searchPosition.longitude, currentProfile.approxLat as number, currentProfile.approxLng as number) : null;
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
          {currentProfile && !discoveryUnlocked && !accessLoading ? <TouchableOpacity style={styles.lockBadge} onPress={openPremium}><Text style={styles.lockText}>🔒 Premium</Text></TouchableOpacity> : currentProfile && freeRemaining !== null ? <TouchableOpacity style={styles.trialBadge} onPress={openPremium} accessibilityRole="button" accessibilityLabel="Voir Premium pour plus de découvertes"><Text style={styles.trialText}>FREE · {freeRemaining} RESTANT{freeRemaining === 1 ? '' : 'S'}</Text></TouchableOpacity> : null}
        </View>
        <View style={styles.usernameSearch}>
          <Text style={styles.usernameSearchIcon}>⌕</Text>
          <TextInput value={profileQuery} onChangeText={(value) => { setProfileQuery(value); setProfileIndex(0); setDiscoveryAccess(null); setCurrentProfileSnapshot(null); }} placeholder="Rechercher un pseudo Loki" placeholderTextColor="#8E849A" autoCapitalize="none" autoCorrect={false} style={styles.usernameSearchInput} accessibilityLabel="Rechercher un utilisateur Loki par pseudo" />
          {profileQuery ? <TouchableOpacity style={styles.usernameClear} onPress={() => { setProfileQuery(''); setProfileIndex(0); }} accessibilityLabel="Effacer la recherche"><Text style={styles.usernameClearText}>×</Text></TouchableOpacity> : null}
        </View>
        <View style={styles.searchPanel}>
          <View style={styles.radiusHeader}><Text style={styles.radiusLabel}>1 · DISTANCE</Text><View style={styles.radiusValue}><Text style={styles.radiusValueText}>{radiusKm >= 20000 ? 'MONDE' : `${radiusKm} KM`}</Text></View></View>
          <View style={styles.radiusTrack}><View style={[styles.radiusFill, { width: `${(DISCOVERY_RADII.indexOf(radiusKm as any) / (DISCOVERY_RADII.length - 1)) * 100}%` }]} /></View>
          <View style={styles.radiusChoices}>{DISCOVERY_RADII.map((value) => (
            <TouchableOpacity key={value} style={[styles.radiusChoice, radiusKm === value && styles.radiusChoiceOn]} onPress={() => { setRadiusKm(value); resetSearchResults(); }} accessibilityLabel={value >= 20000 ? 'Rayon Monde' : `Rayon ${value} kilomètres`}><Text style={[styles.radiusChoiceText, radiusKm === value && styles.radiusChoiceTextOn]}>{value >= 20000 ? 'Monde' : value}</Text></TouchableOpacity>
          ))}</View>
          <TouchableOpacity style={styles.searchButton} onPress={() => void searchAroundMe()} disabled={searchBusy} accessibilityLabel="Rechercher des profils autour de moi">{searchBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.searchButtonText}>2 · ⌖ RECHERCHER</Text>}</TouchableOpacity>
          <Text style={styles.searchHint}>{hasSearched && searchPosition ? `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} dans ce rayon` : `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} disponible${filteredProfiles.length > 1 ? 's' : ''} · le GPS affine ensuite la proximité`}</Text>
        </View>
        {loadingProfiles || (currentProfile && accessLoading) ? <ActivityIndicator color={colors.primaryLight} /> : !discoveryUnlocked && currentProfile ? (
          <TouchableOpacity style={styles.lockCard} onPress={openPremium}><Text style={styles.lockIcon}>🔒</Text><Text style={styles.lockTitle}>Tes découvertes Free sont utilisées</Text><Text style={styles.lockBody}>Le compte Free découvre 3 profils. Premium 2,99 €/mois passe Découvertes en illimité. Tu peux aussi gagner des profils supplémentaires en partageant Loki et en faisant grandir tes abonnés.</Text><Text style={styles.lockCta}>VOIR PREMIUM 2,99 €</Text></TouchableOpacity>
        ) : !currentProfile ? (
          <View style={styles.emptyCard}><Text style={styles.mutedHint}>{profileQuery ? `Aucun profil ne correspond à @${profileQuery.replace(/^@/, '')}.` : hasSearched ? 'Aucun profil public dans ce rayon. Élargis la jauge puis relance la recherche.' : 'Aucun autre profil public disponible pour le moment.'}</Text></View>
        ) : (
          <View style={styles.profileCard}>
            <TouchableOpacity activeOpacity={0.85} onPress={openCurrentProfile} style={styles.profileHero} accessibilityLabel={`Ouvrir le profil de ${currentProfile.username}`}>
              {currentProfile.avatarUrl && avatarFailedFor !== currentProfile.id ? <Image source={{ uri: currentProfile.avatarUrl }} style={styles.avatar} onError={() => setAvatarFailedFor(currentProfile.id)} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitial}>{currentProfile.username.slice(0,1).toUpperCase()}</Text></View>}
              <View style={styles.profileInfo}><View style={styles.profileNameRow}><Text style={styles.profileName}>@{currentProfile.username}</Text><ProfileCertificationBadge tier={currentProfileSnapshot?.certificationTier ?? currentProfile.certificationTier ?? 'UNVERIFIED'} compact /></View><Text style={styles.profileBio} numberOfLines={2}>{currentProfile.bio || 'Profil Loki public'}</Text><Text style={styles.proximity}>{proximity || 'Profil public Loki'}</Text></View>
            </TouchableOpacity>
            {currentProfileSnapshot ? <ProfileCounterRow kind="connections" compact items={[{ value: currentProfileSnapshot.followers, label: 'Abonnés' }, { value: currentProfileSnapshot.following, label: 'Abonnements' }]} /> : null}
            <View style={styles.matchRow}><View style={styles.matchBlock}><Text style={styles.matchValue}>{compatibility ?? 0}%</Text><Text style={styles.matchLabel}>AFFINITÉ</Text></View><View style={styles.matchBlock}><Text style={styles.matchValue}>{currentProfile.favoriteGenres.slice(0,2).join(' · ') || 'Loki'}</Text><Text style={styles.matchLabel}>VIBES</Text></View></View>
            <View style={styles.cardActions}><TouchableOpacity style={styles.passButton} onPress={nextProfile}><Text style={styles.passText}>PASSER</Text></TouchableOpacity><TouchableOpacity style={styles.followButton} onPress={() => void followCurrent()} disabled={followBusy}><Text style={styles.followText}>{followBusy ? '…' : '+ SUIVRE'}</Text></TouchableOpacity></View>
            {followNotice ? <Text style={styles.followNotice}>{followNotice}</Text> : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 110 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 10 },
  discoveryHeader:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:5},usernameSearch:{minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,marginBottom:7,borderRadius:16,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},usernameSearchIcon:{color:'#D9C8F7',fontSize:20,fontWeight:'800'},usernameSearchInput:{flex:1,minHeight:44,color:'#FFFFFF',fontSize:15,fontWeight:'700'},usernameClear:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#241A2F'},usernameClearText:{color:'#FFFFFF',fontSize:22,lineHeight:24,fontWeight:'700'},
  sectionTitle:{color:'#FFFFFF',fontSize:16,fontWeight:'900'},mutedHint:{color:'#C9C2D4',fontSize:12,lineHeight:17},
  lockBadge:{paddingHorizontal:9,paddingVertical:5,borderRadius:10,backgroundColor:'#241A31',borderWidth:1,borderColor:'#5A456F'},lockText:{color:'#F6EEFF',fontSize:10,fontWeight:'900'},trialBadge:{paddingHorizontal:9,paddingVertical:5,borderRadius:10,backgroundColor:'#142B20',borderWidth:1,borderColor:'#2F7E57'},trialText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},
  searchPanel:{padding:10,borderRadius:15,backgroundColor:'#130F1B',borderWidth:1,borderColor:'#332642',marginBottom:8},radiusHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:5},radiusLabel:{color:'#C8B7E5',fontSize:9,fontWeight:'900'},radiusValue:{minWidth:54,paddingHorizontal:8,paddingVertical:4,borderRadius:10,backgroundColor:'#23192F',alignItems:'center'},radiusValueText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},radiusTrack:{height:3,borderRadius:3,backgroundColor:'#2B2037',overflow:'hidden'},radiusFill:{height:3,borderRadius:3,backgroundColor:'#9B6DFF'},radiusChoices:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:6,marginBottom:5},radiusChoice:{minWidth:44,minHeight:44,paddingHorizontal:4,borderRadius:8,alignItems:'center',justifyContent:'center'},radiusChoiceOn:{backgroundColor:'#6543A0'},radiusChoiceText:{color:'#FFFFFF',fontSize:12,fontWeight:'800'},radiusChoiceTextOn:{color:'#FFFFFF'},searchButton:{minHeight:48,borderRadius:14,backgroundColor:'#6D46AE',alignItems:'center',justifyContent:'center',marginTop:2},searchButtonText:{color:'#FFFFFF',fontSize:14,fontWeight:'900',letterSpacing:.4},searchHint:{color:'#AFA5BF',fontSize:8,marginTop:5,textAlign:'center'},
  lockCard:{padding:16,borderRadius:20,backgroundColor:'#181121',borderWidth:1,borderColor:'#5C3E78',alignItems:'center'},lockIcon:{fontSize:26,marginBottom:8},lockTitle:{color:'#FFFFFF',fontSize:16,fontWeight:'900',textAlign:'center'},lockBody:{color:'#C9C0D4',fontSize:12,lineHeight:17,textAlign:'center',marginTop:6},lockCta:{color:'#D9C3FF',fontSize:12,fontWeight:'900',marginTop:12},
  emptyCard:{padding:18,borderRadius:18,backgroundColor:'#120E18',borderWidth:1,borderColor:'#30233C'},
  profileCard:{padding:12,borderRadius:22,backgroundColor:'#15101D',borderWidth:1,borderColor:'#4D3762'},profileHero:{flexDirection:'row',alignItems:'center',gap:12},avatar:{width:72,height:72,borderRadius:36,backgroundColor:'#241B30'},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarInitial:{color:'#FFFFFF',fontSize:30,fontWeight:'900'},profileInfo:{flex:1},profileNameRow:{flexDirection:'row',alignItems:'center',gap:6},profileName:{color:'#FFFFFF',fontSize:17,fontWeight:'900'},profileBio:{color:'#D2CADB',fontSize:12,lineHeight:17,marginTop:3},proximity:{color:'#A98BE2',fontSize:11,fontWeight:'800',marginTop:4},matchRow:{flexDirection:'row',gap:8,marginTop:12},matchBlock:{flex:1,minHeight:52,borderRadius:15,backgroundColor:'#20172A',alignItems:'center',justifyContent:'center'},matchValue:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},matchLabel:{color:'#AFA4BF',fontSize:8,fontWeight:'900',marginTop:2},cardActions:{flexDirection:'row',gap:9,marginTop:12},passButton:{flex:1,minHeight:48,borderRadius:16,backgroundColor:'#28202F',alignItems:'center',justifyContent:'center'},passText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},followButton:{flex:1,minHeight:48,borderRadius:16,backgroundColor:'#6945A8',alignItems:'center',justifyContent:'center'},followText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},followNotice:{color:'#82EEB6',fontSize:11,fontWeight:'800',textAlign:'center',marginTop:8},
});
