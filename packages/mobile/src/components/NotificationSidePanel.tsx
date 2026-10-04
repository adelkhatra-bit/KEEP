import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, LayoutAnimation, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { Alert } from '../utils/keepAlert';
import { KeepNotification, NotificationPreferences, deleteNotification, loadNotificationPreferences, loadNotifications, markNotificationRead, saveNotificationPreferences, subscribeToNotifications } from '../services/notificationService';
import { acceptMarketplacePaymentTerms, loadMusicAgoraSettings, saveMusicAgoraPosition, saveMusicAgoraSettings, saveMusicAgoraVoiceAnnouncements, type MusicAgoraSurface } from '../services/musicAgoraService';
import { useGlobalChatStore, type GlobalChatTarget } from '../store/useGlobalChatStore';
import { useUserStore } from '../store/useUserStore';
import { loadCurrentPlanCode } from '../services/planService';
import {
  isNotificationAccessLocked,
  loadNotificationAccessRules,
  notificationAccessRequiredPlan,
  notificationPlanLabel,
  type NotificationAccessRule,
} from '../services/notificationAccessService';
import NewKeepNotificationActions from './NewKeepNotificationActions';
import { isNewKeepNotification } from '../services/newKeepNotification';
import { navigateToBattleArena, navigateToEvent, navigateToSharedProfile, navigationRef } from '../navigation/navigationRef';
import { supabase } from '../services/supabaseClient';
import { loadPlaylistSalePaymentGuardStatus, markPlaylistSaleBuyerPaid, markPlaylistSalePaid, reportPlaylistSalePaymentProblem } from '../services/playlistSaleService';
import { openPlaylistPaymentProof } from '../services/playlistPaymentProofService';
import { syncMarketplaceDelivery } from '../services/musicProviderSyncService';
import PayoutCheckoutSheet from './PayoutCheckoutSheet';

type Props = {
  visible: boolean;
  profileId: string;
  onClose: () => void;
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
  // Une proposition musicale / vente est une ACTIVITÉ : elle reste liée au
  // Tchat mais ne doit pas être noyée avec les messages texte.
  if (value === 'AGORA_MUSIC_OFFER' || value === 'AGORA_GROUP_MUSIC_OFFER') return false;
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

function activityProfileUsername(item: KeepNotification): string | null {
  const data = item.data ?? {};
  const raw = data.username ?? data.actorUsername ?? data.actor_username ?? data.viewerUsername ?? data.viewer_username
    ?? data.requesterUsername ?? data.requester_username ?? data.followerUsername ?? data.follower_username
    ?? data.sellerUsername ?? data.seller_username ?? data.inviterUsername ?? data.inviter_username
    ?? data.originUsername ?? data.origin_username ?? data.senderUsername ?? data.sender_username;
  return typeof raw === 'string' && raw.trim() ? raw.trim().replace(/^@+/, '') : null;
}

function activityProfileId(item: KeepNotification): string | null {
  const data = item.data ?? {};
  const raw = data.actorId ?? data.actor_id ?? data.viewerId ?? data.viewer_id
    ?? data.requesterId ?? data.requester_id ?? data.followerId ?? data.follower_id
    ?? data.sellerId ?? data.seller_id ?? data.inviterId ?? data.inviter_id
    ?? data.originProfileId ?? data.origin_profile_id ?? data.sourceProfileId ?? data.source_profile_id
    ?? data.senderId ?? data.sender_id;
  return typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw.trim()) ? raw.trim() : null;
}

async function resolveActivityProfileUsername(item: KeepNotification): Promise<string | null> {
  const direct = activityProfileUsername(item);
  if (direct) return direct;
  const id = activityProfileId(item);
  if (!id || !supabase) return null;
  const { data } = await supabase.from('profiles').select('username').eq('id', id).maybeSingle();
  const username = String((data as any)?.username || '').trim();
  return username ? username.replace(/^@+/, '') : null;
}

function paymentIdOf(item: KeepNotification): string | null {
  const raw = item.data?.paymentId ?? item.data?.payment_id;
  return typeof raw === 'string' && raw ? raw : null;
}

async function pendingPaymentWarning(item: KeepNotification): Promise<string | null> {
  const paymentId = paymentIdOf(item);
  if (!paymentId) return null;
  try {
    const status = await loadPlaylistSalePaymentGuardStatus(paymentId);
    if (!status?.pending) return null;
    if (status.proofUploadedAt || status.buyerMarkedPaidAt) {
      return 'ATTENTION : cette transaction n’est pas terminée. Un paiement a déjà été signalé ou une preuve a été envoyée, mais la collection n’est pas encore débloquée.';
    }
    return 'ATTENTION : cette transaction n’est pas terminée. Le QR/lien de paiement et les informations de déblocage peuvent encore être nécessaires.';
  } catch {
    return 'Cette notification est liée à un paiement. Loki n’a pas pu confirmer que la transaction est terminée.';
  }
}

function activityActionLabel(item: KeepNotification): string {
  const type = String(item.type || '').toUpperCase();
  const directUsername = activityProfileUsername(item);
  if (type === 'PROFILE_VIEW') return directUsername ? `VOIR LE PROFIL @${directUsername}` : 'VOIR LE PROFIL';
  if (type.startsWith('FREE_') || type === 'MONTHLY_FREE_CREDIT') return 'VOIR MES FREE';
  if (type === 'PLAN_GIFTED' || type.includes('PLAN')) return 'VOIR MON OFFRE';
  if (type === 'LOKI_PULSE_NEW') return 'OUVRIR MON PULSE';
  if (type.includes('BATTLE')) return 'OUVRIR BATTLE';
  if (type.startsWith('EVENT_')) return 'VOIR L’ÉVÉNEMENT';
  if (type === 'PLAYLIST_SALE_DELIVERED') return 'OUVRIR LA COLLECTION';
  if (type === 'PLAYLIST_SALE_PAYMENT_READY') return 'PAYER · QR / PREUVE';
  if (type === 'PLAYLIST_SALE_BUYER_PAID' || type === 'PLAYLIST_SALE_PAYMENT_REMINDER') return 'VALIDER LE PAIEMENT';
  if (type === 'PLAYLIST_SALE_WAITING_SELLER') return 'SUIVRE LE PAIEMENT';
  if (type.startsWith('PLAYLIST_SALE_')) return 'OUVRIR LA PÉPITE';
  const profileUsername = activityProfileUsername(item);
  if (profileUsername) return `VOIR @${profileUsername}`;
  if (activityProfileId(item)) return 'VOIR LE PROFIL';
  return 'OUVRIR / AGIR';
}

export default function NotificationSidePanel({ visible, profileId, onClose }: Props) {
  const slide = useRef(new Animated.Value(1)).current;
  const isDemoMode = useUserStore((state) => state.isDemoMode);
  const [items, setItems] = useState<KeepNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'MESSAGES' | 'ACTIVITY' | 'SETTINGS'>('ACTIVITY');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preparedChatId, setPreparedChatId] = useState<string | null>(null);
  const [followingProfileIds, setFollowingProfileIds] = useState<Set<string>>(new Set());
  const [followBusyProfileId, setFollowBusyProfileId] = useState<string | null>(null);
  const [lockedPopup, setLockedPopup] = useState<{ plan: string } | null>(null);
  const [paymentCheckoutItem, setPaymentCheckoutItem] = useState<KeepNotification | null>(null);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [notificationPrefsSaving, setNotificationPrefsSaving] = useState(false);
  const [accessRules, setAccessRules] = useState<NotificationAccessRule[]>([]);
  const [currentPlan, setCurrentPlan] = useState('FREE');
  const [chatSettingsLoading, setChatSettingsLoading] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatNotifications, setChatNotifications] = useState(true);
  const [chatVoiceEnabled, setChatVoiceEnabled] = useState(false);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(['PROFILE']);
  const [chatSide, setChatSide] = useState<'left' | 'right'>('right');
  const chatBottomOffset = useGlobalChatStore((state) => state.bottomOffset);
  const { height: viewportHeight } = useWindowDimensions();
  const chatLowBottom = Math.max(100, Math.round(viewportHeight * 0.44));
  const chatHighBottom = Math.max(chatLowBottom, viewportHeight - 118);
  const chatMiddleBottom = Math.max(chatLowBottom, Math.min(chatHighBottom, Math.round(viewportHeight * 0.58)));
  const chatVerticalPreset = Math.abs(chatBottomOffset - chatHighBottom) <= Math.abs(chatBottomOffset - chatMiddleBottom) && Math.abs(chatBottomOffset - chatHighBottom) <= Math.abs(chatBottomOffset - chatLowBottom)
    ? 'HIGH'
    : Math.abs(chatBottomOffset - chatMiddleBottom) <= Math.abs(chatBottomOffset - chatLowBottom)
      ? 'MIDDLE'
      : 'LOW';

  const refresh = async () => {
    if (!profileId) return;
    if (isDemoMode) {
      setItems([]);
      setAccessRules([]);
      setCurrentPlan('FREE');
      setNotificationPrefs(null);
      setLoading(false);
      return;
    }
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
    if (isDemoMode) {
      setChatEnabled(true);
      setChatNotifications(true);
      setChatVoiceEnabled(false);
      setChatSurfaces(CHAT_SURFACE_OPTIONS.map((item) => item.key));
      setChatSide('right');
      setChatSettingsLoading(false);
      return;
    }
    setChatSettingsLoading(true);
    try {
      const settings = await loadMusicAgoraSettings();
      setChatEnabled(settings.homeEnabled);
      setChatNotifications(settings.notificationsEnabled);
      setChatVoiceEnabled(Boolean(settings.voiceAnnouncementsEnabled));
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
    if (isDemoMode) {
      const nextSurfaces: MusicAgoraSurface[] = surfaces.length ? surfaces : ['PROFILE'];
      setChatEnabled(enabled);
      setChatNotifications(notificationsEnabled);
      setChatSurfaces(nextSurfaces);
      return;
    }
    setChatSaving(true);
    try {
      const nextSurfaces: MusicAgoraSurface[] = surfaces.length ? surfaces : ['PROFILE'];
      const settings = await saveMusicAgoraSettings(enabled, notificationsEnabled, nextSurfaces);
      setChatEnabled(settings.homeEnabled);
      setChatNotifications(settings.notificationsEnabled);
      setChatVoiceEnabled(Boolean(settings.voiceAnnouncementsEnabled));
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
    if (!isDemoMode) void saveMusicAgoraPosition(side, bottom).catch(() => {});
  };

  const chooseChatVertical = (preset: 'HIGH' | 'MIDDLE' | 'LOW') => {
    const nextBottom = preset === 'HIGH' ? chatHighBottom : preset === 'MIDDLE' ? chatMiddleBottom : chatLowBottom;
    useGlobalChatStore.getState().setBottomOffset(nextBottom);
    if (!isDemoMode) void saveMusicAgoraPosition(chatSide, nextBottom).catch(() => {});
  };

  const chooseChatTopAnchor = (anchor: 'MENU' | 'BELL') => {
    const nextSide: 'left' | 'right' = anchor === 'MENU' ? 'left' : 'right';
    setChatSide(nextSide);
    useGlobalChatStore.getState().setSide(nextSide);
    useGlobalChatStore.getState().setBottomOffset(chatHighBottom);
    if (!isDemoMode) void saveMusicAgoraPosition(nextSide, chatHighBottom).catch(() => {});
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
    const unsub = isDemoMode
      ? () => {}
      : subscribeToNotifications(profileId, (notification) => {
          setItems((prev) => [notification, ...prev.filter((row) => row.id !== notification.id)].slice(0, 100));
        });
    return () => unsub();
  }, [visible, profileId, isDemoMode]);

  const close = () => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const markRead = async (item: KeepNotification) => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, readAt } : row));
    if (!isDemoMode) await markNotificationRead(profileId, item.id).catch(() => {});
  };

  const markVisibleRead = async () => {
    if (activeTab === 'SETTINGS') return;
    const visibleIds = (activeTab === 'MESSAGES' ? messageItems : activityItems)
      .filter((row) => !row.readAt)
      .map((row) => row.id);
    if (!visibleIds.length) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) => visibleIds.includes(row.id) ? { ...row, readAt } : row));
    if (!isDemoMode) await Promise.all(visibleIds.map((id) => markNotificationRead(profileId, id).catch(() => {})));
  };

  const removeOne = async (item: KeepNotification) => {
    setExpandedId((current) => current === item.id ? null : current);
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    if (!isDemoMode) {
      await deleteNotification(profileId, item.id).catch(() => {
        void refresh();
      });
    }
  };

  const clearVisible = async () => {
    if (activeTab === 'SETTINGS') return;
    const visibleIds = (activeTab === 'MESSAGES' ? messageItems : activityItems).map((row) => row.id);
    if (!visibleIds.length) return;
    setExpandedId(null);
    setItems((prev) => prev.filter((row) => !visibleIds.includes(row.id)));
    if (!isDemoMode) {
      const failed = await Promise.all(visibleIds.map(async (id) => {
        try { await deleteNotification(profileId, id); return false; } catch { return true; }
      }));
      if (failed.some(Boolean)) void refresh();
    }
  };

  const openNotificationTab = async (tab: 'MESSAGES' | 'ACTIVITY' | 'SETTINGS') => {
    setActiveTab(tab);
    setExpandedId(null);
    if (tab === 'SETTINGS') return;

    const unreadIds = items
      .filter((item) => !item.readAt)
      .filter((item) => tab === 'MESSAGES'
        ? isChatNotificationType(item.type)
        : !isChatNotificationType(item.type))
      .map((item) => item.id);

    if (!unreadIds.length) return;

    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) =>
      unreadIds.includes(row.id) ? { ...row, readAt } : row
    ));

    if (!isDemoMode) {
      await Promise.all(unreadIds.map((id) => markNotificationRead(profileId, id).catch(() => {})));
    }
  };


  const deleteOne = async (item: KeepNotification) => {
    const paymentWarning = await pendingPaymentWarning(item);
    Alert.alert(
      'Supprimer cette notification ?',
      paymentWarning
        ? `${paymentWarning}\n\nSi tu la supprimes maintenant, la transaction reste enregistrée dans Loki, mais tu perds ce raccourci depuis les notifications.`
        : 'Elle disparaîtra de cette liste. Le message, la transaction ou l’activité d’origine ne seront pas supprimés.',
      [
        { text: 'ANNULER', style: 'cancel' },
        {
          text: 'SUPPRIMER',
          style: 'destructive',
          onPress: () => {
            const previous = items;
            setItems((current) => current.filter((row) => row.id !== item.id));
            setExpandedId((current) => current === item.id ? null : current);
            if (!isDemoMode) {
              void deleteNotification(profileId, item.id).catch(() => {
                setItems(previous);
                Alert.alert('Notifications', 'Impossible de supprimer cette notification pour le moment.');
              });
            }
          },
        },
      ],
    );
  };

  const deleteVisibleSection = async () => {
    if (activeTab === 'SETTINGS') return;
    const sectionItems = activeTab === 'MESSAGES'
      ? items.filter((item) => isChatNotificationType(item.type))
      : items.filter((item) => !isChatNotificationType(item.type));
    if (!sectionItems.length) return;

    const sectionLabel = activeTab === 'MESSAGES' ? 'messages' : 'activités';
    const paymentItems = sectionItems.filter((item) => Boolean(paymentIdOf(item)));
    const pendingChecks = await Promise.all(paymentItems.map(async (item) => {
      try {
        const paymentId = paymentIdOf(item);
        if (!paymentId) return false;
        return Boolean((await loadPlaylistSalePaymentGuardStatus(paymentId))?.pending);
      } catch {
        return true;
      }
    }));
    const pendingCount = pendingChecks.filter(Boolean).length;
    const detail = pendingCount > 0
      ? `\n\nATTENTION : ${pendingCount} notification${pendingCount > 1 ? 's sont' : ' est'} liée${pendingCount > 1 ? 's' : ''} à une transaction encore incomplète. Les transactions resteront enregistrées, mais leurs raccourcis seront retirés.`
      : '';

    Alert.alert(
      `Vider ${activeTab === 'MESSAGES' ? 'Messages' : 'Activité'} ?`,
      `Les ${sectionItems.length} notification${sectionItems.length > 1 ? 's' : ''} de cette section seront retirées. Les contenus d’origine restent disponibles.${detail}`,
      [
        { text: 'ANNULER', style: 'cancel' },
        {
          text: 'VIDER',
          style: 'destructive',
          onPress: () => {
            const ids = sectionItems.map((item) => item.id);
            const previous = items;
            setItems((current) => current.filter((item) => !ids.includes(item.id)));
            setExpandedId(null);
            if (!isDemoMode) {
              void Promise.all(ids.map((id) => deleteNotification(profileId, id))).catch(() => {
                setItems(previous);
                Alert.alert('Notifications', `Impossible de vider les ${sectionLabel} pour le moment.`);
              });
            }
          },
        },
      ],
    );
  };

  const toggleSystemNotifications = async (enabled: boolean) => {
    if (!notificationPrefs || notificationPrefsSaving) return;
    const previous = notificationPrefs;
    const next = { ...previous, systemEnabled: enabled };
    setNotificationPrefs(next);
    setNotificationPrefsSaving(true);
    try {
      if (!isDemoMode) await saveNotificationPreferences(profileId, next);
    } catch {
      setNotificationPrefs(previous);
    } finally {
      setNotificationPrefsSaving(false);
    }
  };

  const isBuyerPaymentReady = (item: KeepNotification) =>
    String(item.type || '').toUpperCase() === 'PLAYLIST_SALE_PAYMENT_READY' && Boolean(paymentIdOf(item));

  const isSellerPaymentAction = (item: KeepNotification) =>
    ['PLAYLIST_SALE_BUYER_PAID', 'PLAYLIST_SALE_PAYMENT_REMINDER'].includes(String(item.type || '').toUpperCase())
    && Boolean(paymentIdOf(item));

  const isBuyerWaitingSeller = (item: KeepNotification) =>
    String(item.type || '').toUpperCase() === 'PLAYLIST_SALE_WAITING_SELLER' && Boolean(paymentIdOf(item));

  const openPaymentCheckout = async (item: KeepNotification) => {
    await markRead(item);
    if (Platform.OS !== 'web') {
      setPaymentCheckoutItem(null);
      Alert.alert('Déblocage', 'Le déblocage en euros est disponible sur la version web de Loki Music. Sur mobile, tu peux écouter les aperçus et utiliser les FREE.');
      return;
    }
    setPaymentCheckoutItem(item);
    setExpandedId(item.id);
  };

  const signalPaymentSent = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    setPaymentBusyId(paymentId);
    try {
      await markPlaylistSaleBuyerPaid(paymentId);
      await markRead(item);
      setPaymentCheckoutItem(null);
      Alert.alert('Paiement envoyé', 'Ta preuve a été transmise au propriétaire de la collection. Il doit maintenant vérifier son compte PayPal puis valider la réception.');
      await refresh();
    } catch (error: any) {
      const raw = String(error?.message || error || '');
      Alert.alert('Paiement', raw.includes('PAYMENT_PROOF_REQUIRED')
        ? 'Ajoute d’abord une capture ou un PDF comme preuve de paiement.'
        : 'Impossible de signaler le paiement pour le moment.');
    } finally {
      setPaymentBusyId(null);
    }
  };

  const openPaymentHistory = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId) return;
    const data = item.data ?? {};
    await markRead(item);
    close();
    if (navigationRef.isReady()) {
      (navigationRef.navigate as any)('PlaylistSale', {
        manageSaleOfferId: String(data.offerId ?? data.offer_id ?? '') || undefined,
        manageSaleOfferName: String(data.playlistName ?? data.playlist_name ?? '') || undefined,
        focusPaymentId: paymentId,
        openPaymentHistory: true,
        source: 'NOTIFICATION_PANEL_PAYMENT',
      });
    }
  };

  const openPaymentProof = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId) return;
    try {
      const url = await openPlaylistPaymentProof(paymentId);
      await Linking.openURL(url);
      await markRead(item);
    } catch (error: any) {
      Alert.alert('Preuve de paiement', error?.message || 'Impossible d’ouvrir la preuve pour le moment.');
    }
  };

  const confirmPaymentReceived = (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    const data = item.data ?? {};
    const amountCents = Number(data.amountCents ?? data.amount_cents ?? 0);
    const currency = String(data.currencyCode ?? data.currency_code ?? 'EUR').toUpperCase();
    const amount = amountCents > 0 ? `${(amountCents / 100).toFixed(2).replace('.', ',')} ${currency}` : 'le montant attendu';
    Alert.alert(
      'Validation irréversible',
      `Vérifie TON compte PayPal et la preuve. Confirme uniquement si ${amount} sont réellement reçus. Le déblocage est immédiat. Une fausse validation peut entraîner avertissement, retrait de Free, suspension ou bannissement selon le règlement Loki Music.`,
      [
        { text: 'RETOUR', style: 'cancel' },
        {
          text: 'J’ACCEPTE · VALIDER',
          onPress: () => {
            setPaymentBusyId(paymentId);
            void acceptMarketplacePaymentTerms('seller_payment_confirmation')
              .then(() => markPlaylistSalePaid(paymentId))
              .then(async (delivered) => {
                await syncMarketplaceDelivery(paymentId).catch(() => null);
                await markRead(item);
                Alert.alert('Paiement validé', `${delivered.trackCount} morceau${delivered.trackCount > 1 ? 'x' : ''} débloqué${delivered.trackCount > 1 ? 's' : ''} pour l’acheteur.`);
                await refresh();
              })
              .catch((error: any) => {
                const raw = String(error?.message || error || '');
                Alert.alert('Paiement', raw.includes('PAYMENT_PROOF_REQUIRED') || raw.includes('BUYER_HAS_NOT_MARKED_PAID')
                  ? 'L’acheteur doit avoir signalé le paiement et joint une preuve.'
                  : 'Impossible de valider ce paiement pour le moment.');
              })
              .finally(() => setPaymentBusyId(null));
          },
        },
      ],
    );
  };

  const reportPaymentProblem = (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    Alert.alert(
      'Signaler une non-réponse ?',
      'La transaction et sa référence seront transmises au Super Admin. Les sanctions éventuelles sont décidées après vérification.',
      [
        { text: 'ANNULER', style: 'cancel' },
        {
          text: 'ENVOYER LA RÉCLAMATION',
          onPress: () => {
            setPaymentBusyId(paymentId);
            void reportPlaylistSalePaymentProblem(paymentId, 'Absence de réponse ou de validation sur une transaction Loki Music.')
              .then(() => Alert.alert('Réclamation envoyée', 'Le Super Admin a reçu la référence de cette transaction.'))
              .catch((error: any) => {
                const raw = String(error?.message || error || '');
                Alert.alert('Réclamation',
                  raw.includes('PAYMENT_REPORT_TOO_EARLY')
                    ? 'La réclamation devient disponible après 4 h sans réponse.'
                    : raw.includes('PAYMENT_NOT_REPORTED_YET')
                      ? 'Le paiement doit d’abord être signalé avec une preuve.'
                      : 'Impossible d’envoyer la réclamation pour le moment.');
              })
              .finally(() => setPaymentBusyId(null));
          },
        },
      ],
    );
  };

  const openActivityNotification = async (item: KeepNotification) => {
    const type = String(item.type || '').toUpperCase();
    const data = item.data ?? {};
    if (!isDemoMode) await markNotificationRead(profileId, item.id).catch(() => {});
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row));
    const username = await resolveActivityProfileUsername(item);
    const arenaId = String(data.arenaId ?? data.arena_id ?? '').trim();
    const eventId = String(data.eventId ?? data.event_id ?? '').trim();
    const offerId = String(data.offerId ?? data.offer_id ?? '').trim();
    const playlistId = String(data.playlistId ?? data.playlist_id ?? '').trim();

    if (isBuyerPaymentReady(item)) {
      await openPaymentCheckout(item);
      return;
    }
    if (isSellerPaymentAction(item) || isBuyerWaitingSeller(item)) {
      setExpandedId(item.id);
      return;
    }

    onClose();
    if (type.startsWith('FREE_') || type === 'MONTHLY_FREE_CREDIT') {
      if (navigationRef.isReady()) (navigationRef.navigate as any)('Offers', { sourceFeature: 'PROFILE_FREE' });
      return;
    }
    if (type === 'PLAN_GIFTED' || type.includes('PLAN')) {
      if (navigationRef.isReady()) (navigationRef.navigate as any)('Offers');
      return;
    }
    if (type === 'LOKI_PULSE_NEW') {
      if (navigationRef.isReady()) (navigationRef.navigate as any)('Main', { screen: 'Profile' });
      return;
    }
    if (type.includes('BATTLE')) {
      if (arenaId) navigateToBattleArena(arenaId);
      else if (navigationRef.isReady()) (navigationRef.navigate as any)('Main', { screen: 'Parties', params: { openBattle: true, source: 'NOTIFICATION_PANEL' } });
      return;
    }
    if (eventId) {
      navigateToEvent(eventId);
      return;
    }
    if (type === 'PLAYLIST_SALE_DELIVERED' && playlistId) {
      if (navigationRef.isReady()) (navigationRef.navigate as any)('Main', { screen: 'MyMusic', params: { openPurchasePlaylistId: playlistId, source: 'NOTIFICATION_PANEL' } });
      return;
    }
    if (type.startsWith('PLAYLIST_SALE_') && username && offerId) {
      if (navigationRef.isReady()) (navigationRef.navigate as any)('PublicProfile', { username, openSaleOfferId: offerId, source: 'NOTIFICATION_PANEL' });
      return;
    }
    if (username) {
      navigateToSharedProfile(username);
      return;
    }
    if (navigationRef.isReady()) (navigationRef.navigate as any)('Notifications');
  };

  useEffect(() => {
    if (!profileId || !supabase || isDemoMode) {
      setFollowingProfileIds(new Set());
      return;
    }
    const targetIds = Array.from(new Set(
      items
        .filter((item) => isNewKeepNotification(item))
        .map((item) => activityProfileId(item))
        .filter((id): id is string => Boolean(id && id !== profileId)),
    ));
    if (!targetIds.length) {
      setFollowingProfileIds(new Set());
      return;
    }
    let live = true;
    void Promise.resolve(supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', profileId)
      .in('followee_id', targetIds))
      .then(({ data }) => {
        if (!live) return;
        setFollowingProfileIds(new Set((data ?? []).map((row: any) => String(row.followee_id))));
      })
      .catch(() => { if (live) setFollowingProfileIds(new Set()); });
    return () => { live = false; };
  }, [items, profileId, isDemoMode]);

  const followFromActivity = async (item: KeepNotification) => {
    if (!supabase || isDemoMode || followBusyProfileId) return;
    const targetId = activityProfileId(item);
    if (!targetId || targetId === profileId || followingProfileIds.has(targetId)) return;
    setFollowBusyProfileId(targetId);
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: targetId });
      if (error) throw error;
      setFollowingProfileIds((current) => new Set(current).add(targetId));
      if (!item.readAt) await markNotificationRead(profileId, item.id).catch(() => {});
    } finally {
      setFollowBusyProfileId(null);
    }
  };

  const openActivityProfile = async (item: KeepNotification) => {
    if (!isDemoMode) await markNotificationRead(profileId, item.id).catch(() => {});
    const username = await resolveActivityProfileUsername(item);
    if (!username) return;
    onClose();
    navigateToSharedProfile(username);
  };

  const prepareChatNotification = async (item: KeepNotification) => {
    await markRead(item);
    const type = String(item.type || '').toUpperCase();
    setPreparedChatId(item.id);
    if (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE') {
      useGlobalChatStore.getState().openSettings();
      close();
      return;
    }
    useGlobalChatStore.getState().open(chatTarget(item));
    close();
  };

  const toggleNotification = async (item: KeepNotification) => {
    await markRead(item);
    if (isNotificationAccessLocked(item.type, currentPlan, accessRules)) {
      const requiredPlan = notificationAccessRequiredPlan(item.type, accessRules);
      setLockedPopup({
        plan: notificationPlanLabel(requiredPlan),
      });
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((current) => current === item.id ? null : item.id);
  };

  const messageItems = items.filter((item) => isChatNotificationType(item.type));
  const activityItems = items.filter((item) => !isChatNotificationType(item.type));
  const messageCount = messageItems.length;
  const activityCount = activityItems.length;
  const unreadMessageCount = messageItems.filter((item) => !item.readAt).length;
  const unreadActivityCount = activityItems.filter((item) => !item.readAt).length;
  const visibleItems = activeTab === 'MESSAGES' ? messageItems : activityItems;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Fermer les notifications" />
        <Animated.View style={[s.panel, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>LOKI MUSIC</Text>
              <Text style={s.title}>Notifications</Text>
              <Text style={s.headerHint}>Messages, activité et réglages au même endroit.</Text>
            </View>
            <TouchableOpacity style={s.close} onPress={close} accessibilityLabel="Fermer"><Text style={s.closeText}>×</Text></TouchableOpacity>
          </View>

          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, unreadMessageCount > 0 && s.tabUnread, activeTab === 'MESSAGES' && s.tabOn]}
              onPress={() => { void openNotificationTab('MESSAGES'); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'MESSAGES' }}
            >
              <View style={s.tabTitleRow}>
                <Text style={[s.tabText, unreadMessageCount > 0 && s.tabTextUnread, activeTab === 'MESSAGES' && s.tabTextOn]}>MESSAGES</Text>
                {messageCount > 0 ? <View style={[s.tabBadge, unreadMessageCount === 0 && s.tabBadgeQuiet]}><Text style={[s.tabBadgeText, unreadMessageCount === 0 && s.tabBadgeTextQuiet]}>{messageCount > 99 ? '99+' : messageCount}</Text></View> : null}
              </View>
              <Text style={[s.tabHint, unreadMessageCount > 0 && s.tabHintUnread]}>{unreadMessageCount > 0 ? `${unreadMessageCount} nouveau${unreadMessageCount > 1 ? 'x' : ''}` : (messageCount > 0 ? 'conservés' : 'vide')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, unreadActivityCount > 0 && s.tabUnread, activeTab === 'ACTIVITY' && s.tabOn]}
              onPress={() => { void openNotificationTab('ACTIVITY'); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'ACTIVITY' }}
            >
              <View style={s.tabTitleRow}>
                <Text style={[s.tabText, unreadActivityCount > 0 && s.tabTextUnread, activeTab === 'ACTIVITY' && s.tabTextOn]}>ACTIVITÉ</Text>
                {activityCount > 0 ? <View style={[s.tabBadge, unreadActivityCount === 0 && s.tabBadgeQuiet]}><Text style={[s.tabBadgeText, unreadActivityCount === 0 && s.tabBadgeTextQuiet]}>{activityCount > 99 ? '99+' : activityCount}</Text></View> : null}
              </View>
              <Text style={[s.tabHint, unreadActivityCount > 0 && s.tabHintUnread]}>{unreadActivityCount > 0 ? `${unreadActivityCount} nouvelle${unreadActivityCount > 1 ? 's' : ''}` : (activityCount > 0 ? 'conservée' : 'vide')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, activeTab === 'SETTINGS' && s.tabOn]} onPress={() => { void openNotificationTab('SETTINGS'); }} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'SETTINGS' }}>
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
                  <Text style={s.chatHint}>Active ou coupe les alertes sans quitter ce panneau.</Text>
                </View>
                <Switch value={notificationPrefs?.systemEnabled ?? true} disabled={!notificationPrefs || notificationPrefsSaving} onValueChange={(value) => void toggleSystemNotifications(value)} trackColor={{ false: colors.border, true: colors.keep }} />
              </View>

              <View style={s.chatAccordion}>
                <View style={s.chatAccordionHead}>
                  <View style={{flex:1,minWidth:0}}>
                    <Text style={s.chatEyebrow}>MESSAGERIE LOKI</Text>
                    <Text style={s.chatTitle}>Bouton flottant + plein écran</Text>
                    <Text style={s.chatHint}>Le bouton reste sur le bord choisi. Appuie dessus pour ouvrir la messagerie en plein écran ; les nouveaux messages affichent un badge.</Text>
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
                  <View style={{flex:1,minWidth:0,paddingRight:10}}>
                    <Text style={s.chatSwitchLabel}>Annonce vocale « Message de @pseudo »</Text>
                    <Text style={s.chatSwitchHint}>Optionnelle. Le contenu privé du message n’est jamais lu.</Text>
                  </View>
                  <Switch
                    value={chatVoiceEnabled}
                    disabled={chatSaving || !chatEnabled || !chatNotifications}
                    onValueChange={(value) => {
                      setChatVoiceEnabled(value);
                      void saveMusicAgoraVoiceAnnouncements(value).then(setChatVoiceEnabled).catch(() => setChatVoiceEnabled(!value));
                    }}
                    trackColor={{ false: colors.border, true: colors.keep }}
                  />
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
                <Text style={s.chatSectionLabel}>ANCRAGE RAPIDE EN HAUT</Text>
                <View style={s.chatAnchorRow}>
                  <TouchableOpacity style={s.chatAnchorButton} onPress={() => chooseChatTopAnchor('MENU')} accessibilityLabel="Tchat en haut à gauche près du menu">
                    <Text style={s.chatAnchorIcon}>☰</Text>
                    <Text style={s.chatAnchorText}>MENU · HAUT GAUCHE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.chatAnchorButton} onPress={() => chooseChatTopAnchor('BELL')} accessibilityLabel="Tchat en haut à droite près de la cloche">
                    <Text style={s.chatAnchorIcon}>🔔</Text>
                    <Text style={s.chatAnchorText}>CLOCHE · HAUT DROITE</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.chatSectionLabel}>HAUTEUR DU BOUTON</Text>
                <View style={s.chatPositionRow}>
                  <TouchableOpacity style={[s.chatPositionButton, chatVerticalPreset === 'HIGH' && s.chatPositionButtonOn]} onPress={() => chooseChatVertical('HIGH')} accessibilityLabel="Placer le Tchat en haut">
                    <Text style={[s.chatPositionText, chatVerticalPreset === 'HIGH' && s.chatPositionTextOn]}>HAUT</Text>
                    <Text style={s.chatPositionHint}>près cloche / menu</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.chatPositionButton, chatVerticalPreset === 'MIDDLE' && s.chatPositionButtonOn]} onPress={() => chooseChatVertical('MIDDLE')} accessibilityLabel="Placer le Tchat au milieu">
                    <Text style={[s.chatPositionText, chatVerticalPreset === 'MIDDLE' && s.chatPositionTextOn]}>MILIEU</Text>
                    <Text style={s.chatPositionHint}>recommandé</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.chatPositionButton, chatVerticalPreset === 'LOW' && s.chatPositionButtonOn]} onPress={() => chooseChatVertical('LOW')} accessibilityLabel="Placer le Tchat en bas">
                    <Text style={[s.chatPositionText, chatVerticalPreset === 'LOW' && s.chatPositionTextOn]}>BAS</Text>
                    <Text style={s.chatPositionHint}>au-dessus des onglets</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.chatSectionLabel}>CÔTÉ DU BOUTON</Text>
                <View style={s.chatSideRow}>
                  <TouchableOpacity style={[s.chatSideButton, chatSide === 'left' && s.chatSideButtonOn]} onPress={() => chooseChatSide('left')}><Text style={[s.chatSideText, chatSide === 'left' && s.chatSideTextOn]}>GAUCHE</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.chatSideButton, chatSide === 'right' && s.chatSideButtonOn]} onPress={() => chooseChatSide('right')}><Text style={[s.chatSideText, chatSide === 'right' && s.chatSideTextOn]}>DROITE</Text></TouchableOpacity>
                </View>
                <Text style={s.drawerHint}>Fermer la messagerie remet simplement le bouton sur le bord choisi.</Text>
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              <View style={s.inboxActions}>
                <Text style={s.inboxHint}>Appuie pour ouvrir. Utilise × pour supprimer ce qui ne t’est plus utile.</Text>
                <View style={s.inboxActionButtons}>
                  <TouchableOpacity style={s.markAllButton} onPress={() => void markVisibleRead()}><Text style={s.markAllText}>TOUT LIRE</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.markAllButton, s.clearButton]} onPress={() => { void deleteVisibleSection(); }} disabled={!visibleItems.length}><Text style={s.clearText}>EFFACER</Text></TouchableOpacity>
                </View>
              </View>
              {loading && !items.length ? <Text style={s.empty}>Chargement…</Text> : null}
              {!loading && !visibleItems.length ? <View style={s.emptyCard}><Text style={s.emptyIcon}>{activeTab === 'MESSAGES' ? '💬' : '🔔'}</Text><Text style={s.emptyTitle}>{activeTab === 'MESSAGES' ? 'Aucun message' : 'Rien de nouveau'}</Text><Text style={s.empty}>{activeTab === 'MESSAGES' ? 'Tes nouveaux messages apparaîtront ici, séparés des autres notifications.' : 'Tes Battles, reprises, visites, événements et gains apparaîtront ici.'}</Text></View> : null}
              {visibleItems.map((item) => {
                const locked = isNotificationAccessLocked(item.type, currentPlan, accessRules);
                const expanded = expandedId === item.id;
                const type = String(item.type || '').toUpperCase();
                const chatAction = type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE' || type.startsWith('AGORA');
                const linkedProfileUsername = activityProfileUsername(item);
                const linkedProfileId = activityProfileId(item);
                const hasLinkedProfile = Boolean(linkedProfileUsername || linkedProfileId);
                const payoutQrUrl = String(item.data?.payoutQrUrl ?? item.data?.payout_qr_url ?? '').trim();
                const notificationImageUrl = !locked
                  ? String(item.data?.image_url ?? payoutQrUrl ?? '').trim()
                  : '';
                const isPaypalQr = String(item.data?.contentKind || item.data?.content_kind || '').toUpperCase() === 'PAYPAL_QR'
                  || Boolean(payoutQrUrl);
                return (
                  <View key={item.id} style={[s.card, !item.readAt && s.cardUnread, locked && s.cardLocked]}>
                    <TouchableOpacity onPress={() => void toggleNotification(item)} activeOpacity={0.84} accessibilityRole="button" accessibilityState={{ expanded }}>
                      <View style={s.cardTop}>
                        <View style={[s.dot, item.readAt && s.dotRead, locked && s.dotLocked]} />
                        <Text style={s.cardTitle} numberOfLines={1}>{locked ? '🔒 Notification réservée' : (item.title || 'Loki Music')}</Text>
                        <Text style={s.time}>{timeLabel(item.createdAt)}</Text>
                        <TouchableOpacity
                          style={s.deleteOne}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            void deleteOne(item);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Supprimer cette notification"
                        >
                          <Text style={s.deleteOneText}>×</Text>
                        </TouchableOpacity>
                        <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
                      </View>
                      {!locked && hasLinkedProfile ? (
                        <TouchableOpacity
                          style={s.profileDeepLink}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            void openActivityProfile(item);
                          }}
                          accessibilityRole="link"
                          accessibilityLabel={linkedProfileUsername ? `Voir le profil de ${linkedProfileUsername}` : 'Voir le profil lié à cette activité'}
                        >
                          <Text style={s.profileDeepLinkText}>{linkedProfileUsername ? `Voir @${linkedProfileUsername} ›` : 'VOIR LE PROFIL ›'}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {notificationImageUrl ? (
                        <TouchableOpacity
                          style={s.notificationMedia}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            void (chatAction ? prepareChatNotification(item) : openActivityNotification(item));
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={isPaypalQr ? 'Ouvrir le QR PayPal dans la conversation' : 'Ouvrir l’image de la notification'}
                        >
                          <Image source={{ uri: notificationImageUrl }} style={s.notificationMediaImage} resizeMode="contain" />
                          <View style={s.notificationMediaCopy}>
                            <Text style={s.notificationMediaTitle}>{isPaypalQr ? 'QR PAYPAL' : 'IMAGE'}</Text>
                            <Text style={s.notificationMediaHint}>{isPaypalQr ? 'Le QR reçu est affiché ici. Touche pour ouvrir le Tchat.' : 'Touche pour ouvrir.'}</Text>
                          </View>
                        </TouchableOpacity>
                      ) : null}
                      {expanded ? (
                        <View style={s.details}>
                          {locked ? null : (
                            <>
                              <Text style={s.body}>{item.body}</Text>
                              <Text style={s.typeLabel}>{String(item.type || '').replace(/_/g, ' ')}</Text>
                              {type === 'PROFILE_VIEW' && activityProfileUsername(item) ? (
                                <TouchableOpacity
                                  style={s.inlineProfileLink}
                                  onPress={(event) => { event.stopPropagation?.(); void openActivityProfile(item); }}
                                  accessibilityRole="link"
                                  accessibilityLabel={`Voir le profil de ${activityProfileUsername(item)}`}
                                >
                                  <Text style={s.inlineProfileLinkText}>Voir @{activityProfileUsername(item)} ›</Text>
                                </TouchableOpacity>
                              ) : null}
                              <TouchableOpacity style={s.deleteOneButton} onPress={() => deleteOne(item)} accessibilityLabel="Supprimer cette notification">
                                <Text style={s.deleteOneText}>SUPPRIMER</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      ) : null}
                    </TouchableOpacity>
                    {!locked && isNewKeepNotification(item) ? (
                      <View style={s.inlineAction}>
                        <NewKeepNotificationActions
                          notification={item}
                          onInteract={() => { if (!item.readAt) void markNotificationRead(profileId, item.id).catch(() => {}); }}
                          isFollowing={Boolean(activityProfileId(item) && followingProfileIds.has(activityProfileId(item) as string))}
                          onFollow={activityProfileId(item) && activityProfileId(item) !== profileId
                            ? () => followFromActivity(item)
                            : undefined}
                          onOpenProfile={() => { void openActivityProfile(item); }}
                        />
                      </View>
                    ) : !locked && isBuyerPaymentReady(item) ? (
                      <View style={s.paymentActionRow}>
                        <TouchableOpacity
                          style={[s.paymentActionButton, s.paymentActionPrimary]}
                          disabled={paymentBusyId === paymentIdOf(item)}
                          onPress={() => { void openPaymentCheckout(item); }}
                          accessibilityRole="button"
                          accessibilityLabel="Payer avec le QR et joindre la preuve"
                        >
                          <Text style={s.paymentActionPrimaryText}>PAYER · QR / PREUVE</Text>
                        </TouchableOpacity>
                      </View>
                    ) : !locked && isSellerPaymentAction(item) ? (
                      <>
                        <View style={s.paymentActionRow}>
                          <TouchableOpacity
                            style={[s.paymentActionButton, s.paymentActionSecondary]}
                            disabled={paymentBusyId === paymentIdOf(item)}
                            onPress={() => { void openPaymentHistory(item); }}
                            accessibilityRole="button"
                            accessibilityLabel="Voir l’historique de la transaction"
                          >
                            <Text style={s.paymentActionSecondaryText}>HISTORIQUE</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.paymentActionButton, s.paymentActionSecondary]}
                            disabled={paymentBusyId === paymentIdOf(item)}
                            onPress={() => { void openPaymentProof(item); }}
                            accessibilityRole="button"
                            accessibilityLabel="Voir la preuve de paiement"
                          >
                            <Text style={s.paymentActionSecondaryText}>VOIR LA PREUVE</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={s.paymentValidateButton}
                          disabled={paymentBusyId === paymentIdOf(item)}
                          onPress={() => confirmPaymentReceived(item)}
                          accessibilityRole="button"
                          accessibilityLabel="Valider le paiement réellement reçu"
                        >
                          <Text style={s.paymentValidateText}>{paymentBusyId === paymentIdOf(item) ? 'VALIDATION…' : 'VALIDER LE PAIEMENT'}</Text>
                        </TouchableOpacity>
                      </>
                    ) : !locked && isBuyerWaitingSeller(item) ? (
                      <View style={s.paymentActionRow}>
                        <TouchableOpacity style={[s.paymentActionButton, s.paymentActionSecondary]} onPress={() => { void openPaymentHistory(item); }}>
                          <Text style={s.paymentActionSecondaryText}>HISTORIQUE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.paymentActionButton, s.paymentActionDanger]} disabled={paymentBusyId === paymentIdOf(item)} onPress={() => reportPaymentProblem(item)}>
                          <Text style={s.paymentActionDangerText}>AUCUNE RÉPONSE</Text>
                        </TouchableOpacity>
                      </View>
                    ) : !locked ? (
                      <TouchableOpacity
                        style={[s.notificationAction, preparedChatId === item.id && s.notificationActionReady]}
                        onPress={() => { void (chatAction ? prepareChatNotification(item) : openActivityNotification(item)); }}
                        accessibilityRole="button"
                        accessibilityLabel={chatAction ? (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE' ? 'Régler le tchat' : 'Ouvrir la conversation') : activityActionLabel(item)}
                      >
                        <Text style={s.notificationActionText}>{preparedChatId === item.id ? 'OUVERTURE…' : chatAction ? (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE' ? 'RÉGLER LE TCHAT' : 'OUVRIR LA CONVERSATION') : activityActionLabel(item)}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <PayoutCheckoutSheet
            visible={Boolean(paymentCheckoutItem)}
            paymentId={paymentCheckoutItem ? (paymentIdOf(paymentCheckoutItem) ?? '') : ''}
            sellerUsername={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.sellerUsername ?? (paymentCheckoutItem.data as any)?.seller_username ?? '') : ''}
            amountCents={paymentCheckoutItem ? Number((paymentCheckoutItem.data as any)?.amountCents ?? (paymentCheckoutItem.data as any)?.amount_cents ?? 0) : 0}
            currencyCode={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.currencyCode ?? (paymentCheckoutItem.data as any)?.currency_code ?? 'EUR') : 'EUR'}
            payoutLink={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.payoutLink ?? (paymentCheckoutItem.data as any)?.payout_link ?? '') : ''}
            payoutQrUrl={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.payoutQrUrl ?? (paymentCheckoutItem.data as any)?.payout_qr_url ?? '') : ''}
            onClose={() => setPaymentCheckoutItem(null)}
            onPaid={paymentCheckoutItem ? async () => { await signalPaymentSent(paymentCheckoutItem); } : undefined}
          />

          {lockedPopup ? (
            <View style={s.lockedOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setLockedPopup(null)} accessibilityLabel="Fermer l’explication" />
              <View style={s.lockedPopupCard}>
                <View style={s.lockedPopupIcon}><Text style={s.lockedPopupIconText}>🔒</Text></View>
                <Text style={s.lockedPopupKicker}>ACCÈS LOKI</Text>
                <Text style={s.lockedPopupTitle}>Pourquoi cette notification est verrouillée</Text>
                <Text style={s.lockedPopupBody}>Cette notification fait partie des alertes que le Super Admin a réservées à une formule spécifique. Son contenu reste masqué tant qu’elle n’est pas débloquée.</Text>
                <View style={s.lockedPopupPlan}><Text style={s.lockedPopupPlanText}>Disponible avec {lockedPopup.plan}</Text></View>
                <Text style={s.lockedPopupHint}>Tu restes dans tes notifications. Aucun changement d’écran et aucun contenu privé n’est affiché avant déblocage.</Text>
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
  eyebrow:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:1.4},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:2},
  headerHint:{color:colors.textMutedGrey,fontSize:11,marginTop:3},
  close:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  closeText:{color:colors.textPrimary,fontSize:26,lineHeight:28,fontWeight:'700'},
  tabs:{flexDirection:'row',gap:6,paddingHorizontal:12,paddingTop:14,paddingBottom:10},
  tab:{flex:1,minHeight:52,borderRadius:15,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundElevated,paddingHorizontal:4},
  tabOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  tabUnread:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',shadowColor:colors.keep,shadowOpacity:.35,shadowRadius:7,shadowOffset:{width:0,height:0},elevation:4},
  tabTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  tabText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900',letterSpacing:.5},
  tabTextOn:{color:colors.primaryLight},
  tabTextUnread:{color:colors.keep},
  tabBadge:{minWidth:18,height:18,paddingHorizontal:5,borderRadius:9,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},
  tabBadgeText:{color:colors.background,fontSize:11,fontWeight:'900'},
  tabBadgeQuiet:{backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},
  tabBadgeTextQuiet:{color:colors.textMutedGrey},
  tabHint:{color:colors.textMuted,fontSize:11,fontWeight:'700',marginTop:2},
  tabHintUnread:{color:colors.keep,fontWeight:'900'},
  settingsList:{paddingHorizontal:16,paddingBottom:36,gap:10},
  notificationMaster:{minHeight:76,padding:12,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:12},
  notificationMasterCopy:{flex:1,minWidth:0},
  inboxActions:{minHeight:44,flexDirection:'row',alignItems:'center',gap:8},
  inboxHint:{flex:1,color:colors.textMutedGrey,fontSize:11,lineHeight:13,fontWeight:'700'},
  inboxActionButtons:{flexDirection:'row',alignItems:'center',gap:6},
  clearButton:{borderColor:colors.danger,backgroundColor:'rgba(255,95,109,.08)'},
  clearText:{color:colors.danger,fontSize:11,fontWeight:'900'},
  markAllButton:{minHeight:44,paddingHorizontal:11,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint},
  markAllText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  clearSectionButton:{minHeight:44,paddingHorizontal:11,borderRadius:17,borderWidth:1,borderColor:colors.danger,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,91,107,.08)'},
  clearSectionText:{color:colors.danger,fontSize:11,fontWeight:'900',letterSpacing:.5},
  deleteOne:{width:44,height:44,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  deleteOneButton:{alignSelf:'flex-start',minHeight:44,paddingHorizontal:10,borderRadius:15,borderWidth:1,borderColor:colors.danger,alignItems:'center',justifyContent:'center',marginTop:8},
  deleteOneText:{color:colors.danger,fontSize:11,fontWeight:'900',letterSpacing:.5},
  chatAccordion:{marginBottom:10,padding:12,borderRadius:18,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},
  chatAccordionHead:{flexDirection:'row',alignItems:'flex-start',gap:8},
  chatEyebrow:{color:colors.keep,fontSize:11,fontWeight:'900',letterSpacing:1.1},
  chatTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:2},
  chatHint:{color:colors.textMutedGrey,fontSize:11,lineHeight:14,marginTop:4},
  chatSwitchRow:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderTopColor:colors.border,marginTop:8},
  chatSwitchLabel:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  chatSwitchHint:{color:colors.textMutedGrey,fontSize:11.5,lineHeight:12,marginTop:2},
  chatSectionLabel:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900',letterSpacing:.8,marginTop:8,marginBottom:6},
  chatSurfaceGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  chatSurfaceChip:{minHeight:44,paddingHorizontal:9,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  chatSurfaceChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  chatSurfaceChipText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900'},
  chatSurfaceChipTextOn:{color:colors.primaryLight},
  chatPositionRow:{flexDirection:'row',gap:6},
  chatPositionButton:{flex:1,minHeight:48,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center',paddingHorizontal:4},
  chatPositionButtonOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  chatPositionText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900',letterSpacing:.4},
  chatPositionTextOn:{color:colors.primaryLight},
  chatPositionHint:{color:colors.textMutedGrey,fontSize:11,lineHeight:10,fontWeight:'700',textAlign:'center',marginTop:2},
  chatAnchorRow:{gap:6,marginBottom:5},
  chatAnchorButton:{minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:8},
  chatAnchorIcon:{fontSize:15},
  chatAnchorText:{color:colors.textPrimary,fontSize:11.5,fontWeight:'900'},
  chatSideRow:{flexDirection:'row',gap:7},
  chatSideButton:{flex:1,minHeight:44,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  chatSideButtonOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)'},
  chatSideText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900'},
  chatSideTextOn:{color:colors.keep},
  drawerHint:{color:colors.keep,fontSize:11,lineHeight:14,fontWeight:'800',marginTop:10},
  list:{padding:16,paddingTop:6,paddingBottom:36,gap:9},
  card:{padding:12,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated},
  cardUnread:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  cardLocked:{borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},
  cardTop:{flexDirection:'row',alignItems:'center',gap:7},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.keep},
  dotRead:{backgroundColor:colors.textMuted},
  dotLocked:{backgroundColor:colors.primaryLight},
  cardTitle:{flex:1,minWidth:0,color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  time:{color:colors.textMuted,fontSize:11,fontWeight:'700'},
  chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  details:{paddingTop:8,marginTop:7,borderTopWidth:1,borderTopColor:colors.border},
  body:{color:colors.textMutedGrey,fontSize:12,lineHeight:18},
  typeLabel:{color:colors.textMuted,fontSize:11,fontWeight:'900',letterSpacing:.7,marginTop:7},
  lockedDetails:{borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,padding:10},
  lockedPlan:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:.4},
  lockedBody:{color:colors.textPrimary,fontSize:11,lineHeight:17,marginTop:5,fontWeight:'800'},
  lockedHint:{color:colors.textMutedGrey,fontSize:11,lineHeight:14,marginTop:6},
  inlineProfileLink:{alignSelf:'flex-start',marginTop:8,paddingVertical:5,paddingHorizontal:2},
  inlineProfileLinkText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  profileDeepLink:{alignSelf:'flex-start',minHeight:44,marginTop:4,marginLeft:28,marginRight:12,paddingHorizontal:8,justifyContent:'center'},
  profileDeepLinkText:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  notificationMedia:{marginHorizontal:12,marginTop:8,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  notificationMediaImage:{width:78,height:78,borderRadius:12,backgroundColor:'#FFFFFF'},
  notificationMediaCopy:{flex:1,minWidth:0},
  notificationMediaTitle:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:.8},
  notificationMediaHint:{color:colors.textMutedGrey,fontSize:11,lineHeight:14,marginTop:4},
  notificationAction:{minHeight:44,borderRadius:19,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:8,marginHorizontal:12,marginBottom:10},
  inlineAction:{paddingHorizontal:12,paddingBottom:10},
  notificationActionReady:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.14)'},
  notificationActionText:{color:'#FFF',fontSize:11,fontWeight:'900'},
  paymentActionRow:{flexDirection:'row',gap:7,marginTop:8,marginHorizontal:12,marginBottom:4},
  paymentActionButton:{flex:1,minHeight:44,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:7},
  paymentActionPrimary:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.14)'},
  paymentActionSecondary:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  paymentActionDanger:{borderColor:colors.danger,backgroundColor:'rgba(255,92,114,.08)'},
  paymentActionPrimaryText:{color:colors.keep,fontSize:11,fontWeight:'900',textAlign:'center'},
  paymentActionSecondaryText:{color:colors.primaryLight,fontSize:11,fontWeight:'900',textAlign:'center'},
  paymentActionDangerText:{color:colors.danger,fontSize:11,fontWeight:'900',textAlign:'center'},
  paymentValidateButton:{minHeight:44,borderRadius:14,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center',marginHorizontal:12,marginTop:4,marginBottom:10},
  paymentValidateText:{color:colors.background,fontSize:11.5,fontWeight:'900',letterSpacing:.4},
  lockedOverlay:{...StyleSheet.absoluteFillObject,zIndex:60,elevation:60,backgroundColor:'rgba(4,2,9,.72)',alignItems:'center',justifyContent:'center',padding:18},
  lockedPopupCard:{width:'100%',maxWidth:330,borderRadius:24,borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:18,alignItems:'center',shadowColor:'#000',shadowOpacity:.42,shadowRadius:20,shadowOffset:{width:0,height:10}},
  lockedPopupIcon:{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},
  lockedPopupIconText:{fontSize:24},
  lockedPopupKicker:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:1.2,marginTop:10},
  lockedPopupTitle:{color:colors.textPrimary,fontSize:17,fontWeight:'900',textAlign:'center',marginTop:4},
  lockedPopupBody:{color:colors.textMutedGrey,fontSize:11,lineHeight:17,textAlign:'center',marginTop:8},
  lockedPopupPlan:{minHeight:44,borderRadius:20,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)',alignItems:'center',justifyContent:'center',paddingHorizontal:16,marginTop:12},
  lockedPopupPlanText:{color:colors.keep,fontSize:11,fontWeight:'900'},
  lockedPopupHint:{color:colors.textMutedGrey,fontSize:11.5,lineHeight:15,textAlign:'center',marginTop:10},
  lockedPopupClose:{width:'100%',minHeight:44,borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},
  lockedPopupCloseText:{color:'#FFF',fontSize:11,fontWeight:'900'},
  emptyCard:{padding:20,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center'},
  emptyIcon:{fontSize:28,marginBottom:8},
  emptyTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginBottom:4},
  empty:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,textAlign:'center'},
});
