import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { computeMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { SocialLink } from '../types';
import { shareProfile } from '../services/sharingService';
import { loadCurrentPlanCode } from '../services/planService';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';

type ProfileTab = 'KEEP' | 'PLAYLISTS' | 'ARTISTS' | 'ALBUMS';
type SocialPlatform = SocialLink['platform'];

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Playlists' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },
];
const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' }, { platform: 'tiktok', label: 'TikTok' }, { platform: 'snapchat', label: 'Snapchat' }, { platform: 'youtube', label: 'YouTube' }, { platform: 'x', label: 'X' }, { platform: 'facebook', label: 'Facebook' },
];

export default function ProfilePublicScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [activeTab, setActiveTab] = useState<ProfileTab>('KEEP');
  const [planCode, setPlanCode] = useState('FREE');

  useEffect(() => {
    let live = true;
    if (user) loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE'));
    return () => { live = false; };
  }, [user?.id]);

  const keptTracks = useMemo(() => sessions.flatMap((session) => session.tracks.filter((entry) => entry.status === 'kept')), [sessions]);
  const dna = useMemo(() => {
    const decisions: DnaSourceDecision[] = keptTracks.map((entry) => ({ artist: entry.track.artist, genres: entry.track.genres ?? [], decision: 'KEPT', createdAt: entry.detectedAt }));
    return computeMusicDNA(decisions);
  }, [keptTracks]);
  const artists = useMemo(() => Array.from(new Set(keptTracks.map((entry) => entry.track.artist))).slice(0, 18), [keptTracks]);
  const albums = useMemo(() => Array.from(new Set(keptTracks.map((entry) => entry.track.album).filter(Boolean) as string[])).slice(0, 18), [keptTracks]);
  const playlists = useMemo(() => Array.from(new Set(keptTracks.flatMap((entry) => entry.recommendations.map((r) => r.playlistName)))).slice(0, 18), [keptTracks]);

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.demoTitle}>Profil KEEP</Text><Text style={s.muted}>Aucun compte actif.</Text><TouchableOpacity style={s.primary} onPress={enterDemoMode}><Text style={s.primaryText}>ENTRER EN MODE DÉMO</Text></TouchableOpacity></View></SafeAreaView>;

  const publicLinks = user.socialLinks.filter((link) => link.visibility === 'PUBLIC');

  const openSocial = async (platform: SocialPlatform) => {
    const link = publicLinks.find((item) => item.platform === platform && item.url.trim());
    if (!link) {
      Alert.alert('Réseau non renseigné', 'Ajoute ce réseau depuis les réglages avancés.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Ajouter le lien', onPress: () => navigation.navigate('AdvancedProfileSettings') },
      ]);
      return;
    }
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau pour le moment.'); }
  };

  const tabContent = () => {
    if (activeTab === 'KEEP') {
      if (!keptTracks.length) return <Empty text="Tes morceaux KEEP apparaîtront ici." />;
      return <View style={s.grid}>{keptTracks.slice(0,18).map((entry) => <View key={entry.id} style={s.tile}>{entry.track.artworkUrl ? <Image source={{uri:entry.track.artworkUrl}} style={s.cover}/> : <View style={[s.cover,s.coverFallback]}><Text style={s.coverK}>K</Text></View>}<Text style={s.tileTitle} numberOfLines={1}>{entry.track.title}</Text><Text style={s.tileSub} numberOfLines={1}>{entry.track.artist}</Text></View>)}</View>;
    }
    const items = activeTab === 'PLAYLISTS' ? playlists : activeTab === 'ARTISTS' ? artists : albums;
    if (!items.length) return <Empty text={activeTab === 'PLAYLISTS' ? 'Tes playlists apparaîtront ici.' : activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;
    return <View style={s.list}>{items.map((item) => <View key={item} style={s.listRow}><View style={s.note}><Text style={s.noteText}>♪</Text></View><Text style={s.listText} numberOfLines={1}>{item}</Text></View>)}</View>;
  };

  return <SafeAreaView style={s.container}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topBar}>
        <Text style={s.topTitle}>Profil</Text>
        <View style={s.actions}>
          <TouchableOpacity style={s.plan} onPress={() => navigation.navigate('Offers')} accessibilityLabel="Offre et crédits"><Text style={s.planText}>{planCode}</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Notifications')} accessibilityLabel="Notifications"><Text style={s.bell}>🔔</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => shareProfile(user.username)} accessibilityLabel="Partager le profil"><Text style={s.iconText}>↗</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Modifier le profil"><Text style={s.iconText}>⚙</Text></TouchableOpacity>
        </View>
      </View>

      <View style={s.hero}>
        <View style={s.identity}>
          {user.avatar ? <Image source={{uri:user.avatar}} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>K</Text></View>}
          <View style={s.identityText}><Text style={s.username}>@{user.username}</Text><Text style={s.kind}>{user.kind}</Text>{(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}</View>
        </View>
        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        <View style={s.stats}><Stat value={keptTracks.length} label="KEEP"/><Stat value={user.followerCount} label="Abonnés"/><Stat value={user.followingCount} label="Abonnements"/></View>
      </View>

      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>

      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

      <View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} style={s.tab} onPress={()=>setActiveTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>
      {tabContent()}
    </ScrollView>
  </SafeAreaView>;
}

function Stat({value,label}:{value:number;label:string}){return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>}
function Empty({text}:{text:string}){return <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.muted}>{text}</Text></View>}

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},content:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24},demoTitle:{...typography.h2,color:colors.textPrimary,marginBottom:8},primary:{marginTop:20,minHeight:50,width:'100%',borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.white,fontWeight:'900'},
  topBar:{paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},topTitle:{...typography.h2,color:colors.textPrimary},actions:{flexDirection:'row',gap:6,alignItems:'center'},iconButton:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},iconText:{color:colors.textPrimary,fontSize:18,fontWeight:'700'},bell:{fontSize:17},plan:{minHeight:34,paddingHorizontal:10,borderRadius:17,backgroundColor:'#3D2860',borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},planText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:12},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:88,height:88,borderRadius:44,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:32,fontWeight:'800'},identityText:{flex:1,marginLeft:16},username:{...typography.h2,color:colors.textPrimary},kind:{color:colors.primaryLight,fontSize:12,fontWeight:'800',marginTop:4},location:{color:colors.textMuted,fontSize:13,marginTop:5},bio:{color:colors.textSecondary,fontSize:14,lineHeight:20,marginTop:12},stats:{marginTop:16,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:12},statValue:{color:colors.textPrimary,fontSize:19,fontWeight:'800'},statLabel:{color:colors.textMuted,fontSize:11,marginTop:3},
  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800',marginTop:2},dnaScore:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{paddingHorizontal:10,paddingVertical:5,borderRadius:radius.pill,backgroundColor:colors.smartBadgeBg},chipText:{color:colors.smartBadgeText,fontSize:11,fontWeight:'700'},muted:{color:colors.textMuted,fontSize:12,lineHeight:17},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},socialTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},musicLink:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},socialRow:{flexDirection:'row',justifyContent:'space-between',marginTop:12},socialButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E'},socialButtonOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},
  tabs:{marginTop:16,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},indicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},
  grid:{flexDirection:'row',flexWrap:'wrap',padding:8},tile:{width:'33.333%',padding:4},cover:{width:'100%',aspectRatio:1,borderRadius:radius.sm,backgroundColor:colors.backgroundCard},coverFallback:{alignItems:'center',justifyContent:'center'},coverK:{color:colors.primaryLight,fontSize:28,fontWeight:'900'},tileTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'700',marginTop:6},tileSub:{color:colors.textMuted,fontSize:10,marginTop:2},list:{marginHorizontal:18,marginTop:10},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border},note:{width:38,height:38,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},noteText:{color:colors.primaryLight,fontSize:18,fontWeight:'800'},listText:{flex:1,color:colors.textPrimary,fontSize:14,fontWeight:'600',marginLeft:12},empty:{alignItems:'center',paddingVertical:50,paddingHorizontal:20},emptyIcon:{color:colors.primaryLight,fontSize:28,marginBottom:10},
});