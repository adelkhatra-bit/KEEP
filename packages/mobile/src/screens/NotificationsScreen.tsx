import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Linking, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import {
  KeepNotification,
  NotificationPreferences,
  dedupeNotifications,
  deleteAllNotifications,
  deleteNotification,
  deleteNotificationDuplicates,
  notificationSemanticKey,
  loadNotifications,
  loadNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  subscribeToNotifications,
} from '../services/notificationService';
import { spacing, radius, typography } from '../theme/spacing';
import { colors } from '../theme/colors';
import { loadCurrentPlanCode } from '../services/planService';
import { isNotificationAccessLocked, loadNotificationAccessRules, notificationAccessRequiredPlan, notificationPlanLabel, type NotificationAccessRule } from '../services/notificationAccessService';
import { EventRsvpStatus, loadMyRsvps, setEventRsvp, loadEventById, CreatorEvent } from '../services/creatorEventService';
import { createProfileService } from '../services/profileService';
import { stageGuestProfileForUpgrade } from '../services/guestUpgradeService';
import { supabase } from '../services/supabaseClient';
import { cancelPlaylistSalePayment, loadPlaylistSalePaymentGuardStatus, markPlaylistSaleBuyerPaid, markPlaylistSalePaid, reportPlaylistSalePaymentProblem } from '../services/playlistSaleService';
import { syncMarketplaceDelivery } from '../services/musicProviderSyncService';
import { acceptMarketplacePaymentTerms, extractMusicAgoraPayoutQrUrl, loadMusicAgoraSettings, saveMusicAgoraSettings, MusicAgoraSurface } from '../services/musicAgoraService';
import { useGlobalChatStore } from '../store/useGlobalChatStore';
import PayoutCheckoutSheet from '../components/PayoutCheckoutSheet';
import { openPlaylistPaymentProof } from '../services/playlistPaymentProofService';
import NewKeepNotificationActions from '../components/NewKeepNotificationActions';
import { getPushPermissionState, type PushPermissionState } from '../services/pushNotificationService';
import { isNewKeepNotification, maskedNewKeepCopy } from '../services/newKeepNotification';
import KeepModal from '../components/KeepModal';

// Demande d'Adel (31/08/2026) : pouvoir taper une notification (nouvel
// abonné, désabonnement, morceau repris, nouveau morceau d'un abonnement)
// pour aller directement sur le profil de la personne concernée. Le nom
// du champ change selon le type de notification (héritage de plusieurs
// migrations écrites séparément) -- on vérifie donc toutes les variantes
// connues plutôt que de supposer un seul nom de champ.
function notificationProfileUsername(item: KeepNotification): string | null {
  const data = item.data as Record<string, unknown> | null;
  if (!data) return null;
  const candidate = data.username
    ?? data.actorUsername ?? data.actor_username
    ?? data.viewerUsername ?? data.viewer_username
    ?? data.requesterUsername ?? data.requester_username
    ?? data.followerUsername ?? data.follower_username
    ?? data.sellerUsername ?? data.seller_username
    ?? data.inviterUsername ?? data.inviter_username
    ?? data.referrerUsername ?? data.referrer_username
    ?? data.originUsername ?? data.origin_username;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().replace(/^@+/, '') : null;
}

function notificationProfileId(item: KeepNotification): string | null {
  const data = item.data as Record<string, unknown> | null;
  if (!data) return null;
  const candidate = data.actorId ?? data.actor_id
    ?? data.viewerId ?? data.viewer_id
    ?? data.requesterId ?? data.requester_id
    ?? data.followerId ?? data.follower_id
    ?? data.sellerId ?? data.seller_id
    ?? data.referrerId ?? data.referrer_id
    ?? data.sourceProfileId ?? data.source_profile_id
    ?? data.originProfileId ?? data.origin_profile_id
    ?? data.ownerProfileId ?? data.owner_profile_id;
  return typeof candidate === 'string' && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null;
}

async function resolveNotificationProfileUsername(item: KeepNotification): Promise<string | null> {
  const direct = notificationProfileUsername(item);
  if (direct) return direct;
  const profileId = notificationProfileId(item);
  if (!profileId || !supabase) return null;
  const { data } = await supabase.from('profiles').select('username').eq('id', profileId).maybeSingle();
  const username = String((data as any)?.username || '').trim();
  return username ? username.replace(/^@+/, '') : null;
}

const CHAT_SURFACE_OPTIONS: { key: MusicAgoraSurface; label: string }[] = [
  { key: 'LISTEN', label: 'Écouter' },
  { key: 'DISCOVER', label: 'Découvertes' },
  { key: 'PLAYLISTS', label: 'Playlists' },
  { key: 'PARTIES', label: 'Soirées' },
  { key: 'PROFILE', label: 'Profil' },
  { key: 'NOTIFICATIONS', label: 'Notifications' },
];

function giftedPlanBenefits(item: KeepNotification): string[] {
  const raw = item.data?.benefits;
  if (Array.isArray(raw)) {
    const values = raw.map((value) => String(value || '').trim()).filter(Boolean);
    if (values.length) return values;
  }
  const monthlyFree = Number(item.data?.monthly_free ?? 0);
  const dailySolos = Number(item.data?.daily_solos ?? 0);
  const values: string[] = [];
  if (monthlyFree > 0) values.push(`${monthlyFree} Free offerts chaque mois`);
  if (dailySolos > 0) values.push(`${dailySolos} Solos par jour`);
  if (item.data?.paid_battle_access) values.push('Battle sans débit de Free');
  return values;
}

function notificationTypeLabel(type: string) {
  const key = type.trim().toUpperCase();
  if (key === 'PROFILE_VIEW') return 'VISITE DE PROFIL';
  if (key === 'NEW_FOLLOWER') return 'NOUVEL ABONNÉ';
  if (key === 'FOLLOWER_LEFT') return 'DÉSABONNEMENT';
  if (key === 'NEW_PUBLIC_KEEP') return 'NOUVEAU MORCEAU';
  if (key === 'MUSIC_TAKEN') return 'MORCEAU REPRIS';
  if (key === 'SOCIAL_REQUEST') return 'RÉSEAU SOCIAL';
  if (key === 'PLAN_GIFTED') return 'ABONNEMENT';
  if (key === 'MONTHLY_FREE_CREDIT') return 'FREE DU MOIS';
  if (key === 'REFERRAL_FRIEND_READY') return 'TON CONTACT';
  if (key === 'PLAYLIST_SALE_PAYMENT_READY') return 'PAIEMENT À FAIRE';
  if (key === 'PLAYLIST_SALE_WAITING_SELLER') return 'EN ATTENTE DU VENDEUR';
  if (key === 'PLAYLIST_SALE_BUYER_PAID') return 'PAIEMENT SIGNALÉ';
  if (key === 'PLAYLIST_SALE_PAYMENT_REMINDER') return 'PAIEMENT À CONFIRMER';
  if (key === 'PLAYLIST_SALE_DELIVERED') return 'SÉLECTION DÉBLOQUÉE';
  if (key === 'PLAYLIST_SALE_COMPLETED') return 'VENTE TERMINÉE';
  if (key === 'PLAYLIST_SALE_CANCELLED') return 'TRANSACTION ANNULÉE';
  if (key === 'LOKI_PULSE_NEW') return 'LOKI PULSE';
  if (key === 'ADMIN_USER_REPORT') return 'SIGNALEMENT';
  if (key === 'AGORA_GROUP_INVITE') return 'INVITATION GROUPE';
  if (key === 'AGORA_GROUP_REMOVED' || key === 'AGORA_GROUP_DELETED' || key === 'AGORA_GROUP_MEMBER_LEFT') return 'GROUPE';
  if (key === 'CHAT_ACTIVATION_AVAILABLE' || key === 'AGORA_ACTIVATE') return 'ACTIVE TON CHAT';
  if (key === 'BATTLE_CHALLENGE' || key === 'KEEP_BATTLE_CHALLENGE' || key === 'BATTLE_INVITE' || key === 'KEEP_BATTLE_INVITE') return 'INVITATION BATTLE';
  if (key === 'SOLO_RANK_UP' || key === 'BATTLE_SOLO_RANK_CHANGED') return 'CLASSEMENT SOLO';
  // Adel (08/09/2026) : "je veux pas qu'il y ait marque invitation soiree ...
  // ca peut etre une invitation pour une soiree, ca peut etre un evenement,
  // une porte ouverte, ca peut etre 1000 choses en meme temps" -- libelle
  // generique, jamais fige sur "soiree".
  if (key === 'EVENT_INVITE') return 'INVITATION';
  if (key === 'EVENT_REMINDER') return 'RAPPEL';
  // Adel (08/09/2026) : "il recoit une notification quand c'est approuve"
  // -- statut de moderation de son propre evenement.
  if (key === 'EVENT_APPROVED') return 'ÉVÉNEMENT APPROUVÉ';
  if (key === 'EVENT_REJECTED') return 'ÉVÉNEMENT REFUSÉ';
  if (key === 'EVENT_FIELD_REJECTED') return 'À CORRIGER';
  if (key === 'ADMIN_BROADCAST') return 'MESSAGE Loki Music';
  return key.replace(/_/g, ' ');
}

export default function NotificationsScreen({ navigation, route }: any) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [items, setItems] = useState<KeepNotification[]>([]);
  // Règle d'Adel (05/10/2026) : jamais plus de 2 lignes de texte, sinon « En savoir plus ».
  const [expandedNotificationIds, setExpandedNotificationIds] = useState<Set<string>>(() => new Set());
  const toggleNotificationExpanded = (id: string) => setExpandedNotificationIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [prefs, setPrefs] = useState<NotificationPreferences>({ systemEnabled: true, djEnabled: true, socialEnabled: true, marketingEnabled: false, eventsEnabled: true, moneyEnabled: true, battleEnabled: true, musicEnabled: true, moneySound: 'MONEY', socialSound: 'DEFAULT', battleSound: 'DEFAULT', musicSound: 'DEFAULT', eventsSound: 'DEFAULT' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [paymentCheckoutItem, setPaymentCheckoutItem] = useState<KeepNotification | null>(null);
  const [genericDetailItem, setGenericDetailItem] = useState<KeepNotification | null>(null);
  const [genericDetailProfileUsername, setGenericDetailProfileUsername] = useState<string | null>(null);
  const [followingProfileIds, setFollowingProfileIds] = useState<Set<string>>(new Set());
  const [followBusyProfileId, setFollowBusyProfileId] = useState<string | null>(null);
  const handledFocusNotificationId = useRef<string>('');
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [chatSurfaces, setChatSurfaces] = useState<MusicAgoraSurface[]>(['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);
  const autoReadInFlight = useRef(false);
  // Adel (08/09/2026) : "comme tu as fait pour les matchs ... trois petits
  // boutons en dessous bien aligné, je ne participe pas, je répondrai plus
  // tard ou je participe" -- l'infrastructure RSVP (event_rsvps,
  // GOING/MAYBE/NOT_GOING) existe déjà côté serveur depuis event.broadcast,
  // il ne restait que l'affichage/l'action ici.
  const [eventRsvps, setEventRsvps] = useState<Record<string, EventRsvpStatus>>({});
  const [rsvpBusyId, setRsvpBusyId] = useState<string | null>(null);
  // Adel (08/09/2026) : "un bouton en savoir plus ... avoir quelques images
  // de l'evenement ... un popup" -- detail complet et A JOUR (jamais le
  // texte fige de la notification) charge a la demande, avec les memes
  // boutons de reponse repris a l'identique dans le popup.
  const [detailItem, setDetailItem] = useState<KeepNotification | null>(null);
  const [detailEvent, setDetailEvent] = useState<CreatorEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Confort d'abonnement : Free garde les offres ciblées actives ;
  // Premium / Creator Pro / Venue Pro peuvent les masquer.
  const [planCode, setPlanCode] = useState('FREE');
  const marketingLocked = planCode === 'FREE';
  const [notificationAccessRules, setNotificationAccessRules] = useState<NotificationAccessRule[]>([]);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>('unavailable');
  const giftPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const hasUnreadGift = items.some((item) => item.type === 'PLAN_GIFTED' && !item.readAt);
    if (!hasUnreadGift) {
      giftPulse.setValue(0);
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(giftPulse, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(giftPulse, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.timing(giftPulse, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(giftPulse, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [giftPulse, items]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    loadCurrentPlanCode(user.id).then((code) => { if (live) setPlanCode(code || 'FREE'); }).catch(() => {});
    return () => { live = false; };
  }, [user?.id]);
  useEffect(() => {
    let live = true;
    loadNotificationAccessRules().then((rules) => { if (live) setNotificationAccessRules(rules); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    const refreshPermission = () => {
      void getPushPermissionState().then((status) => { if (live) setPushPermission(status); });
    };
    refreshPermission();
    const unsubscribe = navigation?.addListener?.('focus', refreshPermission);
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);
  useEffect(() => {
    if (!user || isLocalGuest || isDemoMode) {
      setChatEnabled(false);
      return;
    }
    let live = true;
    loadMusicAgoraSettings().then((settings) => {
      if (!live) return;
      setChatEnabled(settings.homeEnabled);
      setChatNotificationsEnabled(settings.notificationsEnabled);
      setChatSurfaces(settings.surfaces);
    }).catch(() => {});
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);
  const refresh = async () => {
    if (!user) return;
    try {
      const [notifications, preferences, rsvps] = await Promise.all([
        loadNotifications(user.id),
        loadNotificationPreferences(user.id),
        loadMyRsvps(user.id).catch(() => ({})),
      ]);
      setItems(notifications);
      setPrefs(preferences);
      setEventRsvps(rsvps);
      setError(null);
    } catch {
      setError('Impossible de charger les notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!user) return undefined;

    const run = async () => {
      try {
        const [notifications, preferences, rsvps] = await Promise.all([
          loadNotifications(user.id),
          loadNotificationPreferences(user.id),
          loadMyRsvps(user.id).catch(() => ({})),
        ]);
        if (!cancelled) {
          setItems(notifications);
          setPrefs(preferences);
          setEventRsvps(rsvps);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger les notifications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const unsubscribeFocus = navigation?.addListener?.('focus', () => { void refresh(); });
    const unsubscribeRealtime = subscribeToNotifications(user.id, (notification) => {
      if (cancelled) return;
      // Même règle que la bannière globale : une seule occurrence visuelle
      // par événement métier, y compris si deux INSERT distincts arrivent.
      setItems((current) => dedupeNotifications([notification, ...current.filter((item) => item.id !== notification.id)]));
    });

    return () => {
      cancelled = true;
      unsubscribeFocus?.();
      unsubscribeRealtime();
    };
  }, [navigation, user?.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 1800);
    return () => clearTimeout(timer);
  }, [notice]);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  // Une seule requête pour tous les profils concernés par les notifications
  // "Nouveau morceau" : scalable même avec un grand centre de notifications.
  useEffect(() => {
    if (!user || !supabase || isLocalGuest || isDemoMode) {
      setFollowingProfileIds(new Set());
      return;
    }
    const ownerIds = Array.from(new Set(
      items
        .filter((item) => isNewKeepNotification(item))
        .map((item) => notificationProfileId(item))
        .filter((id): id is string => Boolean(id && id !== user.id)),
    ));
    if (!ownerIds.length) {
      setFollowingProfileIds(new Set());
      return;
    }
    let live = true;
    void Promise.resolve(supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', user.id)
      .in('followee_id', ownerIds))
      .then(({ data }) => {
        if (!live) return;
        setFollowingProfileIds(new Set((data ?? []).map((row: any) => String(row.followee_id))));
      })
      .catch(() => { if (live) setFollowingProfileIds(new Set()); });
    return () => { live = false; };
  }, [items, user?.id, isLocalGuest, isDemoMode]);

  // Ouvrir ce centre = les notifications ont été regardées. Une courte
  // temporisation laisse les cartes non lues visibles avant de remettre le
  // compteur global à zéro, sans imposer un second bouton.
  useEffect(() => {
    if (loading || !user || unread <= 0 || autoReadInFlight.current) return undefined;
    const timer = setTimeout(() => {
      if (autoReadInFlight.current) return;
      autoReadInFlight.current = true;
      const now = new Date().toISOString();
      void markAllNotificationsRead(user.id)
        .then(() => setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now }))))
        .catch(() => {})
        .finally(() => { autoReadInFlight.current = false; });
    }, 900);
    return () => clearTimeout(timer);
  }, [loading, unread, user?.id]);

  const updateProfileVisibility = async (value: boolean) => {
    if (!user || visibilitySaving) return;
    const previous = user;
    const nextUser = { ...user, isPublic: value };
    setUser(nextUser);
    setVisibilitySaving(true);
    try {
      if (isDemoMode) {
        setNotice(value ? 'Profil visible en mode démo' : 'Profil masqué en mode démo');
      } else if (isLocalGuest || !supabase) {
        await stageGuestProfileForUpgrade(nextUser);
        setNotice(value ? 'Profil visible sur cet appareil' : 'Profil privé sur cet appareil');
      } else {
        await createProfileService(supabase).saveOwnProfile(nextUser);
        setNotice(value ? 'Ton profil est maintenant visible' : 'Ton profil est maintenant privé');
      }
    } catch {
      setUser(previous);
      setError('Impossible de modifier la visibilité du profil pour le moment.');
    } finally {
      setVisibilitySaving(false);
    }
  };

  const persistChatSettings = async (
    enabled: boolean,
    surfaces: MusicAgoraSurface[],
    notifications = chatNotificationsEnabled,
  ) => {
    if (!user || isLocalGuest || isDemoMode || chatSaving) {
      if (isLocalGuest || isDemoMode) setNotice('Connecte ton compte pour activer le Tchat Loki');
      return;
    }
    const previousEnabled = chatEnabled;
    const previousSurfaces = chatSurfaces;
    setChatEnabled(enabled);
    setChatSurfaces(surfaces);
    setChatSaving(true);
    try {
      const settings = await saveMusicAgoraSettings(enabled, notifications, surfaces);
      setChatEnabled(settings.homeEnabled);
      setChatNotificationsEnabled(settings.notificationsEnabled);
      setChatSurfaces(settings.surfaces);
      setNotice(settings.homeEnabled ? 'Tchat Loki activé sur les écrans choisis' : 'Tchat Loki désactivé');
    } catch {
      setChatEnabled(previousEnabled);
      setChatSurfaces(previousSurfaces);
      setError('Impossible de modifier le Tchat pour le moment.');
    } finally {
      setChatSaving(false);
    }
  };

  const updateChatEnabled = async (value: boolean) => {
    await persistChatSettings(value, chatSurfaces);
  };

  const toggleChatSurface = async (surface: MusicAgoraSurface) => {
    const next = chatSurfaces.includes(surface)
      ? chatSurfaces.filter((item) => item !== surface)
      : [...chatSurfaces, surface];
    await persistChatSettings(chatEnabled || next.length > 0, next.length ? next : ['PROFILE']);
  };

  const updatePrefs = async (patch: Partial<NotificationPreferences>) => {
    if (!user) return;
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await saveNotificationPreferences(user.id, next);
      setNotice('Préférence enregistrée');
      setError(null);
    } catch {
      setPrefs(previous);
      setError('Impossible d’enregistrer les préférences.');
    }
  };

  const followFromNotification = async (item: KeepNotification) => {
    if (!user || !supabase || followBusyProfileId) return;
    const targetId = notificationProfileId(item);
    if (!targetId || targetId === user.id || followingProfileIds.has(targetId)) return;
    setFollowBusyProfileId(targetId);
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: targetId });
      if (error) {
        if (String(error.message || '').includes('FOLLOW_LIMIT')) {
          setError('Ton offre actuelle limite le nombre de profils suivis.');
          return;
        }
        throw error;
      }
      setFollowingProfileIds((current) => new Set(current).add(targetId));
      setNotice('Abonnement activé · ses prochaines pépites pourront t’être signalées');
      await readOne(item);
    } catch {
      setError('Impossible de s’abonner à ce profil pour le moment.');
      throw new Error('FOLLOW_FAILED');
    } finally {
      setFollowBusyProfileId(null);
    }
  };

  const readOne = async (item: KeepNotification) => {
    if (!user || item.readAt) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => n.id === item.id ? { ...n, readAt: now } : n));
    try {
      await markNotificationRead(user.id, item.id);
      setError(null);
    } catch {
      setItems((current) => current.map((n) => n.id === item.id ? { ...n, readAt: item.readAt } : n));
      setError('Impossible de marquer cette notification comme lue.');
    }
  };

  const isBattleInvite = (item: KeepNotification) => {
    const type = String(item.type || '').toUpperCase();
    return ['BATTLE_CHALLENGE', 'KEEP_BATTLE_CHALLENGE', 'BATTLE_INVITE', 'KEEP_BATTLE_INVITE'].includes(type)
      || Boolean(item.data?.challengeId);
  };

  const battleTheme = (item: KeepNotification) => String(item.data?.themeCode || 'MIX').replace(/_/g, ' ');

  // Adel (08/09/2026) : "est-ce que je peux la faire uniquement en
  // notification ou avec les boutons ... l'utilisateur puisse cocher" --
  // l'organisateur choisit a l'envoi (includeRsvpButtons) ; ce champ n'est
  // present dans data QUE si les boutons ont ete inclus, donc on se base
  // dessus plutot que sur le seul type.
  const isEventInvite = (item: KeepNotification) => String(item.type || '').toUpperCase() === 'EVENT_INVITE' && Array.isArray(item.data?.response_options);
  const eventIdOf = (item: KeepNotification) => {
    const raw = item.data?.event_id ?? item.data?.eventId;
    return typeof raw === 'string' && raw ? raw : null;
  };

  const chooseEventRsvp = async (item: KeepNotification, status: EventRsvpStatus) => {
    const eventId = eventIdOf(item);
    if (!user || !eventId || rsvpBusyId) return;
    setRsvpBusyId(item.id);
    const previous = eventRsvps[eventId];
    setEventRsvps((current) => ({ ...current, [eventId]: status }));
    void readOne(item);
    try {
      await setEventRsvp(user.id, eventId, status);
    } catch {
      setEventRsvps((current) => {
        const next = { ...current };
        if (previous) next[eventId] = previous; else delete next[eventId];
        return next;
      });
      setError('Impossible d’enregistrer ta réponse pour le moment.');
    } finally {
      setRsvpBusyId(null);
    }
  };

  const openEventDetail = async (item: KeepNotification) => {
    const eventId = eventIdOf(item);
    if (!eventId) return;
    void readOne(item);
    setDetailItem(item);
    setDetailEvent(null);
    setDetailLoading(true);
    try {
      setDetailEvent(await loadEventById(eventId));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeEventDetail = () => { setDetailItem(null); setDetailEvent(null); };

  const paymentIdOf = (item: KeepNotification) => {
    const raw = item.data?.paymentId ?? item.data?.payment_id;
    return typeof raw === 'string' && raw ? raw : null;
  };
  const isBuyerPaymentReady = (item: KeepNotification) => String(item.type || '').toUpperCase() === 'PLAYLIST_SALE_PAYMENT_READY' && Boolean(paymentIdOf(item));
  const isSellerPaymentAction = (item: KeepNotification) => ['PLAYLIST_SALE_BUYER_PAID','PLAYLIST_SALE_PAYMENT_REMINDER'].includes(String(item.type || '').toUpperCase()) && Boolean(paymentIdOf(item));
  const isBuyerWaitingSeller = (item: KeepNotification) => String(item.type || '').toUpperCase() === 'PLAYLIST_SALE_WAITING_SELLER' && Boolean(paymentIdOf(item));

  const isSensitivePaymentNotification = (item: KeepNotification): boolean => {
    const type = String(item.type || '').trim().toUpperCase();
    const event = String(item.data?.event || '').trim().toUpperCase();
    const contentKind = String(item.data?.contentKind ?? item.data?.content_kind ?? '').trim().toUpperCase();
    return contentKind === 'PAYPAL_QR'
      || Boolean(item.data?.payoutQrUrl ?? item.data?.payout_qr_url)
      || type === 'AGORA_MUSIC_OFFER'
      || event === 'AGORA_MUSIC_OFFER'
      || type.startsWith('PLAYLIST_SALE_');
  };

  const pendingPaymentWarning = async (item: KeepNotification): Promise<string | null> => {
    const paymentId = paymentIdOf(item);
    if (!paymentId) {
      return isSensitivePaymentNotification(item)
        ? 'ATTENTION : cette notification contient un QR PayPal, une Pépite ou une information de transaction qui peut encore être utile.'
        : null;
    }
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
  };

  const notificationPrimaryActionLabel = (item: KeepNotification): string | null => {
    const type = String(item.type || '').toUpperCase();
    if (isNewKeepNotification(item) || isEventInvite(item) || isBuyerPaymentReady(item) || isSellerPaymentAction(item)) return null;
    if (type.startsWith('AGORA')) return 'OUVRIR LE TCHAT';
    if (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE') return 'RÉGLER LE TCHAT';
    if (type.startsWith('FREE_') || type === 'MONTHLY_FREE_CREDIT') return 'VOIR MES FREE';
    if (type === 'LOKI_PULSE_NEW') return 'OUVRIR MON PULSE';
    if (type.includes('BATTLE')) return 'OUVRIR BATTLE';
    if (type === 'PLAYLIST_SALE_DELIVERED') return 'OUVRIR LA COLLECTION';
    if (['PLAYLIST_SALE_PARTIAL_OFFER','PLAYLIST_SALE_NEW_OFFER','PLAYLIST_SALE_OFFER_CREATED'].includes(type)) return 'VOIR LA PÉPITE';
    if (type === 'PLAYLIST_SALE_COMPLETED') return 'GÉRER LA PÉPITE';
    if (type === 'PLAN_GIFTED' || type.includes('PLAN')) return 'VOIR MON OFFRE';
    if (eventIdOf(item)) return 'VOIR L’ÉVÉNEMENT';
    const profileUsername = notificationProfileUsername(item);
    // Les notifications liées à un profil affichent leurs actions directement
    // sous la carte : pas de bouton intermédiaire "OUVRIR ICI".
    if (profileUsername || notificationProfileId(item)) return null;
    return 'LIRE EN ENTIER';
  };

  const openPaymentFromNotification = async (item: KeepNotification) => {
    if (Platform.OS !== 'web') {
      await readOne(item);
      setPaymentCheckoutItem(null);
      setError('Le déblocage en euros est disponible sur la version web de Loki Music. Sur mobile, tu peux écouter les aperçus et utiliser les FREE.');
      return;
    }
    const data = item.data as Record<string, unknown> | null;
    const payoutLink = typeof data?.payoutLink === 'string' ? data.payoutLink.trim() : '';
    const payoutQrUrl = typeof data?.payoutQrUrl === 'string'
      ? data.payoutQrUrl.trim()
      : typeof data?.payout_qr_url === 'string'
        ? data.payout_qr_url.trim()
        : '';
    if (!payoutLink && !payoutQrUrl) {
      setError('Le propriétaire de la collection n’a plus de PayPal.Me ni de QR PayPal disponible.');
      return;
    }
    await readOne(item);
    setPaymentCheckoutItem(item);
    setError(null);
  };

  const signalPlaylistPaymentSent = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    setPaymentBusyId(paymentId);
    try {
      const result = await markPlaylistSaleBuyerPaid(paymentId);
      await readOne(item);
      if (result.alreadyDelivered) {
        setNotice('Cette sélection est déjà débloquée');
      } else {
        setNotice('Paiement signalé au propriétaire');
      }
      await refresh();
    } catch {
      setError('Impossible de signaler le paiement pour le moment.');
    } finally {
      setPaymentBusyId(null);
    }
  };

  const openPlaylistPaymentProofFromNotification = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId) return;
    try {
      const url = await openPlaylistPaymentProof(paymentId);
      await Linking.openURL(url);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Impossible d’ouvrir la preuve de paiement.');
    }
  };

  const openPlaylistPaymentHistoryFromNotification = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId) return;
    const data = item.data as Record<string, unknown> | null;
    const offerId = String(data?.offerId ?? data?.offer_id ?? '').trim();
    const playlistName = String(data?.playlistName ?? data?.playlist_name ?? '').trim();
    await readOne(item);
    navigation.navigate('PlaylistSale', {
      manageSaleOfferId: offerId || undefined,
      manageSaleOfferName: playlistName || undefined,
      focusPaymentId: paymentId,
      openPaymentHistory: true,
      source: 'NOTIFICATION_PAYMENT',
    });
  };

  const cancelPlaylistPayment = (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    Alert.alert(
      'Annuler cette transaction ?',
      'L’autre utilisateur sera prévenu immédiatement qu’il ne doit plus attendre. Si un paiement a déjà été signalé ou une preuve jointe, Loki bloquera cette annulation.',
      [
        { text: 'GARDER LA TRANSACTION', style: 'cancel' },
        {
          text: 'ANNULER LA TRANSACTION',
          style: 'destructive',
          onPress: () => {
            setPaymentBusyId(paymentId);
            void cancelPlaylistSalePayment(paymentId, 'USER_CANCELLED_FROM_NOTIFICATION')
              .then(async () => {
                setNotice('Transaction annulée · l’autre utilisateur a été prévenu');
                setPaymentCheckoutItem(null);
                await refresh();
              })
              .catch((e: any) => {
                const message = String(e?.message || '');
                setError(
                  message.includes('PAYMENT_ALREADY_REPORTED')
                    ? 'Le paiement a déjà été signalé ou une preuve a été jointe. Cette transaction doit être traitée, pas annulée.'
                    : 'Impossible d’annuler cette transaction pour le moment.',
                );
              })
              .finally(() => setPaymentBusyId(null));
          },
        },
      ],
    );
  };

    const reportPaymentProblem = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    setPaymentBusyId(paymentId);
    try {
      await reportPlaylistSalePaymentProblem(paymentId, 'Aucune réponse ou problème de transaction signalé depuis les notifications.');
      setNotice('Réclamation envoyée au Super Admin avec la référence de transaction');
      await readOne(item);
    } catch (e: any) {
      const raw = String(e?.message || '');
      setError(
        raw.includes('PAYMENT_REPORT_TOO_EARLY')
          ? 'La réclamation devient disponible après 4 h sans réponse.'
          : raw.includes('PAYMENT_NOT_REPORTED_YET')
            ? 'Le paiement doit d’abord être signalé avec une preuve.'
            : 'Impossible d’envoyer la réclamation pour le moment.',
      );
    } finally {
      setPaymentBusyId(null);
    }
  };

  const confirmPlaylistPaymentReceived = async (item: KeepNotification) => {
    const paymentId = paymentIdOf(item);
    if (!paymentId || paymentBusyId) return;
    const data = item.data as Record<string, unknown> | null;
    const amountCents = Number(data?.amountCents ?? data?.amount_cents ?? 0);
    const currencyCode = String(data?.currencyCode ?? data?.currency_code ?? 'EUR').toUpperCase();
    const buyerUsername = String(data?.buyerUsername ?? data?.buyer_username ?? '').replace(/^@+/, '');
    const amountLabel = amountCents > 0 ? `${(amountCents / 100).toFixed(2).replace('.', ',')} ${currencyCode}` : 'le montant attendu';

    Alert.alert(
      'Validation irréversible',
      `Vérifie d’abord TON compte PayPal. La capture jointe n’est qu’une preuve envoyée par l’acheteur. Confirme uniquement si ${amountLabel}${buyerUsername ? ` de ${displayUsername(buyerUsername)}` : ''} sont réellement crédités. Après validation, la Pépite est débloquée immédiatement et cette action ne peut pas être annulée. En validant à tort ou en détournant le système, tu engages ta responsabilité et Loki Music pourra appliquer les sanctions prévues au règlement : avertissement, retrait de Free, suspension ou bannissement.`,
      [
        { text: 'RETOUR', style: 'cancel' },
        {
          text: 'OUI · FONDS REÇUS',
          onPress: async () => {
            setPaymentBusyId(paymentId);
            try {
              await acceptMarketplacePaymentTerms('seller_payment_confirmation');
              const delivered = await markPlaylistSalePaid(paymentId);
              await syncMarketplaceDelivery(paymentId).catch(() => null);
              await readOne(item);
              setNotice(`${delivered.trackCount} morceau${delivered.trackCount > 1 ? 'x' : ''} débloqué${delivered.trackCount > 1 ? 's' : ''} · choix Public/Privé envoyé à l’acheteur`);
              await refresh();
            } catch (e: any) {
              const message = String(e?.message || '');
              setError(
                message.includes('BUYER_HAS_NOT_MARKED_PAID') || message.includes('PAYMENT_PROOF_REQUIRED')
                  ? 'L’acheteur doit d’abord signaler son paiement et joindre une preuve.'
                  : message.includes('TERMS')
                    ? 'Les conditions marketplace doivent être acceptées avant validation.'
                    : 'Impossible de confirmer la réception et de débloquer la sélection.',
              );
            } finally {
              setPaymentBusyId(null);
            }
          },
        },
      ],
    );
  };

  const openNotification = async (item: KeepNotification) => {
    if (!user) return;
    if (isNotificationAccessLocked(item.type, planCode, notificationAccessRules)) {
      await readOne(item);
      setNotice(`🔒 Disponible avec ${notificationPlanLabel(notificationAccessRequiredPlan(item.type, notificationAccessRules))} · reste dans tes notifications`);
      return;
    }
    await readOne(item);
    await deleteNotificationDuplicates(user.id, item).catch(() => 0);
    const tappedKey = notificationSemanticKey(item);
    setItems((current) => dedupeNotifications([item, ...current.filter((row) => row.id !== item.id && notificationSemanticKey(row) !== tappedKey)]));

    const data = item.data as Record<string, unknown> | null;
    const type = String(item.type || '').toUpperCase();
    const eventId = eventIdOf(item);

    if (type === 'CHAT_ACTIVATION_AVAILABLE' || type === 'AGORA_ACTIVATE') {
      useGlobalChatStore.getState().openSettings();
      setChatSettingsOpen(true);
      return;
    }

    if (type.startsWith('AGORA')) {
      const roomRaw = data?.roomSlug ?? data?.room_slug;
      const senderIdRaw = data?.senderId ?? data?.sender_id ?? data?.actorId ?? data?.actor_id ?? data?.profileId ?? data?.profile_id;
      const senderUsernameRaw = data?.senderUsername ?? data?.sender_username ?? data?.actorUsername ?? data?.actor_username ?? data?.username;
      const groupIdRaw = data?.groupId ?? data?.group_id;
      const groupNameRaw = data?.groupName ?? data?.group_name;
      const groupId = typeof groupIdRaw === 'string' && groupIdRaw ? groupIdRaw : null;
      const messageIdRaw = data?.messageId ?? data?.message_id;
      useGlobalChatStore.getState().open({
        roomSlug: typeof roomRaw === 'string' && roomRaw ? roomRaw : null,
        targetProfileId: groupId ? null : (typeof senderIdRaw === 'string' && senderIdRaw ? senderIdRaw : null),
        targetUsername: groupId ? null : (typeof senderUsernameRaw === 'string' && senderUsernameRaw ? senderUsernameRaw : null),
        groupId,
        groupName: typeof groupNameRaw === 'string' && groupNameRaw ? groupNameRaw : null,
        messageId: typeof messageIdRaw === 'number'
          ? messageIdRaw
          : typeof messageIdRaw === 'string' && messageIdRaw ? Number(messageIdRaw) || null : null,
      });
      return;
    }

    if (type === 'MONTHLY_FREE_CREDIT' || type.startsWith('FREE_')) {
      navigation.navigate('Offers', { sourceFeature: 'PROFILE_FREE' });
      return;
    }
    if (type === 'LOKI_PULSE_NEW') {
      navigation.navigate('Main', { screen: 'Profile' });
      return;
    }
    if (type === 'SOLO_RANK_UP' || type === 'BATTLE_SOLO_RANK_CHANGED') {
      navigation.navigate('Main', { screen: 'Parties', params: { openBattle: true, openBattleRanking: true, source: 'NOTIFICATION_RANK' } });
      return;
    }
    if (type === 'PLAYLIST_SALE_PAYMENT_READY') {
      await openPaymentFromNotification(item);
      return;
    }
    if (eventId) {
      navigation.navigate('Main', { screen: 'Discover', params: { focus: 'EVENTS', eventId, source: 'NOTIFICATION_EVENT' } });
      return;
    }

    const arenaRaw = data?.arenaId ?? data?.arena_id;
    const arenaId = typeof arenaRaw === 'string' && arenaRaw ? arenaRaw : undefined;
    if (isBattleInvite(item) || type.includes('BATTLE')) {
      navigation.navigate('Main', { screen: 'Parties', params: { openBattle: true, arenaId, source: 'NOTIFICATION' } });
      return;
    }

    const offerRaw = data?.offerId ?? data?.offer_id;
    const offerId = typeof offerRaw === 'string' && offerRaw ? offerRaw : null;

    if (type === 'PLAYLIST_SALE_DELIVERED') {
      const deliveredRaw = data?.playlistId ?? data?.playlist_id;
      const deliveredPlaylistId = typeof deliveredRaw === 'string' ? deliveredRaw : '';
      navigation.navigate('Main', { screen: 'MyMusic', params: { openPurchasePlaylistId: deliveredPlaylistId, source: 'NOTIFICATION' } });
      return;
    }

    if (['PLAYLIST_SALE_PARTIAL_OFFER','PLAYLIST_SALE_NEW_OFFER','PLAYLIST_SALE_OFFER_CREATED'].includes(type) && offerId) {
      const sellerUsername = await resolveNotificationProfileUsername(item);
      if (sellerUsername) {
        navigation.navigate('PublicProfile', { username: sellerUsername, openSaleOfferId: offerId, source: 'NOTIFICATION' });
        return;
      }
    }

    if (type === 'PLAYLIST_SALE_COMPLETED' && offerId) {
      navigation.navigate('PlaylistSale', { manageSaleOfferId: offerId, source: 'NOTIFICATION' });
      return;
    }

    if (type === 'PLAN_GIFTED' || type.includes('PLAN')) {
      navigation.navigate('Offers');
      return;
    }

    const profileUsername = await resolveNotificationProfileUsername(item);
    if (profileUsername) {
      // Une notification sociale reste dans le centre : l'utilisateur peut
      // lire et agir ici, puis ouvrir le profil seulement s'il le choisit.
      setGenericDetailProfileUsername(profileUsername);
      setGenericDetailItem(item);
      return;
    }

    setGenericDetailProfileUsername(null);
    setGenericDetailItem(item);
  };

  useEffect(() => {
    const focusId = String(route?.params?.focusNotificationId || '').trim();
    if (!focusId || handledFocusNotificationId.current === focusId || !items.length) return;
    const target = items.find((item) => item.id === focusId);
    if (!target) return;
    handledFocusNotificationId.current = focusId;
    navigation.setParams?.({ focusNotificationId: undefined });
    void openNotification(target);
  }, [route?.params?.focusNotificationId, items]);

  const readAll = async () => {
    if (!user) return;
    const previous = items;
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    try {
      await markAllNotificationsRead(user.id);
      setNotice('Toutes les notifications sont lues');
      setError(null);
    } catch {
      setItems(previous);
      setError('Impossible de tout marquer comme lu.');
    }
  };

  const removeOne = async (item: KeepNotification) => {
    if (!user || deletingId) return;
    setDeletingId(item.id);
    const previous = items;
    setItems((current) => current.filter((n) => n.id !== item.id));
    try {
      await deleteNotification(user.id, item.id);
      setNotice('Notification supprimée');
      setError(null);
    } catch {
      setItems(previous);
      setError('Impossible de supprimer cette notification.');
    } finally {
      setDeletingId(null);
    }
  };

  const confirmRemoveOne = async (item: KeepNotification) => {
    if (!user || deletingId) return;
    const paymentWarning = await pendingPaymentWarning(item);
    Alert.alert(
      'Supprimer cette notification ?',
      paymentWarning
        ? `${paymentWarning}\n\nSi tu la supprimes maintenant, la transaction reste enregistrée dans Loki, mais tu perds ce raccourci depuis les notifications.`
        : 'Elle disparaîtra de cette liste. Le message, la transaction ou l’activité d’origine ne seront pas supprimés.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'SUPPRIMER', style: 'destructive', onPress: () => void removeOne(item) },
      ],
    );
  };

  const clearAll = async () => {
    if (!user || deleting) return;
    setDeleting(true);
    setError(null);
    const previous = items;
    setItems([]);
    try {
      await deleteAllNotifications(user.id);
      setNotice('Notifications supprimées');
    } catch {
      setItems(previous);
      setError('Impossible de supprimer les notifications.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmClearAll = async () => {
    if (!items.length || deleting) return;
    const paymentItems = items.filter((item) => Boolean(paymentIdOf(item)));
    const sensitiveWithoutPaymentId = items.filter((item) => !paymentIdOf(item) && isSensitivePaymentNotification(item)).length;
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
    const sensitiveCount = pendingCount + sensitiveWithoutPaymentId;
    const message = sensitiveCount > 0
      ? `ATTENTION : ${sensitiveCount} notification${sensitiveCount > 1 ? 's contiennent' : ' contient'} un paiement, un QR PayPal, une Pépite ou une transaction encore utile.\n\nTout supprimer enlèvera seulement ces raccourcis. Les transactions restent enregistrées dans Loki Music et ne sont pas annulées automatiquement. Continuer ?`
      : 'Supprimer toutes les notifications de ce centre ? Cette action n’efface pas ton compte, tes transactions ni tes préférences.';
    Alert.alert(
      'Supprimer les notifications',
      message,
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'TOUT SUPPRIMER', style: 'destructive', onPress: () => void clearAll() },
      ],
    );
  };

  const openActions = () => {
    // BUG RÉEL (audit 01/09/2026) : le repli web via window.confirm ne
    // proposait QUE "marquer comme lu" -- l'option "Tout supprimer" était
    // silencieusement absente sur web. Alert.alert (brandé, fonctionnel sur
    // web depuis le fix du 31/08) restaure les 3 choix partout.
    Alert.alert('Notifications', undefined, [
      { text: 'Tout marquer comme lu', onPress: () => void readAll() },
      { text: 'Tout supprimer', style: 'destructive', onPress: confirmClearAll },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {notice ? <View pointerEvents="none" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View><Text style={styles.title}>Notifications</Text><Text style={styles.subtitle}>{unread} non lue{unread > 1 ? 's' : ''}</Text></View>
          <TouchableOpacity style={styles.moreButton} onPress={openActions} accessibilityLabel="Actions notifications"><Text style={styles.moreText}>•••</Text></TouchableOpacity>
        </View>

        <View style={styles.visibilityCard}>
          <View style={styles.visibilityCopy}>
            <Text style={styles.visibilityEyebrow}>CONFIDENTIALITÉ DU PROFIL</Text>
            <Text style={styles.visibilityTitle}>{user?.isPublic ? 'Profil visible' : 'Profil privé'}</Text>
            <Text style={styles.visibilityHint}>{user?.isPublic
              ? 'Les autres utilisateurs peuvent découvrir ton univers musical.'
              : 'Ton profil n’apparaît pas dans la découverte publique.'}</Text>
          </View>
          {visibilitySaving ? <ActivityIndicator color={colors.primaryLight} /> : <Switch value={Boolean(user?.isPublic)} onValueChange={(value) => void updateProfileVisibility(value)} trackColor={{ false: colors.border, true: colors.primary }} />}
        </View>

        <View style={[styles.visibilityCard, styles.chatControlCard]}>
          <View style={styles.chatStatusIcon}><Text style={styles.chatStatusIconText}>◉</Text></View>
          <View style={styles.visibilityCopy}>
            <Text style={styles.visibilityEyebrow}>MESSAGERIE LOKI</Text>
            <Text style={styles.visibilityTitle}>{chatEnabled ? 'Messagerie active' : 'Messagerie désactivée'}</Text>
            <Text style={styles.visibilityHint}>{chatEnabled
              ? `Visible sur ${chatSurfaces.length} écran${chatSurfaces.length > 1 ? 's' : ''}. Le bouton d’accès peut être placé à gauche, à droite et en hauteur.`
              : 'Active-le puis choisis précisément où le bouton flottant doit apparaître.'}</Text>
            <View style={styles.chatControlActions}>
              <TouchableOpacity
                style={styles.chatOpenButton}
                onPress={() => {
                  if (!chatEnabled) {
                    void persistChatSettings(true, Array.from(new Set([...chatSurfaces, 'NOTIFICATIONS'] as MusicAgoraSurface[]))).then(() => {
                      useGlobalChatStore.getState().open();
                    });
                    return;
                  }
                  useGlobalChatStore.getState().open();
                }}
                accessibilityRole="button"
                accessibilityLabel={chatEnabled ? 'Ouvrir le Tchat Loki' : 'Activer et ouvrir le Tchat Loki'}
              >
                <Text style={styles.chatOpenButtonText}>{chatEnabled ? 'OUVRIR LE TCHAT' : 'ACTIVER LE TCHAT'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chatChooseButton} onPress={() => setChatSettingsOpen((value) => !value)} accessibilityRole="button">
                <Text style={styles.chatChooseButtonText}>{chatSettingsOpen ? 'FERMER' : 'PLACEMENT'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {chatSaving ? <ActivityIndicator color={colors.keep} /> : (
            <Switch
              value={chatEnabled}
              onValueChange={(value) => void updateChatEnabled(value)}
              disabled={isLocalGuest || isDemoMode}
              trackColor={{ false: colors.border, true: colors.keep }}
            />
          )}
        </View>
        {chatSettingsOpen ? (
          <View style={styles.chatSurfacePanel}>
            <Text style={styles.chatSurfaceTitle}>Où afficher ton chat ?</Text>
            <Text style={styles.chatSurfaceHint}>L’écoute et l’envoi de messages restent gratuits. Le bouton flottant n’apparaît que sur les écrans sélectionnés.</Text>
            <View style={styles.chatSurfaceGrid}>
              {CHAT_SURFACE_OPTIONS.map((option) => {
                const active = chatSurfaces.includes(option.key);
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.chatSurfaceChip, active && styles.chatSurfaceChipOn]}
                    disabled={chatSaving}
                    onPress={() => void toggleChatSurface(option.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  >
                    <Text style={[styles.chatSurfaceChipText, active && styles.chatSurfaceChipTextOn]}>{active ? '✓ ' : ''}{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleNoMargin}>Centre de notifications</Text>
            {items.length ? <TouchableOpacity onPress={confirmClearAll} disabled={deleting}><Text style={styles.clearText}>{deleting ? 'Suppression…' : 'Tout supprimer'}</Text></TouchableOpacity> : null}
          </View>
          {loading ? <ActivityIndicator color="#A884FA" /> : error && items.length === 0 ? <Text style={styles.error}>{error}</Text> : items.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyIcon}>♩</Text><Text style={styles.muted}>Aucune notification pour le moment.</Text></View>
          ) : items.map((item) => {
            const lockedByPlan = isNotificationAccessLocked(item.type, planCode, notificationAccessRules);
            if (lockedByPlan) {
              const requiredPlan = notificationAccessRequiredPlan(item.type, notificationAccessRules);
              return (
                <View key={item.id} style={[styles.card, !item.readAt && styles.cardUnread]}>
                  <TouchableOpacity style={styles.cardMain} onPress={() => { void openNotification(item); }} activeOpacity={0.84}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardType}>🔒 {notificationTypeLabel(item.type)}</Text>
                      <View style={styles.readState}>{!item.readAt ? <View style={styles.unreadDot} /> : <Text style={styles.readText}>LU</Text>}</View>
                    </View>
                    <View style={styles.cardBodyRow}>
                      <View style={styles.cardTextColumn}>
                        <Text style={styles.cardTitle}>Notification réservée · {notificationPlanLabel(requiredPlan)}</Text>
                        <Text style={styles.cardBody} numberOfLines={2}>Cette notification est présentée avec un cadenas. Appuie pour voir la formule qui la débloque.</Text>
                      </View>
                    </View>
                    <View style={styles.cardBottomRow}>
                      <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }
            const profileUsername = notificationProfileUsername(item);
            const payoutQrUrl = String(
              item.data?.payoutQrUrl
              ?? item.data?.payout_qr_url
              ?? extractMusicAgoraPayoutQrUrl(item.body)
              ?? '',
            ).trim();
            const notificationImageUrl = item.data?.image_url ? String(item.data.image_url) : payoutQrUrl || null;
            const notificationBody = isNewKeepNotification(item)
              ? maskedNewKeepCopy(item).body
              : payoutQrUrl
                ? 'QR PayPal partagé · ouvre le paiement ou le Tchat pour l’utiliser.'
                : item.body;
            const gifted = item.type === 'PLAN_GIFTED';
            const giftBenefits = gifted ? giftedPlanBenefits(item) : [];
            return (
            <Animated.View
              key={item.id}
              style={[
                styles.card,
                !item.readAt && styles.cardUnread,
                gifted && styles.cardGifted,
                gifted && {
                  transform: [{
                    scale: giftPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }),
                  }],
                },
              ]}
            >
              <TouchableOpacity
                style={styles.cardMain}
                onPress={() => { void openNotification(item); }}
                activeOpacity={0.84}
                accessibilityLabel={`${item.title}. ${item.readAt ? 'Lue' : 'Non lue'}${profileUsername ? `. Voir le profil de ${profileUsername}` : ''}`}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardType}>{notificationTypeLabel(item.type)}</Text>
                  <View style={styles.readState}>{!item.readAt ? <View style={styles.unreadDot} /> : <Text style={styles.readText}>LU</Text>}</View>
                </View>
                {/* Adel (08/09/2026) : "comment ca se fait que tu n'as pas
                    mis le logo de la photo" -- vignette de l'evenement quand
                    l'organisateur en a ajoute une. */}
                <View style={styles.cardBodyRow}>
                  {notificationImageUrl ? <Image source={{ uri: notificationImageUrl }} style={styles.cardThumbnail} /> : null}
                  <View style={styles.cardTextColumn}>
                    {/* Nouveau morceau d'un profil suivi : titre masqué jusqu'au GARDER (Adel 02/10/2026). */}
                    <Text style={styles.cardTitle}>{isNewKeepNotification(item) ? maskedNewKeepCopy(item).title : item.title}</Text>
                    <Text style={styles.cardBody} numberOfLines={expandedNotificationIds.has(item.id) ? undefined : 2}>{notificationBody}</Text>
                    {String(notificationBody || '').length > 78 ? (
                      <TouchableOpacity onPress={() => toggleNotificationExpanded(item.id)} accessibilityRole="button" accessibilityLabel={expandedNotificationIds.has(item.id) ? 'Réduire la notification' : 'En savoir plus sur la notification'}>
                        <Text style={styles.cardMoreLink}>{expandedNotificationIds.has(item.id) ? 'Réduire ‹' : 'En savoir plus ›'}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
                {gifted ? (
                  <View style={styles.giftBox}>
                    <Text style={styles.giftEyebrow}>🎁 OFFRE ACTIVÉE</Text>
                    {giftBenefits.map((benefit) => <Text key={benefit} style={styles.giftBenefit}>✓ {benefit}</Text>)}
                    <Text style={styles.giftHint}>Appuie ici pour voir le détail complet de ton offre.</Text>
                  </View>
                ) : null}
                {isBattleInvite(item) ? <View style={styles.battleTheme}><Text style={styles.battleThemeLabel}>STYLE DU MATCH</Text><Text style={styles.battleThemeValue}>{battleTheme(item)}</Text></View> : null}
                {(item.type === 'EVENT_INVITE' || item.type === 'EVENT_REMINDER') && eventIdOf(item) ? <TouchableOpacity onPress={() => void openEventDetail(item)}><Text style={styles.cardMoreLink}>En savoir plus ›</Text></TouchableOpacity> : null}
                <View style={styles.cardBottomRow}>
                  <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('fr-FR')}</Text>
                  {profileUsername ? <Text style={styles.cardProfileLink}>Actions avec {displayUsername(profileUsername)} ›</Text> : null}
                </View>
              </TouchableOpacity>
              {isNewKeepNotification(item) ? (
                <View style={styles.newKeepActions}>
                  <NewKeepNotificationActions
                    notification={item}
                    onInteract={() => { if (!item.readAt) void readOne(item); }}
                    isFollowing={Boolean(notificationProfileId(item) && followingProfileIds.has(notificationProfileId(item) as string))}
                    onFollow={notificationProfileId(item) && notificationProfileId(item) !== user?.id
                      ? () => followFromNotification(item)
                      : undefined}
                    onOpenProfile={profileUsername ? () => navigation.navigate('PublicProfile', { username: profileUsername }) : undefined}
                  />
                </View>
              ) : null}
              {!isNewKeepNotification(item) && profileUsername ? (
                <View style={styles.notificationActionRow}>
                  {notificationProfileId(item) && notificationProfileId(item) !== user?.id ? (
                    <TouchableOpacity
                      style={styles.notificationActionButton}
                      disabled={followBusyProfileId === notificationProfileId(item) || followingProfileIds.has(notificationProfileId(item) as string)}
                      onPress={() => { void followFromNotification(item); }}
                      accessibilityRole="button"
                      accessibilityLabel={followingProfileIds.has(notificationProfileId(item) as string) ? 'Profil déjà suivi' : `Suivre ${displayUsername(profileUsername)}`}
                    >
                      <Text style={styles.notificationActionButtonText}>
                        {followingProfileIds.has(notificationProfileId(item) as string)
                          ? '✓ DÉJÀ SUIVI'
                          : followBusyProfileId === notificationProfileId(item)
                            ? 'SUIVI…'
                            : '+ SUIVRE'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.notificationActionButton, { marginTop: 8 }]}
                    onPress={() => {
                      if (!item.readAt) void readOne(item);
                      navigation.navigate('PublicProfile', { username: profileUsername });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir le profil de ${profileUsername}`}
                  >
                    <Text style={styles.notificationActionButtonText}>VOIR LE PROFIL · {displayUsername(profileUsername)}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {isEventInvite(item) && eventIdOf(item) ? (() => {
                const eventId = eventIdOf(item) as string;
                const current = eventRsvps[eventId];
                const busy = rsvpBusyId === item.id;
                return (
                  <View style={styles.rsvpRow}>
                    <TouchableOpacity
                      style={[styles.rsvpButton, styles.rsvpGoing, current === 'GOING' && styles.rsvpGoingActive]}
                      disabled={busy}
                      onPress={() => void chooseEventRsvp(item, 'GOING')}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.rsvpButtonText, styles.rsvpGoingText]}>{current === 'GOING' ? '✓ JE PARTICIPE' : 'JE PARTICIPE'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rsvpButton, styles.rsvpMaybe, current === 'MAYBE' && styles.rsvpMaybeActive]}
                      disabled={busy}
                      onPress={() => void chooseEventRsvp(item, 'MAYBE')}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.rsvpButtonText, styles.rsvpMaybeText]}>{current === 'MAYBE' ? '✓ PLUS TARD' : 'PLUS TARD'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rsvpButton, styles.rsvpNotGoing, current === 'NOT_GOING' && styles.rsvpNotGoingActive]}
                      disabled={busy}
                      onPress={() => void chooseEventRsvp(item, 'NOT_GOING')}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.rsvpButtonText, styles.rsvpNotGoingText]}>{current === 'NOT_GOING' ? '✓ JE NE VIENS PAS' : 'JE NE VIENS PAS'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })() : null}
              {isBuyerPaymentReady(item) ? (
                <View style={styles.paymentActionRow}>
                  <TouchableOpacity
                    style={[styles.paymentActionButton, styles.paymentActionPrimary]}
                    disabled={paymentBusyId === paymentIdOf(item)}
                    onPress={() => void openPaymentFromNotification(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Payer avec le QR ou joindre une preuve de paiement"
                  >
                    <Text style={styles.paymentActionPrimaryText}>PAYER · QR / PREUVE</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {notificationPrimaryActionLabel(item) ? (
                <View style={styles.notificationActionRow}>
                  <TouchableOpacity style={styles.notificationActionButton} onPress={() => { void openNotification(item); }} accessibilityRole="button" accessibilityLabel={notificationPrimaryActionLabel(item) || 'Ouvrir la notification'}>
                    <Text style={styles.notificationActionButtonText}>{notificationPrimaryActionLabel(item)}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {isSellerPaymentAction(item) ? (
                <View style={styles.paymentActionRow}>
                  <TouchableOpacity
                    style={[styles.paymentActionButton, styles.paymentActionSecondary]}
                    disabled={paymentBusyId === paymentIdOf(item)}
                    onPress={() => void openPlaylistPaymentHistoryFromNotification(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Voir l’historique de la transaction et la preuve de paiement"
                  >
                    <Text style={styles.paymentActionSecondaryText}>HISTORIQUE / PREUVE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paymentActionButton, styles.paymentActionConfirm]}
                    disabled={paymentBusyId === paymentIdOf(item)}
                    onPress={() => void confirmPlaylistPaymentReceived(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Valider le paiement reçu et débloquer la collection"
                  >
                    <Text style={styles.paymentActionConfirmText}>{paymentBusyId === paymentIdOf(item) ? 'DÉBLOCAGE…' : 'VALIDER LE PAIEMENT'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {isSellerPaymentAction(item) || isBuyerWaitingSeller(item) ? (
                <TouchableOpacity
                  style={styles.cancelPaymentButton}
                  disabled={paymentBusyId === paymentIdOf(item)}
                  onPress={() => void reportPaymentProblem(item)}
                  accessibilityRole="button"
                  accessibilityLabel="Signaler un problème ou une absence de réponse"
                >
                  <Text style={styles.cancelPaymentButtonText}>RÉCLAMATION / AUCUNE RÉPONSE</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.cardFooter}>
                {!item.readAt ? <TouchableOpacity onPress={() => { void readOne(item); }}><Text style={styles.readAction}>Marquer comme lu</Text></TouchableOpacity> : <View />}
                <TouchableOpacity onPress={() => { void confirmRemoveOne(item); }} disabled={deletingId === item.id} accessibilityLabel={`Supprimer ${item.title}`}>
                  <Text style={styles.deleteOneText}>{deletingId === item.id ? 'Suppression…' : 'Supprimer'}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
            );
          })}
          {error && items.length > 0 && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Réglages des notifications</Text>
          <Text style={styles.preferenceHint}>Active ou désactive ce que Loki Music peut t’envoyer. Les réglages restent accessibles en bas du centre.</Text>
          {Platform.OS === 'ios' && pushPermission === 'denied' ? (
            <View style={styles.pushSystemWarning}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pushSystemWarningTitle}>Notifications iPhone désactivées</Text>
                <Text style={styles.pushSystemWarningText}>iOS bloque les notifications même si elles sont activées dans Loki Music.</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Ouvrir les réglages iPhone des notifications"
                style={styles.pushSystemWarningButton}
                onPress={() => { void Linking.openSettings().catch(() => {}); }}
              >
                <Text style={styles.pushSystemWarningButtonText}>RÉGLAGES</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {/* Les événements et les contenus promotionnels restent des réglages
              explicites de l'utilisateur. Les abonnements débloquent du confort
              et des fonctions, jamais l'obligation de recevoir une publicité. */}
          {/* Adel (02/10/2026) : « rassemble-les ensemble, pas trop de choix ».
              5 interrupteurs regroupés ; mêmes colonnes en base (aucune
              préférence existante perdue). Le tchat (messages privés,
              groupes, invitations, offres) est classé avec le social. */}
          <Preference
            label="Messages & social"
            hint="Messages privés, groupes (invitations, retraits, suppression), offres reçues dans le tchat, nouveaux abonnés."
            value={prefs.socialEnabled}
            onValueChange={(v) => updatePrefs({ socialEnabled: v })}
          />
          <SoundPreference label="Son messages" value={prefs.socialSound} onChange={(v) => updatePrefs({ socialSound: v as NotificationPreferences['socialSound'] })} />
          <Preference label="Accès & paiements" hint="Paiements à faire, paiements reçus, collections à débloquer et validations." value={prefs.moneyEnabled} onValueChange={(v) => updatePrefs({ moneyEnabled: v })} />
          <SoundPreference label="Son paiements" value={prefs.moneySound} money onChange={(v) => updatePrefs({ moneySound: v as NotificationPreferences['moneySound'] })} />
          <Preference
            label="Musique & Battle"
            hint="Nouvelles pépites, reprises de tes découvertes, invitations et résultats Battle."
            value={prefs.musicEnabled && prefs.battleEnabled}
            onValueChange={(v) => updatePrefs({ musicEnabled: v, battleEnabled: v })}
          />
          <SoundPreference label="Son musique & Battle" value={prefs.musicSound} onChange={(v) => updatePrefs({ musicSound: v as NotificationPreferences['musicSound'], battleSound: v as NotificationPreferences['battleSound'] })} />
          <Preference
            label="Événements"
            hint="Invitations et rappels liés aux soirées et événements proposés dans Loki Music."
            value={prefs.eventsEnabled}
            onValueChange={(v) => updatePrefs({ eventsEnabled: v })}
          />
          <Preference
            label="Actualités & offres"
            hint={marketingLocked
              ? 'Boutique musicale et offres ciblées · réglage de masquage disponible avec Premium, Creator Pro ou Venue Pro.'
              : 'Boutique musicale, nouveautés et contenus promotionnels ciblés.'}
            value={marketingLocked ? true : prefs.marketingEnabled}
            onValueChange={(v) => { if (!marketingLocked) updatePrefs({ marketingEnabled: v }); }}
            locked={marketingLocked}
          />
          <Preference
            label="Compte & sécurité"
            hint="Alertes essentielles : connexion, sécurité, signalements traités."
            value={prefs.systemEnabled}
            onValueChange={(v) => updatePrefs({ systemEnabled: v })}
          />
        </View>
      </ScrollView>

      <PayoutCheckoutSheet
        visible={Boolean(paymentCheckoutItem)}
        paymentId={paymentCheckoutItem ? (paymentIdOf(paymentCheckoutItem) ?? '') : ''}
        sellerUsername={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.sellerUsername ?? (paymentCheckoutItem.data as any)?.seller_username ?? '') : ''}
        amountCents={paymentCheckoutItem ? Number((paymentCheckoutItem.data as any)?.amountCents ?? (paymentCheckoutItem.data as any)?.amount_cents ?? 0) : 0}
        currencyCode={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.currencyCode ?? (paymentCheckoutItem.data as any)?.currency_code ?? 'EUR') : 'EUR'}
        payoutLink={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.payoutLink ?? (paymentCheckoutItem.data as any)?.payout_link ?? '') : ''}
        payoutQrUrl={paymentCheckoutItem ? String((paymentCheckoutItem.data as any)?.payoutQrUrl ?? (paymentCheckoutItem.data as any)?.payout_qr_url ?? '') : ''}
        onClose={() => setPaymentCheckoutItem(null)}
        onCancelTransaction={paymentCheckoutItem ? async () => {
          const paymentId = paymentIdOf(paymentCheckoutItem);
          if (!paymentId) return;
          await cancelPlaylistSalePayment(paymentId, 'BUYER_CANCELLED_FROM_NOTIFICATION');
          setNotice('Transaction annulée · l’autre utilisateur a été prévenu');
          await refresh();
          setPaymentCheckoutItem(null);
        } : undefined}
        onPaid={paymentCheckoutItem ? async () => {
          await signalPlaylistPaymentSent(paymentCheckoutItem);
          setPaymentCheckoutItem(null);
        } : undefined}
      />

      <KeepModal
        visible={Boolean(genericDetailItem)}
        transparent
        animationType="fade"
        onRequestClose={() => { setGenericDetailItem(null); setGenericDetailProfileUsername(null); }}
      >
        <View style={styles.detailBackdrop}>
          <View style={styles.detailSheet}>
            <TouchableOpacity
              style={styles.detailClose}
              onPress={() => { setGenericDetailItem(null); setGenericDetailProfileUsername(null); }}
              accessibilityLabel="Fermer"
            ><Text style={styles.detailCloseText}>×</Text></TouchableOpacity>
            {genericDetailItem ? <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.detailTitle}>{genericDetailItem.title}</Text>
              <Text style={styles.detailMeta}>{notificationTypeLabel(genericDetailItem.type)} · {new Date(genericDetailItem.createdAt).toLocaleString('fr-FR')}</Text>
              <Text style={styles.detailDescription}>{genericDetailItem.body}</Text>
              {genericDetailProfileUsername ? (
                <View style={styles.notificationActionRow}>
                  {notificationProfileId(genericDetailItem) && notificationProfileId(genericDetailItem) !== user?.id ? (
                    <TouchableOpacity
                      style={styles.notificationActionButton}
                      disabled={followBusyProfileId === notificationProfileId(genericDetailItem) || followingProfileIds.has(notificationProfileId(genericDetailItem) as string)}
                      onPress={() => { void followFromNotification(genericDetailItem); }}
                      accessibilityRole="button"
                      accessibilityLabel={followingProfileIds.has(notificationProfileId(genericDetailItem) as string) ? 'Profil déjà suivi' : `Suivre ${displayUsername(genericDetailProfileUsername)}`}
                    >
                      <Text style={styles.notificationActionButtonText}>
                        {followingProfileIds.has(notificationProfileId(genericDetailItem) as string) ? '✓ DÉJÀ SUIVI' : followBusyProfileId === notificationProfileId(genericDetailItem) ? 'SUIVI…' : '+ SUIVRE'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.notificationActionButton, { marginTop: 8 }]}
                    onPress={() => {
                      const targetUsername = genericDetailProfileUsername;
                      setGenericDetailItem(null);
                      setGenericDetailProfileUsername(null);
                      navigation.navigate('PublicProfile', { username: targetUsername });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir le profil de ${genericDetailProfileUsername}`}
                  >
                    <Text style={styles.notificationActionButtonText}>VOIR LE PROFIL · {displayUsername(genericDetailProfileUsername)}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView> : null}
          </View>
        </View>
      </KeepModal>

      {/* Adel (08/09/2026) : "un popup ... la photo ... du texte avec des
          explications, tenue exigee etc. ... un bouton en savoir plus ...
          et ensuite a partir de la il a les boutons" -- detail complet,
          jamais tronque, avec les memes boutons de reponse. */}
      <KeepModal visible={Boolean(detailItem)} transparent animationType="fade" onRequestClose={closeEventDetail}>
        <View style={styles.detailBackdrop}>
          <View style={styles.detailSheet}>
            <TouchableOpacity style={styles.detailClose} onPress={closeEventDetail} accessibilityLabel="Fermer"><Text style={styles.detailCloseText}>×</Text></TouchableOpacity>
            {detailLoading ? <ActivityIndicator color="#A884FA" style={{ marginTop: 30 }} /> : detailEvent ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {detailEvent.imageUrl ? <Image source={{ uri: detailEvent.imageUrl }} style={styles.detailImage} /> : null}
                <Text style={styles.detailTitle}>{detailEvent.name}</Text>
                <Text style={styles.detailMeta}>{new Date(detailEvent.startsAt).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{detailEvent.venueName ? ` · ${detailEvent.venueName}` : ''}</Text>
                {detailEvent.description ? <Text style={styles.detailDescription}>{detailEvent.description}</Text> : null}
                {detailEvent.youtubeUrl ? <TouchableOpacity style={styles.detailYoutube} onPress={() => { void Linking.openURL(detailEvent.youtubeUrl as string); }}><Text style={styles.detailYoutubeText}>▶ Voir sur YouTube</Text></TouchableOpacity> : null}
                {detailItem && (detailItem.type === 'EVENT_INVITE') && Array.isArray(detailItem.data?.response_options) ? (() => {
                  const eventId = eventIdOf(detailItem) as string;
                  const current = eventRsvps[eventId];
                  const busy = rsvpBusyId === detailItem.id;
                  return (
                    <View style={styles.rsvpRow}>
                      <TouchableOpacity style={[styles.rsvpButton, styles.rsvpGoing, current === 'GOING' && styles.rsvpGoingActive]} disabled={busy} onPress={() => void chooseEventRsvp(detailItem, 'GOING')}>
                        <Text style={[styles.rsvpButtonText, styles.rsvpGoingText]}>{current === 'GOING' ? '✓ JE PARTICIPE' : 'JE PARTICIPE'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.rsvpButton, styles.rsvpMaybe, current === 'MAYBE' && styles.rsvpMaybeActive]} disabled={busy} onPress={() => void chooseEventRsvp(detailItem, 'MAYBE')}>
                        <Text style={[styles.rsvpButtonText, styles.rsvpMaybeText]}>{current === 'MAYBE' ? '✓ PLUS TARD' : 'PLUS TARD'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.rsvpButton, styles.rsvpNotGoing, current === 'NOT_GOING' && styles.rsvpNotGoingActive]} disabled={busy} onPress={() => void chooseEventRsvp(detailItem, 'NOT_GOING')}>
                        <Text style={[styles.rsvpButtonText, styles.rsvpNotGoingText]}>{current === 'NOT_GOING' ? '✓ JE NE VIENS PAS' : 'JE NE VIENS PAS'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })() : null}
              </ScrollView>
            ) : <Text style={styles.muted}>Cet évènement n’est plus disponible.</Text>}
          </View>
        </View>
      </KeepModal>
</SafeAreaView>
  );
}

function SoundPreference({ label, value, onChange, money = false }: { label: string; value: string; onChange: (value: string) => void; money?: boolean }) {
  const choices = money ? [['MONEY','Argent'],['DEFAULT','Classique'],['SILENT','Muet']] : [['DEFAULT','Classique'],['SILENT','Muet']];
  return <View style={styles.soundRow}><Text style={styles.soundLabel}>{label}</Text><View style={styles.soundChoices}>{choices.map(([key,name]) => <TouchableOpacity key={key} style={[styles.soundChoice,value===key&&styles.soundChoiceActive]} onPress={() => onChange(key)}><Text style={[styles.soundChoiceText,value===key&&styles.soundChoiceTextActive]}>{name}</Text></TouchableOpacity>)}</View></View>;
}

function Preference({ label, hint, value, onValueChange, locked }: { label: string; hint?: string; value: boolean; onValueChange: (value: boolean) => void; locked?: boolean }) {
  return <View style={styles.preference}>
    <View style={styles.preferenceCopy}>
      <Text style={styles.preferenceLabel}>{label}{locked ? ' · 🔒' : ''}</Text>
      {hint ? <Text style={styles.preferenceItemHint}>{hint}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onValueChange} disabled={locked} trackColor={{ false: colors.border, true: '#6D35CF' }} thumbColor={value ? colors.primaryLight : '#8F879D'} />
  </View>;
}

const styles = StyleSheet.create({
  soundRow:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.07)'},soundLabel:{color:colors.textPrimary,fontSize:13,fontWeight:'800',marginBottom:7},soundChoices:{flexDirection:'row',gap:7},soundChoice:{minHeight:34,paddingHorizontal:12,borderRadius:17,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},soundChoiceActive:{borderColor:colors.primary,backgroundColor:'rgba(139,92,246,.15)'},soundChoiceText:{color:colors.textMuted,fontSize:11,fontWeight:'800'},soundChoiceTextActive:{color:colors.textPrimary},
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  back: { color: colors.textPrimary, fontSize: 38, lineHeight: 40 },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { color:colors.white, fontSize: 13, textAlign: 'center', marginTop: 2 },
  moreButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  moreText: { color: colors.primaryLight, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  notice: { position: 'absolute', zIndex: 20, top: 12, alignSelf: 'center', maxWidth: '78%', backgroundColor: 'rgba(27,19,41,.96)', borderWidth: 1, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  noticeText: { color: colors.textPrimary, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  visibilityCard: { minHeight: 92, marginBottom: spacing.xl, paddingHorizontal: spacing.md, paddingVertical: 13, borderRadius: 18, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,.10)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibilityCopy: { flex: 1, minWidth: 0 },
  visibilityEyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  visibilityTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 4 },
  visibilityHint: { color: colors.white, fontSize: 11, lineHeight: 16, marginTop: 3 },
  chatControlCard: { marginTop: -8, borderColor: colors.keep, backgroundColor: 'rgba(45,225,194,.07)' },
  chatStatusIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.keep, backgroundColor: 'rgba(45,225,194,.12)', alignItems: 'center', justifyContent: 'center' },
  chatStatusIconText: { color: colors.keep, fontSize: 18, fontWeight: '900' },
  chatControlActions:{flexDirection:'row',alignItems:'center',gap:7,marginTop:8},
  chatOpenButton:{minHeight:44,paddingHorizontal:12,borderRadius:16,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.12)',alignItems:'center',justifyContent:'center'},
  chatOpenButtonText:{color:colors.keep,fontSize:11,fontWeight:'900',letterSpacing:.55},
  chatChooseButton:{minHeight:44,paddingHorizontal:10,borderRadius:16,borderWidth:1,borderColor:colors.info,backgroundColor:'rgba(41,194,255,.08)',alignItems:'center',justifyContent:'center'},
  chatChooseButtonText:{color:colors.info,fontSize:11,fontWeight:'900',letterSpacing:.5},
  chatSurfacePanel:{marginTop:-14,marginBottom:spacing.xl,padding:12,borderRadius:16,borderWidth:1,borderColor:colors.info,backgroundColor:'rgba(41,194,255,.06)'},
  chatSurfaceTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  chatSurfaceHint:{color:colors.white,fontSize:10,lineHeight:15,marginTop:3},
  chatSurfaceGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},
  chatSurfaceChip:{minHeight:44,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:colors.info,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  chatSurfaceChipOn:{backgroundColor:'rgba(41,194,255,.18)',borderColor:colors.primaryLight},
  chatSurfaceChipText:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  chatSurfaceChipTextOn:{color:colors.primaryLight},
    section: { marginBottom: spacing.xxl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  pushSystemWarning: { marginTop: 10, marginBottom: 6, minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.08)', paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pushSystemWarningTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  pushSystemWarningText: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, marginTop: 2 },
  pushSystemWarningButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  pushSystemWarningButtonText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: spacing.md },
  sectionTitleNoMargin: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  clearText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  newKeepActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  preferenceHint: { color:colors.white, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  preference: { minHeight: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm },
  preferenceCopy: { flex: 1, minWidth: 0 },
  preferenceLabel: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  preferenceItemHint: { color: colors.white, fontSize: 14, lineHeight: 20, marginTop: 3 },
  card: { backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, borderRadius: 16, marginBottom: spacing.sm, overflow: 'hidden' },
  cardUnread: { borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,0.14)' },
  cardGifted: { borderColor: '#D6B36A', backgroundColor: 'rgba(214,179,106,.10)' },
  giftBox: { marginTop: 10, borderRadius: 13, borderWidth: 1, borderColor: '#D6B36A', backgroundColor: 'rgba(214,179,106,.08)', paddingHorizontal: 11, paddingVertical: 10 },
  giftEyebrow: { color: '#FFF4D0', fontSize: 10, fontWeight: '900', letterSpacing: .8, marginBottom: 6 },
  giftBenefit: { color: colors.textPrimary, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  giftHint: { color: '#F1E7C7', fontSize: 10, lineHeight: 15, marginTop: 6 },
  cardMain: { padding: spacing.md, paddingBottom: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType: { color: colors.primaryLight, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  readState: { minWidth: 24, alignItems: 'flex-end' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.keep },
  readText: { color:colors.white, fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  cardTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', marginTop: 7 },
  cardBody: { color:colors.white, fontSize: 16, lineHeight: 24, marginTop: 4 },
  cardBodyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cardThumbnail: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.backgroundCard, marginTop: 7 },
  cardTextColumn: { flex: 1, minWidth: 0 },
  cardMoreLink: { color: colors.primaryLight, fontSize: 14, fontWeight: '900', marginTop: 6 },
  cardDate: { color:colors.white, fontSize: 13 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardProfileLink: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  battleTheme: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,0.10)', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  battleThemeLabel: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  battleThemeValue: { color: colors.warning, fontSize: 14, fontWeight: '900' },
  battleActions: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  notificationActionRow: { paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: spacing.sm },
  notificationActionButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: 'rgba(124,92,252,.10)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  notificationActionButtonText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: .4, textAlign: 'center' },
  paymentActionRow: { flexDirection: 'row', gap: 7, paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: spacing.sm },
  paymentActionButton: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  paymentActionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  paymentActionPrimaryText: { color: colors.white, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  paymentActionSecondary: { backgroundColor: colors.backgroundCard, borderColor: colors.primaryLight },
  paymentActionSecondaryText: { color: colors.primaryLight, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  paymentActionConfirm: { backgroundColor: 'rgba(45,225,194,.16)', borderColor: colors.keep },
  cancelPaymentButton:{width:'100%',minHeight:44,borderRadius:13,borderWidth:1,borderColor:colors.danger,backgroundColor:'rgba(255,92,114,.08)',alignItems:'center',justifyContent:'center',marginTop:6,paddingHorizontal:10},
  cancelPaymentButtonText:{color:colors.danger,fontSize:11,fontWeight:'900',letterSpacing:.45,textAlign:'center'},
  paymentActionConfirmText: { color: colors.keep, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  // Adel (08/09/2026) : "trois petits boutons en dessous bien aligné" --
  // même rangée, même hauteur, un seul en surbrillance (celui déjà choisi).
  rsvpRow: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 2 },
  rsvpButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: 'transparent' },
  rsvpButtonText: { fontSize: 11, fontWeight: '900', textAlign: 'center' },
  rsvpGoing: { borderColor: colors.keep },
  rsvpGoingActive: { backgroundColor: 'rgba(56,217,144,.16)' },
  rsvpGoingText: { color: colors.keep },
  rsvpMaybe: { borderColor: colors.warning },
  rsvpMaybeActive: { backgroundColor: 'rgba(240,180,41,.16)' },
  rsvpMaybeText: { color: colors.warning },
  rsvpNotGoing: { borderColor: colors.pass },
  rsvpNotGoingActive: { backgroundColor: 'rgba(255,108,140,.16)' },
  rsvpNotGoingText: { color: colors.pass },
  detailBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  detailSheet: { width: '100%', maxWidth: 440, maxHeight: '86%', borderRadius: 26, padding: 20, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  detailClose: { position: 'absolute', top: 10, right: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  detailCloseText: { color: colors.white, fontSize: 20, lineHeight: 22, fontWeight: '700' },
  detailImage: { width: '100%', height: 180, borderRadius: 18, backgroundColor: colors.backgroundCard },
  detailTitle: { color: colors.white, fontSize: 19, fontWeight: '900', marginTop: 14, paddingRight: 30 },
  detailMeta: { color: colors.primaryLight, fontSize: 12, fontWeight: '800', marginTop: 4 },
  detailDescription: { color: colors.textPrimary, fontSize: 13, lineHeight: 20, marginTop: 14, fontWeight: '600' },
  detailYoutube: { alignSelf: 'flex-start', marginTop: 14, minHeight: 44, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(255,92,114,0.12)', borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  detailYoutubeText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  battleAction: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  battleRefuse: { backgroundColor: colors.backgroundCard, borderColor: colors.danger },
  battleAccept: { backgroundColor: colors.warning, borderColor: colors.warning },
  battleRefuseText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  battleAcceptText: { color: colors.black, fontSize: 13, fontWeight: '900' },
  cardFooter: { minHeight: 44, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readAction: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  deleteOneText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, backgroundColor: colors.backgroundElevated, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { color: colors.primaryLight, fontSize: 28, marginBottom: spacing.sm },
  muted: { color:colors.white, fontSize: 12, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
});
import { displayUsername } from '../utils/displayUsername';