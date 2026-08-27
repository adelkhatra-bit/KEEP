import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CanonicalTrack } from '@keep/music';
import SwipeDeck from './SwipeDeck';
import { stopTrackPreview, toggleTrackPreview } from '../services/audioPreviewService';
import { colors } from '../theme/colors';

function shuffle<T>(input: T[]): T[] {
  const next = [...input];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

type Props = {
  visible: boolean;
  tracks: CanonicalTrack[];
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onKeep?: (track: CanonicalTrack) => void | Promise<void>;
};

export default function MusicSwipeDeckModal({ visible, tracks, title = 'Découverte musicale', subtitle, onClose, onKeep }: Props) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [keeping, setKeeping] = useState(false);
  const shuffled = useMemo(() => shuffle(tracks), [tracks, round]);
  const current = shuffled[index];

  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    setRound((value) => value + 1);
  }, [visible]);

  useEffect(() => {
    if (!visible || !current?.previewUrl) {
      void stopTrackPreview();
      return;
    }
    let alive = true;
    void stopTrackPreview().then(() => {
      if (!alive || !current.previewUrl) return;
      void toggleTrackPreview(`swipe-${current.id}`, current.previewUrl, () => {});
    }).catch(() => {});
    return () => {
      alive = false;
      void stopTrackPreview(`swipe-${current.id}`);
    };
  }, [visible, current?.id, current?.previewUrl]);

  const advance = () => {
    void stopTrackPreview();
    if (index + 1 >= shuffled.length) {
      setIndex(0);
      setRound((value) => value + 1);
    } else setIndex((value) => value + 1);
  };

  const keep = async () => {
    if (!current || keeping) return;
    setKeeping(true);
    try {
      await onKeep?.(current);
      advance();
    } finally {
      setKeeping(false);
    }
  };

  const close = () => {
    void stopTrackPreview();
    onClose();
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerText}><Text style={s.eyebrow}>KEEP SWIPE</Text><Text style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>
        <TouchableOpacity style={s.close} onPress={close} accessibilityLabel="Retour au profil"><Text style={s.closeText}>✕</Text></TouchableOpacity>
      </View>

      <View style={s.body}>
        {!current ? <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.emptyTitle}>Aucun morceau à découvrir.</Text><TouchableOpacity style={s.backButton} onPress={close}><Text style={s.backText}>RETOUR AU PROFIL</Text></TouchableOpacity></View> : <>
          <SwipeDeck
            resetKey={current.id}
            enabled={!keeping}
            onSwipeLeft={advance}
            onSwipeRight={keep}
            leftLabel="PASSER"
            rightLabel="KEEP"
            hint="Glisse ← pour passer · → pour ajouter à ton KEEP"
          >
            <View style={s.card}>
              {current.artworkUrl ? <Image source={{ uri: current.artworkUrl }} style={s.cover} resizeMode="cover" /> : <View style={[s.cover,s.coverFallback]}><Text style={s.coverK}>K</Text></View>}
              <View style={s.gradientFake}>
                <View style={s.autoRow}><View style={[s.dot,current.previewUrl ? s.dotOn : s.dotOff]} /><Text style={s.autoText}>{current.previewUrl ? 'Lecture automatique' : 'Extrait indisponible'}</Text></View>
                <Text style={s.trackTitle} numberOfLines={2}>{current.title}</Text>
                <Text style={s.artist} numberOfLines={1}>{current.artist}</Text>
                {current.album ? <Text style={s.album} numberOfLines={1}>{current.album}</Text> : null}
              </View>
            </View>
          </SwipeDeck>

          <View style={s.actions}>
            <TouchableOpacity style={[s.round,s.pass]} onPress={advance} disabled={keeping} accessibilityLabel="Passer"><Text style={s.passText}>✕</Text></TouchableOpacity>
            <TouchableOpacity style={[s.round,s.keep]} onPress={() => void keep()} disabled={keeping} accessibilityLabel="Garder dans KEEP">{keeping ? <ActivityIndicator color="#111"/> : <Text style={s.keepText}>♡</Text>}</TouchableOpacity>
          </View>
          <TouchableOpacity style={s.profileBack} onPress={close}><Text style={s.profileBackText}>‹ Retour au profil</Text></TouchableOpacity>
        </>}
      </View>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#090610'},
  header:{minHeight:78,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#241A32'},
  headerText:{flex:1,paddingRight:12},eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.5},title:{color:'#F8F6FC',fontSize:20,fontWeight:'900',marginTop:2},subtitle:{color:'#8F879D',fontSize:10,marginTop:3},
  close:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#171020',borderWidth:1,borderColor:'#312348'},closeText:{color:'#FFF',fontSize:18,fontWeight:'900'},
  body:{flex:1,justifyContent:'center',paddingHorizontal:18,paddingBottom:18},
  card:{height:500,maxHeight:'70%',borderRadius:28,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},
  cover:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},coverFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},coverK:{color:colors.primaryLight,fontSize:72,fontWeight:'900',letterSpacing:6},
  gradientFake:{padding:20,paddingTop:90,backgroundColor:'rgba(9,6,16,.68)'},autoRow:{flexDirection:'row',alignItems:'center',marginBottom:8},dot:{width:8,height:8,borderRadius:4,marginRight:6},dotOn:{backgroundColor:'#68F2B1'},dotOff:{backgroundColor:'#756B84'},autoText:{color:'#D3C9DE',fontSize:10,fontWeight:'800'},trackTitle:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},artist:{color:'#F0EAF7',fontSize:16,fontWeight:'800',marginTop:6},album:{color:'#A99DB9',fontSize:12,marginTop:3},
  actions:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:30,marginTop:18},round:{width:62,height:62,borderRadius:31,alignItems:'center',justifyContent:'center',borderWidth:2},pass:{backgroundColor:'#151020',borderColor:'#FF5F83'},keep:{backgroundColor:'#E5F266',borderColor:'#E5F266'},passText:{color:'#FF5F83',fontSize:28,fontWeight:'700'},keepText:{color:'#17130B',fontSize:28,fontWeight:'900'},
  profileBack:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:10},profileBackText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},
  empty:{alignItems:'center',padding:24},emptyIcon:{fontSize:48,color:colors.primaryLight},emptyTitle:{color:'#F8F6FC',fontSize:16,fontWeight:'900',marginTop:10},backButton:{marginTop:18,minHeight:46,paddingHorizontal:22,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontWeight:'900',fontSize:11},
});
