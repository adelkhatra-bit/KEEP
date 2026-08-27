import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

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
};

export default function SourceProfileQuickView({
  visible,
  username,
  currentUserId,
  accountRequired,
  onClose,
  onOpenFull,
  onRequireAccount,
}: Props) {
  const [profile, setProfile] = useState<QuickProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible || !username || !supabase) return;
    let live = true;
    setLoading(true);
    setMessage('');
    setProfile(null);

    void supabase
      .from('profiles')
      .select('id,username,display_name,bio,avatar_url,kind,city,country_code')
      .ilike('username', username.replace(/^@+/, ''))
      .eq('is_public', true)
      .limit(1)
      .then(({ data, error }) => {
        if (!live) return;
        if (!error && data?.[0]) setProfile(data[0] as QuickProfile);
        else setMessage('Profil indisponible pour le moment.');
      })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [username, visible]);

  const follow = async () => {
    if (!profile || followBusy) return;
    if (profile.id === currentUserId) {
      setMessage('C’est ton profil KEEP.');
      return;
    }
    if (accountRequired || !supabase) {
      onClose();
      onRequireAccount(profile.username);
      return;
    }

    setFollowBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: profile.id });
      if (error) throw error;
      setMessage(`Tu suis maintenant @${profile.username}.`);
    } catch {
      setMessage('Impossible de suivre ce profil pour le moment.');
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.handle} />
          {loading ? <ActivityIndicator color={colors.primaryLight} /> : profile ? <>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
              : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarText}>{profile.username.slice(0, 1).toUpperCase()}</Text></View>}
            <Text style={s.username}>@{profile.username}</Text>
            <Text style={s.meta}>{[profile.display_name, profile.kind, profile.city, profile.country_code].filter(Boolean).join(' · ')}</Text>
            {profile.bio ? <Text style={s.bio} numberOfLines={3}>{profile.bio}</Text> : null}
            {message ? <Text style={s.message}>{message}</Text> : null}

            <TouchableOpacity style={s.follow} onPress={() => void follow()} disabled={followBusy || profile.id === currentUserId}>
              {followBusy ? <ActivityIndicator color="#FFF" /> : <Text style={s.followText}>{profile.id === currentUserId ? 'MON PROFIL' : '+ SUIVRE'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => { onClose(); onOpenFull(profile.username); }}>
              <Text style={s.secondaryText}>VOIR LE PROFIL COMPLET</Text>
            </TouchableOpacity>
          </> : <Text style={s.message}>{message || 'Profil indisponible.'}</Text>}
          <TouchableOpacity style={s.close} onPress={onClose}><Text style={s.closeText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(3,2,7,.78)',justifyContent:'flex-end',alignItems:'center',padding:14},
  card:{width:'100%',maxWidth:440,borderRadius:24,borderWidth:1,borderColor:'#40354E',backgroundColor:'#151020',padding:18,paddingBottom:20,alignItems:'center'},
  handle:{width:42,height:4,borderRadius:2,backgroundColor:'#51445F',marginBottom:16},
  avatar:{width:70,height:70,borderRadius:35,backgroundColor:colors.backgroundCard},
  avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:27,fontWeight:'900'},
  username:{color:colors.textPrimary,fontSize:21,fontWeight:'900',marginTop:10},
  meta:{color:colors.primaryLight,fontSize:10,fontWeight:'800',marginTop:4,textAlign:'center'},
  bio:{color:colors.textSecondary,fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  message:{color:colors.textMuted,fontSize:11,lineHeight:16,textAlign:'center',marginVertical:8},
  follow:{width:'100%',minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12},
  followText:{color:'#FFF',fontSize:11,fontWeight:'900'},
  secondary:{width:'100%',minHeight:42,borderRadius:21,borderWidth:1,borderColor:'#6E4BA5',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center',marginTop:8},
  secondaryText:{color:'#D9C7FF',fontSize:10,fontWeight:'900'},
  close:{minHeight:38,alignItems:'center',justifyContent:'center',marginTop:5},closeText:{color:colors.textMuted,fontSize:11,fontWeight:'700'},
});
