import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { computeMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { supabase } from '../services/supabaseClient';
import { getDownloadCreditStatus } from '../services/creditService';
import { hasFeature } from '../services/entitlementService';
import { loadCurrentPlanCode } from '../services/planService';
import SwipeDeck from '../components/SwipeDeck';

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
};

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
  const [trialRemaining, setTrialRemaining] = useState<number | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followNotice, setFollowNotice] = useState('');
  const [avatarFailedFor, setAvatarFailedFor] = useState<string | null>(null);

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
    const loadAccess = async () => {
      try {
        const credit = await getDownloadCreditStatus();
        if (live) setTrialRemaining(credit.unlimited ? 1 : credit.remaining ?? 0);
      } catch { if (live) setTrialRemaining(0); }
      if (user && !isLocalGuest && !isDemoMode) {
        try { const code = await loadCurrentPlanCode(user.id); if (live) setPlanCode(code || 'FREE'); } catch {}
      }
    };
    void loadAccess();
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadAccess(); });
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
          .select('id,username,avatar_url,bio,city,country_code,kind,favorite_genres,favorite_artists')
          .eq('is_public', true)
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

  const discoveryUnlocked = isDemoMode || (trialRemaining ?? 0) > 0 || hasFeature(planCode, 'SOCIAL_DISCOVERY');
  const currentProfile = profiles.length ? profiles[profileIndex % profiles.length] : null;

  useEffect(() => {
    setAvatarFailedFor(null);
  }, [currentProfile?.id, currentProfile?.avatarUrl]);

  const nextProfile = () => {
    setFollowNotice('');
    if (profiles.length) setProfileIndex((value) => (value + 1) % profiles.length);
  };

  const openPremium = () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'SOCIAL_DISCOVERY' });
  const openCurrentProfile = () => { if (currentProfile) navigation.navigate('PublicProfile', { username: currentProfile.username }); };
  const openAccount = () => navigation.navigate('Main', { screen: 'Profile' });

  const followCurrent = async () => {
    if (!currentProfile || followBusy) return;
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

  const proximity = currentProfile
    ? user?.city && currentProfile.city && user.city.toLowerCase() === currentProfile.city.toLowerCase()
      ? `Même ville · ${currentProfile.city}`
      : user?.countryCode && currentProfile.countryCode === user.countryCode
        ? `Même pays · ${currentProfile.countryCode}`
        : [currentProfile.city, currentProfile.countryCode].filter(Boolean).join(' · ')
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('nav.discover')}</Text>

        <View style={styles.discoveryHeader}>
          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Profils autour de moi</Text><Text style={styles.mutedHint}>Découvre des personnes par proximité et affinités musicales.</Text></View>
          {!discoveryUnlocked ? <TouchableOpacity style={styles.lockBadge} onPress={openPremium}><Text style={styles.lockText}>🔒 Premium</Text></TouchableOpacity> : trialRemaining !== null && planCode === 'FREE' ? <View style={styles.trialBadge}><Text style={styles.trialText}>ESSAI ACTIF</Text></View> : null}
        </View>

        {!discoveryUnlocked ? (
          <TouchableOpacity style={styles.lockCard} onPress={openPremium}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.lockTitle}>Débloquer les découvertes sociales</Text>
            <Text style={styles.lockBody}>Premium 2,99 €/mois permet de découvrir les profils autour de toi et d’explorer leurs univers musicaux. Pendant tes crédits de bienvenue, cette fonction reste testable gratuitement.</Text>
            <Text style={styles.lockCta}>VOIR PREMIUM 2,99 €</Text>
          </TouchableOpacity>
        ) : loadingProfiles ? <ActivityIndicator color={colors.primaryLight} /> : !currentProfile ? (
          <View style={styles.emptyCard}><Text style={styles.mutedHint}>Aucun profil public disponible pour le moment.</Text></View>
        ) : (
          <>
            <SwipeDeck resetKey={currentProfile.id} enabled={!followBusy} onSwipeLeft={nextProfile} onSwipeRight={followCurrent} leftLabel="PASSER" rightLabel="SUIVRE" hint="Glisse ← pour passer · → pour suivre">
              <View style={styles.swipeCard}>
                {currentProfile.avatarUrl && avatarFailedFor !== currentProfile.id ? <Image source={{ uri: currentProfile.avatarUrl }} style={styles.heroAvatar} resizeMode="cover" onError={() => setAvatarFailedFor(currentProfile.id)} /> : <View style={[styles.heroAvatar,styles.heroFallback]}><Text style={styles.heroLetter}>{currentProfile.username.slice(0,1).toUpperCase()}</Text></View>}
                <View style={styles.heroInfo}>
                  <View style={styles.heroNameRow}><Text style={styles.heroName}>@{currentProfile.username}</Text>{compatibility !== null ? <View style={styles.compatBadge}><Text style={styles.compatText}>{compatibility}% ADN</Text></View> : null}</View>
                  {proximity ? <Text style={styles.location}>{proximity}</Text> : <Text style={styles.location}>Localisation non partagée</Text>}
                  <Text style={styles.kind}>{currentProfile.kind}</Text>
                  {currentProfile.bio ? <Text style={styles.bio} numberOfLines={3}>{currentProfile.bio}</Text> : null}
                  {(currentProfile.favoriteGenres.length || currentProfile.favoriteArtists.length) ? <View style={styles.chips}>{[...currentProfile.favoriteGenres,...currentProfile.favoriteArtists].slice(0,5).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View> : null}
                </View>
              </View>
            </SwipeDeck>
            <View style={styles.swipeActions}>
              <TouchableOpacity style={[styles.roundAction,styles.passAction]} onPress={nextProfile}><Text style={styles.passActionText}>✕</Text></TouchableOpacity>
              <TouchableOpacity style={styles.profileAction} onPress={openCurrentProfile}><Text style={styles.profileActionText}>VOIR PROFIL</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.roundAction,styles.followAction]} onPress={() => void followCurrent()} disabled={followBusy}>{followBusy ? <ActivityIndicator color="#111"/> : <Text style={styles.followActionText}>＋</Text>}</TouchableOpacity>
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
  container:{flex:1,backgroundColor:colors.background},content:{padding:spacing.xl,flexGrow:1,paddingBottom:spacing.xxxl},title:{...typography.h1,color:colors.textPrimary,marginBottom:spacing.xl},section:{marginTop:spacing.xxl},sectionTitle:{...typography.h3,color:colors.textPrimary},mutedHint:{color:colors.textMuted,fontSize:12,lineHeight:17,marginTop:3},
  discoveryHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.md},lockBadge:{paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},lockText:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},trialBadge:{paddingHorizontal:9,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'rgba(104,242,177,.12)',borderWidth:1,borderColor:'#2C8A60'},trialText:{color:'#68F2B1',fontSize:9,fontWeight:'900'},
  lockCard:{padding:20,borderRadius:22,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',alignItems:'center'},lockIcon:{fontSize:28},lockTitle:{color:'#FFF',fontSize:17,fontWeight:'900',marginTop:8,textAlign:'center'},lockBody:{color:'#A99DB9',fontSize:12,lineHeight:18,textAlign:'center',marginTop:8},lockCta:{color:'#FFF',fontSize:11,fontWeight:'900',marginTop:15,backgroundColor:colors.primary,paddingHorizontal:18,paddingVertical:11,borderRadius:22,overflow:'hidden'},emptyCard:{padding:22,borderRadius:18,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  swipeCard:{height:430,borderRadius:26,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},heroAvatar:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},heroFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},heroLetter:{color:colors.primaryLight,fontSize:82,fontWeight:'900'},heroInfo:{padding:18,paddingTop:90,backgroundColor:'rgba(9,6,16,.72)'},heroNameRow:{flexDirection:'row',alignItems:'center',gap:8},heroName:{color:'#FFF',fontSize:26,fontWeight:'900'},compatBadge:{paddingHorizontal:8,paddingVertical:4,borderRadius:radius.pill,backgroundColor:'rgba(104,242,177,.16)'},compatText:{color:'#68F2B1',fontSize:9,fontWeight:'900'},location:{color:'#E1D8EA',fontSize:12,fontWeight:'800',marginTop:5},kind:{color:colors.primaryLight,fontSize:10,fontWeight:'900',marginTop:5},bio:{color:'#C8C0D3',fontSize:12,lineHeight:18,marginTop:8},chips:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:10},chip:{paddingHorizontal:8,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(0,0,0,.45)',borderWidth:1,borderColor:'#4B3A61'},chipText:{color:'#FFF',fontSize:9,fontWeight:'800'},
  swipeActions:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:16,marginTop:14},roundAction:{width:54,height:54,borderRadius:27,alignItems:'center',justifyContent:'center',borderWidth:2},passAction:{borderColor:'#FF5F83',backgroundColor:'#151020'},passActionText:{color:'#FF5F83',fontSize:24,fontWeight:'800'},followAction:{borderColor:'#E5F266',backgroundColor:'#E5F266'},followActionText:{color:'#111',fontSize:27,fontWeight:'900'},profileAction:{minHeight:46,paddingHorizontal:18,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},profileActionText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  followNotice:{marginTop:10,alignSelf:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:14,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',maxWidth:340},followNoticeText:{color:'#C8C0D3',fontSize:10,lineHeight:15,textAlign:'center'},followNoticeCta:{color:colors.primaryLight,fontWeight:'900'},
  locationHint:{marginTop:16,padding:12,borderRadius:14,backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},locationHintText:{color:'#B9AEC6',fontSize:11,lineHeight:16,textAlign:'center'},chipsWrap:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginTop:spacing.md},trendChip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:spacing.md,paddingVertical:6},trendChipText:{color:colors.smartBadgeText,fontSize:12,fontWeight:'700'},footerNote:{color:colors.textMuted,fontSize:10,lineHeight:15,textAlign:'center',marginTop:spacing.xxl},
});
