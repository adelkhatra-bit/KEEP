import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { KeepNotification, loadNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from '../services/notificationService';
import { loadMusicAgoraSettings, saveMusicAgoraPosition, saveMusicAgoraSettings, type MusicAgoraSurface } from '../services/musicAgoraService';
import { useGlobalChatStore, type GlobalChatTarget } from '../store/useGlobalChatStore';

type Props = {
  visible: boolean;
  profileId: string;
  onClose: () => void;
  onOpenAll: () => void;
  onOpenChat: (target?: GlobalChatTarget | null) => void;
};

const CHAT_SURFACE_OPTIONS: Array<{ key: MusicAgoraSurface; label: string }> = [
  { key: 'LISTEN', label: 'Loki Music' },
  { key: 'DISCOVER', label: 'Découvertes' },
  { key: 'PLAYLISTS', label: 'Playlists' },
  { key: 'PARTIES', label: 'Soirées' },
  { key: 'PROFILE', label: 'Profil' },
  { key: 'NOTIFICATIONS', label: 'Notifications' },
];

function timeLabel(value: string): string {
  const d = new Date(value);
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (diffMin < 1) return 'À l’instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function NotificationSidePanel({ visible, profileId, onClose, onOpenAll, onOpenChat }: Props) {
  const slide = useRef(new Animated.Value(1)).current;
  const [items, setItems] = useState<KeepNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [chatSettingsLoading, setChatSettingsLoading] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatNotifications, setChatNotifications] = useState(true);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(['PROFILE']);
  const [chatSide, setChatSide] = useState<'left' | 'right'>('right');

  const refresh = async () => {
    if (!profileId) return;
    setLoading(true);
    try { setItems(await loadNotifications(profileId)); } finally { setLoading(false); }
  };

  const loadChatSettings = async () => {
    setChatSettingsLoading(true);
    try {
      const settings = await loadMusicAgoraSettings();
      setChatEnabled(settings.homeEnabled);
      setChatNotifications(settings.notificationsEnabled);
      setChatSurfaces(settings.surfaces?.length ? settings.surfaces : ['PROFILE']);
      setChatSide(settings.side);
      useGlobalChatStore.getState().setSide(settings.side);
      useGlobalChatStore.getState().setBottomOffset(settings.bottomOffset);
    } finally {
      setChatSettingsLoading(false);
    }
  };

  const persistChat = async (
    enabled = chatEnabled,
    notificationsEnabled = chatNotifications,
    surfaces = chatSurfaces,
  ) => {
    if (chatSaving) return;
    setChatSaving(true);
    try {
      const nextSurfaces = surfaces.length ? surfaces : ['PROFILE'];
      const settings = await saveMusicAgoraSettings(enabled, notificationsEnabled, nextSurfaces);
      setChatEnabled(settings.homeEnabled);
      setChatNotifications(settings.notificationsEnabled);
      setChatSurfaces(settings.surfaces?.length ? settings.surfaces : nextSurfaces);
      setChatSide(settings.side);
      useGlobalChatStore.getState().setSide(settings.side);
      useGlobalChatStore.getState().setBottomOffset(settings.bottomOffset);
    } finally {
      setChatSaving(false);
    }
  };

  const toggleChatSurface = (surface: MusicAgoraSurface) => {
    if (chatSurfaces.includes(surface) && chatSurfaces.length === 1) return;
    const next = chatSurfaces.includes(surface)
      ? chatSurfaces.filter((value) => value !== surface)
      : [...chatSurfaces, surface];
    setChatSurfaces(next);
    void persistChat(true, chatNotifications, next);
  };

  const chooseChatSide = (side: 'left' | 'right') => {
    setChatSide(side);
    useGlobalChatStore.getState().setSide(side);
    const bottom = useGlobalChatStore.getState().bottomOffset;
    void saveMusicAgoraPosition(side, bottom).catch(() => {});
  };

  useEffect(() => {
    if (!visible) { slide.setValue(1); return undefined; }
    void refresh();
    void loadChatSettings();
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 2 }).start();
    const unsub = subscribeToNotifications(profileId, (notification) => setItems((prev) => [notification, ...prev.filter((row) => row.id !== notification.id)].slice(0, 100)));
    return () => unsub();
  }, [visible, profileId]);

  const close = () => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) onClose(); });
  };

  const markRead = async (item: KeepNotification) => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, readAt } : row));
    await markNotificationRead(profileId, item.id).catch(() => {});
  };

  const markAll = async () => {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) => ({ ...row, readAt: row.readAt || readAt })));
    await markAllNotificationsRead(profileId).catch(() => {});
  };

  const openNotification = async (item: KeepNotification) => {
    await markRead(item);
    const type = String(item.type || '').toUpperCase();
    if (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE') {
      close();
      setTimeout(() => onOpenChat(null), 200);
      return;
    }
    if (!type.startsWith('AGORA')) return;
    const data = item.data ?? {};
    const roomSlugRaw = data.roomSlug ?? data.room_slug;
    const senderIdRaw = data.senderId ?? data.sender_id ?? data.actorId ?? data.actor_id ?? data.profileId ?? data.profile_id;
    const senderUsernameRaw = data.senderUsername ?? data.sender_username ?? data.actorUsername ?? data.actor_username ?? data.username;
    const messageIdRaw = data.messageId ?? data.message_id;
    const target: GlobalChatTarget = {
      roomSlug: typeof roomSlugRaw === 'string' && roomSlugRaw.trim() ? roomSlugRaw.trim() : null,
      targetProfileId: typeof senderIdRaw === 'string' && senderIdRaw.trim() ? senderIdRaw.trim() : null,
      targetUsername: typeof senderUsernameRaw === 'string' && senderUsernameRaw.trim() ? senderUsernameRaw.trim() : null,
      messageId: typeof messageIdRaw === 'number'
        ? messageIdRaw
        : typeof messageIdRaw === 'string' && messageIdRaw.trim()
          ? Number(messageIdRaw) || null
          : null,
    };
    close();
    setTimeout(() => onOpenChat(target), 200);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Fermer les notifications" />
        <Animated.View style={[s.panel, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>LOKI MUSIC</Text>
              <Text style={s.title}>Notifications</Text>
            </View>
            <TouchableOpacity style={s.close} onPress={close} accessibilityLabel="Fermer"><Text style={s.closeText}>×</Text></TouchableOpacity>
          </View>
          <View style={s.actions}>
            <TouchableOpacity style={s.actionGhost} onPress={() => void markAll()}><Text style={s.actionGhostText}>TOUT LIRE</Text></TouchableOpacity>
            <TouchableOpacity style={[s.actionGhost, chatSettingsOpen && s.actionGhostOn]} onPress={() => setChatSettingsOpen((value) => !value)} accessibilityLabel="Réglages de la messagerie"><Text style={[s.actionGhostText, chatSettingsOpen && s.actionGhostTextOn]}>TCHAT {chatSettingsOpen ? '⌃' : '⌄'}</Text></TouchableOpacity>
            <TouchableOpacity style={s.actionPrimary} onPress={() => { close(); setTimeout(onOpenAll, 200); }}><Text style={s.actionPrimaryText}>TOUT VOIR</Text></TouchableOpacity>
          </View>

          {chatSettingsOpen ? (
            <View style={s.chatAccordion}>
              <View style={s.chatAccordionHead}>
                <View style={{flex:1,minWidth:0}}>
                  <Text style={s.chatEyebrow}>MESSAGERIE LOKI</Text>
                  <Text style={s.chatTitle}>Toujours à portée de main</Text>
                  <Text style={s.chatHint}>Active le bouton flottant, choisis les écrans où il apparaît et place-le à gauche ou à droite.</Text>
                </View>
                {chatSettingsLoading || chatSaving ? <ActivityIndicator color={colors.primaryLight} /> : null}
              </View>

              <View style={s.chatSwitchRow}>
                <Text style={s.chatSwitchLabel}>Afficher la messagerie</Text>
                <Switch
                  value={chatEnabled}
                  disabled={chatSaving}
                  onValueChange={(value) => void persistChat(value, chatNotifications, chatSurfaces)}
                  trackColor={{ false: colors.border, true: colors.keep }}
                />
              </View>
              <View style={s.chatSwitchRow}>
                <Text style={s.chatSwitchLabel}>Notifications messages</Text>
                <Switch
                  value={chatNotifications}
                  disabled={chatSaving || !chatEnabled}
                  onValueChange={(value) => void persistChat(true, value, chatSurfaces)}
                  trackColor={{ false: colors.border, true: colors.keep }}
                />
              </View>

              <Text style={s.chatSectionLabel}>OÙ L’AFFICHER</Text>
              <View style={s.chatSurfaceGrid}>
                {CHAT_SURFACE_OPTIONS.map((option) => {
                  const selected = chatSurfaces.includes(option.key);
                  return <TouchableOpacity
                    key={option.key}
                    style={[s.chatSurfaceChip, selected && s.chatSurfaceChipOn]}
                    disabled={chatSaving}
                    onPress={() => toggleChatSurface(option.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text style={[s.chatSurfaceChipText, selected && s.chatSurfaceChipTextOn]}>{selected ? '✓ ' : ''}{option.label}</Text>
                  </TouchableOpacity>;
                })}
              </View>

              <Text style={s.chatSectionLabel}>POSITION</Text>
              <View style={s.chatSideRow}>
                <TouchableOpacity style={[s.chatSideButton, chatSide === 'left' && s.chatSideButtonOn]} onPress={() => chooseChatSide('left')}><Text style={[s.chatSideText, chatSide === 'left' && s.chatSideTextOn]}>GAUCHE</Text></TouchableOpacity>
                <TouchableOpacity style={[s.chatSideButton, chatSide === 'right' && s.chatSideButtonOn]} onPress={() => chooseChatSide('right')}><Text style={[s.chatSideText, chatSide === 'right' && s.chatSideTextOn]}>DROITE</Text></TouchableOpacity>
              </View>

              <TouchableOpacity
                style={s.chatOpen}
                onPress={() => {
                  if (!chatEnabled) void persistChat(true, chatNotifications, chatSurfaces);
                  close();
                  setTimeout(() => onOpenChat(null), 200);
                }}
                accessibilityLabel="Ouvrir la messagerie Loki"
              >
                <Text style={s.chatOpenText}>OUVRIR LA MESSAGERIE</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {loading && !items.length ? <Text style={s.empty}>Chargement…</Text> : null}
            {!loading && !items.length ? <View style={s.emptyCard}><Text style={s.emptyIcon}>🔔</Text><Text style={s.emptyTitle}>Rien de nouveau</Text><Text style={s.empty}>Tes Battles, reprises, visites, événements et gains apparaîtront ici.</Text></View> : null}
            {items.map((item) => (
              <TouchableOpacity key={item.id} style={[s.card, !item.readAt && s.cardUnread]} onPress={() => void openNotification(item)} activeOpacity={0.84}>
                <View style={s.cardTop}><View style={[s.dot, item.readAt && s.dotRead]} /><Text style={s.cardTitle} numberOfLines={1}>{item.title || 'Loki Music'}</Text><Text style={s.time}>{timeLabel(item.createdAt)}</Text></View>
                <Text style={s.body} numberOfLines={3}>{item.body}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:{flex:1,flexDirection:'row',justifyContent:'flex-end'},
  backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(4,2,9,.62)'},
  panel:{width:'88%',maxWidth:390,height:'100%',backgroundColor:colors.backgroundCard,borderLeftWidth:2,borderLeftColor:colors.primary,paddingTop:52,shadowColor:colors.primaryLight,shadowOpacity:.35,shadowRadius:24,shadowOffset:{width:-8,height:0},elevation:24},
  header:{paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:2},
  close:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  closeText:{color:colors.textPrimary,fontSize:26,lineHeight:28,fontWeight:'700'},
  actions:{flexDirection:'row',gap:8,paddingHorizontal:16,paddingTop:14,paddingBottom:10},
  actionGhost:{flex:1,minHeight:40,borderRadius:13,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundElevated},
  actionGhostOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  actionGhostText:{color:colors.textPrimary,fontSize:9,fontWeight:'900'},
  actionGhostTextOn:{color:colors.primaryLight},
  actionPrimary:{flex:1,minHeight:40,borderRadius:13,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  actionPrimaryText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  chatAccordion:{marginHorizontal:16,marginBottom:10,padding:12,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},
  chatAccordionHead:{flexDirection:'row',alignItems:'flex-start',gap:8},
  chatEyebrow:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:1.1},
  chatTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:2},
  chatHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:4},
  chatSwitchRow:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border,marginTop:8},
  chatSwitchLabel:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  chatSectionLabel:{color:colors.textMutedGrey,fontSize:8,fontWeight:'900',letterSpacing:.8,marginTop:8,marginBottom:6},
  chatSurfaceGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  chatSurfaceChip:{minHeight:32,paddingHorizontal:9,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  chatSurfaceChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  chatSurfaceChipText:{color:colors.textMutedGrey,fontSize:8,fontWeight:'900'},
  chatSurfaceChipTextOn:{color:colors.primaryLight},
  chatSideRow:{flexDirection:'row',gap:7},
  chatSideButton:{flex:1,minHeight:34,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  chatSideButtonOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)'},
  chatSideText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'900'},
  chatSideTextOn:{color:colors.keep},
  chatOpen:{marginTop:10,minHeight:40,borderRadius:20,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  chatOpenText:{color:'#FFF',fontSize:10,fontWeight:'900',letterSpacing:.6},
  list:{padding:16,paddingTop:6,paddingBottom:36,gap:9},
  card:{padding:12,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated},
  cardUnread:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  cardTop:{flexDirection:'row',alignItems:'center',gap:7},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.keep},
  dotRead:{backgroundColor:colors.textMuted},
  cardTitle:{flex:1,minWidth:0,color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  time:{color:colors.textMuted,fontSize:9,fontWeight:'700'},
  body:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,marginTop:7},
  emptyCard:{padding:20,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center'},
  emptyIcon:{fontSize:28,marginBottom:8},
  emptyTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginBottom:4},
  empty:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,textAlign:'center'},
});
