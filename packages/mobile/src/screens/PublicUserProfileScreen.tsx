import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Animated, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { canonicalArtistIdentity, CanonicalTrack, groupTracksByArtist } from '@keep/music';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { createAuthService } from '../services/authService';
import { loadUnreadNotificationCount, requestSocialLink, subscribeToNotificationChanges } from '../services/notificationService';
import { DiscoveryImpact, loadOwnProfileKeeps, loadProfileDiscoveryImpacts, loadProfileReprisers, loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, ProfileRepriser, PublicProfileSnapshot } from '../services/publicProfileStateService';
import CommunityConnectionsPanel, { CommunityMode } from '../components/CommunityConnectionsPanel';
import { useUserStore } from '../store/useUserStore';
import { StoryRing } from '../components/MusicStoryRail';
import { loadStoryAccess } from '../services/storyAccessService';
import { isSaleStoryTrack, loadProfileStory, orderTracksForPlayback, loadSeenStories, markStorySeen, type MusicStory } from '../services/musicStoriesService';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { useGlobalChatStore } from '../store/useGlobalChatStore';
import { acceptMarketplacePaymentTerms, loadMarketplacePaymentTermsAccepted } from '../services/musicAgoraService';
import { KeepVisibility, ProfileKind, SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import TrackActionRow from '../components/TrackActionRow';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import KeepVisibilityChoiceModal, { KeepSuccessModal } from '../components/KeepVisibilityChoiceModal';
import ProfileCertificationBadge, { CERTIFICATION_META } from '../components/ProfileCertificationBadge';
import MotionActionButton from '../components/MotionActionButton';
import ProfileMotionReveal from '../components/ProfileMotionReveal';
import ProfileStyleCard from '../components/ProfileStyleCard';
import MusicStyleBubbles from '../components/MusicStyleBubbles';
import { buildMusicStyleBubbles } from '../services/musicStyleBubbles';
import LoginPill from '../components/LoginPill';
import { commitKeep } from '../services/keepTrackAction';
import { enrichMissingGenres } from '../services/keylessGenreService';
import { loadPublicSmartAlbums, loadPublicSmartAlbumTracks, persistEnrichedGenres, SmartAlbumRecord } from '../services/smartAlbumService';
import { shareProfile, shareProfileTrack } from '../services/sharingService';
import { blockUser, isBlockedEitherWay, reportUser, unblockUser, REPORT_REASONS, ReportReason } from '../services/moderationService';
import { loadDeliveredPlaylistSaleTracks, loadMaskedPlaylistSaleTrackIds, loadMyPlaylistSaleUnlocks, loadOwnPlaylistSaleOfferTracks, loadPlaylistSaleOfferOverlap, loadPlaylistSaleOfferOverlaps, loadPlaylistSaleOfferPreviewTracks, loadPlaylistSaleProfilePreviewSampler, loadPlaylistSaleOffersForProfile, cancelPlaylistSalePayment, markPlaylistSaleBuyerPaid, PlaylistPurchaseRequest, PlaylistSaleOverlap, PublicPlaylistSaleOffer, purchasePlaylistBundleWithFree, purchasePlaylistOfferWithFree, requestMissingPlaylistSaleTracks, requestPlaylistBundlePurchase, requestPlaylistPurchase } from '../services/playlistSaleService';
import { isFeatureEnabled, isPlaylistMarketplaceEnabled, isPlaylistMarketplaceVisible } from '../services/featureFlagService';
import PlaylistSaleImmersivePreview from '../components/PlaylistSaleImmersivePreview';
import SellerBoutique, { SELLER_BOUTIQUE_SECTION_STYLE } from '../components/SellerBoutique';
import ProfileOpportunityRail from '../components/ProfileOpportunityRail';
import PayoutCheckoutSheet from '../components/PayoutCheckoutSheet';
import { playAntiShazamPreviewSegment, preloadTrackPreview, stopAntiShazamPreview, stopTrackPreview, toggleTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { recordProfileSwipeListen } from '../services/profileSwipeListenService';
import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';
import { sendBattleChallenge } from '../services/keepBattleLiveService';
import { formatProfilePresence, loadProfilePresence } from '../services/profilePresenceService';
import { CreatorEvent, EventRsvpCounts, EventRsvpStatus, loadEventById, loadEventRsvpCounts, loadMyRsvps, loadProfileEventTeaser, setEventRsvp } from '../services/creatorEventService';
import { loadFreeCreditBreakdown } from '../services/creditService';
import { loadProfileSaleSuggestions, ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';
import PublicProfilePanel from '../components/PublicProfilePanel';
import CreatorToolsPanel from '../components/CreatorToolsPanel';
import HelpLegalPanel from '../components/HelpLegalPanel';
import NotificationSidePanel from '../components/NotificationSidePanel';
import KeepModal from '../components/KeepModal';

type PublicKeepTrack = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  previewUrl?: string;
  availableOn?: string[];
  externalUrls?: Record<string, string>;
  isrc?: string;
  durationSec?: number;
  genres?: string[];
  providerIds?: Record<string, string | undefined>;
  sourceUserId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
  sourceCertificationTier?: ProfileCertificationTier;
  sourceIsFollowing?: boolean;
  keptAt?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
};
type SocialPlatform = SocialLink['platform'];
// (21/09/2026) refonte collection -- pas d'onglet "Vibes" ici : contrairement
// au propre profil, les playlists/albums intelligents d'un tiers ne sont
// jamais interrogeables pour un visiteur (ils dépendent de la session
// provider du PROFIL VISITÉ, pas de la nôtre). Seuls Musiques et Artistes ont
// une vraie source de données publique.
type ProfileTab = 'TRACKS' | 'ARTISTS';
const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'TRACKS', label: 'Styles' }, { key: 'ARTISTS', label: 'Artistes' },
];

const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'snapchat', label: 'Snapchat' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'x', label: 'X' },
  { platform: 'facebook', label: 'Facebook' },
];
const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Fan', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Lieu',
};

const QUERY_CHUNK_SIZE = 120;

function chunks<T>(items: T[], size = QUERY_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function PublicUserProfileScreen({ route, navigation }: any) {
  const username = route?.params?.username as string | undefined;
  const openSaleOfferId = route?.params?.openSaleOfferId as string | undefined;
  const viewer = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  // Adel (05/10/2026) : le cercle de story s'allume aussi sur la photo d'un profil visité quand il a une story du jour non vue.
  const [visitedStory, setVisitedStory] = useState<MusicStory | null>(null);
  const [visitedStorySeenAt, setVisitedStorySeenAt] = useState('');
  const [authenticatedViewerId, setAuthenticatedViewerId] = useState<string | null>(null);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [ownerMenuSection, setOwnerMenuSection] = useState<'ROOT' | 'NETWORKS' | 'CREATOR' | 'HELP'>('ROOT');
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Source de vérité : la session Supabase réelle. Après un changement de
  // compte / refresh / deep-link, Zustand peut rester brièvement sur l'ancien
  // état invité ou démo. Le profil public est visible mais les actions
  // affichent alors à tort "connecte-toi" (cas reproduit sur le compte Inside).
  useEffect(() => {
    if (!supabase) {
      const state = useUserStore.getState();
      setAuthenticatedViewerId(!state.isLocalGuest && !state.isDemoMode ? state.user?.id ?? null : null);
      return undefined;
    }

    let live = true;
    const auth = createAuthService(supabase);
    const profiles = createProfileService(supabase);

    const reconcile = async () => {
      const session = await auth.getCurrentSession().catch(() => null);
      if (!live) return;

      if (!session || session.isAnonymous) {
        setAuthenticatedViewerId(null);
        return;
      }

      setAuthenticatedViewerId(session.userId);
      const state = useUserStore.getState();
      if (!state.user || state.user.id !== session.userId || state.isLocalGuest || state.isDemoMode) {
        state.syncFromAuthSession(session);
        try {
          const ownProfile = await profiles.loadOrCreateOwnProfile(session);
          if (live) useUserStore.getState().setUser(ownProfile);
        } catch {
          // La session suffit déjà à rétablir les actions. App.tsx garde la
          // responsabilité de réhydrater ensuite le profil complet.
        }
      }
    };

    void reconcile();
    const unsubscribeFocus = navigation?.addListener?.('focus', () => { void reconcile(); });
    const unsubscribeAuth = auth.onSessionChange((session) => {
      if (!live) return;
      if (!session || session.isAnonymous) {
        setAuthenticatedViewerId(null);
        return;
      }
      setAuthenticatedViewerId(session.userId);
      const state = useUserStore.getState();
      if (!state.user || state.user.id !== session.userId || state.isLocalGuest || state.isDemoMode) {
        state.syncFromAuthSession(session);
      }
    });

    return () => {
      live = false;
      unsubscribeFocus?.();
      unsubscribeAuth();
    };
  }, [navigation]);

  const effectiveViewerId = authenticatedViewerId
    || (!isLocalGuest && !isDemoMode ? viewer?.id ?? null : null);

  useEffect(() => {
    let live = true;
    if (!effectiveViewerId) {
      setUnreadCount(0);
      return () => { live = false; };
    }
    const refreshUnread = () => {
      void loadUnreadNotificationCount(effectiveViewerId)
        .then((count) => { if (live) setUnreadCount(count); })
        .catch(() => { if (live) setUnreadCount(0); });
    };
    refreshUnread();
    const unsubscribeChanges = subscribeToNotificationChanges(effectiveViewerId, refreshUnread);
    const unsubscribeFocus = navigation?.addListener?.('focus', refreshUnread);
    return () => {
      live = false;
      unsubscribeChanges();
      unsubscribeFocus?.();
    };
  }, [effectiveViewerId, navigation]);
  const [profile, setProfile] = useState<User | null>(null);
  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [tracks, setTracks] = useState<PublicKeepTrack[]>([]);
  const [directKeepCount, setDirectKeepCount] = useState(0);
  const [socialKeepCount, setSocialKeepCount] = useState(0);
  const [discoveryImpacts, setDiscoveryImpacts] = useState<Record<string, DiscoveryImpact>>({});
  const [viewerKeepTrackIds, setViewerKeepTrackIds] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [addingTrackIds, setAddingTrackIds] = useState<Set<string>>(new Set());
  // Adel (21/09/2026) : "Hauteur fixe et uniforme pour toutes les cartes ...
  // le reste des informations passe dans un menu dépliable." Le like, le
  // badge 1er KEEP, l'attribution et Partager ne changent plus jamais la
  // hauteur de la carte -- ils vivent dans ce panneau, replié par défaut.
  const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());
  const toggleTrackExpanded = (key: string) => setExpandedTrackKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Adel (09/09/2026) : "j'ai appuye sur garder ... normalement il y aurait
  // du y avoir un popup, souhaitez-vous la mettre en prive ou en public,
  // et il m'a pas demande" -- meme choix que dans SWIPER/TrackRow, jamais
  // saute pour ce bouton en ligne.
  const [keepPromptTrack, setKeepPromptTrack] = useState<PublicKeepTrack | null>(null);
  const [keepSuccessTrack, setKeepSuccessTrack] = useState<{ track: PublicKeepTrack; visibility: KeepVisibility } | null>(null);
  const [followNudgeVisible, setFollowNudgeVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedUsernameRef = useRef<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [inlineStylePlayingKey, setInlineStylePlayingKey] = useState<string | null>(null);
  const [inlineListenNotice, setInlineListenNotice] = useState<string | null>(null);
  const inlineQueueGenerationRef = useRef(0);
  const salePreviewSequenceRef = useRef(0);
  const inlinePreviewUrlCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!inlineListenNotice) return undefined;
    const id = setTimeout(() => setInlineListenNotice(null), 2600);
    return () => clearTimeout(id);
  }, [inlineListenNotice]);
  // Adel (14/09/2026) : "j'ai une liste complete ... je trouve que ce n'est
  // pas utile et ca bouffe toute la place" -- avait ete repliee par defaut.
  // Adel (21/09/2026) : "c'est une aberration pour une plateforme musicale
  // ... ne cache jamais le contenu derriere un accordeon ferme" -- decision
  // inversee explicitement, toujours visible desormais (voir plus bas).
  const [isBlocked, setIsBlocked] = useState(false);
  const [moderationMenuOpen, setModerationMenuOpen] = useState(false);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  // Adel (09/09/2026) : "meme design que le profil normal" -- Abonnes/
  // Abonnements et Reprises deviennent cliquables ici aussi (pastilles +
  // style musical, liste "qui a repris"), comme sur son propre profil.
  const [communityMode, setCommunityMode] = useState<CommunityMode>(null);
  const [repriseListOpen, setRepriseListOpen] = useState(false);
  // Adel (29/09/2026) : sur le profil visité, seuls Abonnés + Morceaux
  // restent visibles ; Reprises + Abonnements se déplient via « ••• PLUS »,
  // comme sur son propre profil.
  const [countersExpanded, setCountersExpanded] = useState(false);
  const [repriseLoading, setRepriseLoading] = useState(false);
  const [reprisers, setReprisers] = useState<ProfileRepriser[]>([]);
  const [repriseFollowBusyId, setRepriseFollowBusyId] = useState<string | null>(null);
  // Adel (14/09/2026) : "sur le profil utilisateur, fait pareil quand on va
  // visiter un autre utilisateur" -- affiche les playlists que CE profil a
  // mises en vente (nom + prix), même si l'achat réel n'est pas encore
  // possible (Stripe Connect pas branché) : jamais un CTA qui prétend
  // encaisser tant que ce n'est pas vrai.
  const [saleOffers, setSaleOffers] = useState<PublicPlaylistSaleOffer[]>([]);
  // Conserve les offres ciblées du chat dans la source brute pour les deep-links
  // adressés au destinataire, mais ne les expose jamais dans la boutique publique.
  const profileBoutiqueOffers = useMemo(
    () => saleOffers.filter((offer) => !String(offer.playlistId || '').startsWith('keep-chat:')),
    [saleOffers],
  );
  const [saleOfferOverlaps, setSaleOfferOverlaps] = useState<Record<string, PlaylistSaleOverlap>>({});
  const [profileSaleSuggestions, setProfileSaleSuggestions] = useState<ProfileSaleSuggestion[]>([]);
  const [marketBannerVisible, setMarketBannerVisible] = useState(true);
  const [marketBannerHasNew, setMarketBannerHasNew] = useState(false);

  const [marketBannerEventIds, setMarketBannerEventIds] = useState<string[]>([]);
  const [marketBannerPendingEventCount, setMarketBannerPendingEventCount] = useState(0);
  const [marketBannerEventsLoaded, setMarketBannerEventsLoaded] = useState(false);
  const [marketBannerOffersLoaded, setMarketBannerOffersLoaded] = useState(false);
  const [profileEventOpen, setProfileEventOpen] = useState(false);
  const [profileEvent, setProfileEvent] = useState<CreatorEvent | null>(null);
  const [profileEventRsvp, setProfileEventRsvp] = useState<EventRsvpStatus | null>(null);
  const [profileEventCounts, setProfileEventCounts] = useState<EventRsvpCounts>({ going: 0, maybe: 0, notGoing: 0 });
  const [profileEventBusy, setProfileEventBusy] = useState(false);
  const eventSpotlightPulse = useRef(new Animated.Value(0)).current;
  const [publicVibes, setPublicVibes] = useState<SmartAlbumRecord[]>([]);
  const [saleUnlocks, setSaleUnlocks] = useState<Record<string, { offerId: string; deliveredPlaylistId: string }>>({});
  const [folderSwipeTracks, setFolderSwipeTracks] = useState<CanonicalTrack[]>([]);
  const [folderSwipeTitle, setFolderSwipeTitle] = useState('');
  useEffect(() => {
    let live = true;
    setVisitedStory(null);
    if (!profile?.id || isDemoMode || isLocalGuest || !effectiveViewerId) return undefined;
    // Stories : comptes réels avec e-mail vérifié uniquement (jamais démo / invité).
    void loadStoryAccess().then((allowed) => {
      if (!allowed || !live) return undefined;
      return loadProfileStory({ id: profile.id, username: profile.username, avatarUrl: profile.avatar || null })
        .then((story) => { if (live) setVisitedStory(story ? { ...story, tracks: story.tracks.filter((track) => !isSaleStoryTrack(track)) } : null); });
    }).catch(() => {});
    if (effectiveViewerId) void loadSeenStories(effectiveViewerId).then((seen) => { if (live) setVisitedStorySeenAt(seen[profile.id] || ''); }).catch(() => {});
    return () => { live = false; };
  }, [profile?.id, profile?.username, profile?.avatar, effectiveViewerId, isDemoMode, isLocalGuest]);
  const visitedStoryUnseen = Boolean(visitedStory && visitedStory.tracks.length && visitedStorySeenAt < visitedStory.latestAt);
  const openVisitedStory = () => {
    if (!visitedStory || !visitedStory.tracks.length || !profile) return;
    setFolderSwipeTracks(orderTracksForPlayback(visitedStory.tracks, visitedStoryUnseen));
    setFolderSwipeTitle(`Story de @${profile.username}`);
    setSwipeOpen(true);
    if (effectiveViewerId) { setVisitedStorySeenAt(visitedStory.latestAt); void markStorySeen(effectiveViewerId, visitedStory); }
  };
  const [folderLoadingId, setFolderLoadingId] = useState<string | null>(null);
  // Adel (20/09/2026) : marketplace playlists (ACHETER) en "coming soon" --
  // paiement par lien externe, non conforme Apple IAP pour du contenu
  // numérique déverrouillé dans l'app. Code intact, juste masqué tant que
  // le flag Super Admin 'playlist_marketplace' reste désactivé.
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(false);
  const [marketplacePurchaseEnabled, setMarketplacePurchaseEnabled] = useState(false);
  const [battleFeatureEnabled, setBattleFeatureEnabled] = useState(false);
  const [battleInviteBusy, setBattleInviteBusy] = useState(false);
  const [profilePresence, setProfilePresence] = useState<{ lastSeenAt: string | null; online: boolean; known: boolean }>({ lastSeenAt: null, online: false, known: false });
  useEffect(() => {
    if (!profile?.id) return undefined;
    let live = true;
    const refreshPresence = () => loadProfilePresence(profile.id).then((value) => { if (live) setProfilePresence(value); }).catch(() => {});
    void refreshPresence();
    const timer = setInterval(refreshPresence, 60000);
    return () => { live = false; clearInterval(timer); };
  }, [profile?.id]);

  useEffect(() => {
    let live = true;
    isKeepBattleEnabled().then((enabled) => { if (live) setBattleFeatureEnabled(enabled); }).catch(() => { if (live) setBattleFeatureEnabled(false); });
    return () => { live = false; };
  }, []);
  // (21/09/2026) BUG RÉEL corrigé : ce check ne tournait qu'au montage --
  // un changement de flag/bypass fait dans Super Admin pendant que l'écran
  // était déjà ouvert n'était jamais relu sans relancer l'app. Recalculé
  // aussi à chaque focus.
  useEffect(() => {
    let live = true;
    const check = async () => {
      const [visible, purchaseEnabled] = await Promise.all([
        isPlaylistMarketplaceVisible(),
        isPlaylistMarketplaceEnabled(),
      ]);
      if (!live) return;
      setMarketplaceEnabled(visible);
      setMarketplacePurchaseEnabled(purchaseEnabled);
    };
    void check();
    const unsubscribe = navigation?.addListener?.('focus', () => { void check(); });
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);
  useEffect(() => {
    if (!profile?.id) { setSaleOffers([]); return undefined; }
    let live = true;
    const refreshProfileSaleOffers = () => {
      loadPlaylistSaleOffersForProfile(profile.id)
        .then((rows) => { if (live) { setSaleOffers(rows); setMarketBannerOffersLoaded(true); } })
        .catch(() => { if (live) { setSaleOffers([]); setMarketBannerOffersLoaded(true); } });
    };
    refreshProfileSaleOffers();
    const unsubscribe = navigation?.addListener?.('focus', refreshProfileSaleOffers);
    return () => { live = false; unsubscribe?.(); };
  }, [profile?.id, navigation]);

  useEffect(() => {
    if (!effectiveViewerId || !marketBannerOffersLoaded) {
      setProfileSaleSuggestions([]);
      return undefined;
    }
    let live = true;
    const refreshProfileSaleSuggestions = () => {
      loadProfileSaleSuggestions(8)
        .then((rows) => { if (live) setProfileSaleSuggestions(rows.filter((row) => row.sellerId !== profile?.id)); })
        .catch(() => { if (live) setProfileSaleSuggestions([]); });
    };
    refreshProfileSaleSuggestions();
    const unsubscribe = navigation?.addListener?.('focus', refreshProfileSaleSuggestions);
    return () => { live = false; unsubscribe?.(); };
  }, [effectiveViewerId, marketBannerOffersLoaded, profileBoutiqueOffers.length, profile?.id, navigation]);

  // Affiche AVANT d'ouvrir un Drop combien de titres sont réellement
  // nouveaux pour le visiteur. Le calcul reste côté serveur afin de ne jamais
  // révéler les titres masqués de la collection.
  useEffect(() => {
    if (!effectiveViewerId || profileBoutiqueOffers.length === 0) {
      setSaleOfferOverlaps({});
      return undefined;
    }
    let live = true;
    void loadPlaylistSaleOfferOverlaps(profileBoutiqueOffers.map((offer) => offer.offerId))
      .then((next) => {
        if (live) setSaleOfferOverlaps(next);
      })
      .catch(() => {
        if (live) setSaleOfferOverlaps({});
      });
    return () => { live = false; };
  }, [effectiveViewerId, profileBoutiqueOffers]);
  useEffect(() => {
    if (!profile?.id) {
      setMarketBannerEventIds([]);
      setMarketBannerPendingEventCount(0);
      setMarketBannerEventsLoaded(true);
      return undefined;
    }
    let live = true;
    setMarketBannerEventsLoaded(false);
    loadProfileEventTeaser(profile.id).then((state) => {
      if (!live) return;
      setMarketBannerEventIds(state.approvedEventIds);
      setMarketBannerPendingEventCount(state.pendingCount);
      setMarketBannerEventsLoaded(true);
    }).catch(() => {
      if (live) {
        setMarketBannerEventIds([]);
        setMarketBannerPendingEventCount(0);
        setMarketBannerEventsLoaded(true);
      }
    });
    return () => { live = false; };
  }, [profile?.id]);

  useEffect(() => {
    if (!(marketBannerEventIds.length > 0 || marketBannerPendingEventCount > 0)) return undefined;
    eventSpotlightPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(eventSpotlightPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(eventSpotlightPulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [eventSpotlightPulse, marketBannerEventIds.length, marketBannerPendingEventCount]);

  const openProfileEventInline = async () => {
    setProfileEventOpen(true);
    setProfileEvent(null);
    setProfileEventRsvp(null);
    setProfileEventCounts({ going: 0, maybe: 0, notGoing: 0 });
    if (!marketBannerEventIds.length) return;
    const eventId = marketBannerEventIds[0];
    setProfileEventBusy(true);
    try {
      const [event, counts, myRsvps] = await Promise.all([
        loadEventById(eventId),
        loadEventRsvpCounts(eventId),
        effectiveViewerId ? loadMyRsvps(effectiveViewerId) : Promise.resolve({} as Record<string, EventRsvpStatus>),
      ]);
      setProfileEvent(event);
      setProfileEventCounts(counts);
      setProfileEventRsvp(myRsvps[eventId] ?? null);
    } catch {
      Alert.alert('Événement', 'Impossible de charger cet événement pour le moment.');
      setProfileEventOpen(false);
    } finally {
      setProfileEventBusy(false);
    }
  };

  const chooseProfileEventRsvp = async (status: EventRsvpStatus) => {
    if (!profileEvent || profileEventBusy || profileEventRsvp === status) return;
    if (!effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour répondre à cet événement.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    const previous = profileEventRsvp;
    setProfileEventBusy(true);
    try {
      await setEventRsvp(effectiveViewerId, profileEvent.id, status);
      setProfileEventRsvp(status);
      setProfileEventCounts((current) => {
        const next = { ...current };
        const keyFor = (value: EventRsvpStatus) => value === 'GOING' ? 'going' : value === 'MAYBE' ? 'maybe' : 'notGoing';
        if (previous) {
          const previousKey = keyFor(previous);
          next[previousKey] = Math.max(0, next[previousKey] - 1);
        }
        const nextKey = keyFor(status);
        next[nextKey] += 1;
        return next;
      });
    } catch {
      Alert.alert('Participation', 'Impossible d’enregistrer ta réponse pour le moment.');
    } finally {
      setProfileEventBusy(false);
    }
  };

  useEffect(() => {
    if (!profile?.id || !marketBannerOffersLoaded || !marketBannerEventsLoaded) return;
    const viewerKey = viewer?.id || 'guest';
    const key = `keep:profile-market-banner:${viewerKey}:${profile.id}`;
    const playlistSignature = profileBoutiqueOffers.map((row) => row.offerId).sort().join(',');
    const eventSignature = `${marketBannerEventIds.join(',')}|pending:${marketBannerPendingEventCount}`;
    let live = true;
    AsyncStorage.getItem(key).then((raw) => {
      if (!live) return;
      if (!raw) { setMarketBannerVisible(true); setMarketBannerHasNew(false); return; }
      try {
        const saved = JSON.parse(raw);
        const hasNew = saved.playlists !== playlistSignature || saved.events !== eventSignature;
        const manuallyClosed = Boolean(saved.manuallyClosed);
        setMarketBannerVisible(!manuallyClosed);
        setMarketBannerHasNew(manuallyClosed && hasNew);
        if (!manuallyClosed && hasNew) {
          void AsyncStorage.setItem(key, JSON.stringify({ manuallyClosed: false, playlists: playlistSignature, events: eventSignature }));
        }
      } catch { setMarketBannerVisible(true); setMarketBannerHasNew(false); }
    }).catch(() => { setMarketBannerVisible(true); setMarketBannerHasNew(false); });
    return () => { live = false; };
  }, [profile?.id, viewer?.id, marketBannerOffersLoaded, marketBannerEventsLoaded, profileBoutiqueOffers, marketBannerEventIds, marketBannerPendingEventCount]);

  const hideMarketBanner = () => {
    if (!profile?.id) return;
    const key = `keep:profile-market-banner:${viewer?.id || 'guest'}:${profile.id}`;
    const playlists = profileBoutiqueOffers.map((row) => row.offerId).sort().join(',');
    const events = `${marketBannerEventIds.join(',')}|pending:${marketBannerPendingEventCount}`;
    setMarketBannerVisible(false);
    setMarketBannerHasNew(false);
    void AsyncStorage.setItem(key, JSON.stringify({ manuallyClosed: true, playlists, events }));
  };

  const reopenMarketBanner = () => {
    if (!profile?.id) return;
    const key = `keep:profile-market-banner:${viewer?.id || 'guest'}:${profile.id}`;
    const playlists = profileBoutiqueOffers.map((row) => row.offerId).sort().join(',');
    const events = `${marketBannerEventIds.join(',')}|pending:${marketBannerPendingEventCount}`;
    setMarketBannerVisible(true);
    setMarketBannerHasNew(false);
    void AsyncStorage.setItem(key, JSON.stringify({ manuallyClosed: false, playlists, events }));
  };

  useEffect(() => {
    if (!profile?.id) { setPublicVibes([]); return undefined; }
    let live = true;
    loadPublicSmartAlbums(profile.id).then((rows) => { if (live) setPublicVibes(rows); }).catch(() => { if (live) setPublicVibes([]); });
    return () => { live = false; };
  }, [profile?.id]);
  useEffect(() => {
    if (!effectiveViewerId) { setSaleUnlocks({}); return undefined; }
    let live = true;
    loadMyPlaylistSaleUnlocks().then((rows) => { if (live) setSaleUnlocks(rows); }).catch(() => { if (live) setSaleUnlocks({}); });
    return () => { live = false; };
  }, [effectiveViewerId, profileBoutiqueOffers.length]);

  // Une Vibe KEEP_SMART mise en vente ne doit jamais apparaître deux fois :
  // une fois gratuitement comme Vibe publique ET une fois verrouillée comme
  // offre payante. L'offre verrouillée remplace la carte publique jusqu'au
  // déblocage. Cela protège aussi le contenu : aucun accès indirect au Swipe
  // gratuit de la même sélection avant achat.
  const saleProtectedSmartAlbumIds = useMemo(() => new Set(
    profileBoutiqueOffers
      .map((offer) => String(offer.playlistId || '').trim())
      .filter((id) => id.startsWith('keep-smart:'))
      .map((id) => id.slice('keep-smart:'.length))
      .filter(Boolean),
  ), [profileBoutiqueOffers]);
  const visiblePublicVibes = useMemo(
    () => publicVibes.filter((vibe) => !saleProtectedSmartAlbumIds.has(vibe.id)),
    [publicVibes, saleProtectedSmartAlbumIds],
  );

  useEffect(() => {
    let cancelled = false;
    // BUG RÉEL trouvé le 01/09/2026 (Adel, capture à l'appui : deux
    // notifications "Visite de ton profil" avec la même seconde exacte) :
    // le `void load()` du montage ET le premier événement `focus` de
    // Navigation se déclenchent tous les deux dès la toute première
    // ouverture de cet écran -- `load()` tournait donc deux fois en
    // parallèle, doublant chaque requête (dont notify_profile_view). Le
    // tout premier `focus` est ignoré ici puisque le `void load()` juste en
    // dessous le couvre déjà ; les focus suivants (retour sur cet écran)
    // continuent de recharger normalement.
    let skipNextFocus = true;
    const load = async () => {
      const coldLoad = loadedUsernameRef.current !== String(username || '').toLowerCase() || !profile;
      if (coldLoad) {
        setLoading(true);
        setPublicSnapshot(null);
        setDiscoveryImpacts({});
        setViewerKeepTrackIds(new Set());
      }
      setError(null);
      if (!username || !supabase) { setError('Profil indisponible.'); setLoading(false); return; }
      try {
        const result = await createProfileService(supabase).loadPublicProfileByUsername(username);
        if (cancelled) return;
        if (!result) { setError('Ce profil est privé ou introuvable.'); return; }
        // AJOUT (31/08/2026, exigence Apple 1.2 UGC) : si l'un a bloque l'autre
        // (dans n'importe quel sens), le contenu reste cache -- reutilise l'etat
        // d'erreur existant, deja affiche a la place du contenu, sans nouvel ecran.
        if (viewer && viewer.id !== result.id) {
          const blocked = await isBlockedEitherWay(result.id).catch(() => false);
          if (cancelled) return;
          if (blocked) { setIsBlocked(true); setError('Ce profil est indisponible.'); return; }
        }
        loadedUsernameRef.current = String(username).toLowerCase();
        setProfile(result);
        setFollowerCount(result.followerCount);

        // PERF CONTRACT: dès que l'identité publique et le contrôle de blocage
        // sont résolus, afficher le profil immédiatement. Les morceaux, likes,
        // impacts, offres et compteurs secondaires se remplissent ensuite sans
        // masquer tout l'écran derrière un spinner.
        if (coldLoad) setLoading(false);

        const snapshotPromise = loadPublicProfileSnapshot(result.id).catch(() => null);
        const impactPromise = loadProfileDiscoveryImpacts(result.id).catch(() => ({}));

        if (viewer?.id && viewer.id !== result.id && !isLocalGuest && !isDemoMode) {
          const { data: existing } = await supabase.from('follows').select('follower_id').eq('follower_id', viewer.id).eq('followee_id', result.id).maybeSingle();
          if (!cancelled) setIsFollowing(!!existing);
        } else if (!cancelled) {
          setIsFollowing(false);
        }

        const ownerViewingSelf = Boolean(effectiveViewerId && effectiveViewerId === result.id);
        const canonicalKeeps = ownerViewingSelf
          ? await loadOwnProfileKeeps()
          : await loadPublicProfileKeeps(result.id);
        if (cancelled) return;
        const normalized = canonicalKeeps.map((entry) => ({
          id: entry.decisionId,
          trackId: entry.track.id,
          title: entry.track.title,
          artist: entry.track.artist,
          album: entry.track.album ?? null,
          artworkUrl: entry.track.artworkUrl ?? null,
          previewUrl: entry.track.previewUrl,
          availableOn: entry.track.availableOn ?? [],
          externalUrls: entry.track.externalUrls ?? {},
          isrc: entry.track.isrc,
          durationSec: entry.track.durationSec,
          genres: entry.track.genres ?? [],
          providerIds: entry.track.providerIds ?? {},
          sourceUserId: entry.sourceUserId,
          sourceProfileId: entry.sourceProfileId,
          sourceUsername: entry.sourceUsername,
          sourceCertificationTier: entry.sourceCertificationTier,
          sourceIsFollowing: entry.sourceIsFollowing,
          keptAt: entry.keptAt,
          visibility: entry.visibility,
        } as PublicKeepTrack));

        if (cancelled) return;
        // Adel (15/09/2026) : "je ne vends pas de la musique, je vends ma
        // découverte et ma playlist ... pas de doublon" -- si tout est déjà
        // visible gratuitement ailleurs sur le profil, il n'y a rien à
        // débloquer en payant. Les morceaux d'une playlist en vente active
        // sont donc masqués de TOUTES les vues publiques gratuites (liste,
        // styles, artistes), jamais pour le propriétaire lui-même.
        const isOwnProfile = ownerViewingSelf;
        const maskedIds = isOwnProfile ? [] : await loadMaskedPlaylistSaleTrackIds(result.id).catch(() => []);
        if (cancelled) return;
        const visible = maskedIds.length ? normalized.filter((t) => !maskedIds.includes(t.trackId)) : normalized;
        setTracks(visible);
        const impacts = await impactPromise;
        if (cancelled) return;
        setDiscoveryImpacts(impacts);
        const localDiscoveryImpactCount = Object.values(impacts).reduce((total, impact) => total + (impact.originProfileId === result.id ? impact.recoveryCount : 0), 0);
        const snapshot = await snapshotPromise;
        if (cancelled) return;
        if (snapshot) {
          setPublicSnapshot(snapshot);
          // Adel (15/09/2026) : le compteur "Morceaux" ne doit jamais
          // annoncer plus que ce qui est réellement visible -- il inclurait
          // sinon les morceaux masqués (playlist en vente), incohérent avec
          // la liste juste en dessous.
          setDirectKeepCount(Math.max(0, snapshot.directPublicKeeps - maskedIds.length));
          setSocialKeepCount(snapshot.socialPublicKeeps);
          setFollowerCount(snapshot.followers);
        } else {
          setSocialKeepCount(localDiscoveryImpactCount);
          setDirectKeepCount(visible.length);
        }

        const ids = Array.from(new Set(normalized.map((track) => track.trackId).filter(Boolean)));
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        const alreadyKept = new Set<string>();

        for (const idChunk of chunks(ids)) {
          const { data: likes } = await supabase.from('track_likes').select('profile_id,track_id').in('track_id', idChunk);
          for (const row of likes ?? []) {
            counts[row.track_id] = (counts[row.track_id] || 0) + 1;
            if (viewer?.id && row.profile_id === viewer.id) mine.add(row.track_id);
          }

          if (viewer?.id && viewer.id !== result.id && !isLocalGuest && !isDemoMode) {
            const { data: ownKeeps } = await supabase
              .from('keep_decisions')
              .select('track_id')
              .eq('profile_id', effectiveViewerId)
              .eq('decision', 'KEPT')
              .in('track_id', idChunk);
            for (const row of ownKeeps ?? []) if (row.track_id) alreadyKept.add(String(row.track_id));
          }
        }

        if (!cancelled) {
          setLikeCounts(counts);
          setLikedTrackIds(mine);
          setViewerKeepTrackIds(alreadyKept);
        }
      } catch {
        if (!cancelled) {
          // Si l'identité n'a jamais été chargée, l'écran est réellement
          // indisponible. Si elle est déjà visible, une panne secondaire ne
          // doit pas remplacer tout le profil par une erreur globale.
          if (!profile && loadedUsernameRef.current !== String(username || '').toLowerCase()) {
            setError('Impossible de charger ce profil pour le moment.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const unsubscribe = navigation?.addListener?.('focus', () => {
      if (skipNextFocus) { skipNextFocus = false; return; }
      void load();
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [username, viewer?.id, effectiveViewerId, isLocalGuest, isDemoMode, navigation]);

  const swipeSourceByTrack = useMemo(() => Object.fromEntries(tracks.map((track) => [track.trackId, {
    profileId: track.sourceProfileId || track.sourceUserId || profile?.id,
    username: track.sourceUsername || profile?.username,
    avatarUrl: track.sourceProfileId || track.sourceUserId ? null : profile?.avatar,
  }])), [tracks, profile?.id, profile?.username, profile?.avatar]);

  const swipeTracks = useMemo<CanonicalTrack[]>(() => tracks.map((track) => ({
    id: track.trackId,
    isrc: track.isrc,
    title: track.title,
    artist: track.artist,
    album: track.album || undefined,
    durationSec: track.durationSec,
    artworkUrl: track.artworkUrl || undefined,
    previewUrl: track.previewUrl,
    availableOn: track.availableOn,
    externalUrls: track.externalUrls,
    genres: track.genres,
    providerIds: track.providerIds || {},
  })), [tracks]);

  // Adel (14/09/2026) : "il va écouter mille musiques ... il faut qu'il
  // puisse sélectionner par style, après par artiste" -- avant, un visiteur
  // n'avait qu'UN SEUL gros bouton Swipe sur TOUTE la collection, aucun moyen
  // de la découper. Nouvelle brique séparée (la liste "Morceaux publics" en
  // dessous ne change pas) : des styles (genres réels des morceaux, aucune
  // génération payante requise contrairement aux Vibes) et des artistes
  // (même regroupement anti-doublon que le propre profil), chacun ouvrant un
  // Swipe limité à sa propre sélection.
  const [browseFilter, setBrowseFilter] = useState<{ type: 'genre' | 'artist'; value: string; label: string } | null>(null);
  // Adel (14/09/2026) : "ça fait trop de boutons ... un million d'artistes
  // ... il faut un système de roulette ... comme tu as fait pour les
  // battles" -- même mécanisme que MES STYLES ACCEPTÉS en Battle (bouton
  // compact + dérouleur), plus un mur de puces qui grossit avec la taille
  // de la collection.
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  // Refonte 24/09/2026 : les Styles sont la vue principale. La liste détaillée
  // reste disponible en un tap, sans supprimer aucune action existante.
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [visitorPulseExpanded, setVisitorPulseExpanded] = useState(false);
  // (21/09/2026) refonte collection -- "PAR ARTISTE" (bouton + modale)
  // retiré : l'onglet Artistes ci-dessous ouvre exactement la même liste,
  // avec la même action (Swipe filtré). Ne pas garder les deux, même
  // fonction, pour ne pas dupliquer.
  const [activeTab, setActiveTab] = useState<ProfileTab>('TRACKS');
  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of swipeTracks) for (const genre of track.genres ?? []) {
      const clean = genre.trim();
      if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([genre, count]) => ({ genre, count }));
  }, [swipeTracks]);
  const visitorStyleBubbles = useMemo(() => buildMusicStyleBubbles([
    profile?.favoriteGenres,
    genreOptions.map((row) => row.genre),
  ], 40), [genreOptions, profile?.favoriteGenres]);

  const visitorStyleCoveragePercent = useMemo(() => {
    if (!swipeTracks.length) return 0;
    const tagged = swipeTracks.filter((track) =>
      (track.genres ?? []).some((genre) => String(genre || '').trim())
    ).length;
    return Math.max(0, Math.min(100, Math.round((tagged / swipeTracks.length) * 100)));
  }, [swipeTracks]);


  const genreArtwork = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const track of swipeTracks) {
      if (!track.artworkUrl) continue;
      for (const rawGenre of track.genres ?? []) {
        const genre = rawGenre.trim();
        if (genre && !map[genre]) map[genre] = track.artworkUrl;
      }
    }
    return map;
  }, [swipeTracks]);
  const genreAlreadyOwnedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const track of swipeTracks) {
      if (!viewerKeepTrackIds.has(track.id)) continue;
      for (const rawGenre of track.genres ?? []) {
        const genre = rawGenre.trim();
        if (genre) counts[genre] = (counts[genre] ?? 0) + 1;
      }
    }
    return counts;
  }, [swipeTracks, viewerKeepTrackIds]);
  // Priorité visuelle aux vrais styles calculés depuis les morceaux publics :
  // ils permettent d'afficher le nombre exact déjà présent chez le visiteur.
  // Les Vibes restent le fallback quand aucun genre exploitable n'est connu.
  const freeStyleCardCount = genreOptions.length > 0 ? genreOptions.length : visiblePublicVibes.length;
  const totalStyleCardCount = freeStyleCardCount;
  const artistGroups = useMemo(() => groupTracksByArtist(swipeTracks), [swipeTracks]);
  // Adel (14/09/2026, audit) : "est-ce que le système fait la différence du
  // style musical ?" -- même enrichissement en tâche de fond que le propre
  // profil : les morceaux sans genre de CE profil visité sont enrichis et
  // partagés avec toute l'app (jamais bloquant, plafonné).
  useEffect(() => {
    const missing = swipeTracks.filter((t) => !t.genres || t.genres.length === 0).slice(0, 15).map((t) => ({ id: t.id, title: t.title, artist: t.artist, genres: [] as string[] }));
    if (!missing.length) return undefined;
    let live = true;
    enrichMissingGenres(missing).then((enriched) => { if (live) void persistEnrichedGenres(enriched); }).catch(() => {});
    return () => { live = false; };
  }, [swipeTracks]);
  const browseSwipeTracks = useMemo(() => {
    if (!browseFilter) return swipeTracks;
    return browseFilter.type === 'genre'
      ? swipeTracks.filter((track) => (track.genres ?? []).some((g) => g.trim() === browseFilter.value))
      : swipeTracks.filter((track) => canonicalArtistIdentity(track) === browseFilter.value);
  }, [swipeTracks, browseFilter]);
  // (21/09/2026) refonte "1er KEEP" -- même calcul que ProfilePublicScreen,
  // à partir de discoveryImpacts (déjà chargé, réel) et keptAt (déjà
  // renvoyé par loadPublicProfileKeeps, juste jamais mappé jusqu'ici).
  const daysAgo = (iso?: string | null) => { if (!iso) return null; return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); };
  const openFolderSwipe = async (title: string, loader: () => Promise<CanonicalTrack[]>, loadingKey: string) => {
    if (folderLoadingId) return;
    unlockWebAudioForGesture();
    setFolderLoadingId(loadingKey);
    try {
      const rows = await loader();
      if (!rows.length) {
        Alert.alert('Vibe Loki Music', 'Cette sélection ne contient pas encore de morceau accessible.');
        return;
      }
      setFolderSwipeTracks(rows);
      setFolderSwipeTitle(title);
      setBrowseFilter(null);
      setSwipeOpen(true);
    } catch {
      Alert.alert('Vibe Loki Music', 'Impossible d’ouvrir cette sélection pour le moment.');
    } finally {
      setFolderLoadingId(null);
    }
  };

  const openPublicVibe = (vibe: SmartAlbumRecord) => {
    if (!profile) return;
    void openFolderSwipe(vibe.name, () => loadPublicSmartAlbumTracks(profile.id, vibe.id), `vibe:${vibe.id}`);
  };

  useEffect(() => {
    if (!openSaleOfferId || !saleOffers.length) return;
    const offer = saleOffers.find((row) => row.offerId === openSaleOfferId);
    if (!offer) return;
    const ownerViewingSelf = Boolean(viewer?.id && profile?.id && effectiveViewerId === profile.id);
    unlockWebAudioForGesture();
    if (ownerViewingSelf) {
      void openFolderSwipe(
        offer.playlistName,
        () => loadOwnPlaylistSaleOfferTracks(offer.offerId),
        `sale-owner-notification:${offer.offerId}`,
      );
    } else {
      setImmersivePreviewOffer(offer);
    }
    navigation?.setParams?.({ openSaleOfferId: undefined });
  }, [openSaleOfferId, saleOffers, navigation, viewer?.id, profile?.id, effectiveViewerId]);

  const openSaleFolder = (offer: PublicPlaylistSaleOffer) => {
    salePreviewSequenceRef.current += 1;
    void stopAntiShazamPreview().catch(() => {});
    const ownerViewingSelf = Boolean(viewer?.id && profile?.id && effectiveViewerId === profile.id);
    if (ownerViewingSelf) {
      // Propriétaire : aucun tunnel d'achat, aucune condition inutile.
      // Un tap sur sa Pépite ouvre directement sa propre collection en lecture.
      unlockWebAudioForGesture();
      void openFolderSwipe(
        offer.playlistName,
        () => loadOwnPlaylistSaleOfferTracks(offer.offerId),
        `sale-owner:${offer.offerId}`,
      );
      return;
    }
    const unlock = saleUnlocks[offer.offerId];
    if (unlock?.deliveredPlaylistId) {
      void openFolderSwipe(offer.playlistName, () => loadDeliveredPlaylistSaleTracks(unlock.deliveredPlaylistId), `sale:${offer.offerId}`);
      return;
    }
    // Le tap sur la carte est le geste utilisateur requis par Safari/iOS :
    // déverrouille l'audio ici pour que l'aperçu puisse partir dès l'ouverture,
    // sans imposer un second bouton "Écouter".
    unlockWebAudioForGesture();
    setImmersivePreviewSellerUsername(profile?.username ?? null);
    setImmersivePreviewOffer(offer);
  };

  const openSuggestedSaleDrop = async (suggestion: ProfileSaleSuggestion) => {
    unlockWebAudioForGesture();
    try {
      const offers = await loadPlaylistSaleOffersForProfile(suggestion.sellerId);
      const offer = offers.find((row) => row.offerId === suggestion.offerId);
      if (!offer) {
        Alert.alert('Boutique musicale', 'Cette collection n’est plus disponible.');
        setProfileSaleSuggestions((rows) => rows.filter((row) => row.offerId !== suggestion.offerId));
        return;
      }
      setImmersivePreviewSellerUsername(suggestion.sellerUsername);
      setImmersivePreviewOffer(offer);
    } catch {
      Alert.alert('Boutique musicale', 'Impossible de charger cet aperçu pour le moment.');
    }
  };

  const openBrowseSwipe = (filter: { type: 'genre' | 'artist'; value: string; label: string } | null) => {
    // Adel (20/09/2026) : BUG RÉEL -- l'autoplay du Swipe ne démarrait
    // jamais tout seul sur le web, forçant "ÉCOUTER L'EXTRAIT" à chaque
    // morceau. Même correctif que Battle : .play() doit être appelé de
    // façon SYNCHRONE depuis ce vrai geste (tap) pour débloquer l'élément
    // <audio> partagé, sinon la première lecture programmatique lancée par
    // MusicSwipeDeckModal (après resolveTrackPreviewUrl) arrive trop tard
    // et le navigateur la refuse.
    unlockWebAudioForGesture();
    setBrowseFilter(filter);
    setSwipeOpen(true);
  };

  const resolveInlinePreview = async (track: CanonicalTrack): Promise<string | null> => {
    const cached = inlinePreviewUrlCacheRef.current.get(track.id);
    if (cached) return cached;
    const resolved = track.previewUrl || await resolveTrackPreviewUrl(track).catch(() => null);
    if (resolved) inlinePreviewUrlCacheRef.current.set(track.id, resolved);
    return resolved;
  };

  const playInlineQueueItem = async (
    label: string,
    candidates: CanonicalTrack[],
    startIndex: number,
    generation: number,
  ): Promise<void> => {
    if (generation !== inlineQueueGenerationRef.current || !candidates.length) return;

    // Cherche le prochain morceau réellement jouable sans casser toute la file
    // si un catalogue ne fournit plus l'extrait d'un titre précis.
    let index = startIndex;
    let track: CanonicalTrack | null = null;
    let previewUrl: string | null = null;
    while (index < candidates.length && generation === inlineQueueGenerationRef.current) {
      const candidate = candidates[index];
      const resolved = await resolveInlinePreview(candidate);
      if (resolved) {
        track = candidate;
        previewUrl = resolved;
        break;
      }
      index += 1;
    }

    if (!track || !previewUrl || generation !== inlineQueueGenerationRef.current) {
      setInlineStylePlayingKey(null);
      if (startIndex === 0) Alert.alert('Écoute', `Aucun extrait disponible dans ${label} pour le moment.`);
      else setInlineListenNotice(`Fin de l’écoute · ${label}`);
      return;
    }

    const key = `visitor-inline:${profile?.id ?? username ?? 'profile'}:${track.id}`;

    // Prépare l'URL du titre suivant pendant que le morceau courant joue.
    // Cela supprime le blanc créé auparavant par la résolution réseau APRÈS
    // la fin naturelle de l'extrait.
    const nextCandidate = candidates[index + 1];
    if (nextCandidate) {
      void resolveInlinePreview(nextCandidate).then((nextUrl) => {
        if (nextUrl && generation === inlineQueueGenerationRef.current) {
          void preloadTrackPreview(nextUrl);
        }
      });
    }

    try {
      await toggleTrackPreview(
        key,
        previewUrl,
        (playing) => {
          if (generation !== inlineQueueGenerationRef.current) return;
          setInlineStylePlayingKey((current) => playing ? key : current === key ? null : current);
          if (playing && profile?.id) void recordProfileSwipeListen(profile.id, track!.id);
        },
        () => {
          if (generation !== inlineQueueGenerationRef.current) return;
          setInlineStylePlayingKey((current) => current === key ? null : current);
          const nextIndex = index + 1;
          if (nextIndex < candidates.length) {
            // Même écran, même lecteur partagé : l'extrait suivant démarre
            // automatiquement au lieu de laisser un silence brutal.
            void playInlineQueueItem(label, candidates, nextIndex, generation);
          } else {
            setInlineListenNotice(`Fin de l’écoute · ${label}`);
          }
        },
      );
      if (alreadyInMyKeep(track.id)) {
        setInlineListenNotice('✓ Déjà dans ta collection · l’écoute continue');
      } else {
        setInlineListenNotice(`▶ ${label} · ${index + 1}/${candidates.length}`);
      }
    } catch {
      if (generation !== inlineQueueGenerationRef.current) return;
      const nextIndex = index + 1;
      if (nextIndex < candidates.length) {
        void playInlineQueueItem(label, candidates, nextIndex, generation);
      } else {
        setInlineStylePlayingKey(null);
        Alert.alert('Écoute', 'Impossible de lancer les extraits de ce style pour le moment.');
      }
    }
  };

  const playInlinePublicTrack = async (label: string, candidates: CanonicalTrack[]) => {
    if (!candidates.length) {
      Alert.alert('Écoute', `Aucun extrait disponible dans ${label} pour le moment.`);
      return;
    }

    const candidateIds = new Set(candidates.map((track) => track.id));
    const activeTrackId = inlineStylePlayingKey?.split(':').pop() ?? '';
    if (inlineStylePlayingKey && candidateIds.has(activeTrackId)) {
      inlineQueueGenerationRef.current += 1;
      await stopTrackPreview(inlineStylePlayingKey).catch(() => {});
      setInlineStylePlayingKey(null);
      setInlineListenNotice(`Pause · ${label}`);
      return;
    }

    inlineQueueGenerationRef.current += 1;
    const generation = inlineQueueGenerationRef.current;
    if (inlineStylePlayingKey) await stopTrackPreview(inlineStylePlayingKey).catch(() => {});
    setInlineStylePlayingKey(null);

    // Le tap sur ▶ est le geste utilisateur qui déverrouille Safari/iOS.
    // Les titres suivants réutilisent le même élément audio et restent donc
    // dans la même interface sans redirection.
    unlockWebAudioForGesture();
    void playInlineQueueItem(label, candidates, 0, generation);
  };

  const playFeaturedSalePreviews = async (offers: PublicPlaylistSaleOffer[]) => {
    if (!offers.length) return;
    const generation = ++salePreviewSequenceRef.current;
    unlockWebAudioForGesture();
    try {
      const samples = profile?.id ? await loadPlaylistSaleProfilePreviewSampler(profile.id) : [];
      const sampleByOffer = new Map(samples.map((sample) => [sample.offerId, sample]));
      const queue = offers
        .map((offer) => ({ offer, preview: sampleByOffer.get(offer.offerId) }))
        .filter((row): row is { offer: PublicPlaylistSaleOffer; preview: { offerId: string; trackId: string; previewUrl: string } } => Boolean(row.preview?.previewUrl));

      if (!queue.length || generation !== salePreviewSequenceRef.current) {
        Alert.alert('Aperçus', 'Aucun extrait protégé n’est disponible pour ces Pépites.');
        return;
      }

      await stopAntiShazamPreview().catch(() => {});

      const playAt = async (index: number): Promise<void> => {
        if (generation !== salePreviewSequenceRef.current) return;
        const item = queue[index];
        if (!item) {
          setInlineListenNotice(`Fin des aperçus · ${queue.length} Pépite${queue.length > 1 ? 's' : ''} écoutée${queue.length > 1 ? 's' : ''}`);
          return;
        }
        const key = `visitor-sale-sequence:${profile?.id ?? username ?? 'profile'}:${generation}:${index}`;
        setInlineListenNotice(`▶ Aperçu ${index + 1}/${queue.length} · ${item.offer.playlistName}`);
        try {
          await playAntiShazamPreviewSegment(
            key,
            item.preview.previewUrl,
            () => {},
            () => {
              if (generation === salePreviewSequenceRef.current) void playAt(index + 1);
            },
          );
        } catch {
          if (generation === salePreviewSequenceRef.current) void playAt(index + 1);
        }
      };

      void playAt(0);
    } catch {
      if (generation === salePreviewSequenceRef.current) {
        Alert.alert('Aperçus', 'Impossible de lancer les extraits protégés pour le moment.');
      }
    }
  };

  const playInlineSalePreview = async (offer: PublicPlaylistSaleOffer) => {
    const keyPrefix = `visitor-sale-inline:${offer.offerId}`;
    unlockWebAudioForGesture();
    try {
      const rows = await loadPlaylistSaleOfferPreviewTracks(offer.playlistId);
      const preview = rows.find((row) => !!row.previewUrl);
      if (!preview?.previewUrl) {
        Alert.alert('Aperçu protégé', 'Aucun extrait anonyme n’est disponible pour cette collection.');
        return;
      }
      const key = `${keyPrefix}:${preview.trackId}`;
      await toggleTrackPreview(
        key,
        preview.previewUrl,
        (playing) => setInlineStylePlayingKey((current) => playing ? key : current === key ? null : current),
        () => setInlineStylePlayingKey((current) => current === key ? null : current),
      );
    } catch {
      Alert.alert('Aperçu protégé', 'Impossible de lancer cet extrait anonyme pour le moment.');
    }
  };

  // Adel (16-17/09/2026) : "l'idéal c'est que l'utilisateur se fait payer
  // directement ... KEEP encaisse rien" -- Acheter ouvre le lien de
  // paiement PERSONNEL du vendeur (jamais un compte KEEP), la demande est
  // notée pour que le créateur sache qui débloquer une fois vraiment payé.
  const [purchaseBusyId, setPurchaseBusyId] = useState<string | null>(null);
  const [payoutCheckout, setPayoutCheckout] = useState<PlaylistPurchaseRequest | null>(null);
  const [missingRequestBusyId, setMissingRequestBusyId] = useState<string | null>(null);
  const [immersivePreviewOffer, setImmersivePreviewOffer] = useState<PublicPlaylistSaleOffer | null>(null);
  const [immersivePreviewSellerUsername, setImmersivePreviewSellerUsername] = useState<string | null>(null);
  const [freeBalance, setFreeBalance] = useState<number | null>(null);
  const [freePurchaseMessage, setFreePurchaseMessage] = useState<string | null>(null);

  useEffect(() => {
    setFreePurchaseMessage(null);
    if (!immersivePreviewOffer || immersivePreviewOffer.paymentMode === 'MONEY' || !effectiveViewerId) {
      setFreeBalance(null);
      return undefined;
    }
    let live = true;
    loadFreeCreditBreakdown()
      .then((breakdown) => { if (live) setFreeBalance(breakdown?.remaining ?? null); })
      .catch(() => { if (live) setFreeBalance(null); });
    return () => { live = false; };
  }, [immersivePreviewOffer?.offerId, immersivePreviewOffer?.paymentMode, effectiveViewerId]);

  const requestOnlyMissingTracks = async (offer: PublicPlaylistSaleOffer) => {
    if (missingRequestBusyId) return;
    if (!effectiveViewerId) {
      goToOwnProfile();
      return;
    }
    setMissingRequestBusyId(offer.offerId);
    try {
      const result = await requestMissingPlaylistSaleTracks(offer.offerId);
      Alert.alert(
        'Demande envoyée',
        `@${profile?.username || 'le créateur'} a reçu ta demande pour ${result.missingCount} morceau${result.missingCount > 1 ? 'x' : ''} manquant${result.missingCount > 1 ? 's' : ''}. Il pourra te proposer un prix en FREE.`,
      );
      setImmersivePreviewOffer(null);
    } catch (e: any) {
      const message = String(e?.message || '');
      if (message.includes('ALL_TRACKS_ALREADY_OWNED')) {
        Alert.alert('Tu as déjà tout', 'Tous les morceaux de cette collection sont déjà dans ton Loki Music.');
      } else if (message.includes('authentication_required')) {
        goToOwnProfile();
      } else {
        Alert.alert('Demande', 'Impossible d’envoyer la demande pour le moment.');
      }
    } finally {
      setMissingRequestBusyId(null);
    }
  };

  const handleDuplicatePurchaseBlock = (offer: PublicPlaylistSaleOffer, message: string): boolean => {
    const match = message.match(/DUPLICATE_TRACK_PURCHASE_BLOCKED\s*:\s*(\d+)\s*:\s*(\d+)/i);
    if (!match) return false;
    const owned = Number(match[1] || 0);
    const missing = Number(match[2] || 0);
    if (missing <= 0) {
      Alert.alert('Déjà dans ton Loki Music', 'Tu possèdes déjà tous les morceaux de cette collection. Aucun paiement ni FREE ne sera débité.');
      return true;
    }
    Alert.alert(
      'Pas de double achat',
      `Tu possèdes déjà ${owned} morceau${owned > 1 ? 'x' : ''}. Loki ne te les fera jamais repayer. Demande seulement les ${missing} morceau${missing > 1 ? 'x' : ''} manquant${missing > 1 ? 's' : ''}.`,
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: `DEMANDER LES ${missing} MANQUANTS`, onPress: () => { void requestOnlyMissingTracks(offer); } },
      ],
    );
    return true;
  };

  const acceptMarketplaceTermsThen = (source: string, onAccepted: () => void) => {
    Alert.alert(
      'Conditions des paiements entre utilisateurs',
      'Loki Music met en relation l’acheteur et le vendeur mais ne détient pas l’argent PayPal. Chacun doit vérifier les informations, conserver les preuves et respecter le règlement. Une fausse déclaration peut entraîner un retrait de Free, une suspension ou un bannissement.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'LIRE LES CONDITIONS', onPress: () => { void Linking.openURL('https://adelkhatra-bit.github.io/KEEP/terms/'); } },
        {
          text: 'J’ACCEPTE',
          onPress: () => {
            void acceptMarketplacePaymentTerms(source)
              .then(() => onAccepted())
              .catch(() => Alert.alert('Conditions', 'Impossible d’enregistrer ton acceptation pour le moment.'));
          },
        },
      ],
    );
  };

  const buyAllPlaylistOffers = async (offers: PublicPlaylistSaleOffer[]) => {
    if (purchaseBusyId || !offers.length) return;
    if (!effectiveViewerId) {
      goToOwnProfile();
      return;
    }

    const locked = offers.filter((offer) => !saleUnlocks[offer.offerId]?.deliveredPlaylistId);
    if (!locked.length) {
      Alert.alert('Boutique musicale', 'Tu as déjà débloqué toutes ces collections.');
      return;
    }

    const dualOffers = locked.filter((offer) => offer.paymentMode === 'BOTH');
    if (dualOffers.length) {
      Alert.alert('Choix du paiement', 'Les collections FREE + PayPal se débloquent une par une afin que tu choisisses le mode de paiement pour chacune.');
      return;
    }
    const freeOffers = locked.filter((offer) => offer.paymentMode === 'FREE');
    const moneyOffers = locked.filter((offer) => offer.paymentMode === 'MONEY');

    if (freeOffers.length && moneyOffers.length) {
      const freeTotal = freeOffers.reduce((sum, offer) => sum + Math.max(0, Number(offer.freePrice ?? 0)), 0);
      const moneyGroups = new Map<string, number>();
      moneyOffers.forEach((offer) => {
        const currency = String(offer.currencyCode || 'EUR').toUpperCase();
        moneyGroups.set(currency, (moneyGroups.get(currency) || 0) + Math.max(0, Number(offer.priceCents || 0)));
      });
      const moneyLabel = Array.from(moneyGroups.entries()).map(([currency, cents]) => {
        const amount = (cents / 100).toFixed(2).replace('.', ',');
        return currency === 'EUR' ? `${amount} €` : `${amount} ${currency}`;
      }).join(' + ');
      Alert.alert(
        'Tout prendre',
        `Cette Boutique mélange deux moyens de paiement : ${freeTotal} FREE et ${moneyLabel}. Choisis quelle partie débloquer maintenant.`,
        [
          { text: 'ANNULER', style: 'cancel' },
          { text: `FREE · ${freeTotal}`, onPress: () => { void buyAllPlaylistOffers(freeOffers); } },
          { text: `PAYPAL · ${moneyLabel}`, onPress: () => { void buyAllPlaylistOffers(moneyOffers); } },
        ],
      );
      return;
    }

    if (freeOffers.length) {
      const requiredFree = freeOffers.reduce((sum, offer) => sum + Math.max(0, Number(offer.freePrice ?? 0)), 0);
      setPurchaseBusyId('bundle');
      setFreePurchaseMessage(null);
      try {
        const breakdown = await loadFreeCreditBreakdown().catch(() => null);
        if (breakdown && breakdown.remaining < requiredFree) {
          setFreeBalance(breakdown.remaining);
          Alert.alert('FREE insuffisants', `Tu as ${breakdown.remaining} FREE, il en faut ${requiredFree} pour ces ${freeOffers.length} collections.`);
          return;
        }
        const result = freeOffers.length === 1
          ? await purchasePlaylistOfferWithFree(freeOffers[0].offerId).then((single) => ({
              bundleCount: 1,
              freeSpent: Number(single.freePrice ?? requiredFree),
              remainingFree: single.remainingFree,
            }))
          : await purchasePlaylistBundleWithFree(freeOffers.map((offer) => offer.offerId));
        setFreeBalance(result.remainingFree);
        const unlocks = await loadMyPlaylistSaleUnlocks().catch(() => null);
        if (unlocks) setSaleUnlocks(unlocks);
        Alert.alert(
          'Pépites débloquées',
          `${result.bundleCount} collection${result.bundleCount > 1 ? 's' : ''} ajoutée${result.bundleCount > 1 ? 's' : ''} à ton Loki Music pour ${result.freeSpent} FREE. Il te reste ${result.remainingFree} FREE.`,
        );
      } catch (e: any) {
        const message = String(e?.message || '');
        if (message.includes('DUPLICATE_TRACK_PURCHASE_BLOCKED')) {
          Alert.alert('Pas de double achat', 'Une des collections contient déjà de la musique que tu possèdes. Loki bloque le débit groupé. Ouvre-la séparément pour demander uniquement les morceaux manquants.');
          return;
        }
        const match = message.match(/NOT_ENOUGH_FREE\s*:\s*(\d+)\s*:\s*(\d+)/i);
        if (match) {
          const remaining = Number(match[1]);
          const required = Number(match[2]);
          setFreeBalance(remaining);
          Alert.alert('FREE insuffisants', `Tu as ${remaining} FREE, il en faut ${required}.`);
        } else {
          Alert.alert('Boutique musicale', 'Impossible de débloquer ces collections pour le moment.');
        }
      } finally {
        setPurchaseBusyId(null);
      }
      return;
    }

    const currencies = Array.from(new Set(moneyOffers.map((offer) => String(offer.currencyCode || 'EUR').toUpperCase())));
    if (currencies.length > 1) {
      Alert.alert(
        'Plusieurs devises',
        'Le vendeur a publié des collections dans plusieurs devises. Loki les sépare pour éviter de mélanger des montants incompatibles.',
        [
          { text: 'ANNULER', style: 'cancel' },
          ...currencies.slice(0, 3).map((currency) => ({
            text: currency,
            onPress: () => { void buyAllPlaylistOffers(moneyOffers.filter((offer) => String(offer.currencyCode || 'EUR').toUpperCase() === currency)); },
          })),
        ],
      );
      return;
    }

    if (!marketplacePurchaseEnabled) {
      Alert.alert('Paiement externe indisponible', 'Les aperçus restent disponibles. Le paiement PayPal n’est pas activé sur cette version de l’application.');
      return;
    }

    if (moneyOffers.length === 1) {
      await buyPlaylistOffer(moneyOffers[0]);
      return;
    }

    setPurchaseBusyId('bundle');
    try {
      const termsAccepted = await loadMarketplacePaymentTermsAccepted().catch(() => false);
      if (!termsAccepted) {
        setPurchaseBusyId(null);
        acceptMarketplaceTermsThen('profile_bundle_purchase', () => { void buyAllPlaylistOffers(moneyOffers); });
        return;
      }
      const request = await requestPlaylistBundlePurchase(moneyOffers.map((offer) => offer.offerId));
      if (!request.payoutLink && !request.payoutQrUrl) {
        Alert.alert('Paiement pas encore prêt', `${request.sellerUsername || 'Ce créateur'} n’a pas encore ajouté de PayPal.Me ni de QR PayPal.`);
        return;
      }
      setImmersivePreviewOffer(null);
      setPayoutCheckout(request);
    } catch (e: any) {
      const message = String(e?.message || '');
      if (message.includes('DUPLICATE_TRACK_PURCHASE_BLOCKED')) {
        Alert.alert('Pas de double achat', 'Une de ces collections contient déjà de la musique que tu possèdes. Loki bloque le paiement groupé pour éviter tout doublon. Ouvre les collections concernées et demande seulement les morceaux manquants.');
        return;
      }
      if (message.includes('FIRST_PAYMENT_ONE_AT_A_TIME') || message.includes('FIRST_PAYMENT_PENDING')) {
        Alert.alert('Première transaction en cours', 'Termine ou annule d’abord ta première transaction avant de lancer un achat groupé.');
      } else if (message.includes('SELLER_PAYOUT_NOT_CONFIGURED')) {
        Alert.alert('Paiement pas encore prêt', 'Le vendeur doit ajouter son PayPal.Me ou son QR PayPal.');
      } else {
        Alert.alert('Boutique musicale', 'Impossible de préparer le paiement groupé pour le moment.');
      }
    } finally {
      setPurchaseBusyId(null);
    }
  };

  const buyPlaylistOffer = async (offer: PublicPlaylistSaleOffer) => {
    if (purchaseBusyId) return;
    if (!effectiveViewerId) {
      goToOwnProfile();
      return;
    }

    // FREE = monnaie interne Loki Music : le déblocage est atomique et
    // immédiat, y compris sur mobile. Un seul débit débloque TOUTE la
    // collection, jamais morceau par morceau.
    if (offer.paymentMode === 'FREE') {
      const requiredFree = Math.max(0, Number(offer.freePrice ?? 0));
      setPurchaseBusyId(offer.offerId);
      setFreePurchaseMessage(null);
      try {
        const breakdown = await loadFreeCreditBreakdown().catch(() => null);
        if (breakdown) {
          setFreeBalance(breakdown.remaining);
          if (breakdown.remaining < requiredFree) {
            setFreePurchaseMessage('Solde insuffisant : tu as ' + breakdown.remaining + ' FREE, il en faut ' + requiredFree + '. Recharge tes FREE pour débloquer cette collection.');
            return;
          }
        }
        const result = await purchasePlaylistOfferWithFree(offer.offerId);
        setFreeBalance(result.remainingFree);
        setSaleUnlocks((current) => ({
          ...current,
          [offer.offerId]: { offerId: offer.offerId, deliveredPlaylistId: result.playlistId },
        }));
        setImmersivePreviewOffer(null);
        Alert.alert(
          result.alreadyUnlocked ? 'Déjà débloquée' : 'Collection débloquée',
          result.alreadyUnlocked
            ? 'Cette collection est déjà dans ton Loki Music.'
            : `Les ${result.trackCount} morceaux sont maintenant dans ton Loki Music. Il te reste ${result.remainingFree} FREE.`,
        );
      } catch (e: any) {
        const message = String(e?.message || '');
        if (handleDuplicatePurchaseBlock(offer, message)) return;
        const match = message.match(/NOT_ENOUGH_FREE\s*:\s*(\d+)\s*:\s*(\d+)/i);
        if (match) {
          const remaining = Number(match[1]);
          const required = Number(match[2]);
          setFreeBalance(remaining);
          setFreePurchaseMessage('Solde insuffisant : tu as ' + remaining + ' FREE, il en faut ' + required + '. Recharge tes FREE pour débloquer cette collection.');
        } else if (message.includes('authentication_required')) {
          goToOwnProfile();
        } else {
          setFreePurchaseMessage('Impossible de vérifier ton solde FREE pour le moment. Réessaie dans un instant.');
        }
      } finally {
        setPurchaseBusyId(null);
      }
      return;
    }

    if (!marketplacePurchaseEnabled) {
      Alert.alert('Aperçu disponible', 'Tu peux écouter les extraits anonymes et voir les collections verrouillées. Le paiement externe n’est pas activé dans cette version mobile.');
      return;
    }

    setPurchaseBusyId(offer.offerId);
    try {
      const termsAccepted = await loadMarketplacePaymentTermsAccepted().catch(() => false);
      if (!termsAccepted) {
        Alert.alert(
          'Conditions du paiement',
          'Le paiement est direct entre toi et le vendeur. Tu dois vérifier le montant, envoyer une preuve après paiement et attendre la validation réelle du vendeur. Les fausses déclarations ou abus peuvent entraîner retrait de Free, suspension ou bannissement.',
          [
            { text: 'LIRE LES CONDITIONS', onPress: () => { void Linking.openURL('https://adelkhatra-bit.github.io/KEEP/terms/'); } },
            { text: 'ANNULER', style: 'cancel' },
            {
              text: 'J’ACCEPTE',
              onPress: () => {
                void acceptMarketplacePaymentTerms('public_profile_purchase')
                  .then(() => void buyPlaylistOffer(offer))
                  .catch(() => Alert.alert('Conditions', 'Impossible d’enregistrer ton acceptation pour le moment.'));
              },
            },
          ],
        );
        return;
      }
      // La RPC attend l'UUID de l'offre, jamais l'identifiant technique de
      // playlist (qui peut être "keep-selection:...").
      const request = await requestPlaylistPurchase(offer.offerId);
      if (!request.payoutLink && !request.payoutQrUrl) {
        Alert.alert('Paiement pas encore prêt', `${request.sellerUsername || 'Ce créateur'} n'a pas encore ajouté de PayPal.Me ni de QR PayPal.`);
        return;
      }
      setImmersivePreviewOffer(null);
      setPayoutCheckout(request);
    } catch (e: any) {
      const message = String(e?.message || '');
      if (handleDuplicatePurchaseBlock(offer, message)) return;
      if (message.includes('authentication_required')) goToOwnProfile();
      else if (message.includes('FIRST_PAYMENT_ONE_AT_A_TIME') || message.includes('FIRST_PAYMENT_PENDING')) Alert.alert(
        'Première transaction en cours',
        'Pour sécuriser ton premier achat, termine ou annule la transaction déjà ouverte avant d’en lancer une autre. Après une première transaction réellement terminée, tu pourras faire de nouvelles demandes normalement.',
        [
          { text: 'OK', style: 'cancel' },
          { text: 'VOIR MES TRANSACTIONS', onPress: () => navigation.navigate('PlaylistSale', { openPaymentHistory: true, source: 'FIRST_PAYMENT_GUARD' }) },
        ],
      );
      else if (message.includes('TERMS_ACCEPTANCE_REQUIRED')) acceptMarketplaceTermsThen('profile_purchase', () => { void buyPlaylistOffer(offer); });
      else if (message.includes('SELLER_TERMS_ACCEPTANCE_REQUIRED')) Alert.alert('Paiement temporairement indisponible', 'Le vendeur doit accepter les conditions des paiements Loki Music avant de recevoir une nouvelle demande.');
      else if (message.includes('SELLER_PAYOUT_NOT_CONFIGURED')) Alert.alert('Paiement pas encore prêt', `${immersivePreviewSellerUsername || profile?.username || 'Ce créateur'} n’a pas encore configuré son lien PayPal ou son lien de paiement.`);
      else if (message.includes('SELLER_PAYOUT_LINK_INSECURE')) Alert.alert('Paiement temporairement indisponible', 'Le créateur doit enregistrer un lien de paiement sécurisé avant de pouvoir proposer cette collection.');
      else Alert.alert('Erreur', 'Impossible de lancer le déblocage pour le moment.');
    } finally {
      setPurchaseBusyId(null);
    }
  };
  const goToOwnProfile = () => useAccountGateStore.getState().requestAccount('create');

  const openProfileChat = () => {
    if (!profile) return;
    if (!effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour écrire à cette personne sans quitter son profil.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('login', profile.username) },
      ]);
      return;
    }
    useGlobalChatStore.getState().open({
      targetProfileId: profile.id,
      targetUsername: profile.username.replace(/^@+/, ''),
    });
  };

  const challengeProfileToBattle = async () => {
    if (!profile || battleInviteBusy || effectiveViewerId === profile.id) return;
    if (!effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour défier cette personne en Battle.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('login') },
      ]);
      return;
    }
    setBattleInviteBusy(true);
    try {
      await sendBattleChallenge(profile.id, 'MIX', 8);
      Alert.alert('Invitation envoyée', `@${profile.username.replace(/^@/, '')} a reçu ton défi Battle.`);
    } catch (e: any) {
      const message = String(e?.message || '');
      if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `@${profile.username.replace(/^@/, '')} n’a pas assez de Free pour jouer maintenant.`);
      else if (message.includes('BATTLE_CHALLENGER_NO_CREDIT')) Alert.alert('Battle', 'Il te faut assez de Free pour lancer ce Battle.');
      else if (message.includes('BATTLE_DECLINE_THROTTLED')) Alert.alert('Battle', 'Les invitations vers cette personne sont temporairement limitées après plusieurs refus.');
      else if (message.includes('BATTLE_TARGET_NOT_AVAILABLE')) Alert.alert('Battle', 'Cette personne n’est pas disponible pour un Battle maintenant.');
      else Alert.alert('Battle', 'Impossible d’envoyer le défi pour le moment.');
    } finally {
      setBattleInviteBusy(false);
    }
  };

  const openSocial = async (platform: SocialPlatform) => {
    if (!profile) return;
    const link = profile.socialLinks.find((item) => item.platform === platform && item.url.trim());
    if (!link) {
      if (viewer && viewer.id !== profile.id) {
        try { await requestSocialLink(profile.id, platform); } catch { }
      }
      Alert.alert('Réseau non partagé', 'Cette personne ne partage pas ce réseau');
      return;
    }
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau social pour le moment.'); }
  };

  const toggleFollow = async () => {
    // Adel (08/09/2026, audit partage puis "ne pas bouger d'endroit") : cette
    // pastille redirigeait un invité vers l'onglet Profil, perdant à la fois
    // l'intention de suivi ET l'endroit où il se trouvait. Le popup de
    // création de compte s'ouvre maintenant ICI, par-dessus cet écran, avec
    // le profil visé déjà transmis (SourceProfileQuickView faisait déjà ça
    // pour l'intention, il manquait juste le "rester sur place").
    if (!supabase || !effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', `Crée ou connecte ton compte Loki Music : tu suivras ${profile?.username || 'ce profil'} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', profile?.username) },
      ]);
      return;
    }
    if (!profile || effectiveViewerId === profile.id || followBusy) return;
    setFollowBusy(true);
    // Adel (audit partage) : le suivi doit passer par les RPC sécurisées
    // (comme partout ailleurs dans l'appli), pas par une écriture directe sur
    // `follows` qui contourne le plafond d'abonnements du plan.
    if (isFollowing) {
      const { error } = await supabase.rpc('keep_unfollow_profile', { p_followee_id: profile.id });
      if (!error) { setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1)); }
    } else {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: profile.id });
      if (!error) { setIsFollowing(true); setFollowerCount((c) => c + 1); }
      else if (String(error.message || '').includes('FOLLOW_LIMIT')) Alert.alert('Limite atteinte', 'Ton plan actuel limite le nombre de profils que tu peux suivre.');
    }
    setFollowBusy(false);
  };

  useEffect(() => {
    let live = true;
    if (!repriseListOpen || !profile) return undefined;
    setRepriseLoading(true);
    loadProfileReprisers(profile.id).then((rows) => { if (live) setReprisers(rows); }).catch(() => { if (live) setReprisers([]); }).finally(() => { if (live) setRepriseLoading(false); });
    return () => { live = false; };
  }, [repriseListOpen, profile?.id]);

  const toggleRepriserFollow = async (repriser: ProfileRepriser) => {
    if (!supabase || !effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', `Crée ou connecte ton compte Loki Music : tu suivras ${repriser.username} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', repriser.username) },
      ]);
      return;
    }
    if (repriseFollowBusyId) return;
    // Règle d'Adel (05/10/2026) : on ne se désabonne QUE depuis la page profil de la personne.
    if (repriser.isFollowing) { navigation.navigate('PublicProfile', { username: repriser.username }); return; }
    setRepriseFollowBusyId(repriser.profileId);
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: repriser.profileId });
      if (error) throw error;
      setReprisers((rows) => rows.map((r) => r.profileId === repriser.profileId ? { ...r, isFollowing: true } : r));
    } catch {
      Alert.alert('Abonnement', 'Impossible de mettre à jour l’abonnement pour le moment.');
    } finally {
      setRepriseFollowBusyId(null);
    }
  };

  const requireAccountForModeration = () => {
    if (!supabase || !effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte Loki Music pour signaler ou bloquer un profil.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return false;
    }
    return true;
  };

  const handleToggleBlock = async () => {
    if (!requireAccountForModeration() || !profile || moderationBusy) return;
    setModerationMenuOpen(false);
    setModerationBusy(true);
    try {
      if (isBlocked) {
        await unblockUser(profile.id);
        setIsBlocked(false);
        Alert.alert('Débloqué', `${profile.username} peut à nouveau apparaître pour toi.`);
      } else {
        await blockUser(profile.id);
        setIsBlocked(true);
        setIsFollowing(false);
        Alert.alert('Bloqué', `${profile.username} ne pourra plus interagir avec ton profil, et son contenu ne s’affichera plus pour toi.`);
      }
    } catch {
      Alert.alert('Action impossible', 'Réessaie dans un instant.');
    } finally {
      setModerationBusy(false);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    if (!profile || moderationBusy) return;
    setReportPickerOpen(false);
    setModerationBusy(true);
    try {
      await reportUser(profile.id, reason, undefined, { source: 'public_profile' });
      Alert.alert('Signalement envoyé', 'Merci, Loki va l’examiner.');
    } catch {
      Alert.alert('Envoi impossible', 'Réessaie dans un instant.');
    } finally {
      setModerationBusy(false);
    }
  };

  const toggleLike = async (trackId: string) => {
    if (!supabase || !effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte Loki Music pour liker ce morceau.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    const alreadyLiked = likedTrackIds.has(trackId);
    const next = new Set(likedTrackIds);
    if (alreadyLiked) {
      const { error: deleteError } = await supabase.from('track_likes').delete().eq('profile_id', effectiveViewerId).eq('track_id', trackId);
      if (deleteError) return;
      next.delete(trackId);
      setLikeCounts((current) => ({ ...current, [trackId]: Math.max(0, (current[trackId] || 0) - 1) }));
    } else {
      const { error: insertError } = await supabase.from('track_likes').insert({ profile_id: effectiveViewerId, track_id: trackId });
      if (insertError) return;
      next.add(trackId);
      setLikeCounts((current) => ({ ...current, [trackId]: (current[trackId] || 0) + 1 }));
    }
    setLikedTrackIds(next);
  };

  const alreadyInMyKeep = (trackId: string) => viewerKeepTrackIds.has(trackId);

  const showAlreadyKept = (title: string) => {
    Alert.alert('Déjà dans ta collection', `« ${title} » est déjà dans tes musiques. Loki Music ne crée pas de doublon.`);
  };

  const maybeSuggestFollow = () => {
    if (!profile || !effectiveViewerId || effectiveViewerId === profile.id || isFollowing) return;
    setFollowNudgeVisible(true);
  };

  const addCanonicalToMyKeep = async (canonical: CanonicalTrack, visibility: 'PUBLIC' | 'PRIVATE') => {
    if (isDemoMode) {
      setViewerKeepTrackIds((current) => new Set(current).add(canonical.id));
      Alert.alert('Mode démo', `Morceau gardé temporairement en ${visibility === 'PUBLIC' ? 'PUBLIC sur le profil' : 'PRIVÉ'}. Rien n’est envoyé sur un compte réel.`);
      return true;
    }
    if (!effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour ajouter cette musique à ta collection.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return false;
    }
    if (profile && effectiveViewerId === profile.id) return false;
    if (alreadyInMyKeep(canonical.id)) {
      showAlreadyKept(canonical.title);
      return false;
    }
    try {
      const origin = tracks.find((item) => item.trackId === canonical.id);
      await commitKeep(canonical, [], undefined, { visibility, consumeCredit: !profile?.id, socialFree: profile?.id ? { sourceProfileId: profile.id } : undefined, context: {
        source: 'public_profile_swipe',
        sourceProfileId: origin?.sourceProfileId || origin?.sourceUserId || profile?.id,
        sourceUsername: origin?.sourceUsername || profile?.username,
      } });
      setViewerKeepTrackIds((current) => new Set(current).add(canonical.id));
      maybeSuggestFollow();
      if (isDemoMode) {
        Alert.alert('Mode démo', `Morceau gardé temporairement en ${visibility === 'PUBLIC' ? 'PUBLIC sur le profil' : 'PRIVÉ'}. Rien n’est envoyé sur un compte réel.`);
      }
      return true;
    } catch (e: any) {
      if (e?.message === 'CREDITS_EXHAUSTED') {
        setSwipeOpen(false);
        Alert.alert('Crédits gratuits utilisés', 'Passe à Premium pour continuer à ajouter les découvertes à ta collection.', [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' }) },
        ]);
        return false;
      }
      throw e;
    }
  };

  const openKeepPrompt = (track: PublicKeepTrack) => {
    if (!effectiveViewerId) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour ajouter cette musique à ta collection.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    if (profile && effectiveViewerId === profile.id) return;
    if (alreadyInMyKeep(track.trackId)) {
      showAlreadyKept(track.title);
      return;
    }
    if (addingTrackIds.has(track.trackId)) return;
    setKeepPromptTrack(track);
  };

  const addToMyKeep = async (track: PublicKeepTrack, visibility: KeepVisibility) => {
    if (!effectiveViewerId) {
      setKeepPromptTrack(null);
      Alert.alert('Compte Loki Music requis', 'Ton choix de visibilité est bien pris en compte, mais crée ou connecte ton compte pour enregistrer réellement ce morceau.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    const canonical: CanonicalTrack = {
      id: track.trackId,
      isrc: track.isrc,
      title: track.title,
      artist: track.artist,
      album: track.album || undefined,
      durationSec: track.durationSec,
      artworkUrl: track.artworkUrl || undefined,
      previewUrl: track.previewUrl,
      availableOn: track.availableOn,
      externalUrls: track.externalUrls,
      genres: track.genres,
      providerIds: track.providerIds || {},
    };
    setAddingTrackIds((current) => new Set(current).add(track.trackId));
    try {
      await commitKeep(canonical, [], undefined, { visibility, consumeCredit: !profile?.id, socialFree: profile?.id ? { sourceProfileId: profile.id } : undefined, context: { source: 'public_profile', sourceProfileId: profile?.id } });
      setViewerKeepTrackIds((current) => new Set(current).add(track.trackId));
      maybeSuggestFollow();
      setKeepSuccessTrack({ track, visibility });
    } catch (e: any) {
      if (e?.message === 'CREDITS_EXHAUSTED') {
        Alert.alert('Crédits gratuits utilisés', 'Tu peux toujours écouter les extraits et continuer tes sessions. Passe à Premium pour débloquer les fonctions payantes.', [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' }) },
        ]);
      } else {
        Alert.alert('Loki Music', e?.message || 'Impossible d’ajouter ce morceau pour le moment.');
      }
    } finally {
      setKeepPromptTrack(null);
      setAddingTrackIds((current) => { const next = new Set(current); next.delete(track.trackId); return next; });
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator color={colors.primaryLight} /></View></SafeAreaView>;
  if (!profile || error) return <SafeAreaView style={styles.container}><View style={styles.topBar}><TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}><Text style={styles.back}>‹</Text></TouchableOpacity></View><View style={styles.center}><Text style={styles.muted}>{error ?? 'Profil introuvable.'}</Text></View></SafeAreaView>;

  const isOwner = Boolean(effectiveViewerId && effectiveViewerId === profile.id);
  const certificationTier: ProfileCertificationTier = publicSnapshot?.certificationTier ?? 'UNVERIFIED';
  const followingCount = publicSnapshot?.following ?? profile.followingCount;
  const kindLabel = PROFILE_KIND_LABELS[profile.kind] ?? 'Fan';
  // Règle (07/09/2026, Adel) : un badge Free ou de type de profil reprend
  // toujours la couleur de la certification correspondante.
  const certificationColors = CERTIFICATION_META[certificationTier] ?? CERTIFICATION_META.UNVERIFIED;

  return (
    <SafeAreaView style={styles.container}>
      {followNudgeVisible && profile && !isFollowing ? <View style={styles.followNudge}>
        <View style={styles.followNudgeCopy}><Text style={styles.followNudgeTitle}>Ne rate pas ses prochaines pépites</Text><Text style={styles.followNudgeText} numberOfLines={1}>Tu viens de reprendre une découverte de @{profile.username}</Text></View>
        <TouchableOpacity style={styles.followNudgeButton} disabled={followBusy} onPress={async () => { await toggleFollow(); setFollowNudgeVisible(false); }}><Text style={styles.followNudgeButtonText}>{followBusy ? '…' : 'S’ABONNER'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.followNudgeClose} onPress={() => setFollowNudgeVisible(false)} accessibilityLabel="Fermer"><Text style={styles.followNudgeCloseText}>×</Text></TouchableOpacity>
      </View> : null}
      {inlineListenNotice ? (
        <View pointerEvents="none" style={styles.inlineListenNotice}>
          <Text style={styles.inlineListenNoticeText}>{inlineListenNotice}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View style={styles.topSpacer} />
          {/* 29/09/2026 : arrivé par un lien partagé sans compte, on doit pouvoir se connecter tout de suite. */}
          {!effectiveViewerId ? <LoginPill /> : null}
          {isOwner ? (
            <View style={styles.ownerTopActions}>
              <TouchableOpacity style={styles.shareTopButton} onPress={() => setNotificationPanelOpen(true)} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : ''}`}>
                <Text style={styles.shareTopText}>♢</Text>
                {unreadCount > 0 ? <View style={styles.ownerNotificationBadge}><Text style={styles.ownerNotificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareTopButton} onPress={() => { setOwnerMenuSection('ROOT'); setOwnerMenuOpen(true); }} accessibilityLabel="Menu du profil"><Text style={styles.shareTopText}>☰</Text></TouchableOpacity>
            </View>
          ) : effectiveViewerId ? (
            <TouchableOpacity style={styles.shareTopButton} onPress={() => setModerationMenuOpen(true)} accessibilityLabel="Signaler ou bloquer ce profil"><Text style={styles.shareTopText}>⋯</Text></TouchableOpacity>
          ) : null}
        </View>



        <ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`} delay={40} style={styles.hero}>
          <View style={styles.identity}>
            <TouchableOpacity onPress={openVisitedStory} disabled={!visitedStory || !visitedStory.tracks.length} accessibilityRole="button" accessibilityLabel={visitedStory && visitedStory.tracks.length ? `Voir la story de ${profile.username}` : `Photo de ${profile.username}`}><StoryRing size={80} unseen={visitedStoryUnseen} plain={!(visitedStory && visitedStory.tracks.length)} tone={undefined}>{profile.avatar ? <Image source={{ uri: profile.avatar }} style={[styles.avatar, visitedStory && visitedStory.tracks.length ? { width: 64, height: 64, borderRadius: 32, transform: [] } : null]} /> : <View style={[styles.avatar, styles.avatarFallback, visitedStory && visitedStory.tracks.length ? { width: 64, height: 64, borderRadius: 32, transform: [] } : null]}><Text style={styles.avatarText}>{(profile.username || 'K').replace(/^@/, '').slice(0, 1).toUpperCase()}</Text></View>}</StoryRing></TouchableOpacity>
            <View style={styles.identityText}>
              <View style={styles.usernameLine}><Text style={styles.username}>{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaLeft}>
                  <View style={[styles.kindBadge, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}><Text style={[styles.kindBadgeText, { color: certificationColors.ring }]}>{kindLabel}</Text></View>
                  {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}
                  {(() => {
                    // On se voit toujours « En ligne » sur son propre profil ;
                    // présence inconnue = pas de pastille (jamais un faux « Hors ligne »).
                    const self = Boolean(viewer?.id && effectiveViewerId === profile.id);
                    const online = self || profilePresence.online;
                    if (!self && !profilePresence.known) return null;
                    const label = formatProfilePresence(profilePresence.lastSeenAt, online);
                    return <View style={styles.presencePill} accessibilityLabel={label}>
                      <View style={[styles.presenceDot, online && styles.presenceDotOnline]} />
                      <Text style={[styles.presenceText, online && styles.presenceTextOnline]}>{label}</Text>
                    </View>;
                  })()}
                </View>

              </View>
            </View>
          </View>
          {/* Adel (29/09/2026) : « même design et même configuration » que son
              propre profil -- mêmes composants et mêmes styles que
              ProfilePublicScreen (topMetricsBar / topMetricsSecondary). Contenu
              demandé pour un visiteur : Abonnés + Morceaux, le reste sous PLUS.
              Un contrat de test vérifie que les styles restent identiques. */}
          <View style={styles.topMetricsBar} accessibilityLabel="Compteurs du profil">
            <TouchableOpacity style={[styles.topMetricMore, countersExpanded && styles.topMetricMoreOn]} onPress={() => setCountersExpanded((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: countersExpanded }} accessibilityLabel={countersExpanded ? 'Masquer Reprises et Abonnements' : 'Afficher Reprises et Abonnements'}>
              <Text style={styles.topMetricMoreIcon}>{countersExpanded ? '⌃' : '•••'}</Text>
              <Text style={styles.topMetricMoreText}>PLUS</Text>
            </TouchableOpacity>
            <View style={styles.topMetricSocialGroup}>
              <TouchableOpacity style={[styles.topMetricSocialItem, communityMode === 'followers' && styles.topMetricSocialItemOn]} onPress={() => { setRepriseListOpen(false); setCommunityMode((v) => v === 'followers' ? null : 'followers'); }} accessibilityLabel={`${followerCount} Abonnés`}>
                <Text style={styles.topMetricValue}>{followerCount}</Text><Text style={styles.topMetricLabel}>Abonnés</Text>
              </TouchableOpacity>
              <View style={[styles.topMetricSocialItem, styles.topMetricSocialLast]} accessibilityLabel={`${tracks.length} Morceaux`}>
                <Text style={styles.topMetricValue}>{tracks.length}</Text><Text style={styles.topMetricLabel}>Morceaux</Text>
              </View>
            </View>
          </View>
          {countersExpanded ? (
            <View style={styles.topMetricsSecondary}>
              <TouchableOpacity style={[styles.topMetricSecondaryItem, repriseListOpen && styles.topMetricSocialItemOn]} onPress={() => { setCommunityMode(null); setRepriseListOpen((v) => !v); }} accessibilityLabel={`${socialKeepCount} Reprises`}>
                <Text style={styles.topMetricValue}>{socialKeepCount}</Text><Text style={styles.topMetricLabel}>Reprises</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.topMetricSecondaryItem, styles.topMetricSocialLast, communityMode === 'following' && styles.topMetricSocialItemOn]} onPress={() => { setRepriseListOpen(false); setCommunityMode((v) => v === 'following' ? null : 'following'); }} accessibilityLabel={`${followingCount} Abonnements`}>
                <Text style={styles.topMetricValue}>{followingCount}</Text><Text style={styles.topMetricLabel}>Abonnements</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          {!isOwner ? (
            <>
              <TouchableOpacity
                style={[styles.followPrimaryButton, isFollowing && styles.followPrimaryButtonOn]}
                disabled={followBusy}
                onPress={() => void toggleFollow()}
                accessibilityRole="button"
                accessibilityLabel={isFollowing ? `Se désabonner de ${profile.username}` : `S'abonner à ${profile.username}`}
              >
                <Text style={[styles.followPrimaryButtonText, isFollowing && styles.followPrimaryButtonTextOn]}>
                  {followBusy ? '…' : isFollowing ? '✓ ABONNÉ' : '+ S’ABONNER'}
                </Text>
              </TouchableOpacity>
              <View style={styles.ownerQuickActions}>
                <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} disabled={tracks.length === 0} onPress={() => openBrowseSwipe(null)} accessibilityLabel={`Swiper la musique de ${profile.username}`}>▶ SWIPE</MotionActionButton>
                <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} onPress={openProfileChat} accessibilityLabel={`Ouvrir le tchat avec ${profile.username}`}>◉ TCHAT</MotionActionButton>
                {battleFeatureEnabled ? <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} disabled={battleInviteBusy} onPress={() => void challengeProfileToBattle()} accessibilityLabel={`Défier ${profile.username} en Battle`}>{battleInviteBusy ? '⚡ ENVOI…' : '⚡ BATTLE'}</MotionActionButton> : null}
                <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} onPress={() => void shareProfile(profile.username)} accessibilityLabel={`Partager le profil de ${profile.username}`}>↗ PARTAGER</MotionActionButton>
              </View>
            </>
          ) : (
            <View style={styles.ownerQuickActions}>
              <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} disabled={tracks.length === 0} onPress={() => openBrowseSwipe(null)} accessibilityLabel="Swiper ma musique">▶ SWIPE</MotionActionButton>
              <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Modifier mon profil">✎ MODIFIER</MotionActionButton>
              <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} onPress={() => navigation.navigate('PlaylistSale')} accessibilityLabel="Gérer mes collections">◆ PÉPITES</MotionActionButton>
              <MotionActionButton variant="outline" size="medium" containerStyle={styles.ownerQuickActionFull} onPress={() => void shareProfile(profile.username)} accessibilityLabel="Partager mon profil Loki Music">↗ PARTAGER</MotionActionButton>
            </View>
          )}
        </ProfileMotionReveal>






        {profileBoutiqueOffers.length > 0 && marketBannerVisible ? (
          <ProfileMotionReveal motionKey={`visitor-market:${profile.id}:${profileBoutiqueOffers.length}`} compact style={SELLER_BOUTIQUE_SECTION_STYLE}>
            <View style={styles.marketplaceHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.marketplaceKicker}>BOUTIQUE MUSICALE · {profile.username.replace(/^@+/, '')}</Text>
              </View>
              <View style={styles.marketplaceHeaderActions}>
                <TouchableOpacity style={styles.marketplaceHideButton} onPress={hideMarketBanner} accessibilityLabel="Masquer les collections de ce profil">
                  <Text style={styles.marketplaceHideText}>MASQUER</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Adel (02/10/2026) : boutique vendeur validée. Drop du moment
                limité à 3 « à la une », étagère de 10 puis boutique complète
                filtrable / triable (prête pour 40 collections et plus).
                Toucher une carte = même parcours qu'avant (openSaleFolder :
                aperçu anonyme, ou collection si déjà débloquée). */}
            <SellerBoutique
              offers={profileBoutiqueOffers}
              sellerUsername={profile.username}
              overlaps={saleOfferOverlaps}
              unlockedOfferIds={new Set(profileBoutiqueOffers.filter((offer) => !isOwner && Boolean(saleUnlocks[offer.offerId]?.deliveredPlaylistId)).map((offer) => offer.offerId))}
              ownerMode={isOwner}
              onOpenOffer={(offer) => openSaleFolder(offer)}
              onOpenAllOffers={(offers) => { void playFeaturedSalePreviews(offers); }}
              onBuyAllOffers={(offers) => { void buyAllPlaylistOffers(offers); }}
              buyAllBusy={purchaseBusyId === 'bundle'}
            />
          </ProfileMotionReveal>
        ) : profileBoutiqueOffers.length > 0 ? (
          <TouchableOpacity style={styles.marketplaceReopenBar} onPress={reopenMarketBanner} accessibilityLabel="Afficher les collections et nouveautés de ce profil">
            <Text style={styles.marketplaceReopenIcon}>✦</Text>
            <View style={styles.marketplaceReopenCopy}><Text style={styles.marketplaceReopenTitle}>{marketBannerHasNew ? 'NOUVELLE PÉPITE' : 'BOUTIQUE MUSICALE'}</Text><Text style={styles.marketplaceReopenMeta}>{profileBoutiqueOffers.length} collection{profileBoutiqueOffers.length > 1 ? 's' : ''} · {visiblePublicVibes.length} vibe{visiblePublicVibes.length > 1 ? 's' : ''}</Text></View>
            <Text style={styles.marketplaceReopenArrow}>›</Text>
          </TouchableOpacity>
        ) : null}

        {/* Les recommandations multi-vendeurs restent uniquement sur le propre profil du viewer. Un profil visité n'affiche jamais la Pépite d'un autre vendeur à la place de sa boutique. */}
        {effectiveViewerId && profileSaleSuggestions.length > 0 && isOwner ? (
          <ProfileOpportunityRail
            viewerKey={effectiveViewerId}
            viewerUsername={viewer?.username || ''}
            suggestions={profileSaleSuggestions}
            onSuggestionPress={(suggestion) => { void openSuggestedSaleDrop(suggestion); }}
            onOpenSeller={(suggestion) => navigation.navigate('PublicProfile', { username: suggestion.sellerUsername })}
          />
        ) : null}

        {marketBannerEventIds.length > 0 || marketBannerPendingEventCount > 0 ? (
          <Animated.View
            style={{
              opacity: eventSpotlightPulse.interpolate({ inputRange: [0, 1], outputRange: [.94, 1] }),
              transform: [{ scale: eventSpotlightPulse.interpolate({ inputRange: [0, 1], outputRange: [.995, 1.012] }) }],
            }}
          >
            <TouchableOpacity
              style={styles.eventSpotlight}
              onPress={() => { void openProfileEventInline(); }}
              accessibilityLabel={marketBannerEventIds.length > 0
                ? `Voir l’événement de ${profile.username} sans quitter son profil`
                : `Événement de ${profile.username} en attente de validation Super Admin`}
            >
              <View style={styles.eventSpotlightIcon}><Text style={styles.eventSpotlightIconText}>✦</Text></View>
              <View style={styles.eventSpotlightCopy}>
                <Text style={styles.eventSpotlightKicker}>{marketBannerEventIds.length > 0 ? 'ÇA BOUGE ICI' : 'EN ATTENTE'}</Text>
                <Text style={styles.eventSpotlightTitle}>
                  {marketBannerEventIds.length > 0
                    ? `Le prochain rendez-vous de @${profile.username}`
                    : `@${profile.username} prépare quelque chose`}
                </Text>
                <Text style={styles.eventSpotlightMeta}>
                  {marketBannerEventIds.length > 0
                    ? (marketBannerPendingEventCount > 0
                        ? `Voir · participer · ${marketBannerPendingEventCount} autre événement en validation`
                        : 'Voir · participer · retrouver sur ton profil')
                    : 'En attente que le Super Admin approuve l’événement'}
                </Text>
              </View>
              <Text style={styles.eventSpotlightArrow}>{marketBannerEventIds.length > 0 ? '＋' : '…'}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}

        <View style={styles.collectionHeader}>
          <Text style={styles.collectionTitle}>Ses styles</Text>
          <Text style={styles.collectionCount}>{tracks.length} morceau{tracks.length > 1 ? 'x' : ''}</Text>
        </View>
        <View style={styles.tabsRow}>
          <View style={styles.tabs}>{TABS.map((tab) => <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityLabel={`Collection ${tab.label}`} accessibilityState={{ selected: activeTab === tab.key }} style={styles.tab} onPress={() => setActiveTab(tab.key)}><Text style={[styles.tabText, activeTab === tab.key && styles.tabTextOn]}>{tab.label}</Text>{activeTab === tab.key ? <View style={styles.indicator} /> : null}</TouchableOpacity>)}</View>
          {activeTab === 'TRACKS' && genreOptions.length > 0 ? (
            <TouchableOpacity style={styles.filterButton} onPress={() => setStyleModalOpen(true)} accessibilityLabel={`Filtrer par style, ${genreOptions.length} disponibles`}>
              <Text style={styles.filterButtonText}>Filtrer</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <KeepModal visible={styleModalOpen} transparent animationType="fade" onRequestClose={() => setStyleModalOpen(false)}>
          <View style={styles.modalBackdrop}><View style={styles.editCard}>
            <Text style={styles.editTitle}>Parcourir par style</Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
              {genreOptions.map(({ genre, count }) => (
                <TouchableOpacity key={genre} style={styles.pickerRow} onPress={() => { setStyleModalOpen(false); openBrowseSwipe({ type: 'genre', value: genre, label: genre }); }}>
                  <Text style={styles.pickerRowText}>{genre}</Text>
                  <Text style={styles.pickerRowCount}>{count}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setStyleModalOpen(false)}><Text style={styles.cancelText}>Fermer</Text></TouchableOpacity>
          </View></View>
        </KeepModal>

        {activeTab === 'TRACKS' ? (
          <ProfileMotionReveal motionKey={`visitor-tab:${activeTab}`} compact style={styles.publicMusicSection}>
            <Text style={styles.styleIntro}>Choisis un style et écoute directement l’univers de {profile.username.replace(/^@+/, '')}. Les collections à débloquer restent masquées jusqu’au déblocage.</Text>
            <View style={styles.styleGrid}>
              {genreOptions.length > 0 ? genreOptions.map(({ genre, count }, index) => {
                const alreadyOwned = genreAlreadyOwnedCounts[genre] ?? 0;
                const allOwned = alreadyOwned > 0 && alreadyOwned >= count;
                return (
                  <ProfileStyleCard
                    key={`genre:${genre}`}
                    title={genre}
                    subtitle={`${count} morceau${count > 1 ? 'x' : ''}${alreadyOwned ? ` · ${alreadyOwned} déjà chez toi` : ''} · Swipe`}
                    mode="PUBLIC"
                    badgeLabel={allOwned ? '✓ DÉJÀ CHEZ TOI' : alreadyOwned ? `PUBLIC · ${alreadyOwned} DÉJÀ` : 'PUBLIC'}
                    artworkUrl={genreArtwork[genre]}
                    fullWidth={totalStyleCardCount % 2 === 1 && index === freeStyleCardCount - 1}
                    onPress={() => openBrowseSwipe({ type: 'genre', value: genre, label: genre })}
                    accessibilityLabel={`Ouvrir le Swipe ${genre}, ${count} morceaux${alreadyOwned ? `, dont ${alreadyOwned} déjà dans ta collection` : ''}`}
                    onPlayPress={() => void playInlinePublicTrack(genre, swipeTracks.filter((track) => (track.genres ?? []).some((value) => value.trim() === genre)))}
                    playAccessibilityLabel={`Écouter maintenant un morceau ${genre} sans quitter le profil`}
                    playing={inlineStylePlayingKey?.startsWith(`visitor-inline:${profile.id}:`) === true && swipeTracks.filter((track) => (track.genres ?? []).some((value) => value.trim() === genre)).some((track) => inlineStylePlayingKey?.endsWith(`:${track.id}`))}
                  />
                );
              }) : visiblePublicVibes.map((vibe, index) => {
                const artworkUrl = vibe.matchedGenres
                  .map((genre) => genreArtwork[genre])
                  .find((value): value is string => Boolean(value));
                return (
                  <ProfileStyleCard
                    key={`vibe:${vibe.id}`}
                    title={vibe.name}
                    subtitle={`${vibe.trackCount} morceau${vibe.trackCount > 1 ? 'x' : ''} · Écoute en Swipe`}
                    mode="VIBE"
                    artworkUrl={artworkUrl}
                    fullWidth={totalStyleCardCount % 2 === 1 && index === freeStyleCardCount - 1}
                    onPress={() => openPublicVibe(vibe)}
                    accessibilityLabel={`Ouvrir le Swipe ${vibe.name}, ${vibe.trackCount} morceaux`}
                    onPlayPress={() => void playInlinePublicTrack(vibe.name, swipeTracks.filter((track) => (track.genres ?? []).some((genre) => vibe.matchedGenres.includes(genre))))}
                    playAccessibilityLabel={`Écouter maintenant un morceau ${vibe.name} sans quitter le profil`}
                  />
                );
              })}
            </View>
            <TouchableOpacity style={styles.allTracksToggle} onPress={() => setShowAllTracks((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showAllTracks }} accessibilityLabel={showAllTracks ? 'Masquer tous les morceaux' : 'Voir tous les morceaux'}>
              <Text style={styles.allTracksToggleText}>{showAllTracks ? 'MASQUER LES MORCEAUX' : `VOIR TOUS LES MORCEAUX · ${tracks.length}`}</Text>
              <Text style={styles.chevron}>{showAllTracks ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            {showAllTracks ? <>
            {/* (21/09/2026, Adel) : "c'est une aberration pour une
                plateforme musicale" -- la liste était repliée par défaut
                derrière un chevron. Toujours visible immédiatement
                maintenant, plus d'accordéon fermé sur cette section. */}
            <View style={styles.musicSectionHeader}>
              <Text style={styles.sectionTitle}>{isOwner ? 'Mes morceaux' : 'Morceaux publics'}</Text>
              <Text style={styles.publicCount}>{tracks.length}</Text>
            </View>
            {tracks.length === 0 ? <View style={styles.emptyMusic}><Text style={styles.emptyMusicIcon}>♪</Text><Text style={styles.muted}>{isOwner ? 'Aucun morceau sur ton profil.' : 'Aucun morceau public sur ce profil.'}</Text></View> : null}
            {tracks.length > 0 ? (
              <View style={styles.musicList}>{tracks.map((track) => {
                const liked = likedTrackIds.has(track.trackId);
                const adding = addingTrackIds.has(track.trackId);
                const alreadyKept = alreadyInMyKeep(track.trackId);
                const directDiscovery = !track.sourceUserId && !track.sourceProfileId;
                const discoveryUsername = track.sourceUsername || (directDiscovery ? profile.username : '');
                const discoveryImpact = discoveryImpacts[track.trackId];
                // DESIGN_SYSTEM v3 (21/09/2026) : "1er KEEP" -- même format
                // que ProfilePublicScreen.tsx, mêmes données réelles
                // (discoveryImpacts, keptAt). Un morceau où ce profil visité
                // est bien l'origine (directDiscovery) ET qui a un impact
                // réel (recoveryCount > 0) affiche le badge + la ligne +
                // le compteur ; sinon rien n'est affiché (jamais de chiffre
                // inventé). Remplace l'ancien DiscoveryImpactLabel.
                const isFirstKeep = directDiscovery && !!discoveryImpact && discoveryImpact.recoveryCount > 0;
                // Adel (09/09/2026) : "c'est pas du tout le meme design que
                // sur le profil, reamenage utilise le meme design sauf que tu
                // rajoutes le coeur en plus" -- meme structure compacte que le
                // propre profil (bouton(s) en ligne a cote du titre), avec le
                // coeur en plus et un bouton Garder en ligne (au lieu de la
                // pile Jouer/Garder pleine largeur).
                // Adel (09/09/2026, second passage) : "descends [Decouvert par]
                // aligne a Partager et aux petits coeurs ... laisse-le du cote
                // ou y a marque Jouer et Garder" -- Decouvert par descend dans
                // la ligne Partager/coeur, aligne a droite (meme cote que
                // Jouer/Garder au-dessus), Partager+coeur groupes a gauche.
                const trackLikeCount = likeCounts[track.trackId] || 0;
                const trackExpanded = expandedTrackKeys.has(track.id);
                // Adel (21/09/2026, maquette interactive validée :
                // https://claude.ai/artifact/9X4dx8oMmCJ3hkRGndc7BW) : grille
                // à colonnes fixes, seule source de vérité TrackActionRow.
                // 4 carrés (Play/Like/État/Partager) -- Like et Garder sont
                // deux actions indépendantes, jamais fusionnées. Le chevron
                // ne garde plus que le badge 1er KEEP et l'attribution.
                return (
                  <TrackActionRow
                    key={track.id}
                    coverUrl={track.artworkUrl}
                    coverFallbackText={(profile.username?.slice(0, 1) ?? 'K').toUpperCase()}
                    title={track.title}
                    artist={track.artist}
                    badge={isOwner && track.visibility === 'PRIVATE' ? { label: '🔒 PRIVÉ' } : undefined}
                    playSlot={<TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} square />}
                    actions={[
                      {
                        key: 'like',
                        icon: liked ? '♥' : '♡',
                        counter: trackLikeCount,
                        tone: liked ? 'pink' : undefined,
                        onPress: () => void toggleLike(track.trackId),
                        accessibilityLabel: liked ? 'Retirer le like' : 'Liker ce morceau',
                      },
                      ...(viewer?.id !== profile.id ? [{
                        key: 'keep',
                        icon: adding ? '…' : alreadyKept ? '✓' : '+',
                        tone: alreadyKept ? ('success' as const) : undefined,
                        onPress: () => (alreadyKept ? showAlreadyKept(track.title) : openKeepPrompt(track)),
                        accessibilityLabel: alreadyKept ? 'Déjà dans ton Loki Music' : 'Garder ce morceau',
                        disabled: adding,
                      }] : []),
                      {
                        key: 'share',
                        icon: '↗',
                        onPress: () => void shareProfileTrack(profile.username, track.title, track.artist),
                        accessibilityLabel: 'Partager ce morceau',
                      },
                    ]}
                    expandable={isFirstKeep || Boolean(discoveryUsername)}
                    expanded={trackExpanded}
                    onToggleExpand={() => toggleTrackExpanded(track.id)}
                  >
                    {isFirstKeep ? (
                      <View style={styles.firstKeepBlock}>
                        <View style={styles.firstKeepRow}><View style={styles.firstKeepBadge}><Text style={styles.firstKeepBadgeText}>🥇 1er Gardé</Text></View><Text style={styles.firstKeepCount}>{discoveryImpact!.recoveryCount + 1} gardés</Text></View>
                        <Text style={styles.firstKeepLine}>{profile.username.replace(/^@+/, '')} a été le premier à garder ce son{daysAgo(track.keptAt) != null ? ` · il y a ${daysAgo(track.keptAt)}j` : ''}</Text>
                      </View>
                    ) : null}
                    <View style={styles.discoveryOriginRow}>
                      <Text style={styles.discoveryOriginLabel}>Découvert par</Text>
                      {discoveryUsername ? discoveryUsername === profile.username ? <View style={[styles.discoveryOriginPill, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}><Text style={[styles.discoveryOriginUser, { color: certificationColors.ring }]}>{discoveryUsername}</Text></View> : (() => {
                        const tierColors = track.sourceCertificationTier ? (CERTIFICATION_META[track.sourceCertificationTier] ?? CERTIFICATION_META.UNVERIFIED) : null;
                        // Adel (08/09/2026) : "si abonne on met vert, si pas
                        // abonne on met rouge ... incite a cliquer dessus" --
                        // le contour porte ce signal, le fond reste la couleur
                        // de certification.
                        const followBorder = track.sourceIsFollowing === false ? colors.danger : track.sourceIsFollowing === true ? colors.success : null;
                        return (
                          <TouchableOpacity
                            style={[styles.discoveryOriginPill, tierColors ? { backgroundColor: `${tierColors.colors[tierColors.colors.length - 1]}33`, borderColor: tierColors.ring } : null, followBorder ? { borderColor: followBorder, borderWidth: 2 } : null]}
                            onPress={() => navigation.navigate('PublicProfile', { username: discoveryUsername })}
                            accessibilityLabel={`Ouvrir le profil du découvreur ${discoveryUsername}${track.sourceIsFollowing === false ? ', non suivi' : ''}`}
                          >
                            <Text style={[styles.discoveryOriginUser, tierColors ? { color: tierColors.ring } : null]}>{discoveryUsername}</Text>
                          </TouchableOpacity>
                        );
                      })() : <Text style={styles.discoveryOriginProtected}>découvreur d’origine protégé</Text>}
                    </View>
                  </TrackActionRow>
                );
              })}</View>
            ) : null}
            </> : null}
          </ProfileMotionReveal>
        ) : (
          <ProfileMotionReveal motionKey={`visitor-tab:${activeTab}`} compact style={styles.publicMusicSection}>
            {/* (21/09/2026) : onglet Artistes -- remplace le bouton "PAR
                ARTISTE" + sa modale (même liste artistGroups, même action
                Swipe filtré, pour ne pas dupliquer la fonction). */}
            {artistGroups.length === 0 ? <View style={styles.emptyMusic}><Text style={styles.emptyMusicIcon}>♪</Text><Text style={styles.muted}>Aucun artiste public sur ce profil.</Text></View> : (
              <View style={styles.musicList}>{artistGroups.map((group) => {
                const groupTracks = swipeTracks.filter((t) => canonicalArtistIdentity(t) === group.key);
                const artworkUrl = groupTracks.find((t) => t.artworkUrl)?.artworkUrl;
                return <TouchableOpacity key={group.key} style={styles.musicRow} onPress={() => openBrowseSwipe({ type: 'artist', value: group.key, label: group.name })} accessibilityLabel={`Découvrir ${group.name} en Swipe`}>
                  {artworkUrl ? <Image source={{ uri: artworkUrl }} style={styles.musicCover} /> : <View style={[styles.musicCover, styles.musicCoverFallback]}><Text style={styles.musicFallback}>♪</Text></View>}
                  <View style={styles.trackInfo}><Text style={styles.trackTitle} numberOfLines={1}>{group.name}</Text><Text style={styles.trackArtist}>{group.trackCount} morceau{group.trackCount > 1 ? 'x' : ''}</Text></View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>;
              })}</View>
            )}
          </ProfileMotionReveal>
        )}

        <View style={styles.dna} testID="public-profile-loki-pulse-bubbles-card">
          <View style={styles.dnaHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.dnaEyebrow}>LOKI PULSE</Text>
              <Text style={styles.dnaTitle}>{isOwner ? 'Mon empreinte musicale' : 'Son empreinte musicale'}</Text>
              <Text style={styles.dnaCondensed}>
                {visitorStyleBubbles.length > 0
                  ? `${visitorStyleBubbles.length} style${visitorStyleBubbles.length > 1 ? 's' : ''}`
                  : 'Empreinte en construction'}
              </Text>
            </View>
          </View>

          <View style={styles.visitorDnaSummary}>
            <View style={styles.visitorDnaTrack}>
              <View style={[styles.visitorDnaFill, { width: `${visitorStyleCoveragePercent}%` }]} />
            </View>
            <View style={styles.visitorDnaSummaryRow}>
              <Text style={styles.visitorDnaSummaryText}>Empreinte analysée</Text>
              <Text style={styles.visitorDnaSummaryScore}>{visitorStyleCoveragePercent}%</Text>
            </View>
          </View>

          {visitorStyleBubbles.length > 0 ? (
            <TouchableOpacity
              style={styles.publicPulseToggle}
              onPress={() => setVisitorPulseExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: visitorPulseExpanded }}
              accessibilityLabel={visitorPulseExpanded ? 'Masquer ses styles musicaux' : `Voir ses ${visitorStyleBubbles.length} styles musicaux`}
            >
              <Text style={styles.publicPulseToggleText}>
                {visitorPulseExpanded ? 'MASQUER' : `VOIR SES ${visitorStyleBubbles.length} STYLES`}
              </Text>
              <Text style={styles.publicPulseToggleChevron}>{visitorPulseExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
          ) : null}

          {visitorPulseExpanded && visitorStyleBubbles.length > 0 ? (
            <View testID="public-profile-loki-pulse-expanded-styles">
              <MusicStyleBubbles
                testID="public-profile-music-style-bubbles"
                genres={visitorStyleBubbles}
                max={visitorStyleBubbles.length}
                onPressGenre={(genre) => openBrowseSwipe({ type: 'genre', value: genre, label: genre })}
              />
              {profile.favoriteArtists.length > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.dnaRowLabel}>ARTISTES</Text>
                  <View style={styles.chips}>{profile.favoriteArtists.slice(0, 6).map((item) => {
                    const match = artistGroups.find((g) => g.name === item);
                    return match ? (
                      <TouchableOpacity key={item} style={styles.chip} onPress={() => openBrowseSwipe({ type: 'artist', value: match.key, label: match.name })}><Text style={styles.chipText}>{item}</Text></TouchableOpacity>
                    ) : (
                      <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>
                    );
                  })}</View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.socialHub}>
          <Text style={styles.socialTitle}>{isOwner ? 'Mes réseaux' : 'Ses réseaux'}</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = profile.socialLinks.some((link) => link.platform === item.platform && link.url.trim());
              return (
                <TouchableOpacity
                  key={item.platform}
                  style={[styles.socialButton, configured && styles.socialButtonConfigured]}
                  onPress={() => openSocial(item.platform)}
                  accessibilityLabel={configured ? item.label : `${item.label} non partagé`}
                >
                  <SocialPlatformIcon
                    platform={item.platform}
                    size={22}
                    color={configured ? (SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF') : colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Adel (02/09/2026) : "on me montrera pas le lien du site, on
            mettra un bouton" -- jamais l'URL affichée, juste le libellé
            choisi par le propriétaire du profil. */}
        {(() => {
          const websiteLink = profile.socialLinks.find((link) => link.platform === 'website' && link.url.trim());
          if (!websiteLink) return null;
          const openWebsite = async () => {
            let url = websiteLink.url.trim();
            if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
            try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce site pour le moment.'); }
          };
          return <TouchableOpacity style={styles.websiteButton} onPress={() => void openWebsite()} accessibilityLabel={websiteLink.label || 'Site web'}><Text style={styles.websiteButtonText}>🔗 {websiteLink.label || 'Site web'}</Text></TouchableOpacity>;
        })()}
      </ScrollView>

      {isOwner ? (
        <>
          <NotificationSidePanel
            visible={notificationPanelOpen}
            profileId={profile.id}
            onClose={() => setNotificationPanelOpen(false)}
          />
          <KeepModal visible={ownerMenuOpen} transparent animationType="fade" onRequestClose={() => ownerMenuSection === 'ROOT' ? setOwnerMenuOpen(false) : setOwnerMenuSection('ROOT')}>
            <View style={styles.modalBackdrop}>
              <View style={styles.editCard}>
                {ownerMenuSection !== 'ROOT' ? <TouchableOpacity style={styles.ownerMenuBack} onPress={() => setOwnerMenuSection('ROOT')} accessibilityLabel="Retour au menu du profil"><Text style={styles.ownerMenuBackText}>‹ Menu</Text></TouchableOpacity> : null}
                <Text style={styles.editTitle}>{ownerMenuSection === 'ROOT' ? 'Mon profil' : ownerMenuSection === 'NETWORKS' ? 'Réseaux & site web' : ownerMenuSection === 'CREATOR' ? 'Outils créateur' : 'Aide'}</Text>
                {ownerMenuSection === 'ROOT' ? (
                  <ScrollView style={styles.ownerMenuScroll} showsVerticalScrollIndicator={false}>
                    {[
                      ['✎', 'Modifier mon profil', 'Photo · pseudo · bio · ville · pays', () => { setOwnerMenuOpen(false); navigation.navigate('ProfileSettings'); }],
                      ['◆', 'Mes collections', 'Créer · publier · gérer', () => { setOwnerMenuOpen(false); navigation.navigate('PlaylistSale'); }],
                      ['◎', 'Réseaux & site web', 'Instagram · TikTok · Snapchat · YouTube · X · Facebook', () => setOwnerMenuSection('NETWORKS')],
                      ['♫', 'Services musicaux', 'Spotify · Deezer · YouTube Music · SoundCloud', () => { setOwnerMenuOpen(false); navigation.navigate('MusicConnections'); }],
                      ['🎁', 'Free & formules', 'Solde · avantages · abonnements', () => { setOwnerMenuOpen(false); navigation.navigate('Offers'); }],
                      ['🪪', 'Créateur', 'Type de profil · événements · outils', () => setOwnerMenuSection('CREATOR')],
                      ['💬', 'Messagerie', 'Position · taille · alertes', () => { setOwnerMenuOpen(false); useGlobalChatStore.getState().openSettings(); }],
                      ['🆘', 'Aide', 'Support · légal · comptes bloqués', () => setOwnerMenuSection('HELP')],
                    ].map(([icon, label, hint, onPress]: any) => (
                      <TouchableOpacity key={label} style={styles.ownerMenuRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
                        <Text style={styles.ownerMenuIcon}>{icon}</Text>
                        <View style={styles.ownerMenuCopy}><Text style={styles.ownerMenuLabel}>{label}</Text><Text style={styles.ownerMenuHint}>{hint}</Text></View>
                        <Text style={styles.ownerMenuChevron}>›</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : ownerMenuSection === 'NETWORKS' ? (
                  <ScrollView style={styles.ownerMenuScroll}><PublicProfilePanel navigation={navigation} /></ScrollView>
                ) : ownerMenuSection === 'CREATOR' ? (
                  <ScrollView style={styles.ownerMenuScroll}><CreatorToolsPanel navigation={navigation} /></ScrollView>
                ) : (
                  <ScrollView style={styles.ownerMenuScroll}><HelpLegalPanel profileId={profile.id} username={profile.username} enabled /></ScrollView>
                )}
                <TouchableOpacity style={styles.cancelButton} onPress={() => { setOwnerMenuOpen(false); setOwnerMenuSection('ROOT'); }}><Text style={styles.cancelText}>Fermer</Text></TouchableOpacity>
              </View>
            </View>
          </KeepModal>
        </>
      ) : null}

      {immersivePreviewOffer ? (
        <PlaylistSaleImmersivePreview
          offer={immersivePreviewOffer}
          visible
          busy={purchaseBusyId === immersivePreviewOffer.offerId}
          onClose={() => { setImmersivePreviewOffer(null); setImmersivePreviewSellerUsername(null); }}
          onConfirmPurchase={(offer) => void buyPlaylistOffer(offer)}
          purchaseEnabled={!isOwner && (immersivePreviewOffer.paymentMode !== 'MONEY' || marketplacePurchaseEnabled)}
          moneyPurchaseEnabled={marketplacePurchaseEnabled}
          ownerMode={isOwner}
          sourceUsername={immersivePreviewSellerUsername || profile.username}
          freeBalance={freeBalance}
          purchaseError={freePurchaseMessage}
          onOpenProfile={() => {
            const sellerUsername = immersivePreviewSellerUsername || profile.username;
            setImmersivePreviewOffer(null);
            setImmersivePreviewSellerUsername(null);
            navigation.navigate('PublicProfile', { username: sellerUsername });
          }}
          onRechargeFree={() => {
            setImmersivePreviewOffer(null);
            navigation.navigate('Offers', { sourceFeature: 'PLAYLIST_FREE_SHORTFALL' });
          }}
          onRequestMissingTracks={isOwner ? undefined : (offer) => { void requestOnlyMissingTracks(offer); }}
          requestMissingBusy={missingRequestBusyId === immersivePreviewOffer.offerId}
        />
      ) : null}

      {payoutCheckout ? (
        <PayoutCheckoutSheet
          visible
          paymentId={payoutCheckout.paymentId}
          sellerUsername={payoutCheckout.sellerUsername}
          amountCents={payoutCheckout.amountCents}
          currencyCode={payoutCheckout.currencyCode}
          payoutLink={payoutCheckout.payoutLink}
          payoutQrUrl={payoutCheckout.payoutQrUrl}
          onClose={() => setPayoutCheckout(null)}
          onCancelTransaction={async () => {
            await cancelPlaylistSalePayment(payoutCheckout.paymentId, 'BUYER_CANCELLED_BEFORE_PAYMENT');
            Alert.alert('Transaction annulée', 'Le vendeur a été prévenu immédiatement. Il n’attendra plus ce paiement.');
            setPayoutCheckout(null);
          }}
          onPaid={async () => {
            const signal = await markPlaylistSaleBuyerPaid(payoutCheckout.paymentId);
            Alert.alert(
              signal.alreadyDelivered ? 'Déjà débloquée' : 'Paiement signalé',
              signal.alreadyDelivered
                ? 'Cette Pépite a déjà été débloquée dans ton Loki Music.'
                : 'Ta preuve a été envoyée au vendeur. Il doit maintenant vérifier son PayPal et confirmer la réception des fonds. Le déblocage se fera automatiquement après sa confirmation.',
            );
          }}
        />
      ) : null}

      <MusicSwipeDeckModal
        visible={swipeOpen}
        tracks={folderSwipeTracks.length ? folderSwipeTracks : browseSwipeTracks}
        title={folderSwipeTracks.length ? folderSwipeTitle : browseFilter ? `${profile.username} · ${browseFilter.label}` : `La collection de ${profile.username}`}
        sourceUsername={profile.username}
        sourceAvatarUrl={profile.avatar}
        sourceProfileId={profile.id}
        sourceByTrack={swipeSourceByTrack}
        subtitle="Les extraits démarrent automatiquement. Si un morceau est déjà dans ta collection, aucun doublon n’est créé."
        askVisibilityOnKeep
        requiresAccount={!effectiveViewerId && !isDemoMode}
        onClose={() => { setSwipeOpen(false); setBrowseFilter(null); setFolderSwipeTracks([]); setFolderSwipeTitle(''); }}
        onKeep={addCanonicalToMyKeep}
        onOpenSourceProfile={(username) => { setSwipeOpen(false); navigation.navigate('PublicProfile', { username }); }}
      />

      {/* Adel (09/09/2026) : "meme design que le profil normal" -- meme
          liste "qui a repris" que sur son propre profil (pastille de
          certification + style musical + suivre en retour). */}
      <KeepModal visible={repriseListOpen} transparent animationType="fade" onRequestClose={() => setRepriseListOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.shareSheet, styles.repriseSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.shareTitle}>Qui a repris ses morceaux</Text>
            <Text style={styles.shareSubtitle}>{reprisers.length} utilisateur{reprisers.length > 1 ? 's ont' : ' a'} gardé un morceau découvert en premier par {profile.username}.</Text>
            <ScrollView style={styles.repriseScroll}>
              {repriseLoading ? <Text style={styles.muted}>Chargement…</Text> : reprisers.length ? reprisers.map((r) => {
                const tierColors = CERTIFICATION_META[r.certificationTier] ?? CERTIFICATION_META.UNVERIFIED;
                return (
                  <View key={r.profileId} style={styles.repriseRow}>
                    {r.avatarUrl ? <Image source={{ uri: r.avatarUrl }} style={styles.repriseAvatar} /> : <View style={[styles.repriseAvatar, styles.avatarFallback]}><Text style={styles.avatarText}>{r.username.slice(0,1).toUpperCase()}</Text></View>}
                    <View style={styles.repriseInfo}>
                      <View style={styles.repriseNameRow}><Text style={styles.repriseUsername} numberOfLines={1}>{r.username}</Text><ProfileCertificationBadge tier={r.certificationTier} compact /></View>
                      {r.favoriteGenres.length ? <View style={styles.repriseGenres}>{r.favoriteGenres.slice(0,3).map((g) => <View key={g} style={[styles.repriseGenreChip, { borderColor: tierColors.ring }]}><Text style={[styles.repriseGenreText, { color: tierColors.ring }]}>{g}</Text></View>)}</View> : null}
                    </View>
                    <TouchableOpacity disabled={repriseFollowBusyId === r.profileId} style={[styles.repriseFollowButton, r.isFollowing && styles.repriseFollowButtonOn]} onPress={() => void toggleRepriserFollow(r)}>
                      <Text style={[styles.repriseFollowButtonText, r.isFollowing && styles.repriseFollowButtonTextOn]}>{repriseFollowBusyId === r.profileId ? '…' : r.isFollowing ? 'VOIR LE PROFIL' : 'SUIVRE'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }) : <Text style={styles.muted}>Personne n’a encore repris ses morceaux.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.cancelShare} onPress={() => setRepriseListOpen(false)}><Text style={styles.cancelShareText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </KeepModal>

      <KeepModal visible={moderationMenuOpen} transparent animationType="fade" onRequestClose={() => setModerationMenuOpen(false)}>
        <View style={styles.moderationOverlay}>
          <View style={styles.moderationCard}>
            <TouchableOpacity style={styles.moderationRow} onPress={() => { setModerationMenuOpen(false); setReportPickerOpen(true); }}>
              <Text style={styles.moderationRowText}>Signaler ce profil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moderationRow} disabled={moderationBusy} onPress={() => void handleToggleBlock()}>
              <Text style={[styles.moderationRowText, styles.moderationRowDanger]}>{isBlocked ? 'Débloquer ce profil' : 'Bloquer ce profil'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moderationRow} onPress={() => setModerationMenuOpen(false)}>
              <Text style={styles.moderationRowText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeepModal>

      <KeepModal visible={reportPickerOpen} transparent animationType="fade" onRequestClose={() => setReportPickerOpen(false)}>
        <View style={styles.moderationOverlay}>
          <View style={styles.moderationCard}>
            <Text style={styles.moderationTitle}>Pourquoi signales-tu ce profil ?</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity key={r.value} style={styles.moderationRow} disabled={moderationBusy} onPress={() => void handleReport(r.value)}>
                <Text style={styles.moderationRowText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.moderationRow} onPress={() => setReportPickerOpen(false)}>
              <Text style={styles.moderationRowText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeepModal>

      <KeepModal visible={profileEventOpen} transparent animationType="fade" onRequestClose={() => setProfileEventOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.shareSheet, styles.profileEventSheet]}>
            <View style={styles.sheetHandle} />
            {marketBannerEventIds.length === 0 ? (
              <>
                <View style={styles.profileEventPendingIcon}><Text style={styles.profileEventPendingIconText}>⏳</Text></View>
                <Text style={styles.shareTitle}>Événement en attente</Text>
                <Text style={styles.profileEventPendingText}>Le Super Admin doit encore approuver cet événement avant qu’il soit visible et ouvert aux participations.</Text>
                <View style={styles.profileEventPendingPill}><Text style={styles.profileEventPendingPillText}>EN ATTENTE D’APPROBATION</Text></View>
              </>
            ) : profileEventBusy && !profileEvent ? (
              <View style={styles.profileEventLoading}><ActivityIndicator color={colors.keep} /><Text style={styles.muted}>Chargement de l’événement…</Text></View>
            ) : profileEvent ? (
              <>
                <Text style={styles.profileEventKicker}>RENDEZ-VOUS LOKI</Text>
                <Text style={styles.shareTitle}>{profileEvent.name}</Text>
                <Text style={styles.profileEventMeta}>
                  {new Date(profileEvent.startsAt).toLocaleString()} {profileEvent.venueName ? `· ${profileEvent.venueName}` : ''}
                </Text>
                {profileEvent.description ? <Text style={styles.profileEventDescription}>{profileEvent.description}</Text> : null}
                <View style={styles.profileEventStats}>
                  <View style={styles.profileEventStat}><Text style={styles.profileEventStatValue}>{profileEventCounts.going}</Text><Text style={styles.profileEventStatLabel}>participent</Text></View>
                  <View style={styles.profileEventStat}><Text style={styles.profileEventStatValue}>{profileEventCounts.maybe}</Text><Text style={styles.profileEventStatLabel}>intéressés</Text></View>
                </View>
                <View style={styles.profileEventRsvpRow}>
                  {([
                    ['GOING', 'JE PARTICIPE'],
                    ['MAYBE', 'PEUT-ÊTRE'],
                    ['NOT_GOING', 'JE NE PARTICIPE PAS'],
                  ] as Array<[EventRsvpStatus, string]>).map(([status, label]) => {
                    const selected = profileEventRsvp === status;
                    return (
                      <TouchableOpacity
                        key={status}
                        disabled={profileEventBusy}
                        style={[styles.profileEventRsvpButton, selected && styles.profileEventRsvpButtonOn]}
                        onPress={() => { void chooseProfileEventRsvp(status); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: profileEventBusy }}
                        accessibilityLabel={selected ? `${label}, réponse actuelle` : label}
                      >
                        <Text style={[styles.profileEventRsvpText, selected && styles.profileEventRsvpTextOn]}>
                          {selected ? '✓ ' : ''}{label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.profileEventStayHint}>Tu restes sur le profil de @{profile.username}. Ta participation sera aussi disponible depuis ton propre profil.</Text>
              </>
            ) : (
              <Text style={styles.profileEventPendingText}>Cet événement n’est plus disponible.</Text>
            )}
            <TouchableOpacity style={styles.cancelShare} onPress={() => setProfileEventOpen(false)}><Text style={styles.cancelShareText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </KeepModal>

      <KeepVisibilityChoiceModal
        visible={!!keepPromptTrack}
        title="Garder ce morceau"
        trackLabel={keepPromptTrack ? `${keepPromptTrack.title} · ${keepPromptTrack.artist}` : null}
        costFree={0}
        busy={keepPromptTrack ? addingTrackIds.has(keepPromptTrack.trackId) : false}
        onPublic={() => keepPromptTrack && void addToMyKeep(keepPromptTrack, 'PUBLIC')}
        onPrivate={() => keepPromptTrack && void addToMyKeep(keepPromptTrack, 'PRIVATE')}
        onCancel={() => setKeepPromptTrack(null)}
      />

      <KeepSuccessModal
        visible={!!keepSuccessTrack}
        trackLabel={keepSuccessTrack ? `${keepSuccessTrack.track.title} · ${keepSuccessTrack.track.artist}` : null}
        costFree={null}
        visibility={keepSuccessTrack?.visibility}
        onContinue={() => setKeepSuccessTrack(null)}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  followNudge:{marginHorizontal:14,marginTop:6,minHeight:58,borderRadius:16,borderWidth:1,borderColor:'rgba(139,92,246,.55)',backgroundColor:'rgba(24,20,38,.97)',paddingLeft:12,paddingRight:6,flexDirection:'row',alignItems:'center',gap:8},
  followNudgeCopy:{flex:1,minWidth:0},followNudgeTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},followNudgeText:{color:colors.textMuted,fontSize:11,marginTop:2},
  followNudgeButton:{minHeight:36,paddingHorizontal:11,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},followNudgeButtonText:{color:'#fff',fontSize:11,fontWeight:'900'},
  followNudgeClose:{width:28,height:36,alignItems:'center',justifyContent:'center'},followNudgeCloseText:{color:colors.textMuted,fontSize:22,lineHeight:24},
  container:{flex:1,backgroundColor:colors.background},scroll:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl},
  inlineListenNotice:{position:'absolute',top:54,left:18,right:18,zIndex:30,minHeight:42,borderRadius:21,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  inlineListenNoticeText:{color:colors.keep,fontSize:11,fontWeight:'900',textAlign:'center'},topBar:{minHeight:48,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},ownerTopActions:{flexDirection:'row',alignItems:'center',gap:8},ownerNotificationBadge:{position:'absolute',top:-5,right:-5,minWidth:18,height:18,borderRadius:9,backgroundColor:colors.danger,alignItems:'center',justifyContent:'center',paddingHorizontal:4},ownerNotificationBadgeText:{color:'#FFF',fontSize:9,fontWeight:'900'},back:{width:44,height:44,color:colors.textPrimary,fontSize:32,lineHeight:44,textAlign:'center'},topSpacer:{flex:1},shareTopButton:{width:44,height:44,borderRadius:22,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},shareTopText:{color:'#FFFFFF',fontSize:18,fontWeight:'900'},moderationOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},moderationCard:{width:'100%',maxWidth:360,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',paddingVertical:6},moderationTitle:{color:'#F8F6FC',fontSize:13,fontWeight:'900',padding:14,paddingBottom:6},moderationRow:{minHeight:50,justifyContent:'center',paddingHorizontal:16,borderTopWidth:1,borderTopColor:'#2B2038'},moderationRowText:{color:'#F8F6FC',fontSize:14,fontWeight:'700'},moderationRowDanger:{color:'#FF5F83'},kindBadge:{minHeight:24,paddingHorizontal:9,borderRadius:12,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},kindBadgeText:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:16},identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:16},avatar:{width:80,height:80,borderRadius:40,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:29,fontWeight:'800'},identityText:{flex:1,marginLeft:16,minWidth:0,paddingTop:1},usernameLine:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap',minHeight:34},username:{...typography.h2,color:colors.textPrimary,flexShrink:1},profileMetaRow:{marginTop:10},profileMetaLeft:{alignItems:'flex-start',gap:9},identityMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5},location:{color:colors.textSecondary,fontSize:13,lineHeight:19,fontWeight:'800'},presencePill:{flexDirection:'row',alignItems:'center',gap:5,minHeight:22,paddingHorizontal:8,borderRadius:11,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},presenceDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.textMuted},presenceDotOnline:{backgroundColor:colors.success},presenceText:{color:colors.textMuted,fontSize:10,fontWeight:'800'},presenceTextOnline:{color:colors.success},bio:{color:colors.textPrimary,fontSize:14,lineHeight:20,marginTop:11},
visitorSwipeMotion:{marginTop:12},visitorBattleMotion:{marginTop:8},visitorSwipeButton:{minHeight:52,borderRadius:16,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:12,width:'100%'},visitorSwipeButtonText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},visitorBattleButton:{minHeight:46,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:8,width:'100%'},visitorBattleButtonText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},

  visitorDnaSummary:{marginTop:9},
  visitorDnaTrack:{height:7,borderRadius:999,backgroundColor:colors.border,overflow:'hidden'},
  visitorDnaFill:{height:'100%',borderRadius:999,backgroundColor:colors.keep},
  visitorDnaSummaryRow:{marginTop:6,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  visitorDnaSummaryText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'800'},
  visitorDnaSummaryScore:{color:colors.keep,fontSize:13,fontWeight:'900'},
  publicPulseToggle:{minHeight:36,marginTop:9,paddingHorizontal:11,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  publicPulseToggleText:{color:colors.primaryLight,fontSize:9.5,fontWeight:'900',letterSpacing:.45,textAlign:'center'},
  publicPulseToggleChevron:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},
  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800',marginTop:2},dnaRowLabel:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:0.5},dnaCondensed:{color:colors.textMuted,fontSize:12,fontWeight:'600',marginTop:6},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:6},chip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:10,paddingVertical:5},chipText:{color:colors.smartBadgeText,fontSize:12,fontWeight:'700'},mutedSmall:{color:'#FFFFFF',fontSize:12,lineHeight:17,marginTop:8},
  websiteButton:{marginHorizontal:18,marginTop:10,minHeight:44,borderRadius:radius.pill,backgroundColor:'#21182F',borderWidth:1,borderColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},websiteButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},socialRow:{width:'100%',flexDirection:'row',justifyContent:'space-between',gap:7,marginTop:12},socialButton:{flex:1,maxWidth:46,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,opacity:.82},socialButtonConfigured:{backgroundColor:colors.backgroundCard,borderColor:colors.primaryLight,opacity:1},
  browseSection:{marginHorizontal:18,marginTop:12,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},browseChipsRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},browseChip:{minHeight:32,maxWidth:220,paddingHorizontal:12,borderRadius:16,backgroundColor:'#21182F',borderWidth:1,borderColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},browseChipText:{color:'#FFFFFF',fontSize:12,fontWeight:'800'},
  folderIntro:{marginBottom:10},folderIntroText:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,marginTop:4},folderGrid:{gap:8},folderCard:{minHeight:68,flexDirection:'row',alignItems:'center',gap:10,padding:9,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},folderCardSale:{backgroundColor:'rgba(124,92,252,.09)',borderColor:colors.primary},folderCardUnlocked:{backgroundColor:'rgba(45,225,194,.08)',borderColor:colors.success},folderIcon:{width:50,height:50,borderRadius:12,backgroundColor:'rgba(124,92,252,.16)',borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center'},folderIconSale:{backgroundColor:'rgba(124,92,252,.12)'},folderIconText:{color:'#FFF',fontSize:20,fontWeight:'900'},folderCover:{width:50,height:50,borderRadius:12,backgroundColor:colors.backgroundElevated},folderCopy:{flex:1,minWidth:0},folderTitle:{color:'#FFF',fontSize:14,fontWeight:'900'},folderMeta:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:3},folderAction:{color:colors.primaryLight,fontSize:24,fontWeight:'900'},folderPrice:{minWidth:58,minHeight:32,paddingHorizontal:8,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},folderUnlockedPill:{backgroundColor:'rgba(45,225,194,.18)',borderWidth:1,borderColor:colors.success},folderPriceText:{color:'#FFF',fontSize:10,fontWeight:'900'},
    followPrimaryButton:{marginTop:14,minHeight:48,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,paddingHorizontal:18},followPrimaryButtonOn:{backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primary},followPrimaryButtonText:{color:colors.white,fontSize:14,fontWeight:'900',letterSpacing:0.7},followPrimaryButtonTextOn:{color:colors.primaryLight},

  sellerSignal:{minHeight:74,marginTop:12,padding:12,borderRadius:20,backgroundColor:colors.successFaint,borderWidth:1,borderColor:colors.keep,flexDirection:'row',alignItems:'center',gap:10},
  sellerSignalIcon:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center'},
  sellerSignalIconText:{color:colors.keep,fontSize:18,fontWeight:'900'},
  sellerSignalCopy:{flex:1,minWidth:0},
  sellerSignalKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:.9},
  sellerSignalTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:2},
  sellerSignalMeta:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:2},
  sellerSignalArrow:{color:colors.keep,fontSize:26,fontWeight:'700'},
  marketplaceSection:{marginHorizontal:18,marginTop:14,paddingVertical:14,paddingHorizontal:14,borderRadius:22,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primary},
  eventSpotlight:{marginHorizontal:18,marginTop:10,minHeight:72,paddingHorizontal:13,paddingVertical:10,borderRadius:18,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:11},
  eventSpotlightIcon:{width:42,height:42,borderRadius:14,backgroundColor:'rgba(45,225,194,.10)',borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center'},
  eventSpotlightIconText:{color:colors.keep,fontSize:18,fontWeight:'900'},
  eventSpotlightCopy:{flex:1,minWidth:0},
  eventSpotlightKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.1},
  eventSpotlightTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:2},
  eventSpotlightMeta:{color:colors.textMuted,fontSize:10,marginTop:3},
  eventSpotlightArrow:{color:colors.keep,fontSize:24,fontWeight:'900'},
  profileEventSheet:{maxWidth:430},
  profileEventKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1.2,textAlign:'center',marginBottom:5},
  profileEventMeta:{color:colors.primaryLight,fontSize:11,fontWeight:'800',textAlign:'center',marginTop:5},
  profileEventDescription:{color:colors.textSecondary,fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  profileEventStats:{flexDirection:'row',gap:8,marginTop:14},
  profileEventStat:{flex:1,minHeight:56,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  profileEventStatValue:{color:colors.keep,fontSize:18,fontWeight:'900'},
  profileEventStatLabel:{color:colors.textMuted,fontSize:9,fontWeight:'800',marginTop:2},
  profileEventRsvpRow:{flexDirection:'row',gap:6,marginTop:14},
  profileEventRsvpButton:{flex:1,minHeight:48,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',paddingHorizontal:6},
  profileEventRsvpButtonOn:{backgroundColor:'rgba(45,225,194,.10)',borderColor:colors.keep},
  profileEventRsvpText:{color:colors.textPrimary,fontSize:8.5,lineHeight:12,fontWeight:'900',letterSpacing:.25,textAlign:'center'},
  profileEventRsvpTextOn:{color:colors.keep},
  profileEventStayHint:{color:colors.textMuted,fontSize:10,lineHeight:15,textAlign:'center',marginTop:9},
  profileEventPendingIcon:{width:52,height:52,borderRadius:26,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(139,92,246,.12)',alignItems:'center',justifyContent:'center',alignSelf:'center'},
  profileEventPendingIconText:{fontSize:22},
  profileEventPendingText:{color:colors.textSecondary,fontSize:12,lineHeight:18,textAlign:'center',marginTop:10},
  profileEventPendingPill:{minHeight:38,borderRadius:19,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(139,92,246,.10)',alignItems:'center',justifyContent:'center',marginTop:13,paddingHorizontal:14},
  profileEventPendingPillText:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8},
  profileEventLoading:{minHeight:120,alignItems:'center',justifyContent:'center',gap:10},
  marketplaceReopenButton:{marginHorizontal:18,marginTop:10,minHeight:48,paddingHorizontal:13,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',gap:10},
  marketplaceReopenIcon:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},
  marketplaceReopenCopy:{flex:1,minWidth:0},
  marketplaceReopenTitle:{color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.7},
  marketplaceReopenMeta:{color:colors.textMutedGrey,fontSize:9,fontWeight:'700',marginTop:2},
  marketplaceReopenArrow:{color:colors.primaryLight,fontSize:22,fontWeight:'700'},
  marketplaceHeaderActions:{alignItems:'flex-end',gap:6},
  marketplaceHeaderRow:{flexDirection:'row',alignItems:'flex-start',gap:8},
  marketplaceHideButton:{minHeight:28,paddingHorizontal:8,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  marketplaceHideText:{color:colors.textMuted,fontSize:9,fontWeight:'800'},
  marketplaceReopenBar:{marginHorizontal:18,marginTop:8,minHeight:54,paddingHorizontal:13,borderRadius:17,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:10},
  marketplaceKicker:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1.2,marginBottom:4},
  marketplacePulseLine:{flexDirection:'row',alignItems:'center',gap:7,marginTop:6},
  marketplaceLiveDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.keep},
  marketplaceCountPill:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  marketplaceCountText:{color:colors.textPrimary,fontSize:9,fontWeight:'900',letterSpacing:.5},
  saleList:{gap:8,paddingTop:12},
  saleCarouselHint:{color:colors.textMutedGrey,fontSize:11,lineHeight:15,fontWeight:'700',textAlign:'center',marginTop:10},
    marketplaceFeaturedList:{gap:10,marginTop:12},
  marketplaceFeaturedCard:{padding:14,borderRadius:20,backgroundColor:colors.backgroundElevated,borderWidth:1.5,borderColor:colors.primary},
  marketplaceFeaturedCardHero:{paddingVertical:16,borderWidth:2},
  marketplaceFeaturedCardUnlocked:{borderColor:colors.success},
  marketplaceFeaturedTop:{flexDirection:'row',alignItems:'flex-start',gap:10},
  marketplaceSecretCover:{width:54,height:54,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center'},
  marketplaceSecretIcon:{fontSize:18},
  marketplaceSecretCoverText:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.8,marginTop:2},
  marketplaceFeaturedBadge:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.8},
  marketplaceFeaturedTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginTop:4},
  marketplaceFeaturedMeta:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:4},
  marketplaceFeaturedPrice:{minWidth:64,minHeight:34,paddingHorizontal:10,borderRadius:17,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  marketplaceFeaturedPriceUnlocked:{backgroundColor:colors.success},
  marketplaceFeaturedPriceText:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  marketplaceFeaturedPriceTextUnlocked:{color:colors.background},
  marketplaceFeaturedCta:{minHeight:44,borderRadius:14,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12},marketplaceFeaturedMotion:{marginTop:12},
  marketplaceFeaturedCtaUnlocked:{backgroundColor:colors.success},
  marketplaceFeaturedCtaText:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  marketplaceFeaturedCtaTextUnlocked:{color:colors.background},
  marketplaceTrustRow:{marginTop:10,minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center',justifyContent:'center',flexWrap:'wrap',gap:5},
  marketplaceTrustText:{color:colors.textMutedGrey,fontSize:9,fontWeight:'800'},
  marketplaceTrustDot:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},
  marketplaceReassurance:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,textAlign:'center',marginTop:7},
  marketplaceMore:{color:colors.textMutedGrey,fontSize:10,fontWeight:'700',textAlign:'center',marginTop:2},saleShowcase:{marginHorizontal:18,marginTop:16,marginBottom:4,padding:14,borderRadius:18,backgroundColor:colors.backgroundElevated,borderWidth:1.5,borderColor:colors.primary},saleShowcaseHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:6},saleShowcaseEyebrow:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:1.2},saleShowcaseCount:{color:colors.textMutedGrey,fontSize:11,fontWeight:'800'},marketplaceHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:4},marketplaceList:{gap:8,marginTop:10},marketplaceEmpty:{marginTop:10,minHeight:44,borderRadius:14,backgroundColor:'#0F1B16',borderWidth:1,borderColor:'#2D5C4F',alignItems:'center',justifyContent:'center'},marketplaceEmptyText:{color:colors.textMuted,fontSize:11,fontWeight:'700'},marketplaceBrowseAll:{minHeight:42,marginTop:9,borderRadius:21,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:'rgba(139,92,246,.10)',paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},marketplaceBrowseAllText:{color:'#FFFFFF',fontSize:12,fontWeight:'900',letterSpacing:.5},marketplaceSellerLink:{minHeight:38,alignItems:'center',justifyContent:'center',marginTop:5},marketplaceSellerLinkText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},marketplaceCard:{padding:8,borderRadius:14,backgroundColor:'#0F1B16',borderWidth:1,borderColor:'#2D5C4F'},marketplaceCardTop:{minHeight:66,flexDirection:'row',alignItems:'center',gap:10},marketplaceCover:{width:50,height:50,borderRadius:10,backgroundColor:'#21182F'},marketplaceCoverFallback:{alignItems:'center',justifyContent:'center'},marketplaceCoverIcon:{color:'#38D990',fontSize:20,fontWeight:'900'},marketplaceCopy:{flex:1,minWidth:0},marketplaceTitle:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},marketplaceMeta:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:3},marketplacePriceButton:{minWidth:56,minHeight:34,paddingHorizontal:9,borderRadius:17,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},marketplacePriceText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},
  browseHint:{color:colors.textMuted,fontSize:12,marginTop:6},artistTrackRow:{flexDirection:'row',alignItems:'center',gap:10,marginTop:12},artistTrackCover:{width:48,height:48,borderRadius:10,backgroundColor:'#21182F'},artistTrackCoverPlaceholder:{alignItems:'center',justifyContent:'center'},artistTrackCoverPlaceholderText:{fontSize:20},artistTrackTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},artistTrackAlbum:{color:colors.textMuted,fontSize:11,marginTop:1},artistTrackPrice:{color:'#E5F266',fontSize:12,fontWeight:'900',marginTop:3},artistTrackBuyButton:{minHeight:32,paddingHorizontal:14,borderRadius:16,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},artistTrackBuyButtonText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},
  sectionTitle:{...typography.h3,color:colors.textPrimary},
  topCommunityPanel:{marginHorizontal:18,marginTop:6},topMetricsBar:{marginHorizontal:0,marginTop:16,minHeight:58,flexDirection:'row',alignItems:'flex-end',gap:8},topMetricSocialGroup:{flex:1,minWidth:0,minHeight:58,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:16,borderWidth:1,borderColor:colors.border,overflow:'hidden'},topMetricSocialItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',paddingHorizontal:4,borderRightWidth:1,borderRightColor:colors.border},topMetricSocialLast:{borderRightWidth:0},topMetricSocialItemOn:{backgroundColor:'rgba(139,92,246,.18)'},topMetricMore:{width:48,minHeight:58,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},topMetricMoreOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},topMetricMoreIcon:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},topMetricMoreText:{color:colors.textMutedGrey,fontSize:7,fontWeight:'900',marginTop:2},topMetricValue:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},topMetricLabel:{color:colors.textMuted,fontSize:8,fontWeight:'800',marginTop:2,textAlign:'center'},topMetricsSecondary:{marginHorizontal:0,marginTop:6,minHeight:48,flexDirection:'row',borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,overflow:'hidden'},topMetricSecondaryItem:{flex:1,alignItems:'center',justifyContent:'center',borderRightWidth:1,borderRightColor:colors.border},ownerQuickActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'stretch',gap:8,marginTop:8,width:'100%'},ownerQuickActionFull:{flexGrow:1,flexBasis:'47%',minWidth:0},
  collectionHeader:{marginHorizontal:18,marginTop:18,flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'},collectionTitle:{color:colors.textPrimary,fontSize:19,fontWeight:'700'},collectionCount:{color:colors.textMuted,fontSize:13,fontWeight:'600'},
  tabsRow:{marginTop:10,marginHorizontal:8,paddingHorizontal:2,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},tabs:{flex:1,flexDirection:'row'},tab:{flex:1,alignItems:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},indicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},filterButton:{marginBottom:8,minHeight:30,paddingHorizontal:12,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},filterButtonText:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},
  firstKeepBlock:{marginTop:4,gap:2},firstKeepRow:{flexDirection:'row',alignItems:'center',gap:8},firstKeepBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:10,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success},firstKeepBadgeText:{color:colors.success,fontSize:11,fontWeight:'900'},firstKeepCount:{color:colors.textMuted,fontSize:11,fontWeight:'800'},firstKeepLine:{color:colors.textMuted,fontSize:11,lineHeight:15},
  styleIntro:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,marginBottom:10},
  styleGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},
  styleTile:{width:'48%',minHeight:116,marginBottom:10,padding:12,borderRadius:18,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,justifyContent:'flex-end',position:'relative'},
  styleTileLocked:{backgroundColor:'rgba(124,92,252,.09)',borderColor:colors.primary},
  styleTileUnlocked:{backgroundColor:'rgba(45,225,194,.08)',borderColor:colors.success},
  styleTileBadge:{position:'absolute',left:10,top:10,minHeight:22,paddingHorizontal:7,borderRadius:11,backgroundColor:'rgba(45,225,194,.12)',borderWidth:1,borderColor:colors.success,alignItems:'center',justifyContent:'center'},
  styleTileBadgeLocked:{backgroundColor:'rgba(124,92,252,.18)',borderColor:colors.primaryLight},
  styleTileBadgeUnlocked:{backgroundColor:'rgba(45,225,194,.18)',borderColor:colors.success},
  styleTileBadgeText:{color:colors.success,fontSize:9,fontWeight:'900',letterSpacing:.5},
  styleTileBadgeLockedText:{color:colors.primaryLight},
  styleTileBadgeUnlockedText:{color:colors.success},
  styleTileName:{color:colors.textPrimary,fontSize:16,fontWeight:'900',paddingRight:34},
  styleTileMeta:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:4,paddingRight:26},
  styleTilePlay:{position:'absolute',right:10,bottom:10,width:32,height:32,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  styleTilePlayText:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  allTracksToggle:{minHeight:48,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,marginTop:2,marginBottom:12},
  allTracksToggleText:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.3},
  saleShowcaseCompact:{marginTop:8,minHeight:58,paddingHorizontal:14,paddingVertical:10,borderRadius:16,backgroundColor:'rgba(124,92,252,.09)',borderWidth:1,borderColor:colors.primary,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  saleShowcaseCompactText:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:3},
  publicMusicSection:{paddingHorizontal:18,marginTop:10},musicSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:spacing.md},publicCount:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},emptyMusic:{alignItems:'center',paddingVertical:spacing.xxl,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},emptyMusicIcon:{color:colors.primaryLight,fontSize:28,marginBottom:spacing.sm},musicList:{gap:8},lockedTracksBlock:{marginTop:16},lockedTracksHeader:{color:colors.textMutedGrey,fontSize:12,fontWeight:'900',letterSpacing:0.5,marginBottom:8},lockedFolderTitleRow:{flexDirection:'row',alignItems:'center',gap:6},lockedFolderBadge:{flexShrink:0,paddingHorizontal:6,paddingVertical:2,borderRadius:8,backgroundColor:colors.dangerSoft,borderWidth:1,borderColor:colors.danger},lockedFolderBadgeText:{color:colors.danger,fontSize:9,fontWeight:'900',letterSpacing:0.5},lockedFolderTracks:{gap:8,marginTop:8,marginBottom:4,paddingLeft:6},
  // Adel (21/09/2026, maquette interactive validée) : la grille de la liste
  // de morceaux (hauteur fixe, carrés, chevron, panneau) vit désormais dans
  // TrackActionRow.tsx (source de vérité unique). musicRow/musicCover/
  // trackInfo/trackTitle/trackArtist restent utilisés par l'onglet
  // Artistes (ligne "groupe par artiste"), inchangé.
  musicRow:{flexDirection:'row',alignItems:'center',height:64,paddingHorizontal:9,gap:8},musicCover:{width:48,height:48,borderRadius:10,backgroundColor:colors.backgroundCard},musicCoverFallback:{alignItems:'center',justifyContent:'center'},musicFallback:{color:colors.primaryLight,fontSize:19,fontWeight:'900'},trackInfo:{flex:1,minWidth:0},trackTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},trackArtist:{color:colors.textMuted,fontSize:12,marginTop:2},
  discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap'},discoveryOriginLabel:{color:'#FFFFFF',fontSize:12,fontWeight:'800'},discoveryOriginPill:{minHeight:22,paddingHorizontal:8,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},discoveryOriginUser:{color:'#7CF2B9',fontSize:12,fontWeight:'900'},discoveryOriginProtected:{color:'#7CF2B9',fontSize:12,fontWeight:'800'},
  muted:{color:colors.textMuted,fontSize:14,textAlign:'center'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,0.78)',justifyContent:'flex-end',alignItems:'center',padding:14},
  editCard:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},ownerMenuScroll:{maxHeight:500,marginTop:12},ownerMenuRow:{minHeight:58,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:9},ownerMenuIcon:{width:28,textAlign:'center',fontSize:17},ownerMenuCopy:{flex:1,minWidth:0},ownerMenuLabel:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},ownerMenuHint:{color:colors.textMutedGrey,fontSize:9.5,lineHeight:14,marginTop:2},ownerMenuChevron:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},ownerMenuBack:{alignSelf:'flex-start',minHeight:38,justifyContent:'center'},ownerMenuBackText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},editTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900',textAlign:'center'},cancelButton:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},cancelText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},
  pickerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#2B2238'},pickerRowText:{flex:1,minWidth:0,color:colors.textPrimary,fontSize:14,fontWeight:'700'},pickerRowCount:{color:colors.textMuted,fontSize:12,fontWeight:'800',marginLeft:8},
  shareSheet:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},
  sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:'#51445F',alignSelf:'center',marginBottom:16},
  shareTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',textAlign:'center'},
  shareSubtitle:{color:colors.textMuted,fontSize:14,lineHeight:20,textAlign:'center',marginTop:6},
  cancelShare:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},
  cancelShareText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},
  keepPromptTrack:{color:colors.textMuted,fontSize:13,textAlign:'center',marginTop:6},
  keepChoice:{minHeight:70,borderRadius:17,paddingHorizontal:15,paddingVertical:12,justifyContent:'center',marginTop:12,borderWidth:1},
  keepChoicePublic:{backgroundColor:'rgba(104,242,177,.12)',borderColor:'#68F2B1'},
  keepChoicePrivate:{backgroundColor:'#21182F',borderColor:'#5B3F8C'},
  keepChoicePublicTitle:{color:'#68F2B1',fontSize:11,fontWeight:'900'},
  keepChoicePrivateTitle:{color:'#D6C2FA',fontSize:11,fontWeight:'900'},
  keepChoiceText:{color:'#FFFFFF',fontSize:10,lineHeight:14,marginTop:3},
  repriseSheet:{maxHeight:'82%'},
  repriseScroll:{width:'100%',marginTop:12,maxHeight:420},
  repriseRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#2B2238'},
  repriseAvatar:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundCard},
  repriseInfo:{flex:1,minWidth:0},
  repriseNameRow:{flexDirection:'row',alignItems:'center',gap:6},
  repriseUsername:{color:'#FFF',fontSize:14,fontWeight:'900',flexShrink:1},
  repriseGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:4},
  repriseGenreChip:{paddingHorizontal:7,paddingVertical:2,borderRadius:9,borderWidth:1},
  repriseGenreText:{fontSize:11,fontWeight:'800'},
  repriseFollowButton:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},
  repriseFollowButtonOn:{backgroundColor:'#1C3028',borderWidth:1,borderColor:'#3B8061'},
  repriseFollowButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  repriseFollowButtonTextOn:{color:'#76E3AE'},
});
