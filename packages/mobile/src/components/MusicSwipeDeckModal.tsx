import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

type KeepVisibilityChoice = 'PUBLIC' | 'PRIVATE';

type Props = {
  visible: boolean;
  tracks: CanonicalTrack[];
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  backLabel?: string;
  loop?: boolean;
  askVisibilityOnKeep?: boolean;
  onClose: () => void;
  onKeep?: (track: CanonicalTrack, visibility: KeepVisibilityChoice) => boolean | void | Promise<boolean | void>;
  onPass?: (track: CanonicalTrack) => boolean | void | Promise<boolean | void>;
};

function chooseVisibility(): Promise<KeepVisibilityChoice | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const showOnProfile = window.confirm('Afficher ce morceau sur ton profil KEEP ?\n\nOK = visible sur ton profil\nAnnuler = garder en privé');
    return Promise.resolve(showOnProfile ? 'PUBLIC' : 'PRIVATE');
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Garder ce morceau',
      'Où veux-tu le ranger ?',
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Garder masqué', onPress: () => resolve('PRIVATE') },
        { text: 'Partager sur mon profil', onPress: () => resolve('PUBLIC') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export default function MusicSwipeDeckModal({
  visible,
  tracks,
  title = 'Découverte musicale',
  subtitle,
  emptyTitle = 'Aucun morceau à découvrir.',
  backLabel = 'REVENIR AU PROFIL',
  loop = true,
  askVisibilityOnKeep = false,
  onClose,
  onKeep,
  onPass,
}: Props) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const actionInFlight = useRef(false);
  const shuffled = useMemo(() => shuffle(tracks), [tracks, round]);
  const current = shuffled[index];

  const advanceIndex = useCallback(() => {
    if (index + 1 >= shuffled.length) {
      if (loop) {
        setIndex(0);
        setRound((value) => value + 1);
      } else {
        setIndex(shuffled.length);
      }
      return;
    }
    setIndex((value) => value + 1);
  }, [index, loop, shuffled.length]);

  useEffect(() => {
    if (!visible) return;
    actionInFlight.current = false;
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
      void toggleTrackPreview(
        `swipe-${current.id}`,
        current.previewUrl,
        () => {},
        () => {
          if (!alive || actionInFlight.current) return;
          advanceIndex();
        },
      );
    }).catch(() => {});
    return () => {
      alive = false;
      void stopTrackPreview(`swipe-${current.id}`);
    };
  }, [visible, current?.id, current?.previewUrl, advanceIndex, round]);

  const advance = async () => {
    await stopTrackPreview();
    advanceIndex();
  };

  const keep = async () => {
    if (!current || processing) return;
    actionInFlight.current = true;
    setProcessing(true);
    try {
      const visibility = askVisibilityOnKeep ? await chooseVisibility() : 'PRIVATE';
      if (!visibility) return;
      const result = await onKeep?.(current, visibility);
      if (result !== false) await advance();
    } finally {
      actionInFlight.current = false;
      setProcessing(false);
    }
  };

  const pass = async () => {
    if (!current || processing) return;
    actionInFlight.current = true;
    setProcessing(true);
    try {
      const result = await onPass?.(current);
      if (result !== false) await advance();
    } finally {
      actionInFlight.current = false;
      setProcessing(false);
    }
  };

  const close = async () => {
    actionInFlight.current = true;
    try {
      await stopTrackPreview();
      onClose();
    } finally {
      actionInFlight.current = false;
    }
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { void close(); }} presentationStyle="fullScreen">
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerText}><Text style={s.eyebrow}>KEEP SWIPE</Text><Text style={s.title}>{title}</Text>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>
        <TouchableOpacity style={s.close} onPress={() => { void close(); }} accessibilityLabel="Fermer le swipe"><Text style={s.closeText}>✕</Text></TouchableOpacity>
      </View>

      <View style={s.body}>
        {!current ? <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.emptyTitle}>{emptyTitle}</Text><TouchableOpacity style={s.backButton} onPress={() => { void close(); }}><Text style={s.backText}>{backLabel}</Text></TouchableOpacity></View> : <>
          <SwipeDeck
            resetKey={current.id}
            enabled={!processing}
            onSwipeLeft={() => { void pass(); }}
            onSwipeRight={() => { void keep(); }}
            leftLabel="PASSER"
            rightLabel="KEEP"
            hint={askVisibilityOnKeep ? 'Glisse ← pour passer · → pour garder puis choisir profil ou masqué' : 'Glisse ← pour passer · → pour ajouter à ton KEEP'}
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

          <View style={s.decisionRow}>
            <TouchableOpacity style={[s.decisionButton, s.passButton]} onPress={() => { void pass(); }} disabled={processing} accessibilityLabel="Passer cette musique">
              <Text style={s.passButtonText}>✕ PASSER</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.decisionButton, s.backDecisionButton]} onPress={() => { void close(); }} disabled={processing} accessibilityLabel={backLabel}>
              <Text style={s.backDecisionText}>‹ {backLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.decisionButton, s.keepButton]} onPress={() => { void keep(); }} disabled={processing} accessibilityLabel="Garder cette musique">
              {processing ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={s.keepButtonText}>♡ GARDER</Text>}
            </TouchableOpacity>
          </View>
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
  decisionRow:{flexDirection:'row',alignItems:'stretch',gap:7,marginTop:14},decisionButton:{flex:1,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:5,borderWidth:1},passButton:{backgroundColor:colors.pass,borderColor:colors.pass},passButtonText:{color:colors.white,fontSize:9,fontWeight:'900'},backDecisionButton:{backgroundColor:'#171020',borderColor:'#5B3F8C'},backDecisionText:{color:'#CDB7F4',fontSize:8,fontWeight:'900',textAlign:'center'},keepButton:{backgroundColor:colors.keep,borderColor:colors.keep},keepButtonText:{color:colors.black,fontSize:9,fontWeight:'900'},
  empty:{alignItems:'center',padding:24},emptyIcon:{fontSize:48,color:colors.primaryLight},emptyTitle:{color:'#F8F6FC',fontSize:16,fontWeight:'900',marginTop:10,textAlign:'center'},backButton:{marginTop:18,minHeight:46,paddingHorizontal:22,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},backText:{color:'#FFF',fontWeight:'900',fontSize:11},
});
