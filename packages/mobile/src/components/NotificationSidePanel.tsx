import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { KeepNotification, NotificationPreferences, loadNotificationPreferences, loadNotifications, markAllNotificationsRead, markNotificationRead, saveNotificationPreferences, subscribeToNotifications } from '../services/notificationService';
import { loadMusicAgoraSettings, saveMusicAgoraPosition, saveMusicAgoraSettings, saveMusicAgoraVoiceAnnouncements, type MusicAgoraSurface } from '../services/musicAgoraService';
import { useGlobalChatStore, type GlobalChatTarget } from '../store/useGlobalChatStore';
import { loadCurrentPlanCode } from '../services/planService';
import {
  isNotificationAccessLocked,
  loadNotificationAccessRules,
  notificationAccessRequiredPlan,
  notificationPlanLabel,
  type NotificationAccessRule,
} from '../services/notificationAccessService';

type Props = {
  visible: boolean;
  profileId: string;
  onClose: () => void;
  onOpenAll: () => void;
};

const CHAT_SURFACE_OPTIONS: Array<{ key: MusicAgoraSurface; label: string }> = [
  { key: 'LISTEN', label: 'Loki Music' },
  { key: 'DISCOVER', label: 'Découvertes' },
  { key: 'PLAYLISTS', label: 'Playlists' },
  { key: 'PARTIES', label: 'Soirées' },
  { key: 'PROFILE', label: 'Profil' },
  { key: 'NOTIFICATIONS', label: 'Notifications' },
];

function isChatNotificationType(type: string): boolean {
  const value = String(type || '').toUpperCase();
  return value.startsWith('AGORA') || value.startsWith('CHAT');
}

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

function chatTarget(item: KeepNotification): GlobalChatTarget {
  const data = item.data ?? {};
  const roomSlugRaw = data.roomSlug ?? data.room_slug;
  const senderIdRaw = data.senderId ?? data.sender_id ?? data.actorId ?? data.actor_id ?? data.profileId ?? data.profile_id;
  const senderUsernameRaw = data.senderUsername ?? data.sender_username ?? data.actorUsername ?? data.actor_username ?? data.username;
  const messageIdRaw = data.messageId ?? data.message_id;
  return {
    roomSlug: typeof roomSlugRaw === 'string' && roomSlugRaw.trim() ? roomSlugRaw.trim() : null,
    targetProfileId: typeof senderIdRaw === 'string' && senderIdRaw.trim() ? senderIdRaw.trim() : null,
    targetUsername: typeof senderUsernameRaw === 'string' && senderUsernameRaw.trim() ? senderUsernameRaw.trim() : null,
    messageId: typeof messageIdRaw === 'number'
      ? messageIdRaw
      : typeof messageIdRaw === 'string' && messageIdRaw.trim()
        ? Number(messageIdRaw) || null
        : null,
  };
}

export default function NotificationSidePanel({ visible, profileId, onClose }: Props) {
  const slide = useRef(new Animated.Value(1)).current;
  const [items, setItems] = useState<KeepNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'MESSAGES' | 'ACTIVITY' | 'SETTINGS'>('ACTIVITY');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preparedChatId, setPreparedChatId] = useState<string | null>(null);
  const [lockedPopup, setLockedPopup] = useState<{ title: string; plan: string } | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [notificationPrefsSaving, setNotificationPrefsSaving] = useState(false);
  const [accessRules, setAccessRules] = useState<NotificationAccessRule[]>([]);
  const [currentPlan, setCurrentPlan] = useState('FREE');
  const [chatSettingsLoading, setChatSettingsLoading] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatNotifications, setChatNotifications] = useState(true);
  const [chatVoiceAnnouncements, setChatVoiceAnnouncements] = useState(false);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(['PROFILE']);
  const [chatSide, setChatSide] = useState<'left' | 'right'>('right');

  const refresh = async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const [notifications, rules, plan, prefs] = await Promise.all([
        loadNotifications(profileId),
        loadNotificationAccessRules().catch(() => []),
        loadCurrentPlanCode(profileId).catch(() => 'FREE'),
        loadNotificationPreferences(profileId).catch(() => null),
      ]);
      setItems(notifications);
      setAccessRules(rules);
      setCurrentPlan(plan || 'FREE');
      setNotificationPrefs(prefs);
    } finally {
      setLoading(false);
    }
  };

  const loadChatSettings = async () => {
    setChatSettingsLoading(true);
    try {
      const settings = await loadMusicAgoraSettings();
      setChatEnabled(settings.homeEnabled);
      setChatNotifications(settings.notificationsEnabled);
      setChatVoiceAnnouncements(Boolean(settings.voiceAnnouncementsEnabled));
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
    surfaces: MusicAgoraSurface[] = chatSurfaces,
  ) => {
    if (chatSaving) return;
    setChatSaving(true);
    try {
      const nextSurfaces: MusicAgoraSurface[] = surfaces.length ? surfaces : ['PROFILE'];
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

  const persistChatVoiceAnnouncements = async (enabled: boolean) => {
    if (chatSaving) return;
    setChatSaving(true);
    try {
      const saved = await saveMusicAgoraVoiceAnnouncements(enabled);
      setChatVoiceAnnouncements(saved);
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
    if (!visible) {
      slide.setValue(1);
      setExpandedId(null);
      return undefined;
    }
    void refresh();
    void loadChatSettings();
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 2 }).start();
    const unsub = subscribeToNotifications(profileId, (notification) => {
      setItems((prev) => [notification, ...prev.filter((row) => row.id !== notification.id)].slice(0, 100));
    });
    return () => unsub();
  }, [visible, profileId]);

  const close = () => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
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

  const toggleSystemNotifications = async (enabled: boolean) => {
    if (!notificationPrefs || notificationPrefsSaving) return;
    const previous = notificationPrefs;
    const next = { ...previous, systemEnabled: enabled };
    setNotificationPrefs(next);
    setNotificationPrefsSaving(true);
    try {
      await saveNotificationPreferences(profileId, next);
    } catch {
      setNotificationPrefs(previous);
    } finally {
      setNotificationPrefsSaving(false);
    }
  };

  const prepareChatNotification = async (item: KeepNotification) => {
    await markRead(item);
    const type = String(item.type || '').toUpperCase();
    const target = type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE' ? null : chatTarget(item);
    useGlobalChatStore.getState().prime(target);
    setPreparedChatId(item.id);
  };

  const toggleNotification = async (item: KeepNotification) => {
    await markRead(item);
    if (isNotificationAccessLocked(item.type, currentPlan, accessRules)) {
      const requiredPlan = notificationAccessRequiredPlan(item.type, accessRules);
      setLockedPopup({
        title: item.title || 'Notification Loki',
        plan: notificationPlanLabel(requiredPlan),
      });
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((current) => current === item.id ? null : item.id);
  };

  const messageItems = items.filter((item) => isChatNotificationType(item.type));
  const activityItems = items.filter((item) => !isChatNotificationType(item.type));
  const visibleItems = activeTab === 'MESSAGES' ? messageItems : activityItems;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Fermer les notifications" />
        <Animated.View style={[s.panel, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>LOKI MUSIC</Text>
              <Text style={s.title}>Cloche</Text>
              <Text style={s.headerHint}>Tout reste ici, sans changer d’écran.</Text>
            </View>
            <TouchableOpacity style={s.close} onPress={close} accessibilityLabel="Fermer"><Text style={s.closeText}>×</Text></TouchableOpacity>
          </View>

          <View style={s.tabs}>
            <TouchableOpacity style={[s.tab, activeTab === 'MESSAGES' && s.tabOn]} onPress={() => setActiveTab('MESSAGES')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'MESSAGES' }}>
              <Text style={[s.tabText, activeTab === 'MESSAGES' && s.tabTextOn]}>MESSAGES</Text>
              <Text style={s.tabHint}>{messageItems.filter((item) => !item.readAt).length} non lu{messageItems.filter((item) => !item.readAt).length > 1 ? 's' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, activeTab === 'ACTIVITY' && s.tabOn]} onPress={() => setActiveTab('ACTIVITY')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'ACTIVITY' }}>
              <Text style={[s.tabText, activeTab === 'ACTIVITY' && s.tabTextOn]}>ACTIVITÉ</Text>
              <Text style={s.tabHint}>{activityItems.filter((item) => !item.readAt).length} non lue{activityItems.filter((item) => !item.readAt).length > 1 ? 's' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, activeTab === 'SETTINGS' && s.tabOn]} onPress={() => setActiveTab('SETTINGS')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'SETTINGS' }}>
              <Text style={[s.tabText, activeTab === 'SETTINGS' && s.tabTextOn]}>RÉGLAGES</Text>
              <Text style={s.tabHint}>activer / couper</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'SETTINGS' ? (
            <ScrollView contentContainerStyle={s.settingsList} showsVerticalScrollIndicator={false}>
              <View style={s.notificationMaster}>
                <View style={s.notificationMasterCopy}>
                  <Text style={s.chatEyebrow}>NOTIFICATIONS LOKI</Text>
                  <Text style={s.chatTitle}>Alertes dans l’application</Text>
                  <Text style={s.chatHint}>Active ou coupe les alertes sans quitter cette cloche.</Text>
                </View>
                <Switch value={notificationPrefs?.systemEnabled ?? true} disabled={!notificationPrefs || notificationPrefsSaving} onValueChange={(value) => void toggleSystemNotifications(value)} trackColor={{ false: colors.border, true: colors.keep }} />
              </View>

              <View style={s.chatAccordion}>
                <View style={s.chatAccordionHead}>
                  <View style={{flex:1,minWidth:0}}>
                    <Text style={s.chatEyebrow}>MESSAGERIE LOKI</Text>
                    <Text style={s.chatTitle}>Tiroir latéral</Text>
                    <Text style={s.chatHint}>Il se range sur le bord choisi. Un nouveau message le fait ressortir avec son badge.</Text>
                  </View>
                  {chatSettingsLoading || chatSaving ? <ActivityIndicator color={colors.primaryLight} /> : null}
                </View>
                <View style={s.chatSwitchRow}>
                  <Text style={s.chatSwitchLabel}>Afficher la messagerie</Text>
                  <Switch value={chatEnabled} disabled={chatSaving} onValueChange={(value) => void persistChat(value, chatNotifications, chatSurfaces)} trackColor={{ false: colors.border, true: colors.keep }} />
                </View>
                <View style={s.chatSwitchRow}>
                  <Text style={s.chatSwitchLabel}>Alertes nouveaux messages</Text>
                  <Switch value={chatNotifications} disabled={chatSaving || !chatEnabled} onValueChange={(value) => void persistChat(true, value, chatSurfaces)} trackColor={{ false: colors.border, true: colors.keep }} />
                </View>
                <View style={s.chatSwitchRow}>
                  <View style={s.chatSwitchCopy}>
                    <Text style={s.chatSwitchLabel}>Annonce vocale</Text>
                    <Text style={s.chatSwitchHint}>Dit seulement « Message de @pseudo ». Le contenu du message n’est jamais lu.</Text>
                  </View>
                  <Switch value={chatVoiceAnnouncements} disabled={chatSaving || !chatEnabled || !chatNotifications} onValueChange={(value) => void persistChatVoiceAnnouncements(value)} trackColor={{ false: colors.border, true: colors.keep }} />
                </View>
                <Text style={s.chatSectionLabel}>OÙ L’AFFICHER</Text>
                <View style={s.chatSurfaceGrid}>
                  {CHAT_SURFACE_OPTIONS.map((option) => {
                    const selected = chatSurfaces.includes(option.key);
                    return <TouchableOpacity key={option.key} style={[s.chatSurfaceChip, selected && s.chatSurfaceChipOn]} disabled={chatSaving} onPress={() => toggleChatSurface(option.key)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
                      <Text style={[s.chatSurfaceChipText, selected && s.chatSurfaceChipTextOn]}>{selected ? '✓ ' : ''}{option.label}</Text>
                    </TouchableOpacity>;
                  })}
                </View>
                <Text style={s.chatSectionLabel}>CÔTÉ DU TIROIR</Text>
                <View style={s.chatSideRow}>
                  <TouchableOpacity style={[s.chatSideButton, chatSide === 'left' && s.chatSideButtonOn]} onPress={() => chooseChatSide('left')}><Text style={[s.chatSideText, chatSide === 'left' && s.chatSideTextOn]}>GAUCHE</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.chatSideButton, chatSide === 'right' && s.chatSideButtonOn]} onPress={() => chooseChatSide('right')}><Text style={[s.chatSideText, chatSide === 'right' && s.chatSideTextOn]}>DROITE</Text></TouchableOpacity>
                </View>
                <Text style={s.drawerHint}>Fermer le Tchat le remet automatiquement dans son tiroir sur le bord.</Text>
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              <View style={s.inboxActions}>
                <Text style={s.inboxHint}>Appuie sur une notification : elle se déplie ici.</Text>
                <TouchableOpacity style={s.markAllButton} onPress={() => void markAll()}><Text style={s.markAllText}>TOUT LIRE</Text></TouchableOpacity>
              </View>
              {loading && !items.length ? <Text style={s.empty}>Chargement…</Text> : null}
              {!loading && !visibleItems.length ? <View style={s.emptyCard}><Text style={s.emptyIcon}>{activeTab === 'MESSAGES' ? '💬' : '🔔'}</Text><Text style={s.emptyTitle}>{activeTab === 'MESSAGES' ? 'Aucun message' : 'Rien de nouveau'}</Text><Text style={s.empty}>{activeTab === 'MESSAGES' ? 'Tes nouveaux messages apparaîtront ici, séparés des autres notifications.' : 'Tes Battles, reprises, visites, événements et gains apparaîtront ici.'}</Text></View> : null}
              {visibleItems.map((item) => {
                const locked = isNotificationAccessLocked(item.type, currentPlan, accessRules);
                const expanded = expandedId === item.id;
                const type = String(item.type || '').toUpperCase();
                const chatAction = type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE' || type.startsWith('AGORA');
                return (
                  <View key={item.id} style={[s.card, !item.readAt && s.cardUnread, locked && s.cardLocked]}>
                    <TouchableOpacity onPress={() => void toggleNotification(item)} activeOpacity={0.84} accessibilityRole="button" accessibilityState={{ expanded }}>
                      <View style={s.cardTop}>
                        <View style={[s.dot, item.readAt && s.dotRead, locked && s.dotLocked]} />
                        <Text style={s.cardTitle} numberOfLines={1}>{locked ? '🔒 Notification réservée' : (item.title || 'Loki Music')}</Text>
                        <Text style={s.time}>{timeLabel(item.createdAt)}</Text>
                        <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
                      </View>
                      {expanded ? (
                        <View style={s.details}>
                          {locked ? null : (
                            <>
                              <Text style={s.body}>{item.body}</Text>
                              <Text style={s.typeLabel}>{String(item.type || '').replace(/_/g, ' ')}</Text>
                              {chatAction ? (
                                <TouchableOpacity style={[s.notificationAction, preparedChatId === item.id && s.notificationActionReady]} onPress={() => void prepareChatNotification(item)}>
                                  <Text style={s.notificationActionText}>{preparedChatId === item.id ? 'TCHAT PRÊT SUR LE CÔTÉ' : 'PRÉPARER LA CONVERSATION'}</Text>
                                </TouchableOpacity>
                              ) : null}
                            </>
                          )}
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {lockedPopup ? (
            <View style={s.lockedOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setLockedPopup(null)} accessibilityLabel="Fermer l’explication" />
              <View style={s.lockedPopupCard}>
                <View style={s.lockedPopupIcon}><Text style={s.lockedPopupIconText}>🔒</Text></View>
                <Text style={s.lockedPopupKicker}>ACCÈS LOKI</Text>
                <Text style={s.lockedPopupTitle}>Pourquoi cette notification est verrouillée</Text>
                <Text style={s.lockedPopupBody}>« {lockedPopup.title} » fait partie des notifications que le Super Admin a réservées à une formule spécifique.</Text>
                <View style={s.lockedPopupPlan}><Text style={s.lockedPopupPlanText}>Disponible avec {lockedPopup.plan}</Text></View>
                <Text style={s.lockedPopupHint}>Tu restes exactement dans ta cloche. Aucun changement d’écran et aucun contenu privé n’est affiché avant déblocage.</Text>
                <TouchableOpacity style={s.lockedPopupClose} onPress={() => setLockedPopup(null)}><Text style={s.lockedPopupCloseText}>J’AI COMPRIS</Text></TouchableOpacity>
              </View>
            </View>
          ) : null}
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
  headerHint:{color:colors.textMutedGrey,fontSize:10,marginTop:3},
  close:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  closeText:{color:colors.textPrimary,fontSize:26,lineHeight:28,fontWeight:'700'},
  tabs:{flexDirection:'row',gap:6,paddingHorizontal:12,paddingTop:14,paddingBottom:10},
  tab:{flex:1,minHeight:52,borderRadius:15,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundElevated,paddingHorizontal:4},
  tabOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  tabText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900',letterSpacing:.5},
  tabTextOn:{color:colors.primaryLight},
  tabHint:{color:colors.textMuted,fontSize:8,fontWeight:'700',marginTop:2},
  settingsList:{paddingHorizontal:16,paddingBottom:36,gap:10},
  notificationMaster:{minHeight:76,padding:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:12},
  notificationMasterCopy:{flex:1,minWidth:0},
  inboxActions:{minHeight:42,flexDirection:'row',alignItems:'center',gap:8},
  inboxHint:{flex:1,color:colors.textMutedGrey,fontSize:9,lineHeight:13,fontWeight:'700'},
  markAllButton:{minHeight:34,paddingHorizontal:11,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint},
  markAllText:{color:colors.primaryLight,fontSize:8,fontWeight:'900'},
  chatAccordion:{marginBottom:10,padding:12,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},
  chatAccordionHead:{flexDirection:'row',alignItems:'flex-start',gap:8},
  chatEyebrow:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:1.1},
  chatTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:2},
  chatHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:4},
  chatSwitchRow:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border,marginTop:8},
  chatSwitchCopy:{flex:1,minWidth:0,paddingRight:10},
  chatSwitchLabel:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  chatSwitchHint:{color:colors.textMutedGrey,fontSize:8.5,lineHeight:12,marginTop:2},
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
  drawerHint:{color:colors.keep,fontSize:9,lineHeight:14,fontWeight:'800',marginTop:10},
  list:{padding:16,paddingTop:6,paddingBottom:36,gap:9},
  card:{padding:12,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated},
  cardUnread:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  cardLocked:{borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},
  cardTop:{flexDirection:'row',alignItems:'center',gap:7},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.keep},
  dotRead:{backgroundColor:colors.textMuted},
  dotLocked:{backgroundColor:colors.primaryLight},
  cardTitle:{flex:1,minWidth:0,color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  time:{color:colors.textMuted,fontSize:9,fontWeight:'700'},
  chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  details:{paddingTop:8,marginTop:7,borderTopWidth:1,borderTopColor:colors.border},
  body:{color:colors.textMutedGrey,fontSize:12,lineHeight:18},
  typeLabel:{color:colors.textMuted,fontSize:8,fontWeight:'900',letterSpacing:.7,marginTop:7},
  lockedDetails:{borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,padding:10},
  lockedPlan:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:.4},
  lockedBody:{color:colors.textPrimary,fontSize:11,lineHeight:17,marginTop:5,fontWeight:'800'},
  lockedHint:{color:colors.textMutedGrey,fontSize:9,lineHeight:14,marginTop:6},
  notificationAction:{minHeight:38,borderRadius:19,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:10},
  notificationActionReady:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.14)'},
  notificationActionText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  lockedOverlay:{...StyleSheet.absoluteFillObject,zIndex:60,elevation:60,backgroundColor:'rgba(4,2,9,.72)',alignItems:'center',justifyContent:'center',padding:18},
  lockedPopupCard:{width:'100%',maxWidth:330,borderRadius:24,borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:18,alignItems:'center',shadowColor:'#000',shadowOpacity:.42,shadowRadius:20,shadowOffset:{width:0,height:10}},
  lockedPopupIcon:{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},
  lockedPopupIconText:{fontSize:24},
  lockedPopupKicker:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:10},
  lockedPopupTitle:{color:colors.textPrimary,fontSize:17,fontWeight:'900',textAlign:'center',marginTop:4},
  lockedPopupBody:{color:colors.textMutedGrey,fontSize:11,lineHeight:17,textAlign:'center',marginTop:8},
  lockedPopupPlan:{minHeight:40,borderRadius:20,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)',alignItems:'center',justifyContent:'center',paddingHorizontal:16,marginTop:12},
  lockedPopupPlanText:{color:colors.keep,fontSize:11,fontWeight:'900'},
  lockedPopupHint:{color:colors.textMutedGrey,fontSize:9.5,lineHeight:15,textAlign:'center',marginTop:10},
  lockedPopupClose:{width:'100%',minHeight:44,borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},
  lockedPopupCloseText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  emptyCard:{padding:20,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center'},
  emptyIcon:{fontSize:28,marginBottom:8},
  emptyTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginBottom:4},
  empty:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,textAlign:'center'},
});
