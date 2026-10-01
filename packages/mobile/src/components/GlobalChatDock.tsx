import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MusicAgoraPanel from './MusicAgoraPanel';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { loadMusicAgoraSettings, loadMusicAgoraShareableTracks, saveMusicAgoraPosition, saveMusicAgoraSettings, MusicAgoraSurface } from '../services/musicAgoraService';
import { KeepNotification, loadNotifications, subscribeToNotifications } from '../services/notificationService';
import { navigateToSharedProfile, navigationRef } from '../navigation/navigationRef';
import { useGlobalChatStore } from '../store/useGlobalChatStore';

function isChatNotification(item: KeepNotification): boolean {
  const type = String(item.type || '').toUpperCase();
  return type.startsWith('AGORA') || type.startsWith('CHAT');
}

const ALL_CHAT_SURFACES: MusicAgoraSurface[] = ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS'];

function chatSurfaceForRoute(routeName?: string | null): MusicAgoraSurface | null {
  const name = String(routeName || '');
  if (name === 'Listen' || name === 'SessionRecap' || name === 'SessionHistory') return 'LISTEN';
  if (name === 'Discover') return 'DISCOVER';
  if (name === 'MyMusic' || name === 'PlaylistSale' || name === 'PlaylistSaleHistory' || name === 'MusicConnections' || name === 'AppleMusicConnect') return 'PLAYLISTS';
  if (name === 'Parties') return 'PARTIES';
  if (name === 'Profile' || name === 'PublicProfile' || name === 'ProfileSettings' || name === 'Offers') return 'PROFILE';
  if (name === 'Notifications') return 'NOTIFICATIONS';
  return null;
}

export default function GlobalChatDock() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);

  const open = useGlobalChatStore((state) => state.isOpen);
  const side = useGlobalChatStore((state) => state.side);
  const bottomOffset = useGlobalChatStore((state) => state.bottomOffset);
  const target = useGlobalChatStore((state) => state.target);
  const settingsOpen = useGlobalChatStore((state) => state.settingsOpen);
  const openChat = useGlobalChatStore((state) => state.open);
  const closeChat = useGlobalChatStore((state) => state.close);
  const setSide = useGlobalChatStore((state) => state.setSide);
  const setBottomOffset = useGlobalChatStore((state) => state.setBottomOffset);
  const closeSettings = useGlobalChatStore((state) => state.closeSettings);

  const [tracks, setTracks] = useState<any[]>([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(ALL_CHAT_SURFACES);
  const [activeSurface, setActiveSurface] = useState<MusicAgoraSurface | null>('PROFILE');
  const [chatSaving, setChatSaving] = useState(false);
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
    const syncRoute = () => {
      const current = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null;
      setActiveSurface(chatSurfaceForRoute(current));
    };
    syncRoute();
    const timer = setInterval(syncRoute, 750);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accountReady || !user?.id) {
      closeChat();
      setTracks([]);
      setChatEnabled(false);
      setUnreadCount(0);
      return;
    }

    let live = true;
    Promise.all([
      loadMusicAgoraSettings().catch(() => ({
        homeEnabled: false,
        notificationsEnabled: true,
        surfaces: ALL_CHAT_SURFACES,
        side: 'right' as const,
        bottomOffset: 88,
      })),
      loadNotifications(user.id).catch(() => []),
    ]).then(([settings, notifications]) => {
      if (!live) return;
      setChatEnabled(Boolean(settings.homeEnabled));
      setChatNotificationsEnabled(Boolean(settings.notificationsEnabled));
      setChatSurfaces(settings.surfaces?.length ? settings.surfaces : ALL_CHAT_SURFACES);
      setSide(settings.side);
      setBottomOffset(settings.bottomOffset);
      setUnreadCount(notifications.filter((item) => !item.readAt && isChatNotification(item)).length);
    });

    return () => { live = false; };
  }, [accountReady, user?.id, closeChat, setBottomOffset, setSide]);

  useEffect(() => {
    if (!accountReady || !user?.id) return;
    return subscribeToNotifications(user.id, (item) => {
      if (!isChatNotification(item)) return;
      setUnreadCount((value) => value + 1);
    });
  }, [accountReady, user?.id]);

  useEffect(() => {
    if (!accountReady || (!chatEnabled && !open)) {
      setTracks([]);
      return;
    }
    let live = true;
    loadMusicAgoraShareableTracks(160)
      .then((rows) => {
        if (!live) return;
        setTracks(rows.map((row) => ({
          ...row.track,
          canSell: row.canSell,
          sourceUsername: row.sourceUsername,
        })));
      })
      .catch(() => { if (live) setTracks([]); });
    return () => { live = false; };
  }, [accountReady, chatEnabled, open, user?.id]);

  useEffect(() => {
    if (!accountReady || !open || chatEnabled || chatSaving) return;
    let live = true;
    setChatSaving(true);
    saveMusicAgoraSettings(true, chatNotificationsEnabled, chatSurfaces.length ? chatSurfaces : ['PROFILE'])
      .then((settings) => {
        if (!live) return;
        setChatEnabled(true);
        setChatNotificationsEnabled(settings.notificationsEnabled);
        setChatSurfaces(settings.surfaces?.length ? settings.surfaces : ALL_CHAT_SURFACES);
        setSide(settings.side);
        setBottomOffset(settings.bottomOffset);
      })
      .catch(() => {
        if (live) closeChat();
      })
      .finally(() => { if (live) setChatSaving(false); });
    return () => { live = false; };
  }, [accountReady, open, chatEnabled, chatNotificationsEnabled, chatSurfaces, chatSaving, closeChat, setBottomOffset, setSide]);

  useEffect(() => {
    if (!accountReady || open) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.065, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [accountReady, open, pulse]);

  useEffect(() => {
    if (!accountReady || open || unreadCount <= 0) {
      nudge.stopAnimation();
      nudge.setValue(0);
      return;
    }
    if (unreadCount <= lastNudgeUnread.current) return;
    lastNudgeUnread.current = unreadCount;
    nudge.stopAnimation();
    nudge.setValue(0);
    Animated.sequence([
      Animated.timing(nudge, { toValue: 1, duration: 280, useNativeDriver: false }),
      Animated.delay(2600),
      Animated.timing(nudge, { toValue: 0, duration: 320, useNativeDriver: false }),
    ]).start();
  }, [accountReady, open, unreadCount, nudge]);

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
      const nextSide = gesture.dx < -24 ? 'left' : gesture.dx > 24 ? 'right' : side;
      const nextBottom = Math.max(minBottom, Math.min(maxBottom, dragStartBottom.current - gesture.dy));
      setSide(nextSide);
      setBottomOffset(nextBottom);
      void saveMusicAgoraPosition(nextSide, nextBottom).catch(() => {});
      Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 7 }).start();
    },
  }), [bottomOffset, drag, maxBottom, minBottom, setBottomOffset, setSide, side]);

  const saveProfileSettings = async (
    enabled: boolean,
    notificationsEnabled = chatNotificationsEnabled,
    surfaces: MusicAgoraSurface[] = chatSurfaces,
  ) => {
    if (!accountReady || chatSaving) return;
    setChatSaving(true);
    try {
      const nextSurfaces: MusicAgoraSurface[] = surfaces.length ? surfaces : ['PROFILE'];
      const settings = await saveMusicAgoraSettings(enabled, notificationsEnabled, nextSurfaces);
      setChatEnabled(settings.homeEnabled);
      setChatNotificationsEnabled(settings.notificationsEnabled);
      setChatSurfaces(settings.surfaces?.length ? settings.surfaces : nextSurfaces);
      setSide(settings.side);
      setBottomOffset(settings.bottomOffset);
      if (!settings.homeEnabled) closeChat();
    } finally {
      setChatSaving(false);
    }
  };

  const toggleSurface = (surface: MusicAgoraSurface) => {
    const next = chatSurfaces.includes(surface)
      ? chatSurfaces.filter((value) => value !== surface)
      : [...chatSurfaces, surface];
    void saveProfileSettings(true, chatNotificationsEnabled, next);
  };

  const toggle = async () => {
    if (!accountReady || chatSaving) return;
    if (open) {
      closeChat();
      return;
    }
    if (!chatEnabled) await saveProfileSettings(true);
    setUnreadCount(0);
    openChat(target);
  };

  const chooseSide = (nextSide: 'left' | 'right') => {
    setSide(nextSide);
    void saveMusicAgoraPosition(nextSide, bottomOffset).catch(() => {});
  };

  const surfaceVisible = activeSurface === 'PROFILE'
    ? true
    : Boolean(activeSurface && chatSurfaces.includes(activeSurface));

  if (!accountReady || !user) return null;
  if (!open && !settingsOpen && !surfaceVisible) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={closeSettings}>
        <View style={styles.settingsBackdrop}>
          <View style={styles.settingsSheet}>
            <View style={styles.settingsHeader}>
              <View style={styles.settingsHeaderCopy}>
                <Text style={styles.settingsKicker}>TCHAT</Text>
                <Text style={styles.settingsTitle}>Sur ton profil</Text>
              </View>
              <TouchableOpacity style={styles.settingsClose} onPress={closeSettings} accessibilityLabel="Fermer les réglages du Tchat">
                <Text style={styles.settingsCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Actif</Text>
              <Switch
                value={chatEnabled}
                disabled={chatSaving}
                onValueChange={(value) => void saveProfileSettings(value)}
                trackColor={{ false: colors.border, true: colors.keep }}
              />
            </View>

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Notifications</Text>
              <Switch
                value={chatNotificationsEnabled}
                disabled={chatSaving || !chatEnabled}
                onValueChange={(value) => void saveProfileSettings(true, value)}
                trackColor={{ false: colors.border, true: colors.keep }}
              />
            </View>

            <View style={styles.settingsScreens}>
              <Text style={styles.settingsScreenTitle}>OÙ AFFICHER LA MESSAGERIE ?</Text>
              <View style={styles.settingsScreenGrid}>
                {([
                  ['LISTEN','Loki Music'],
                  ['DISCOVER','Découvertes'],
                  ['PLAYLISTS','Playlists'],
                  ['PARTIES','Soirées'],
                  ['PROFILE','Profil'],
                  ['NOTIFICATIONS','Notifications'],
                ] as Array<[MusicAgoraSurface,string]>).map(([surface,label]) => {
                  const selected = chatSurfaces.includes(surface);
                  return <TouchableOpacity
                    key={surface}
                    style={[styles.screenChip,selected && styles.screenChipOn]}
                    disabled={chatSaving}
                    onPress={() => toggleSurface(surface)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked:selected }}
                  >
                    <Text style={[styles.screenChipText,selected && styles.screenChipTextOn]}>{selected ? '✓ ' : ''}{label}</Text>
                  </TouchableOpacity>;
                })}
              </View>
            </View>

            <View style={styles.sideRow}>
              <TouchableOpacity style={[styles.sideChoice, side === 'left' && styles.sideChoiceOn]} onPress={() => chooseSide('left')} accessibilityLabel="Placer le Tchat à gauche">
                <Text style={[styles.sideChoiceText, side === 'left' && styles.sideChoiceTextOn]}>GAUCHE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sideChoice, side === 'right' && styles.sideChoiceOn]} onPress={() => chooseSide('right')} accessibilityLabel="Placer le Tchat à droite">
                <Text style={[styles.sideChoiceText, side === 'right' && styles.sideChoiceTextOn]}>DROITE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {chatEnabled && open ? (
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

      {!open && unreadCount > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chatNudge,
            side === 'left' ? styles.chatNudgeLeft : styles.chatNudgeRight,
            {
              bottom: Math.max(minBottom, Math.min(maxBottom, bottomOffset)) + 7,
              opacity: nudge,
              width: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 168] }),
            },
          ]}
        >
          <Text style={styles.chatNudgeText} numberOfLines={1}>
            {unreadCount} nouveau{unreadCount > 1 ? 'x' : ''} message{unreadCount > 1 ? 's' : ''}
          </Text>
        </Animated.View>
      ) : null}

      {!open ? (
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.fabWrap,
            side === 'left' ? styles.fabLeft : styles.fabRight,
            {
              bottom: Math.max(minBottom, Math.min(maxBottom, bottomOffset)),
              transform: [{ translateX: drag.x }, { translateY: drag.y }, { scale: pulse }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.fab}
            onPress={() => { void toggle(); }}
            accessibilityRole="button"
            accessibilityLabel={chatEnabled ? 'Ouvrir le Tchat' : 'Activer et ouvrir le Tchat'}
          >
            <View style={[styles.halo, !chatEnabled && styles.haloOff]} />
            <View style={styles.fabDepthBack} />
            <View style={styles.fabDepthMid} />
            <View style={styles.fabFace}>
              <View style={styles.robotHead}>
                <View style={styles.robotAntenna} />
                <View style={styles.robotEyes}><View style={styles.robotEye}/><View style={styles.robotEye}/></View>
                <View style={styles.robotMouth}/>
              </View>
              <View style={[styles.presenceDot, chatEnabled ? styles.presenceOn : styles.presenceOff]} />
              {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View> : null}
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  settingsBackdrop:{flex:1,backgroundColor:'rgba(5,4,10,.78)',alignItems:'center',justifyContent:'center',paddingHorizontal:18},
  settingsSheet:{width:'100%',maxWidth:360,borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:16,shadowColor:'#000',shadowOpacity:.42,shadowRadius:20,shadowOffset:{width:0,height:10},elevation:30},
  settingsHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10},
  settingsHeaderCopy:{flex:1,minWidth:0},
  settingsKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.2},
  settingsTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginTop:2},
  settingsClose:{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},
  settingsCloseText:{color:colors.textPrimary,fontSize:22,lineHeight:24,fontWeight:'900'},
  settingsRow:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border},
  settingsLabel:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  settingsScreens:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:10},
  settingsScreenTitle:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900',letterSpacing:.8,marginBottom:7},
  settingsScreenGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
  screenChip:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  screenChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  screenChipText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900'},
  screenChipTextOn:{color:colors.primaryLight},
  sideRow:{flexDirection:'row',gap:8,marginTop:10},
  sideChoice:{flex:1,minHeight:40,borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  sideChoiceOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.12)'},
  sideChoiceText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900',letterSpacing:.7},
  sideChoiceTextOn:{color:colors.keep},

  chatNudge:{position:'absolute',zIndex:88,height:38,borderRadius:19,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(20,14,31,.98)',justifyContent:'center',overflow:'hidden',shadowColor:'#000',shadowOpacity:.32,shadowRadius:10,shadowOffset:{width:0,height:5},elevation:16},
  chatNudgeLeft:{left:70},
  chatNudgeRight:{right:70},
  chatNudgeText:{minWidth:168,paddingHorizontal:12,color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.15},

  fabWrap:{position:'absolute',zIndex:90,elevation:30},
  fabLeft:{left:12},
  fabRight:{right:12},
  halo:{position:'absolute',left:-5,top:-5,width:64,height:64,borderRadius:32,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.05)',opacity:.72},
  haloOff:{borderColor:colors.primaryLight,backgroundColor:'rgba(124,92,252,.05)',opacity:.5},
  fab:{width:54,height:54,position:'relative'},
  fabDepthBack:{position:'absolute',left:7,top:8,width:47,height:47,borderRadius:24,backgroundColor:'rgba(90,61,196,.34)'},
  fabDepthMid:{position:'absolute',left:3,top:4,width:49,height:49,borderRadius:25,backgroundColor:'rgba(41,194,255,.28)'},
  fabFace:{width:49,height:49,borderRadius:25,alignItems:'center',justifyContent:'center',borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:'rgba(20,14,31,.98)',shadowColor:'#000',shadowOpacity:.42,shadowRadius:12,shadowOffset:{width:0,height:8},elevation:18},
  robotHead:{width:27,height:22,borderRadius:8,borderWidth:1.5,borderColor:colors.keep,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(45,225,194,.08)'},
  robotAntenna:{position:'absolute',top:-7,width:2,height:7,borderRadius:1,backgroundColor:colors.keep},
  robotEyes:{flexDirection:'row',gap:6},
  robotEye:{width:4,height:4,borderRadius:2,backgroundColor:colors.primaryLight},
  robotMouth:{width:10,height:2,borderRadius:1,backgroundColor:colors.keep,marginTop:4},
  presenceDot:{position:'absolute',left:2,bottom:2,width:9,height:9,borderRadius:5,borderWidth:2,borderColor:colors.background},
  presenceOn:{backgroundColor:colors.keep},
  presenceOff:{backgroundColor:colors.textMutedGrey},
  badge:{position:'absolute',right:-5,top:-7,minWidth:20,height:20,borderRadius:10,paddingHorizontal:4,backgroundColor:colors.danger,borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},
  badgeText:{color:'#FFF',fontSize:9,fontWeight:'900'},
});
