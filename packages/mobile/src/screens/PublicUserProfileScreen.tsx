import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { requestSocialLink } from '../services/notificationService';
import { useUserStore } from '../store/useUserStore';
import { SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';

type PublicKeepTrack = { id: string; trackId: string; title: string; artist: string; album?: string | null; artworkUrl?: string | null };
type SocialPlatform = SocialLink['platform'];

const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'snapchat', label: 'Snapchat' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'x', label: 'X' },
  { platform: 'facebook', label: 'Facebook' },
];

export default function PublicUserProfileScreen({ route, navigation }: any) {
  const username = route?.params?.username as string | undefined;
  const viewer = useUserStore((s) => s.user);
  const [profile, setProfile] = useState<User | null>(null);
  const [tracks, setTracks] = useState<PublicKeepTrack[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Suivre/Ne plus suivre (demande explicite du 26/08/2026 -- "abonné style
  // Insta"). `follows` était déjà utilisé pour COMPTER les abonnés (voir
  // profileService.ts) mais aucune action réelle n'existait nulle part pour
  // suivre quelqu'un -- le vrai trigger notify_on_follow (migration 0024)
  // n'avait donc jamais été déclenché par personne. Même pattern que
  // toggleLike ci-dessous (déjà réel, déjà testé), pas une nouvelle logique.
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!username || !supabase) { setError('Profil indisponible.'); setLoading(false); return; }
      try {
        const result = await createProfileService(supabase).loadPublicProfileByUsername(username);
        if (cancelled) return;
        if (!result) { setError('Ce profil est privé ou introuvable.'); return; }
        setProfile(result);
        setFollowerCount(result.followerCount);
        if (viewer?.id && viewer.id !== result.id) {
          const { data: existing } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('follower_id', viewer.id)
            .eq('followee_id', result.id)
            .maybeSingle();
          if (!cancelled) setIsFollowing(!!existing);
        }
        const { data, error: keepError } = await supabase
          .from('keep_decisions')
          .select('id, created_at, tracks!inner(id,title,artist,album,artwork_url)')
          .eq('profile_id', result.id)
          .eq('decision', 'KEPT')
          .eq('visibility', 'PUBLIC')
          .order('created_at', { ascending: false })
          .limit(60);
        if (!keepError && !cancelled) {
          const normalized = (data ?? []).map((row: any) => ({ id: row.id, trackId: String(row.tracks?.id ?? row.id), title: row.tracks?.title ?? 'Titre inconnu', artist: row.tracks?.artist ?? 'Artiste inconnu', album: row.tracks?.album ?? null, artworkUrl: row.tracks?.artwork_url ?? null }));
          setTracks(normalized);
          const ids = normalized.map((track: PublicKeepTrack) => track.trackId);
          if (ids.length > 0) {
            const { data: likes } = await supabase.from('track_likes').select('profile_id,track_id').in('track_id', ids);
            if (!cancelled) {
              const counts: Record<string, number> = {};
              const mine = new Set<string>();
              for (const row of likes ?? []) { counts[row.track_id] = (counts[row.track_id] || 0) + 1; if (viewer?.id && row.profile_id === viewer.id) mine.add(row.track_id); }
              setLikeCounts(counts); setLikedTrackIds(mine);
            }
          }
        }
      } catch { if (!cancelled) setError('Impossible de charger ce profil pour le moment.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [username, viewer?.id]);

  const albums = useMemo(() => Array.from(new Set(tracks.map((track) => track.album).filter(Boolean) as string[])), [tracks]);

  const openSocial = async (platform: SocialPlatform) => {
    if (!profile) return;
    const link = profile.socialLinks.find((item) => item.platform === platform && item.url.trim());
    if (!link) {
      if (viewer && viewer.id !== profile.id) {
        try { await requestSocialLink(profile.id, platform); } catch { /* popup stays useful even if notification fails */ }
      }
      Alert.alert('Réseau non partagé', `Malheureusement, @${profile.username} ne partage pas ce réseau social pour le moment.`);
      return;
    }
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau social pour le moment.'); }
  };

  const toggleFollow = async () => {
    if (!supabase || !viewer) { Alert.alert('Connexion requise', 'Connecte-toi à KEEP pour suivre ce profil.'); return; }
    if (!profile || viewer.id === profile.id || followBusy) return;
    setFollowBusy(true);
    if (isFollowing) {
      const { error: deleteError } = await supabase.from('follows').delete().eq('follower_id', viewer.id).eq('followee_id', profile.id);
      if (!deleteError) { setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1)); }
    } else {
      const { error: insertError } = await supabase.from('follows').insert({ follower_id: viewer.id, followee_id: profile.id });
      if (!insertError) { setIsFollowing(true); setFollowerCount((c) => c + 1); }
    }
    setFollowBusy(false);
  };

  const toggleLike = async (trackId: string) => {
    if (!supabase || !viewer) { Alert.alert('Connexion requise', 'Connecte-toi à KEEP pour liker ce morceau.'); return; }
    const alreadyLiked = likedTrackIds.has(trackId);
    const next = new Set(likedTrackIds);
    if (alreadyLiked) {
      const { error: deleteError } = await supabase.from('track_likes').delete().eq('profile_id', viewer.id).eq('track_id', trackId);
      if (deleteError) return;
      next.delete(trackId); setLikeCounts((current) => ({ ...current, [trackId]: Math.max(0, (current[trackId] || 0) - 1) }));
    } else {
      const { error: insertError } = await supabase.from('track_likes').insert({ profile_id: viewer.id, track_id: trackId });
      if (insertError) return;
      next.add(trackId); setLikeCounts((current) => ({ ...current, [trackId]: (current[trackId] || 0) + 1 }));
    }
    setLikedTrackIds(next);
  };

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator color={colors.primaryLight} /></View></SafeAreaView>;
  if (!profile || error) return <SafeAreaView style={styles.container}><View style={styles.topBar}><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></TouchableOpacity></View><View style={styles.center}><Text style={styles.muted}>{error ?? 'Profil introuvable.'}</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <Text style={styles.title}>@{profile.username}</Text><View style={styles.placeholder} />
        </View>
        <View style={styles.hero}>
          {profile.avatar ? <Image source={{ uri: profile.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>K</Text></View>}
          <Text style={styles.username}>@{profile.username}</Text><Text style={styles.kind}>{profile.kind}</Text>
          {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = Boolean(profile.socialLinks.find((link) => link.platform === item.platform && link.url.trim()));
              return <TouchableOpacity key={item.platform} style={[styles.socialButton, configured && styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#5C5468'} /></TouchableOpacity>;
            })}
          </View>
          <View style={styles.statsRow}><Stat value={tracks.length} label="KEEP" /><Stat value={followerCount} label="Abonnés" /><Stat value={profile.followingCount} label="Abonnements" /></View>
          {viewer && viewer.id !== profile.id && (
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followButtonActive]}
              onPress={toggleFollow}
              disabled={followBusy}
              accessibilityLabel={isFollowing ? 'Ne plus suivre' : 'Suivre'}
            >
              <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>{isFollowing ? 'Abonné(e)' : '+ Suivre'}</Text>
            </TouchableOpacity>
          )}
          {(profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0) && <View style={styles.musicIdentity}><Text style={styles.sectionTitle}>KEEP DNA</Text><View style={styles.chips}>{[...profile.favoriteGenres, ...profile.favoriteArtists].slice(0,8).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View></View>}
          {albums.length > 0 ? <View style={styles.albumSummary}><Text style={styles.albumSummaryTitle}>Albums partagés</Text><Text style={styles.albumSummaryText} numberOfLines={2}>{albums.slice(0,5).join(' · ')}</Text></View> : null}
        </View>
        <View style={styles.publicMusicSection}>
          <View style={styles.musicSectionHeader}><Text style={styles.sectionTitle}>KEEP publics</Text><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {tracks.length === 0 ? <View style={styles.emptyMusic}><Text style={styles.emptyMusicIcon}>♪</Text><Text style={styles.muted}>Aucun morceau public sur ce profil.</Text></View> : <View style={styles.musicGrid}>{tracks.map((track) => { const liked = likedTrackIds.has(track.trackId); return <View key={track.id} style={styles.musicTile}>{track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.musicCover} /> : <View style={[styles.musicCover, styles.musicCoverFallback]}><Text style={styles.avatarText}>K</Text></View>}<Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>{!!track.album && <Text style={styles.trackAlbum} numberOfLines={1}>{track.album}</Text>}<TouchableOpacity style={[styles.likeButton, liked && styles.likeButtonActive]} onPress={() => toggleLike(track.trackId)} accessibilityLabel={liked ? 'Retirer le like' : 'Liker ce morceau'}><Text style={[styles.likeHeart, liked && styles.likeHeartActive]}>{liked ? '♥' : '♡'}</Text><Text style={styles.likeCount}>{likeCounts[track.trackId] || 0}</Text></TouchableOpacity></View>; })}</View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},scroll:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl},topBar:{minHeight:56,paddingHorizontal:spacing.xl,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{color:colors.textPrimary,fontSize:38,lineHeight:42},title:{...typography.h3,color:colors.textPrimary},placeholder:{width:28},hero:{alignItems:'center',paddingHorizontal:spacing.xl,paddingTop:spacing.md},avatar:{width:104,height:104,borderRadius:52,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:30,fontWeight:'900'},username:{...typography.h2,color:colors.textPrimary,marginTop:spacing.md},kind:{color:colors.primaryLight,fontSize:12,fontWeight:'800',marginTop:5},location:{color:colors.textMuted,fontSize:13,marginTop:6},bio:{color:colors.textSecondary,fontSize:14,lineHeight:20,textAlign:'center',marginTop:spacing.md},
  socialRow:{width:'100%',flexDirection:'row',justifyContent:'space-between',gap:7,marginTop:spacing.lg},socialButton:{flex:1,maxWidth:46,height:42,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',opacity:.82},socialButtonConfigured:{backgroundColor:'#5B3F8C',borderColor:'#A884FA',opacity:1},
  statsRow:{width:'100%',flexDirection:'row',marginTop:spacing.lg,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:spacing.md},statValue:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},statLabel:{color:colors.textMuted,fontSize:11,marginTop:4},
  followButton:{width:'100%',minHeight:44,marginTop:spacing.md,borderRadius:radius.pill,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},followButtonActive:{backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},followButtonText:{color:'#FFFFFF',fontSize:14,fontWeight:'800'},followButtonTextActive:{color:colors.textSecondary},musicIdentity:{width:'100%',marginTop:spacing.lg,padding:spacing.md,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},sectionTitle:{...typography.h3,color:colors.textPrimary},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:spacing.sm},chip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:10,paddingVertical:5},chipText:{color:colors.smartBadgeText,fontSize:11,fontWeight:'700'},albumSummary:{width:'100%',marginTop:spacing.md},albumSummaryTitle:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},albumSummaryText:{color:colors.textSecondary,fontSize:11,lineHeight:16,marginTop:3},publicMusicSection:{paddingHorizontal:spacing.xl,marginTop:spacing.xl},musicSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:spacing.md},publicCount:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},emptyMusic:{alignItems:'center',paddingVertical:spacing.xxl,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},emptyMusicIcon:{color:colors.primaryLight,fontSize:28,marginBottom:spacing.sm},musicGrid:{flexDirection:'row',flexWrap:'wrap',marginHorizontal:-spacing.xs},musicTile:{width:'33.333%',padding:spacing.xs},musicCover:{width:'100%',aspectRatio:1,borderRadius:radius.sm,backgroundColor:colors.backgroundCard},musicCoverFallback:{alignItems:'center',justifyContent:'center'},trackTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'800',marginTop:6},trackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},trackAlbum:{color:colors.textMuted,fontSize:9,marginTop:2},likeButton:{minHeight:30,marginTop:6,borderRadius:15,backgroundColor:'#1A1225',borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},likeButtonActive:{borderColor:'#FF5F83',backgroundColor:'rgba(255,95,131,.10)'},likeHeart:{color:colors.textSecondary,fontSize:15},likeHeartActive:{color:'#FF5F83'},likeCount:{color:colors.textSecondary,fontSize:10,fontWeight:'800'},muted:{color:colors.textMuted,fontSize:14,textAlign:'center'},
});