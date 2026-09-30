import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import ProfileCertificationBadge, { CERTIFICATION_META } from './ProfileCertificationBadge';
import type { ProfileCertificationTier } from '../services/publicProfileStateService';

type CommunityProfile = {
  id: string;
  username: string;
  avatarUrl?: string;
  kind: string;
  certificationTier: ProfileCertificationTier;
  favoriteGenres: string[];
  isFollowing: boolean;
};

export type CommunityMode = 'following' | 'followers' | null;

const PAGE_SIZE = 24;

function mapRow(row: any): CommunityProfile {
  return {
    id: String(row.profile_id),
    username: String(row.username || ''),
    avatarUrl: row.avatar_url || undefined,
    kind: String(row.kind || 'USER'),
    certificationTier: (row.certification_tier as ProfileCertificationTier) || 'UNVERIFIED',
    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres.map(String) : [],
    isFollowing: Boolean(row.is_following),
  };
}

export default function CommunityConnectionsPanel({ userId, navigation, mode }: { userId: string; navigation: any; mode: CommunityMode }) {
  const [rows, setRows] = useState<CommunityProfile[]>([]);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadPage = async (reset: boolean) => {
    if (!supabase || !userId || !mode) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (reset) setLoading(true); else setMoreBusy(true);
    try {
      const cursor = reset ? null : rows[rows.length - 1] ?? null;
      const { data, error } = await supabase.rpc('keep_profile_connections_page', {
        p_profile_id: userId,
        p_mode: mode,
        p_limit: PAGE_SIZE,
        p_after_username: cursor?.username ?? null,
        p_after_id: cursor?.id ?? null,
        p_search: search || null,
      });
      if (error) throw error;
      const next = (Array.isArray(data) ? data : []).map(mapRow);
      setRows((current) => reset ? next : [...current, ...next.filter((item) => !current.some((row) => row.id === item.id))]);
      setHasMore(next.length === PAGE_SIZE);
    } catch {
      if (reset) setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setMoreBusy(false);
    }
  };

  useEffect(() => {
    if (!mode) return;
    setRows([]);
    setSearchDraft('');
    setSearch('');
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    void loadPage(true);
  }, [mode, userId, search]);

  const followBack = async (profile: CommunityProfile) => {
    if (!supabase || profile.isFollowing || busyId) return;
    setBusyId(profile.id);
    try {
      const { error } = await supabase.from('follows').upsert(
        { follower_id: userId, followee_id: profile.id },
        { onConflict: 'follower_id,followee_id', ignoreDuplicates: true },
      );
      if (error) throw error;
      setRows((current) => current.map((row) => row.id === profile.id ? { ...row, isFollowing: true } : row));
    } finally {
      setBusyId(null);
    }
  };

  const title = mode === 'followers' ? 'Abonnés' : 'Abonnements';
  const subtitle = mode === 'followers'
    ? 'Les premiers profils seulement. Cherche un pseudo au lieu de charger une foule entière.'
    : 'Ta liste reste légère même avec des millions de comptes.';

  if (!mode) return null;

  return <View style={s.shell}>
    <View style={s.head}>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={s.title}>{title}</Text><Text style={s.subtitle}>{subtitle}</Text></View>
      <View style={s.scalePill}><Text style={s.scalePillText}>24 / PAGE</Text></View>
    </View>

    <View style={s.searchRow}>
      <TextInput
        value={searchDraft}
        onChangeText={setSearchDraft}
        onSubmitEditing={() => setSearch(searchDraft.trim())}
        placeholder="Pseudo…"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.search}
      />
      <TouchableOpacity style={s.searchButton} onPress={() => setSearch(searchDraft.trim())}><Text style={s.searchButtonText}>CHERCHER</Text></TouchableOpacity>
      {search ? <TouchableOpacity style={s.clear} onPress={() => { setSearchDraft(''); setSearch(''); }}><Text style={s.clearText}>×</Text></TouchableOpacity> : null}
    </View>

    {loading ? <View style={s.loading}><ActivityIndicator color={colors.primaryLight}/></View> : null}

    <View style={s.grid}>
      {rows.map((profile) => {
        const tierColors = CERTIFICATION_META[profile.certificationTier] ?? CERTIFICATION_META.UNVERIFIED;
        return <View key={profile.id} style={s.card}>
          <TouchableOpacity style={s.identity} onPress={() => navigation.navigate('PublicProfile', { username: profile.username })}>
            {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>{profile.username.slice(0,1).toUpperCase()}</Text></View>}
            <View style={s.copy}>
              <View style={s.nameRow}><Text style={s.username} numberOfLines={1}>@{profile.username}</Text><ProfileCertificationBadge tier={profile.certificationTier} compact /></View>
              <Text style={s.kind}>{profile.favoriteGenres[0] || profile.kind}</Text>
              {profile.favoriteGenres.length > 1 ? <View style={s.genreRow}>{profile.favoriteGenres.slice(0,2).map((genre) => <View key={genre} style={[s.genreChip,{borderColor:tierColors.ring}]}><Text style={[s.genreText,{color:tierColors.ring}]}>{genre}</Text></View>)}</View> : null}
            </View>
          </TouchableOpacity>
          {mode === 'followers' ? <TouchableOpacity style={[s.action, profile.isFollowing && s.actionOn]} onPress={() => void followBack(profile)} disabled={profile.isFollowing || busyId === profile.id}><Text style={[s.actionText,profile.isFollowing && s.actionTextOn]}>{busyId === profile.id ? '…' : profile.isFollowing ? 'ABONNÉ' : '+ SUIVRE'}</Text></TouchableOpacity> : <TouchableOpacity style={s.view} onPress={() => navigation.navigate('PublicProfile', { username: profile.username })}><Text style={s.viewText}>VOIR</Text></TouchableOpacity>}
        </View>;
      })}
      {!loading && !rows.length ? <Text style={s.empty}>{search ? 'Aucun pseudo trouvé.' : mode === 'followers' ? 'Personne ne te suit encore.' : 'Tu ne suis encore aucun profil.'}</Text> : null}
    </View>

    {hasMore ? <TouchableOpacity style={s.more} onPress={() => void loadPage(false)} disabled={moreBusy}><Text style={s.moreText}>{moreBusy ? 'CHARGEMENT…' : 'VOIR 24 DE PLUS'}</Text></TouchableOpacity> : null}
  </View>;
}

const s=StyleSheet.create({
  shell:{marginTop:4,padding:12,borderRadius:18,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,gap:10},
  head:{flexDirection:'row',alignItems:'flex-start',gap:8},
  title:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},
  subtitle:{color:colors.textMuted,fontSize:10,lineHeight:14,marginTop:2},
  scalePill:{minHeight:25,paddingHorizontal:8,borderRadius:13,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  scalePillText:{color:colors.textMuted,fontSize:8,fontWeight:'900',letterSpacing:.5},
  searchRow:{flexDirection:'row',alignItems:'center',gap:6},
  search:{flex:1,minWidth:0,minHeight:42,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,color:colors.textPrimary,paddingHorizontal:12,fontSize:12},
  searchButton:{minHeight:42,paddingHorizontal:11,borderRadius:14,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  searchButtonText:{color:colors.white,fontSize:9,fontWeight:'900'},
  clear:{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  clearText:{color:colors.textMuted,fontSize:18},
  loading:{alignItems:'center',paddingVertical:8},
  grid:{gap:8},
  card:{minHeight:64,flexDirection:'row',alignItems:'center',gap:8,padding:9,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  identity:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center'},
  avatar:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundElevated},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},
  copy:{flex:1,minWidth:0,marginLeft:9},
  nameRow:{flexDirection:'row',alignItems:'center',gap:5},
  username:{flexShrink:1,color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  kind:{color:colors.textMuted,fontSize:9,marginTop:2},
  genreRow:{flexDirection:'row',gap:4,marginTop:4},
  genreChip:{paddingHorizontal:5,paddingVertical:2,borderRadius:8,borderWidth:1},
  genreText:{fontSize:7,fontWeight:'800'},
  action:{minHeight:32,paddingHorizontal:10,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  actionOn:{backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.keep},
  actionText:{color:colors.white,fontSize:8,fontWeight:'900'},
  actionTextOn:{color:colors.keep},
  view:{minHeight:32,paddingHorizontal:11,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  viewText:{color:colors.primaryLight,fontSize:8,fontWeight:'900'},
  empty:{color:colors.textMuted,fontSize:11,textAlign:'center',paddingVertical:14},
  more:{minHeight:42,borderRadius:15,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  moreText:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.7},
});
