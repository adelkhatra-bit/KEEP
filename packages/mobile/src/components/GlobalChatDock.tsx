import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MusicAgoraPanel from './MusicAgoraPanel';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { loadMusicAgoraSettings, loadMusicAgoraShareableTracks, MusicAgoraSurface } from '../services/musicAgoraService';
import { KeepNotification, loadNotifications, subscribeToNotifications } from '../services/notificationService';
import { navigateToSharedProfile, navigationRef } from '../navigation/navigationRef';
import { useGlobalChatStore } from '../store/useGlobalChatStore';

function isChatNotification(item: KeepNotification): boolean {
  return String(item.type || '').toUpperCase().startsWith('AGORA');
}

export default function GlobalChatDock() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const open = useGlobalChatStore((state) => state.isOpen);
  const side = useGlobalChatStore((state) => state.side);
  const bottomOffset = useGlobalChatStore((state) => state.bottomOffset);
  const target = useGlobalChatStore((state) => state.target);
  const openChat = useGlobalChatStore((state) => state.open);
  const closeChat = useGlobalChatStore((state) => state.close);
  const setSide = useGlobalChatStore((state) => state.setSide);
  const setBottomOffset = useGlobalChatStore((state) => state.setBottomOffset);
  const [tracks, setTracks] = useState<any[]>([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']);
  const [currentSurface, setCurrentSurface] = useState<MusicAgoraSurface | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const nudge = useRef(new Animated.Value(0)).current;
  const lastNudgeUnread = useRef(0);
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragStartBottom = useRef(bottomOffset);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const accountReady = Boolean(user && !isDemoMode && !isLocalGuest);

  useEffect(() => {
    if (!accountReady || !user?.id) {
      closeChat();
      setTracks([]);
      setChatEnabled(false);
      setChatSurfaces(['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE']);
      setUnreadCount(0);
      return;
    }
    let live = true;
    Promise.all([
      loadMusicAgoraSettings().catch(() => ({ homeEnabled: false, notificationsEnabled: true, surfaces: ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'] as MusicAgoraSurface[] })),
      loadNotifications(user.id).catch(() => []),
    ]).then(([settings, notifications]) => {
      if (!live) return;
      setChatEnabled(Boolean(settings.homeEnabled));
      setChatSurfaces(settings.surfaces);
      setUnreadCount(notifications.filter((item) => !item.readAt && isChatNotification(item)).length);
      if (!settings.homeEnabled) closeChat();
    });
    return () => { live = false; };
  }, [accountReady, user?.id, closeChat]);

  useEffect(() => {
    if (!accountReady || !user?.id) return;
    return subscribeToNotifications(user.id, (item) => {
      if (!isChatNotification(item)) return;
      setUnreadCount((value) => value + 1);
    });
  }, [accountReady, user?.id]);

  useEffect(() => {
    const routeToSurface = (name?: string): MusicAgoraSurface | null => {
      if (!name) return null;
      if (name === 'Listen') return 'LISTEN';
      if (name === 'Discover') return 'DISCOVER';
      if (['MyMusic','PlaylistSale','PlaylistSaleHistory'].includes(name)) return 'PLAYLISTS';
      if (name === 'Parties') return 'PARTIES';
      if (['Profile','PublicProfile','ProfileSettings','Offers','MusicConnections'].includes(name)) return 'PROFILE';
      return null;
    };
    let live = true;
    const sync = () => {
      if (!live) return;
      const next = routeToSurface(navigationRef.getCurrentRoute()?.name);
      setCurrentSurface(next);
      if (accountReady && user?.id) {
        loadMusicAgoraSettings().then((settings) => {
          if (!live) return;
          setChatEnabled(Boolean(settings.homeEnabled));
          setChatSurfaces(settings.surfaces);
        }).catch(() => {});
      }
    };
    const timer = setTimeout(sync, 0);
    const unsubscribe = navigationRef.addListener('state', sync);
    return () => { live = false; clearTimeout(timer); unsubscribe(); };
  }, [accountReady, user?.id]);

  const surfaceVisible = Boolean(currentSurface && chatSurfaces.includes(currentSurface));

  useEffect(() => {
    if (!surfaceVisible && open) closeChat();
  }, [surfaceVisible, open, closeChat]);

  useEffect(() => {
    if (!chatEnabled || !accountReady) return;
    let live = true;
    loadMusicAgoraShareableTracks(160).then((rows) => {
      if (!live) return;
      setTracks(rows.map((row) => row.track));
    }).catch(() => { if (live) setTracks([]); });
    return () => { live = false; };
  }, [chatEnabled, accountReady, user?.id, open]);

  useEffect(() => {
    if (!accountReady || !chatEnabled || !surfaceVisible || open) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [accountReady, chatEnabled, surfaceVisible, open, pulse]);

  useEffect(() => {
    if (!accountReady || !chatEnabled || !surfaceVisible || open) {
      nudge.stopAnimation();
      nudge.setValue(0);
      return;
    }
    const shouldShow = unreadCount > lastNudgeUnread.current || (lastNudgeUnread.current === 0 && unreadCount === 0);
    lastNudgeUnread.current = unreadCount;
    if (!shouldShow) return;
    nudge.stopAnimation();
    nudge.setValue(0);
    Animated.sequence([
      Animated.timing(nudge, { toValue: 1, duration: 360, useNativeDriver: false }),
      Animated.delay(unreadCount > 0 ? 3000 : 1600),
      Animated.timing(nudge, { toValue: 0, duration: 420, useNativeDriver: false }),
    ]).start();
  }, [accountReady, chatEnabled, surfaceVisible, open, unreadCount, nudge]);

  const minBottom = 82 + insets.bottom;
  const maxBottom = Math.max(minBottom, height - 150);

  useEffect(() => {
    if (bottomOffset < minBottom) setBottomOffset(minBottom);
    if (bottomOffset > maxBottom) setBottomOffset(maxBottom);
  }, [bottomOffset, minBottom, maxBottom, setBottomOffset]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
    onPanResponderGrant: () => {
      dragStartBottom.current = bottomOffset;
      drag.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: (_event, gesture) => {
      drag.setValue({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx < -24) setSide('left');
      else if (gesture.dx > 24) setSide('right');
      const nextBottom = Math.max(minBottom, Math.min(maxBottom, dragStartBottom.current - gesture.dy));
      setBottomOffset(nextBottom);
      Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }).start();
    },
  }), [bottomOffset, drag, maxBottom, minBottom, setBottomOffset, setSide]);

  const toggle = () => {
    if (!accountReady || !chatEnabled) return;
    if (open) {
      closeChat();
      return;
    }
    setUnreadCount(0);
    openChat(target);
  };

  if (!accountReady || !chatEnabled || !surfaceVisible || !user) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? (
        <MusicAgoraPanel
          compact
          compactSide={side}
          currentProfileId={user.id}
          enabled
          shareableTracks={tracks}
          initialRoomSlug={target?.roomSlug ?? undefined}
          initialReplyTarget={target?.targetProfileId ? { profileId: target.targetProfileId, username: target.targetUsername || 'utilisateur' } : undefined}
          onOpenProfile={(username) => navigateToSharedProfile(username)}
          onCompactClose={closeChat}
        />
      ) : null}

      {!open ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chatNudge,
            side === 'left' ? styles.chatNudgeLeft : styles.chatNudgeRight,
            {
              bottom: Math.max(minBottom, Math.min(maxBottom, bottomOffset)) + 7,
              opacity: nudge,
              width: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 190] }),
              transform: [{ scaleX: nudge.interpolate({ inputRange: [0, 1], outputRange: [.72, 1] }) }],
            },
          ]}
        >
          <View style={styles.chatNudgeDepth} />
          <Text style={styles.chatNudgeText} numberOfLines={1}>
            {unreadCount > 0 ? `${unreadCount} message${unreadCount > 1 ? 's' : ''} · ouvre le chat` : 'Tchat Loki · prêt à discuter'}
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.fabWrap,
          side === 'left' ? styles.fabLeft : styles.fabRight,
          { bottom: Math.max(minBottom, Math.min(maxBottom, bottomOffset)), transform: [{ translateX: drag.x }, { translateY: drag.y }, { scale: pulse }] },
        ]}
      >
        <View style={styles.halo} />
        <TouchableOpacity
          style={[styles.fab, open && styles.fabOpen]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Réduire le Tchat Loki' : 'Ouvrir le Tchat Loki'}
        >
          <View style={styles.fabDepthBack} />
          <View style={styles.fabDepthMid} />
          <View style={styles.fabFace}>
            <View style={styles.robotHead}>
              <View style={styles.robotAntenna} />
              <View style={styles.robotEyes}><View style={styles.robotEye}/><View style={styles.robotEye}/></View>
              <View style={styles.robotMouth}/>
            </View>
            {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View> : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  chatNudge:{position:'absolute',zIndex:88,height:40,borderRadius:20,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(20,14,31,.98)',justifyContent:'center',overflow:'hidden',shadowColor:'#000',shadowOpacity:.32,shadowRadius:10,shadowOffset:{width:0,height:5},elevation:16},
  chatNudgeLeft:{left:70},chatNudgeRight:{right:70},chatNudgeDepth:{position:'absolute',left:5,right:5,bottom:3,height:5,borderRadius:3,backgroundColor:'rgba(90,61,196,.28)'},chatNudgeText:{minWidth:190,paddingHorizontal:13,color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.15},
  fabWrap: { position: 'absolute', zIndex: 90, elevation: 30 },
  fabLeft: { left: 12 },
  fabRight: { right: 12 },
  halo:{position:'absolute',left:-5,top:-5,width:64,height:64,borderRadius:32,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.05)',opacity:.65},
  fab: { width: 54, height: 54, position: 'relative' },
  fabOpen: { opacity: .96 },
  fabDepthBack: { position: 'absolute', left: 7, top: 8, width: 47, height: 47, borderRadius: 24, backgroundColor: 'rgba(90,61,196,.34)' },
  fabDepthMid: { position: 'absolute', left: 3, top: 4, width: 49, height: 49, borderRadius: 25, backgroundColor: 'rgba(41,194,255,.28)' },
  fabFace: {
    width: 49, height: 49, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primaryLight,
    backgroundColor: 'rgba(20,14,31,.98)',
    shadowColor: '#000', shadowOpacity: .42, shadowRadius: 12, shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  robotHead:{width:27,height:23,borderRadius:8,borderWidth:1.4,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',alignItems:'center',justifyContent:'center'},
  robotAntenna:{position:'absolute',top:-6,width:2,height:6,borderRadius:1,backgroundColor:colors.primaryLight},
  robotEyes:{flexDirection:'row',gap:6},
  robotEye:{width:4,height:4,borderRadius:2,backgroundColor:colors.keep},
  robotMouth:{width:10,height:2,borderRadius:1,backgroundColor:colors.primaryLight,marginTop:4},
  badge:{position:'absolute',right:-4,top:-4,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:colors.danger,borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},
  badgeText:{color:'#FFF',fontSize:8,fontWeight:'900'},
});
