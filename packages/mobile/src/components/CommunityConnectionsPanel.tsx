import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import ProfileCertificationBadge, { CERTIFICATION_META } from './ProfileCertificationBadge';
import type { ProfileCertificationTier } from '../services/publicProfileStateService';

// Adel (09/09/2026) : "comment ca se fait qu'on a pas les pastilles des
// abonnes et le style musical ... si il est certifie" -- meme enrichissement
// (certification + style musical) que "Qui a repris tes morceaux", via le
// RPC keep_profile_connections (suit le meme calcul que keep_profile_reprisers).
type CommunityProfile = { id: string; username: string; avatarUrl?: string; kind: string; certificationTier: ProfileCertificationTier; favoriteGenres: string[] };
export type CommunityMode = 'following' | 'followers' | null;

// Adel (02/09/2026) : "on créerait pas un bouton directement sur Abonnés/
// Abonnements ... ça nous enlèverait le petit contour du dessous, ça nous
// ferait gagner de la place." Ce panneau ne pilote plus son propre mode --
// les chiffres du profil (ProfileCounterRow) le pilotent désormais, ce
// composant ne garde que la liste + le suivre en retour.
export default function CommunityConnectionsPanel({ userId, navigation, mode }: { userId: string; navigation: any; mode: CommunityMode }) {
  const [followers, setFollowers] = useState<CommunityProfile[]>([]);
  const [following, setFollowing] = useState<CommunityProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!supabase || !userId) return setLoading(false);
    setLoading(true);
    try {
      const [followersResult, followingResult] = await Promise.all([
        supabase.rpc('keep_profile_connections', { p_profile_id: userId, p_mode: 'followers' }),
        supabase.rpc('keep_profile_connections', { p_profile_id: userId, p_mode: 'following' }),
      ]);
      if (followersResult.error) throw followersResult.error;
      if (followingResult.error) throw followingResult.error;
      const mapRow = (row: any): CommunityProfile => ({
        id: String(row.profile_id),
        username: String(row.username || ''),
        avatarUrl: row.avatar_url || undefined,
        kind: String(row.kind || 'USER'),
        certificationTier: (row.certification_tier as ProfileCertificationTier) || 'UNVERIFIED',
        favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres.map(String) : [],
      });
      const followersRows = (followersResult.data ?? []).map(mapRow);
      const followingRows = (followingResult.data ?? []).map(mapRow);
      setFollowers(followersRows);
      setFollowing(followingRows);
      setFollowingIds(new Set(
        (followersResult.data ?? []).filter((row: any) => row.is_following).map((row: any) => String(row.profile_id))
          .concat(followingRows.map((row: CommunityProfile) => row.id)),
      ));
    } catch {
      // Une panne réseau ne doit jamais transformer Découvertes en page blanche.
      setFollowers([]);
      setFollowing([]);
      setFollowingIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const unsubscribe = navigation?.addListener?.('focus', () => { void load(); });
    return () => unsubscribe?.();
  }, [navigation, userId]);

  const rows = useMemo(
    () => mode === 'following' ? following : mode === 'followers' ? followers : [],
    [followers, following, mode],
  );

  const followBack = async (profile: CommunityProfile) => {
    if (!supabase || followingIds.has(profile.id) || busyId) return;
    setBusyId(profile.id);
    try {
      const { error } = await supabase.from('follows').upsert(
        { follower_id: userId, followee_id: profile.id },
        { onConflict: 'follower_id,followee_id', ignoreDuplicates: true },
      );
      if (error) throw error;
      setFollowingIds((current) => new Set(current).add(profile.id));
      setFollowing((current) => current.some((item) => item.id === profile.id) ? current : [...current, profile]);
    } catch {
      // Garder l'écran utilisable ; l'utilisateur peut réessayer sans rechargement.
    } finally {
      setBusyId(null);
    }
  };

  if (!mode) return null;

  return <View style={s.shell}>
    {loading ? <View style={s.loadingRow}><ActivityIndicator color={colors.primaryLight}/></View> : null}
    <View style={s.list}>{rows.length ? rows.map((profile) => {
      const alreadyFollowing = followingIds.has(profile.id);
      const tierColors = CERTIFICATION_META[profile.certificationTier] ?? CERTIFICATION_META.UNVERIFIED;
      return <View key={profile.id} style={s.row}>
        <TouchableOpacity style={s.identity} onPress={() => navigation.navigate('PublicProfile', { username: profile.username })}>
          {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>{profile.username.slice(0,1).toUpperCase()}</Text></View>}
          <View style={s.copy}>
            <View style={s.nameRow}><Text style={s.username} numberOfLines={1}>{profile.username}</Text><ProfileCertificationBadge tier={profile.certificationTier} compact /></View>
            {profile.favoriteGenres.length ? <View style={s.genreRow}>{profile.favoriteGenres.slice(0,3).map((g) => <View key={g} style={[s.genreChip,{borderColor:tierColors.ring}]}><Text style={[s.genreText,{color:tierColors.ring}]}>{g}</Text></View>)}</View> : <Text style={s.kind}>{profile.kind}</Text>}
          </View>
        </TouchableOpacity>
        {mode === 'followers' ? (
          <TouchableOpacity style={[s.follow, alreadyFollowing && s.followOn]} onPress={() => void followBack(profile)} disabled={alreadyFollowing || busyId === profile.id}>
            <Text style={[s.followText, alreadyFollowing && s.followTextOn]}>{busyId === profile.id ? '…' : alreadyFollowing ? 'ABONNÉ' : '+ SUIVRE'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.view} onPress={() => navigation.navigate('PublicProfile', { username: profile.username })}><Text style={s.viewText}>VOIR</Text></TouchableOpacity>
        )}
      </View>;
    }) : <Text style={s.empty}>{mode === 'followers' ? 'Personne ne te suit encore.' : 'Tu ne suis encore aucun profil.'}</Text>}</View>
  </View>;
}

const s = StyleSheet.create({
  shell:{marginTop:10,padding:10,borderRadius:16,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},
  loadingRow:{alignItems:'center',paddingVertical:6},
  list:{borderTopWidth:1,borderTopColor:'#2C203A'},
  row:{minHeight:60,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#30263B'},
  identity:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center'},
  avatar:{width:38,height:38,borderRadius:19,backgroundColor:'#241936'},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},
  copy:{flex:1,minWidth:0,marginLeft:9},
  nameRow:{flexDirection:'row',alignItems:'center',gap:6},
  username:{flexShrink:1,color:'#FFF',fontSize:11,fontWeight:'900'},
  kind:{color:'#FFFFFF',fontSize:9,marginTop:2},
  genreRow:{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:3},
  genreChip:{paddingHorizontal:6,paddingVertical:2,borderRadius:8,borderWidth:1},
  genreText:{fontSize:8,fontWeight:'800'},
  follow:{minHeight:30,paddingHorizontal:10,borderRadius:15,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  followOn:{backgroundColor:'#1C3028',borderWidth:1,borderColor:'#3B8061'},
  followText:{color:'#FFF',fontSize:8,fontWeight:'900'},
  followTextOn:{color:'#76E3AE'},
  view:{minHeight:30,paddingHorizontal:11,borderRadius:15,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},
  viewText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},
  empty:{color:'#FFFFFF',fontSize:11,textAlign:'center',paddingVertical:12},
});
