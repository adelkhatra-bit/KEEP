import type { CanonicalTrack } from '@keep/music';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { blockUser } from '../services/moderationService';
import TrackPreviewButton from './TrackPreviewButton';
import { commitKeep } from '../services/keepTrackAction';
import {
  loadMusicAgoraMessages,
  loadMusicAgoraConversations,
  loadMusicAgoraDirectMessages,
  loadMusicAgoraGroups,
  loadMusicAgoraGroupMessages,
  loadMusicAgoraGroupMembers,
  searchMusicAgoraGroupPeople,
  createMusicAgoraGroup,
  acceptMusicAgoraGroup,
  declineMusicAgoraGroup,
  inviteMusicAgoraGroupMember,
  removeMusicAgoraGroupMember,
  loadMusicAgoraRooms,
  loadMusicAgoraSettings,
  loadMusicAgoraSharePreflight,
  loadMarketplacePaymentTermsAccepted,
  acceptMarketplacePaymentTerms,
  extractMusicAgoraPayoutQrUrl,
  shareMyPayoutQrInAgora,
  loadMusicAgoraSharedTrack,
  MusicAgoraConversation,
  MusicAgoraGroup,
  MusicAgoraGroupPerson,
  MusicAgoraGroupMember,
  MusicAgoraMessage,
  MusicAgoraPaymentMode,
  MusicAgoraRevealMode,
  MusicAgoraSharePreflight,
  MusicAgoraRoom,
  MusicAgoraSurface,
  postMusicAgoraMessage,
  postMusicAgoraGroupMessage,
  reportMusicAgoraMessage,
  saveMusicAgoraSettings,
  setMusicAgoraRoomSubscription,
  subscribeMusicAgoraRoom,
  subscribeMusicAgoraGroup,
  subscribeMusicAgoraMembership,
} from '../services/musicAgoraService';
import { markPlaylistSaleBuyerPaid, markPlaylistSalePaid, PlaylistPurchaseRequest, purchasePlaylistOfferWithFree, requestPlaylistPurchase } from '../services/playlistSaleService';
import { buildPayoutCheckoutUrl, getMyPayoutMethods } from '../services/payoutLinkService';

const PAGE_SIZE = 24;
const LOKI_REACTION_TOKEN = '[[KEEP_LOKI_REACTION]]';
const LOKI_REACTION_TEXT = '◉ᴗ◉✦';
const QUICK_REACTIONS: ReadonlyArray<{ label: string; payload: string; loki?: boolean }> = [
  { label: '❤️', payload: '❤️' },
  { label: '🔥', payload: '🔥' },
  { label: '👏', payload: '👏' },
  { label: '🎵', payload: '🎵' },
  { label: '😂', payload: '😂' },
  { label: '🤯', payload: '🤯' },
  { label: '🙌', payload: '🙌' },
  { label: '⚡', payload: '⚡' },
  { label: LOKI_REACTION_TEXT, payload: LOKI_REACTION_TEXT, loki: true },
];

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const delta = Math.max(0, Date.now() - t);
  if (delta < 60_000) return 'maintenant';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function readableError(error: unknown): string {
  const message = String((error as any)?.message || error || '');
  if (message.includes('message_blocked_language')) return 'Message refusé : garde le débat musical, enlève les insultes.';
  if (message.includes('rate_limited')) return 'Trop de messages d’un coup. Réessaie dans un instant.';
  if (message.includes('authentication_required')) return 'Ta session Loki doit être actualisée avant d’écrire. Rouvre le Tchat ; aucune reconnexion ne devrait être nécessaire.';
  if (message.includes('public_profile_required')) return 'Ton compte est connecté, mais ton profil public doit être actif pour écrire dans le Tchat.';
  if (message.includes('message_length')) return 'Ton message peut aller jusqu’à 2 000 caractères.';
  if (message.includes('blocked_relationship')) return 'Cette conversation n’est pas disponible.';
  if (message.includes('paid_share_requires_recipient')) return 'Pour faire payer une pépite, réponds directement à un utilisateur.';
  if (message.includes('SELLER_PAYOUT_NOT_CONFIGURED')) return 'Ajoute d’abord ton lien de paiement dans ton profil.';
  if (message.includes('CHAT_TRACK_OFFER_ALREADY_PENDING')) return 'Une demande de paiement est déjà en cours pour cette pépite et cet utilisateur.';
  if (message.includes('PLAYLIST_SALE_LOCKED')) return 'Ton accès aux ventes de pépites n’est pas encore débloqué.';
  if (message.includes('CHAT_TRACK_RESALE_FORBIDDEN') || message.includes('TRACK_NOT_OWNED_FOR_SALE')) return 'Cette musique ne t’appartient pas : tu peux la partager et l’écouter, mais pas la remettre en vente.';
  if (message.includes('TARGET_ALREADY_OWNS_TRACK') || message.includes('CHAT_TARGET_ALREADY_OWNS_TRACK')) return 'Cet utilisateur a déjà cette musique. Aucune vente ni débit FREE n’est nécessaire.';
  return 'Impossible de publier pour le moment.';
}

export default function MusicAgoraPanel({
  currentProfileId,
  enabled,
  onOpenProfile,
  shareableTracks = [],
  compact = false,
  compactSide = 'right',
  initialRoomSlug,
  initialReplyTarget,
  initialGroupId,
  onCompactClose,
}: {
  currentProfileId: string;
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  shareableTracks?: Array<CanonicalTrack & { canSell?: boolean; sourceUsername?: string | null }>;
  compact?: boolean;
  compactSide?: 'left' | 'right';
  initialRoomSlug?: string;
  initialReplyTarget?: { profileId: string; username: string };
  initialGroupId?: string;
  onCompactClose?: () => void;
}) {
  const [rooms, setRooms] = useState<MusicAgoraRoom[]>([]);
  const [roomSlug, setRoomSlug] = useState('');
  const [messages, setMessages] = useState<MusicAgoraMessage[]>([]);
  const [conversations, setConversations] = useState<MusicAgoraConversation[]>([]);
  const [groups, setGroups] = useState<MusicAgoraGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<MusicAgoraGroup | null>(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupPeople, setGroupPeople] = useState<MusicAgoraGroupPerson[]>([]);
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [groupMembersOpen, setGroupMembersOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<MusicAgoraGroupMember[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [chatMode, setChatMode] = useState<'MESSAGES' | 'PLACE'>(compact ? 'MESSAGES' : 'PLACE');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [homeEnabled, setHomeEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [settingsSurfaces, setSettingsSurfaces] = useState<MusicAgoraSurface[]>(['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE','NOTIFICATIONS']);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ profileId: string; username: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOptionsOpen, setShareOptionsOpen] = useState(false);
  const [sharedTrack, setSharedTrack] = useState<CanonicalTrack | null>(null);
  const [shareRevealMode, setShareRevealMode] = useState<MusicAgoraRevealMode>('MASKED');
  const [sharePaymentMode, setSharePaymentMode] = useState<MusicAgoraPaymentMode>('NONE');
  const [shareFreePrice, setShareFreePrice] = useState(3);
  const [shareFreePriceInput, setShareFreePriceInput] = useState('3');
  const [shareMoneyPriceCents, setShareMoneyPriceCents] = useState(100);
  const [shareMoneyPriceInput, setShareMoneyPriceInput] = useState('1');
  const [sharePreflight, setSharePreflight] = useState<MusicAgoraSharePreflight | null>(null);
  const [sharePreflightBusy, setSharePreflightBusy] = useState(false);
  const [shareOwnershipOpen, setShareOwnershipOpen] = useState(false);
  const [keepBusyId, setKeepBusyId] = useState<string | null>(null);
  const [offerBusyId, setOfferBusyId] = useState<string | null>(null);
  const [paymentTermsAccepted, setPaymentTermsAccepted] = useState(false);
  const [myPayoutQrUrl, setMyPayoutQrUrl] = useState('');
  const [paymentCheckout, setPaymentCheckout] = useState<PlaylistPurchaseRequest | null>(null);
  const [reactionPaletteOpen, setReactionPaletteOpen] = useState(false);
  const [composerActionsOpen, setComposerActionsOpen] = useState(false);
  const [inboxQuery, setInboxQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'ALL' | 'GROUPS' | 'DIRECT' | 'INVITES'>('ALL');
  const chatScrollRef = useRef<ScrollView | null>(null);
  const musicAura = useRef(new Animated.Value(0)).current;
  const initialScrollDone = useRef(false);
  const browsingHistoryRef = useRef(false);
  const forceBottomRef = useRef(false);
  const ownSendPendingRef = useRef<number | null>(null);
  const bottomRetryTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const { height: viewportHeight } = useWindowDimensions();
  const safeArea = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const baseViewportHeightRef = useRef(viewportHeight);


  useEffect(() => {
    if (!groupCreateOpen && !groupMembersOpen) return undefined;
    const timer = setTimeout(() => {
      void searchMusicAgoraGroupPeople(groupSearch, 40)
        .then(setGroupPeople)
        .catch(() => setGroupPeople([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [groupSearch, groupCreateOpen, groupMembersOpen]);

  useEffect(() => {
    if (!compact) {
      setKeyboardInset(0);
      return undefined;
    }

    if (Platform.OS === 'web') {
      const win = typeof window !== 'undefined' ? window : null;
      const viewport = win?.visualViewport;
      if (!win || !viewport) return undefined;
      const sync = () => {
        const covered = Math.max(0, Math.round(win.innerHeight - viewport.height - viewport.offsetTop));
        setKeyboardInset(covered >= 80 ? covered : 0);
        if (covered < 80 && win.innerHeight > baseViewportHeightRef.current) baseViewportHeightRef.current = win.innerHeight;
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
      };
      viewport.addEventListener('resize', sync);
      viewport.addEventListener('scroll', sync);
      sync();
      return () => {
        viewport.removeEventListener('resize', sync);
        viewport.removeEventListener('scroll', sync);
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      const reportedHeight = Math.max(0, Number(event.endCoordinates?.height || 0));
      const reportedTop = Math.max(0, Number(event.endCoordinates?.screenY || 0));
      const coveredByTop = reportedTop > 0 ? Math.max(0, baseViewportHeightRef.current - reportedTop) : 0;
      setKeyboardInset(Math.max(reportedHeight, coveredByTop));
      setTimeout(() => followChatBottom(true), Platform.OS === 'ios' ? 80 : 40);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
      if (ownSendPendingRef.current !== null || forceBottomRef.current) {
        setTimeout(() => followChatBottom(false), Platform.OS === 'ios' ? 120 : 60);
      }
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [compact, viewportHeight]);

  const compactBottom = 0;

  useEffect(() => {
    if (!enabled) {
      setPaymentTermsAccepted(false);
      setMyPayoutQrUrl('');
      return;
    }
    void loadMarketplacePaymentTermsAccepted().then(setPaymentTermsAccepted).catch(() => setPaymentTermsAccepted(false));
    void getMyPayoutMethods().then((methods) => setMyPayoutQrUrl(methods.qrUrl)).catch(() => setMyPayoutQrUrl(''));
  }, [enabled]);

  const askPaymentTerms = (onAccepted?: () => void) => {
    Alert.alert(
      'Conditions des paiements entre utilisateurs',
      'Loki Music ne reçoit pas l’argent. Pour un paiement externe, l’acheteur paie directement le vendeur. La musique reste bloquée tant que le vendeur n’a pas confirmé avoir reçu le paiement.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'LIRE LES CONDITIONS', onPress: () => { void Linking.openURL('https://adelkhatra-bit.github.io/KEEP/terms/'); } },
        {
          text: 'J’ACCEPTE',
          onPress: () => {
            void acceptMarketplacePaymentTerms('chat').then(() => {
              setPaymentTermsAccepted(true);
              onAccepted?.();
            }).catch(() => Alert.alert('Conditions', 'Impossible d’enregistrer ton acceptation pour le moment.'));
          },
        },
      ],
    );
  };

  const sharePayoutQr = async () => {
    if (!replyTarget?.profileId || !roomSlug) return;
    if (!myPayoutQrUrl) {
      Alert.alert('QR PayPal', 'Ajoute d’abord ton QR PayPal dans les réglages de paiement de ton profil.');
      return;
    }
    try {
      await shareMyPayoutQrInAgora(roomSlug, replyTarget.profileId);
      await refresh(roomSlug, true);
      followChatBottom(true);
    } catch (error) {
      Alert.alert('QR PayPal', readableError(error));
    }
  };

  const followChatBottom = (animated = true) => {
    browsingHistoryRef.current = false;
    forceBottomRef.current = true;
    bottomRetryTimersRef.current.forEach(clearTimeout);
    bottomRetryTimersRef.current = [];
    const scroll = (withAnimation: boolean) => {
      requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({ animated: withAnimation }));
    };
    scroll(animated);
    [70, 180, 340, 620].forEach((delay, index) => {
      bottomRetryTimersRef.current.push(setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: index === 0 ? animated : false });
      }, delay));
    });
    bottomRetryTimersRef.current.push(setTimeout(() => {
      forceBottomRef.current = false;
      ownSendPendingRef.current = null;
      bottomRetryTimersRef.current = [];
    }, 900));
  };

  const room = useMemo(() => rooms.find((item) => item.slug === roomSlug) ?? rooms[0] ?? null, [rooms, roomSlug]);

  useEffect(() => {
    if (initialRoomSlug && rooms.some((item) => item.slug === initialRoomSlug)) setRoomSlug(initialRoomSlug);
  }, [initialRoomSlug, rooms]);

  useEffect(() => {
    if (!initialReplyTarget?.profileId) return;
    setReplyTarget(initialReplyTarget);
    setChatMode('MESSAGES');
    initialScrollDone.current = false;
    setTimeout(() => followChatBottom(false), 60);
  }, [initialReplyTarget?.profileId, initialReplyTarget?.username]);

  useEffect(() => {
    if (!initialGroupId) return;
    setChatMode('MESSAGES');
    setReplyTarget(null);
    const group = groups.find((item) => item.id === initialGroupId);
    if (!group) return;
    if (group.myStatus === 'ACTIVE') {
      setActiveGroup(group);
      initialScrollDone.current = false;
    } else {
      // An invitation stays in the inbox so ACCEPT / REFUSER remain visible.
      setActiveGroup(null);
    }
  }, [initialGroupId, groups]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(musicAura, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(musicAura, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [musicAura]);

  useEffect(() => {
    if (!sharedTrack?.id) {
      setSharePreflight(null);
      setShareOwnershipOpen(false);
      return;
    }
    setShareOwnershipOpen(false);
    let live = true;
    setSharePreflight(null);
    setSharePreflightBusy(true);
    loadMusicAgoraSharePreflight(sharedTrack.id, replyTarget?.profileId ?? null)
      .then((state) => {
        if (!live) return;
        setSharePreflight(state);
        if (!state.canSell || state.targetOwnsTrack) setSharePaymentMode('NONE');
      })
      .catch(() => { if (live) setSharePreflight(null); })
      .finally(() => { if (live) setSharePreflightBusy(false); });
    return () => { live = false; };
  }, [sharedTrack?.id, replyTarget?.profileId]);

  useEffect(() => {
    if (sharePaymentMode !== 'NONE') setShareRevealMode('MASKED');
  }, [sharePaymentMode]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      loadMusicAgoraRooms().catch(() => []),
      enabled ? loadMusicAgoraSettings().catch(() => ({ homeEnabled: false, notificationsEnabled: true, surfaces: ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'] as MusicAgoraSurface[] })) : Promise.resolve({ homeEnabled: false, notificationsEnabled: true, surfaces: ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'] as MusicAgoraSurface[] }),
      enabled ? loadMusicAgoraConversations(40).catch(() => []) : Promise.resolve([] as MusicAgoraConversation[]),
      enabled ? loadMusicAgoraGroups().catch(() => []) : Promise.resolve([] as MusicAgoraGroup[]),
    ]).then(([rows, settings, inbox, groupRows]) => {
      if (!live) return;
      setRooms(rows);
      setConversations(inbox);
      setGroups(groupRows);
      setRoomSlug((current) => current || initialRoomSlug || rows[0]?.slug || 'place');
      setHomeEnabled(settings.homeEnabled);
      setNotificationsEnabled(settings.notificationsEnabled);
      setSettingsSurfaces(settings.surfaces);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enabled]);

  const refreshInbox = async () => {
    try {
      const [directRows, groupRows] = await Promise.all([
        loadMusicAgoraConversations(40).catch(() => [] as MusicAgoraConversation[]),
        loadMusicAgoraGroups().catch(() => [] as MusicAgoraGroup[]),
      ]);
      setConversations(directRows);
      setGroups(groupRows);
      setActiveGroup((current) => current ? (groupRows.find((row) => row.id === current.id) ?? current) : null);
    } catch {
      setConversations([]);
      setGroups([]);
    }
  };


  useEffect(() => {
    if (!enabled || !currentProfileId) return undefined;
    return subscribeMusicAgoraMembership(currentProfileId, () => {
      void refreshInbox();
    });
  }, [enabled, currentProfileId]);

  const openDirectThread = async (target: { profileId: string; username: string }, preferredRoomSlug?: string | null) => {
    initialScrollDone.current = false;
    browsingHistoryRef.current = false;
    forceBottomRef.current = true;
    setChatMode('MESSAGES');
    setActiveGroup(null);
    setReplyTarget(target);
    setSharedTrack(null);
    setSharePaymentMode('NONE');
    setDraft('');
    setMessages([]);
    if (preferredRoomSlug) setRoomSlug(preferredRoomSlug);
    setLoading(true);
    try {
      const rows = await loadMusicAgoraDirectMessages(target.profileId, undefined, PAGE_SIZE);
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setTimeout(() => followChatBottom(false), 40);
    } catch (error) {
      Alert.alert('Conversation', readableError(error));
    } finally {
      setLoading(false);
    }
  };

  const openGroup = async (group: MusicAgoraGroup) => {
    setReplyTarget(null);
    setActiveGroup(group);
    setSharedTrack(null);
    setSharePaymentMode('NONE');
    setDraft('');
    initialScrollDone.current = false;
    setMessages([]);
    if (group.myStatus !== 'ACTIVE') return;
    setLoading(true);
    try {
      const rows = await loadMusicAgoraGroupMessages(group.id, undefined, PAGE_SIZE);
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setTimeout(() => followChatBottom(false), 40);
    } catch (error) {
      Alert.alert('Conversation', readableError(error));
    } finally {
      setLoading(false);
    }
  };

  const refreshGroupMembers = async (groupId = activeGroup?.id) => {
    if (!groupId) {
      setGroupMembers([]);
      return;
    }
    try { setGroupMembers(await loadMusicAgoraGroupMembers(groupId)); }
    catch { setGroupMembers([]); }
  };

  const openGroupMembers = async () => {
    if (!activeGroup?.id) return;
    setGroupSearch('');
    setGroupPeople([]);
    setGroupMembersOpen(true);
    await Promise.all([
      refreshGroupMembers(activeGroup.id),
      searchMusicAgoraGroupPeople('', 40).then(setGroupPeople).catch(() => setGroupPeople([])),
    ]);
  };

  const searchGroupPeople = async (query = groupSearch) => {
    try { setGroupPeople(await searchMusicAgoraGroupPeople(query, 40)); }
    catch { setGroupPeople([]); }
  };

  const openCreateGroup = () => {
    setGroupName('');
    setGroupSearch('');
    setGroupSelectedIds([]);
    setGroupPeople([]);
    setGroupCreateOpen(true);
    void searchMusicAgoraGroupPeople('', 40).then(setGroupPeople).catch(() => setGroupPeople([]));
  };

  const toggleGroupPerson = (profileId: string) => {
    setGroupSelectedIds((current) => {
      if (current.includes(profileId)) return current.filter((id) => id !== profileId);
      if (current.length >= 44) {
        Alert.alert('45 personnes maximum', 'Une conversation peut contenir le créateur et jusqu’à 44 autres personnes.');
        return current;
      }
      return [...current, profileId];
    });
  };

  const createGroup = async () => {
    if (groupBusy) return;
    const name = groupName.trim();
    if (!name) {
      Alert.alert('Nom de la conversation', 'Donne un nom à cette conversation.');
      return;
    }
    setGroupBusy(true);
    try {
      const groupId = await createMusicAgoraGroup(name, groupSelectedIds);
      setGroupCreateOpen(false);
      setGroupName('');
      setGroupSearch('');
      setGroupSelectedIds([]);
      await refreshInbox();
      const rows = await loadMusicAgoraGroups();
      setGroups(rows);
      const created = rows.find((row) => row.id === groupId);
      if (created) await openGroup(created);
    } catch (error: any) {
      const raw = String(error?.message || error || '');
      Alert.alert('Conversation', raw.includes('group_member_limit_45') ? '45 personnes maximum dans une conversation.' : 'Impossible de créer cette conversation.');
    } finally {
      setGroupBusy(false);
    }
  };

  const acceptGroupInvite = async (group: MusicAgoraGroup) => {
    if (groupBusy) return;
    setGroupBusy(true);
    try {
      await acceptMusicAgoraGroup(group.id);
      await refreshInbox();
      const rows = await loadMusicAgoraGroups();
      setGroups(rows);
      const accepted = rows.find((row) => row.id === group.id);
      if (accepted) await openGroup(accepted);
    } catch {
      Alert.alert('Invitation', 'Impossible d’accepter cette invitation pour le moment.');
    } finally {
      setGroupBusy(false);
    }
  };

  const declineGroupInvite = async (group: MusicAgoraGroup) => {
    if (groupBusy) return;
    setGroupBusy(true);
    try {
      await declineMusicAgoraGroup(group.id);
      setGroups((current) => current.filter((row) => row.id !== group.id));
    } catch {
      Alert.alert('Invitation', 'Impossible de refuser cette invitation pour le moment.');
    } finally {
      setGroupBusy(false);
    }
  };

  const inviteToActiveGroup = async (person: MusicAgoraGroupPerson) => {
    if (!activeGroup?.id || activeGroup.myRole !== 'OWNER' || groupBusy) return;
    setGroupBusy(true);
    try {
      await inviteMusicAgoraGroupMember(activeGroup.id, person.profileId);
      await refreshGroupMembers(activeGroup.id);
      await refreshInbox();
    } catch (error: any) {
      const raw = String(error?.message || error || '');
      Alert.alert('Ajouter une personne', raw.includes('group_member_limit_45') ? 'Cette conversation contient déjà 45 personnes ou invitations.' : 'Impossible d’envoyer cette invitation.');
    } finally {
      setGroupBusy(false);
    }
  };

  const removeFromActiveGroup = async (member: MusicAgoraGroupMember) => {
    if (!activeGroup?.id || member.role === 'OWNER' || groupBusy) return;
    if (activeGroup.myRole !== 'OWNER' && member.profileId !== currentProfileId) return;
    setGroupBusy(true);
    try {
      await removeMusicAgoraGroupMember(activeGroup.id, member.profileId);
      if (member.profileId === currentProfileId) {
        setActiveGroup(null);
        setMessages([]);
      } else {
        await refreshGroupMembers(activeGroup.id);
      }
      await refreshInbox();
    } catch {
      Alert.alert('Conversation', 'Impossible de retirer cette personne pour le moment.');
    } finally {
      setGroupBusy(false);
    }
  };

  const refresh = async (slug = roomSlug, quiet = false) => {
    if (!slug && !(chatMode === 'MESSAGES' && (replyTarget?.profileId || activeGroup?.id))) return;
    if (!quiet) setLoading(true);
    try {
      const rows = chatMode === 'MESSAGES' && activeGroup?.id
        ? await loadMusicAgoraGroupMessages(activeGroup.id, undefined, PAGE_SIZE)
        : chatMode === 'MESSAGES' && replyTarget?.profileId
          ? await loadMusicAgoraDirectMessages(replyTarget.profileId, undefined, PAGE_SIZE)
          : await loadMusicAgoraMessages(slug, undefined, PAGE_SIZE);
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
      if (chatMode === 'MESSAGES') void refreshInbox();
    } catch {
      if (!quiet) {
        setMessages([]);
        setHasMore(false);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (!roomSlug) return;
    initialScrollDone.current = false;
    if (chatMode === 'MESSAGES' && !replyTarget?.profileId && !activeGroup?.id) {
      setMessages([]);
      setHasMore(false);
      void refreshInbox();
    } else {
      void refresh(roomSlug);
    }
    if (enabled && homeEnabled && !activeGroup?.id) void setMusicAgoraRoomSubscription(roomSlug, true, notificationsEnabled).catch(() => {});
    const unsubscribe = activeGroup?.id
      ? subscribeMusicAgoraGroup(activeGroup.id, () => {
          browsingHistoryRef.current = false;
          forceBottomRef.current = true;
          void refresh(roomSlug, true).finally(() => followChatBottom(true));
          void refreshInbox();
          if (groupMembersOpen) void refreshGroupMembers(activeGroup.id);
        })
      : subscribeMusicAgoraRoom(roomSlug, () => {
          if (chatMode === 'MESSAGES' && !replyTarget?.profileId) {
            void refreshInbox();
          } else {
            browsingHistoryRef.current = false;
            forceBottomRef.current = true;
            void refresh(roomSlug, true).finally(() => followChatBottom(true));
          }
        });

    // Realtime handles messages immediately. This low-frequency timer is only
    // a resilience/settings sync and avoids a 5-second polling load at scale.
    const timer = setInterval(() => {
      if (chatMode === 'MESSAGES' && !replyTarget?.profileId && !activeGroup?.id) void refreshInbox();
      if (compact && enabled) {
        void loadMusicAgoraSettings().then((settings) => {
          setHomeEnabled(settings.homeEnabled);
          setNotificationsEnabled(settings.notificationsEnabled);
          setSettingsSurfaces(settings.surfaces);
        }).catch(() => {});
      }
    }, 60000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [roomSlug, enabled, homeEnabled, notificationsEnabled, compact, chatMode, replyTarget?.profileId, activeGroup?.id, groupMembersOpen]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = setTimeout(() => {
      // Même comportement pour La Place, les messages directs et les groupes :
      // à l'ouverture / après un nouveau message, la conversation se cale sur
      // le plus récent. Le chargement de "PLUS ANCIENS" ne change pas le
      // dernier id et ne provoque donc pas de saut vers le bas.
      followChatBottom(initialScrollDone.current);
      initialScrollDone.current = true;
    }, 40);
    return () => clearTimeout(timer);
  }, [messages[messages.length - 1]?.id, roomSlug, replyTarget?.profileId, activeGroup?.id, chatMode]);

  const loadOlder = async () => {
    if (!roomSlug || !messages.length || olderBusy) return;
    setOlderBusy(true);
    try {
      const rows = chatMode === 'MESSAGES' && activeGroup?.id
        ? await loadMusicAgoraGroupMessages(activeGroup.id, messages[0]?.id, PAGE_SIZE)
        : chatMode === 'MESSAGES' && replyTarget?.profileId
          ? await loadMusicAgoraDirectMessages(replyTarget.profileId, messages[0]?.id, PAGE_SIZE)
          : await loadMusicAgoraMessages(roomSlug, messages[0]?.id, PAGE_SIZE);
      setMessages((current) => [...rows.filter((row) => !current.some((item) => item.id === row.id)), ...current]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setOlderBusy(false);
    }
  };

  const updateHomeChat = async (next: boolean, quiet = false) => {
    if (!enabled || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const settings = await saveMusicAgoraSettings(next, notificationsEnabled, settingsSurfaces);
      setHomeEnabled(settings.homeEnabled);
      setNotificationsEnabled(settings.notificationsEnabled);
      setSettingsSurfaces(settings.surfaces);
      if (!quiet) {
        Alert.alert(
          settings.homeEnabled ? 'Tchat activé' : 'Tchat désactivé sur le profil',
          settings.homeEnabled
            ? 'Le mini-Tchat reste maintenant visible sur ton profil et se met à jour automatiquement.'
            : 'La petite fenêtre disparaît du profil. Tu peux la réactiver à tout moment dans Notifications ou dans le Tchat.',
        );
      }
    } catch {
      Alert.alert('Tchat', 'Impossible de modifier ce réglage pour le moment.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const updateNotifications = async (next: boolean) => {
    if (!enabled || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const settings = await saveMusicAgoraSettings(homeEnabled, next, settingsSurfaces);
      setNotificationsEnabled(settings.notificationsEnabled);
      setSettingsSurfaces(settings.surfaces);
      if (roomSlug && homeEnabled) void setMusicAgoraRoomSubscription(roomSlug, true, next).catch(() => {});
    } finally {
      setSettingsBusy(false);
    }
  };

  const publish = async () => {
    const body = draft.trim();
    const requestedFreePrice = Number(shareFreePriceInput || 0);
    const requestedMoneyCents = Math.round(Number((shareMoneyPriceInput || '').replace(',', '.')) * 100);
    if (!enabled) {
      Alert.alert('Compte requis', 'Connecte ton compte Loki Music pour participer au Tchat.');
      return;
    }
    if (!roomSlug || posting || (!sharedTrack && body.length < 1)) return;
    if (sharedTrack && sharePaymentMode === 'FREE' && (!Number.isInteger(requestedFreePrice) || requestedFreePrice < 1 || requestedFreePrice > 10000)) {
      Alert.alert('Montant FREE', 'Choisis entre 1 et 10 000 FREE.');
      return;
    }
    if (sharedTrack && sharePaymentMode === 'MONEY' && (!Number.isFinite(requestedMoneyCents) || requestedMoneyCents < 50 || requestedMoneyCents > 500000)) {
      Alert.alert('Montant €', 'Choisis un montant entre 0,50 € et 5 000 €.');
      return;
    }
    if (sharedTrack && sharePaymentMode !== 'NONE' && sharePreflight?.targetOwnsTrack) {
      Alert.alert('Déjà dans sa musique', `@${sharePreflight.targetUsername || replyTarget?.username || 'cet utilisateur'} possède déjà cette musique. Loki bloque toute vente ou débit FREE inutile.`);
      return;
    }
    if (sharedTrack && sharePaymentMode !== 'NONE' && !sharePreflight?.canSell) {
      Alert.alert('Partage oui · revente non', sharePreflight?.sourceUsername ? `Cette musique vient déjà de @${sharePreflight.sourceUsername}. Tu peux la partager ou la faire écouter, mais pas la revendre.` : 'Cette musique ne t’appartient pas pour la revente. Tu peux la partager et la faire écouter, sans demander de FREE ni d’argent.');
      return;
    }
    if (sharedTrack && sharePaymentMode !== 'NONE' && activeGroup?.id) {
      Alert.alert('Partage de groupe', 'Dans une conversation à plusieurs, la pépite peut être partagée et écoutée, mais une demande de FREE ou de paiement doit être envoyée dans une conversation directe.');
      return;
    }
    if (sharedTrack && sharePaymentMode !== 'NONE' && !replyTarget?.profileId) {
      Alert.alert('Choisis le destinataire', 'Pour demander des FREE ou un paiement, réponds directement à l’utilisateur concerné.');
      return;
    }
    if (sharedTrack && sharePaymentMode === 'MONEY' && Platform.OS !== 'web') {
      Alert.alert('Paiement € via Loki Web', 'Le paiement externe pour une musique numérique reste désactivé dans l’app iOS/Android. Utilise FREE ici ou crée l’offre depuis Loki Web.');
      return;
    }
    if (sharedTrack && sharePaymentMode === 'MONEY' && !paymentTermsAccepted) {
      askPaymentTerms(() => setSharePaymentMode('MONEY'));
      return;
    }
    setPosting(true);
    try {
      if (activeGroup?.id) {
        const sentId = await postMusicAgoraGroupMessage(activeGroup.id, body, {
          sharedTrackId: sharedTrack?.id ?? null,
          revealMode: sharedTrack ? shareRevealMode : 'NONE',
        });
        ownSendPendingRef.current = sentId || -1;
      } else {
        const sentId = await postMusicAgoraMessage(roomSlug, body, {
          targetProfileId: replyTarget?.profileId ?? null,
          sharedTrackId: sharedTrack?.id ?? null,
          revealMode: sharedTrack ? (sharePaymentMode === 'NONE' ? shareRevealMode : 'MASKED') : 'NONE',
          paymentMode: sharedTrack ? sharePaymentMode : 'NONE',
          freePrice: sharedTrack && sharePaymentMode === 'FREE' ? requestedFreePrice : null,
          priceCents: sharedTrack && sharePaymentMode === 'MONEY' ? requestedMoneyCents : null,
          currencyCode: 'EUR',
        });
        ownSendPendingRef.current = sentId || -1;
      }
      setDraft('');
      setSharedTrack(null);
      setShareOptionsOpen(false);
      setShareRevealMode('MASKED');
      setSharePaymentMode('NONE');
      setShareFreePrice(3);
      setShareFreePriceInput('3');
      setShareMoneyPriceCents(100);
      setShareMoneyPriceInput('1');
      setSharePreflight(null);
      browsingHistoryRef.current = false;
      forceBottomRef.current = true;

      // Recharge explicitement LA conversation dans laquelle le message vient
      // d'être envoyé. C'était le bug principal : une réponse directe pouvait
      // être envoyée, puis l'UI rechargeait le salon public et le message
      // semblait avoir disparu jusqu'à ce que l'utilisateur cherche en scroll.
      if (activeGroup?.id) {
        const rows = await loadMusicAgoraGroupMessages(activeGroup.id, undefined, PAGE_SIZE);
        setMessages(rows);
        setHasMore(rows.length === PAGE_SIZE);
      } else if (replyTarget?.profileId) {
        setChatMode('MESSAGES');
        const rows = await loadMusicAgoraDirectMessages(replyTarget.profileId, undefined, PAGE_SIZE);
        setMessages(rows);
        setHasMore(rows.length === PAGE_SIZE);
      } else {
        const rows = await loadMusicAgoraMessages(roomSlug, undefined, PAGE_SIZE);
        setMessages(rows);
        setHasMore(rows.length === PAGE_SIZE);
      }
      followChatBottom(false);
    } catch (error) {
      Alert.alert('Tchat', readableError(error));
    } finally {
      setPosting(false);
    }
  };

  const insertQuickReaction = (value: string) => {
    setDraft((current) => {
      const separator = current && !/\s$/.test(current) ? ' ' : '';
      return `${current}${separator}${value}`.slice(0, 2000);
    });
    setReactionPaletteOpen(false);
    setTimeout(() => followChatBottom(false), 50);
  };

  const keepSharedTrack = async (message: MusicAgoraMessage, visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!message.sharedTrackId || keepBusyId) return;
    setKeepBusyId(message.sharedTrackId);
    try {
      const track = await loadMusicAgoraSharedTrack(message.sharedTrackId);
      if (!track) throw new Error('track_not_found');
      const result = await commitKeep(track, [], undefined, {
        visibility,
        context: {
          source: 'community_chat',
          sourceProfileId: message.profileId,
          sourceUsername: message.username,
          agoraMessageId: message.id,
        },
      });
      Alert.alert(
        result.alreadyKept ? 'Déjà dans ta musique' : 'Pépite ajoutée',
        result.alreadyKept
          ? 'Ce morceau était déjà dans ta musique. Aucun FREE n’a été repris.'
          : `Ajoutée en ${visibility === 'PUBLIC' ? 'public' : 'privé'} avec @${message.username} enregistré comme source du partage.`,
      );
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      Alert.alert('GARDER', msg.includes('INSUFFICIENT') ? 'Tu n’as pas assez de FREE pour garder cette pépite.' : 'Impossible d’ajouter cette musique pour le moment.');
    } finally {
      setKeepBusyId(null);
    }
  };

  const askKeepSharedTrack = (message: MusicAgoraMessage) => {
    if (!message.sharedTrackId) return;
    Alert.alert(
      'Garder cette pépite · 3 FREE',
      'Choisis comment elle apparaîtra sur ton profil. Si tu l’as déjà, Loki ne crée aucun doublon et ne reprend aucun FREE.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Privé', onPress: () => void keepSharedTrack(message, 'PRIVATE') },
        { text: 'Public', onPress: () => void keepSharedTrack(message, 'PUBLIC') },
      ],
    );
  };

  const unlockSharedOffer = async (message: MusicAgoraMessage) => {
    if (!message.saleOfferId || offerBusyId) return;
    if (message.paymentMode === 'MONEY' && !paymentTermsAccepted) {
      askPaymentTerms(() => void unlockSharedOffer(message));
      return;
    }
    setOfferBusyId(message.saleOfferId);
    try {
      if (message.paymentMode === 'FREE') {
        const result = await purchasePlaylistOfferWithFree(message.saleOfferId);
        Alert.alert(
          result.alreadyUnlocked ? 'Déjà débloquée' : 'Pépite débloquée',
          result.alreadyUnlocked
            ? 'Cette musique est déjà dans ton Loki Music. Aucun FREE supplémentaire n’a été repris.'
            : `La pépite a rejoint ton Loki Music. Solde restant : ${result.remainingFree} FREE.`,
        );
        await refresh(roomSlug, true);
        return;
      }

      if (message.paymentMode === 'MONEY') {
        if (Platform.OS !== 'web') {
          Alert.alert('Paiement € via Loki Web', 'Pour les contenus numériques, le paiement externe reste désactivé dans l’app iOS/Android tant que le canal Store conforme n’est pas validé.');
          return;
        }

        if (message.viewerPaymentId && message.viewerPaymentStatus === 'PENDING') {
          if (message.viewerMarkedPaid) {
            Alert.alert('Paiement signalé', 'Le vendeur doit maintenant confirmer la réception. La musique sera débloquée automatiquement après sa confirmation.');
            return;
          }
          await markPlaylistSaleBuyerPaid(message.viewerPaymentId);
          Alert.alert('Paiement signalé', 'Le vendeur vient d’être notifié. Dès qu’il confirme la réception, la musique se débloque automatiquement.');
          await refresh(roomSlug, true);
          return;
        }

        const request = await requestPlaylistPurchase(message.saleOfferId);
        if (!request.payoutLink && !request.payoutQrUrl) {
          Alert.alert('Paiement indisponible', 'Le vendeur doit d’abord enregistrer son PayPal.Me ou son QR PayPal.');
          return;
        }
        setPaymentCheckout(request);
        await refresh(roomSlug, true);
      }
    } catch (error: any) {
      const raw = String(error?.message || error || '');
      if (raw.includes('NOT_ENOUGH_FREE')) {
        const m = raw.match(/NOT_ENOUGH_FREE:(\d+):(\d+)/);
        Alert.alert('FREE insuffisants', m ? `Il faut ${m[2]} FREE. Ton solde actuel est ${m[1]}.` : 'Ton solde FREE est insuffisant.');
      } else {
        Alert.alert('Déblocage', readableError(error));
      }
    } finally {
      setOfferBusyId(null);
    }
  };

  const confirmSellerReceived = async (message: MusicAgoraMessage) => {
    if (!message.viewerPaymentId || !message.saleOfferId || offerBusyId) return;
    setOfferBusyId(message.saleOfferId);
    try {
      const delivered = await markPlaylistSalePaid(message.viewerPaymentId);
      Alert.alert(
        'Paiement confirmé',
        `Paiement reçu. ${delivered.trackCount || 1} morceau${(delivered.trackCount || 1) > 1 ? 'x' : ''} vient d’être débloqué pour l’acheteur.`,
      );
      await refresh(roomSlug, true);
    } catch (error) {
      Alert.alert('Paiement', readableError(error));
    } finally {
      setOfferBusyId(null);
    }
  };

  const moderate = (message: MusicAgoraMessage) => {
    if (message.profileId === currentProfileId) return;
    Alert.alert(
      `@${message.username}`,
      'Action sur ce message',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Répondre', onPress: () => { void openDirectThread({ profileId: message.profileId, username: message.username }); } },
        {
          text: 'Signaler',
          onPress: () => {
            Alert.alert('Signaler', 'Choisis la raison.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Spam', onPress: () => void reportMusicAgoraMessage(message.id, 'spam').then(() => Alert.alert('Merci', 'Le message a été signalé.')).catch(() => {}) },
              { text: 'Harcèlement', onPress: () => void reportMusicAgoraMessage(message.id, 'harassment').then(() => Alert.alert('Merci', 'Le message a été signalé.')).catch(() => {}) },
              { text: 'Inapproprié', onPress: () => void reportMusicAgoraMessage(message.id, 'inappropriate_content').then(() => Alert.alert('Merci', 'Le message a été signalé.')).catch(() => {}) },
            ]);
          },
        },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: () => void blockUser(message.profileId).then(() => setMessages((rows) => rows.filter((row) => row.profileId !== message.profileId))).catch(() => {}),
        },
      ],
    );
  };

  const paymentLocked = Boolean(
    sharedTrack && (
      (sharedTrack as any).canSell === false ||
      (sharePreflight && (!sharePreflight.canSell || sharePreflight.targetOwnsTrack))
    )
  );

  const normalizedInboxQuery = inboxQuery.trim().toLocaleLowerCase('fr-FR');
  const inboxMatches = (value: string) => !normalizedInboxQuery || String(value || '').toLocaleLowerCase('fr-FR').includes(normalizedInboxQuery);
  const visibleInboxGroups = groups.filter((group) => {
    if (inboxFilter === 'DIRECT') return false;
    if (inboxFilter === 'INVITES' && group.myStatus !== 'INVITED') return false;
    if (inboxFilter === 'GROUPS' && group.myStatus !== 'ACTIVE') return false;
    return inboxMatches(`${group.name} ${group.ownerUsername} ${group.lastBody}`);
  });
  const visibleInboxConversations = conversations.filter((item) => {
    if (inboxFilter === 'GROUPS' || inboxFilter === 'INVITES') return false;
    return inboxMatches(`${item.username} ${item.lastBody}`);
  });
  const activeDirectConversation = replyTarget
    ? conversations.find((item) => item.profileId === replyTarget.profileId) ?? null
    : null;
  const compactThreadOpen = chatMode === 'PLACE' || Boolean(replyTarget || activeGroup);
  const leaveCompactThread = () => {
    setChatMode('MESSAGES');
    setReplyTarget(null);
    setActiveGroup(null);
    setMessages([]);
    void refreshInbox();
  };
  if (compact && !enabled) return null;

  return <KeyboardAvoidingView
    enabled={compact && Platform.OS !== 'web'}
    behavior={compact && Platform.OS === 'ios' ? 'padding' : compact && Platform.OS === 'android' ? 'height' : undefined}
    keyboardVerticalOffset={0}
    testID={compact ? "loki-chat-fullscreen" : undefined}
    accessibilityLabel={compact ? "Messagerie Loki" : undefined}
    style={[
      s.shell,
      compact && s.shellCompact,
      compact && {
        top: 0,
        bottom: compactBottom,
        minHeight: 0,
        paddingTop: Math.max(10, safeArea.top + 8),
        paddingBottom: keyboardInset > 0 ? 12 : Math.max(14, safeArea.bottom + 14),
      },
      compact && (compactSide === 'left' ? s.shellCompactLeft : s.shellCompactRight),
    ]}
  >
    {compact ? (
      <>
        <View style={s.compactHeader}>
          {compactThreadOpen ? (
            <TouchableOpacity style={s.compactThreadBack} onPress={leaveCompactThread} accessibilityRole="button" accessibilityLabel="Retour aux conversations">
              <Text style={s.compactThreadBackText}>‹</Text>
            </TouchableOpacity>
          ) : null}

          {activeGroup ? (
            <View style={s.compactThreadAvatar}><Text style={s.compactThreadAvatarText}>👥</Text></View>
          ) : replyTarget ? (
            activeDirectConversation?.avatarUrl
              ? <Image source={{ uri: activeDirectConversation.avatarUrl }} style={s.compactThreadAvatar} />
              : <View style={[s.compactThreadAvatar, s.avatarFallback]}><Text style={s.avatarText}>{replyTarget.username.slice(0,1).toUpperCase()}</Text></View>
          ) : chatMode === 'PLACE' ? (
            <View style={s.compactThreadAvatar}><Text style={s.compactThreadAvatarText}>◎</Text></View>
          ) : null}

          <View style={s.compactHeaderCopy}>
            <Text style={s.compactTitle}>{activeGroup ? activeGroup.name : replyTarget ? replyTarget.username : chatMode === 'PLACE' ? 'La Place' : 'Chat'}</Text>
            <Text style={s.compactMeta}>
              {activeGroup
                ? `Groupe privé · ${activeGroup.memberCount} membre${activeGroup.memberCount > 1 ? 's' : ''}`
                : replyTarget
                  ? 'Conversation privée'
                  : chatMode === 'PLACE'
                    ? 'Salon public · tout le monde peut rejoindre'
                    : 'Messages, salons et invitations'}
            </Text>
          </View>

          {activeGroup?.myStatus === 'ACTIVE' ? (
            <TouchableOpacity style={s.compactHeaderAction} onPress={() => void openGroupMembers()} accessibilityRole="button" accessibilityLabel="Gérer les membres du groupe">
              <Text style={s.compactHeaderActionText}>👥</Text>
            </TouchableOpacity>
          ) : chatMode === 'MESSAGES' && !replyTarget && !activeGroup ? (
            <TouchableOpacity style={s.compactHeaderAction} onPress={openCreateGroup} accessibilityRole="button" accessibilityLabel="Créer une conversation">
              <Text style={s.compactHeaderActionText}>＋</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={s.compactClose}
            onPress={() => { if (onCompactClose) onCompactClose(); else void updateHomeChat(false, true); }}
            disabled={settingsBusy}
            accessibilityRole="button"
            accessibilityLabel="Fermer la messagerie"
          >
            <Text style={s.compactCloseText}>×</Text>
          </TouchableOpacity>
        </View>
      </>
    ) : <View style={s.intro}>
      <View style={s.titleRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.kicker}>TCHAT LOKI</Text>
          <Text style={s.title}>Parle, partage et garde tes pépites.</Text>
        </View>
        {enabled ? <TouchableOpacity style={[s.homeToggle, homeEnabled && s.homeToggleOn]} disabled={settingsBusy} onPress={() => void updateHomeChat(!homeEnabled)} accessibilityRole="switch" accessibilityState={{ checked: homeEnabled }}>
          <Text style={[s.homeToggleText, homeEnabled && s.homeToggleTextOn]}>{homeEnabled ? 'MESSAGERIE · ACTIVÉE' : 'MESSAGERIE · DÉSACTIVÉE'}</Text>
        </TouchableOpacity> : null}
      </View>
      <Text style={s.subtitle}>Messages publics par salon, réponses ciblées, musique écoutable. Filtre d’insultes, signalement, blocage et anti-spam actifs.</Text>
      {enabled && homeEnabled ? <TouchableOpacity onPress={() => void updateNotifications(!notificationsEnabled)} style={s.notificationsToggle}>
        <Text style={s.notificationsToggleText}>{notificationsEnabled ? '🔔 Notifications du salon activées' : '🔕 Notifications du salon coupées'}</Text>
      </TouchableOpacity> : null}
    </View>}

    {!compact ? <View style={s.rooms}>
      {rooms.map((item) => (
        <TouchableOpacity key={item.slug} style={[s.roomChip, roomSlug === item.slug && s.roomChipOn]} onPress={() => setRoomSlug(item.slug)}>
          <Text style={[s.roomChipText, roomSlug === item.slug && s.roomChipTextOn]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View> : null}

    {!compact && room ? <View style={s.prompt}><Text style={s.promptLabel}>QUESTION DU SALON</Text><Text style={s.promptText}>{room.prompt}</Text></View> : null}

    {loading ? <View style={s.loading}><ActivityIndicator color={colors.primaryLight}/></View> : null}

    {compact && chatMode === 'MESSAGES' && !replyTarget && !activeGroup ? (
      <ScrollView style={s.inbox} contentContainerStyle={s.inboxList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.inboxSearchWrap}>
          <Text style={s.inboxSearchIcon}>⌕</Text>
          <TextInput
            value={inboxQuery}
            onChangeText={setInboxQuery}
            placeholder="Rechercher une conversation…"
            placeholderTextColor={colors.textMutedGrey}
            style={s.inboxSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.inboxFilters}>
          {([
            ['ALL','Tous'],
            ['GROUPS','Salons'],
            ['DIRECT','Privés'],
            ['INVITES','Invitations'],
          ] as const).map(([key,label]) => (
            <TouchableOpacity key={key} style={[s.inboxFilterChip, inboxFilter === key && s.inboxFilterChipOn]} onPress={() => setInboxFilter(key)}>
              <Text style={[s.inboxFilterText, inboxFilter === key && s.inboxFilterTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {(inboxFilter === 'ALL' || inboxFilter === 'GROUPS') ? (
          <TouchableOpacity
            testID="loki-chat-place-entry"
            style={s.conversationRow}
            onPress={() => {
              initialScrollDone.current = false;
              browsingHistoryRef.current = false;
              forceBottomRef.current = true;
              setChatMode('PLACE');
              setReplyTarget(null);
              setActiveGroup(null);
              setMessages([]);
              void refresh(roomSlug).finally(() => followChatBottom(false));
            }}
            accessibilityLabel="Ouvrir La Place"
          >
            <View style={[s.conversationAvatar, s.publicRoomAvatar]}><Text style={s.publicRoomAvatarText}>◎</Text></View>
            <View style={s.conversationCopy}>
              <View style={s.conversationTop}>
                <Text style={s.conversationName}>La Place</Text>
                <Text style={s.publicRoomBadge}>PUBLIC</Text>
              </View>
              <Text style={s.conversationPreview} numberOfLines={1}>Salon public · tout le monde peut rejoindre</Text>
            </View>
            <Text style={s.conversationArrow}>›</Text>
          </TouchableOpacity>
        ) : null}

        {visibleInboxGroups.map((group) => (
          <View key={`group:${group.id}`} style={[s.groupRow, group.myStatus === 'INVITED' && s.groupRowInvited]}>
            <TouchableOpacity
              style={s.groupMain}
              disabled={group.myStatus !== 'ACTIVE'}
              onPress={() => void openGroup(group)}
              accessibilityLabel={`Ouvrir la conversation ${group.name}`}
            >
              <View style={s.groupAvatar}><Text style={s.groupAvatarText}>👥</Text></View>
              <View style={s.conversationCopy}>
                <View style={s.conversationTop}>
                  <Text style={s.conversationName} numberOfLines={1}>{group.name}</Text>
                  {group.lastCreatedAt ? <Text style={s.conversationTime}>{ago(group.lastCreatedAt)}</Text> : null}
                </View>
                <Text style={s.conversationPreview} numberOfLines={1}>
                  {group.myStatus === 'INVITED'
                    ? `Invitation de @${group.ownerUsername}`
                    : group.lastBody || `${group.memberCount} personnes`}
                </Text>
              </View>
              {group.myStatus === 'ACTIVE' ? <Text style={s.conversationArrow}>›</Text> : null}
            </TouchableOpacity>
            {group.myStatus === 'INVITED' ? (
              <View style={s.groupInviteActions}>
                <TouchableOpacity style={s.groupDecline} disabled={groupBusy} onPress={() => void declineGroupInvite(group)}>
                  <Text style={s.groupDeclineText}>REFUSER</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.groupAccept} disabled={groupBusy} onPress={() => void acceptGroupInvite(group)}>
                  <Text style={s.groupAcceptText}>ACCEPTER</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}

        {visibleInboxConversations.map((item) => (
          <TouchableOpacity
            key={item.profileId}
            style={s.conversationRow}
            onPress={() => {
              void openDirectThread(
                { profileId: item.profileId, username: item.username },
                item.lastRoomSlug,
              );
            }}
            accessibilityLabel={`Ouvrir la conversation avec ${item.username}`}
          >
            {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={s.conversationAvatar}/> : <View style={[s.conversationAvatar,s.avatarFallback]}><Text style={s.avatarText}>{item.username.slice(0,1).toUpperCase()}</Text></View>}
            <View style={s.conversationCopy}>
              <View style={s.conversationTop}><Text style={s.conversationName}>@{item.username}</Text><Text style={s.conversationTime}>{ago(item.lastCreatedAt)}</Text></View>
              <Text style={s.conversationPreview} numberOfLines={1}>{item.lastSharedTrackId ? '♫ ' : ''}{item.lastBody || 'Musique partagée'}</Text>
            </View>
            <Text style={s.conversationArrow}>›</Text>
          </TouchableOpacity>
        ))}
        {!visibleInboxConversations.length && !visibleInboxGroups.length && !loading ? (
          <View style={s.inboxEmpty}>
            <Text style={s.inboxEmptyTitle}>Aucune conversation pour l’instant</Text>
            <Text style={s.inboxEmptyText}>Réponds à un utilisateur depuis une notification ou depuis La Place. La conversation apparaîtra ici.</Text>
          </View>
        ) : null}
      </ScrollView>
    ) : (
    <ScrollView
      ref={chatScrollRef}
      style={compact ? s.chatScrollCompact : s.chatScroll}
      contentContainerStyle={[s.list, compact && s.listCompact]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
        browsingHistoryRef.current = distanceFromBottom > 56;
      }}
      onContentSizeChange={() => {
        if (ownSendPendingRef.current !== null || !initialScrollDone.current || forceBottomRef.current || !browsingHistoryRef.current) {
          requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({ animated: false }));
          if (ownSendPendingRef.current !== null) {
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 120);
          }
        }
      }}
      onLayout={() => {
        if (ownSendPendingRef.current !== null || forceBottomRef.current) {
          requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({ animated: false }));
        }
      }}
    >
      {hasMore ? <TouchableOpacity style={s.older} disabled={olderBusy} onPress={() => void loadOlder()}><Text style={s.olderText}>{olderBusy ? 'CHARGEMENT…' : '↑ PLUS ANCIENS'}</Text></TouchableOpacity> : null}
      {messages.map((message) => (
        <View key={message.id} style={[s.message, message.profileId === currentProfileId ? s.messageOwn : s.messageOther, message.targetProfileId && s.directMessage]}>
          {!replyTarget ? (
            <TouchableOpacity style={s.author} onPress={() => onOpenProfile(message.username)}>
              {message.avatarUrl ? <Image source={{ uri: message.avatarUrl }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>{message.username.slice(0,1).toUpperCase()}</Text></View>}
              <View style={s.authorCopy}>
                <Text style={s.username} numberOfLines={1}>@{message.username}</Text>
                <Text style={s.meta}>{message.targetUsername ? `pour @${message.targetUsername} · ` : ''}{ago(message.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {(message.body === LOKI_REACTION_TOKEN || message.body === LOKI_REACTION_TEXT) ? (
            <View style={s.lokiReactionBubble}><Text style={s.lokiReactionText}>{LOKI_REACTION_TEXT} · LOKI</Text></View>
          ) : extractMusicAgoraPayoutQrUrl(message.body) ? (
            <View style={s.qrMessage}>
              <Text style={s.qrMessageTitle}>QR PAYPAL · @{message.username}</Text>
              <Image source={{ uri: extractMusicAgoraPayoutQrUrl(message.body)! }} style={s.qrMessageImage} resizeMode="contain" />
              <Text style={s.qrMessageHint}>QR partagé depuis le profil Loki Music du vendeur.</Text>
            </View>
          ) : <Text style={s.body}>{message.body}</Text>}

          {message.sharedTrackId ? <Animated.View style={[s.musicCard, {
            transform: [{ scale: musicAura.interpolate({ inputRange: [0, 1], outputRange: [1, 1.008] }) }],
          }]}>
            {message.musicRevealMode === 'FULL' && message.trackArtworkUrl
              ? <Image source={{ uri: message.trackArtworkUrl }} style={s.musicArt}/>
              : <View style={[s.musicArt,s.musicArtMasked]}><Text style={s.musicMaskIcon}>♫</Text></View>}
            <View style={s.musicCopy}>
              <Text style={s.musicKicker}>{message.musicRevealMode === 'MASKED' ? 'PÉPITE MASQUÉE' : 'PÉPITE PARTAGÉE'}</Text>
              <Text style={s.musicTitle} numberOfLines={1}>{message.musicRevealMode === 'FULL' ? (message.trackTitle || 'Musique') : 'Écoute avant de découvrir'}</Text>
              <Text style={s.musicArtist} numberOfLines={1}>{message.musicRevealMode === 'FULL' ? (message.trackArtist || `via @${message.username}`) : `via @${message.username}`}</Text>
            </View>
            <TrackPreviewButton trackKey={message.sharedTrackId} previewUrl={message.trackPreviewUrl || undefined} compact small />
            {message.saleOfferId ? (
              message.profileId === currentProfileId ? (
                message.paymentMode === 'MONEY' && message.viewerPaymentStatus === 'PENDING' && message.viewerMarkedPaid && message.viewerPaymentId ? (
                  <TouchableOpacity
                    style={s.sellerConfirm}
                    disabled={offerBusyId === message.saleOfferId}
                    onPress={() => void confirmSellerReceived(message)}
                    accessibilityLabel="Paiement reçu, débloquer la musique"
                  >
                    <Text style={s.sellerConfirmText}>{offerBusyId === message.saleOfferId ? '…' : 'PAIEMENT REÇU · DÉBLOQUER'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.offerStatusOwn}>
                    <Text style={s.offerStatusOwnText}>
                      {message.paymentMode === 'FREE'
                        ? `PROPOSÉE · ${message.freePrice ?? 0} FREE`
                        : message.viewerPaymentStatus === 'COMPLETED'
                          ? '✓ PAIEMENT CONFIRMÉ'
                          : `PROPOSÉE · ${(message.priceCents / 100).toFixed(2)} ${message.currencyCode}`}
                    </Text>
                  </View>
                )
              ) : message.viewerUnlocked ? (
                <View style={s.offerUnlocked}><Text style={s.offerUnlockedText}>✓ DÉBLOQUÉE</Text></View>
              ) : message.paymentMode === 'MONEY' && Platform.OS !== 'web' ? (
                <View style={[s.keepMusic, s.keepMusicDisabled]} accessibilityLabel="Paiement en euros indisponible dans l’application">
                  <Text style={s.keepMusicText}>€ INDISPONIBLE SUR L’APP</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.keepMusic}
                  disabled={offerBusyId === message.saleOfferId || (message.paymentMode === 'MONEY' && message.viewerMarkedPaid)}
                  onPress={() => void unlockSharedOffer(message)}
                >
                  <Text style={s.keepMusicText}>
                    {offerBusyId === message.saleOfferId
                      ? '…'
                      : message.paymentMode === 'FREE'
                        ? `DÉBLOQUER · ${message.freePrice ?? 0} FREE`
                        : message.viewerPaymentStatus === 'PENDING'
                          ? (message.viewerMarkedPaid ? 'ATTENTE VENDEUR' : 'J’AI PAYÉ')
                          : `PAYER · ${(message.priceCents / 100).toFixed(2)} ${message.currencyCode}`}
                  </Text>
                </TouchableOpacity>
              )
            ) : (
              <TouchableOpacity
                style={[s.keepMusic, message.viewerOwnsTrack && s.keepMusicDisabled]}
                disabled={keepBusyId === message.sharedTrackId || message.viewerOwnsTrack}
                onPress={() => askKeepSharedTrack(message)}
              >
                <Text style={s.keepMusicText}>{keepBusyId === message.sharedTrackId ? '…' : message.viewerOwnsTrack ? 'DÉJÀ CHEZ TOI' : 'GARDER · 3 FREE'}</Text>
              </TouchableOpacity>
            )}
          </Animated.View> : null}
          {message.sharedTrackId ? (
            <View style={s.musicAttribution}>
              <Text style={s.musicAttributionText}>
                {message.discoveredByUsername
                  ? `Découverte par @${message.discoveredByUsername}`
                  : `Partagée par @${message.username}`}
                {message.discoveredByUsername && message.discoveredByUsername !== message.username
                  ? ` · mise à l’écoute par @${message.username}`
                  : ''}
              </Text>
              {!message.senderCanResell ? (
                <Text style={s.musicShareOnlyText}>🔒 PARTAGE UNIQUEMENT · revente bloquée</Text>
              ) : null}
              {message.targetOwnsTrack && message.targetUsername ? (
                <Text style={s.musicAlreadyText}>✓ @{message.targetUsername} l’a déjà</Text>
              ) : message.viewerOwnsTrack && message.profileId !== currentProfileId ? (
                <Text style={s.musicAlreadyText}>✓ déjà dans ta musique</Text>
              ) : null}
            </View>
          ) : null}

          {replyTarget ? <Text style={s.directBubbleTime}>{ago(message.createdAt)}</Text> : null}
          {message.profileId !== currentProfileId ? (
            <View style={s.messageActions}>
              {!replyTarget ? (
                <TouchableOpacity style={s.reply} onPress={() => { void openDirectThread({ profileId: message.profileId, username: message.username }); }}><Text style={s.replyText}>RÉPONDRE</Text></TouchableOpacity>
              ) : null}
              <TouchableOpacity style={s.more} onPress={() => moderate(message)} accessibilityLabel={`Actions pour le message de ${message.username}`}><Text style={s.moreText}>•••</Text></TouchableOpacity>
            </View>
          ) : null}
        </View>
      ))}
      {!loading && !messages.length ? <Text style={s.empty}>Le salon est calme. Lance la première discussion.</Text> : null}
    </ScrollView>
    )}

    {enabled && !(compact && chatMode === 'MESSAGES' && !replyTarget) ? <View style={[s.composer, compact && s.composerCompact]}>
      {replyTarget && !(compact && chatMode === 'MESSAGES') ? <View style={s.replyTarget}><Text style={s.replyTargetText}>Réponse à @{replyTarget.username}</Text><TouchableOpacity onPress={() => setReplyTarget(null)}><Text style={s.replyTargetClose}>×</Text></TouchableOpacity></View> : null}
      {sharedTrack ? <View style={s.selectedMusic}>
        <View style={s.selectedMusicCompactRow}>
          <View style={s.selectedMusicThumbWrap}>
            {sharedTrack.artworkUrl
              ? <Image source={{ uri: sharedTrack.artworkUrl }} style={s.selectedMusicThumb} resizeMode="cover" />
              : <View style={[s.selectedMusicThumb, s.selectedMusicArtworkFallback]}><Text style={s.selectedMusicThumbFallback}>♫</Text></View>}
            {((sharePreflight && !sharePreflight.canSell) || (sharedTrack as any).canSell === false)
              ? <View style={s.selectedMusicLockBadge}><Text style={s.selectedMusicLockBadgeText}>🔒</Text></View>
              : null}
          </View>
          <View style={s.selectedMusicCompactCopy}>
            <Text style={s.selectedMusicEyebrow}>MORCEAU SÉLECTIONNÉ</Text>
            <Text style={s.selectedMusicCompactTitle} numberOfLines={1}>{sharedTrack.title}</Text>
            <Text style={s.selectedMusicCompactArtist} numberOfLines={1}>{sharedTrack.artist}</Text>
            {paymentLocked ? (
              <TouchableOpacity
                style={s.shareLockPill}
                onPress={() => setShareOwnershipOpen((value) => !value)}
                accessibilityRole="button"
                accessibilityState={{ expanded: shareOwnershipOpen }}
                accessibilityLabel="🔒 partage uniquement · pourquoi FREE et paiement sont verrouillés"
              >
                <Text style={s.shareLockPillText}>
                  {sharePreflight?.targetOwnsTrack ? '🔒 DÉJÀ CHEZ LUI' : '🔒 PARTAGE UNIQUEMENT'} {shareOwnershipOpen ? '⌃' : '⌄'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TrackPreviewButton trackKey={sharedTrack.id} previewUrl={sharedTrack.previewUrl || undefined} compact />
          <TouchableOpacity
            style={s.shareAccordionToggle}
            onPress={() => setShareOptionsOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: shareOptionsOpen }}
            accessibilityLabel={shareOptionsOpen ? 'Replier les options de la pépite' : 'Déplier les options de la pépite'}
          >
            <Text style={s.shareAccordionToggleText}>{shareOptionsOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.removeMusicCompact} onPress={() => { setSharedTrack(null); setShareOptionsOpen(false); setShareOwnershipOpen(false); setSharePaymentMode('NONE'); setSharePreflight(null); }} accessibilityLabel="Retirer cette musique">
            <Text style={s.removeMusicText}>×</Text>
          </TouchableOpacity>
        </View>

        {shareOwnershipOpen && paymentLocked ? (
          <View style={s.ownershipLock}>
            <View style={s.ownershipLockHead}>
              <Text style={s.ownershipLockIcon}>🔒</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.ownershipLockTitle}>
                  {sharePreflight?.targetOwnsTrack ? 'AUCUN PAIEMENT NÉCESSAIRE' : 'PARTAGE AUTORISÉ · REVENTE BLOQUÉE'}
                </Text>
                <Text style={s.ownershipLockSub}>
                  {sharePreflight?.targetOwnsTrack
                    ? `@${sharePreflight.targetUsername || replyTarget?.username || 'cet utilisateur'} possède déjà le morceau`
                    : ((sharePreflight?.sourceUsername || (sharedTrack as any).sourceUsername)
                      ? `Source : @${sharePreflight?.sourceUsername || (sharedTrack as any).sourceUsername}`
                      : 'Musique provenant d’un autre utilisateur')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShareOwnershipOpen(false)} accessibilityLabel="Replier l’explication du cadenas">
                <Text style={s.accordionArrow}>⌃</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.ownershipLockBody}>
              {sharePreflight?.targetOwnsTrack
                ? 'Loki bloque FREE et € pour éviter un débit ou un paiement inutile. Tu peux toujours partager et faire écouter ce morceau.'
                : 'Tu peux partager et faire écouter ce morceau. Comme il ne t’appartient pas pour la revente, FREE et € restent verrouillés.'}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={s.validateMusicPinned}
          disabled={posting || sharePreflightBusy || (sharePaymentMode !== 'NONE' && paymentLocked)}
          onPress={() => void publish()}
          accessibilityRole="button"
          accessibilityLabel="Partager le morceau dans le chat"
        >
          <Text style={s.validateMusicText}>{posting ? 'ENVOI…' : 'PARTAGER LE MORCEAU'}</Text>
        </TouchableOpacity>

        {shareOptionsOpen ? <ScrollView style={s.shareAccordionBody} contentContainerStyle={s.shareAccordionContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <View style={s.revealChoices}>
            <TouchableOpacity style={[s.revealChip,shareRevealMode==='MASKED'&&s.revealChipOn]} onPress={() => setShareRevealMode('MASKED')}><Text style={s.revealChipText}>MASQUÉ</Text></TouchableOpacity>
            <TouchableOpacity
              style={[s.revealChip,shareRevealMode==='FULL'&&s.revealChipOn,sharePaymentMode!=='NONE'&&s.revealChipDisabled]}
              disabled={sharePaymentMode!=='NONE'}
              onPress={() => setShareRevealMode('FULL')}
            ><Text style={s.revealChipText}>TITRE + JAQUETTE</Text></TouchableOpacity>
          </View>
          {sharePaymentMode !== 'NONE' ? <Text style={s.maskedSaleRule}>🔒 Vente = identité masquée jusqu’au déblocage. L’extrait reste écoutable.</Text> : null}
          {sharePreflightBusy ? <Text style={s.preflightText}>Vérification propriété…</Text> : null}
          {sharePreflight?.targetOwnsTrack ? <Text style={s.preflightOwned}>✓ @{sharePreflight.targetUsername || replyTarget?.username || 'cet utilisateur'} a déjà cette musique · aucune vente nécessaire</Text> : null}
          {sharePreflight && !sharePreflight.canSell ? (
            <Text style={s.preflightBlocked}>🔒 PARTAGE UNIQUEMENT · vente FREE/€ bloquée{sharePreflight.sourceUsername ? ` · source @${sharePreflight.sourceUsername}` : ''}</Text>
          ) : null}
          <View style={s.paymentChoices}>
            <Text style={s.paymentLabel}>ACCÈS</Text>
            <TouchableOpacity style={[s.paymentChip,sharePaymentMode==='NONE'&&s.paymentChipOn]} onPress={() => setSharePaymentMode('NONE')}><Text style={s.paymentChipText}>STANDARD</Text></TouchableOpacity>
            <TouchableOpacity
              style={[s.paymentChip,sharePaymentMode==='FREE'&&s.paymentChipOn,paymentLocked&&s.paymentChipDisabled]}
              disabled={sharePreflightBusy}
              onPress={() => {
                if (paymentLocked) {
                  setShareOwnershipOpen(true);
                  return;
                }
                setSharePaymentMode('FREE');
              }}
              accessibilityLabel={paymentLocked ? 'FREE verrouillé, afficher pourquoi' : 'Utiliser FREE'}
            ><Text style={s.paymentChipText}>{paymentLocked ? '🔒 FREE' : 'FREE'}</Text></TouchableOpacity>
            {Platform.OS === 'web' ? <TouchableOpacity
              style={[s.paymentChip,sharePaymentMode==='MONEY'&&s.paymentChipOn,paymentLocked&&s.paymentChipDisabled]}
              disabled={sharePreflightBusy}
              onPress={() => {
                if (paymentLocked) {
                  setShareOwnershipOpen(true);
                  return;
                }
                if (!paymentTermsAccepted) {
                  askPaymentTerms(() => setSharePaymentMode('MONEY'));
                  return;
                }
                setSharePaymentMode('MONEY');
              }}
              accessibilityLabel={paymentLocked ? 'Paiement euro verrouillé, afficher pourquoi' : 'Utiliser un paiement en euros'}
            ><Text style={s.paymentChipText}>{paymentLocked ? '🔒 €' : '€'}</Text></TouchableOpacity> : null}
          </View>
          {sharePaymentMode === 'FREE' ? <View style={s.priceBlock}>
            <View style={s.priceChoices}>
              {[1,3,5,10,20].map((amount) => <TouchableOpacity key={amount} style={[s.priceChip,shareFreePrice===amount&&s.priceChipOn]} onPress={() => { setShareFreePrice(amount); setShareFreePriceInput(String(amount)); }}><Text style={s.priceChipText}>{amount}</Text></TouchableOpacity>)}
            </View>
            <View style={s.customPriceRow}>
              <TextInput
                value={shareFreePriceInput}
                onChangeText={(value) => {
                  const clean = value.replace(/[^0-9]/g, '').slice(0,5);
                  setShareFreePriceInput(clean);
                  const next = Number(clean || 0);
                  if (next >= 1 && next <= 10000) setShareFreePrice(next);
                }}
                keyboardType="number-pad"
                placeholder="Montant"
                placeholderTextColor={colors.textMutedGrey}
                style={s.customPriceInput}
              />
              <Text style={s.priceUnit}>FREE</Text>
            </View>
          </View> : null}
          {sharePaymentMode === 'MONEY' && Platform.OS === 'web' ? <View style={s.priceBlock}>
            <View style={s.priceChoices}>
              {[50,100,200,300,500,1000].map((amount) => <TouchableOpacity key={amount} style={[s.priceChip,shareMoneyPriceCents===amount&&s.priceChipOn]} onPress={() => { setShareMoneyPriceCents(amount); setShareMoneyPriceInput(String(amount/100)); }}><Text style={s.priceChipText}>{(amount/100).toFixed(amount % 100 ? 2 : 0)}€</Text></TouchableOpacity>)}
            </View>
            <View style={s.customPriceRow}>
              <TextInput
                value={shareMoneyPriceInput}
                onChangeText={(value) => {
                  const clean = value.replace(',', '.').replace(/[^0-9.]/g, '').slice(0,8);
                  setShareMoneyPriceInput(clean);
                  const euros = Number(clean || 0);
                  const cents = Math.round(euros * 100);
                  if (cents >= 50 && cents <= 500000) setShareMoneyPriceCents(cents);
                }}
                keyboardType="decimal-pad"
                placeholder="Montant"
                placeholderTextColor={colors.textMutedGrey}
                style={s.customPriceInput}
              />
              <Text style={s.priceUnit}>€</Text>
            </View>
          </View> : null}

        </ScrollView> : null}
      </View> : null}
      {paymentCheckout ? <View style={s.paymentInline}>
        <View style={s.paymentInlineHead}>
          <View style={{ flex:1,minWidth:0 }}>
            <Text style={s.paymentInlineKicker}>PAIEMENT DIRECT</Text>
            <Text style={s.paymentInlineTitle}>{(paymentCheckout.amountCents / 100).toFixed(2).replace('.', ',')} {paymentCheckout.currencyCode} · @{paymentCheckout.sellerUsername}</Text>
          </View>
          <TouchableOpacity onPress={() => setPaymentCheckout(null)} accessibilityLabel="Fermer le paiement"><Text style={s.paymentInlineClose}>×</Text></TouchableOpacity>
        </View>
        {paymentCheckout.payoutQrUrl ? <Image source={{ uri: paymentCheckout.payoutQrUrl }} style={s.paymentInlineQr} resizeMode="contain" /> : null}
        <Text style={s.paymentInlineHint}>Paie directement le vendeur. Loki ne livre rien avant sa confirmation.</Text>
        <View style={s.paymentInlineActions}>
          {paymentCheckout.payoutLink ? <TouchableOpacity style={s.paymentInlineOpen} onPress={() => void Linking.openURL(buildPayoutCheckoutUrl(paymentCheckout.payoutLink, paymentCheckout.amountCents, paymentCheckout.currencyCode))}><Text style={s.paymentInlineOpenText}>OUVRIR PAYPAL</Text></TouchableOpacity> : null}
          <TouchableOpacity style={s.paymentInlinePaid} onPress={() => {
            const paymentId=paymentCheckout.paymentId;
            void markPlaylistSaleBuyerPaid(paymentId).then(async () => {
              setPaymentCheckout(null);
              Alert.alert('Paiement signalé','Le vendeur doit maintenant confirmer la réception. La musique reste bloquée jusque-là.');
              await refresh(roomSlug,true);
            }).catch(() => Alert.alert('Paiement','Impossible de signaler le paiement pour le moment.'));
          }}><Text style={s.paymentInlinePaidText}>J’AI PAYÉ</Text></TouchableOpacity>
        </View>
      </View> : null}

      {reactionPaletteOpen ? (
        <View style={s.reactionPopover}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.quickReactionsContent}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_REACTIONS.map((reaction) => <TouchableOpacity
              key={reaction.payload}
              style={[s.quickReaction, reaction.loki && s.quickReactionLoki]}
              activeOpacity={0.7}
              onPress={() => insertQuickReaction(reaction.payload)}
              accessibilityLabel={reaction.loki ? 'Ajouter la réaction Loki au message' : `Ajouter ${reaction.label} au message`}
            ><Text style={[s.quickReactionText, reaction.loki && s.quickReactionLokiText]}>{reaction.label}</Text></TouchableOpacity>)}
          </ScrollView>
        </View>
      ) : null}
      {composerActionsOpen ? (
        <View style={s.composerDrawer}>
          <TouchableOpacity
            style={[s.drawerAction, reactionPaletteOpen && s.drawerActionOn]}
            onPress={() => setReactionPaletteOpen((open) => !open)}
            accessibilityLabel="Réactions"
          >
            <Text style={s.drawerActionIcon}>☺</Text>
            <Text style={s.drawerActionText}>RÉACTIONS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.drawerAction]}
            disabled={!shareableTracks.length}
            onPress={() => { setComposerActionsOpen(false); setShareOpen(true); }}
            accessibilityLabel="Ajouter une pépite"
          >
            <Text style={s.drawerActionIcon}>♫</Text>
            <Text style={s.drawerActionText}>MORCEAU</Text>
          </TouchableOpacity>
          {replyTarget ? <TouchableOpacity
            style={[s.drawerAction, !myPayoutQrUrl && s.shareQrOff]}
            onPress={() => { setComposerActionsOpen(false); void sharePayoutQr(); }}
            accessibilityLabel="Partager mon QR PayPal"
          >
            <Text style={s.drawerActionIcon}>▣</Text>
            <Text style={s.drawerActionText}>QR PAYPAL</Text>
          </TouchableOpacity> : null}
          {draft.length >= 1800 ? <Text style={s.counter}>{draft.length}/2000</Text> : null}
        </View>
      ) : null}

      <View style={s.composerBar}>
        <TouchableOpacity
          style={[s.addButton, composerActionsOpen && s.addButtonOn]}
          onPress={() => {
            Keyboard.dismiss();
            setReactionPaletteOpen(false);
            setComposerActionsOpen((open) => !open);
          }}
          accessibilityLabel={composerActionsOpen ? 'Fermer les actions du message' : 'Ouvrir les actions du message'}
        >
          <Text style={s.addButtonText}>{composerActionsOpen ? '×' : '+'}</Text>
        </TouchableOpacity>
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            // Tous les chats utilisent la même règle : pendant la saisie, le
            // dernier message et la dernière ligne restent visibles. Cela vaut
            // pour La Place, les directs et les groupes, pas seulement pour la
            // fenêtre compacte.
            forceBottomRef.current = true;
            requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({ animated: false }));
          }}
          onContentSizeChange={() => {
            // Le TextInput multiligne change réellement de hauteur après
            // onChangeText. On recale une seconde fois après ce layout.
            followChatBottom(false);
          }}
          placeholder="Écris un message…"
          placeholderTextColor={colors.textMutedGrey}
          multiline
          scrollEnabled
          maxLength={2000}
          onFocus={() => {
            setComposerActionsOpen(false);
            setReactionPaletteOpen(false);
            forceBottomRef.current = true;
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
            setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 180);
          }}
          style={[s.input, compact && s.inputCompact]}
        />
        <TouchableOpacity
          style={[s.send, (!sharedTrack && !draft.trim()) && s.sendOff]}
          disabled={(!sharedTrack && !draft.trim()) || posting}
          onPress={() => {
            // Dès le tap Envoyer, verrouille la vue sur le dernier message.
            // Le verrou reste actif jusqu'après le rendu du message serveur et
            // la fin de l'animation clavier : aucun swipe manuel nécessaire.
            ownSendPendingRef.current = -1;
            followChatBottom(false);
            void publish();
          }}
          accessibilityLabel="Envoyer le message"
        >
          <Text style={s.sendText}>{posting ? '…' : '➤'}</Text>
        </TouchableOpacity>
      </View>
    </View> : <View style={s.locked}><Text style={s.lockedText}>Écriture indisponible pour ce profil. Vérifie que le compte est actif et que le profil public est autorisé dans le Tchat.</Text></View>}

    <Modal visible={groupCreateOpen} transparent animationType="fade" onRequestClose={() => setGroupCreateOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.groupSheet}>
        <View style={s.shareHead}>
          <View style={{flex:1}}>
            <Text style={s.shareTitle}>Nouveau groupe privé</Text>
            <Text style={s.shareHint}>Sur invitation uniquement. Choisis les personnes ; tu pourras ensuite en ajouter ou en retirer depuis MEMBRES.</Text>
          </View>
          <TouchableOpacity onPress={() => setGroupCreateOpen(false)}><Text style={s.shareClose}>×</Text></TouchableOpacity>
        </View>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Nom de la conversation"
          placeholderTextColor={colors.textMutedGrey}
          maxLength={80}
          style={s.groupInput}
        />
        <TextInput
          value={groupSearch}
          onChangeText={setGroupSearch}
          placeholder="Rechercher un utilisateur…"
          placeholderTextColor={colors.textMutedGrey}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.groupInput}
        />
        <View style={s.groupSelectionBar}>
          <Text style={s.groupSelectionText}>{groupSelectedIds.length} sélectionné{groupSelectedIds.length > 1 ? 's' : ''} · {44 - groupSelectedIds.length} place{44 - groupSelectedIds.length > 1 ? 's' : ''} disponible{44 - groupSelectedIds.length > 1 ? 's' : ''}</Text>
        </View>
        <ScrollView style={s.groupPeopleList} contentContainerStyle={{gap:7}} keyboardShouldPersistTaps="handled">
          {groupPeople.map((person) => {
            const selected = groupSelectedIds.includes(person.profileId);
            return <TouchableOpacity key={person.profileId} style={[s.groupPersonRow, selected && s.groupPersonRowSelected]} onPress={() => toggleGroupPerson(person.profileId)}>
              {person.avatarUrl ? <Image source={{uri:person.avatarUrl}} style={s.groupPersonAvatar}/> : <View style={[s.groupPersonAvatar,s.avatarFallback]}><Text style={s.avatarText}>{person.username.slice(0,1).toUpperCase()}</Text></View>}
              <Text style={s.groupPersonName}>@{person.username}</Text>
              <View style={[s.groupCheck, selected && s.groupCheckOn]}><Text style={s.groupCheckText}>{selected ? '✓' : '＋'}</Text></View>
            </TouchableOpacity>;
          })}
          {!groupPeople.length ? <Text style={s.empty}>Aucun utilisateur correspondant.</Text> : null}
        </ScrollView>
        <TouchableOpacity style={[s.groupCreateCta, (!groupName.trim() || groupBusy) && s.groupCreateCtaOff]} disabled={!groupName.trim() || groupBusy} onPress={() => void createGroup()}>
          <Text style={s.groupCreateCtaText}>{groupBusy ? 'CRÉATION…' : `CRÉER · ${groupSelectedIds.length + 1} PERSONNE${groupSelectedIds.length ? 'S' : ''}`}</Text>
        </TouchableOpacity>
      </View></View>
    </Modal>

    <Modal visible={groupMembersOpen} transparent animationType="fade" onRequestClose={() => setGroupMembersOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.groupSheet}>
        <View style={s.shareHead}>
          <View style={{flex:1}}>
            <Text style={s.shareTitle}>{activeGroup?.name || 'Conversation'}</Text>
            <Text style={s.shareHint}>{groupMembers.filter((member) => member.status === 'ACTIVE').length} actif{groupMembers.filter((member) => member.status === 'ACTIVE').length > 1 ? 's' : ''} · {groupMembers.filter((member) => member.status === 'INVITED').length} invitation{groupMembers.filter((member) => member.status === 'INVITED').length > 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => setGroupMembersOpen(false)}><Text style={s.shareClose}>×</Text></TouchableOpacity>
        </View>

        <ScrollView style={s.groupMembersList} contentContainerStyle={{gap:7}}>
          {groupMembers.map((member) => (
            <View key={member.profileId} style={s.groupPersonRow}>
              {member.avatarUrl ? <Image source={{uri:member.avatarUrl}} style={s.groupPersonAvatar}/> : <View style={[s.groupPersonAvatar,s.avatarFallback]}><Text style={s.avatarText}>{member.username.slice(0,1).toUpperCase()}</Text></View>}
              <View style={{flex:1,minWidth:0}}>
                <Text style={s.groupPersonName}>@{member.username}</Text>
                <Text style={s.groupMemberMeta}>{member.role === 'OWNER' ? 'Créateur' : member.status === 'INVITED' ? 'Invitation envoyée' : 'Membre'}</Text>
              </View>
              {member.role !== 'OWNER' && (activeGroup?.myRole === 'OWNER' || member.profileId === currentProfileId) ? (
                <TouchableOpacity style={s.groupRemoveButton} disabled={groupBusy} onPress={() => void removeFromActiveGroup(member)}>
                  <Text style={s.groupRemoveText}>{member.profileId === currentProfileId ? 'QUITTER' : 'RETIRER'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>

        {activeGroup?.myRole === 'OWNER' ? (
          <>
            <Text style={s.groupSectionTitle}>AJOUTER DES PERSONNES</Text>
            <TextInput
              value={groupSearch}
              onChangeText={setGroupSearch}
              placeholder="Rechercher un utilisateur…"
              placeholderTextColor={colors.textMutedGrey}
              autoCapitalize="none"
              autoCorrect={false}
              style={s.groupInput}
            />
            <ScrollView style={s.groupInviteList} contentContainerStyle={{gap:7}} keyboardShouldPersistTaps="handled">
              {groupPeople.filter((person) => !groupMembers.some((member) => member.profileId === person.profileId)).map((person) => (
                <View key={person.profileId} style={s.groupPersonRow}>
                  {person.avatarUrl ? <Image source={{uri:person.avatarUrl}} style={s.groupPersonAvatar}/> : <View style={[s.groupPersonAvatar,s.avatarFallback]}><Text style={s.avatarText}>{person.username.slice(0,1).toUpperCase()}</Text></View>}
                  <Text style={s.groupPersonName}>@{person.username}</Text>
                  <TouchableOpacity style={s.groupInviteButton} disabled={groupBusy} onPress={() => void inviteToActiveGroup(person)}>
                    <Text style={s.groupInviteText}>INVITER</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}
      </View></View>
    </Modal>

    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.shareSheet}>
        <View style={s.shareHead}><View style={{ flex:1 }}><Text style={s.shareTitle}>Ajouter une pépite</Text><Text style={s.shareHint}>Choisis un morceau. Dans une conversation privée, tu peux l’envoyer gratuitement, demander des FREE ou préparer un paiement conforme au canal disponible.</Text></View><TouchableOpacity onPress={() => setShareOpen(false)}><Text style={s.shareClose}>×</Text></TouchableOpacity></View>
        <ScrollView style={s.shareList} contentContainerStyle={{ gap:7 }}>
          {shareableTracks.slice(0,60).map((track) => <TouchableOpacity key={track.id} style={s.shareTrackRow} onPress={() => { setSharedTrack(track); setShareRevealMode('MASKED'); setShareOptionsOpen(true); setShareOwnershipOpen(false); setShareOpen(false); }}>
            <View style={s.shareTrackArtWrap}>
              {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.shareTrackArt}/> : <View style={[s.shareTrackArt,s.musicArtMasked]}><Text style={s.musicMaskIcon}>♫</Text></View>}
              {track.canSell === false ? <View style={s.shareTrackLockBadge}><Text style={s.shareTrackLockBadgeText}>🔒</Text></View> : null}
            </View>
            <View style={{ flex:1,minWidth:0 }}>
              <Text style={s.shareTrackTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={s.shareTrackArtist} numberOfLines={1}>{track.artist}</Text>
              {track.canSell === false ? <Text style={s.shareTrackLocked} numberOfLines={2}>🔒 PARTAGE UNIQUEMENT{track.sourceUsername ? ` · appartient à @${track.sourceUsername}` : ' · FREE / € verrouillés'}</Text> : null}
            </View>
            <Text style={s.shareTrackArrow}>›</Text>
          </TouchableOpacity>)}
          {!shareableTracks.length ? <Text style={s.empty}>Ajoute d’abord une musique à ton profil pour pouvoir la partager.</Text> : null}
        </ScrollView>
      </View></View>
    </Modal>
  </KeyboardAvoidingView>;
}

const s=StyleSheet.create({
  shell:{gap:12,paddingBottom:8},
  shellCompact:{position:'absolute',top:0,bottom:0,left:0,right:0,flexGrow:0,flexShrink:0,paddingHorizontal:0,borderRadius:0,borderWidth:0,backgroundColor:'#0B0712',overflow:'hidden',elevation:40,zIndex:100},
  shellCompactLeft:{left:0,right:0},
  shellCompactRight:{left:0,right:0},
  compactHeader:{minHeight:64,flexShrink:0,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:12,paddingBottom:8,borderBottomWidth:1,borderBottomColor:'rgba(124,92,252,.20)',backgroundColor:'rgba(11,7,18,.99)'},
  liveDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.keep},
  compactThreadBack:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
  compactThreadBackText:{color:colors.textPrimary,fontSize:31,lineHeight:32,fontWeight:'500'},
  compactThreadAvatar:{width:40,height:40,borderRadius:20,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  compactThreadAvatarText:{fontSize:18,color:colors.textPrimary,fontWeight:'900'},
  compactHeaderCopy:{flex:1,minWidth:0},
  compactTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900',letterSpacing:.25},
  compactMeta:{color:colors.textMutedGrey,fontSize:11.5,lineHeight:16,marginTop:2},
  compactBadge:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.8},
  compactHeaderAction:{minWidth:38,height:38,paddingHorizontal:7,borderRadius:19,borderWidth:1,borderColor:colors.info,backgroundColor:colors.infoFaint,alignItems:'center',justifyContent:'center'},
  compactHeaderActionText:{color:colors.info,fontSize:17,fontWeight:'900'},
  compactClose:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  compactCloseText:{color:colors.textPrimary,fontSize:19,fontWeight:'900',lineHeight:21},
  compactModes:{flexDirection:'row',gap:6,marginHorizontal:14,marginTop:9,padding:4,borderRadius:22,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  compactMode:{flex:1,minHeight:38,borderRadius:18,borderWidth:0,backgroundColor:'transparent',alignItems:'center',justifyContent:'center'},
  compactModeOn:{backgroundColor:colors.info,borderColor:colors.primaryLight},
  compactModeText:{color:colors.textMutedGrey,fontSize:12,fontWeight:'900',letterSpacing:.35},
  compactModeTextOn:{color:colors.white},
  threadTools:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:14,minHeight:38},
  threadBack:{alignSelf:'flex-start',minHeight:28,justifyContent:'center',paddingHorizontal:5},
  threadBackText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},
  membersButton:{minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',alignItems:'center',justifyContent:'center'},
  membersButtonText:{color:colors.keep,fontSize:11,fontWeight:'900',letterSpacing:.5},
  inbox:{flex:1,minHeight:0},
  inboxList:{gap:0,paddingHorizontal:14,paddingTop:10,paddingBottom:18},
  inboxSearchWrap:{minHeight:44,borderRadius:22,borderWidth:1,borderColor:'rgba(167,139,250,.28)',backgroundColor:'rgba(26,21,38,.96)',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},
  inboxSearchIcon:{color:colors.textMutedGrey,fontSize:20,fontWeight:'700'},
  inboxSearch:{flex:1,minHeight:42,color:colors.textPrimary,fontSize:15,paddingVertical:0},
  inboxFilters:{gap:7,paddingRight:14},
  inboxFilterChip:{minHeight:34,paddingHorizontal:13,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  inboxFilterChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primary},
  inboxFilterText:{color:colors.textMutedGrey,fontSize:11.5,fontWeight:'900'},
  inboxFilterTextOn:{color:colors.white},
  newConversationButton:{minHeight:64,borderRadius:18,borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,paddingHorizontal:10,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:10},
  newConversationPlus:{width:38,height:38,borderRadius:19,textAlign:'center',textAlignVertical:'center',lineHeight:38,color:colors.white,backgroundColor:colors.primary,fontSize:22,fontWeight:'900'},
  newConversationCopy:{flex:1,minWidth:0},
  newConversationTitle:{color:colors.textPrimary,fontSize:16.5,fontWeight:'900'},
  newConversationHint:{color:colors.textMutedGrey,fontSize:12.5,lineHeight:17,marginTop:2},
  groupRow:{borderRadius:0,borderWidth:0,borderBottomWidth:1,borderBottomColor:'rgba(124,92,252,.18)',backgroundColor:'transparent',overflow:'hidden'},
  groupRowInvited:{borderColor:colors.warning,backgroundColor:'rgba(255,184,107,.06)'},
  groupMain:{minHeight:62,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:9},
  groupAvatar:{width:38,height:38,borderRadius:19,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  groupAvatarText:{fontSize:18},
  groupInviteActions:{flexDirection:'row',justifyContent:'flex-end',gap:7,paddingHorizontal:9,paddingBottom:9},
  groupDecline:{minHeight:30,paddingHorizontal:10,borderRadius:15,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  groupDeclineText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900'},
  groupAccept:{minHeight:30,paddingHorizontal:12,borderRadius:15,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  groupAcceptText:{color:colors.white,fontSize:11,fontWeight:'900'},
  conversationRow:{minHeight:64,borderRadius:0,borderWidth:0,borderBottomWidth:1,borderBottomColor:'rgba(124,92,252,.18)',backgroundColor:'transparent',paddingHorizontal:6,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:10},
  conversationAvatar:{width:44,height:44,borderRadius:22,backgroundColor:colors.backgroundElevated},
  publicRoomAvatar:{borderColor:colors.primaryLight,borderWidth:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint},
  publicRoomAvatarText:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
  publicRoomBadge:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.8},
  conversationCopy:{flex:1,minWidth:0},
  conversationTop:{flexDirection:'row',alignItems:'center',gap:8},
  conversationName:{flex:1,color:colors.textPrimary,fontSize:17.5,fontWeight:'900'},
  conversationTime:{color:colors.textMutedGrey,fontSize:12.5,fontWeight:'700'},
  conversationPreview:{color:colors.textSecondary,fontSize:16.5,lineHeight:22,marginTop:3},
  conversationArrow:{color:colors.primaryLight,fontSize:22,fontWeight:'900'},
  inboxEmpty:{flex:1,minHeight:200,alignItems:'center',justifyContent:'center',paddingHorizontal:24},
  inboxEmptyTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900',textAlign:'center'},
  inboxEmptyText:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,textAlign:'center',marginTop:6},
  intro:{padding:14,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  titleRow:{flexDirection:'row',alignItems:'center',gap:10},
  kicker:{color:colors.keep,fontSize:10,fontWeight:'900',letterSpacing:1.4},
  title:{color:colors.textPrimary,fontSize:19,fontWeight:'900',marginTop:4},
  subtitle:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,marginTop:5},
  homeToggle:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:colors.info,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  homeToggleOn:{backgroundColor:colors.info},
  homeToggleText:{color:colors.info,fontSize:9,fontWeight:'900'},
  homeToggleTextOn:{color:colors.white},
  notificationsToggle:{alignSelf:'flex-start',marginTop:8},
  notificationsToggleText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'800'},
  rooms:{flexDirection:'row',flexWrap:'wrap',gap:7},
  roomChip:{minHeight:34,paddingHorizontal:12,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  roomChipOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},
  roomChipText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'800'},
  roomChipTextOn:{color:colors.white},
  prompt:{padding:12,borderRadius:15,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  promptLabel:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1},
  promptText:{color:colors.textPrimary,fontSize:14,lineHeight:19,fontWeight:'800',marginTop:4},
  composer:{borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:10,gap:7},
  composerCompact:{paddingHorizontal:10,paddingTop:8,paddingBottom:4,borderRadius:0,borderWidth:0,borderTopWidth:1,borderTopColor:'rgba(124,92,252,.22)',backgroundColor:'rgba(11,7,18,.99)',flexGrow:0,flexShrink:0,gap:6},
  input:{flex:1,minHeight:44,maxHeight:104,color:colors.textPrimary,fontSize:17,lineHeight:23,textAlignVertical:'top',overflow:'scroll',backgroundColor:'transparent',paddingHorizontal:8,paddingTop:10,paddingBottom:9},
  inputCompact:{height:56,minHeight:56,maxHeight:112,flex:1,fontSize:17,lineHeight:22,paddingTop:15,paddingBottom:13,overflow:'scroll'},
  awaitingReplyBanner:{borderRadius:13,borderWidth:1,borderColor:colors.warning,backgroundColor:'rgba(255,184,107,.08)',paddingHorizontal:10,paddingVertical:7,marginBottom:6},
  awaitingReplyTitle:{color:colors.warning,fontSize:8.5,fontWeight:'900',letterSpacing:.7},
  awaitingReplyText:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:2},
  quickReactions:{height:46,minHeight:46,maxHeight:46,flexGrow:0,flexShrink:0},
  reactionPopover:{minHeight:50,maxHeight:54,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:7,paddingVertical:5,marginBottom:7},
  quickReactionsContent:{alignItems:'center',gap:7,paddingRight:8},
  quickReaction:{width:48,height:42,flexGrow:0,flexShrink:0,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  quickReactionDisabled:{opacity:.38},
  quickReactionLoki:{width:72,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  quickReactionText:{fontSize:20},
  quickReactionLokiText:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.5},
  lokiReactionBubble:{alignSelf:'flex-start',marginTop:8,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,paddingHorizontal:12,paddingVertical:8},
  lokiReactionText:{color:colors.primaryLight,fontSize:13,fontWeight:'900',letterSpacing:1.1},
  composerDrawer:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:7,minHeight:48,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:6},
  drawerAction:{flexGrow:1,minWidth:88,minHeight:42,paddingHorizontal:10,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  drawerActionOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  drawerActionIcon:{color:colors.textPrimary,fontSize:17,fontWeight:'900'},
  drawerActionText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'900',marginTop:2},
  composerBar:{flexDirection:'row',alignItems:'center',gap:7,minHeight:66,borderRadius:33,borderWidth:1,borderColor:'rgba(167,139,250,.48)',backgroundColor:'rgba(18,13,28,.98)',paddingHorizontal:6,paddingVertical:5,shadowColor:colors.primary,shadowOpacity:.14,shadowRadius:6,shadowOffset:{width:0,height:0},elevation:4},
  composerBarLocked:{borderColor:colors.warning,opacity:.72},
  addButton:{width:44,height:44,borderRadius:22,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',flexShrink:0},
  addButtonOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  addButtonText:{color:colors.textPrimary,fontSize:25,lineHeight:27,fontWeight:'500'},
  emojiButton:{width:40,height:40,borderRadius:20,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',flexShrink:0},
  emojiButtonOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  emojiButtonText:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},
  counter:{color:colors.textMutedGrey,fontSize:11,marginLeft:'auto',paddingRight:3},
  send:{width:44,height:44,borderRadius:22,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',flexShrink:0},
  sendOff:{opacity:.45},
  sendText:{color:colors.white,fontSize:18,fontWeight:'900',lineHeight:20},
  shareMusic:{minHeight:30,paddingHorizontal:9,borderRadius:15,borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center'},
  shareMusicText:{color:colors.keep,fontSize:11,fontWeight:'900'},
  shareQr:{minHeight:30,paddingHorizontal:8,borderRadius:15,borderWidth:1,borderColor:colors.info,alignItems:'center',justifyContent:'center'},
  shareQrOff:{opacity:.45},
  shareQrText:{color:colors.info,fontSize:10.5,fontWeight:'900'},
  musicAttribution:{marginTop:-5,marginHorizontal:5,paddingHorizontal:9,paddingVertical:6,borderBottomLeftRadius:12,borderBottomRightRadius:12,borderWidth:1,borderTopWidth:0,borderColor:colors.border,backgroundColor:'rgba(13,9,20,.82)',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  musicAttributionText:{flex:1,color:colors.textMutedGrey,fontSize:8.5,fontWeight:'800'},
  musicAlreadyText:{color:colors.keep,fontSize:8.5,fontWeight:'900'},
  keepMusicDisabled:{opacity:.55},
  revealChipDisabled:{opacity:.38},
  paymentChipDisabled:{opacity:.34},
  priceBlock:{gap:6,marginTop:6},
  customPriceRow:{flexDirection:'row',alignItems:'center',gap:7},
  customPriceInput:{width:92,minHeight:34,borderRadius:12,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,color:colors.textPrimary,paddingHorizontal:10,fontSize:12,fontWeight:'900'},
  maskedSaleRule:{color:colors.keep,fontSize:9,lineHeight:13,fontWeight:'900',marginTop:6},
  preflightText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'800',marginTop:5},
  preflightOwned:{color:colors.keep,fontSize:9,lineHeight:13,fontWeight:'900',marginTop:5},
  preflightBlocked:{color:'#FFB86B',fontSize:9,lineHeight:13,fontWeight:'900',marginTop:5},
  locked:{padding:10,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  lockedText:{color:colors.textMutedGrey,fontSize:11,textAlign:'center'},
  loading:{paddingVertical:8,alignItems:'center'},
  chatScroll:{maxHeight:410},
  chatScrollCompact:{flex:1,minHeight:0,overflow:'hidden',backgroundColor:'#0B0712'},
  list:{gap:8,paddingVertical:4},
  listCompact:{gap:11,paddingHorizontal:14,paddingTop:12,paddingBottom:14},
  message:{position:'relative',paddingHorizontal:12,paddingVertical:10,borderRadius:19,borderWidth:1,maxWidth:'88%',flexGrow:0,flexShrink:0},
  messageOwn:{alignSelf:'flex-end',backgroundColor:'rgba(124,92,252,.18)',borderColor:colors.primary},
  messageOther:{alignSelf:'flex-start',backgroundColor:colors.backgroundCard,borderColor:colors.border},
  directMessage:{borderColor:colors.info},
  author:{flexDirection:'row',alignItems:'center',paddingRight:34},
  avatar:{width:34,height:34,borderRadius:17,backgroundColor:colors.backgroundElevated},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontWeight:'900'},
  authorCopy:{flex:1,minWidth:0,marginLeft:8},
  username:{color:colors.textPrimary,fontSize:14.5,fontWeight:'900'},
  meta:{color:colors.textMutedGrey,fontSize:10.5,lineHeight:14,marginTop:1},
  directBubbleTime:{alignSelf:'flex-end',color:colors.textMutedGrey,fontSize:9.5,fontWeight:'700',marginTop:5},
  body:{color:colors.textPrimary,fontSize:16,lineHeight:22,marginTop:7},
  qrMessage:{marginTop:8,borderRadius:16,borderWidth:1,borderColor:colors.info,backgroundColor:colors.infoFaint,padding:9,alignItems:'center'},
  qrMessageTitle:{color:colors.info,fontSize:10,fontWeight:'900',letterSpacing:.6},
  qrMessageImage:{width:150,height:150,borderRadius:12,backgroundColor:'#FFF',marginTop:8},
  qrMessageHint:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,textAlign:'center',marginTop:7},
  paymentInline:{borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:9,marginBottom:7,maxHeight:230,overflow:'hidden'},
  paymentInlineHead:{flexDirection:'row',alignItems:'flex-start',gap:8},
  paymentInlineKicker:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.8},
  paymentInlineTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900',marginTop:3},
  paymentInlineClose:{color:colors.textMutedGrey,fontSize:20,fontWeight:'900'},
  paymentInlineQr:{width:110,height:110,borderRadius:10,backgroundColor:'#FFF',alignSelf:'center',marginTop:7},
  paymentInlineHint:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,textAlign:'center',marginTop:6},
  paymentInlineActions:{flexDirection:'row',gap:7,marginTop:8},
  paymentInlineOpen:{flex:1,minHeight:36,borderRadius:14,borderWidth:1,borderColor:colors.info,alignItems:'center',justifyContent:'center'},
  paymentInlineOpenText:{color:colors.info,fontSize:8.5,fontWeight:'900'},
  paymentInlinePaid:{flex:1,minHeight:36,borderRadius:14,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},
  paymentInlinePaidText:{color:colors.background,fontSize:8.5,fontWeight:'900'},
  messageActions:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6,marginTop:8},
  reply:{minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:colors.info,alignItems:'center',justifyContent:'center'},
  replyText:{color:colors.info,fontSize:8,fontWeight:'900'},
  more:{width:30,height:30,alignItems:'center',justifyContent:'center'},
  moreText:{color:colors.textMutedGrey,fontSize:14,fontWeight:'900'},
  empty:{color:colors.textMutedGrey,fontSize:12,textAlign:'center',paddingVertical:16},
  older:{minHeight:40,borderRadius:16,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  olderText:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.8},
  replyTarget:{minHeight:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,borderRadius:12,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.info,marginBottom:7},
  replyTargetText:{color:colors.info,fontSize:10,fontWeight:'900'},
  replyTargetClose:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},
  selectedMusic:{padding:8,borderRadius:18,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.successFaint,marginBottom:7,maxHeight:250,overflow:'hidden'},
  selectedMusicCompactRow:{minHeight:90,flexDirection:'row',alignItems:'center',gap:9},
  selectedMusicThumbWrap:{width:80,height:80,position:'relative',flexGrow:0,flexShrink:0},
  selectedMusicThumb:{width:80,height:80,borderRadius:16,backgroundColor:colors.backgroundElevated},
  selectedMusicLockBadge:{position:'absolute',right:-5,top:-5,width:22,height:22,borderRadius:11,borderWidth:1,borderColor:'#FFD28A',backgroundColor:'rgba(25,16,12,.96)',alignItems:'center',justifyContent:'center'},
  selectedMusicLockBadgeText:{fontSize:11},
  selectedMusicThumbFallback:{color:colors.primaryLight,fontSize:30,fontWeight:'900'},
  selectedMusicCompactCopy:{flex:1,minWidth:0},
  selectedMusicCompactTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:2},
  selectedMusicCompactArtist:{color:colors.textMutedGrey,fontSize:11,fontWeight:'800',marginTop:2},
  shareAccordionToggle:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},
  shareAccordionToggleText:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  removeMusicCompact:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  shareAccordionBody:{maxHeight:180,marginTop:7,borderTopWidth:1,borderTopColor:colors.border},
  shareAccordionContent:{paddingTop:7,paddingBottom:4},
  shareLockPill:{alignSelf:'flex-start',marginTop:4,borderRadius:10,borderWidth:1,borderColor:colors.warning,paddingHorizontal:6,paddingVertical:3,backgroundColor:'rgba(255,184,107,.08)'},
  shareLockPillText:{color:colors.warning,fontSize:9,fontWeight:'900'},
  validateMusicPinned:{minHeight:46,borderRadius:16,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:7,marginBottom:7},
  validateMusic:{minHeight:38,borderRadius:14,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center',marginTop:8},
  validateMusicText:{color:colors.background,fontSize:12.5,fontWeight:'900',letterSpacing:.6},
  selectedMusicPreview:{height:210,borderRadius:18,overflow:'hidden',backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end'},
  selectedMusicArtwork:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},
  selectedMusicArtworkFallback:{alignItems:'center',justifyContent:'center',backgroundColor:'#241936'},
  selectedMusicFallbackText:{color:colors.primaryLight,fontSize:54,fontWeight:'900'},
  selectedMusicShade:{padding:14,paddingTop:70,backgroundColor:'rgba(9,6,16,.66)'},
  selectedMusicEyebrow:{color:colors.keep,fontSize:9.5,fontWeight:'900',letterSpacing:1},
  selectedMusicTitle:{color:'#FFF',fontSize:20,lineHeight:23,fontWeight:'900',marginTop:3},
  selectedMusicArtist:{color:'#F0EAF7',fontSize:13,fontWeight:'800',marginTop:3},
  selectedMusicPlayRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10},
  removeMusicLarge:{marginLeft:'auto',width:42,height:42,borderRadius:21,borderWidth:1,borderColor:colors.border,backgroundColor:'rgba(10,8,15,.82)',alignItems:'center',justifyContent:'center'},
  ownershipLock:{marginTop:8,borderRadius:14,borderWidth:1,borderColor:'#F5A623',backgroundColor:'rgba(245,166,35,.09)',overflow:'hidden'},
  ownershipLockHead:{minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,paddingVertical:7},
  ownershipLockIcon:{fontSize:17},
  ownershipLockTitle:{color:'#FFD28A',fontSize:10.5,fontWeight:'900',letterSpacing:.6},
  ownershipLockSub:{color:colors.textMutedGrey,fontSize:9.5,marginTop:2},
  ownershipLockBody:{color:colors.textPrimary,fontSize:10,lineHeight:15,paddingHorizontal:10,paddingBottom:10},
  shareAccordionHead:{minHeight:46,marginTop:7,paddingHorizontal:10,paddingVertical:7,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  shareAccordionLabel:{color:colors.textMutedGrey,fontSize:8.5,fontWeight:'900',letterSpacing:.8},
  shareAccordionValue:{color:colors.textPrimary,fontSize:11.5,fontWeight:'900',marginTop:2},
  accordionArrow:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},
  revealChoices:{flexDirection:'row',alignItems:'center',gap:6,marginTop:7},
  revealChip:{minHeight:36,paddingHorizontal:11,borderRadius:18,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  revealChipOn:{borderColor:colors.keep,backgroundColor:colors.successSoft},
  revealChipText:{color:colors.textPrimary,fontSize:10.5,fontWeight:'900'},
  paymentChoices:{flexDirection:'row',alignItems:'center',gap:6,marginTop:7},
  paymentLabel:{color:colors.textMutedGrey,fontSize:9.5,fontWeight:'900',letterSpacing:.7},
  paymentChip:{minHeight:36,paddingHorizontal:11,borderRadius:18,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  paymentChipOn:{borderColor:colors.info,backgroundColor:colors.infoFaint},
  paymentChipText:{color:colors.textPrimary,fontSize:11.5,fontWeight:'900'},
  priceChoices:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap',marginTop:6},
  priceChip:{minWidth:42,height:36,paddingHorizontal:10,borderRadius:18,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  priceChipOn:{borderColor:colors.keep,backgroundColor:colors.successSoft},
  priceChipText:{color:colors.textPrimary,fontSize:10.5,fontWeight:'900'},
  priceUnit:{color:colors.keep,fontSize:10.5,fontWeight:'900'},
  paymentStoreNote:{width:'100%',color:colors.textMutedGrey,fontSize:10,lineHeight:15,fontWeight:'700'},
  removeMusic:{marginLeft:'auto',width:28,height:28,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  removeMusicText:{color:colors.textMutedGrey,fontSize:16,fontWeight:'900'},
  musicCard:{marginTop:10,padding:10,borderRadius:20,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.successFaint,flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap',width:'100%',minHeight:132,overflow:'hidden'},
  musicArt:{width:104,height:104,borderRadius:18,backgroundColor:colors.backgroundElevated},
  musicArtMasked:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.primary},
  musicMaskIcon:{color:colors.primaryLight,fontSize:36,fontWeight:'900'},
  musicCopy:{flex:1,minWidth:130},
  musicKicker:{color:colors.keep,fontSize:9.5,fontWeight:'900',letterSpacing:.9},
  musicTitle:{color:colors.textPrimary,fontSize:15.5,fontWeight:'900',marginTop:4,lineHeight:20},
  musicArtist:{color:colors.textMutedGrey,fontSize:12.5,marginTop:4},
  keepMusic:{minHeight:32,paddingHorizontal:9,borderRadius:16,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},
  keepMusicText:{color:colors.background,fontSize:8,fontWeight:'900'},
  offerStatusOwn:{minHeight:32,paddingHorizontal:9,borderRadius:16,borderWidth:1,borderColor:colors.info,alignItems:'center',justifyContent:'center'},
  offerStatusOwnText:{color:colors.info,fontSize:8,fontWeight:'900'},
  sellerConfirm:{minHeight:34,paddingHorizontal:10,borderRadius:16,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.successSoft,alignItems:'center',justifyContent:'center'},
  sellerConfirmText:{color:colors.keep,fontSize:8.5,fontWeight:'900'},
  offerUnlocked:{minHeight:32,paddingHorizontal:9,borderRadius:16,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.successSoft,alignItems:'center',justifyContent:'center'},
  offerUnlockedText:{color:colors.keep,fontSize:8,fontWeight:'900'},
  modalBackdrop:{flex:1,backgroundColor:colors.overlay,alignItems:'center',justifyContent:'center',padding:18},
  groupSheet:{width:'100%',maxWidth:460,maxHeight:'86%',borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:14},
  groupInput:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,color:colors.textPrimary,fontSize:15,paddingHorizontal:12,marginTop:10},
  groupSelectionBar:{minHeight:30,justifyContent:'center',marginTop:6},
  groupSelectionText:{color:colors.keep,fontSize:10,fontWeight:'900'},
  groupPeopleList:{marginTop:4,maxHeight:330},
  groupMembersList:{marginTop:12,maxHeight:280},
  groupInviteList:{marginTop:7,maxHeight:220},
  groupPersonRow:{minHeight:54,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:9},
  groupPersonRowSelected:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)'},
  groupPersonAvatar:{width:36,height:36,borderRadius:18,backgroundColor:colors.backgroundElevated},
  groupPersonName:{flex:1,color:colors.textPrimary,fontSize:14,fontWeight:'900'},
  groupMemberMeta:{color:colors.textMutedGrey,fontSize:10,marginTop:2},
  groupCheck:{width:30,height:30,borderRadius:15,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  groupCheckOn:{borderColor:colors.keep,backgroundColor:colors.keep},
  groupCheckText:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},
  groupCreateCta:{minHeight:44,borderRadius:22,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:10},
  groupCreateCtaOff:{opacity:.45},
  groupCreateCtaText:{color:colors.white,fontSize:11,fontWeight:'900',letterSpacing:.6},
  groupSectionTitle:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:14},
  groupRemoveButton:{minHeight:30,paddingHorizontal:9,borderRadius:15,borderWidth:1,borderColor:colors.danger,alignItems:'center',justifyContent:'center'},
  groupRemoveText:{color:colors.danger,fontSize:8.5,fontWeight:'900'},
  groupInviteButton:{minHeight:30,paddingHorizontal:10,borderRadius:15,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)',alignItems:'center',justifyContent:'center'},
  groupInviteText:{color:colors.keep,fontSize:8.5,fontWeight:'900'},
  shareSheet:{width:'100%',maxWidth:460,maxHeight:'78%',borderRadius:22,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,padding:14},
  shareHead:{flexDirection:'row',alignItems:'flex-start',gap:10},
  shareTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},
  shareHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:15,marginTop:3},
  shareClose:{color:colors.textMutedGrey,fontSize:24,fontWeight:'900'},
  shareList:{marginTop:12},
  shareTrackRow:{minHeight:104,flexDirection:'row',alignItems:'center',gap:12,padding:10,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard},
  shareTrackArtWrap:{width:82,height:82,position:'relative',flexGrow:0,flexShrink:0},
  shareTrackArt:{width:82,height:82,borderRadius:16,backgroundColor:colors.backgroundElevated},
  shareTrackLockBadge:{position:'absolute',right:-4,top:-4,width:28,height:28,borderRadius:14,borderWidth:1,borderColor:'#FFD28A',backgroundColor:'rgba(25,16,12,.96)',alignItems:'center',justifyContent:'center'},
  shareTrackLockBadgeText:{fontSize:14},
  shareTrackTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900'},
  shareTrackArtist:{color:colors.textMutedGrey,fontSize:13,marginTop:4},
  shareTrackLocked:{color:colors.warning,fontSize:10,fontWeight:'900',lineHeight:14,marginTop:4},
  musicShareOnlyText:{color:colors.warning,fontSize:8,fontWeight:'900',marginTop:3},
  shareTrackArrow:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
});
