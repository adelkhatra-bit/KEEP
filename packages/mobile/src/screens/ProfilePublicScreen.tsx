import ProfileStoryBar from '../components/ProfileStoryBar';
import { loadStoryAccess } from '../services/storyAccessService';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Linking, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { loadMyOfferedTrackIds } from '../services/playlistSaleService';
import { persistOwnTrackVisibility } from '../services/keepVisibilityService';
import QRCode from 'react-native-qrcode-svg';
import { canonicalArtistIdentity, canonicalTrackIdentity, CanonicalTrack, computeMusicDNA, DnaSourceDecision, groupTracksByArtist, ProviderPlaylist } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { ProfileKind, SocialLink } from '../types';
import { buildAffiliatedPublicProfileLink, buildPublicProfileLink, copyProfileShareText, sharePlaylist, shareProfile, shareProfileByEmail, shareProfileTrack } from '../services/sharingService';
import { loadCurrentPlanCode } from '../services/planService';
import { createProfileService } from '../services/profileService';
import { createAuthService } from '../services/authService';
import { supabase } from '../services/supabaseClient';
import { getDownloadCreditStatus, loadFreeSpentToday } from '../services/creditService';
import { loadMyFreeWalletStatus } from '../services/freeWalletService';
import { keepLokiPulseTrack } from '../services/lokiPulseKeep';
import { hideLokiPulseTrack, loadLokiPulse, LokiPulseItem } from '../services/lokiPulseService';
import { loadPulsePreferenceState } from '../services/pulsePreferenceService';
import { loadKeepBattleGlobalLeaderboard, loadKeepBattlePlayerStats, loadMyActiveKeepBattleArena, loadMyKeepBattleCreditStatus, loadMyKeepBattleStats, KeepBattleStats } from '../services/keepBattleService';
import { getCommercialRules, getGrowthRewardStatus, getSmartSortAccess, GrowthRewardStatus, QuotaAccess } from '../services/growthAccessService';
import { isPlaylistMarketplaceEnabled, isPlaylistMarketplaceVisible } from '../services/featureFlagService';
import { preloadTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { loadUnreadNotificationCount, subscribeToNotificationChanges } from '../services/notificationService';
import { musicEngine } from '../services/musicEngine';
import { KeepPlaylistPreference, loadPlaylistPreferences, preferenceFor } from '../services/keepLibraryService';
import { isSmartAlbumUiId, loadOwnSmartAlbums, loadSmartAlbumTracks, persistEnrichedGenres, refreshOwnSmartAlbums, smartAlbumAsProviderPlaylist, SmartAlbumRecord } from '../services/smartAlbumService';
import { enrichMissingGenres } from '../services/keylessGenreService';
import { loadMyPlaylistSaleOffers, loadOwnPlaylistSaleOfferTracks, loadPlaylistSaleOfferOverlap, loadPlaylistSaleOffersForProfile, PublicPlaylistSaleOffer, PlaylistSaleOffer, purchasePlaylistOfferWithFree, requestMissingPlaylistSaleTracks, requestPlaylistPurchase } from '../services/playlistSaleService';
import { readProfileMemory, writeProfileMemory } from '../services/profileMemory';
import { readOwnProfileKeepsCache } from '../services/publicProfileStateService';
import { DiscoveryImpact, loadOwnProfileKeeps, loadOwnProfileSnapshot, loadProfileDiscoveryImpacts, loadProfileReprisers, loadPublicProfileSnapshot, OwnProfileSnapshot, ProfileCertificationTier, ProfileRepriser, PublicProfileKeep, PublicProfileSnapshot } from '../services/publicProfileStateService';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import TrackActionRow from '../components/TrackActionRow';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import MusicTasteQuestionnaire from '../components/MusicTasteQuestionnaire';
import SourceProfileQuickView from '../components/SourceProfileQuickView';
import ProfileCertificationBadge, { CERTIFICATION_META } from '../components/ProfileCertificationBadge';
import CommunityConnectionsPanel, { CommunityMode } from '../components/CommunityConnectionsPanel';
import ContextHelpSheet from '../components/ContextHelpSheet';
import ProfileCounterRow from '../components/ProfileCounterRow';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { useGlobalChatStore } from '../store/useGlobalChatStore';
import BattleGlowButton from '../components/BattleGlowButton';
import ProfileMotionReveal from '../components/ProfileMotionReveal';
import MotionActionButton from '../components/MotionActionButton';
import ProfileStyleCard from '../components/ProfileStyleCard';
import ProfileOpportunityRail from '../components/ProfileOpportunityRail';
import LoginPill from '../components/LoginPill';
import { useAccountGateStore } from '../store/useAccountGateStore';
import PlaylistSaleImmersivePreview from '../components/PlaylistSaleImmersivePreview';
import SellerBoutique, { SELLER_BOUTIQUE_SECTION_STYLE } from '../components/SellerBoutique';
import { buildPayoutCheckoutUrl } from '../services/payoutLinkService';
import { loadProfileSaleSuggestions, ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';
import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';
import PublicProfilePanel from '../components/PublicProfilePanel';
import CreatorToolsPanel from '../components/CreatorToolsPanel';
import HelpLegalPanel from '../components/HelpLegalPanel';
import PersonalThemeBackdrop from '../components/PersonalThemeBackdrop';
import MusicStyleBubbles from '../components/MusicStyleBubbles';
import { buildMusicStyleBubbles } from '../services/musicStyleBubbles';
import NotificationSidePanel from '../components/NotificationSidePanel';
import { strongKeepTrackIdentity } from '../services/keepTrackIdentity';
import KeepModal from '../components/KeepModal';

type ProfileTab = 'TRACKS' | 'PLAYLISTS' | 'ARTISTS';
type SocialPlatform = SocialLink['platform'];
type AccountMode = 'create' | 'login';

// Adel (16-17/09/2026) : "je clique, et dans une page je peux cliquer
// plusieurs choses, il y a plusieurs fonctions ... tout part du pop-up,
// maximum un, deux clics" -- "Réglages avancés" était UNE entrée qui
// menait vers un écran à 4 fonctions différentes (profil public, créateur,
// aide, compte). Éclaté en 4 entrées directes, chacune n'ouvrant plus
// qu'UNE seule fonction (l'écran cible n'a plus de sélecteur pour dériver
// vers les 3 autres).
type ProfileMenuItem = { key: string; icon: string; label: string; hint: string };
// Couleur propre à chaque entrée du menu ☰ (contraste garanti sur fond sombre).
const MENU_ICON_COLORS: Record<string, string> = {
  profile: '#60A5FA', identityShare: '#2DE1C2', musicTaste: '#F472B6', publicProfile: '#38BDF8', chatSettings: '#A78BFA',
  music: '#4ADE80', offers: '#FBBF24', sellPlaylists: '#FB923C', receipts: '#2DD4BF', creator: '#E879F9', help: '#F87171',
};
const menuIconColor = (key: string) => MENU_ICON_COLORS[key] || '#A78BFA';
type ProfileMenuGroup = { title: string; items: ProfileMenuItem[] };

// Menu volontairement regroupé : moins de lignes, aucun doublon avec la cloche
// Notifications ni avec le compteur Free du profil. Un appui ouvre directement
// la fonction ou son panneau, puis « ‹ Menu » ramène immédiatement en arrière.
const MENU_GROUPS: ProfileMenuGroup[] = [
  {
    title: 'PROFIL',
    items: [
      { key: 'profile', icon: '👤', label: 'Réglages du profil', hint: 'Photo · pseudo · bio · ville · pays' },
      { key: 'identityShare', icon: '▦', label: 'Carte', hint: 'QR · lien · partage' },
      { key: 'musicTaste', icon: '♫', label: 'Mes goûts musicaux', hint: 'Styles · langues · pays · Loki Pulse' },
      { key: 'publicProfile', icon: '🌐', label: 'Réseaux & site web', hint: 'Instagram · TikTok · Snapchat · YouTube · X · Facebook' },
      { key: 'chatSettings', icon: '💬', label: 'Messagerie', hint: 'Pages · côté · hauteur · alertes' },
    ],
  },
  {
    title: 'MUSIQUE',
    items: [
      { key: 'music', icon: '🎧', label: 'Services', hint: 'Spotify · Deezer · YouTube Music · SoundCloud' },
      { key: 'offers', icon: '💳', label: 'Free', hint: 'Solde · formule · avantages' },
      { key: 'sellPlaylists', icon: '◆', label: 'Collections', hint: 'Créer · publier · gérer' },
      { key: 'receipts', icon: '🧾', label: 'Reçus & transactions', hint: 'FREE · PayPal · références Loki' },
      { key: 'creator', icon: '🪪', label: 'Créateur', hint: 'Type · outils · événements' },
    ],
  },
  {
    title: 'AIDE',
    items: [
      { key: 'help', icon: '🆘', label: 'Aide', hint: 'Support · légal · comptes bloqués' },
    ],
  },
]

const LOCAL_PROFILE_PLAYLIST_ID = 'keep-local-history';
const TABS: { key: ProfileTab; label: string }[] = [
  // Adel (13/09/2026, audit) : "musique et artiste c'est la même chose ...
  // albums, je ne sais pas à quoi ça sert" -- vérifié sur les vraies
  // données : 93,9% des artistes gardés n'ont qu'un seul morceau, 98,8% des
  // albums aussi (on garde un morceau à la fois, pas un album entier).
  // Albums affichait donc quasi toujours la même chose qu'Artistes, avec le
  // même bloc d'affichage -- rubrique retirée plutôt que gardée pour rien.
  { key: 'TRACKS', label: 'Styles' }, { key: 'PLAYLISTS', label: 'Playlists' }, { key: 'ARTISTS', label: 'Artistes' },
];
const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' }, { platform: 'tiktok', label: 'TikTok' }, { platform: 'snapchat', label: 'Snapchat' }, { platform: 'youtube', label: 'YouTube' }, { platform: 'x', label: 'X' }, { platform: 'facebook', label: 'Facebook' },
];
const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Fan', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Lieu',
};

export default function ProfilePublicScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [realSessionUserId, setRealSessionUserId] = useState<string | null>(null);
  const [realSessionResolved, setRealSessionResolved] = useState(false);

  // Garde-fou auth propriétaire : Supabase est la source de vérité.
  // Un flag invité/démo local périmé ne doit jamais déconnecter visuellement
  // un vrai compte déjà restauré (cas Inside). Réconciliation au montage,
  // au focus et à chaque changement de session.
  useEffect(() => {
    if (!supabase) {
      setRealSessionResolved(true);
      return undefined;
    }
    let live = true;
    const client = supabase;
    const auth = createAuthService(client);
    const profiles = createProfileService(client);

    const reconcile = async () => {
      let session = await auth.getCurrentSession().catch(() => null);

      // Supabase peut restaurer silencieusement une session expirée si le
      // refresh token existe encore sur l'appareil. On tente donc toujours
      // cette récupération avant d'afficher « déconnecté ».
      if (!session) {
        try {
          await client.auth.refreshSession();
          session = await auth.getCurrentSession().catch(() => null);
        } catch {
          // Aucun refresh token exploitable : état réellement déconnecté.
        }
      }

      if (!live) return;
      setRealSessionResolved(true);

      if (!session || session.isAnonymous) {
        setRealSessionUserId(null);
        return;
      }

      setRealSessionUserId(session.userId);
      const state = useUserStore.getState();
      if (!state.user || state.user.id !== session.userId || state.isLocalGuest || state.isDemoMode) {
        state.syncFromAuthSession(session);
        try {
          const ownProfile = await profiles.loadOrCreateOwnProfile(session);
          if (live) useUserStore.getState().setUser(ownProfile);
        } catch {
          // La session réelle reste suffisante pour ne pas bloquer l'UI.
        }
      }
    };

    void reconcile();
    const offFocus = navigation?.addListener?.('focus', () => { void reconcile(); });
    const offAuth = auth.onSessionChange((session) => {
      if (!live) return;
      setRealSessionResolved(true);
      if (!session || session.isAnonymous) {
        setRealSessionUserId(null);
        return;
      }
      setRealSessionUserId(session.userId);
      const state = useUserStore.getState();
      if (!state.user || state.user.id !== session.userId || state.isLocalGuest || state.isDemoMode) {
        state.syncFromAuthSession(session);
      }
    });

    return () => {
      live = false;
      offFocus?.();
      offAuth();
    };
  }, [navigation]);

  const effectiveAuthenticatedUserId = realSessionResolved
    ? realSessionUserId
    : (!isLocalGuest && !isDemoMode ? user?.id ?? null : null);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const syncUnsyncedKeeps = useSessionHistoryStore((s) => s.syncUnsyncedKeeps);
  const syncPendingFavoriteImports = useSessionHistoryStore((s) => s.syncPendingFavoriteImports);
  const [communityMode, setCommunityMode] = useState<CommunityMode>(null);
  const [metricsExpanded, setMetricsExpanded] = useState(false);
  const [ownerDnaExpanded, setOwnerDnaExpanded] = useState(false);
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      setOwnerDnaExpanded(false);
    });
    return () => unsubscribe?.();
  }, [navigation]);
  const [freeDetailsOpen, setFreeDetailsOpen] = useState(false);
  const battleAvailable = useBattleAvailabilityStore((s) => s.available);
  const battleAvailabilityBusy = useBattleAvailabilityStore((s) => s.busy);
  const setBattleAvailable = useBattleAvailabilityStore((s) => s.setAvailable);
  const [battleFeatureEnabled, setBattleFeatureEnabled] = useState(false);
  const [battleAvailabilityInfoOpen, setBattleAvailabilityInfoOpen] = useState(false);
  const [battleAvailabilityInfoValue, setBattleAvailabilityInfoValue] = useState(false);
  const battleAvailabilityInfoAnim = useRef(new Animated.Value(0)).current;
  const battleAvailabilityInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { let live = true; isKeepBattleEnabled().then((v) => live && setBattleFeatureEnabled(v)); return () => { live = false; }; }, []);
  useEffect(() => () => { if (battleAvailabilityInfoTimer.current) clearTimeout(battleAvailabilityInfoTimer.current); }, []);
  const showBattleAvailabilityInfo = (nextValue: boolean) => {
    if (battleAvailabilityInfoTimer.current) clearTimeout(battleAvailabilityInfoTimer.current);
    battleAvailabilityInfoAnim.stopAnimation();
    battleAvailabilityInfoAnim.setValue(0);
    setBattleAvailabilityInfoValue(nextValue);
    setBattleAvailabilityInfoOpen(true);
    Animated.timing(battleAvailabilityInfoAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    battleAvailabilityInfoTimer.current = setTimeout(() => {
      Animated.timing(battleAvailabilityInfoAnim, { toValue: 0, duration: 420, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setBattleAvailabilityInfoOpen(false);
      });
    }, 3200);
  };
  // DESIGN_SYSTEM v3 (21/09/2026) : section "Battle & présence" -- victoires,
  // partie en cours et rang, toutes trois lues depuis Supabase (aucun chiffre
  // inventé) : keep_battle_my_stats (wins réels), keep_battle_global_leaderboard
  // (position réelle de ce profil, "Non classé" s'il est hors du top 50),
  // arène active pour "en cours".
  const [battleStats, setBattleStats] = useState<KeepBattleStats | null>(null);
  const [battleRank, setBattleRank] = useState<number | null>(null);
  const [battleInProgress, setBattleInProgress] = useState(false);
  const [growthStatus, setGrowthStatus] = useState<GrowthRewardStatus | null>(null);
  const [smartSortAccess, setSmartSortAccess] = useState<QuotaAccess | null>(null);
  // Adel (14/09/2026) : "ça fait trop de boutons ... il faut un système de
  // roulette ... comme tu as fait pour les battles" -- même bouton compact +
  // dérouleur que côté profil visiteur, jamais un mur de puces qui grossit
  // avec la taille de la collection.
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  // Mission C (23/09/2026, maquette validée ProfileGenreFolders.html) :
  // onglet Musiques rangeable "Par genre" (dossiers) en plus de "Tout" (la
  // liste plate historique). 'ALL' par défaut : aucune régression, la vue
  // existante reste la vue par défaut. Rien ne disparaît, on ajoute un mode.
  const [tracksGrouping, setTracksGrouping] = useState<'ALL' | 'GENRE'>('GENRE');
  const [expandedGenreFolder, setExpandedGenreFolder] = useState<string | null>(null);
  // Adel (16-17/09/2026) : "quand on clique sur l'hamburger, on doit avoir
  // toutes les rubriques, tout en une fois ... je sélectionne et ça me met
  // sur la bonne page, là c'est trop compliqué ... va t'inspirer de la
  // concurrence, TikTok etc." -- avant, ☰ ouvrait directement l'écran
  // Réglages (profil), qui ne menait vers Notifications/Services
  // musicaux/Offres/Réglages avancés qu'après un ou deux taps de plus. Un
  // seul menu plat désormais, toutes les destinations visibles d'un coup.
  const [menuOpen, setMenuOpen] = useState(false);
  // Adel (16-17/09/2026) : "fais en sorte qu'on ne sorte pas de la page ...
  // je veux que toutes les fonctionnalités soient sur le pop-up ... il y a
  // une explication, et il y a ce qu'on doit faire" -- un simple lien vers
  // un autre écran suffisait pour les infos, mais pas pour "je ne sors
  // jamais du pop-up". Chaque rubrique se déplie maintenant SUR PLACE avec
  // son explication ; seules les actions vraiment complexes (acheter une
  // formule, uploader un fichier pour vendre sa musique, etc.) gardent un
  // bouton qui ouvre l'écran dédié -- décision confirmée avec Adel (l'info
  // simple reste dans le pop-up, les actions complexes restent en plein
  // écran).
  const [expandedMenuItem, setExpandedMenuItem] = useState<string | null>(null);
  // Adel (21/09/2026) : "Hauteur fixe et uniforme pour toutes les cartes ...
  // le reste des informations passe dans un menu dépliable." Le badge 1er
  // KEEP, la ligne d'attribution et Partager ne changent plus jamais la
  // hauteur de la carte -- ils vivent dans ce panneau, replié par défaut.
  const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());
  const toggleTrackExpanded = (key: string) => setExpandedTrackKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const providerPlaylists = usePlaylistStore((s) => s.playlists);
  const refreshPlaylists = usePlaylistStore((s) => s.refresh);
  const [activeTab, setActiveTab] = useState<ProfileTab>('TRACKS');
  const accountRequired = !effectiveAuthenticatedUserId;
  // Stories + suggestions d'amis : comptes réels avec e-mail vérifié uniquement (jamais démo / invité / anonyme).
  const [storiesUnlocked, setStoriesUnlocked] = useState(false);
  useEffect(() => {
    let live = true;
    if (accountRequired || isDemoMode || isLocalGuest) { setStoriesUnlocked(false); return undefined; }
    void loadStoryAccess().then((ok) => { if (live) setStoriesUnlocked(ok); });
    return () => { live = false; };
  }, [accountRequired, isDemoMode, isLocalGuest, effectiveAuthenticatedUserId]);
  const [planCode, setPlanCode] = useState('FREE');
  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [ownSnapshot, setOwnSnapshot] = useState<OwnProfileSnapshot | null>(null);
  const [serverOwnKeeps, setServerOwnKeeps] = useState<PublicProfileKeep[]>([]);
  // Musiques actuellement dans une de MES offres de vente (elles sont masquées d'office tant qu'elles sont en vente).
  const [offeredTrackIds, setOfferedTrackIds] = useState<Record<string, unknown>>({});
  const [discoveryImpacts, setDiscoveryImpacts] = useState<Record<string, DiscoveryImpact>>({});
  const [creditRemaining, setCreditRemaining] = useState<number | null>(null);
  const [creditUnlimited, setCreditUnlimited] = useState(false);
  // Adel (04/09/2026) : "enlève le nom commercial et mets le nombre de Free
  // disponibles ... pour tout le monde sur le profil" -- l'ancien badge
  // masquait le compteur dès qu'un plan payant était actif (Creator
  // Pro/Venue Pro = "illimité" côté crédits de téléchargement uniquement).
  // keep_battle_credit_status calcule le VRAI solde Free unifié (Keep +
  // Battle) pour n'importe quel plan -- c'est la même fonction que l'écran
  // Offres utilise déjà pour un compte connecté, donc les deux endroits
  // affichent enfin le même chiffre.
  const [freeBalance, setFreeBalance] = useState<number | null>(null);
  const [freeSpentToday, setFreeSpentToday] = useState(0);
  const [freeSpentKeepCount, setFreeSpentKeepCount] = useState(0);
  const [freeMarketplaceSpentToday, setFreeMarketplaceSpentToday] = useState(0);
  const [freeMarketplacePurchaseCount, setFreeMarketplacePurchaseCount] = useState(0);
  const [freeListenSpentToday, setFreeListenSpentToday] = useState(0);
  const [freeListenPaidCountToday, setFreeListenPaidCountToday] = useState(0);
  const [freeListenStreak, setFreeListenStreak] = useState(0);
  const [freeStreakEarnedToday, setFreeStreakEarnedToday] = useState(0);
  const [freeDiscoveryEarnedToday, setFreeDiscoveryEarnedToday] = useState(0);
  const [freeRechargeEarnedToday, setFreeRechargeEarnedToday] = useState(0);
  const [freeWon, setFreeWon] = useState(0);
  const [freeLost, setFreeLost] = useState(0);
  // Adel (04/09/2026) : le coût réel d'un Garder (free_cost_per_keep, Super
  // Admin > Remote Config) était encore écrit en dur ("-1 Free") dans cette
  // même fenêtre -- devenu faux dès que l'admin change la valeur. Chargé
  // depuis la même source que l'écran Offres pour ne jamais désynchroniser.
  const [freeCostPerKeep, setFreeCostPerKeep] = useState(3);
  const [playlistSaleOffers, setPlaylistSaleOffers] = useState<PlaylistSaleOffer[]>([]);
  const [ownerPrivateChatOpen, setOwnerPrivateChatOpen] = useState(false);
  const [ownerMusicInfoOpen, setOwnerMusicInfoOpen] = useState(false);
  // Une seule présentation du Drop : le propriétaire et les visiteurs rendent
  // SellerBoutique. Ainsi tout changement de design reste automatiquement lié.
  const ownerBoutiqueOffers = useMemo<PublicPlaylistSaleOffer[]>(() => playlistSaleOffers
    .filter((offer) => offer.isActive && Boolean(offer.offerId) && !offer.playlistId.startsWith('keep-chat:'))
    .map((offer) => ({
      offerId: String(offer.offerId),
      playlistId: offer.playlistId,
      playlistName: offer.playlistName,
      paymentMode: offer.paymentMode ?? 'MONEY',
      priceCents: offer.priceCents,
      freePrice: offer.freePrice ?? null,
      currencyCode: offer.currencyCode,
      coverUrl: offer.coverUrl ?? null,
      trackCount: offer.trackCount ?? 0,
      genres: offer.genres ?? [],
    })), [playlistSaleOffers]);
  const ownerPrivateChatOffers = useMemo(
    () => playlistSaleOffers
      .filter((offer) => Boolean(offer.offerId) && offer.isActive && offer.playlistId.startsWith('keep-chat:'))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [playlistSaleOffers],
  );
  const [profileSaleSuggestions, setProfileSaleSuggestions] = useState<ProfileSaleSuggestion[]>([]);
  const [opportunityPreviewOffer, setOpportunityPreviewOffer] = useState<PublicPlaylistSaleOffer | null>(null);
  const [opportunityPreviewSuggestion, setOpportunityPreviewSuggestion] = useState<ProfileSaleSuggestion | null>(null);
  const [opportunityPurchaseBusy, setOpportunityPurchaseBusy] = useState(false);
  const [opportunityMissingBusy, setOpportunityMissingBusy] = useState(false);
  const [marketplacePurchaseEnabled, setMarketplacePurchaseEnabled] = useState(false);
  useEffect(() => { let live = true; isPlaylistMarketplaceEnabled().then((enabled) => live && setMarketplacePurchaseEnabled(enabled)); return () => { live = false; }; }, []);
  const openOpportunityPreview = async (suggestion: ProfileSaleSuggestion) => {
    unlockWebAudioForGesture();
    try {
      const offers = await loadPlaylistSaleOffersForProfile(suggestion.sellerId);
      const offer = offers.find((row) => row.offerId === suggestion.offerId);
      if (!offer) throw new Error('OFFER_NOT_FOUND');
      setOpportunityPreviewSuggestion(suggestion);
      setOpportunityPreviewOffer(offer);
    } catch {
      setOpportunityPreviewSuggestion(null);
      Alert.alert('Découverte', 'Cette sélection n’est plus disponible pour le moment.');
    }
  };
  const buyOpportunityOffer = async (offer: PublicPlaylistSaleOffer) => {
    if (opportunityPurchaseBusy) return;
    setOpportunityPurchaseBusy(true);
    try {
      const overlap = await loadPlaylistSaleOfferOverlap(offer.offerId);
      if (overlap.ownedCount > 0) {
        if (overlap.missingCount <= 0) {
          Alert.alert('Déjà dans ton Loki Music', 'Tu possèdes déjà tous les morceaux de cette collection. Aucun paiement ni FREE ne sera débité.');
          return;
        }
        Alert.alert(
          'Pas de double achat',
          `Tu as déjà ${overlap.ownedCount} morceau${overlap.ownedCount > 1 ? 'x' : ''}. Loki ne te les fera pas repayer. Demande seulement les ${overlap.missingCount} morceau${overlap.missingCount > 1 ? 'x' : ''} manquant${overlap.missingCount > 1 ? 's' : ''}.`,
          [
            { text: 'ANNULER', style: 'cancel' },
            { text: 'DEMANDER LES MANQUANTS', onPress: () => { void requestOpportunityMissingTracks(offer); } },
          ],
        );
        return;
      }
      if (offer.paymentMode === 'FREE') {
        await purchasePlaylistOfferWithFree(offer.offerId);
        const [battleStatus, dailySpend, downloadStatus] = await Promise.all([
          loadMyKeepBattleCreditStatus().catch(() => null),
          loadFreeSpentToday().catch(() => null),
          getDownloadCreditStatus().catch(() => null),
        ]);
        if (battleStatus) setFreeBalance(battleStatus.remainingFree);
        if (downloadStatus) {
          setCreditRemaining(downloadStatus.remaining);
          setCreditUnlimited(downloadStatus.unlimited);
        }
        if (dailySpend) {
          setFreeSpentToday(dailySpend.spent);
          setFreeSpentKeepCount(dailySpend.keeps);
          setFreeMarketplaceSpentToday(dailySpend.marketplaceSpent);
          setFreeMarketplacePurchaseCount(dailySpend.marketplacePurchases);
        }
        setOpportunityPreviewOffer(null);
        Alert.alert(
          'Collection ajoutée',
          `${offer.freePrice ?? 0} FREE débités · ${battleStatus ? `${battleStatus.remainingFree} FREE restants · ` : ''}les nouveaux morceaux sont maintenant dans ton Loki Music.`,
        );
        return;
      }
      if (!marketplacePurchaseEnabled) {
        Alert.alert('Paiement', 'Le paiement externe n’est pas activé sur cet appareil.');
        return;
      }
      const request = await requestPlaylistPurchase(offer.offerId);
      if (!request.payoutLink) throw new Error('PAYOUT_LINK_MISSING');
      const checkoutUrl = buildPayoutCheckoutUrl(request.payoutLink, request.amountCents, request.currencyCode);
      await Linking.openURL(checkoutUrl);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('DUPLICATE_TRACK_PURCHASE_BLOCKED')) {
        Alert.alert('Pas de double achat', 'Cette collection contient de la musique que tu possèdes déjà. Loki bloque le débit et te permet de demander seulement les morceaux manquants.');
      } else {
        Alert.alert('Paiement', 'Impossible de démarrer le déblocage pour le moment.');
      }
    } finally {
      setOpportunityPurchaseBusy(false);
    }
  };
  const requestOpportunityMissingTracks = async (offer: PublicPlaylistSaleOffer) => {
    if (opportunityMissingBusy) return;
    setOpportunityMissingBusy(true);
    try {
      const result = await requestMissingPlaylistSaleTracks(offer.offerId);
      Alert.alert(
        'Demande envoyée',
        `@${opportunityPreviewSuggestion?.sellerUsername || 'le créateur'} a reçu ta demande pour ${result.missingCount} morceau${result.missingCount > 1 ? 'x' : ''} manquant${result.missingCount > 1 ? 's' : ''}.`,
      );
      setOpportunityPreviewOffer(null);
      setOpportunityPreviewSuggestion(null);
    } catch (e: any) {
      const message = String(e?.message || '');
      Alert.alert('Demande', message.includes('ALL_TRACKS_ALREADY_OWNED') ? 'Tu as déjà tous les morceaux de cette collection.' : 'Impossible d’envoyer la demande pour le moment.');
    } finally {
      setOpportunityMissingBusy(false);
    }
  };

  const [profileSaleSuggestionIndex, setProfileSaleSuggestionIndex] = useState(0);
  // Adel (07/09/2026) : "j'ai pas un petit pop pour sélectionner si je suis
  // un DJ, un hôtel etc. ... rien ne se passe, il me redirige sur les
  // paramètres" -- la pastille ouvrait les Réglages avancés au lieu d'un
  // choix direct sur place. Popup immédiat, même logique que
  // CreatorToolsPanel (changeKind).
  useEffect(() => {
    if (accountRequired || !user?.id) return undefined;
    let live = true;
    const refreshProfileSaleSuggestions = () => {
      loadProfileSaleSuggestions(8)
        .then((rows) => { if (live) { setProfileSaleSuggestions(rows); setProfileSaleSuggestionIndex(0); } })
        .catch(() => { if (live) setProfileSaleSuggestions([]); });
    };
    refreshProfileSaleSuggestions();
    const unsubscribe = navigation?.addListener?.('focus', refreshProfileSaleSuggestions);
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, user?.id, navigation]);
  useEffect(() => {
    if (profileSaleSuggestions.length < 2) return undefined;
    const timer = setInterval(() => setProfileSaleSuggestionIndex((value) => (value + 1) % profileSaleSuggestions.length), 6500);
    return () => clearInterval(timer);
  }, [profileSaleSuggestions.length]);

  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const [kindChangeBusy, setKindChangeBusy] = useState(false);
  // Adel (07/09/2026) : liste de qui a repris les morceaux de ce profil,
  // avec style musical et abonnement direct.
  const [repriseListOpen, setRepriseListOpen] = useState(false);
  const [repriseLoading, setRepriseLoading] = useState(false);
  const [reprisers, setReprisers] = useState<ProfileRepriser[]>([]);
  const [repriseFollowBusyId, setRepriseFollowBusyId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!repriseListOpen || !user) return undefined;
    setRepriseLoading(true);
    loadProfileReprisers(user.id).then((rows) => { if (live) setReprisers(rows); }).catch(() => { if (live) setReprisers([]); }).finally(() => { if (live) setRepriseLoading(false); });
    return () => { live = false; };
  }, [repriseListOpen, user?.id]);
  const toggleRepriserFollow = async (repriser: ProfileRepriser) => {
    if (!supabase || !user || repriseFollowBusyId) return;
    // Règle d'Adel (05/10/2026) : on ne se désabonne QUE depuis la page profil de la personne.
    if (repriser.isFollowing) { navigation.navigate('PublicProfile', { username: repriser.username }); return; }
    setRepriseFollowBusyId(repriser.profileId);
    try {
      await supabase.rpc('keep_follow_profile', { p_followee_id: repriser.profileId });
      setReprisers((rows) => rows.map((r) => r.profileId === repriser.profileId ? { ...r, isFollowing: true } : r));
    } catch {
      Alert.alert('Abonnement', 'Impossible de mettre à jour l’abonnement pour le moment.');
    } finally {
      setRepriseFollowBusyId(null);
    }
  };
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationNudgeVisible, setNotificationNudgeVisible] = useState(false);
  const notificationBellShake = useRef(new Animated.Value(0)).current;
  const notificationNudgeReveal = useRef(new Animated.Value(0)).current;
  const lastNotificationNudgeCount = useRef(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [affiliatedProfileLink, setAffiliatedProfileLink] = useState('');
  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);
  const [selectionSwipe, setSelectionSwipe] = useState<{ title: string; subtitle: string; tracks: CanonicalTrack[]; sourceByTrack?: Record<string, { profileId?: string; username?: string; avatarUrl?: string | null }> } | null>(null);
  const [lokiPulseItems, setLokiPulseItems] = useState<LokiPulseItem[]>([]);
  const [lokiPulseSwipeOpen, setLokiPulseSwipeOpen] = useState(false);
  const [lokiPulseSelectedTrackId, setLokiPulseSelectedTrackId] = useState<string | null>(null);
  const [pulseTasteOpen, setPulseTasteOpen] = useState(false);
  const lokiPulseGlow = useRef(new Animated.Value(0)).current;
  const lokiPulseScrollRef = useRef<ScrollView | null>(null);
  const lokiPulseAutoIndex = useRef(0);
  // Adel (20/09/2026) : BUG RÉEL -- "la musique ne se lance pas
  // automatiquement, il faut appuyer sur ÉCOUTER L'EXTRAIT". Sur le web,
  // .play() n'est autorisé sans interaction que s'il est appelé de façon
  // SYNCHRONE depuis un vrai geste (tap) -- ici le premier essai de lecture
  // arrive dans un .then() après resolveTrackPreviewUrl(), donc APRÈS la fin
  // du geste : le navigateur le bloque et MusicSwipeDeckModal retombe sur
  // son fallback "ÉCOUTER L'EXTRAIT" (voir toggleTrackPreview catch ->
  // setAutoplayBlocked(true)). Même correctif déjà en place pour Battle
  // (unlockWebAudioForGesture, KeepBattleMobileGameV3.tsx) : débloquer
  // l'élément <audio> partagé PENDANT le tap qui ouvre le Swipe suffit à
  // ce que les lectures programmatiques suivantes soient acceptées.
  const openSelectionSwipe = (selection: { title: string; subtitle: string; tracks: CanonicalTrack[]; sourceByTrack?: Record<string, { profileId?: string; username?: string; avatarUrl?: string | null }> }) => {
    unlockWebAudioForGesture();
    setSelectionSwipe(selection);
  };
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumRecord[]>([]);
  const [sourceQuickUsername, setSourceQuickUsername] = useState('');
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [expandedGroupItem, setExpandedGroupItem] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Record<string, CanonicalTrack[]>>({});
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [playlistPreferences, setPlaylistPreferences] = useState<Record<string, KeepPlaylistPreference>>({});
  // BUG RÉEL trouvé le 30/08/2026 (audit Super Admin vs côté utilisateur,
  // Adel : "je ne pense pas qu'on soit prêt") : le flag `keep_dna` existe
  // dans Feature Flags mais rien ne le lisait -- la section Loki DNA
  // s'affichait pour 100% des utilisateurs quel que soit son état. Décision
  // Adel : brancher le flag pour de vrai plutôt que de laisser un bouton
  // décoratif dans Super Admin.
  // Adel (20/09/2026) : marketplace playlists (VENDRE/ACHETER) en "coming
  // soon" -- paiement par lien externe, non conforme Apple IAP pour du
  // contenu numérique déverrouillé dans l'app. Code intact, juste masqué
  // tant que le flag Super Admin 'playlist_marketplace' reste désactivé.
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(false);
  // (21/09/2026) BUG RÉEL corrigé : ce check ne tournait qu'au montage --
  // un changement de flag/bypass fait dans Super Admin pendant que l'écran
  // était déjà ouvert n'était jamais relu sans relancer l'app. Recalculé
  // aussi à chaque focus.
  useEffect(() => {
    let live = true;
    const check = () => { isPlaylistMarketplaceVisible().then((enabled) => live && setMarketplaceEnabled(enabled)); };
    check();
    const unsubscribe = navigation?.addListener?.('focus', check);
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);

  useEffect(() => {
    let live = true;
    if (!user || accountRequired) {
      setAffiliatedProfileLink('');
      return () => { live = false; };
    }
    buildAffiliatedPublicProfileLink(user.username)
      .then((link) => { if (live) setAffiliatedProfileLink(link); })
      .catch(() => { if (live) setAffiliatedProfileLink(buildPublicProfileLink(user.username)); });
    return () => { live = false; };
  }, [accountRequired, user?.id, user?.username]);
  useEffect(() => {
    if (!battleFeatureEnabled || accountRequired || !user) { setBattleStats(null); setBattleRank(null); setBattleInProgress(false); return undefined; }
    let live = true;
    const refreshBattlePresence = async () => {
      try {
        const stats = await loadMyKeepBattleStats();
        if (live) setBattleStats(stats);
      } catch { if (live) setBattleStats(null); }
      try {
        const leaderboard = await loadKeepBattleGlobalLeaderboard(50);
        const position = leaderboard.findIndex((row) => row.profileId === user.id);
        if (live) setBattleRank(position >= 0 ? position + 1 : null);
      } catch { if (live) setBattleRank(null); }
      try {
        const activeArena = await loadMyActiveKeepBattleArena();
        if (live) setBattleInProgress(!!activeArena);
      } catch { if (live) setBattleInProgress(false); }
    };
    void refreshBattlePresence();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshBattlePresence(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, battleFeatureEnabled, navigation, user?.id]);
  const providerId = musicEngine.musicProvider.providerId || 'Loki Music';

  useEffect(() => {
    let live = true;
    if (user && !accountRequired) loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE'));
    else setPlanCode('FREE');
    return () => { live = false; };
  }, [accountRequired, user?.id]);

  useEffect(() => {
    let live = true;
    const refreshCanonicalProfileState = async () => {
      if (!user || accountRequired) {
        if (live) {
          setPublicSnapshot(null);
          setOwnSnapshot(null);
          setServerOwnKeeps([]);
          setDiscoveryImpacts({});
        }
        return;
      }
      const [publicState, ownState, ownKeeps, impacts] = await Promise.allSettled([
        loadPublicProfileSnapshot(user.id),
        loadOwnProfileSnapshot(),
        loadOwnProfileKeeps(),
        loadProfileDiscoveryImpacts(user.id),
      ]);
      if (!live) return;
      // Une panne d'un RPC ne doit JAMAIS transformer le profil en profil vide.
      // Chaque bloc conserve son dernier état valide et se remplace seulement
      // quand sa propre source serveur répond correctement.
      if (publicState.status === 'fulfilled') { setPublicSnapshot(publicState.value); writeProfileMemory(user.id, 'public', publicState.value); }
      if (ownState.status === 'fulfilled') { setOwnSnapshot(ownState.value); writeProfileMemory(user.id, 'own', ownState.value); }
      if (ownKeeps.status === 'fulfilled') setServerOwnKeeps(ownKeeps.value);
      if (impacts.status === 'fulfilled') { setDiscoveryImpacts(impacts.value); writeProfileMemory(user.id, 'impacts', impacts.value); }
    };
    // Mémoire locale : la dernière version connue s'affiche TOUT DE SUITE ; le serveur la remplace ensuite (jamais l'inverse).
    if (user && !accountRequired) {
      const memoryUserId = user.id;
      void Promise.all([
        readProfileMemory<PublicProfileSnapshot>(memoryUserId, 'public'),
        readProfileMemory<OwnProfileSnapshot>(memoryUserId, 'own'),
        readOwnProfileKeepsCache(memoryUserId),
        readProfileMemory<Record<string, DiscoveryImpact>>(memoryUserId, 'impacts'),
      ]).then(([cachedPublic, cachedOwn, cachedKeeps, cachedImpacts]) => {
        if (!live) return;
        if (cachedPublic) setPublicSnapshot((previous) => previous ?? cachedPublic);
        if (cachedOwn) setOwnSnapshot((previous) => previous ?? cachedOwn);
        if (cachedKeeps?.length) setServerOwnKeeps((previous) => (previous.length ? previous : cachedKeeps));
        if (cachedImpacts) setDiscoveryImpacts((previous) => (Object.keys(previous).length ? previous : cachedImpacts));
      }).catch(() => {});
    }
    void refreshCanonicalProfileState();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCanonicalProfileState(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);

  useEffect(() => {
    let live = true;
    const refreshPulse = async () => {
      if (!user || accountRequired) {
        if (live) setLokiPulseItems([]);
        return;
      }
      try {
        const items = await loadLokiPulse(60, user.id);
        if (live) setLokiPulseItems(items);
      } catch {
        // Conserver les dernières bulles valides pendant une panne temporaire.
      }
    };
    void refreshPulse();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshPulse(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);

  useEffect(() => {
    let live = true;
    const checkPulseTaste = async () => {
      if (!user || accountRequired) {
        if (live) setPulseTasteOpen(false);
        return;
      }
      try {
        const state = await loadPulsePreferenceState();
        if (live) setPulseTasteOpen(Boolean(state.shouldPrompt));
      } catch {
        if (live) setPulseTasteOpen(false);
      }
    };
    void checkPulseTaste();
    const unsubscribe = navigation?.addListener?.('focus', () => { void checkPulseTaste(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(lokiPulseGlow, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(lokiPulseGlow, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [lokiPulseGlow]);

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    const refreshCredits = async () => {
      try {
        const status = await getDownloadCreditStatus();
        if (!live) return;
        setCreditRemaining(status.remaining);
        setCreditUnlimited(status.unlimited);
      } catch {
        if (!live) return;
        setCreditRemaining(null);
        setCreditUnlimited(false);
      }
      if (!isLocalGuest && !isDemoMode) {
        // Le solde FREE principal ne doit jamais disparaître parce qu'une
        // statistique secondaire (Battle du jour / dépenses du jour) échoue.
        // Chaque source se dégrade indépendamment.
        const [walletStatus, battleStatus, dailyBattleStats, dailySpend] = await Promise.all([
          loadMyFreeWalletStatus().catch(() => null),
          loadMyKeepBattleCreditStatus().catch(() => null),
          loadKeepBattlePlayerStats(user.id).catch(() => null),
          loadFreeSpentToday().catch(() => null),
        ]);
        if (!live) return;
        if (walletStatus) {
          setFreeBalance(walletStatus.balance);
          setFreeSpentToday(walletStatus.spentToday);
          setFreeSpentKeepCount(walletStatus.keepCountToday);
          setFreeMarketplaceSpentToday(walletStatus.marketplaceSpentToday);
          setFreeMarketplacePurchaseCount(walletStatus.marketplacePurchaseCountToday);
          setFreeListenSpentToday(walletStatus.listenSpentToday);
          setFreeListenPaidCountToday(walletStatus.listenPaidCountToday);
          setFreeListenStreak(walletStatus.listenStreak);
          setFreeStreakEarnedToday(walletStatus.streakEarnedToday);
          setFreeDiscoveryEarnedToday(walletStatus.discoveryEarnedToday);
          setFreeRechargeEarnedToday(walletStatus.rechargeEarnedToday);
          setFreeWon(walletStatus.earnedToday);
          setFreeLost(walletStatus.lostToday);
        } else {
          if (battleStatus) setFreeBalance(battleStatus.remainingFree);
          if (dailySpend) {
            setFreeSpentToday(dailySpend.spent ?? 0);
            setFreeSpentKeepCount(dailySpend.keeps ?? 0);
            setFreeMarketplaceSpentToday(dailySpend.marketplaceSpent ?? 0);
            setFreeMarketplacePurchaseCount(dailySpend.marketplacePurchases ?? 0);
          }
          if (dailyBattleStats) {
            setFreeWon(dailyBattleStats.freeWon ?? 0);
            setFreeLost(dailyBattleStats.freeLost ?? 0);
          }
        }
      } else if (live && isDemoMode) {
        // La démo n'a aucun portefeuille serveur. Ne jamais inventer un solde
        // (l'ancien "3 FREE" donnait l'impression que ces crédits existaient).
        setFreeBalance(null);
        setFreeSpentToday(0);
        setFreeSpentKeepCount(0);
        setFreeMarketplaceSpentToday(0);
        setFreeMarketplacePurchaseCount(0);
        setFreeListenSpentToday(0);
        setFreeListenPaidCountToday(0);
        setFreeListenStreak(0);
        setFreeStreakEarnedToday(0);
        setFreeDiscoveryEarnedToday(0);
        setFreeRechargeEarnedToday(0);
        setFreeWon(0);
        setFreeLost(0);
      } else if (live) {
        // L'invité local possède, lui, un vrai quota d'essai suivi par appareil.
        const guestStatus = await getDownloadCreditStatus().catch(() => null);
        if (!live) return;
        setFreeBalance(guestStatus?.remaining ?? null);
        setFreeSpentToday(0);
        setFreeSpentKeepCount(0);
        setFreeMarketplaceSpentToday(0);
        setFreeMarketplacePurchaseCount(0);
        setFreeListenSpentToday(0);
        setFreeListenPaidCountToday(0);
        setFreeListenStreak(0);
        setFreeStreakEarnedToday(0);
        setFreeDiscoveryEarnedToday(0);
        setFreeRechargeEarnedToday(0);
        setFreeWon(0);
        setFreeLost(0);
      }
      try {
        const rules = await getCommercialRules();
        if (!live) return;
        setFreeCostPerKeep(rules.freeCostPerKeep);
      } catch {
        // Le libellé retombe sur la valeur par défaut ; jamais bloquant.
      }
    };
    void refreshCredits();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCredits(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, isDemoMode, isLocalGuest, navigation, sessions.length, user?.id]);

  useEffect(() => {
    const refresh = () => { void refreshPlaylists().catch(() => {}); };
    refresh();
    const unsubscribe = navigation?.addListener?.('focus', refresh);
    return () => unsubscribe?.();
  }, [navigation, refreshPlaylists]);

  useEffect(() => {
    if (accountRequired) return undefined;
    const refreshKeeps = () => {
      void syncUnsyncedKeeps().catch(() => {});
      void syncPendingFavoriteImports().catch(() => {});
    };
    refreshKeeps();
    const unsubscribe = navigation?.addListener?.('focus', refreshKeeps);
    return () => unsubscribe?.();
  }, [accountRequired, navigation, syncUnsyncedKeeps, syncPendingFavoriteImports, user?.id]);

  useEffect(() => {
    let live = true;
    const refreshPreferences = async () => {
      try {
        const next = await loadPlaylistPreferences(providerId);
        if (live) setPlaylistPreferences(next);
      } catch {
        // Conserver les préférences déjà chargées pendant une panne transitoire.
      }
    };
    void refreshPreferences();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshPreferences(); });
    return () => { live = false; unsubscribe?.(); };
  }, [navigation, providerId, providerPlaylists.length, smartAlbums.length]);

  useEffect(() => {
    let live = true;
    const refreshSmart = async () => {
      if (accountRequired) { if (live) setSmartAlbums([]); return; }
      try {
        const rows = planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO'
          ? await refreshOwnSmartAlbums()
          : await loadOwnSmartAlbums();
        if (live) setSmartAlbums(rows);
      } catch {
        // Ne jamais effacer les Vibes déjà visibles à cause d'un timeout.
        // Le prochain focus retente silencieusement.
      }
    };
    void refreshSmart();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshSmart(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, planCode, user?.id]);

  // Adel (14/09/2026) : "Vibe, il sert à quoi ... c'est les mêmes musiques"
  // -- sans plateforme connectée ni Vibe déjà générée, l'onglet retombait sur
  // un dossier générique "Mes musiques" qui duplique Musiques, sans jamais
  // expliquer pourquoi. Décision : garder le verrou de formule (Creator Pro/
  // Venue Pro génèrent automatiquement, les autres ont des essais limités),
  // mais l'expliquer clairement -- même accès en lecture seule que le bouton
  // "Tester Vibes Auto" déjà présent sur Mes musiques (getSmartSortAccess).
  useEffect(() => {
    if (accountRequired) { setSmartSortAccess(null); return undefined; }
    let live = true;
    getSmartSortAccess(false).then((v) => live && setSmartSortAccess(v)).catch(() => { if (live) setSmartSortAccess(null); });
    return () => { live = false; };
  }, [accountRequired, smartAlbums.length]);

  useEffect(() => {
    let live = true;
    if (!user || accountRequired) {
      setUnreadCount(0);
      return () => { live = false; };
    }
    const refreshUnread = () => {
      void loadUnreadNotificationCount(user.id)
        .then((count) => { if (live) setUnreadCount(count); })
        .catch(() => { if (live) setUnreadCount(0); });
    };
    refreshUnread();
    const unsubscribeChanges = subscribeToNotificationChanges(user.id, refreshUnread);
    const unsubscribeFocus = navigation?.addListener?.('focus', refreshUnread);
    return () => {
      live = false;
      unsubscribeChanges();
      unsubscribeFocus?.();
    };
  }, [accountRequired, navigation, user?.id]);

  useEffect(() => {
    notificationBellShake.stopAnimation();
    notificationBellShake.setValue(0);
    if (unreadCount <= 0) {
      setNotificationNudgeVisible(false);
      lastNotificationNudgeCount.current = 0;
      return undefined;
    }

    const shake = Animated.loop(Animated.sequence([
      Animated.delay(1200),
      Animated.timing(notificationBellShake, { toValue: -1, duration: 75, useNativeDriver: false }),
      Animated.timing(notificationBellShake, { toValue: 1, duration: 110, useNativeDriver: false }),
      Animated.timing(notificationBellShake, { toValue: -1, duration: 95, useNativeDriver: false }),
      Animated.timing(notificationBellShake, { toValue: 0, duration: 75, useNativeDriver: false }),
      Animated.delay(3800),
    ]));
    shake.start();

    let hideNudge: ReturnType<typeof setTimeout> | null = null;
    if (lastNotificationNudgeCount.current !== unreadCount) {
      lastNotificationNudgeCount.current = unreadCount;
      notificationNudgeReveal.stopAnimation();
      notificationNudgeReveal.setValue(0);
      setNotificationNudgeVisible(true);
      Animated.timing(notificationNudgeReveal, { toValue: 1, duration: 520, useNativeDriver: false }).start();
      hideNudge = setTimeout(() => {
        Animated.timing(notificationNudgeReveal, { toValue: 0, duration: 320, useNativeDriver: false }).start(({ finished }) => {
          if (finished) setNotificationNudgeVisible(false);
        });
      }, 7000);
    }

    return () => {
      shake.stop();
      notificationNudgeReveal.stopAnimation();
      if (hideNudge) clearTimeout(hideNudge);
    };
  }, [notificationBellShake, notificationNudgeReveal, unreadCount]);

  // 29/09/2026 : confirmation de sortie d'un Solo centralisée (gameExitGuard).

  // PHASE 2 FIX (28/09/2026) : Reset tous les modales au montage du composant.
  // Élimine les modales "fantômes" après un refresh ou une navigation.
  // Chaque useEffect run sur 'focus' du screen, garantissant que les modales
  // sont toujours fermeés en arrivant sur ce screen.
  useEffect(() => {
    const resetAllModals = () => {
      setMenuOpen(false);
      setStyleModalOpen(false);
      setKindPickerOpen(false);
      setRepriseListOpen(false);
      setShareOpen(false);
      setQrOpen(false);
      setProfileSwipeOpen(false);
      setNotificationPanelOpen(false);
      setSelectionSwipe(null);
      setSourceQuickUsername('');
      setExpandedMenuItem(null);
    };

    // Reset au montage
    resetAllModals();

    // Reset aussi quand on navigue vers cet écran (focus)
    const unsubscribe = navigation?.addListener?.('focus', resetAllModals);
    return () => unsubscribe?.();
  }, [navigation]);

  const keptTracks = useMemo(() => {
    const unique = new Map<string, (typeof sessions)[number]['tracks'][number]>();
    const all = sessions.flatMap((session) => session.tracks.filter((entry) => entry.status === 'kept'));
    for (const entry of all) {
      const title = entry.track.title.trim().toLowerCase().replace(/\s+/g, ' ');
      const artist = entry.track.artist.trim().toLowerCase().replace(/\s+/g, ' ');
      const identity = entry.track.isrc?.trim().toUpperCase() || `${title}|${artist}`;
      const current = unique.get(identity);
      if (!current || new Date(entry.detectedAt).getTime() >= new Date(current.detectedAt).getTime()) unique.set(identity, entry);
    }
    return Array.from(unique.values()).sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [sessions]);
  useEffect(() => {
    let live = true;
    if (accountRequired || isDemoMode || isLocalGuest) return undefined;
    void loadMyOfferedTrackIds().then((map) => { if (live) setOfferedTrackIds(map); }).catch(() => {});
    return () => { live = false; };
  }, [accountRequired, isDemoMode, isLocalGuest, serverOwnKeeps.length]);
  const canonicalOwnKeeps = useMemo(() => serverOwnKeeps.map((entry) => ({
    id: entry.decisionId,
    track: entry.track,
    status: 'kept' as const,
    visibility: entry.visibility,
    detectedAt: entry.keptAt,
    creditSource: entry.creditSource,
    sourceProfileId: entry.sourceProfileId,
    sourceUsername: entry.sourceUsername,
    sourceCertificationTier: entry.sourceCertificationTier,
    sourceIsFollowing: entry.sourceIsFollowing,
    sourceAvatarUrl: entry.sourceAvatarUrl,
  })), [serverOwnKeeps]);
  const profileKeptTracks = accountRequired ? [] : canonicalOwnKeeps;
  // Adel (05/10/2026) : « quand je clique sur Privé, explique POURQUOI : en vente, ou parce que j'ai décidé de la mettre en privé ;
  // et si elle est privée par choix, je veux pouvoir la sortir du privé depuis le profil, sans ouvrir la playlist. »
  const explainFolderVisibility = (folder: { genre: string; entries: Array<{ track: CanonicalTrack; visibility?: string }> }, badgeLabel: string) => {
    if (badgeLabel === 'PUBLIC') {
      Alert.alert('Style public', `Tous les morceaux de ce style sont visibles par les visiteurs du profil de @${user?.username ?? ''}.`, [{ text: 'OK', style: 'cancel' }]);
      return;
    }
    const privateEntries = folder.entries.filter((entry) => entry.visibility !== 'PUBLIC');
    const inSale = privateEntries.filter((entry) => Boolean(offeredTrackIds[entry.track.id]));
    const byChoice = privateEntries.filter((entry) => !offeredTrackIds[entry.track.id]);
    const lines: string[] = [];
    if (inSale.length) lines.push(`• ${inSale.length} masqué${inSale.length > 1 ? 's' : ''} automatiquement par le système parce qu’${inSale.length > 1 ? 'ils sont' : 'il est'} EN VENTE. Retire-${inSale.length > 1 ? 'les' : 'le'} de l’offre pour ${inSale.length > 1 ? 'les' : 'le'} remettre au public.`);
    if (byChoice.length) lines.push(`• ${byChoice.length} masqué${byChoice.length > 1 ? 's' : ''} VOLONTAIREMENT par toi (pas en vente) : ni profil ni story ne les montrent ; tu peux ${byChoice.length > 1 ? 'les' : 'le'} remettre en public ici.`);
    if (!lines.length) lines.push('Seul toi vois ces morceaux.');
    const visitorsNote = badgeLabel === 'PRIVÉ' ? 'Les visiteurs ne voient aucun morceau de ce style.' : 'Les visiteurs voient uniquement les morceaux publics.';
    const buttons: Array<{ text: string; style?: 'cancel' | 'default'; onPress?: () => void }> = [{ text: 'OK', style: 'cancel' }];
    if (byChoice.length && !isDemoMode && !isLocalGuest) {
      buttons.unshift({
        text: `REPASSER EN PUBLIC (${byChoice.length})`,
        onPress: () => {
          void (async () => {
            try {
              for (const entry of byChoice) await persistOwnTrackVisibility(entry.track, 'PUBLIC');
              const keeps = await loadOwnProfileKeeps();
              setServerOwnKeeps(keeps);
              Alert.alert('Remis en public', `${byChoice.length} morceau${byChoice.length > 1 ? 'x sont' : ' est'} de nouveau visible${byChoice.length > 1 ? 's' : ''} sur ton profil.`, [{ text: 'OK', style: 'cancel' }]);
            } catch {
              Alert.alert('Action impossible', 'La visibilité n’a pas pu être modifiée. Réessaie dans un instant.', [{ text: 'OK', style: 'cancel' }]);
            }
          })();
        },
      });
    }
    Alert.alert(`Style ${badgeLabel === 'PRIVÉ' ? 'privé' : 'mixte'} · ${folder.genre}`, `${lines.join('\n')}\n\n${visitorsNote}`, buttons as any);
  };
  // Adel (05/10/2026) : deux privés DIFFÉRENTS -- « en vente » (masquée automatiquement par le système) et « masquée volontairement »
  // (je veux la garder pour moi : ni profil, ni story, rien). Au clic, l'utilisateur doit toujours comprendre laquelle des deux.
  const explainTrackVisibility = (track: CanonicalTrack) => {
    const offer = offeredTrackIds[track.id] as { playlistName?: string } | undefined;
    if (offer) {
      Alert.alert(
        'Musique EN VENTE',
        `« ${track.title} » est masquée automatiquement parce qu’elle est en vente${offer.playlistName ? ` dans « ${offer.playlistName} »` : ''}.\n\nLes visiteurs n’en voient ni le titre ni la jaquette ; sa place dans ta story reste masquée et mène à ta boutique.\n\nPour la remettre au public, retire-la de l’offre.`,
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    const buttons: Array<{ text: string; style?: 'cancel' | 'default'; onPress?: () => void }> = [{ text: 'OK', style: 'cancel' }];
    if (!isDemoMode && !isLocalGuest) {
      buttons.unshift({
        text: 'REPASSER EN PUBLIC',
        onPress: () => {
          void (async () => {
            try {
              await persistOwnTrackVisibility(track, 'PUBLIC');
              setServerOwnKeeps(await loadOwnProfileKeeps());
              Alert.alert('Remise en public', `« ${track.title} » est visible sur ton profil et entre dans ta story pour 24 h.`, [{ text: 'OK', style: 'cancel' }]);
            } catch {
              Alert.alert('Action impossible', 'La visibilité n’a pas pu être modifiée. Réessaie dans un instant.', [{ text: 'OK', style: 'cancel' }]);
            }
          })();
        },
      });
    }
    Alert.alert(
      'Musique masquée volontairement',
      `Tu as choisi de garder « ${track.title} » en privé, et elle n’est pas en vente.\n\nElle reste uniquement pour toi : ni les visiteurs, ni tes abonnés, ni ta story ne la voient jamais.\n\nSi tu la repasses en public, elle entrera automatiquement dans ta story pour 24 h.`,
      buttons as any,
    );
  };
  const ownTrackIdentityKeys = useMemo(() => new Set(profileKeptTracks.map((entry) => {
    const title = entry.track.title.trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
    const artist = entry.track.artist.trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
    return entry.track.isrc?.trim().toUpperCase() || `${title}|${artist}`;
  })), [profileKeptTracks]);
  const visibleLokiPulseItems = useMemo(() => lokiPulseItems.filter((item) => {
    const title = item.track.title.trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
    const artist = item.track.artist.trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
    const identity = item.track.isrc?.trim().toUpperCase() || `${title}|${artist}`;
    return !ownTrackIdentityKeys.has(identity);
  }), [lokiPulseItems, ownTrackIdentityKeys]);
  const publicKeptTracks = useMemo(() => profileKeptTracks.filter((entry) => entry.visibility === 'PUBLIC'), [profileKeptTracks]);
  // DESIGN_SYSTEM v3 (21/09/2026) : "État privé (opacité réduite + icône
  // cadenas)" -- avant, l'onglet Musiques n'affichait QUE les morceaux
  // publics, les privés étaient invisibles même pour leur propriétaire. Ici,
  // c'est TON profil : tes morceaux privés doivent rester visibles pour toi,
  // juste signalés comme tels (grisés + 🔒), jamais masqués.
  const privateKeptTracks = useMemo(() => profileKeptTracks.filter((entry) => entry.visibility === 'PRIVATE'), [profileKeptTracks]);
  const localPublicOwnKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource !== 'SOCIAL' && !entry.sourceProfileId && !entry.sourceUsername).length, [publicKeptTracks]);
  const localDiscoveryImpactCount = useMemo(() => {
    if (!user?.id) return 0;
    return Object.values(discoveryImpacts).reduce((total, impact) => total + (impact.originProfileId === user.id ? impact.recoveryCount : 0), 0);
  }, [discoveryImpacts, user?.id]);
  const publicSwipeTracks = useMemo<CanonicalTrack[]>(() => publicKeptTracks.map((entry) => entry.track), [publicKeptTracks]);
  const publicTrackIds = useMemo(() => new Set(publicKeptTracks.map((entry) => entry.track.id)), [publicKeptTracks]);
  const sourceByTrack = useMemo(() => {
    const mapping: Record<string, { profileId?: string; username?: string; avatarUrl?: string | null }> = {};
    publicKeptTracks.forEach((entry) => {
      if (entry.sourceProfileId || entry.sourceUsername) {
        mapping[entry.track.id] = {
          profileId: entry.sourceProfileId,
          username: entry.sourceUsername,
          avatarUrl: entry.sourceAvatarUrl,
        };
      }
    });
    return mapping;
  }, [publicKeptTracks]);

  useEffect(() => {
    if (visibleLokiPulseItems.length < 2 || lokiPulseSwipeOpen) return undefined;
    const timer = setInterval(() => {
      lokiPulseAutoIndex.current = (lokiPulseAutoIndex.current + 1) % visibleLokiPulseItems.length;
      lokiPulseScrollRef.current?.scrollTo({ x: lokiPulseAutoIndex.current * 88, animated: true });
    }, 3600);
    return () => clearInterval(timer);
  }, [lokiPulseSwipeOpen, visibleLokiPulseItems.length]);

  useEffect(() => {
    // Prépare silencieusement les premiers extraits Loki Pulse : quand une
    // petite bulle est touchée, le Swipe peut jouer sans attendre une seconde
    // résolution réseau.
    let live = true;
    const warm = async () => {
      for (const item of visibleLokiPulseItems.slice(0, 4)) {
        if (!live) return;
        try {
          const url = item.track.previewUrl?.trim() || await resolveTrackPreviewUrl(item.track);
          if (url) await preloadTrackPreview(url);
        } catch {}
      }
    };
    void warm();
    return () => { live = false; };
  }, [visibleLokiPulseItems.map((item) => item.track.id).join('|')]);

  const refreshProfileAfterPulseKeep = async () => {
    if (accountRequired) return;
    const [keeps, credit] = await Promise.all([
      loadOwnProfileKeeps().catch(() => null),
      getDownloadCreditStatus().catch(() => null),
    ]);
    if (keeps) setServerOwnKeeps(keeps);
    if (credit) {
      setCreditRemaining(credit.remaining);
      setCreditUnlimited(credit.unlimited);
    }
    const [battleStatus, dailyBattleStats, dailySpend] = await Promise.all([
      loadMyKeepBattleCreditStatus().catch(() => null),
      user?.id ? loadKeepBattlePlayerStats(user.id).catch(() => null) : Promise.resolve(null),
      loadFreeSpentToday().catch(() => null),
    ]);
    if (battleStatus) setFreeBalance(battleStatus.remainingFree);
    if (dailySpend) {
      setFreeSpentToday(dailySpend.spent);
      setFreeSpentKeepCount(dailySpend.keeps);
    }
    if (dailyBattleStats) {
      setFreeWon(dailyBattleStats.freeWon);
      setFreeLost(dailyBattleStats.freeLost);
    }
  };

  const keepFromLokiPulse = async (track: CanonicalTrack, visibility: 'PUBLIC' | 'PRIVATE') => {
    const { ok } = await keepLokiPulseTrack(track, visibility, freeCostPerKeep);
    if (!ok) return false;
    setLokiPulseItems((items) => items.filter((item) => item.track.id !== track.id));
    await refreshProfileAfterPulseKeep();
    return true;
  };

  const hideFromLokiPulse = async (track: CanonicalTrack) => {
    await hideLokiPulseTrack(track.id).catch(() => {});
    setLokiPulseItems((items) => items.filter((item) => item.track.id !== track.id));
    return true;
  };
  const dna = useMemo(() => {
    // Le DNA personnel doit refléter toute la musique gardée par son propriétaire,
    // y compris les morceaux privés. La visibilité sert au partage public, pas à
    // effacer les goûts de l'utilisateur de son propre profil.
    const decisions: DnaSourceDecision[] = profileKeptTracks.map((entry) => ({ artist: entry.track.artist, genres: entry.track.genres ?? [], decision: 'KEPT', createdAt: entry.detectedAt }));
    return computeMusicDNA(decisions);
  }, [profileKeptTracks]);
  // Adel (01/09/2026) : les onglets Artistes/Albums listaient dans l'ordre
  // d'ajout des morceaux gardés (arbitraire côté utilisateur) -- tri
  // alphabétique pour que ce soit vraiment rangé, sans toucher au design.
  // Adel (14/09/2026) : "un système anti doublon qui va détecter le nom de
  // l'artiste automatique" -- ce système existe déjà (packages/music/src/
  // MusicCollectionIdentity.ts, testé), jamais branché nulle part avant : une
  // simple égalité de chaîne aurait affiché "Naps" et "NAPS" (deux sources de
  // reconnaissance différentes) comme deux artistes distincts. Insensible aux
  // accents/majuscules/espaces, regroupe aussi un featuring sous l'artiste
  // principal (jamais un doublon "Artiste" + "Artiste feat. Invité").
  const artists = useMemo(() => groupTracksByArtist(publicKeptTracks.map((entry) => entry.track)).map((group) => ({ key: group.key, label: group.name })).sort((a, b) => a.label.localeCompare(b.label)), [publicKeptTracks]);
  // Adel (14/09/2026) : "il faut qu'il puisse sélectionner par style ...
  // une autre brique" -- même filtre gratuit et instantané que côté profil
  // visiteur (PublicUserProfileScreen), ajouté SANS toucher à la liste
  // Musiques existante : un style ouvre juste un Swipe limité à ces
  // morceaux, via le même mécanisme que le SWIPE par artiste/Vibe déjà là.
  const trackGenreOptions = useMemo(() => {
    const map = new Map<string, { genre: string; trackIds: Set<string> }>();
    for (const entry of profileKeptTracks) {
      const genres = (entry.track.genres ?? []).map((genre) => genre.trim()).filter(Boolean);
      const labels = genres.length ? genres : ['Sans genre'];
      for (const genre of labels) {
        const key = genre.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
        const current = map.get(key) ?? { genre, trackIds: new Set<string>() };
        current.trackIds.add(entry.track.id);
        map.set(key, current);
      }
    }
    return Array.from(map.values())
      .map(({ genre, trackIds }) => ({ genre, count: trackIds.size }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [profileKeptTracks]);
  // Mission C (23/09/2026) : mêmes morceaux, rangés en dossiers par genre pour
  // la vue "Par genre" de l'onglet Musiques. On regroupe TOUTE la collection
  // du propriétaire (publics + privés, comme la liste plate) ; un morceau
  // multi-genres apparaît dans chaque dossier concerné, les morceaux sans
  // genre tombent dans "Sans genre". Aucune donnée retirée, juste une autre
  // présentation des mêmes entrées que renderCompactTrack sait déjà afficher.
  const genreFolders = useMemo(() => {
    type FolderEntry = (typeof profileKeptTracks)[number];
    const map = new Map<string, { label: string; entries: FolderEntry[] }>();
    const push = (rawGenre: string, entry: FolderEntry) => {
      const clean = rawGenre.trim() || 'Sans genre';
      const key = clean.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
      const current = map.get(key) ?? { label: clean, entries: [] };
      if (!current.entries.some((row) => row.id === entry.id)) current.entries.push(entry);
      map.set(key, current);
    };
    for (const entry of profileKeptTracks) {
      const genres = (entry.track.genres ?? []).map((g) => g.trim()).filter(Boolean);
      if (genres.length) genres.forEach((g) => push(g, entry));
      else push('Sans genre', entry);
    }
    return Array.from(map.values())
      .sort((a, b) => b.entries.length - a.entries.length || a.label.localeCompare(b.label))
      .map(({ label, entries }) => ({ genre: label, entries }));
  }, [profileKeptTracks]);

  // Source unique anti-régression : ces bulles ne dépendent jamais d'un
  // accordéon DNA ni d'un feature flag. Elles fusionnent goûts persistés,
  // apprentissage réel et genres présents dans la collection.
  const profileStyleBubbles = useMemo(() => buildMusicStyleBubbles([
    user?.favoriteGenres,
    dna.topGenres.map((row) => row.genre),
    trackGenreOptions.map((row) => row.genre),
  ], 40), [dna.topGenres, trackGenreOptions, user?.favoriteGenres]);

  const styleCoveragePercent = useMemo(() => {
    if (!profileKeptTracks.length) return 0;
    const tagged = profileKeptTracks.filter((entry) =>
      (entry.track.genres ?? []).some((genre) => String(genre || '').trim())
    ).length;
    return Math.max(0, Math.min(100, Math.round((tagged / profileKeptTracks.length) * 100)));
  }, [profileKeptTracks]);


  // Adel (14/09/2026, audit) : "est-ce que le système fait la différence du
  // style musical ?" -- la détection de genre existait déjà mais restait
  // réservée à Creator Pro/Venue Pro (Vibes Auto) et n'était jamais
  // partagée. Ici, en tâche de fond, pour TOUS les plans (jamais bloquant,
  // jamais visible si ça échoue) : les morceaux encore sans genre de CE
  // profil sont enrichis et partagés avec toute l'app -- plafonné pour ne
  // jamais spammer le catalogue gratuit à chaque ouverture d'écran.
  useEffect(() => {
    if (accountRequired) return undefined;
    const missing = profileKeptTracks.map((entry) => entry.track).filter((t) => !t.genres || t.genres.length === 0).slice(0, 15).map((t) => ({ id: t.id, title: t.title, artist: t.artist, genres: [] as string[] }));
    if (!missing.length) return undefined;
    let live = true;
    enrichMissingGenres(missing).then((enriched) => { if (live) void persistEnrichedGenres(enriched); }).catch(() => {});
    return () => { live = false; };
  }, [accountRequired, profileKeptTracks]);
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = smartAlbums.map(smartAlbumAsProviderPlaylist);
    if (providerPlaylists.length) result.push(...providerPlaylists);
    if (!result.length && publicKeptTracks.length) {
      const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);
      result.push({ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference?.name || 'Mes musiques', description: localPreference?.description || 'Morceaux publics gardés avec Loki Music', trackCount: publicKeptTracks.length, isKeepManaged: true });
    }
    return result;
  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length, smartAlbums]);

  if (!user) return <SafeAreaView style={s.container}><PersonalThemeBackdrop /><View style={s.center}><Text style={s.demoTitle}>Profil Loki Music</Text><Text style={s.muted}>Aucun compte actif.</Text><TouchableOpacity style={s.primary} onPress={enterDemoMode}><Text style={s.primaryText}>ENTRER EN MODE DÉMO</Text></TouchableOpacity></View>
</SafeAreaView>;

  const publicLinks = user.socialLinks.filter((link) => link.visibility === 'PUBLIC');
  const websiteLink = publicLinks.find((link) => link.platform === 'website' && link.url.trim());
  const openWebsite = async () => {
    if (!websiteLink) return;
    let url = websiteLink.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce site pour le moment.'); }
  };
  const publicProfileLink = affiliatedProfileLink || buildPublicProfileLink(user.username);
  // Une seule source de vérité pour le nombre de styles du profil :
  // les dossiers réellement construits à partir des morceaux. Les goûts
  // déclaratifs (favoriteGenres) restent utiles à l'identité, mais ne doivent
  // jamais faire croire qu'il n'existe que 3/4 styles quand la bibliothèque en contient plus.
  const identityGenres = trackGenreOptions.map((g) => g.genre);
  const identityGenrePreview = identityGenres.slice(0, 4);
  const creditsExhausted = !creditUnlimited && creditRemaining === 0;
  // Adel (04/09/2026) : "le nombre de Free disponibles pour tout le monde
  // sur le profil" -- affiché quel que soit le plan désormais (avant : les
  // plans payants masquaient le compteur derrière leur nom commercial,
  // laissé "illimité" côté crédits de téléchargement uniquement).
  const planLabel = isDemoMode ? 'DÉMO · ?' : freeBalance != null ? `${freeBalance} FREE` : planCode;
  // Adel (07/09/2026) : "mettre le nombre de jours restants pour savoir dans
  // combien de jours il sera recrédité" -- le Free du mois est versé le 1er
  // de chaque mois pour le mois qui vient de se terminer (jamais en cours de
  // mois), donc toujours au moins un jour d'attente le 1er lui-même.
  const daysUntilNextFreeCredit = (() => {
    const now = new Date();
    const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.max(1, Math.ceil((nextFirst.getTime() - now.getTime()) / 86400000));
  })();
  const profileOwnKeepCount = ownSnapshot?.directKeeps ?? localPublicOwnKeepCount;
  const profileUserKeepCount = ownSnapshot?.socialKeeps ?? localDiscoveryImpactCount;
  const profileTotalKeepCount = ownSnapshot?.totalKeeps ?? profileKeptTracks.length;
  const profileFollowerCount = publicSnapshot?.followers ?? user.followerCount;
  const profileFollowingCount = publicSnapshot?.following ?? user.followingCount;
  // Adel (13/09/2026, viralité) : "il faut qu'ils comprennent qu'ils vont
  // gagner une communauté" -- les paliers d'abonnés existaient déjà côté
  // serveur (Free bonus à 25/100/250/500, Audience Pro à 1000) mais restaient
  // invisibles : rien n'annonçait le prochain palier avant qu'il soit atteint.
  // Chargé uniquement sur son propre profil réel (accountRequired = invité/
  // démo, pas de vraie communauté à afficher), rafraîchi quand le nombre
  // d'abonnés change.
  useEffect(() => {
    if (accountRequired) { setGrowthStatus(null); return undefined; }
    let live = true;
    getGrowthRewardStatus().then((v) => live && setGrowthStatus(v)).catch(() => { if (live) setGrowthStatus(null); });
    return () => { live = false; };
  }, [accountRequired, profileFollowerCount]);

  useEffect(() => {
    if (!marketplaceEnabled || !user || accountRequired) { setPlaylistSaleOffers([]); return undefined; }
    let live = true;
    const refreshOwnSaleOffers = () => {
      loadMyPlaylistSaleOffers()
        .then((rows) => { if (live) setPlaylistSaleOffers(rows); })
        .catch(() => { if (live) setPlaylistSaleOffers([]); });
    };
    refreshOwnSaleOffers();
    const unsubscribe = navigation?.addListener?.('focus', refreshOwnSaleOffers);
    return () => { live = false; unsubscribe?.(); };
  }, [marketplaceEnabled, user?.id, accountRequired, navigation]);

  const fallbackCertification: ProfileCertificationTier = accountRequired
    ? 'UNVERIFIED'
    : planCode === 'PREMIUM' || planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO' ? planCode : 'FREE';
  const certificationTier = publicSnapshot?.certificationTier ?? fallbackCertification;
  // Adel (07/09/2026) : "pourquoi les Free sont pas de la même couleur que la
  // certif" -- le badge de solde Free était toujours vert/rouge, alors que le
  // badge de certification a une couleur par formule (bleu Premium, violet
  // Créateur Pro, or Lieu Pro). Le badge Free reprend maintenant la couleur
  // de la certification ; seul le solde à 0 garde le rouge d'alerte, quelle
  // que soit la formule.
  const certificationColors = CERTIFICATION_META[certificationTier] ?? CERTIFICATION_META.UNVERIFIED;
  const canChangeProfileKind = planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO';
  const kindChoices: { key: ProfileKind; label: string }[] = planCode === 'VENUE_PRO'
    ? [{ key: 'USER', label: 'Fan' }, { key: 'VENUE', label: 'Lieu' }]
    : [{ key: 'USER', label: 'Fan' }, { key: 'CREATOR', label: 'Créateur' }, { key: 'DJ', label: 'DJ' }, { key: 'ARTIST', label: 'Artiste' }, { key: 'PRODUCER', label: 'Producteur' }];
  const changeKind = async (kind: ProfileKind) => {
    if (!supabase || !user || kind === user.kind || kindChangeBusy) return;
    setKindChangeBusy(true);
    try {
      const next = { ...user, kind };
      await createProfileService(supabase).saveOwnProfile(next);
      setUser(next);
      setKindPickerOpen(false);
    } catch (e: any) {
      Alert.alert('Type de profil', e?.message || 'Impossible de modifier le type de profil pour le moment.');
    } finally {
      setKindChangeBusy(false);
    }
  };
  const planStyle = freeBalance === 0
    ? s.planExhausted
    : { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring };

  // 29/09/2026 : une seule fenêtre de compte dans toute l'appli
  // (AccountGateModal, montée dans App.tsx) ; l'ancienne copie locale de ce
  // profil (bouton « continuer en démo ») faisait doublon.
  const openAccount = (mode: AccountMode = 'create', followUsername = '') => {
    setShareOpen(false);
    useAccountGateStore.getState().requestAccount(mode, followUsername);
  };

  const openShare = () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(true);
  };

  const openProfileSwipe = () => {
    if (!publicSwipeTracks.length) {
      Alert.alert('Loki Music Swipe', 'Aucun morceau public pour le moment. Rends au moins un morceau visible sur ton profil pour prévisualiser ton Swipe.');
      return;
    }
    // Ce tap est le dernier geste utilisateur synchrone avant la résolution
    // asynchrone de l'extrait. Il déverrouille l'élément audio web partagé afin
    // que la première carte puisse réellement démarrer seule sur Safari/iOS.
    unlockWebAudioForGesture();
    // Adel (05/10/2026) : « sur TestFlight, quand j'appuie sur Aperçu la musique ne part pas assez vite ». L'extrait du premier morceau
    // se résout et se précharge dès le tap, pendant l'animation d'ouverture du lecteur (le lecteur reprend le même extrait déjà prêt).
    const first = publicSwipeTracks[0];
    if (first) {
      void (async () => {
        try {
          const url = first.previewUrl?.trim() || await resolveTrackPreviewUrl(first);
          if (url) await preloadTrackPreview(url);
        } catch {}
      })();
    }
    setProfileSwipeOpen(true);
  };

  const switchProfileTab = (tab: ProfileTab) => {
    if (tab === activeTab) return;
    setExpandedPlaylistId(null);
    setLoadingPlaylistId(null);
    setSelectionSwipe(null);
    setActiveTab(tab);
  };

  const openSourceProfile = (sourceUsername: string) => {
    setSourceQuickUsername(sourceUsername.replace(/^@+/, ''));
  };

  const openSocial = async (platform: SocialPlatform) => {
    const link = publicLinks.find((item) => item.platform === platform && item.url.trim());
    if (!link) {
      Alert.alert('Réseau non renseigné', 'Ajoute ce réseau depuis les réglages avancés.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Ajouter le lien', onPress: () => { setMenuOpen(true); setExpandedMenuItem('publicProfile'); } },
      ]);
      return;
    }
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau pour le moment.'); }
  };

  const shareNative = async () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(false);
    try { await shareProfile(user.username); }
    catch { Alert.alert('Partage', 'Impossible d’ouvrir le partage pour le moment.'); }
  };

  const shareEmail = async () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(false);
    try { await shareProfileByEmail(user.username); }
    catch { Alert.alert('E-mail', 'Aucune application e-mail n’est disponible sur cet appareil.'); }
  };

  const copyShare = async () => {
    if (accountRequired) return openAccount('create');
    try {
      const copied = await copyProfileShareText(user.username);
      Alert.alert(copied ? 'Lien Loki Music copié' : 'Partage prêt', copied
        ? 'Le message contient ton profil et ton lien d’invitation. Tu peux le coller où tu veux.'
        : 'Choisis « Copier » dans la feuille de partage.');
    } catch {
      Alert.alert('Partage', 'Impossible de copier le lien pour le moment.');
    }
  };

  const showQr = () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(false);
    setQrOpen(true);
  };

  const loadPlaylistTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {
    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {
      const localTracks = publicKeptTracks.map((entry) => entry.track);
      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));
      return localTracks;
    }
    if (playlistTracks[playlist.id]) return playlistTracks[playlist.id];
    setLoadingPlaylistId(playlist.id);
    try {
      if (isSmartAlbumUiId(playlist.id)) {
        const tracks = await loadSmartAlbumTracks(playlist.id);
        setPlaylistTracks((current) => ({ ...current, [playlist.id]: tracks }));
        return tracks;
      }
      const session = await musicEngine.getSession();
      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
      const visibleTracks = musicEngine.usesDemoMusicProvider ? tracks.filter((track) => publicTrackIds.has(track.id)) : tracks;
      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));
      return visibleTracks;
    } catch {
      Alert.alert('Vibe Loki Music', 'Impossible de charger les morceaux de cette collection pour le moment.');
      return [];
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  const togglePlaylist = async (playlist: ProviderPlaylist) => {
    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }
    setExpandedPlaylistId(playlist.id);
    await loadPlaylistTracks(playlist);
  };

  const openPlaylistSwipe = async (playlist: ProviderPlaylist) => {
    const tracks = await loadPlaylistTracks(playlist);
    if (!tracks.length) return Alert.alert('Vibe Loki Music', 'Cette collection ne contient pas encore de morceau à swiper.');
    openSelectionSwipe({ title: playlist.name, subtitle: 'Ta sélection, morceau après morceau.', tracks });
  };

  // DESIGN_SYSTEM v3 (21/09/2026) : "1er KEEP" -- badge visible uniquement
  // quand ce profil est bien l'origine réelle de la découverte (originKind
  // SELF) ET qu'un impact réel existe côté Supabase (discoveryImpacts,
  // recoveryCount > 0). Le compteur "N KEEPs" = recoveryCount + 1 (les
  // reprises + le KEEP d'origine) : jamais un chiffre inventé, absent si
  // aucune donnée d'impact n'existe pour ce morceau.
  const daysAgo = (iso?: string | null) => { if (!iso) return null; return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); };
  const renderCompactTrack = (track: CanonicalTrack, key: string, sourceUsername?: string | null, originKind?: 'SELF' | 'SOCIAL' | null, sourceTier?: ProfileCertificationTier, sourceIsFollowing?: boolean, detectedAt?: string, isPrivate = false) => {
    const sourceColors = sourceTier ? (CERTIFICATION_META[sourceTier] ?? CERTIFICATION_META.UNVERIFIED) : null;
    // Adel (08/09/2026) : "si l'utilisateur est abonné à celui qui a
    // découvert la musique, on met vert, si il est pas abonné, tu le mets
    // rouge ... incité à cliquer dessus" -- le contour (jamais le fond, qui
    // reste la couleur de certification) porte ce second signal pour ne
    // rien casser du code couleur déjà établi.
    const followBorder = sourceIsFollowing === false ? colors.danger : sourceIsFollowing === true ? colors.success : undefined;
    const impact = originKind === 'SELF' ? discoveryImpacts[track.id] : null;
    const isFirstKeep = !!impact && impact.recoveryCount > 0;
    const expanded = expandedTrackKeys.has(key);
    const hasDetails = isFirstKeep || !!originKind;
    // Adel (21/09/2026, maquette interactive validée :
    // https://claude.ai/artifact/9X4dx8oMmCJ3hkRGndc7BW) : grille à
    // colonnes fixes, seule source de vérité TrackActionRow. Pas de
    // "Garder" ici (bibliothèque du propriétaire -- déjà à lui par
    // définition), un seul carré après Play : Partager.
    return (
      <TrackActionRow
        key={key}
        coverUrl={track.artworkUrl}
        coverFallbackText="K"
        title={track.title}
        artist={track.artist}
        dimmed={isPrivate}
        lockIcon={isPrivate}
        onLockPress={isPrivate ? () => explainTrackVisibility(track) : undefined}
        badge={isPrivate ? { label: offeredTrackIds[track.id] ? '🏷 EN VENTE' : '🔒 MASQUÉE', onPress: () => explainTrackVisibility(track) } : undefined}
        playSlot={<TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} square />}
        actions={[{
          key: 'share',
          icon: '↗',
          onPress: () => void shareProfileTrack(user.username, track.title, track.artist),
          accessibilityLabel: 'Partager ce morceau',
        }]}
        expandable={hasDetails}
        expanded={expanded}
        onToggleExpand={() => toggleTrackExpanded(key)}
      >
        {isFirstKeep ? (
          <View style={s.firstKeepBlock}>
            <View style={s.firstKeepRow}><View style={s.firstKeepBadge}><Text style={s.firstKeepBadgeText}>🥇 1er Gardé</Text></View><Text style={s.firstKeepCount}>{impact!.recoveryCount + 1} gardés</Text></View>
            <Text style={s.firstKeepLine}>@{user.username} a été le premier à garder ce son{daysAgo(detectedAt) != null ? ` · il y a ${daysAgo(detectedAt)}j` : ''}</Text>
          </View>
        ) : null}
        <View style={s.trackMetaRow}>
          {originKind ? <View style={s.discoveryOriginRow}>
            <Text style={s.originLabel}>Découvert par</Text>
            {originKind === 'SELF' ? <View style={[s.originUserLink, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}><Text style={[s.originUserText, { color: certificationColors.ring }]}>{user.username}</Text></View> : sourceUsername ? (
              <TouchableOpacity style={[s.originUserLink, sourceColors ? { backgroundColor: `${sourceColors.colors[sourceColors.colors.length - 1]}33`, borderColor: sourceColors.ring } : null, followBorder ? { borderColor: followBorder, borderWidth: 2 } : null]} onPress={() => openSourceProfile(sourceUsername)} accessibilityLabel={`Ouvrir le profil du découvreur ${sourceUsername}${sourceIsFollowing === false ? ', non suivi' : ''}`}>
                <Text style={[s.originUserText, sourceColors ? { color: sourceColors.ring } : null]}>{sourceUsername}</Text>
              </TouchableOpacity>
            ) : <Text style={s.originProtected}>découvreur d’origine protégé</Text>}
          </View> : null}
        </View>
      </TrackActionRow>
    );
  };

  const tabContent = () => {
    if (activeTab === 'TRACKS') {
      if (!publicKeptTracks.length && !privateKeptTracks.length) return (
        <View style={s.ownerEmptyUniverse}>
          <Text style={s.ownerEmptyKicker}>TON UNIVERS COMMENCE ICI</Text>
          <Text style={s.ownerEmptyTitle}>Garde ta première découverte.</Text>
          <Text style={s.ownerEmptyText}>Chaque Garder construit automatiquement tes styles. Tu choisiras Public ou Privé avant chaque ajout.</Text>
          <MotionActionButton
            onPress={() => navigation.navigate('Main', { screen: 'Listen' })}
            accessibilityLabel="Activer le micro pour découvrir une musique"
            variant="primary"
            size="large"
          >
            <Text style={{ color: colors.white, fontWeight: '900', fontSize: 14 }}>ACTIVER LE MICRO</Text>
          </MotionActionButton>
        </View>
      );
      return <View style={s.keepList}>
        <View style={s.ownerMusicInfo}>
          <View style={s.ownerMusicInfoHeader}>
            <Text style={s.ownerKeepHintCompact}>Loki Music construit ton univers : Vibes et artistes.</Text>
            <TouchableOpacity
              style={s.ownerMusicInfoToggle}
              onPress={() => setOwnerMusicInfoOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={ownerMusicInfoOpen ? 'Réduire les explications Loki Music' : 'En savoir plus sur Loki Music'}
            >
              <Text style={s.ownerMusicInfoToggleText}>{ownerMusicInfoOpen ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.ownerMusicInfoChevron}>{ownerMusicInfoOpen ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
          </View>
          {ownerMusicInfoOpen ? (
            <Text style={s.ownerMusicInfoText}>Tu gardes le contrôle du Public/Privé, des noms et de l’organisation de tes morceaux. Tes Garder alimentent automatiquement tes styles et ton univers Loki Music.</Text>
          ) : null}
        </View>
        {/* Mission C (23/09/2026) : bascule "Tout / Par genre". "Tout" garde
            la liste plate historique (aucune régression) ; "Par genre" range
            la même collection en dossiers repliables. */}
        <View style={s.groupingToggle}>
          <TouchableOpacity style={[s.groupingChip, tracksGrouping === 'GENRE' && s.groupingChipOn]} onPress={() => setTracksGrouping('GENRE')} accessibilityRole="button" accessibilityState={{ selected: tracksGrouping === 'GENRE' }} accessibilityLabel="Voir mes styles musicaux"><Text style={[s.groupingChipText, tracksGrouping === 'GENRE' && s.groupingChipTextOn]}>Styles</Text></TouchableOpacity>
          <TouchableOpacity style={[s.groupingChip, tracksGrouping === 'ALL' && s.groupingChipOn]} onPress={() => setTracksGrouping('ALL')} accessibilityRole="button" accessibilityState={{ selected: tracksGrouping === 'ALL' }} accessibilityLabel="Voir tous les morceaux"><Text style={[s.groupingChipText, tracksGrouping === 'ALL' && s.groupingChipTextOn]}>Tous les morceaux</Text></TouchableOpacity>
        </View>
        {tracksGrouping === 'GENRE' ? (
          genreFolders.length ? (
            <View style={s.ownerStyleGrid}>
              {genreFolders.map((folder, index) => {
                const publicCount = folder.entries.filter((entry) => entry.visibility === 'PUBLIC').length;
                const privateCount = folder.entries.length - publicCount;
                const artworkUrl = folder.entries.map((entry) => entry.track.artworkUrl).find((value): value is string => Boolean(value));
                const socialSource = folder.entries.find((entry) => 'sourceUsername' in entry && entry.sourceUsername && entry.sourceUsername !== user.username);
                const sourceUsername = socialSource && 'sourceUsername' in socialSource ? socialSource.sourceUsername : null;
                const badgeLabel = privateCount === 0
                  ? 'PUBLIC'
                  : publicCount === 0
                    ? 'PRIVÉ'
                    : `MIXTE · ${privateCount} PRIVÉ${privateCount > 1 ? 'S' : ''}`;
                return (
                  <ProfileStyleCard
                    key={folder.genre}
                    title={folder.genre}
                    subtitle={`${folder.entries.length} morceau${folder.entries.length > 1 ? 'x' : ''} · ${publicCount} public${publicCount > 1 ? 's' : ''}${privateCount ? ` · ${privateCount} privé${privateCount > 1 ? 's' : ''}` : ''}`}
                    mode="PUBLIC"
                    badgeLabel={badgeLabel}
                    onBadgePress={() => explainFolderVisibility(folder, badgeLabel)}
                    badgeAccessibilityLabel={`${badgeLabel}. Appuyer pour comprendre la visibilité de ce style`}
                    actionLabel={sourceUsername ? `Découvert par ${sourceUsername.replace(/^@+/, '')}` : undefined}
                    onActionPress={sourceUsername ? () => openSourceProfile(sourceUsername) : undefined}
                    actionAccessibilityLabel={sourceUsername ? `Voir le profil de ${sourceUsername.replace(/^@+/, '')}, découvreur d’une musique de ce style` : undefined}
                    artworkUrl={artworkUrl}
                    fullWidth={genreFolders.length % 2 === 1 && index === genreFolders.length - 1}
                    onPress={() => openSelectionSwipe({ title: folder.genre, subtitle: `Ton univers ${folder.genre} en Swipe.`, tracks: folder.entries.map((entry) => entry.track) })}
                    accessibilityLabel={`Écouter le style ${folder.genre}, ${folder.entries.length} morceaux en Swipe`}
                  />
                );
              })}
            </View>
          ) : <Text style={s.muted}>Aucun style détecté pour l’instant. Loki Music enrichit tes morceaux en arrière-plan — reviens dans un instant.</Text>
        ) : (
          <>
            {publicKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null, entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId ? 'SOCIAL' : 'SELF', 'sourceCertificationTier' in entry ? entry.sourceCertificationTier : undefined, 'sourceIsFollowing' in entry ? entry.sourceIsFollowing : undefined, entry.detectedAt))}
            {/* Adel (21/09/2026) : "chaque musique est identifiée par un
                utilisateur, c'est l'idée de départ" -- un morceau privé reste
                rattaché à son découvreur comme n'importe quel autre, seule sa
                visibilité change (grisé + 🔒), jamais son attribution. */}
            {privateKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null, entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId ? 'SOCIAL' : 'SELF', 'sourceCertificationTier' in entry ? entry.sourceCertificationTier : undefined, 'sourceIsFollowing' in entry ? entry.sourceIsFollowing : undefined, entry.detectedAt, true))}
          </>
        )}
      </View>;
    }

    if (activeTab === 'PLAYLISTS') {
      // Adel (14/09/2026) : "Vibe, il sert à quoi ... c'est les mêmes
      // musiques" -- sans Vibe générée (smartAlbums vide), la liste retombe
      // sur un dossier générique qui duplique Musiques sans jamais expliquer
      // pourquoi. Verrou de formule volontairement conservé (Creator Pro/
      // Venue Pro génèrent automatiquement, les autres ont des essais
      // limités) -- seule l'explication change, jamais un déblocage silencieux.
      const vibesHint = !accountRequired && smartAlbums.length === 0 ? (
        <View style={s.growthPanel}>
          <Text style={s.growthText}>
            {smartSortAccess?.unlimited
              ? 'Génération automatique de tes Vibes en cours -- reviens dans quelques instants.'
              : smartSortAccess?.allowed
              ? `Pas encore de Vibe automatique par genre. Il te reste ${smartSortAccess.remaining ?? 0} essai${(smartSortAccess.remaining ?? 0) > 1 ? 's' : ''} gratuit${(smartSortAccess.remaining ?? 0) > 1 ? 's' : ''} -- lance "TESTER VIBES AUTO" depuis Mes musiques.`
              : 'Pas encore de Vibe automatique par genre. Le classement automatique est réservé à Creator Pro/Venue Pro, ou à gagner en développant ta communauté.'}
          </Text>
        </View>
      ) : null;
      if (!displayPlaylists.length) return <View>{vibesHint}<Empty text="Tes Vibes apparaîtront ici automatiquement." /></View>;
      // Adel (05/10/2026) : « style c'est parfait, fais pareil pour le reste » -- Playlists et Artistes reprennent EXACTEMENT les cartes premium des Styles
      // (pochette, badge, nombre de morceaux, grille 2 colonnes) ; toucher une carte lance le Swipe.
      return <View>{vibesHint}<View style={s.ownerStyleGrid}>{displayPlaylists.map((playlist, index) => {
        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);
        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);
        const isPublic = preference?.isPublic ?? smart?.isPublic ?? false;
        return <ProfileStyleCard
          key={playlist.id}
          title={playlist.name}
          subtitle={`${playlist.trackCount} ${playlist.trackCount > 1 ? 'morceaux' : 'morceau'}`}
          mode={smart ? 'VIBE' : 'PUBLIC'}
          badgeLabel={isPublic ? 'PUBLIC' : 'PRIVÉ'}
          actionLabel={isPublic ? '↗ Partager' : undefined}
          onActionPress={isPublic ? () => void sharePlaylist(playlist.id, playlist.name) : undefined}
          actionAccessibilityLabel={isPublic ? `Partager la playlist ${playlist.name}` : undefined}
          artworkUrl={playlist.coverUrl}
          fullWidth={displayPlaylists.length % 2 === 1 && index === displayPlaylists.length - 1}
          onPress={() => void openPlaylistSwipe(playlist)}
          accessibilityLabel={`Écouter la playlist ${playlist.name}, ${playlist.trackCount} morceaux en Swipe`}
        />;
      })}</View></View>;
    }

    const items = artists;
    if (!items.length) return <Empty text="Tes artistes apparaîtront ici." />;
    // Adel (01/09/2026) : "range les albums comme sur playlist" -- même bloc
    // encadré, même bouton ▶ SWIPE dédié et même dépli inline des morceaux
    // que l'onglet Vibes, plutôt qu'une simple ligne avec une note générique.
    return <View style={s.ownerStyleGrid}>{items.map((item, index) => {
      const selected = publicSwipeTracks.filter((track) => canonicalArtistIdentity(track) === item.key);
      const artworkUrl = selected.find((track) => track.artworkUrl)?.artworkUrl;
      return <ProfileStyleCard
        key={item.key}
        title={item.label}
        subtitle={`${selected.length} ${selected.length > 1 ? 'morceaux' : 'morceau'}`}
        mode="PUBLIC"
        artworkUrl={artworkUrl}
        fullWidth={items.length % 2 === 1 && index === items.length - 1}
        onPress={() => openSelectionSwipe({ title: item.label, subtitle: 'Tous les morceaux de cet artiste dans ta collection.', tracks: selected })}
        accessibilityLabel={`Écouter ${item.label}, ${selected.length} morceaux en Swipe`}
      />;
    })}</View>;
  };

  // Adel (16-17/09/2026) : "il y a une explication, et il y a ce qu'on doit
  // faire" -- chaque rubrique du menu affiche son explication SUR PLACE.
  // Seul "Mon solde Free" reste entièrement navigable ici (info pure) ;
  // les autres gardent un bouton "Ouvrir" vers leur écran dédié pour toute
  // action réellement complexe (achat, upload, connexion de service).
  const openFromMenu = (screen: string, params?: Record<string, unknown>) => { setMenuOpen(false); setExpandedMenuItem(null); navigation.navigate(screen, params); };
  const directMenuAction = (key: string) => {
    // Règle UX Loki : 1er appui = vraie fonction. Un écran intermédiaire
    // d'explication ne doit jamais être obligatoire avant une destination
    // évidente. Les rubriques multi-choix restent dans le drawer car le
    // premier appui y expose déjà directement les contrôles.
    if (key === 'profile') { openFromMenu('ProfileSettings'); return; }
    if (key === 'identityShare') {
      setMenuOpen(false);
      setExpandedMenuItem(null);
      setQrOpen(true);
      return;
    }
    if (key === 'musicTaste') {
      setMenuOpen(false);
      setExpandedMenuItem(null);
      // iPhone : ouvrir une fenêtre pendant que le menu se ferme la laisse
      // invisible et bloque les touches. On attend la fin de la fermeture.
      if (Platform.OS === 'ios') setTimeout(() => setPulseTasteOpen(true), 450);
      else setPulseTasteOpen(true);
      return;
    }
    if (key === 'chatSettings') {
      setMenuOpen(false);
      setExpandedMenuItem(null);
      useGlobalChatStore.getState().openSettings();
      return;
    }
    if (key === 'music') { openFromMenu('MusicConnections'); return; }
    if (key === 'offers') { openFromMenu('Offers'); return; }
    if (key === 'sellPlaylists') { openFromMenu('PlaylistSale'); return; }
    if (key === 'receipts') { openFromMenu('PlaylistSale', { openPaymentHistory: true }); return; }

    // Réseaux/site, Créateur et Aide comportent plusieurs contrôles distincts :
    // le premier appui les affiche directement dans ce même drawer.
    setExpandedMenuItem(key);
  };
  const renderMenuDetail = (key: string) => {
    if (key === 'free') return <>
      <Text style={s.shareTitle}>Mes FREE</Text>
      <Text style={s.shareSubtitle}>{freeBalance != null ? `${freeBalance} Free disponibles.` : 'Solde indisponible pour le moment.'}</Text>
      {freeBalance === 0 ? (
        <View style={s.freeEmptyCallout}>
          <Text style={s.freeEmptyCalloutTitle}>Solde à zéro : comment recharger ?</Text>
          <Text style={s.freeEmptyCalloutText}>1. Partage ton profil : chaque nouvel abonné qu'il t'apporte te rapporte des Free.</Text>
          <Text style={s.freeEmptyCalloutText}>2. Joue à Loki Music Battle : gagne des Free en répondant juste.</Text>
          <Text style={s.freeEmptyCalloutText}>3. Passe à une formule payante : plus de Free offerts chaque mois, sans attendre.</Text>
          <MotionActionButton variant="primary" size="medium" onPress={() => { setMenuOpen(false); setExpandedMenuItem(null); void shareProfile(user.username); }} accessibilityLabel="Partager"><Text style={s.shareActionPrimaryText}>PARTAGER MON PROFIL</Text></MotionActionButton>
        </View>
      ) : null}
      <View style={s.linkPreview}>
        <Text style={s.linkPreviewText}>🎧 Écouter : quota inclus selon ta formule, puis 1 FREE par morceau reconnu</Text>
        <Text style={s.linkPreviewText}>💾 Garder un morceau sur ton profil : -{freeCostPerKeep} Free</Text>
        <Text style={s.linkPreviewText}>🎮 Battle solo (entraînement) : gratuit</Text>
        <Text style={s.linkPreviewText}>⚡ Battle en ligne : mise de Free au départ</Text>
        <Text style={s.linkPreviewText}>🏆 FREE gagnés aujourd’hui (depuis 02:00) : +{freeWon}</Text>
        <Text style={s.linkPreviewText}>💔 FREE perdus aujourd’hui (depuis 02:00) : -{freeLost}</Text>
        <Text style={s.linkPreviewText}>📅 Free offerts chaque mois selon ta formule — prochain versement dans {daysUntilNextFreeCredit} jour{daysUntilNextFreeCredit > 1 ? 's' : ''} (le 1er du mois)</Text>
      </View>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('Offers')} accessibilityLabel="Voir les offres"><Text style={s.shareActionPrimaryText}>VOIR LES OFFRES</Text></MotionActionButton>
    </>;

    if (key === 'profile') return <>
      <Text style={s.shareTitle}>Réglages du profil</Text>
      <Text style={s.shareSubtitle}>@{user.username} · modifie ta photo, ta bio, ton pseudo et tes informations de profil.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('ProfileSettings')} accessibilityLabel="Settings"><Text style={s.shareActionPrimaryText}>OUVRIR LES REGLAGES</Text></MotionActionButton>
    </>;

    if (key === 'identityShare') return <>
      <Text style={s.shareTitle}>Carte & partage</Text>
      <Text style={s.shareSubtitle}>Retrouve au même endroit ton QR, ton lien public et le partage de ton profil.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => { setMenuOpen(false); setExpandedMenuItem(null); setQrOpen(true); }} accessibilityLabel="Afficher ma carte et mon QR"><Text style={s.shareActionPrimaryText}>MA CARTE & MON QR</Text></MotionActionButton>
      <MotionActionButton variant="secondary" size="medium" onPress={() => { setMenuOpen(false); setExpandedMenuItem(null); openShare(); }} accessibilityLabel="Partager mon profil"><Text style={s.shareActionText}>PARTAGER MON PROFIL</Text></MotionActionButton>
      <MotionActionButton variant="ghost" size="small" onPress={() => void copyShare()} accessibilityLabel="Copier mon lien"><Text style={s.shareActionText}>Copier mon lien</Text></MotionActionButton>
    </>;

    if (key === 'notifications') return <>
      <Text style={s.shareTitle}>Notifications</Text>
      <Text style={s.shareSubtitle}>{unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}.` : 'Tu es à jour, aucune notification en attente.'} Nouveaux abonnés, reprises de tes découvertes, réponses à tes soirées : tout arrive ici.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('Notifications')} accessibilityLabel="Notifications"><Text style={s.shareActionPrimaryText}>VOIR MES NOTIFICATIONS</Text></MotionActionButton>
    </>;

    if (key === 'music') return <>
      <Text style={s.shareTitle}>Services musicaux</Text>
      <Text style={s.shareSubtitle}>Connecte Spotify, Deezer, YouTube Music ou SoundCloud pour importer tes favoris et garder ta musique automatiquement. Le nombre de services actifs en même temps dépend de ta formule.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('MusicConnections')} accessibilityLabel="Services"><Text style={s.shareActionPrimaryText}>GERER MES SERVICES</Text></MotionActionButton>
    </>;

    if (key === 'offers') return <>
      <Text style={s.shareTitle}>Offres &amp; crédits</Text>
      <Text style={s.shareSubtitle}>Formule actuelle : {planCode}. {creditUnlimited ? 'Téléchargements illimités.' : creditRemaining != null ? `${creditRemaining} téléchargement${creditRemaining > 1 ? 's' : ''} restant${creditRemaining > 1 ? 's' : ''}.` : ''} Compare Premium, Creator Pro et Venue Pro, et vois tous les avantages en détail.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('Offers')} accessibilityLabel="Voir les offres"><Text style={s.shareActionPrimaryText}>VOIR LES OFFRES</Text></MotionActionButton>
    </>;

    if (key === 'sellPlaylists') return <>
      <Text style={s.shareTitle}>Mes collections exclusives</Text>
      <Text style={s.shareSubtitle}>Un seul parcours : crée une collection de plusieurs morceaux, donne-lui un titre, puis choisis obligatoirement € ou FREE. En euros, ton mode de paiement personnel doit être configuré. En FREE, aucun lien bancaire n’est nécessaire et tu facilites les déblocages, les écoutes et la croissance de ta communauté.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('PlaylistSale')} accessibilityLabel="Collections"><Text style={s.shareActionPrimaryText}>GÉRER MES COLLECTIONS</Text></MotionActionButton>
    </>;

    if (key === 'receipts') return <>
      <Text style={s.shareTitle}>Reçus & transactions</Text>
      <Text style={s.shareSubtitle}>Retrouve les transactions Loki Music : date, montant, statut et référence. Pour PayPal, le reçu bancaire officiel reste celui de PayPal ou du vendeur.</Text>
      <MotionActionButton variant="primary" size="medium" onPress={() => openFromMenu('PlaylistSale', { openPaymentHistory: true })} accessibilityLabel="Ouvrir mes reçus et transactions"><Text style={s.shareActionPrimaryText}>OUVRIR MES REÇUS</Text></MotionActionButton>
    </>;

    if (key === 'publicProfile') return <>
      <Text style={s.shareTitle}>Profil public, réseaux &amp; site web</Text>
      <PublicProfilePanel navigation={navigation} />
    </>;

    if (key === 'chatSettings') return <>
      <Text style={s.shareTitle}>Messagerie Loki</Text>
      <Text style={s.shareSubtitle}>Choisis les pages où la languette apparaît, son côté, sa hauteur HAUT / MILIEU / BAS et les alertes. Le même réglage s’applique partout.</Text>
      <MotionActionButton
        variant="primary"
        size="medium"
        onPress={() => {
          setMenuOpen(false);
          setExpandedMenuItem(null);
          useGlobalChatStore.getState().openSettings();
        }}
        accessibilityLabel="Régler la messagerie"
      >
        <Text style={s.shareActionPrimaryText}>RÉGLER LA MESSAGERIE</Text>
      </MotionActionButton>
    </>;

    if (key === 'creator') return <>
      <Text style={s.shareTitle}>Type de profil &amp; outils créateur</Text>
      <CreatorToolsPanel navigation={navigation} />
    </>;

    if (key === 'help') return <>
      <Text style={s.shareTitle}>Aide, légal &amp; comptes bloqués</Text>
      <HelpLegalPanel profileId={user.id} username={user.username} enabled={!accountRequired} />
    </>;

    return null;
  };

  return <SafeAreaView style={s.container}><PersonalThemeBackdrop />
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topBar} accessibilityLabel="Actions du profil">
        <View style={s.notificationBellWrap}>
          <Animated.View style={{ transform: [{ rotate: notificationBellShake.interpolate({ inputRange: [-1, 1], outputRange: ['-11deg', '11deg'] }) }] }}>
            <TouchableOpacity style={s.iconButton} onPress={() => { setNotificationNudgeVisible(false); notificationBellShake.stopAnimation(); notificationBellShake.setValue(0); setMenuOpen(false); setExpandedMenuItem(null); setNotificationPanelOpen(true); }} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}>
              <Text style={s.bell}>🔔</Text>
              {unreadCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
            </TouchableOpacity>
          </Animated.View>
          {notificationNudgeVisible && unreadCount > 0 ? <Animated.View style={[s.notificationNudge, { opacity: notificationNudgeReveal, width: notificationNudgeReveal.interpolate({ inputRange: [0, 1], outputRange: [54, 222] }) }]}>
            <TouchableOpacity style={s.notificationNudgeTouch} onPress={() => { notificationNudgeReveal.stopAnimation(); setNotificationNudgeVisible(false); setMenuOpen(false); setExpandedMenuItem(null); setNotificationPanelOpen(true); }} accessibilityLabel={`Consulter mes ${unreadCount} notifications`}>
              <Text style={s.notificationNudgeText} numberOfLines={1}>{unreadCount} notification{unreadCount > 1 ? 's' : ''} · ouvre ta cloche</Text>
            </TouchableOpacity>
          </Animated.View> : null}
        </View>
        {accountRequired ? <View style={s.topBarRight}><LoginPill /><TouchableOpacity style={s.menuButton} onPress={() => { setExpandedMenuItem(null); setMenuOpen(true); }} accessibilityLabel="Menu du profil"><Text style={s.menuText}>☰</Text></TouchableOpacity></View> : <TouchableOpacity style={s.menuButton} onPress={() => { setExpandedMenuItem(null); setMenuOpen(true); }} accessibilityLabel="Menu du profil"><Text style={s.menuText}>☰</Text></TouchableOpacity>}
      </View>

      <ProfileMotionReveal motionKey={`owner-hero:${user.id}`} delay={40} style={s.hero}>
        <View style={s.identity}>
          {/* Adel 05/10/2026 : la photo de profil EST la bulle de ta story (pas de double photo). */}
          {!accountRequired && !isDemoMode && !isLocalGuest && storiesUnlocked ? (
            <ProfileStoryBar
              viewer={{ id: user.id, username: user.username, avatarUrl: user.avatar || null }}
              freeCost={freeCostPerKeep}
              size={80}
              gender={user.privateInfo?.gender}
              onOpenProfile={(username) => navigation.navigate('PublicProfile', { username })}
            />
          ) : (
            <>
              {user.avatar ? <Image source={{uri:user.avatar}} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>K</Text></View>}
              <View style={s.identityText} />
            </>
          )}
        </View>
        {/* Adel 05/10/2026 : pseudo, certification, type, Battle et ville passent SOUS la photo et les stories, sur toute la largeur. */}
        <View style={s.identityBelow}>
            <View style={s.usernameLine}>
              <Text style={s.username}>{user.username}</Text>
              <ProfileCertificationBadge tier={certificationTier} compact />
            </View>
            <View style={s.profileMetaLeft}>
              <View style={s.profileMetaTopRow}>
                <View style={s.profileMetaBadgeGroup}>
                {canChangeProfileKind ? (
                <TouchableOpacity style={[s.kindBadge, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]} onPress={() => setKindPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Changer le type de profil">
                  <Text style={[s.kindBadgeText, { color: certificationColors.ring }]}>{PROFILE_KIND_LABELS[user.kind]}</Text>
                  <Text style={[s.kindBadgeEdit, { color: certificationColors.ring }]}>✎</Text>
                </TouchableOpacity>
              ) : (
                // Adel (07/09/2026) : "quand un utilisateur va cliquer dessus
                // pour qu'il puisse savoir ... qu'il faut qu'il change son
                // forfait pour comprendre comment débloquer ses fonctions" --
                // même en FREE/PREMIUM, la pastille doit expliquer comment
                // devenir DJ/Artiste/Créateur/Producteur/Établissement, pas
                // rester une simple étiquette muette.
                <TouchableOpacity
                  style={[s.kindBadge, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}
                  onPress={() => setKindPickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Voir ou modifier mon type de profil"
                >
                  <Text style={[s.kindBadgeText, { color: certificationColors.ring }]}>{PROFILE_KIND_LABELS[user.kind]}</Text>
                </TouchableOpacity>
              )}
                </View>
                {battleFeatureEnabled && !accountRequired ? (
                  <View style={s.profileBattleInlineWrap}>
                    <BattleGlowButton
                      compact
                      style={s.profileBattleInline}
                      active={battleAvailable}
                      disabled={battleAvailabilityBusy}
                      label={battleAvailable ? '⚡ BATTLE ON' : '⚡ BATTLE OFF'}
                      onPress={() => {
                        const next = !battleAvailable;
                        void setBattleAvailable(next).then(() => showBattleAvailabilityInfo(next)).catch(() => {});
                      }}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: battleAvailable, disabled: battleAvailabilityBusy }}
                      accessibilityLabel={battleAvailable ? 'Ne plus recevoir de défis Battle' : 'Recevoir des défis Battle'}
                    />
                    {battleAvailabilityInfoOpen ? (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          s.battleAvailabilityToast,
                          {
                            opacity: battleAvailabilityInfoAnim,
                            transform: [
                              { translateX: battleAvailabilityInfoAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                              { scaleX: battleAvailabilityInfoAnim.interpolate({ inputRange: [0, 1], outputRange: [.82, 1] }) },
                            ],
                          },
                        ]}
                      >
                        <Text style={s.battleAvailabilityToastTitle}>{battleAvailabilityInfoValue ? 'BATTLE ON' : 'BATTLE OFF'}</Text>
                        <Text style={s.battleAvailabilityToastText}>
                          {battleAvailabilityInfoValue
                            ? 'Tu es visible comme disponible et tu peux recevoir des défis. Tu restes activé jusqu’à ce que tu coupes Battle.'
                            : 'Tu ne reçois plus de nouveaux défis. Tu peux continuer à jouer en ouvrant Battle quand tu veux.'}
                        </Text>
                      </Animated.View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
            </View>
        </View>
        <View style={s.topMetricsBar} accessibilityLabel="Compteurs du profil">
        <TouchableOpacity style={[s.topMetricMore, metricsExpanded && s.topMetricMoreOn]} onPress={() => setMetricsExpanded((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: metricsExpanded }} accessibilityLabel="Afficher les autres compteurs">
          <Text style={s.topMetricMoreIcon}>{metricsExpanded ? '⌃' : '•••'}</Text>
          <Text style={s.topMetricMoreText}>PLUS</Text>
        </TouchableOpacity>
        <View style={s.topMetricSocialGroup}>
          <TouchableOpacity style={[s.topMetricSocialItem, communityMode === 'followers' && s.topMetricSocialItemOn]} onPress={() => { setFreeDetailsOpen(false); setRepriseListOpen(false); setCommunityMode((v) => v === 'followers' ? null : 'followers'); }}>
            <Text style={s.topMetricValue}>{profileFollowerCount}</Text><Text style={s.topMetricLabel}>Abonnés</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.topMetricSocialItem, repriseListOpen && s.topMetricSocialItemOn]} onPress={() => { setFreeDetailsOpen(false); setCommunityMode(null); setRepriseListOpen((v) => !v); }}>
            <Text style={s.topMetricValue}>{profileUserKeepCount}</Text><Text style={s.topMetricLabel}>Reprises</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.topMetricSocialItem, s.topMetricSocialLast, s.topMetricFreeItem, freeDetailsOpen && s.topMetricFreeItemOn]}
            onPress={() => {
              setCommunityMode(null);
              setRepriseListOpen(false);
              if (isDemoMode) {
                Alert.alert(
                  'FREE · mode démo',
                  'Le mode démo n’a aucun vrai solde FREE. Après connexion, ton solde réel apparaît ici. Écouter, reconnaître et PASSER ne dépensent pas de FREE ; GARDER et certaines actions Battle peuvent en utiliser ou en faire gagner selon les règles affichées dans Loki Music.',
                  [
                    { text: 'Plus tard', style: 'cancel' },
                    { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create') },
                  ],
                );
                return;
              }
              setFreeDetailsOpen((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: freeDetailsOpen }}
            accessibilityLabel={isDemoMode ? 'Comprendre les Free en mode démo' : 'Voir le détail de mes Free'}
          >
            <Text style={s.topMetricFreeItemValue}>{isDemoMode ? '?' : (freeBalance ?? '…')}</Text>
            <Text style={s.topMetricFreeItemLabel}>FREE</Text>
          </TouchableOpacity>
        </View>
      </View>
      {freeDetailsOpen && !isDemoMode ? (
        <View style={s.metricInlinePanel}>
          <View style={s.metricPanelHeader}><Text style={s.metricPanelTitle}>Mes FREE</Text><TouchableOpacity hitSlop={12} onPress={() => setFreeDetailsOpen(false)}><Text style={s.metricPanelClose}>×</Text></TouchableOpacity></View>
          <View style={s.freeInlineStats}>
            <View style={s.freeInlineStat}><Text style={[s.freeInlineValue, s.freeInlineValueSpent]}>−{freeSpentToday}</Text><Text style={s.freeInlineLabel}>dépensés aujourd’hui</Text></View>
            <View style={s.freeInlineStat}><Text style={[s.freeInlineValue, s.freeInlineValueWon]}>+{freeWon}</Text><Text style={s.freeInlineLabel}>gagnés aujourd’hui</Text></View>
            <View style={s.freeInlineStat}><Text style={[s.freeInlineValue, s.freeInlineValueLost]}>−{freeLost}</Text><Text style={s.freeInlineLabel}>perdus aujourd’hui</Text></View>
          </View>
          <Text style={s.freeInlineHint}>
            {freeSpentKeepCount} morceau{freeSpentKeepCount > 1 ? 'x' : ''} ajouté{freeSpentKeepCount > 1 ? 's' : ''} avec des FREE aujourd’hui
            {freeListenPaidCountToday > 0 ? ` · ${freeListenPaidCountToday} écoute${freeListenPaidCountToday > 1 ? 's' : ''} hors quota : −${freeListenSpentToday} FREE` : ''}
            {freeMarketplacePurchaseCount > 0 ? ` · ${freeMarketplacePurchaseCount} collection${freeMarketplacePurchaseCount > 1 ? 's' : ''} : −${freeMarketplaceSpentToday} FREE` : ''}
            {freeListenStreak > 0 ? ` · Série : ${freeListenStreak} jour${freeListenStreak > 1 ? 's' : ''}` : ''}
            {freeStreakEarnedToday > 0 ? ` · Série +${freeStreakEarnedToday}` : ''}
            {freeDiscoveryEarnedToday > 0 ? ` · Premier découvreur +${freeDiscoveryEarnedToday}` : ''}
            {freeRechargeEarnedToday > 0 ? ` · Recharge +${freeRechargeEarnedToday}` : ''}
            {' · '}journée 02:00 → 01:59 · coût GARDER : {freeCostPerKeep} FREE.
          </Text>
          <TouchableOpacity style={s.freeInlineCta} onPress={() => navigation.navigate('Offers', { sourceFeature: 'PROFILE_FREE' })}><Text style={s.freeInlineCtaText}>COMMENT GAGNER PLUS DE FREE ›</Text></TouchableOpacity>
        </View>
      ) : null}
      {metricsExpanded ? (
        <View style={s.topMetricsSecondary}>
          <TouchableOpacity style={s.topMetricSecondaryItem} onPress={() => { setCommunityMode(null); switchProfileTab('TRACKS'); }}><Text style={s.topMetricValue}>{profileTotalKeepCount}</Text><Text style={s.topMetricLabel}>Morceaux</Text></TouchableOpacity>
          <TouchableOpacity style={[s.topMetricSecondaryItem, communityMode === 'following' && s.topMetricSocialItemOn]} onPress={() => { setFreeDetailsOpen(false); setRepriseListOpen(false); setCommunityMode((v) => v === 'following' ? null : 'following'); }}><Text style={s.topMetricValue}>{profileFollowingCount}</Text><Text style={s.topMetricLabel}>Abonnements</Text></TouchableOpacity>
        </View>
      ) : null}
      {!accountRequired && communityMode ? <View style={s.topMetricsCommunity}><View style={s.metricPanelHeader}><Text style={s.metricPanelTitle}>{communityMode === 'followers' ? 'Tes abonnés' : 'Tes abonnements'}</Text><TouchableOpacity hitSlop={12} onPress={() => setCommunityMode(null)}><Text style={s.metricPanelClose}>×</Text></TouchableOpacity></View><CommunityConnectionsPanel userId={user.id} navigation={navigation} mode={communityMode} /></View> : null}
      {repriseListOpen ? (
        <View style={s.metricInlinePanel}>
          <View style={s.metricPanelHeader}><Text style={s.metricPanelTitle}>Qui reprend tes morceaux</Text><TouchableOpacity hitSlop={12} onPress={() => setRepriseListOpen(false)}><Text style={s.metricPanelClose}>×</Text></TouchableOpacity></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.repriseInlineRail}>
            {repriseLoading ? <Text style={s.muted}>Chargement…</Text> : reprisers.length ? reprisers.slice(0, 8).map((r) => (
              <TouchableOpacity key={r.profileId} style={s.repriseInlineCard} onPress={() => navigation.navigate('PublicProfile', { username: r.username })}>
                {r.avatarUrl ? <Image source={{ uri: r.avatarUrl }} style={s.repriseInlineAvatar} /> : <View style={[s.repriseInlineAvatar, s.avatarFallback]}><Text style={s.avatarText}>{r.username.slice(0,1).toUpperCase()}</Text></View>}
                <Text style={s.repriseInlineName} numberOfLines={1}>@{r.username}</Text>
                <Text style={s.repriseInlineMeta}>{r.favoriteGenres[0] || 'Musique'}</Text>
              </TouchableOpacity>
            )) : <Text style={s.muted}>Aucune reprise pour le moment.</Text>}
          </ScrollView>
          {reprisers.length > 8 ? <Text style={s.repriseInlineMore}>+ {reprisers.length - 8} autres · utilise la recherche communauté pour les retrouver</Text> : null}
        </View>
      ) : null}


        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        {/* Actions propriétaire : même largeur et même contour que les
            grandes actions du profil. Repos = fond transparent ; la couleur
            n'apparaît qu'au toucher pour garder une hiérarchie simple. */}
        <View style={s.ownerQuickActions}>
          <MotionActionButton variant="outline" size="medium" containerStyle={s.ownerQuickActionFull} onPress={openProfileSwipe} accessibilityLabel="Voir aperçu">
            ▶ APERÇU
          </MotionActionButton>
          <View style={s.ownerQuickActionBadgeWrap}>
            <MotionActionButton
              variant="outline"
              size="medium"
              containerStyle={s.ownerQuickActionFull}
              onPress={() => {
                if (accountRequired) {
                  Alert.alert(
                    'Publier une Pépite',
                    'L’écoute reste disponible en mode essai. Pour publier une collection exclusive et recevoir des FREE ou un paiement, connecte-toi ou crée ton compte Loki Music.',
                    [
                      { text: 'Plus tard', style: 'cancel' },
                      { text: 'Se connecter', onPress: () => useAccountGateStore.getState().requestAccount('login') },
                      { text: 'Créer un compte', onPress: () => useAccountGateStore.getState().requestAccount('create') },
                    ],
                  );
                  return;
                }
                navigation.navigate('PlaylistSale');
              }}
              accessibilityLabel={accountRequired ? 'Comprendre comment publier une Pépite' : 'Gérer pépites'}
            >
              ◆ PÉPITES
            </MotionActionButton>
            {ownerBoutiqueOffers.length ? <View pointerEvents="none" style={s.ownerQuickActionBadge} accessibilityLabel={`${ownerBoutiqueOffers.length} collection${ownerBoutiqueOffers.length > 1 ? 's' : ''} publiée${ownerBoutiqueOffers.length > 1 ? 's' : ''}`}><Text style={s.ownerQuickActionBadgeText}>{ownerBoutiqueOffers.length}</Text></View> : null}
          </View>
          <MotionActionButton variant="outline" size="medium" containerStyle={s.ownerQuickActionFull} onPress={() => navigation.navigate('Parties', { openBattle: true, source: 'profile-solo' })} accessibilityLabel="Jouer Battle">
            ⚡ BATTLE
          </MotionActionButton>
        </View>

      </ProfileMotionReveal>

      {!accountRequired && ownerBoutiqueOffers.length ? (
        <ProfileMotionReveal motionKey={`owner-drop:${user.id}:${ownerBoutiqueOffers.length}`} compact style={SELLER_BOUTIQUE_SECTION_STYLE}>
          <Text style={s.ownerClubKicker}>MA BOUTIQUE MUSICALE · {user.username.replace(/^@+/, '')}</Text>
          <SellerBoutique
            offers={ownerBoutiqueOffers}
            sellerUsername={user.username}
            overlaps={{}}
            unlockedOfferIds={new Set<string>()}
            ownerMode
            onOpenAllOffers={(offers) => {
              unlockWebAudioForGesture();
              void Promise.all(offers.map((offer) => loadOwnPlaylistSaleOfferTracks(offer.offerId)))
                .then((groups) => {
                  // "LES APERÇUS" = un extrait représentatif par collection,
                  // pas tous les morceaux de la première collection.
                  const tracks = groups.map((group) => group[0]).filter(Boolean) as CanonicalTrack[];
                  if (!tracks.length) {
                    Alert.alert('Pépites', 'Aucun morceau accessible dans tes Pépites à la une.');
                    return;
                  }
                  openSelectionSwipe({
                    title: 'Mes Pépites à la une',
                    subtitle: `${tracks.length} aperçu${tracks.length > 1 ? 's' : ''} · un par collection.`,
                    tracks,
                  });
                })
                .catch(() => Alert.alert('Pépites', 'Impossible de lancer tes aperçus pour le moment.'));
            }}
            onOpenOffer={(offer) => {
              unlockWebAudioForGesture();
              void loadOwnPlaylistSaleOfferTracks(offer.offerId)
                .then((tracks) => {
                  if (!tracks.length) {
                    Alert.alert('Pépite', 'Cette collection ne contient aucun morceau accessible pour le moment.');
                    return;
                  }
                  openSelectionSwipe({
                    title: offer.playlistName,
                    subtitle: 'Ta collection publiée · lecture directe.',
                    tracks,
                  });
                })
                .catch(() => Alert.alert('Pépite', 'Impossible d’ouvrir cette collection pour le moment.'));
            }}
          />
        </ProfileMotionReveal>
      ) : null}

      {!accountRequired && ownerPrivateChatOffers.length ? (
        <ProfileMotionReveal motionKey={`owner-private-chat-sales:${user.id}:${ownerPrivateChatOffers.length}`} compact style={s.ownerPrivateChatSection}>
          <TouchableOpacity
            style={s.ownerPrivateChatHeader}
            onPress={() => setOwnerPrivateChatOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={ownerPrivateChatOpen ? 'Réduire les ventes privées du chat' : 'Voir les ventes privées du chat'}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.ownerPrivateChatKicker}>VENTES PRIVÉES DU CHAT</Text>
              {!ownerPrivateChatOpen ? <Text style={s.ownerPrivateChatCollapsedHint}>Masqué pour garder ton profil compact.</Text> : null}
            </View>
            <Text style={s.ownerPrivateChatCount}>{ownerPrivateChatOffers.length}</Text>
            <Text style={s.ownerPrivateChatToggle}>{ownerPrivateChatOpen ? 'Réduire ⌃' : 'Voir plus ⌄'}</Text>
          </TouchableOpacity>
          {ownerPrivateChatOpen ? (
            <>
              <Text style={s.ownerPrivateChatHint}>Visibles seulement par toi ici. Une vente du chat dure 24 h : ensuite elle disparaît (il faudra refaire une demande).</Text>
              {ownerPrivateChatOffers.slice(0, 6).map((offer) => {
                const price = offer.paymentMode === 'FREE'
                  ? `${offer.freePrice ?? 0} FREE`
                  : offer.paymentMode === 'BOTH'
                    ? `${offer.freePrice ?? 0} FREE ou ${(offer.priceCents / 100).toFixed(2).replace('.', ',')} ${offer.currencyCode === 'EUR' ? '€' : offer.currencyCode}`
                    : `${(offer.priceCents / 100).toFixed(2).replace('.', ',')} ${offer.currencyCode === 'EUR' ? '€' : offer.currencyCode}`;
                return (
                  <TouchableOpacity
                    key={offer.offerId || offer.playlistId}
                    style={s.ownerPrivateChatCard}
                    onPress={() => {
                      if (!offer.offerId) return;
                      unlockWebAudioForGesture();
                      void loadOwnPlaylistSaleOfferTracks(offer.offerId)
                        .then((tracks) => tracks.length ? openSelectionSwipe({
                          title: 'Vente privée du chat',
                          subtitle: `${price} · ${offer.isActive ? 'active' : 'historique'}`,
                          tracks,
                        }) : Alert.alert('Chat', 'Aucun morceau accessible dans cette vente privée.'))
                        .catch(() => Alert.alert('Chat', 'Impossible d’ouvrir cette vente privée pour le moment.'));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir la vente privée du chat, ${price}, ${offer.isActive ? 'active' : 'historique'}`}
                  >
                    <View style={s.ownerPrivateChatCopy}>
                      <Text style={s.ownerPrivateChatTitle}>{offer.playlistName || 'Pépite du chat'}</Text>
                      <Text style={s.ownerPrivateChatMeta}>{offer.trackCount ?? 0} morceau{(offer.trackCount ?? 0) > 1 ? 'x' : ''} · {price}</Text>
                    </View>
                    <View style={[s.ownerPrivateChatStatus, offer.isActive ? s.ownerPrivateChatStatusOn : s.ownerPrivateChatStatusOff]}>
                      <Text style={s.ownerPrivateChatStatusText}>{offer.isActive ? 'ACTIVE' : 'HISTORIQUE'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {ownerPrivateChatOffers.length > 6 ? <Text style={s.ownerPrivateChatMore}>+ {ownerPrivateChatOffers.length - 6} autre{ownerPrivateChatOffers.length - 6 > 1 ? 's' : ''} dans l’historique Pépites</Text> : null}
            </>
          ) : null}
        </ProfileMotionReveal>
      ) : null}

      {!accountRequired && profileSaleSuggestions.length > 0 ? (
        <ProfileOpportunityRail
          viewerKey={user.id}
          viewerUsername={user.username}
          suggestions={profileSaleSuggestions}
          onSuggestionPress={(suggestion) => { void openOpportunityPreview(suggestion); }}
          onOpenSeller={(suggestion) => navigation.navigate('PublicProfile', { username: suggestion.sellerUsername })}
        />
      ) : null}

      {opportunityPreviewOffer ? (
        <PlaylistSaleImmersivePreview
          offer={opportunityPreviewOffer}
          visible
          busy={opportunityPurchaseBusy}
          onClose={() => { setOpportunityPreviewOffer(null); setOpportunityPreviewSuggestion(null); }}
          onConfirmPurchase={(offer) => { void buyOpportunityOffer(offer); }}
          purchaseEnabled={opportunityPreviewOffer.paymentMode !== 'MONEY' || marketplacePurchaseEnabled}
          moneyPurchaseEnabled={marketplacePurchaseEnabled}
          sourceUsername={opportunityPreviewSuggestion?.sellerUsername}
          freeBalance={freeBalance}
          onOpenProfile={opportunityPreviewSuggestion ? () => {
            const username = opportunityPreviewSuggestion.sellerUsername;
            setOpportunityPreviewOffer(null);
            setOpportunityPreviewSuggestion(null);
            navigation.navigate('PublicProfile', { username });
          } : undefined}
          onRequestMissingTracks={(offer) => { void requestOpportunityMissingTracks(offer); }}
          requestMissingBusy={opportunityMissingBusy}
          onRechargeFree={() => {
            setOpportunityPreviewOffer(null);
            setOpportunityPreviewSuggestion(null);
            navigation.navigate('Offers', { sourceFeature: 'PLAYLIST_FREE_SHORTFALL' });
          }}
        />
      ) : null}

      {/* Adel (29/09/2026) : « quand je clique sur PÉPITES ou sur la carte
          en bas, ça me ramène au même endroit… elle sert à rien vu qu'on a le
          bouton au-dessus ». La grande carte des sélections publiées est retirée ;
          le bouton ◆ PÉPITES affiche le nombre de collections publiées et
          ouvre la gestion (liste complète, publiées et retirées). */}

      <View style={s.collectionHeader}>
        <Text style={s.collectionTitle}>Ma musique</Text>
        <Text style={s.collectionCount}>{genreFolders.length} style{genreFolders.length > 1 ? 's' : ''} · {profileTotalKeepCount} morceau{profileTotalKeepCount > 1 ? 'x' : ''}</Text>
      </View>
      <View style={s.tabsRow}>
        <View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityLabel={`Profil ${tab.label}`} accessibilityState={{ selected: activeTab === tab.key }} style={s.tab} onPress={()=>switchProfileTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>
        {activeTab === 'TRACKS' && trackGenreOptions.length > 0 ? (
          <TouchableOpacity style={s.filterButton} onPress={() => setStyleModalOpen(true)} accessibilityLabel={`Filtrer par style, ${trackGenreOptions.length} disponibles`}>
            <Text style={s.filterButtonText}>Filtrer</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ProfileMotionReveal motionKey={`owner-tab:${activeTab}`} compact>
        <View key={`profile-tab-${activeTab}`}>{tabContent()}</View>
      </ProfileMotionReveal>

      {/* (21/09/2026) Adel a signalé un bouton "ACHETER" vert sur le
          profil -- c'était CE bloc : il s'affichait sur son PROPRE profil
          (playlistSaleOffers = ses propres offres, seller_id = user.id) et
          ne pouvait jamais aboutir (le serveur refuse CANNOT_BUY_OWN_PLAYLIST).
          Un vendeur ne doit jamais voir un CTA d'achat sur sa propre offre ;
          la gestion (modifier/retirer) vit déjà dans le menu "Vendre mes
          playlists" (PlaylistSalePanel). Remplacé par un simple statut. */}
      {!accountRequired && growthStatus ? (
        growthStatus.audienceProUnlocked ? (
          // Adel (15/09/2026) : "je veux que quand on clique dessus, il y
          // ait un petit pop-up qui explique à quoi ça va servir. Qu'est-ce
          // que ça débloque, quels seront les avantages ?" -- réponse
          // honnête, sans inventer d'avantage qui n'existe pas encore.
          <TouchableOpacity style={[s.growthPanel, s.sectionMargin]} onPress={() => Alert.alert(
            '🏆 Audience Pro débloquée',
            `Ce badge signale à toute la communauté que tu as une vraie audience (${growthStatus.audienceProThreshold ?? 1000}+ abonnés).\n\nAvantages déjà actifs :\n· Free en bonus sur ton solde\n· Des profils Découverte et essais Vibes Auto en plus, gagnés à mesure que ta communauté grandit\n\nC'est aussi le premier palier vers les collections exclusives (déblocage séparé, par abonnés) quand tu en as assez.`,
          )}><Text style={s.growthBadgeText}>🏆 AUDIENCE PRO DÉBLOQUÉE · {growthStatus.followers} abonnés</Text><Text style={[s.growthText, { textAlign: 'center', marginTop: 4 }]}>Toucher pour voir les avantages ⓘ</Text></TouchableOpacity>
        ) : growthStatus.nextFollowerGoal ? (
          <View style={[s.growthPanel, s.sectionMargin]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={[s.growthText, { flex: 1 }]}>{growthStatus.followers}/{growthStatus.nextFollowerGoal} abonnés · encore {Math.max(0, growthStatus.nextFollowerGoal - growthStatus.followers)} avant ton prochain bonus Loki Music</Text>
              {/* Adel (14/09/2026) : "un point d'interrogation, il met une
                  explication claire. C'est quoi le bonus ?" -- les paliers
                  d'abonnés (25/100/250/500/1000) donnent des bonus
                  différents (profils Découverte, essais Vibes Auto, Free,
                  Audience Pro à 1000) ; jamais un seul type de bonus,
                  d'où une explication générale plutôt qu'un chiffre figé
                  qui pourrait se tromper si Adel change les seuils. */}
              <TouchableOpacity hitSlop={8} onPress={() => Alert.alert('Bonus Loki Music', 'Chaque palier d’abonnés débloque un bonus différent : des profils Découverte en plus, des essais Vibes Auto gratuits, du Free en plus, et à 1000 abonnés le badge Audience Pro. Plus tu as d’abonnés, plus les bonus grandissent.')}>
                <Text style={{ color: colors.primaryLight, fontSize: 15, fontWeight: '900', marginLeft: 6 }}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <View style={s.growthBarTrack}><View style={[s.growthBarFill, { width: `${Math.min(100, Math.round((growthStatus.followers / growthStatus.nextFollowerGoal) * 100))}%` }]} /></View>
          </View>
        ) : null
      ) : null}

      {!accountRequired ? (
        <MotionActionButton
          onPress={() => navigation.navigate('Main', { screen: 'MyMusic', params: { openManageMusic: true } })}
          accessibilityLabel="Gérer mes musiques"
          variant="secondary"
          size="medium"
          containerStyle={s.manageMusicButton}
        >
          <Text style={{ fontWeight: '800', fontSize: 12 }}>GÉRER MES MUSIQUES</Text>
        </MotionActionButton>
      ) : null}

      {!accountRequired ? (
        <View style={s.dnaCompactWrap} testID="profile-music-dna-card">
          <TouchableOpacity
            style={s.dnaCompactMeter}
            onPress={() => setOwnerDnaExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: ownerDnaExpanded }}
            accessibilityLabel={ownerDnaExpanded ? 'Masquer mon empreinte musicale' : 'Afficher mon empreinte musicale'}
          >
            <View style={s.dnaCompactCopy}>
              <Text style={s.dnaEyebrow}>LOKI MUSIC DNA</Text>
              <Text style={s.dnaCompactTitle}>Ton empreinte musicale</Text>
            </View>
            <View style={s.dnaCompactGauge}>
              <View style={s.dnaCompactTrack}>
                <View style={[s.dnaCompactFill, { width: `${styleCoveragePercent}%` }]} />
              </View>
              <View style={s.dnaCompactScoreRow}>
                <Text style={s.dnaCompactScore}>{styleCoveragePercent}%</Text>
                <Text style={s.dnaCompactChevron}>{ownerDnaExpanded ? '⌃' : '⌄'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {ownerDnaExpanded ? (
            <View style={s.dnaCompactDetails} testID="profile-music-dna-expanded">
              <Text style={s.dnaCountHint}>TES STYLES MUSICAUX · {profileStyleBubbles.length}</Text>
              {profileStyleBubbles.length > 0 ? (
                <MusicStyleBubbles
                  testID="profile-music-style-bubbles"
                  genres={profileStyleBubbles}
                  max={8}
                  onPressGenre={(genre) => {
                    const folder = genreFolders.find((row) => row.genre.toLocaleLowerCase('fr-FR') === genre.toLocaleLowerCase('fr-FR'));
                    if (folder?.entries.length) {
                      openSelectionSwipe({
                        title: folder.genre,
                        subtitle: `Tes morceaux ${folder.genre} dans ta collection.`,
                        tracks: folder.entries.map((entry) => entry.track),
                      });
                      return;
                    }
                    switchProfileTab('TRACKS');
                    setTracksGrouping('GENRE');
                  }}
                />
              ) : (
                <Text style={s.muted}>Ton empreinte musicale se construit avec tes écoutes et tes morceaux gardés.</Text>
              )}
              {profileStyleBubbles.length > 8 ? (
                <TouchableOpacity
                  style={s.dnaSeeAll}
                  onPress={() => { switchProfileTab('TRACKS'); setTracksGrouping('GENRE'); }}
                  accessibilityLabel={`Voir mes ${profileStyleBubbles.length} styles musicaux`}
                >
                  <Text style={s.dnaSeeAllText}>VOIR MES {profileStyleBubbles.length} STYLES</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>


      {!accountRequired && visibleLokiPulseItems.length ? (
        <View style={s.lokiPulseSection} testID="profile-loki-pulse-track-bubbles">
          <View style={s.lokiPulseHeader}>
            <View style={s.lokiPulseHeaderCopy}>
              <Text style={s.lokiPulseEyebrow}>LOKI PULSE</Text>
              <Text style={s.lokiPulseTitle}>Des sons qui te ressemblent</Text>
            </View>
            <Text style={s.lokiPulseCost}>GARDER · {freeCostPerKeep} FREE</Text>
          </View>
          <Text style={s.lokiPulseHint}>Appris par Loki à partir de tes écoutes et adapté à tes goûts. Appuie sur une bulle pour écouter.</Text>
          <ScrollView
            ref={lokiPulseScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.lokiPulseRail}
          >
            {visibleLokiPulseItems.map((item) => (
              <TouchableOpacity
                key={item.track.id}
                style={s.lokiPulseCard}
                onPress={() => {
                  unlockWebAudioForGesture();
                  const knownPreview = item.track.previewUrl?.trim();
                  if (knownPreview) {
                    void preloadTrackPreview(knownPreview).catch(() => {});
                  } else {
                    void resolveTrackPreviewUrl(item.track)
                      .then((url) => url ? preloadTrackPreview(url) : undefined)
                      .catch(() => {});
                  }
                  setLokiPulseSelectedTrackId(item.track.id);
                  setLokiPulseSwipeOpen(true);
                }}
                accessibilityLabel={`Écouter ${item.track.title} dans Loki Pulse`}
              >
                <Animated.View style={[s.lokiPulseArtworkRing, { transform: [{ scale: lokiPulseGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) }] }]}>
                  {item.track.artworkUrl
                    ? <Image source={{ uri: item.track.artworkUrl }} style={s.lokiPulseArtwork} />
                    : <View style={[s.lokiPulseArtwork, s.avatarFallback]}><Text style={s.lokiPulseFallback}>♫</Text></View>}
                  {item.isNew ? <View style={s.lokiPulseNewDot}><Text style={s.lokiPulseNewText}>NEW</Text></View> : null}
                </Animated.View>
                <Text style={s.lokiPulseTrackTitle} numberOfLines={1}>{item.track.title}</Text>
                <Text style={s.lokiPulseArtist} numberOfLines={1}>{item.track.artist}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {!accountRequired ? (
        <View>
          <Text style={s.profileShareInfo}>Ton lien contient ton parrainage : chaque inscription est comptée.</Text>
          <TouchableOpacity style={s.profileShareBottom} onPress={() => void shareNative()} accessibilityRole="button" accessibilityLabel="Partager mon profil Loki Music">
            <Text style={s.profileShareBottomIcon}>↗</Text>
            <Text style={s.profileShareBottomTitle}>PARTAGER MON PROFIL</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Adel (02/09/2026) : "on me montrera pas le lien du site, on mettra
          un bouton, je clique par exemple tu prendras le nom du bouton" --
          jamais l'URL affichée directement, juste le libellé choisi. */}
      {websiteLink ? (
        <TouchableOpacity style={s.websiteButton} onPress={() => void openWebsite()} accessibilityLabel={websiteLink.label || 'Site web'}>
          <Text style={s.websiteButtonText}>🔗 {websiteLink.label || 'Site web'}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>

    <MusicSwipeDeckModal
      visible={profileSwipeOpen}
      tracks={publicSwipeTracks}
      title="Ma collection publique"
      sourceUsername={user.username}
      sourceAvatarUrl={user.avatar}
      sourceByTrack={sourceByTrack}
      allowStoryAdd
      subtitle="Aperçu exact du Swipe proposé à tes abonnés."
      emptyTitle="Aucun morceau public à prévisualiser."
      backLabel="REVENIR AU PROFIL"
      previewOnly
      onOpenSourceProfile={(username) => { setProfileSwipeOpen(false); navigation.navigate('PublicProfile', { username }); }}
      onClose={() => setProfileSwipeOpen(false)}
    />

    <MusicSwipeDeckModal
      visible={lokiPulseSwipeOpen}
      tracks={visibleLokiPulseItems.map((item) => item.track)}
      initialTrackId={lokiPulseSelectedTrackId}
      title="Loki Pulse"
      subtitle={`Pour toi · GARDER coûte actuellement ${freeCostPerKeep} FREE`}
      emptyTitle="Ton Loki Pulse est à jour."
      backLabel="REVENIR AU PROFIL"
      loop
      askVisibilityOnKeep
      keepCostNotice={`GARDER ce morceau débitera ${freeCostPerKeep} FREE après ton choix Public ou Privé. PASSER / MASQUER reste gratuit.`}
      keepDebitAmount={freeCostPerKeep}
      optimisticPass
      onKeep={keepFromLokiPulse}
      onPass={hideFromLokiPulse}
      onClose={() => {
        setLokiPulseSwipeOpen(false);
        setLokiPulseSelectedTrackId(null);
      }}
    />

    <KeepModal visible={pulseTasteOpen} transparent animationType="slide" onRequestClose={() => setPulseTasteOpen(false)}>
      <View style={s.pulseTasteBackdrop}>
        <TouchableOpacity
          style={s.pulseTasteBack}
          onPress={() => {
            setPulseTasteOpen(false);
            if (Platform.OS === 'ios') setTimeout(() => setMenuOpen(true), 450);
            else setMenuOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Retour au menu"
        >
          <Text style={s.pulseTasteBackText}>‹ Retour au menu</Text>
        </TouchableOpacity>
        <MusicTasteQuestionnaire
          onDone={() => {
            setPulseTasteOpen(false);
            void loadLokiPulse(60, user.id).then(setLokiPulseItems).catch(() => {});
          }}
          onLater={() => setPulseTasteOpen(false)}
        />
      </View>
    </KeepModal>

    <KeepModal visible={menuOpen} transparent animationType="fade" onRequestClose={() => (expandedMenuItem ? setExpandedMenuItem(null) : setMenuOpen(false))}>
      <View style={s.menuDrawerBackdrop}><View style={s.menuDrawer}>
        <View style={s.sheetHandle} />
        {expandedMenuItem ? (
          <>
            <TouchableOpacity style={s.menuBackRow} onPress={() => setExpandedMenuItem(null)}><Text style={s.menuBackText}>‹ Menu</Text></TouchableOpacity>
            <ScrollView style={{ maxHeight: 440 }}>{renderMenuDetail(expandedMenuItem)}</ScrollView>
          </>
        ) : (
          <>
            <Text style={s.shareTitle}>Réglages</Text>
            <Text style={s.menuIntro}>Choisis une rubrique. Un appui ouvre directement la fonction.</Text>
            <ScrollView style={{ maxHeight: 500, marginTop: 8 }} contentContainerStyle={s.menuScrollContent}>
              {MENU_GROUPS.map((group) => {
                const visibleItems = group.items.filter((item) => item.key !== 'sellPlaylists' || marketplaceEnabled);
                if (!visibleItems.length) return null;
                return <View key={group.title} style={s.menuGroup}>
                  <Text style={s.menuGroupTitle}>{group.title}</Text>
                  <View style={s.menuGroupCard}>
                    {visibleItems.map((item, index) => (
                      <TouchableOpacity key={item.key} style={[s.menuItemRow, index < visibleItems.length - 1 && s.menuItemDivider]} onPress={() => directMenuAction(item.key)} accessibilityRole="button" accessibilityLabel={item.label}>
                        {/* Adel 05/10/2026 : jamais de logo gris sur gris ni bleu sur bleu — chaque entrée a sa couleur. */}
                        <View style={[s.menuItemIcon, { backgroundColor: `${menuIconColor(item.key)}33`, borderWidth: 1, borderColor: menuIconColor(item.key) }]}><Text style={s.menuItemIconText}>{item.icon}</Text></View>
                        <View style={s.menuItemCopy}>
                          <Text style={s.menuItemLabel}>{item.label}</Text>
                          <Text style={s.menuItemHint} numberOfLines={2}>{item.hint}</Text>
                        </View>
                        <Text style={s.menuChevron}>›</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>;
              })}
            </ScrollView>
          </>
        )}
        <TouchableOpacity style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 }} onPress={() => { setMenuOpen(false); setExpandedMenuItem(null); }}><Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '800' }}>Fermer</Text></TouchableOpacity>
      </View></View>
    </KeepModal>

    <KeepModal visible={styleModalOpen} transparent animationType="fade" onRequestClose={() => setStyleModalOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.shareSheet}>
        <Text style={s.shareTitle}>Parcourir par style</Text>
        <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
          {trackGenreOptions.map(({ genre, count }) => (
            <TouchableOpacity key={genre} style={s.listRow} onPress={() => {
              const folder = genreFolders.find((folder) => folder.genre === genre);
              const tracks = folder?.entries.map((entry) => entry.track) ?? [];
              const sourceByTrackForGenre: Record<string, { profileId?: string; username?: string; avatarUrl?: string | null }> = {};
              folder?.entries.forEach((entry) => {
                if (entry.sourceProfileId || entry.sourceUsername) {
                  sourceByTrackForGenre[entry.track.id] = {
                    profileId: entry.sourceProfileId,
                    username: entry.sourceUsername,
                    avatarUrl: entry.sourceAvatarUrl,
                  };
                }
              });
              setStyleModalOpen(false);
              openSelectionSwipe({
                title: genre,
                subtitle: `Tes morceaux ${genre} dans ta collection.`,
                tracks,
                sourceByTrack: sourceByTrackForGenre,
              });
            }}>
              <Text style={[s.listText, { flex: 1 }]}>{genre}</Text>
              <Text style={s.playlistCount}>{count}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 }} onPress={() => setStyleModalOpen(false)}><Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>Fermer</Text></TouchableOpacity>
      </View></View>
    </KeepModal>

    <MusicSwipeDeckModal
      visible={Boolean(selectionSwipe)}
      tracks={selectionSwipe?.tracks ?? []}
      title={selectionSwipe?.title ?? 'Vibe Loki Music'}
      sourceUsername={user.username}
      sourceAvatarUrl={user.avatar}
      sourceByTrack={selectionSwipe?.sourceByTrack}
      allowStoryAdd
      subtitle={selectionSwipe?.subtitle ?? 'Ta sélection.'}
      emptyTitle="Aucun morceau dans cette sélection."
      backLabel="REVENIR AU PROFIL"
      previewOnly
      onOpenSourceProfile={(username) => { setSelectionSwipe(null); navigation.navigate('PublicProfile', { username }); }}
      onClose={() => setSelectionSwipe(null)}
    />

    <SourceProfileQuickView
      visible={Boolean(sourceQuickUsername)}
      username={sourceQuickUsername}
      currentUserId={user.id}
      accountRequired={accountRequired}
      onClose={() => setSourceQuickUsername('')}
      onOpenFull={(username) => navigation.navigate('PublicProfile', { username })}
      onRequireAccount={(username) => openAccount('create', username)}
    />


    <KeepModal visible={kindPickerOpen} transparent animationType="fade" onRequestClose={() => setKindPickerOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Ton profil Loki</Text>
          <Text style={s.shareSubtitle}>{canChangeProfileKind ? 'Choisis l’identité qui te ressemble. Tu peux la modifier à tout moment.' : 'Fan est le profil universel. Les profils spécialisés se débloquent avec une formule Pro.'}</Text>
          {canChangeProfileKind ? (
            <View style={s.kindPickerGrid}>
              {kindChoices.map((choice) => (
                <TouchableOpacity key={choice.key} disabled={kindChangeBusy} style={[s.kindChoice, user.kind === choice.key && s.kindChoiceOn]} onPress={() => void changeKind(choice.key)}>
                  <Text style={[s.kindChoiceText, user.kind === choice.key && s.kindChoiceTextOn]}>{choice.label}</Text>
                  <Text style={s.kindChoiceHint}>{user.kind === choice.key ? 'ACTUEL' : 'CHOISIR'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={s.kindPickerGrid}>
              <TouchableOpacity style={s.kindChoice} onPress={() => { setKindPickerOpen(false); navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO' }); }}>
                <Text style={s.kindChoiceText}>Créateur · DJ · Artiste · Producteur</Text><Text style={s.kindChoiceHint}>CRÉATEUR PRO</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.kindChoice} onPress={() => { setKindPickerOpen(false); navigation.navigate('Offers', { focusPlan: 'VENUE_PRO' }); }}>
                <Text style={s.kindChoiceText}>Lieu · Club · Bar · Établissement</Text><Text style={s.kindChoiceHint}>LIEU PRO</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={s.cancelShare} onPress={() => setKindPickerOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </KeepModal>

    <KeepModal visible={false} transparent animationType="fade" onRequestClose={() => setRepriseListOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={[s.shareSheet, s.repriseSheet]}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Qui a repris tes morceaux</Text>
          <Text style={s.shareSubtitle}>{reprisers.length} utilisateur{reprisers.length > 1 ? 's ont' : ' a'} gardé un morceau que tu as découvert en premier.</Text>
          <ScrollView style={s.repriseScroll}>
            {repriseLoading ? <Text style={s.muted}>Chargement…</Text> : reprisers.length ? reprisers.map((r) => {
              const tierColors = CERTIFICATION_META[r.certificationTier] ?? CERTIFICATION_META.UNVERIFIED;
              return (
                <View key={r.profileId} style={s.repriseRow}>
                  {r.avatarUrl ? <Image source={{ uri: r.avatarUrl }} style={s.repriseAvatar} /> : <View style={[s.repriseAvatar, s.avatarFallback]}><Text style={s.avatarText}>{r.username.slice(0,1).toUpperCase()}</Text></View>}
                  <View style={s.repriseInfo}>
                    <View style={s.repriseNameRow}><Text style={s.repriseUsername} numberOfLines={1}>{r.username}</Text><ProfileCertificationBadge tier={r.certificationTier} compact /></View>
                    {r.favoriteGenres.length ? <View style={s.repriseGenres}>{r.favoriteGenres.slice(0,3).map((g) => <View key={g} style={[s.repriseGenreChip, { borderColor: tierColors.ring }]}><Text style={[s.repriseGenreText, { color: tierColors.ring }]}>{g}</Text></View>)}</View> : null}
                  </View>
                  <TouchableOpacity disabled={repriseFollowBusyId === r.profileId} style={[s.repriseFollowButton, r.isFollowing && s.repriseFollowButtonOn]} onPress={() => void toggleRepriserFollow(r)}>
                    <Text style={[s.repriseFollowButtonText, r.isFollowing && s.repriseFollowButtonTextOn]}>{repriseFollowBusyId === r.profileId ? '…' : r.isFollowing ? 'VOIR LE PROFIL' : 'SUIVRE'}</Text>
                  </TouchableOpacity>
                </View>
              );
            }) : <Text style={s.muted}>Personne n’a encore repris tes morceaux.</Text>}
          </ScrollView>
          <TouchableOpacity style={s.cancelShare} onPress={() => setRepriseListOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </KeepModal>

    <NotificationSidePanel
      visible={notificationPanelOpen}
      profileId={user.id}
      onClose={() => setNotificationPanelOpen(false)}
    />

    <KeepModal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Partager mon profil Loki Music</Text>
          <Text style={s.shareSubtitle}>Ton univers musical tient dans un lien. Fais découvrir ton Loki Pulse, tes Vibes, tes réseaux et ce qui te ressemble.</Text>
          <View style={s.linkPreview}><Text style={s.linkPreviewText} numberOfLines={2}>{publicProfileLink}</Text></View>
          <MotionActionButton variant="primary" size="medium" onPress={shareNative} accessibilityLabel="Decouvrir"><Text style={s.shareActionPrimaryText}>FAIRE DÉCOUVRIR MON Loki Music</Text></MotionActionButton>
          <View style={s.shareCompactRow}>
            <MotionActionButton variant="ghost" size="small" containerStyle={s.shareCompactAction} onPress={shareEmail} accessibilityLabel="Email"><Text style={s.shareCompactText}>EMAIL</Text></MotionActionButton>
            <MotionActionButton variant="ghost" size="small" containerStyle={s.shareCompactAction} onPress={showQr} accessibilityLabel="QR"><Text style={s.shareCompactText}>MA CARTE</Text></MotionActionButton>
            <MotionActionButton variant="ghost" size="small" containerStyle={s.shareCompactAction} onPress={() => void copyShare()} accessibilityLabel="Copier"><Text style={s.shareCompactText}>COPIER</Text></MotionActionButton>
          </View>
          <TouchableOpacity style={s.cancelShare} onPress={() => setShareOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </KeepModal>

    <KeepModal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.qrShell}>
          <TouchableOpacity style={s.qrCloseTop} onPress={() => setQrOpen(false)} accessibilityLabel="Fermer le QR Loki Music"><Text style={s.qrCloseTopText}>✕</Text></TouchableOpacity>
          <ScrollView style={s.qrScroll} contentContainerStyle={s.qrScrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.qrCard}>
            <View style={s.qrBrandRow}>
              <View><Text style={s.qrLogo}>LOKI</Text><Text style={s.qrMusic}>MUSIC ID</Text></View>
              <View style={s.qrOfficial}><View style={s.qrOfficialDot}/><Text style={s.qrOfficialText}>IDENTITÉ MUSICALE</Text></View>
            </View>
            <View style={s.qrIdentityRow}>
              {user.avatar ? <Image source={{uri:user.avatar}} style={s.qrAvatar}/> : <View style={[s.qrAvatar,s.qrAvatarFallback]}><Text style={s.qrAvatarText}>{user.username.slice(0,1).toUpperCase()}</Text></View>}
              <View style={s.qrIdentityText}>
                <Text style={s.qrHandle}>@{user.username}</Text>
                <View style={s.qrKindRow}><Text style={s.qrKind}>{PROFILE_KIND_LABELS[user.kind]}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
                {(user.city || user.countryCode) ? <Text style={s.qrLocation}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            </View>
            {user.bio ? <Text style={s.qrBio} numberOfLines={3}>{user.bio}</Text> : <Text style={s.qrBio}>Mon univers musical, mes découvertes, mon identité.</Text>}
            {identityGenrePreview.length ? <View style={s.qrGenres}>{identityGenrePreview.map((genre) => <View key={genre} style={s.qrGenre}><Text style={s.qrGenreText}>{genre}</Text></View>)}</View> : null}
            <View style={s.qrStats}>
              <View style={s.qrStat}><Text style={s.qrStatValue}>{profileTotalKeepCount}</Text><Text style={s.qrStatLabel}>GARDÉS</Text></View>
              <View style={s.qrStatDivider}/>
              <View style={s.qrStat}><Text style={s.qrStatValue}>{profileFollowerCount}</Text><Text style={s.qrStatLabel}>ABONNÉS</Text></View>
              <View style={s.qrStatDivider}/>
              <View style={s.qrStat}><Text style={s.qrStatValue}>{displayPlaylists.length}</Text><Text style={s.qrStatLabel}>VIBES</Text></View>
            </View>
            <View style={s.qrCodeZone}>
              <View style={s.qrBox}><QRCode value={publicProfileLink} size={172} color="#0B0A12" backgroundColor="#FFFFFF" /></View>
              <View style={s.qrCodeCopy}>
                <Text style={s.qrScan}>SCAN · DÉCOUVRE · SWIPE</Text>
                <Text style={s.qrReferral}>Le scan ouvre mon profil et conserve mon invitation Loki Music.</Text>
              </View>
            </View>
            <View style={s.qrFooter}>
              <Text style={s.qrTagline}>TES GOÛTS TE RESSEMBLENT.</Text>
              <Text style={s.qrWebsite}>LOKI MUSIC · CARTE À PARTAGER</Text>
            </View>
          </View>
          <Text style={s.screenshotHint}>Ta carte d’identité musicale : photo, bio, ville, styles et QR. Fais une capture ou partage-la pour donner envie de découvrir ton univers.</Text>
          <MotionActionButton variant="primary" size="medium" onPress={() => { setQrOpen(false); void shareNative(); }} accessibilityLabel="Partager"><Text style={s.shareActionPrimaryText}>PARTAGER MA CARTE</Text></MotionActionButton>
          <MotionActionButton variant="ghost" size="small" onPress={() => void copyShare()} accessibilityLabel="Copier"><Text style={s.shareActionText}>Copier lien et profil</Text></MotionActionButton>
          <TouchableOpacity style={s.cancelShare} onPress={() => setQrOpen(false)}><Text style={s.cancelShareText}>FERMER</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </KeepModal>
</SafeAreaView>;
}

function Empty({text}:{text:string}){return <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.muted}>{text}</Text></View>}

const s=StyleSheet.create({
  metricPanelHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4,paddingBottom:4},metricPanelTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},metricPanelClose:{color:colors.textMuted,fontSize:24,fontWeight:'700'},
  profileShareBottom:{marginHorizontal:18,marginTop:10,minHeight:52,borderRadius:18,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,paddingHorizontal:14},profileShareBottomIcon:{color:colors.primaryLight,fontSize:19,fontWeight:'900'},profileShareBottomTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900',letterSpacing:.6},profileShareInfo:{color:colors.textMutedGrey,fontSize:12,lineHeight:16,fontWeight:'700',textAlign:'center',marginHorizontal:18,marginTop:10,marginBottom:-4},

  container:{flex:1,backgroundColor:colors.background},content:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24},demoTitle:{...typography.h2,color:colors.textPrimary,marginBottom:8},primary:{marginTop:20,minHeight:50,width:'100%',borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.white,fontSize:16,fontWeight:'900'},
  notificationBellWrap:{position:'relative',zIndex:6},notificationNudge:{position:'absolute',left:50,top:7,height:34,borderRadius:17,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primary,overflow:'hidden',shadowColor:'#000',shadowOpacity:.24,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:8},notificationNudgeTouch:{flex:1,minWidth:222,paddingHorizontal:13,justifyContent:'center'},notificationNudgeText:{color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.15},
  topBarRight:{flexDirection:'row',alignItems:'center',gap:10},
  topBar:{minHeight:50,paddingHorizontal:18,paddingTop:9,paddingBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kindBadge:{height:24,paddingHorizontal:9,borderRadius:12,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},kindBadgeText:{color:colors.textPrimary,fontSize:13,lineHeight:16,fontWeight:'900'},kindBadgeEdit:{fontSize:11,lineHeight:14,fontWeight:'900'},actions:{flexDirection:'row',gap:7,alignItems:'center'},iconButton:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,position:'relative'},iconText:{color:colors.textPrimary,fontSize:18,fontWeight:'700'},bell:{fontSize:16},menuButton:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight},menuText:{color:'#FFFFFF',fontSize:28,lineHeight:30,fontWeight:'900'},menuChevron:{color:colors.primaryLight,fontSize:20,fontWeight:'900',marginLeft:8},menuBackRow:{minHeight:42,justifyContent:'center',marginBottom:4},menuBackText:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},menuIntro:{color:colors.textMuted,fontSize:12,lineHeight:17,textAlign:'center',marginTop:5,paddingHorizontal:8},menuScrollContent:{paddingBottom:8},menuGroup:{marginBottom:16},menuGroupTitle:{color:colors.textMuted,fontSize:12,fontWeight:'900',letterSpacing:1.2,marginBottom:7,marginLeft:4},menuGroupCard:{borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,overflow:'hidden'},menuItemRow:{minHeight:64,flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:10},menuItemDivider:{borderBottomWidth:1,borderBottomColor:colors.border},menuItemIcon:{width:36,height:36,borderRadius:12,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center',marginRight:10},accountIconOnline:{borderWidth:1,borderColor:colors.success,backgroundColor:`${colors.success}18`},accountIconOffline:{borderWidth:1,borderColor:colors.primaryLight,backgroundColor:`${colors.primary}18`},menuItemIconText:{fontSize:19,color:'#FFFFFF',fontWeight:'900'},menuItemCopy:{flex:1,minWidth:0},menuItemLabel:{color:colors.textPrimary,fontSize:16,fontWeight:'900'},menuItemHint:{color:colors.textMuted,fontSize:13,lineHeight:17,marginTop:2},notificationBadge:{position:'absolute',right:-4,top:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:colors.danger,borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},notificationBadgeText:{color:'#FFF',fontSize:10,fontWeight:'900'},plan:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},planFree:{backgroundColor:`${colors.success}22`,borderColor:colors.success},planExhausted:{backgroundColor:`${colors.danger}22`,borderColor:colors.danger},planPaid:{backgroundColor:`${colors.primary}33`,borderColor:colors.primaryLight},planText:{color:'#FFF',fontSize:12,fontWeight:'900'},
  ownerPrivateChatSection:{marginHorizontal:18,marginTop:10,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:12,gap:8},
  ownerPrivateChatHeader:{flexDirection:'row',alignItems:'center',gap:10},
  ownerPrivateChatCollapsedHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:2},
  ownerPrivateChatToggle:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},
  ownerPrivateChatKicker:{color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.7},
  ownerPrivateChatToggleText:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.5},
  ownerPrivateChatHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:3},
  ownerPrivateChatCount:{minWidth:30,height:30,borderRadius:15,borderWidth:1,borderColor:colors.primaryLight,color:colors.primaryLight,textAlign:'center',fontSize:11,fontWeight:'900',paddingTop:6},
  ownerPrivateChatCard:{minHeight:58,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:10},
  ownerPrivateChatCopy:{flex:1,minWidth:0},
  ownerPrivateChatTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  ownerPrivateChatMeta:{color:colors.textSecondary,fontSize:9,marginTop:3,fontWeight:'700'},
  ownerPrivateChatStatus:{minHeight:28,paddingHorizontal:9,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},
  ownerPrivateChatStatusOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)'},
  ownerPrivateChatStatusOff:{borderColor:colors.border,backgroundColor:colors.backgroundElevated},
  ownerPrivateChatStatusText:{color:colors.textPrimary,fontSize:8,fontWeight:'900'},
  ownerPrivateChatMore:{color:colors.textMuted,fontSize:11,textAlign:'center',paddingTop:2},
  ownerClubKicker:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1.2,marginBottom:4},ownerQuickActionBadgeWrap:{flex:1,position:'relative'},ownerQuickActionBadge:{position:'absolute',top:-6,right:-4,minWidth:22,height:22,paddingHorizontal:5,borderRadius:11,backgroundColor:colors.success,alignItems:'center',justifyContent:'center'},ownerQuickActionBadgeText:{color:'#0B1F1B',fontSize:12,fontWeight:'900'},
  profileStoryRow:{marginBottom:0},identityBelow:{marginTop:12},hero:{paddingHorizontal:18,paddingBottom:16},identity:{flexDirection:'row',alignItems:'flex-start',paddingTop:16},avatar:{width:80,height:80,borderRadius:40,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:29,fontWeight:'800'},identityText:{flex:1,marginLeft:12,minWidth:0,paddingTop:0},usernameLine:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap',minHeight:34},username:{...typography.h2,color:colors.textPrimary,flexShrink:1},profileMetaLeft:{alignItems:'stretch',gap:9,marginTop:10},profileMetaTopRow:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},profileMetaBadgeGroup:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:1,flexWrap:'nowrap'},profileBattleInlineWrap:{position:'relative',flexShrink:0,alignItems:'flex-end'},profileBattleInline:{flexShrink:0},battleAvailabilityToast:{position:'absolute',right:'100%',top:-18,marginRight:8,width:218,minHeight:68,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,paddingHorizontal:12,paddingVertical:9,zIndex:20,shadowColor:'#000',shadowOpacity:.28,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:12},battleAvailabilityToastTitle:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.8},battleAvailabilityToastText:{color:colors.textSecondary,fontSize:10,lineHeight:14,fontWeight:'700',marginTop:4},location:{color:colors.textSecondary,fontSize:13,lineHeight:19,fontWeight:'800'},bio:{color:colors.textPrimary,fontSize:14,lineHeight:20,marginTop:11},ownerActions:{flexDirection:'row',alignItems:'center',gap:7,marginTop:10},ownerEditButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},ownerQuickActions:{flexDirection:'row',alignItems:'stretch',gap:8,marginTop:8,width:'100%'},ownerQuickActionFull:{flex:1,minWidth:0},
ownerActionChip:{flex:1,minWidth:0,minHeight:54,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',gap:3,paddingHorizontal:4},
ownerActionChipPrimary:{backgroundColor:colors.primaryFaint,borderColor:colors.primary},
ownerActionChipSuccess:{backgroundColor:colors.successFaint,borderColor:colors.success},
ownerActionChipBattleOn:{backgroundColor:`${colors.success}22`,borderColor:colors.success},
ownerActionChipIcon:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},
ownerActionChipText:{color:colors.textPrimary,fontSize:9,fontWeight:'900',letterSpacing:.45,textAlign:'center'},
ownerBattleSummary:{minHeight:32,marginTop:6,borderRadius:10,alignItems:'center',justifyContent:'center'},
ownerBattleSummaryText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'800',letterSpacing:.3},
ownerBattleTopRow:{minHeight:30,paddingHorizontal:18,marginTop:-2,marginBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'flex-end'},
ownerBattleMicroRow:{minHeight:28,marginTop:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
ownerBattleMicroSwitch:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:5,borderRadius:999,borderWidth:2,borderColor:colors.primaryLight,backgroundColor:'transparent',shadowColor:colors.primaryLight,shadowOpacity:.72,shadowRadius:9,shadowOffset:{width:0,height:0},elevation:7},
ownerBattleMicroSwitchOn:{borderColor:colors.success,backgroundColor:'transparent',shadowColor:colors.success,shadowOpacity:.9,shadowRadius:11,elevation:9},
ownerBattleMicroText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'900',letterSpacing:.45},
ownerBattleMicroTextOn:{color:colors.success},

ownerQuickActionMotion:{flex:1},ownerSwipeMotion:{marginTop:12},ownerSoloBattleMotion:{marginTop:8},ownerShareButton:{flex:1,minHeight:48,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},ownerSellButton:{flex:1,minHeight:54,borderRadius:14,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success,alignItems:'center',justifyContent:'center',paddingHorizontal:8},ownerSellButtonText:{color:colors.success,fontSize:11,fontWeight:'900',textAlign:'center'},ownerSellCount:{color:colors.textMutedGrey,fontSize:9,fontWeight:'800',marginTop:2},ownerBattleCard:{marginTop:8},ownerBattleCopy:{flex:1,minWidth:0},ownerBattleSub:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:2},ownerSwipeButton:{minHeight:52,borderRadius:16,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:12,width:'100%'},ownerActionText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},ownerShareTextSecondary:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},
  sectionMargin:{marginHorizontal:18,marginTop:10},
battleAvailabilityRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingVertical:8,paddingHorizontal:11,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:2,borderColor:colors.primaryLight,shadowColor:colors.primaryLight,shadowOpacity:.55,shadowRadius:9,shadowOffset:{width:0,height:0},elevation:7},battleAvailabilityRowOn:{backgroundColor:`${colors.success}22`,borderColor:colors.success,shadowColor:colors.success,shadowOpacity:.9,shadowRadius:12,elevation:9},battleAvailabilityMain:{flexDirection:'row',alignItems:'center',gap:6,flex:1},battleAvailabilityDot:{fontSize:13},battleAvailabilityTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},battleAvailabilityInfoIcon:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},ownerSoloBattleButton:{minHeight:56,marginTop:8,paddingHorizontal:12,borderRadius:16,backgroundColor:colors.primary,borderWidth:2,borderColor:colors.primaryLight,flexDirection:'row',alignItems:'center',gap:10,shadowColor:colors.primaryLight,shadowOpacity:.7,shadowRadius:10,shadowOffset:{width:0,height:0},elevation:8},ownerSoloBattleCopy:{flex:1,minWidth:0},ownerSoloBattleTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},ownerSoloBattleSub:{color:colors.textPrimary,fontSize:10,lineHeight:14,marginTop:2},ownerSoloBattleArrow:{color:colors.textPrimary,fontSize:26,fontWeight:'700'},battleAvailabilityHint:{color:colors.textPrimary,fontSize:12,lineHeight:16,marginTop:5,paddingHorizontal:2},battlePresenceLine:{color:colors.textPrimary,fontSize:12,fontWeight:'700',marginTop:6,paddingHorizontal:2},
  dnaCompactWrap:{marginHorizontal:18,marginTop:12},
  dnaCompactMeter:{borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},
  dnaCompactCopy:{flex:1,minWidth:0},
  dnaCompactTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900',marginTop:2},
  dnaCompactPreview:{marginTop:8},
  pulseCompactActions:{marginTop:8,flexDirection:'row',gap:8},
  dnaCompactToggle:{flex:1,minHeight:36,paddingHorizontal:11,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  dnaCompactToggleOn:{borderColor:colors.keep,backgroundColor:'rgba(82,255,185,.10)'},
  dnaCompactToggleText:{color:colors.primaryLight,fontSize:9.5,fontWeight:'900',letterSpacing:.45,textAlign:'center'},
  dnaCompactToggleChevron:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},
  dnaCompactGauge:{width:118,alignItems:'flex-end',gap:5},
  dnaCompactTrack:{width:'100%',height:7,borderRadius:999,backgroundColor:colors.border,overflow:'hidden'},
  dnaCompactFill:{height:'100%',borderRadius:999,backgroundColor:colors.keep},
  dnaCompactScore:{color:colors.keep,fontSize:14,fontWeight:'900'},
  dnaCompactScoreRow:{flexDirection:'row',alignItems:'center',gap:7},
  dnaCompactChevron:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},
  dnaCompactDetails:{marginTop:8,padding:10,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated},
  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800',marginTop:2},dnaScore:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{paddingHorizontal:10,paddingVertical:5,borderRadius:radius.pill,backgroundColor:colors.smartBadgeBg},chipText:{color:colors.smartBadgeText,fontSize:12,fontWeight:'700'},genreGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:8},genreTile:{width:'48%',minHeight:56,marginBottom:10,paddingHorizontal:12,paddingVertical:10,borderRadius:radius.md,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,justifyContent:'center'},genreTileText:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},genreTileCount:{color:colors.textMutedGrey,fontSize:11,fontWeight:'700',marginTop:3},muted:{color:colors.textPrimary,fontSize:13,lineHeight:18},
  ownerStyleGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:0,marginTop:10},groupingToggle:{flexDirection:'row',gap:8,marginBottom:4},groupingChip:{minHeight:30,paddingHorizontal:14,borderRadius:radius.pill,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},groupingChipOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},groupingChipText:{color:colors.textMuted,fontSize:12,fontWeight:'800'},groupingChipTextOn:{color:'#FFFFFF'},
  genreFolderGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:6},genreFolderRowBlock:{marginTop:6},genreFolderRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'stretch'},genreFolderTile:{width:'48%',minHeight:72,marginBottom:10,paddingHorizontal:12,paddingVertical:10,borderRadius:radius.md,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,justifyContent:'center'},genreFolderSpacer:{width:'48%'},genreFolderTileOn:{borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},genreFolderIcon:{fontSize:18,marginBottom:4},genreFolderName:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},genreFolderCount:{color:colors.textMutedGrey,fontSize:11,fontWeight:'700',marginTop:3},
  genreFolderPanel:{marginTop:0,marginBottom:10,padding:10,borderRadius:radius.md,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,gap:7},genreFolderPanelHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:2},genreFolderPanelTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800',flex:1,minWidth:0},genreFolderPanelActions:{flexDirection:'row',gap:8,marginBottom:2},genreFolderPlayButton:{flex:1,minHeight:34,paddingHorizontal:12,borderRadius:radius.pill,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},genreFolderPlayText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},genreFolderSellButton:{flex:1,minHeight:34,paddingHorizontal:12,borderRadius:radius.pill,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success,alignItems:'center',justifyContent:'center'},genreFolderSellText:{color:colors.success,fontSize:12,fontWeight:'900'},
  websiteButton:{marginHorizontal:18,marginTop:10,minHeight:44,borderRadius:radius.pill,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},websiteButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},socialHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},socialTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},musicLink:{color:colors.primaryLight,fontSize:13,fontWeight:'800'},socialRow:{flexDirection:'row',justifyContent:'space-between',marginTop:12},socialButton:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},socialButtonOn:{backgroundColor:colors.backgroundCard,borderColor:colors.primaryLight},
  lokiPulseSection:{marginHorizontal:18,marginTop:8,marginBottom:12,paddingVertical:13,borderRadius:20,backgroundColor:'rgba(19,13,30,.96)',borderWidth:1,borderColor:'rgba(168,132,250,.42)',overflow:'hidden'},lokiPulseHeader:{paddingHorizontal:13,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:8},lokiPulseHeaderCopy:{flex:1,minWidth:0},lokiPulseEyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.6},lokiPulseTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900',marginTop:2},lokiPulseCost:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.55,textAlign:'right'},lokiPulseHint:{color:colors.textMuted,fontSize:9,lineHeight:13,paddingHorizontal:13,marginTop:5},lokiPulseRail:{paddingHorizontal:12,paddingTop:12,paddingBottom:2,gap:10},lokiPulseCard:{width:78,alignItems:'center'},lokiPulseArtworkRing:{width:66,height:66,borderRadius:33,borderWidth:2,borderColor:colors.primaryLight,padding:3,backgroundColor:'rgba(124,92,252,.12)',shadowColor:colors.primaryLight,shadowOpacity:.28,shadowRadius:8,shadowOffset:{width:0,height:0}},lokiPulseArtwork:{width:'100%',height:'100%',borderRadius:29},lokiPulseFallback:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},lokiPulseNewDot:{position:'absolute',right:-4,bottom:-2,minWidth:25,height:16,borderRadius:8,paddingHorizontal:4,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:colors.backgroundCard},lokiPulseNewText:{color:'#09110F',fontSize:6,fontWeight:'900',letterSpacing:.4},lokiPulseTrackTitle:{width:'100%',color:colors.textPrimary,fontSize:9,fontWeight:'900',textAlign:'center',marginTop:6},lokiPulseArtist:{width:'100%',color:colors.textMuted,fontSize:8,textAlign:'center',marginTop:1},

  growthPanel:{padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},growthText:{color:colors.textPrimary,fontSize:12,fontWeight:'700',lineHeight:17},growthBarTrack:{marginTop:8,height:6,borderRadius:3,backgroundColor:colors.backgroundCard,overflow:'hidden'},growthBarFill:{height:6,borderRadius:3,backgroundColor:colors.primaryLight},growthBadgeText:{color:colors.success,fontSize:13,fontWeight:'900',textAlign:'center'},browseChipsRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},browseChip:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},browseChipText:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},
  topMetricsBar:{marginHorizontal:0,marginTop:12,minHeight:58,flexDirection:'row',alignItems:'flex-end',gap:8},
  topMetricFreeStack:{width:82,alignItems:'stretch',justifyContent:'flex-end',gap:7},
  topMetricFreeHero:{width:82,minHeight:58,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(45,225,194,.12)',borderWidth:1.5,borderColor:colors.keep,shadowColor:colors.keep,shadowOpacity:.28,shadowRadius:7,shadowOffset:{width:0,height:0},elevation:4},
  topMetricFreeHeroOn:{backgroundColor:'rgba(45,225,194,.20)',shadowOpacity:.55},
  topMetricFreeValue:{color:colors.keep,fontSize:18,fontWeight:'900'},topMetricFreeLabel:{color:colors.keep,fontSize:11,fontWeight:'900',letterSpacing:.8,marginTop:1},topMetricFreeHint:{color:colors.textMutedGrey,fontSize:11,fontWeight:'700',marginTop:1},
  topMetricSocialGroup:{flex:1,minWidth:0,minHeight:58,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:16,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
  topMetricSocialItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',paddingHorizontal:4,borderRightWidth:1,borderRightColor:colors.border},topMetricSocialLast:{borderRightWidth:0},topMetricSocialItemOn:{backgroundColor:'rgba(139,92,246,.18)'},topMetricFreeItem:{backgroundColor:'rgba(45,225,194,.08)'},topMetricFreeItemOn:{backgroundColor:'rgba(45,225,194,.18)'},topMetricFreeItemValue:{color:colors.keep,fontSize:15,fontWeight:'900'},topMetricFreeItemLabel:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.55,marginTop:2},
  topMetricMore:{width:48,minHeight:58,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},topMetricMoreOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},topMetricMoreIcon:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},topMetricMoreText:{color:colors.textMutedGrey,fontSize:7,fontWeight:'900',marginTop:2},
  topMetricValue:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},topMetricLabel:{color:colors.textMuted,fontSize:11,fontWeight:'800',marginTop:2,textAlign:'center'},
  topMetricsSecondary:{marginHorizontal:18,marginTop:6,minHeight:48,flexDirection:'row',borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,overflow:'hidden'},topMetricSecondaryItem:{flex:1,alignItems:'center',justifyContent:'center',borderRightWidth:1,borderRightColor:colors.border},
  topMetricsCommunity:{marginHorizontal:18,marginTop:6},
  metricInlinePanel:{marginHorizontal:18,marginTop:6,padding:12,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},freeInlineStats:{flexDirection:'row',gap:8},freeInlineStat:{flex:1,alignItems:'center',paddingVertical:8,borderRadius:12,backgroundColor:colors.backgroundCard},freeInlineValue:{color:colors.keep,fontSize:16,fontWeight:'900'},freeInlineValueSpent:{color:colors.danger},freeInlineValueWon:{color:colors.success},freeInlineValueLost:{color:colors.danger},freeInlineLabel:{color:colors.textMutedGrey,fontSize:8,fontWeight:'800',marginTop:2},freeInlineHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:9},freeInlineCta:{minHeight:38,marginTop:10,borderRadius:12,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},freeInlineCtaText:{color:colors.textPrimary,fontSize:9,fontWeight:'900',letterSpacing:.45},repriseInlineRail:{gap:9,paddingVertical:4,paddingRight:8},repriseInlineCard:{width:88,padding:8,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center'},repriseInlineAvatar:{width:38,height:38,borderRadius:19},repriseInlineName:{color:colors.textPrimary,fontSize:9,fontWeight:'900',marginTop:5,maxWidth:72},repriseInlineMeta:{color:colors.textMutedGrey,fontSize:8,fontWeight:'700',marginTop:2},repriseInlineMore:{color:colors.textMutedGrey,fontSize:9,fontWeight:'700',marginTop:8},
  communitySection:{marginHorizontal:18,gap:2},
  ownerCommerceStrip:{marginHorizontal:18,marginTop:12,padding:12,borderRadius:20,backgroundColor:colors.successFaint,borderWidth:1,borderColor:colors.keep,flexDirection:'row',alignItems:'center',gap:10},
  ownerCommercePulse:{width:40,height:40,borderRadius:20,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center'},
  ownerCommercePulseText:{color:colors.keep,fontSize:17,fontWeight:'900'},
  ownerCommerceCopy:{flex:1,minWidth:0},
  ownerCommerceKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:.9},
  ownerCommerceTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:2},
  ownerCommerceMeta:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,marginTop:2},
  ownerCommerceArrow:{color:colors.keep,fontSize:26,fontWeight:'700'},
  ownerEmptyUniverse:{marginHorizontal:18,marginTop:14,padding:16,borderRadius:22,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary,gap:8},
  ownerEmptyKicker:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},
  ownerEmptyTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},
  ownerEmptyText:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,marginBottom:4},
  manageMusicButton:{marginHorizontal:18,marginTop:10},
  dnaCountHint:{color:colors.textMutedGrey,fontSize:11,fontWeight:'700',marginTop:2},
  dnaSeeAll:{marginTop:10,minHeight:38,borderRadius:19,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  dnaSeeAllText:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.6},
  collectionHeader:{marginHorizontal:18,marginTop:16,flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'},collectionTitle:{color:colors.textPrimary,fontSize:19,fontWeight:'700'},collectionCount:{color:colors.textMuted,fontSize:13,fontWeight:'600'},
  tabsRow:{marginTop:10,paddingHorizontal:10,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},tabs:{flex:1,flexDirection:'row'},tab:{flex:1,alignItems:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},indicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},filterButton:{marginBottom:8,minHeight:30,paddingHorizontal:12,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},filterButtonText:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},
  keepList:{marginHorizontal:18,marginTop:10,gap:7},ownerKeepHint:{color:colors.textMuted,fontSize:12,lineHeight:17,marginBottom:2},
  ownerMusicInfo:{marginBottom:8,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:10,paddingVertical:8},
  ownerMusicInfoHeader:{flexDirection:'row',alignItems:'center',gap:8},
  ownerKeepHintCompact:{flex:1,color:colors.textSecondary,fontSize:10,lineHeight:14,fontWeight:'800'},
  ownerMusicInfoToggle:{minHeight:28,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:4},
  ownerMusicInfoToggleText:{color:colors.primaryLight,fontSize:9,fontWeight:'900',textDecorationLine:'underline'},
  ownerMusicInfoChevron:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},
  ownerMusicInfoText:{color:colors.textSecondary,fontSize:10,lineHeight:15,marginTop:7},
  // Adel (21/09/2026) : hauteur fixe (64) explicite sur la rangée
  // principale -- plus jamais de variation selon le contenu. Le panneau
  // dépliable (expandedPanel) vit HORS de cette rangée, dans trackCard.
  // Adel (21/09/2026, maquette interactive validée) : la grille elle-même
  // (pochette/titre/carrés/chevron/panneau) vit désormais dans
  // TrackActionRow.tsx (source de vérité unique) -- ne restent ici que les
  // styles propres au contenu du panneau déplié de cet écran.
  firstKeepBlock:{gap:2},firstKeepRow:{flexDirection:'row',alignItems:'center',gap:8},firstKeepBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:10,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success},firstKeepBadgeText:{color:colors.success,fontSize:11,fontWeight:'900'},firstKeepCount:{color:colors.textMuted,fontSize:11,fontWeight:'800'},firstKeepLine:{color:colors.textMuted,fontSize:11,lineHeight:15},trackMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,flexWrap:'wrap'},discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'},originLabel:{color:colors.textPrimary,fontSize:12,fontWeight:'800',letterSpacing:.1},originUserLink:{minHeight:24,paddingHorizontal:8,borderRadius:12,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success,alignItems:'center',justifyContent:'center'},originUserText:{color:colors.success,fontSize:12,fontWeight:'900'},originProtected:{color:colors.success,fontSize:12,fontWeight:'800'},
  list:{marginHorizontal:18,marginTop:10},playlistBlock:{borderBottomWidth:1,borderBottomColor:colors.border,paddingBottom:6},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:10},note:{width:38,height:38,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},noteText:{color:colors.primaryLight,fontSize:18,fontWeight:'800'},playlistText:{flex:1,minWidth:0,marginLeft:12},listText:{color:colors.textPrimary,fontSize:14,fontWeight:'600'},playlistCount:{color:colors.textMuted,fontSize:12,marginTop:2},chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900',paddingHorizontal:7},playlistButtons:{flexDirection:'row',justifyContent:'flex-end',gap:7,paddingBottom:6},playlistShareButton:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},playlistShareText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},playlistShareButtonSecondary:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},playlistShareTextSecondary:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},playlistTracks:{paddingBottom:8,paddingLeft:6},empty:{alignItems:'center',paddingVertical:50,paddingHorizontal:20},emptyIcon:{color:colors.primaryLight,fontSize:28,marginBottom:10},
  pulseTasteBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,.88)',alignItems:'center',justifyContent:'center',paddingHorizontal:12,paddingVertical:22},pulseTasteBack:{alignSelf:'stretch',maxWidth:640,width:'100%',minHeight:40,justifyContent:'center',marginBottom:6},pulseTasteBackText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},menuDrawerBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.52)',justifyContent:'flex-start',alignItems:'flex-end'},menuDrawer:{width:'86%',maxWidth:360,height:'100%',backgroundColor:colors.backgroundCard,borderLeftWidth:1,borderLeftColor:colors.border,paddingTop:52,paddingHorizontal:16,paddingBottom:24},modalBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,0.78)',justifyContent:'center',alignItems:'center',padding:14},shareSheet:{width:'100%',maxWidth:520,backgroundColor:colors.backgroundElevated,borderRadius:26,borderWidth:1,borderColor:colors.border,padding:18,paddingBottom:24},sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:colors.border,alignSelf:'center',marginBottom:16},communityHelpHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},communityHelpCopy:{flex:1,minWidth:0},communityHelpButton:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},communityHelpButtonText:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},shareTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',textAlign:'center'},shareSubtitle:{color:colors.textMuted,fontSize:14,lineHeight:20,textAlign:'center',marginTop:6},freeEmptyCallout:{marginTop:14,padding:12,borderRadius:14,backgroundColor:`${colors.danger}1F`,borderWidth:1,borderColor:colors.danger},freeEmptyCalloutTitle:{color:colors.danger,fontSize:13,fontWeight:'900',marginBottom:6},freeEmptyCalloutText:{color:colors.textPrimary,fontSize:12,lineHeight:17,marginTop:3},linkPreview:{marginTop:14,padding:11,borderRadius:12,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border},linkPreviewText:{color:colors.primaryLight,fontSize:13,textAlign:'center'},shareActionPrimary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},shareActionPrimaryText:{color:'#FFF',fontSize:14,fontWeight:'900'},shareAction:{minHeight:48,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,paddingHorizontal:14,justifyContent:'center',marginTop:9},shareActionText:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},shareCompactRow:{flexDirection:'row',gap:8,marginTop:10,width:'100%'},shareCompactAction:{flex:1,minWidth:0},shareCompactText:{color:colors.textPrimary,fontSize:10,fontWeight:'900',letterSpacing:.45,textAlign:'center'},shareActionHint:{color:colors.textMuted,fontSize:12,marginTop:2},cancelShare:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},kindPickerGrid:{gap:8,width:'100%',marginTop:14},kindChoice:{width:'100%',minHeight:48,paddingHorizontal:16,paddingVertical:10,borderRadius:15,backgroundColor:'rgba(92,168,252,.08)',borderWidth:1.5,borderColor:colors.info,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,shadowColor:colors.info,shadowOpacity:.12,shadowRadius:8,shadowOffset:{width:0,height:2},elevation:2},kindChoiceOn:{backgroundColor:colors.info,borderColor:colors.info,shadowOpacity:.26},kindChoiceText:{flex:1,color:colors.textPrimary,fontSize:13,fontWeight:'900'},kindChoiceHint:{color:colors.info,fontSize:9,fontWeight:'900',letterSpacing:.8},kindChoiceTextOn:{color:'#FFF'},repriseSheet:{maxHeight:'82%'},repriseScroll:{width:'100%',marginTop:12,maxHeight:420},repriseRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,borderBottomWidth:1,borderBottomColor:colors.border},repriseAvatar:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundCard},repriseInfo:{flex:1,minWidth:0},repriseNameRow:{flexDirection:'row',alignItems:'center',gap:6},repriseUsername:{color:'#FFF',fontSize:14,fontWeight:'900',flexShrink:1},repriseGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:4},repriseGenreChip:{paddingHorizontal:7,paddingVertical:2,borderRadius:9,borderWidth:1},repriseGenreText:{fontSize:9,fontWeight:'800'},repriseFollowButton:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},repriseFollowButtonOn:{backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success},repriseFollowButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},repriseFollowButtonTextOn:{color:colors.success},cancelShareText:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},
  qrShell:{width:'100%',maxWidth:520,maxHeight:'96%',alignItems:'center',backgroundColor:'#0E0A14',borderRadius:24,paddingTop:42,paddingHorizontal:4,paddingBottom:6,position:'relative'},qrCloseTop:{position:'absolute',right:10,top:8,width:44,height:44,borderRadius:22,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',zIndex:20},qrCloseTopText:{color:'#FFFFFF',fontSize:16,fontWeight:'900'},qrScroll:{width:'100%'},qrScrollContent:{alignItems:'center',paddingHorizontal:4,paddingBottom:8},qrCard:{width:'100%',backgroundColor:'#0B0A12',borderRadius:30,padding:18,borderWidth:1,borderColor:colors.primary,shadowColor:'#000',shadowOpacity:.42,shadowRadius:24,shadowOffset:{width:0,height:14},elevation:14},qrBrandRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},qrLogo:{color:'#FFFFFF',fontSize:30,fontWeight:'900',letterSpacing:7},qrMusic:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:3,marginTop:2},qrOfficial:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:5,borderRadius:99,backgroundColor:'rgba(124,92,252,.14)',borderWidth:1,borderColor:colors.primary},qrOfficialDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.keep},qrOfficialText:{color:'#FFF',fontSize:8,fontWeight:'900',letterSpacing:.8},qrIdentityRow:{flexDirection:'row',alignItems:'center',marginTop:18},qrAvatar:{width:72,height:72,borderRadius:36,backgroundColor:'#241936',borderWidth:2,borderColor:colors.primaryLight},qrAvatarFallback:{alignItems:'center',justifyContent:'center'},qrAvatarText:{color:colors.primaryLight,fontSize:27,fontWeight:'900'},qrIdentityText:{flex:1,marginLeft:13},qrHandle:{color:'#FFFFFF',fontSize:22,fontWeight:'900'},qrKindRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:4},qrKind:{color:colors.primaryLight,fontSize:11,fontWeight:'900'},qrLocation:{color:'#D8D2E5',fontSize:11,marginTop:5},qrBio:{color:'#F4EFF8',fontSize:12,lineHeight:17,marginTop:13},qrGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:10},qrGenre:{backgroundColor:'rgba(124,92,252,.12)',borderRadius:999,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:'rgba(167,139,250,.55)'},qrGenreText:{color:'#E6DCFF',fontSize:10,fontWeight:'800'},qrStats:{flexDirection:'row',alignItems:'center',justifyContent:'space-around',marginTop:14,paddingVertical:10,borderTopWidth:1,borderBottomWidth:1,borderColor:'rgba(167,139,250,.22)'},qrStat:{flex:1,alignItems:'center'},qrStatValue:{color:'#FFF',fontSize:17,fontWeight:'900'},qrStatLabel:{color:colors.textMutedGrey,fontSize:8,fontWeight:'900',letterSpacing:1,marginTop:2},qrStatDivider:{width:1,height:28,backgroundColor:'rgba(167,139,250,.22)'},qrCodeZone:{marginTop:15,flexDirection:'row',alignItems:'center',gap:12},qrBox:{padding:9,backgroundColor:'#FFFFFF',borderRadius:18,borderWidth:2,borderColor:colors.primary,shadowColor:'#7C5CFC',shadowOpacity:.25,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:6},qrCodeCopy:{flex:1,minWidth:0},qrScan:{color:'#FFFFFF',fontSize:10,fontWeight:'900',letterSpacing:1.1},qrReferral:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:6},qrFooter:{marginTop:15,paddingTop:11,borderTopWidth:1,borderColor:'rgba(167,139,250,.22)',alignItems:'center'},qrTagline:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1.1,textAlign:'center'},qrWebsite:{color:'#FFFFFF',fontSize:9,fontWeight:'800',textAlign:'center',marginTop:5,letterSpacing:.6},screenshotHint:{color:'#FFFFFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:10,paddingHorizontal:10},
});
