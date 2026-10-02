import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import MusicAgoraPanel from './MusicAgoraPanel';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { loadMusicAgoraSettings, loadMusicAgoraShareableTracks, saveMusicAgoraPosition, saveMusicAgoraSettings, saveMusicAgoraVoiceAnnouncements, MusicAgoraSurface } from '../services/musicAgoraService';
import { KeepNotification, loadNotifications, subscribeToNotifications } from '../services/notificationService';
import { speakLokiText } from '../services/lokiSpeechService';
import { navigateToSharedProfile, navigationRef } from '../navigation/navigationRef';
import { useGlobalChatStore } from '../store/useGlobalChatStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { supabase } from '../services/supabaseClient';

function isChatNotification(item: KeepNotification): boolean {
  const type = String(item.type || '').toUpperCase();
  return type.startsWith('AGORA') || type.startsWith('CHAT');
}

function chatNotificationSender(item: KeepNotification): string {
  const data = item.data ?? {};
  const raw = data.senderUsername ?? data.sender_username ?? data.inviterUsername ?? data.inviter_username ?? data.actorUsername ?? data.actor_username ?? data.username;
  const value = typeof raw === 'string' ? raw.trim().replace(/^@/, '') : '';
  return value || 'un membre Loki';
}

function chatNotificationTarget(item: KeepNotification) {
  const data = item.data ?? {};
  const roomSlugRaw = data.roomSlug ?? data.room_slug;
  const senderIdRaw = data.senderId ?? data.sender_id ?? data.actorId ?? data.actor_id ?? data.profileId ?? data.profile_id;
  const senderUsernameRaw = data.senderUsername ?? data.sender_username ?? data.actorUsername ?? data.actor_username ?? data.username;
  const groupIdRaw = data.groupId ?? data.group_id;
  const groupNameRaw = data.groupName ?? data.group_name;
  const groupId = typeof groupIdRaw === 'string' && groupIdRaw.trim() ? groupIdRaw.trim() : null;
  const messageIdRaw = data.messageId ?? data.message_id;
  return {
    roomSlug: typeof roomSlugRaw === 'string' && roomSlugRaw.trim() ? roomSlugRaw.trim() : null,
    targetProfileId: groupId ? null : (typeof senderIdRaw === 'string' && senderIdRaw.trim() ? senderIdRaw.trim() : null),
    targetUsername: groupId ? null : (typeof senderUsernameRaw === 'string' && senderUsernameRaw.trim() ? senderUsernameRaw.trim() : null),
    groupId,
    groupName: typeof groupNameRaw === 'string' && groupNameRaw.trim() ? groupNameRaw.trim() : null,
    messageId: typeof messageIdRaw === 'number'
      ? messageIdRaw
      : typeof messageIdRaw === 'string' && messageIdRaw.trim()
        ? Number(messageIdRaw) || null
        : null,
  };
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
  const requestAccount = useAccountGateStore((state) => state.requestAccount);

  const [tracks, setTracks] = useState<any[]>([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [chatVoiceEnabled, setChatVoiceEnabled] = useState(false);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(ALL_CHAT_SURFACES);
  const [activeSurface, setActiveSurface] = useState<MusicAgoraSurface | null>('PROFILE');
  const [chatSaving, setChatSaving] = useState(false);
  const [chatSettingsReady, setChatSettingsReady] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestChatSender, setLatestChatSender] = useState('');
  const [webVisualViewport, setWebVisualViewport] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // undefined = auth Supabase pas encore lue ; null = aucune session réelle.
  // Le chat ne doit jamais se fermer entre les deux simplement parce que le
  // store UI est momentanément resté en mode invité/démo après un refresh.
  const [authenticatedProfileId, setAuthenticatedProfileId] = useState<string | null | undefined>(undefined);

  const pulse = useRef(new Animated.Value(1)).current;
  const drawerPeek = useRef(new Animated.Value(0)).current;
  const nudge = useRef(new Animated.Value(0)).current;
  const lastNudgeUnread = useRef(0);
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragStartBottom = useRef(bottomOffset);
  const safeAreaInsets = useContext(SafeAreaInsetsContext);
  const insets = safeAreaInsets ?? initialWindowMetrics?.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const { height } = useWindowDimensions();

  const storeProfileId = user && !isDemoMode && !isLocalGuest ? user.id : null;
  const authResolved = !supabase || authenticatedProfileId !== undefined;
  const effectiveProfileId = supabase
    ? (authenticatedProfileId === undefined ? storeProfileId : authenticatedProfileId)
    : storeProfileId;
  const accountReady = Boolean(effectiveProfileId);
  const previewOnly = Boolean(user && isDemoMode && process.env.EXPO_PUBLIC_KEEP_PREVIEW === '1');
  const visualTestPreview = Boolean(previewOnly && process.env.EXPO_PUBLIC_KEEP_CHAT_VISUAL_TEST === '1');
  const displayReady = accountReady || previewOnly;

  useEffect(() => {
    if (!supabase) {
      setAuthenticatedProfileId(null);
      return undefined;
    }

    let live = true;
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (live) setAuthenticatedProfileId(data.session?.user?.id ?? null);
      })
      .catch(() => {
        if (live) setAuthenticatedProfileId(null);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) setAuthenticatedProfileId(session?.user?.id ?? null);
    });

    return () => {
      live = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) {
      setWebVisualViewport(null);
      return undefined;
    }

    const win = typeof window !== 'undefined' ? window : null;
    const viewport = win?.visualViewport;
    if (!win || !viewport) {
      setWebVisualViewport(null);
      return undefined;
    }

    const syncVisualViewport = () => {
      setWebVisualViewport({
        top: Math.max(0, Math.round(viewport.offsetTop || 0)),
        left: Math.max(0, Math.round(viewport.offsetLeft || 0)),
        width: Math.max(1, Math.round(viewport.width || win.innerWidth)),
        height: Math.max(1, Math.round(viewport.height || win.innerHeight)),
      });
    };

    viewport.addEventListener('resize', syncVisualViewport);
    viewport.addEventListener('scroll', syncVisualViewport);
    win.addEventListener('resize', syncVisualViewport);
    syncVisualViewport();

    return () => {
      viewport.removeEventListener('resize', syncVisualViewport);
      viewport.removeEventListener('scroll', syncVisualViewport);
      win.removeEventListener('resize', syncVisualViewport);
    };
  }, [open]);

  useEffect(() => {
    const syncRoute = () => {
      const current = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : null;
      const nextSurface = chatSurfaceForRoute(current);
      // Une transition React Navigation peut brièvement renvoyer une route
      // intermédiaire inconnue. Ne jamais faire disparaître la languette pour
      // cette seule frame : on conserve la dernière surface valide.
      if (nextSurface) setActiveSurface(nextSurface);
    };
    syncRoute();
    const timer = setInterval(syncRoute, 750);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Ne ferme pas le chat pendant l'hydratation de la vraie session Supabase.
    // C'était le cas exact où le profil ouvrait correctement le chat, puis le
    // dock le refermait immédiatement car Zustand disait encore "invité".
    if (!authResolved && !previewOnly) return;
    if (!accountReady || !effectiveProfileId) {
      closeChat();
      setTracks([]);
      setChatEnabled(false);
      setUnreadCount(0);
      setChatSettingsReady(false);
      return;
    }

    let live = true;
    setChatSettingsReady(false);
    Promise.all([
      loadMusicAgoraSettings().catch(() => ({
        homeEnabled: false,
        notificationsEnabled: true,
        voiceAnnouncementsEnabled: false,
        surfaces: ALL_CHAT_SURFACES,
        side: 'right' as const,
        bottomOffset: 88,
      })),
      loadNotifications(effectiveProfileId).catch(() => []),
    ]).then(([settings, notifications]) => {
      if (!live) return;
      setChatEnabled(Boolean(settings.homeEnabled));
      setChatNotificationsEnabled(Boolean(settings.notificationsEnabled));
      setChatVoiceEnabled(Boolean(settings.voiceAnnouncementsEnabled));
      setChatSurfaces(settings.surfaces?.length ? settings.surfaces : ALL_CHAT_SURFACES);
      setSide(settings.side);
      const legacyBottom = settings.bottomOffset <= 120;
      const migratedBottom = legacyBottom
        ? Math.max(82 + insets.bottom, Math.round(height * 0.58))
        : settings.bottomOffset;
      setBottomOffset(migratedBottom);
      if (legacyBottom) {
        void saveMusicAgoraPosition(settings.side, migratedBottom).catch(() => {});
      }
      const unreadChat = notifications.filter((item) => !item.readAt && isChatNotification(item));
      setUnreadCount(unreadChat.length);
      const latest = unreadChat[0];
      setLatestChatSender(latest ? chatNotificationSender(latest) : '');
      if (latest) useGlobalChatStore.getState().prime(chatNotificationTarget(latest));
      setChatSettingsReady(true);
    });

    return () => { live = false; };
  }, [accountReady, authResolved, effectiveProfileId, previewOnly, closeChat, setBottomOffset, setSide]);

  useEffect(() => {
    if (!accountReady || !effectiveProfileId) return;
    return subscribeToNotifications(effectiveProfileId, (item) => {
      if (!isChatNotification(item)) return;
      const sender = chatNotificationSender(item);
      setUnreadCount((value) => value + 1);
      setLatestChatSender(sender);
      const chatState = useGlobalChatStore.getState();
      if (!chatState.isOpen) chatState.prime(chatNotificationTarget(item));
      if (chatEnabled && chatNotificationsEnabled && chatVoiceEnabled && !chatState.isOpen) {
        void speakLokiText(`Message de ${sender}`, {
          language: 'fr-FR',
          rate: 0.95,
          pitch: 1,
        }).catch(() => {
          // Optional voice capability: never block the messenger or an OTA.
        });
      }
    });
  }, [accountReady, effectiveProfileId, chatEnabled, chatNotificationsEnabled, chatVoiceEnabled]);

  useEffect(() => {
    if (!accountReady) {
      setTracks([]);
      return;
    }
    // Scale guard: do not fetch up to 160 shareable tracks for every connected
    // user merely because the global chat button is enabled. Load them only
    // while the messenger is actually open.
    if (!open) return;
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
  }, [accountReady, open, effectiveProfileId]);

  useEffect(() => {
    if (!accountReady || !open || chatEnabled || chatSaving) return;
    let live = true;
    setChatSaving(true);
    saveMusicAgoraSettings(true, chatNotificationsEnabled, chatSurfaces.length ? chatSurfaces : ['PROFILE'])
      .then((settings) => {
        if (!live) return;
        setChatEnabled(true);
        setChatNotificationsEnabled(settings.notificationsEnabled);
        setChatVoiceEnabled(settings.voiceAnnouncementsEnabled);
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
      drawerPeek.stopAnimation();
      drawerPeek.setValue(0);
      return;
    }
    if (unreadCount <= lastNudgeUnread.current) return;
    lastNudgeUnread.current = unreadCount;
    nudge.stopAnimation();
    drawerPeek.stopAnimation();
    nudge.setValue(0);
    drawerPeek.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(nudge, { toValue: 1, duration: 260, useNativeDriver: false }),
        Animated.delay(2900),
        Animated.timing(nudge, { toValue: 0, duration: 320, useNativeDriver: false }),
      ]),
      Animated.sequence([
        Animated.spring(drawerPeek, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }),
        Animated.delay(2900),
        Animated.spring(drawerPeek, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }),
      ]),
    ]).start();
  }, [accountReady, open, unreadCount, nudge, drawerPeek]);

  const minBottom = Math.max(82 + insets.bottom, Math.round(height * 0.44));
  const maxBottom = Math.max(minBottom, height - Math.max(118, insets.top + 72));
  const middleBottom = Math.max(minBottom, Math.min(maxBottom, Math.round(height * 0.58)));
  const verticalPreset = Math.abs(bottomOffset - maxBottom) <= Math.abs(bottomOffset - middleBottom) && Math.abs(bottomOffset - maxBottom) <= Math.abs(bottomOffset - minBottom)
    ? 'HIGH'
    : Math.abs(bottomOffset - middleBottom) <= Math.abs(bottomOffset - minBottom)
      ? 'MIDDLE'
      : 'LOW';

  useEffect(() => {
    if (!accountReady) return;
    const clamped = Math.max(minBottom, Math.min(maxBottom, bottomOffset));
    if (clamped === bottomOffset) return;
    setBottomOffset(clamped);
    void saveMusicAgoraPosition(side, clamped).catch(() => {});
  }, [accountReady, bottomOffset, minBottom, maxBottom, setBottomOffset, side]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 24 || Math.abs(gesture.dy) > 24,
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
      void saveMusicAgoraPosition(nextSide, nextBottom)
        .then((saved) => { setSide(saved.side); setBottomOffset(saved.bottomOffset); })
        .catch(() => {});
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
    if (visualTestPreview) {
      openChat(target);
      return;
    }
    if (previewOnly) {
      requestAccount('login');
      return;
    }
    if (!accountReady) return;
    if (open) {
      closeChat();
      return;
    }

    const nextTarget = unreadCount > 0 ? target : null;
    setUnreadCount(0);
    // Un tap sur la languette globale ne doit jamais rouvrir une ancienne
    // conversation mémorisée. S'il y a un vrai message non lu, on ouvre ce
    // fil précis ; sinon on revient à la liste des conversations récentes.
    openChat(nextTarget);

    if (!chatEnabled && !chatSaving) {
      setChatEnabled(true);
      try {
        await saveProfileSettings(true);
      } catch {
        setChatEnabled(false);
        closeChat();
      }
    }
  };

  const chooseSide = (nextSide: 'left' | 'right') => {
    setSide(nextSide);
    void saveMusicAgoraPosition(nextSide, bottomOffset).then((saved) => { setSide(saved.side); setBottomOffset(saved.bottomOffset); }).catch(() => {});
  };

  const chooseVerticalPreset = (preset: 'HIGH' | 'MIDDLE' | 'LOW') => {
    const nextBottom = preset === 'HIGH' ? maxBottom : preset === 'MIDDLE' ? middleBottom : minBottom;
    setBottomOffset(nextBottom);
    void saveMusicAgoraPosition(side, nextBottom).then((saved) => { setSide(saved.side); setBottomOffset(saved.bottomOffset); }).catch(() => {});
  };

  const chooseTopAnchor = (anchor: 'MENU' | 'BELL') => {
    const nextSide: 'left' | 'right' = anchor === 'MENU' ? 'left' : 'right';
    setSide(nextSide);
    setBottomOffset(maxBottom);
    void saveMusicAgoraPosition(nextSide, maxBottom).then((saved) => { setSide(saved.side); setBottomOffset(saved.bottomOffset); }).catch(() => {});
  };

  const surfaceVisible = previewOnly ? true : Boolean(activeSurface && chatSurfaces.includes(activeSurface));

  if (!user) return null;
  if (!previewOnly && !settingsOpen && !accountReady) return null;
  if (!previewOnly && accountReady && !chatSettingsReady && !open && !settingsOpen) return null;
  if (!open && !settingsOpen && !surfaceVisible) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.globalOverlay]}>
      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={closeSettings}>
        <View style={styles.settingsBackdrop}>
          <View style={styles.settingsSheet}>
            <View style={styles.settingsHeader}>
              <View style={styles.settingsHeaderCopy}>
                <Text style={styles.settingsKicker}>TCHAT</Text>
                <Text style={styles.settingsTitle}>Tchat flottant</Text>
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

            <View style={styles.settingsRow}>
              <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                <Text style={styles.settingsLabel}>Annonce vocale</Text>
                <Text style={styles.settingsHelp}>Dit seulement « Message de @pseudo », jamais le contenu du message.</Text>
              </View>
              <Switch
                value={chatVoiceEnabled}
                disabled={chatSaving || !chatEnabled || !chatNotificationsEnabled}
                onValueChange={(value) => {
                  setChatVoiceEnabled(value);
                  void saveMusicAgoraVoiceAnnouncements(value).then(setChatVoiceEnabled).catch(() => setChatVoiceEnabled(!value));
                }}
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

            <Text style={styles.settingsScreenTitle}>ANCRAGE RAPIDE EN HAUT</Text>
            <View style={styles.anchorRow}>
              <TouchableOpacity style={styles.anchorChoice} onPress={() => chooseTopAnchor('MENU')} accessibilityLabel="Placer le Tchat en haut à gauche près du menu">
                <Text style={styles.anchorIcon}>☰</Text>
                <View style={{flex:1,minWidth:0}}>
                  <Text style={styles.anchorTitle}>MENU · HAUT GAUCHE</Text>
                  <Text style={styles.anchorHint}>près du hamburger</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.anchorChoice} onPress={() => chooseTopAnchor('BELL')} accessibilityLabel="Placer le Tchat en haut à droite près de la cloche">
                <Text style={styles.anchorIcon}>🔔</Text>
                <View style={{flex:1,minWidth:0}}>
                  <Text style={styles.anchorTitle}>CLOCHE · HAUT DROITE</Text>
                  <Text style={styles.anchorHint}>près des notifications</Text>
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.settingsScreenTitle}>POSITION DU BOUTON</Text>
            <View style={styles.positionRow}>
              <TouchableOpacity style={[styles.positionChoice, verticalPreset === 'HIGH' && styles.positionChoiceOn]} onPress={() => chooseVerticalPreset('HIGH')} accessibilityLabel="Placer le Tchat en haut">
                <Text style={[styles.positionChoiceText, verticalPreset === 'HIGH' && styles.positionChoiceTextOn]}>HAUT</Text>
                <Text style={styles.positionChoiceHint}>près des commandes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.positionChoice, verticalPreset === 'MIDDLE' && styles.positionChoiceOn]} onPress={() => chooseVerticalPreset('MIDDLE')} accessibilityLabel="Placer le Tchat au milieu">
                <Text style={[styles.positionChoiceText, verticalPreset === 'MIDDLE' && styles.positionChoiceTextOn]}>MILIEU</Text>
                <Text style={styles.positionChoiceHint}>recommandé</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.positionChoice, verticalPreset === 'LOW' && styles.positionChoiceOn]} onPress={() => chooseVerticalPreset('LOW')} accessibilityLabel="Placer le Tchat plus bas">
                <Text style={[styles.positionChoiceText, verticalPreset === 'LOW' && styles.positionChoiceTextOn]}>BAS</Text>
                <Text style={styles.positionChoiceHint}>au-dessus des onglets</Text>
              </TouchableOpacity>
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

      {open ? (
        <Modal
          visible
          transparent={false}
          animationType={Platform.OS === 'web' ? 'none' : 'slide'}
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={closeChat}
        >
          <View
            testID="loki-chat-fullscreen-modal"
            style={[
              styles.chatFullscreen,
              Platform.OS === 'web' && ({
                position: 'fixed',
                top: webVisualViewport ? String(webVisualViewport.top) + 'px' : 0,
                left: webVisualViewport ? String(webVisualViewport.left) + 'px' : 0,
                right: 'auto',
                bottom: 'auto',
                width: webVisualViewport ? String(webVisualViewport.width) + 'px' : '100vw',
                height: webVisualViewport ? String(webVisualViewport.height) + 'px' : '100dvh',
                minHeight: 0,
                zIndex: 2147483647,
                overflow: 'hidden',
              } as any),
            ]}
            accessibilityLabel="Messagerie Loki plein écran"
          >
            <MusicAgoraPanel
              compact
              compactSide={side}
              currentProfileId={effectiveProfileId || user?.id || ''}
              enabled={accountReady || visualTestPreview}
              shareableTracks={tracks}
              initialRoomSlug={target?.roomSlug ?? undefined}
              initialReplyTarget={target?.targetProfileId ? { profileId: target.targetProfileId, username: target.targetUsername || 'utilisateur' } : undefined}
              initialGroupId={target?.groupId ?? undefined}
              onOpenProfile={(username) => { closeChat(); setTimeout(() => navigateToSharedProfile(username), 80); }}
              onCompactClose={closeChat}
            />
          </View>
        </Modal>
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
            {latestChatSender ? `Message de @${latestChatSender}` : `${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''} message${unreadCount > 1 ? 's' : ''}`}
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
              transform: [
                { translateX: side === 'left'
                  ? drawerPeek.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] })
                  : drawerPeek.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) },
                { translateX: drag.x },
                { translateY: drag.y },
                { scale: pulse },
              ],
            },
          ]}
        >
          <TouchableOpacity
            testID="loki-global-chat-drawer"
            style={styles.fab}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            onPress={() => { void toggle(); }}
            accessibilityRole="button"
            accessibilityLabel={previewOnly && !visualTestPreview ? 'Se connecter pour ouvrir le Tchat' : chatEnabled ? 'Ouvrir le Tchat' : 'Activer et ouvrir le Tchat'}
          >
            <View style={[styles.halo, !chatEnabled && styles.haloOff]} />
            <View style={styles.fabDepthBack} />
            <View style={styles.fabDepthMid} />
            <View style={[styles.fabFace, side === 'left' ? styles.fabFaceLeft : styles.fabFaceRight]}>
              <View style={styles.drawerGrip}><View style={styles.drawerGripLine}/><View style={styles.drawerGripLine}/><View style={styles.drawerGripLine}/></View>
              <View style={styles.robotHead}>
                <View style={styles.robotAntenna} />
                <View style={styles.robotEyes}><View style={styles.robotEye}/><View style={styles.robotEye}/></View>
                <View style={styles.robotMouth}/>
              </View>
              <View style={styles.drawerCopy}>
                <Text style={styles.drawerLabel}>TCHAT</Text>
                <Text style={styles.drawerSub} numberOfLines={1}>{previewOnly ? 'CONNEXION' : unreadCount > 0 && latestChatSender ? `@${latestChatSender}` : 'LOKI'}</Text>
              </View>
              <Text style={styles.drawerChevron}>{side === 'left' ? '›' : '‹'}</Text>
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
  globalOverlay:{zIndex:1000,elevation:100},
  chatFullscreen:{flex:1,backgroundColor:'#0B0712'},
  settingsBackdrop:{flex:1,backgroundColor:'rgba(5,4,10,.78)',alignItems:'center',justifyContent:'center',paddingHorizontal:18},
  settingsSheet:{width:'100%',maxWidth:360,borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:16,shadowColor:'#000',shadowOpacity:.42,shadowRadius:20,shadowOffset:{width:0,height:10},elevation:30},
  settingsHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10},
  settingsHeaderCopy:{flex:1,minWidth:0},
  settingsKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.2},
  settingsTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginTop:2},
  settingsClose:{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},
  settingsCloseText:{color:colors.textPrimary,fontSize:22,lineHeight:24,fontWeight:'900'},
  settingsRow:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border},
  settingsHelp:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:3},settingsLabel:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  settingsScreens:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:10},
  settingsScreenTitle:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900',letterSpacing:.8,marginBottom:7},
  settingsScreenGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
  screenChip:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  screenChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  screenChipText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900'},
  screenChipTextOn:{color:colors.primaryLight},
  anchorRow:{gap:7,marginTop:2,marginBottom:10},
  anchorChoice:{minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:9},
  anchorIcon:{fontSize:18},
  anchorTitle:{color:colors.textPrimary,fontSize:10.5,fontWeight:'900'},
  anchorHint:{color:colors.textMutedGrey,fontSize:8.5,fontWeight:'700',marginTop:2},
  positionRow:{flexDirection:'row',gap:7,marginTop:4,marginBottom:2},
  positionChoice:{flex:1,minHeight:54,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center',paddingHorizontal:5},
  positionChoiceOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  positionChoiceText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900',letterSpacing:.6},
  positionChoiceTextOn:{color:colors.primaryLight},
  positionChoiceHint:{color:colors.textMutedGrey,fontSize:7.5,fontWeight:'700',marginTop:2,textAlign:'center'},
  sideRow:{flexDirection:'row',gap:8,marginTop:10},
  sideChoice:{flex:1,minHeight:40,borderRadius:20,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  sideChoiceOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.12)'},
  sideChoiceText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900',letterSpacing:.7},
  sideChoiceTextOn:{color:colors.keep},

  chatNudge:{position:'absolute',zIndex:88,height:40,borderRadius:20,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(20,14,31,.98)',justifyContent:'center',overflow:'hidden',shadowColor:'#000',shadowOpacity:.32,shadowRadius:10,shadowOffset:{width:0,height:5},elevation:16},
  chatNudgeLeft:{left:70},
  chatNudgeRight:{right:70},
  chatNudgeText:{minWidth:168,paddingHorizontal:12,color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.15},

  fabWrap:{position:'absolute',zIndex:90,elevation:30},
  fabLeft:{left:0},
  fabRight:{right:0},
  halo:{position:'absolute',left:-4,top:-4,width:80,height:66,borderRadius:20,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.04)',opacity:.62},
  haloOff:{borderColor:colors.primaryLight,backgroundColor:'rgba(124,92,252,.05)',opacity:.5},
  fab:{width:76,height:58,position:'relative'},
  fabDepthBack:{position:'absolute',left:6,top:7,width:70,height:52,borderRadius:17,backgroundColor:'rgba(90,61,196,.30)'},
  fabDepthMid:{position:'absolute',left:3,top:3,width:70,height:52,borderRadius:17,backgroundColor:'rgba(41,194,255,.20)'},
  fabFace:{width:70,height:52,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:8,borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:'rgba(20,14,31,.98)',shadowColor:'#000',shadowOpacity:.42,shadowRadius:12,shadowOffset:{width:0,height:8},elevation:18},
  fabFaceLeft:{borderTopRightRadius:18,borderBottomRightRadius:18},
  fabFaceRight:{borderTopLeftRadius:18,borderBottomLeftRadius:18},
  drawerGrip:{width:4,gap:2,alignItems:'center'},
  drawerGripLine:{width:3,height:8,borderRadius:2,backgroundColor:'rgba(167,139,250,.52)'},
  robotHead:{width:24,height:20,borderRadius:7,borderWidth:1.5,borderColor:colors.keep,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(45,225,194,.08)'},
  robotAntenna:{position:'absolute',top:-7,width:2,height:7,borderRadius:1,backgroundColor:colors.keep},
  robotEyes:{flexDirection:'row',gap:6},
  robotEye:{width:4,height:4,borderRadius:2,backgroundColor:colors.primaryLight},
  robotMouth:{width:9,height:2,borderRadius:1,backgroundColor:colors.keep,marginTop:3},
  drawerCopy:{minWidth:29,maxWidth:34},
  drawerLabel:{color:colors.textPrimary,fontSize:8,fontWeight:'900',letterSpacing:.7},
  drawerSub:{color:colors.primaryLight,fontSize:6.5,fontWeight:'900',letterSpacing:.5,marginTop:1},
  drawerChevron:{color:colors.primaryLight,fontSize:17,fontWeight:'900',marginLeft:'auto'},
  presenceDot:{position:'absolute',left:5,bottom:4,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:colors.background},
  presenceOn:{backgroundColor:colors.keep},
  presenceOff:{backgroundColor:colors.textMutedGrey},
  badge:{position:'absolute',right:-5,top:-7,minWidth:20,height:20,borderRadius:10,paddingHorizontal:4,backgroundColor:colors.danger,borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},
  badgeText:{color:'#FFF',fontSize:9,fontWeight:'900'},
});
