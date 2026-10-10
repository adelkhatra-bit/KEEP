import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import ProfileCertificationBadge from './ProfileCertificationBadge';
import type { ProfileCertificationTier } from '../services/publicProfileStateService';
import KeepModal from './KeepModal';
import { formatLastShared, formatSince } from '../services/storyActivity';
import { loadLastShared, loadProfilesActivity, type LastShared } from '../services/musicStoriesService';

const KIND_LABELS: Record<string, string> = {
  USER: 'Fan', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Lieu',
};

type QuickProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  kind: string | null;
  city: string | null;
  country_code: string | null;
};

type Props = {
  visible: boolean;
  username: string;
  currentUserId?: string | null;
  accountRequired: boolean;
  onClose: () => void;
  onOpenFull: (username: string) => void;
  onRequireAccount: (username: string) => void;
  /** Fiche ouverte depuis une bulle sans story du jour : slogan + « dernier partage il y a … ». */
  noStory?: boolean;
  /** Affichée DANS l'écran courant (au-dessus d'un Swipe plein écran), sans ouvrir de fenêtre : l'utilisateur ne quitte jamais son écoute (Adel, 06/10/2026). */
  inline?: boolean;
};

export default function SourceProfileQuickView({
  visible,
  username,
  currentUserId,
  accountRequired,
  onClose,
  onOpenFull,
  onRequireAccount,
  noStory = false,
  inline = false,
}: Props) {
  const [profile, setProfile] = useState<QuickProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [message, setMessage] = useState('');
  const [lastShared, setLastShared] = useState<LastShared | null | undefined>(undefined);
  const [activity, setActivity] = useState<{ lastActiveAt: string | null; online: boolean } | null>(null);
  // Adel (07/09/2026) : "la certif doit être présentée partout" -- cette
  // fenêtre rapide n'affichait jamais le badge de certification. Calculée en
  // direct (jamais figée) via la même RPC que le reste de l'app.
  const [certificationTier, setCertificationTier] = useState<ProfileCertificationTier>('UNVERIFIED');

  useEffect(() => {
    const client = supabase;
    if (!visible || !username || !client) return;
    let live = true;
    setLoading(true);
    setMessage('');
    setProfile(null);
    setIsFollowing(false);
    setCertificationTier('UNVERIFIED');
    setLastShared(undefined);
    setActivity(null);

    const loadProfile = async () => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('id,username,display_name,bio,avatar_url,kind,city,country_code')
          .ilike('username', username.replace(/^@+/, ''))
          .eq('is_public', true)
          .limit(1);
        if (!live) return;
        if (!error && data?.[0]) {
          const nextProfile = data[0] as QuickProfile;
          setProfile(nextProfile);
          if (noStory) {
            loadLastShared(nextProfile.id).then((row) => { if (live) setLastShared(row); }).catch(() => { if (live) setLastShared(null); });
            loadProfilesActivity([nextProfile.id]).then((map) => { if (live) setActivity(map[nextProfile.id] ?? null); }).catch(() => {});
          }
          Promise.resolve(client.rpc('keep_public_certification_tiers', { p_profile_ids: [nextProfile.id] }))
            .then(({ data: tierRows }) => {
              const row = Array.isArray(tierRows) ? tierRows[0] : null;
              if (live && row?.certification_tier) setCertificationTier(row.certification_tier as ProfileCertificationTier);
            })
            .catch(() => {});
          if (currentUserId && currentUserId !== nextProfile.id && !accountRequired) {
            const { data: relation, error: relationError } = await client
              .from('follows')
              .select('follower_id')
              .eq('follower_id', currentUserId)
              .eq('followee_id', nextProfile.id)
              .maybeSingle();
            if (live && !relationError) setIsFollowing(Boolean(relation));
          }
        } else setMessage('Profil indisponible pour le moment.');
      } finally {
        if (live) setLoading(false);
      }
    };

    void loadProfile();
    return () => { live = false; };
  }, [accountRequired, currentUserId, noStory, username, visible]);

  const toggleFollow = async () => {
    if (!profile || followBusy) return;
    if (profile.id === currentUserId) {
      setMessage('C’est ton profil Loki Music.');
      return;
    }
    if (accountRequired || !supabase || !currentUserId) {
      onClose();
      onRequireAccount(profile.username);
      return;
    }

    setFollowBusy(true);
    setMessage('');
    try {
      // Règle d'Adel (05/10/2026) : on ne se désabonne QUE depuis la page profil de la personne.
      if (isFollowing) {
        onClose();
        onOpenFull(profile.username);
        return;
      } else {
        const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: profile.id });
        if (error) throw error;
        setIsFollowing(true);
        setMessage(`Tu suis maintenant ${profile.username}.`);
      }
    } catch {
      setMessage(isFollowing ? 'Impossible de se désabonner pour le moment.' : 'Impossible de suivre ce profil pour le moment.');
    } finally {
      setFollowBusy(false);
    }
  };

  const body = (
      <View style={s.backdrop} testID="source-quick-view">
        <View style={s.card}>
          {loading ? <ActivityIndicator color={colors.primaryLight} /> : profile ? <>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
              : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarText}>{profile.username.slice(0, 1).toUpperCase()}</Text></View>}
            <View style={s.usernameRow}><Text style={s.username}>{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact showLabel /></View>
            <Text style={s.meta}>{[profile.display_name, profile.kind ? (KIND_LABELS[profile.kind] ?? profile.kind) : null, profile.city, profile.country_code].filter(Boolean).join(' · ')}</Text>
            {noStory ? (
              <View style={s.noStoryBox} testID="quick-no-story">
                <Text style={s.noStoryTitle}>💤 Pas de story du jour</Text>
                {lastShared ? <Text style={s.noStoryTrack} numberOfLines={1}>🎵 {lastShared.title}{lastShared.artist ? ` · ${lastShared.artist}` : ''}</Text> : null}
                {lastShared !== undefined ? <Text style={s.noStoryDetail}>{formatLastShared(lastShared?.at ?? null)}</Text> : null}
                {activity ? <Text style={[s.noStoryDetail, activity.online && s.noStoryOnline]} testID="quick-last-seen">{activity.online ? '● En ligne maintenant' : activity.lastActiveAt ? `Dernière connexion : ${formatSince(activity.lastActiveAt)}` : 'Jamais connecté récemment'}</Text> : null}
              </View>
            ) : null}
            {profile.bio ? <Text style={s.bio} numberOfLines={3}>{profile.bio}</Text> : null}
            {message ? <Text style={s.message}>{message}</Text> : null}

            <TouchableOpacity style={[s.follow, isFollowing && s.followOn]} onPress={() => void toggleFollow()} disabled={followBusy || profile.id === currentUserId}>
              {followBusy ? <ActivityIndicator color="#FFF" /> : <Text style={[s.followText, isFollowing && s.followTextOn]}>{profile.id === currentUserId ? 'MON PROFIL' : isFollowing ? '✓ TU LE SUIS' : "S'ABONNER"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => { onClose(); onOpenFull(profile.username); }}>
              <Text style={s.secondaryText}>VOIR LE PROFIL COMPLET</Text>
            </TouchableOpacity>
          </> : <Text style={s.message}>{message || 'Profil indisponible.'}</Text>}
          <TouchableOpacity style={s.close} onPress={onClose}><Text style={s.closeText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
  );
  if (inline) return visible ? <View style={StyleSheet.absoluteFill}>{body}</View> : null;
  return <KeepModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>{body}</KeepModal>;
}

const s = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.78)',justifyContent:'center',alignItems:'center',padding:14},
  card:{width:'100%',maxWidth:440,borderRadius:24,borderWidth:1,borderColor:'#40354E',backgroundColor:'#151020',padding:18,paddingBottom:20,alignItems:'center'},
  handle:{width:42,height:4,borderRadius:2,backgroundColor:'#51445F',marginBottom:16},
  avatar:{width:70,height:70,borderRadius:35,backgroundColor:colors.backgroundCard},
  avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:27,fontWeight:'900'},
  usernameRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10},
  username:{color:colors.textPrimary,fontSize:21,fontWeight:'900'},
  meta:{color:colors.primaryLight,fontSize:10,fontWeight:'800',marginTop:4,textAlign:'center'},
  noStoryBox:{alignSelf:'stretch',marginTop:10,paddingVertical:8,paddingHorizontal:12,borderRadius:14,backgroundColor:'#21182F',borderWidth:1,borderColor:'#40354E',alignItems:'center',gap:2},
  noStoryTitle:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  noStoryTrack:{color:'#FFFFFF',fontSize:12,fontWeight:'800',maxWidth:'100%'},
  noStoryOnline:{color:'#35E08A'},
  noStoryDetail:{color:'#D9C7FF',fontSize:11,fontWeight:'700'},
  bio:{color:colors.textSecondary,fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  message:{color:colors.textMuted,fontSize:11,lineHeight:16,textAlign:'center',marginVertical:8},
  follow:{width:'100%',minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12},
  followOn:{backgroundColor:'#1C3028',borderWidth:1,borderColor:'#3B8061'},
  followText:{color:'#FFF',fontSize:11,fontWeight:'900'},
  followTextOn:{color:'#76E3AE'},
  secondary:{width:'100%',minHeight:42,borderRadius:21,borderWidth:1,borderColor:'#6E4BA5',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',marginTop:8},
  secondaryText:{color:'#D9C7FF',fontSize:10,fontWeight:'900'},
  close:{minHeight:38,alignItems:'center',justifyContent:'center',marginTop:5},closeText:{color:colors.textMuted,fontSize:11,fontWeight:'700'},
});
