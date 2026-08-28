import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

type CommunityProfile = { id: string; username: string; avatarUrl?: string; kind: string };
type Mode = 'following' | 'followers' | null;

export default function CommunityConnectionsPanel({ userId, navigation }: { userId: string; navigation: any }) {
  const [followers, setFollowers] = useState<CommunityProfile[]>([]);
  const [following, setFollowing] = useState<CommunityProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!supabase || !userId) return setLoading(false);
    setLoading(true);
    try {
      const [outgoing, incoming] = await Promise.all([
        supabase.from('follows').select('followee_id').eq('follower_id', userId),
        supabase.from('follows').select('follower_id').eq('followee_id', userId),
      ]);
      if (outgoing.error) throw outgoing.error;
      if (incoming.error) throw incoming.error;
      const outIds = (outgoing.data ?? []).map((row: any) => String(row.followee_id));
      const inIds = (incoming.data ?? []).map((row: any) => String(row.follower_id));
      const ids = Array.from(new Set([...outIds, ...inIds]));
      let profiles: any[] = [];
      if (ids.length) {
        const result = await supabase.from('profiles').select('id,username,avatar_url,kind').in('id', ids).eq('is_public', true);
        if (result.error) throw result.error;
        profiles = result.data ?? [];
      }
      const map = new Map(profiles.map((row: any) => [String(row.id), {
        id: String(row.id),
        username: String(row.username || ''),
        avatarUrl: row.avatar_url || undefined,
        kind: String(row.kind || 'USER'),
      } as CommunityProfile]));
      setFollowing(outIds.map((id) => map.get(id)).filter(Boolean) as CommunityProfile[]);
      setFollowers(inIds.map((id) => map.get(id)).filter(Boolean) as CommunityProfile[]);
      setFollowingIds(new Set(outIds));
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

  return <View style={s.shell}>
    <View style={s.header}>
      <View>
        <Text style={s.title}>Ma communauté</Text>
        <Text style={s.hint}>Retrouve tes abonnements et les personnes qui te suivent.</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.primaryLight}/> : null}
    </View>
    <View style={s.tabs}>
      <TouchableOpacity style={[s.tab, s.tabPurple, mode === 'following' && s.tabOn]} onPress={() => setMode((value) => value === 'following' ? null : 'following')}>
        <Text style={[s.tabText, mode === 'following' && s.tabTextOn]}>Abonnements · {following.length}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.tab, s.tabGreen, mode === 'followers' && s.tabOn]} onPress={() => setMode((value) => value === 'followers' ? null : 'followers')}>
        <Text style={[s.tabText, mode === 'followers' && s.tabTextOn]}>Abonnés · {followers.length}</Text>
      </TouchableOpacity>
    </View>
    {mode ? <View style={s.list}>{rows.length ? rows.map((profile) => {
      const alreadyFollowing = followingIds.has(profile.id);
      return <View key={profile.id} style={s.row}>
        <TouchableOpacity style={s.identity} onPress={() => navigation.navigate('PublicProfile', { username: profile.username })}>
          {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>{profile.username.slice(0,1).toUpperCase()}</Text></View>}
          <View style={s.copy}><Text style={s.username}>@{profile.username}</Text><Text style={s.kind}>{profile.kind}</Text></View>
        </TouchableOpacity>
        {mode === 'followers' ? (
          <TouchableOpacity style={[s.follow, alreadyFollowing && s.followOn]} onPress={() => void followBack(profile)} disabled={alreadyFollowing || busyId === profile.id}>
            <Text style={[s.followText, alreadyFollowing && s.followTextOn]}>{busyId === profile.id ? '…' : alreadyFollowing ? 'ABONNÉ' : '+ SUIVRE'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.view} onPress={() => navigation.navigate('PublicProfile', { username: profile.username })}><Text style={s.viewText}>VOIR</Text></TouchableOpacity>
        )}
      </View>;
    }) : <Text style={s.empty}>{mode === 'followers' ? 'Personne ne te suit encore.' : 'Tu ne suis encore aucun profil.'}</Text>}</View> : null}
  </View>;
}

const s = StyleSheet.create({
  shell:{marginTop:10,padding:10,borderRadius:16,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  title:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},
  hint:{color:colors.textMuted,fontSize:10,lineHeight:14,marginTop:2},
  tabs:{flexDirection:'row',gap:7,marginTop:8},
  tab:{flex:1,minHeight:34,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},
  tabPurple:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},
  tabGreen:{backgroundColor:'#123D2C',borderColor:'#38D990'},
  tabOn:{borderWidth:2},
  tabText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},
  tabTextOn:{color:'#FFFFFF'},
  list:{marginTop:8,borderTopWidth:1,borderTopColor:'#2C203A'},
  row:{minHeight:56,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#30263B'},
  identity:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',paddingVertical:8},
  avatar:{width:38,height:38,borderRadius:19,backgroundColor:'#241936'},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},
  copy:{flex:1,minWidth:0,marginLeft:9},
  username:{color:'#FFF',fontSize:11,fontWeight:'900'},
  kind:{color:colors.textMuted,fontSize:8,marginTop:2},
  follow:{minHeight:30,paddingHorizontal:10,borderRadius:15,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  followOn:{backgroundColor:'#1C3028',borderWidth:1,borderColor:'#3B8061'},
  followText:{color:'#FFF',fontSize:8,fontWeight:'900'},
  followTextOn:{color:'#76E3AE'},
  view:{minHeight:30,paddingHorizontal:11,borderRadius:15,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},
  viewText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},
  empty:{color:colors.textMuted,fontSize:10,textAlign:'center',paddingVertical:12},
});
