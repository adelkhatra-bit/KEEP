import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CanonicalTrack } from '@keep/music';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { useFloatingChatStore } from '../store/useFloatingChatStore';
import { loadOwnProfileKeeps } from '../services/publicProfileStateService';
import { navigationRef } from '../navigation/navigationRef';
import MusicAgoraPanel from './MusicAgoraPanel';

export default function FloatingGlobalChat() {
  const user = useUserStore((state) => state.user);
  const isDemoMode = useUserStore((state) => state.isDemoMode);
  const isLocalGuest = useUserStore((state) => state.isLocalGuest);
  const open = useFloatingChatStore((state) => state.open);
  const side = useFloatingChatStore((state) => state.side);
  const setOpen = useFloatingChatStore((state) => state.setOpen);
  const setSide = useFloatingChatStore((state) => state.setSide);
  const [tracks, setTracks] = useState<CanonicalTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const enabled = Boolean(user?.id && !isDemoMode && !isLocalGuest);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!open || !enabled) return;
    let live = true;
    setTracksLoading(true);
    loadOwnProfileKeeps()
      .then((rows) => {
        if (!live) return;
        const seen = new Set<string>();
        const next: CanonicalTrack[] = [];
        for (const row of rows) {
          if (!row.track?.id || seen.has(row.track.id)) continue;
          seen.add(row.track.id);
          next.push(row.track);
        }
        setTracks(next);
      })
      .catch(() => { if (live) setTracks([]); })
      .finally(() => { if (live) setTracksLoading(false); });
    return () => { live = false; };
  }, [open, enabled, user?.id]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -18) setSide('LEFT');
      if (gesture.dx > 18) setSide('RIGHT');
    },
  }), [setSide]);

  if (!enabled || !user) return null;

  const openProfile = (username: string) => {
    setOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate('PublicProfile' as never, { username } as never);
    }
  };

  return <>
    <View
      pointerEvents="box-none"
      style={[
        s.launcherWrap,
        { bottom: 74 + insets.bottom },
        side === 'LEFT' ? s.launcherLeft : s.launcherRight,
      ]}
    >
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          s.launcherGlow,
          {
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
              { rotateZ: pulse.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] }) },
            ],
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [.78, 1] }),
          },
        ]}
      >
        <TouchableOpacity
          style={s.launcher}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le Tchat Loki"
        >
          <View style={s.launcherInner}><Text style={s.launcherIcon}>◉</Text></View>
          <Text style={s.launcherText}>TCHAT</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>

    <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setOpen(false)} accessibilityLabel="Fermer le Tchat" />
        <View style={[s.sheet, { paddingBottom: Math.max(12, insets.bottom + 4) }]}>
          <View style={s.sheetTop}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeadRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.sheetKicker}>LOKI LIVE</Text>
                <Text style={s.sheetTitle}>Le Tchat te suit partout.</Text>
                <Text style={s.sheetHint}>{tracksLoading ? 'Synchronisation de ta musique…' : 'Parle · fais écouter · partage · propose tes pépites sans quitter ta page.'}</Text>
              </View>
              <TouchableOpacity style={s.close} onPress={() => setOpen(false)} accessibilityLabel="Fermer le Tchat"><Text style={s.closeText}>×</Text></TouchableOpacity>
            </View>
          </View>
          <MusicAgoraPanel
            currentProfileId={user.id}
            enabled
            shareableTracks={tracks}
            onOpenProfile={openProfile}
          />
        </View>
      </View>
    </Modal>
  </>;
}

const s=StyleSheet.create({
  launcherWrap:{position:'absolute',zIndex:250,elevation:30},
  launcherLeft:{left:8},
  launcherRight:{right:8},
  launcherGlow:{borderRadius:26,shadowColor:colors.primaryLight,shadowOpacity:.7,shadowRadius:16,shadowOffset:{width:0,height:0},elevation:18},
  launcher:{minWidth:56,height:50,borderRadius:25,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(20,14,31,.96)',paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:5},
  launcherInner:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.09)',alignItems:'center',justifyContent:'center'},
  launcherIcon:{color:colors.keep,fontSize:20,fontWeight:'900'},
  launcherText:{color:colors.white,fontSize:8,fontWeight:'1000',letterSpacing:.8,paddingRight:3},
  backdrop:{flex:1,backgroundColor:'rgba(4,3,8,.58)',justifyContent:'flex-end'},
  sheet:{maxHeight:'88%',borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderBottomWidth:0,borderColor:colors.primary,backgroundColor:'rgba(14,10,20,.99)',paddingHorizontal:12,paddingTop:8,shadowColor:'#000',shadowOpacity:.45,shadowRadius:26,shadowOffset:{width:0,height:-12},elevation:28},
  sheetTop:{paddingHorizontal:4,paddingBottom:8},
  sheetHandle:{width:48,height:4,borderRadius:2,backgroundColor:colors.primaryLight,alignSelf:'center',opacity:.7,marginBottom:8},
  sheetHeadRow:{flexDirection:'row',alignItems:'flex-start',gap:10},
  sheetKicker:{color:colors.keep,fontSize:9,fontWeight:'1000',letterSpacing:1.5},
  sheetTitle:{color:colors.white,fontSize:18,fontWeight:'1000',marginTop:2},
  sheetHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:3},
  close:{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  closeText:{color:colors.white,fontSize:22,fontWeight:'900',lineHeight:24},
});
