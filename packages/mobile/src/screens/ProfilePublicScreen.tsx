import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import QRCode from 'react-native-qrcode-svg';
import { canonicalArtistIdentity, CanonicalTrack, computeMusicDNA, DnaSourceDecision, groupTracksByArtist, ProviderPlaylist } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { ProfileKind, SocialLink } from '../types';
import { buildPublicProfileLink, sharePlaylist, shareProfile, shareProfileByEmail, shareProfileTrack } from '../services/sharingService';
import { loadCurrentPlanCode } from '../services/planService';
import { createProfileService } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { getDownloadCreditStatus } from '../services/creditService';
import { loadKeepBattleGlobalLeaderboard, loadMyActiveKeepBattleArena, loadMyKeepBattleCreditStatus, loadMyKeepBattleStats, KeepBattleStats } from '../services/keepBattleService';
import { getCommercialRules, getGrowthRewardStatus, getSmartSortAccess, GrowthRewardStatus, QuotaAccess } from '../services/growthAccessService';
import { isFeatureEnabled } from '../services/featureFlagService';
import { unlockWebAudioForGesture } from '../services/audioPreviewService';
import { loadUnreadNotificationCount, subscribeToNotificationChanges } from '../services/notificationService';
import { musicEngine } from '../services/musicEngine';
import { KeepPlaylistPreference, loadPlaylistPreferences, preferenceFor } from '../services/keepLibraryService';
import { isSmartAlbumUiId, loadOwnSmartAlbums, loadSmartAlbumTracks, persistEnrichedGenres, refreshOwnSmartAlbums, smartAlbumAsProviderPlaylist, SmartAlbumRecord } from '../services/smartAlbumService';
import { enrichMissingGenres } from '../services/keylessGenreService';
import { DiscoveryImpact, loadOwnProfileKeeps, loadOwnProfileSnapshot, loadProfileDiscoveryImpacts, loadProfileReprisers, loadPublicProfileSnapshot, OwnProfileSnapshot, ProfileCertificationTier, ProfileRepriser, PublicProfileKeep, PublicProfileSnapshot } from '../services/publicProfileStateService';
import UsernameAccountForm from '../components/UsernameAccountForm';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import SourceProfileQuickView from '../components/SourceProfileQuickView';
import ProfileCertificationBadge, { CERTIFICATION_META } from '../components/ProfileCertificationBadge';
import CommunityConnectionsPanel, { CommunityMode } from '../components/CommunityConnectionsPanel';
import ProfileCounterRow from '../components/ProfileCounterRow';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import PresenceDot from '../components/PresenceDot';
import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';
import PublicProfilePanel from '../components/PublicProfilePanel';
import CreatorToolsPanel from '../components/CreatorToolsPanel';
import HelpLegalPanel from '../components/HelpLegalPanel';
import AccountActionsPanel from '../components/AccountActionsPanel';

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
const MENU_ITEMS: { key: string; icon: string; label: string }[] = [
  { key: 'free', icon: '💛', label: 'Mon solde Free' },
  { key: 'profile', icon: '👤', label: 'Réglages du profil' },
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'music', icon: '🎧', label: 'Services musicaux' },
  { key: 'offers', icon: '💳', label: 'Offres & crédits' },
  { key: 'sellPlaylists', icon: '💰', label: 'Vendre mes musiques' },
  { key: 'publicProfile', icon: '🌐', label: 'Profil public, réseaux & site web' },
  { key: 'creator', icon: '🪪', label: 'Type de profil & outils créateur' },
  { key: 'help', icon: '🆘', label: 'Aide, légal & comptes bloqués' },
  { key: 'account', icon: '🚪', label: 'Compte & déconnexion' },
];

const LOCAL_PROFILE_PLAYLIST_ID = 'keep-local-history';
const TABS: { key: ProfileTab; label: string }[] = [
  // Adel (13/09/2026, audit) : "musique et artiste c'est la même chose ...
  // albums, je ne sais pas à quoi ça sert" -- vérifié sur les vraies
  // données : 93,9% des artistes gardés n'ont qu'un seul morceau, 98,8% des
  // albums aussi (on garde un morceau à la fois, pas un album entier).
  // Albums affichait donc quasi toujours la même chose qu'Artistes, avec le
  // même bloc d'affichage -- rubrique retirée plutôt que gardée pour rien.
  { key: 'TRACKS', label: 'Musiques' }, { key: 'PLAYLISTS', label: 'Vibes' }, { key: 'ARTISTS', label: 'Artistes' },
];
const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' }, { platform: 'tiktok', label: 'TikTok' }, { platform: 'snapchat', label: 'Snapchat' }, { platform: 'youtube', label: 'YouTube' }, { platform: 'x', label: 'X' }, { platform: 'facebook', label: 'Facebook' },
];
const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Établissement',
};

export default function ProfilePublicScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const syncUnsyncedKeeps = useSessionHistoryStore((s) => s.syncUnsyncedKeeps);
  const syncPendingFavoriteImports = useSessionHistoryStore((s) => s.syncPendingFavoriteImports);
  const [communityMode, setCommunityMode] = useState<CommunityMode>(null);
  const battleAvailable = useBattleAvailabilityStore((s) => s.available);
  const battleAvailabilityBusy = useBattleAvailabilityStore((s) => s.busy);
  const setBattleAvailable = useBattleAvailabilityStore((s) => s.setAvailable);
  const [battleFeatureEnabled, setBattleFeatureEnabled] = useState(false);
  const [battleAvailabilityInfoOpen, setBattleAvailabilityInfoOpen] = useState(false);
  useEffect(() => { let live = true; isKeepBattleEnabled().then((v) => live && setBattleFeatureEnabled(v)); return () => { live = false; }; }, []);
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
  const [planCode, setPlanCode] = useState('FREE');
  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [ownSnapshot, setOwnSnapshot] = useState<OwnProfileSnapshot | null>(null);
  const [serverOwnKeeps, setServerOwnKeeps] = useState<PublicProfileKeep[]>([]);
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
  const [freeWon, setFreeWon] = useState(0);
  const [freeLost, setFreeLost] = useState(0);
  // Adel (04/09/2026) : le coût réel d'un Garder (free_cost_per_keep, Super
  // Admin > Remote Config) était encore écrit en dur ("-1 Free") dans cette
  // même fenêtre -- devenu faux dès que l'admin change la valeur. Chargé
  // depuis la même source que l'écran Offres pour ne jamais désynchroniser.
  const [freeCostPerKeep, setFreeCostPerKeep] = useState(1);
  const [playlistSaleOffers, setPlaylistSaleOffers] = useState<any[]>([]);
  // Adel (07/09/2026) : "j'ai pas un petit pop pour sélectionner si je suis
  // un DJ, un hôtel etc. ... rien ne se passe, il me redirige sur les
  // paramètres" -- la pastille ouvrait les Réglages avancés au lieu d'un
  // choix direct sur place. Popup immédiat, même logique que
  // CreatorToolsPanel (changeKind).
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
    setRepriseFollowBusyId(repriser.profileId);
    try {
      if (repriser.isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', repriser.profileId);
      } else {
        await supabase.rpc('keep_follow_profile', { p_followee_id: repriser.profileId });
      }
      setReprisers((rows) => rows.map((r) => r.profileId === repriser.profileId ? { ...r, isFollowing: !r.isFollowing } : r));
    } catch {
      Alert.alert('Abonnement', 'Impossible de mettre à jour l’abonnement pour le moment.');
    } finally {
      setRepriseFollowBusyId(null);
    }
  };
  const [unreadCount, setUnreadCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);
  const [selectionSwipe, setSelectionSwipe] = useState<{ title: string; subtitle: string; tracks: CanonicalTrack[] } | null>(null);
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
  const openSelectionSwipe = (selection: { title: string; subtitle: string; tracks: CanonicalTrack[] }) => {
    unlockWebAudioForGesture();
    setSelectionSwipe(selection);
  };
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumRecord[]>([]);
  const [accountMode, setAccountMode] = useState<AccountMode>('create');
  const [pendingFollowUsername, setPendingFollowUsername] = useState('');
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
  const [dnaFeatureEnabled, setDnaFeatureEnabled] = useState(false);
  useEffect(() => { let live = true; isFeatureEnabled('keep_dna').then((enabled) => live && setDnaFeatureEnabled(enabled)); return () => { live = false; }; }, []);
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
    const check = () => { isFeatureEnabled('playlist_marketplace').then((enabled) => live && setMarketplaceEnabled(enabled)); };
    check();
    const unsubscribe = navigation?.addListener?.('focus', check);
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);

  const accountRequired = isLocalGuest || isDemoMode;
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
  const providerId = musicEngine.musicProvider.providerId || 'Loki';

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
      try {
        const [publicState, ownState, ownKeeps, impacts] = await Promise.all([
          loadPublicProfileSnapshot(user.id),
          loadOwnProfileSnapshot(),
          loadOwnProfileKeeps(),
          loadProfileDiscoveryImpacts(user.id),
        ]);
        if (live) {
          setPublicSnapshot(publicState);
          setOwnSnapshot(ownState);
          setServerOwnKeeps(ownKeeps);
          setDiscoveryImpacts(impacts);
        }
      } catch {
        if (live) {
          setPublicSnapshot(null);
          setOwnSnapshot(null);
          setServerOwnKeeps([]);
          setDiscoveryImpacts({});
        }
      }
    };
    void refreshCanonicalProfileState();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCanonicalProfileState(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);

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
      try {
        const battleStatus = await loadMyKeepBattleCreditStatus();
        if (!live) return;
        setFreeBalance(battleStatus.remainingFree);
        setFreeWon(battleStatus.won);
        setFreeLost(battleStatus.lost);
      } catch {
        if (!live) return;
        setFreeBalance(null);
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
  }, [accountRequired, navigation, sessions.length, user?.id]);

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
      const next = await loadPlaylistPreferences(providerId).catch(() => ({}));
      if (live) setPlaylistPreferences(next);
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
      } catch { if (live) setSmartAlbums([]); }
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
  })), [serverOwnKeeps]);
  const profileKeptTracks = accountRequired ? keptTracks : canonicalOwnKeeps;
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
  const dna = useMemo(() => {
    const decisions: DnaSourceDecision[] = publicKeptTracks.map((entry) => ({ artist: entry.track.artist, genres: entry.track.genres ?? [], decision: 'KEPT', createdAt: entry.detectedAt }));
    return computeMusicDNA(decisions);
  }, [publicKeptTracks]);
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
    const counts = new Map<string, number>();
    for (const entry of publicKeptTracks) for (const genre of entry.track.genres ?? []) {
      const clean = genre.trim();
      if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([genre, count]) => ({ genre, count }));
  }, [publicKeptTracks]);
  // Adel (14/09/2026, audit) : "est-ce que le système fait la différence du
  // style musical ?" -- la détection de genre existait déjà mais restait
  // réservée à Creator Pro/Venue Pro (Vibes Auto) et n'était jamais
  // partagée. Ici, en tâche de fond, pour TOUS les plans (jamais bloquant,
  // jamais visible si ça échoue) : les morceaux encore sans genre de CE
  // profil sont enrichis et partagés avec toute l'app -- plafonné pour ne
  // jamais spammer le catalogue gratuit à chaque ouverture d'écran.
  useEffect(() => {
    if (accountRequired) return undefined;
    const missing = publicKeptTracks.map((entry) => entry.track).filter((t) => !t.genres || t.genres.length === 0).slice(0, 15).map((t) => ({ id: t.id, title: t.title, artist: t.artist, genres: [] as string[] }));
    if (!missing.length) return undefined;
    let live = true;
    enrichMissingGenres(missing).then((enriched) => { if (live) void persistEnrichedGenres(enriched); }).catch(() => {});
    return () => { live = false; };
  }, [accountRequired, publicKeptTracks]);
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = smartAlbums.map(smartAlbumAsProviderPlaylist);
    if (providerPlaylists.length) result.push(...providerPlaylists);
    if (!result.length && publicKeptTracks.length) {
      const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);
      result.push({ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference?.name || 'Mes musiques', description: localPreference?.description || 'Morceaux publics gardés avec Loki', trackCount: publicKeptTracks.length, isKeepManaged: true });
    }
    return result;
  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length, smartAlbums]);

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.demoTitle}>Profil Loki</Text><Text style={s.muted}>Aucun compte actif.</Text><TouchableOpacity style={s.primary} onPress={enterDemoMode}><Text style={s.primaryText}>ENTRER EN MODE DÉMO</Text></TouchableOpacity></View></SafeAreaView>;

  const publicLinks = user.socialLinks.filter((link) => link.visibility === 'PUBLIC');
  const websiteLink = publicLinks.find((link) => link.platform === 'website' && link.url.trim());
  const openWebsite = async () => {
    if (!websiteLink) return;
    let url = websiteLink.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce site pour le moment.'); }
  };
  const publicProfileLink = buildPublicProfileLink(user.username);
  const identityGenres = user.favoriteGenres.length ? user.favoriteGenres.slice(0, 4) : dna.topGenres.slice(0, 4).map((g) => g.genre);
  const creditsExhausted = !creditUnlimited && creditRemaining === 0;
  // Adel (04/09/2026) : "le nombre de Free disponibles pour tout le monde
  // sur le profil" -- affiché quel que soit le plan désormais (avant : les
  // plans payants masquaient le compteur derrière leur nom commercial,
  // laissé "illimité" côté crédits de téléchargement uniquement).
  const planLabel = freeBalance != null ? `${freeBalance} FREE` : planCode;
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
    if (!marketplaceEnabled || !user || !supabase) { setPlaylistSaleOffers([]); return undefined; }
    let live = true;
    const loadOffers = async () => {
      try {
        const { data, error } = await supabase!
          .from('playlist_sale_offers')
          .select('*')
          .eq('seller_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (live && !error) setPlaylistSaleOffers(data || []);
        else if (live) setPlaylistSaleOffers([]);
      } catch {
        if (live) setPlaylistSaleOffers([]);
      }
    };
    void loadOffers();
    return () => { live = false; };
  }, [marketplaceEnabled, user?.id, supabase]);

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
    ? [{ key: 'USER', label: 'Utilisateur' }, { key: 'VENUE', label: 'Établissement' }]
    : [{ key: 'USER', label: 'Utilisateur' }, { key: 'CREATOR', label: 'Créateur' }, { key: 'DJ', label: 'DJ' }, { key: 'ARTIST', label: 'Artiste' }, { key: 'PRODUCER', label: 'Producteur' }];
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

  const openAccount = (mode: AccountMode = 'create', followUsername = '') => {
    setShareOpen(false);
    setPendingFollowUsername(followUsername.replace(/^@+/, ''));
    setAccountMode(mode);
    setAccountOpen(true);
  };

  const openShare = () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(true);
  };

  const openProfileSwipe = () => {
    if (!publicSwipeTracks.length) {
      Alert.alert('Loki Swipe', 'Aucun morceau public pour le moment. Rends au moins un morceau visible sur ton profil pour prévisualiser ton Swipe.');
      return;
    }
    // Ce tap est le dernier geste utilisateur synchrone avant la résolution
    // asynchrone de l'extrait. Il déverrouille l'élément audio web partagé afin
    // que la première carte puisse réellement démarrer seule sur Safari/iOS.
    unlockWebAudioForGesture();
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
      Alert.alert('Vibe Loki', 'Impossible de charger les morceaux de cette collection pour le moment.');
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
    if (!tracks.length) return Alert.alert('Vibe Loki', 'Cette collection ne contient pas encore de morceau à swiper.');
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
    return (
    <View key={key} style={s.trackCard}>
      {/* Adel (21/09/2026, maquette "Cartes Loki — nouveau design" validée) :
          hauteur fixe, titre/artiste tronqués -- Jouer et Partager sont des
          carrés 40×40 TOUJOURS visibles (jamais cachés derrière le chevron).
          Seuls le badge 1er KEEP et l'attribution restent dans le panneau. */}
      <View style={[s.keepRow, isPrivate && s.keepRowPrivate]}>
        {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.keepCover} /> : <View style={[s.keepCover, s.coverFallback]}><Text style={s.keepCoverK}>K</Text></View>}
        <View style={s.keepInfo}>
          <Text style={s.keepTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={s.keepArtist} numberOfLines={1}>{track.artist}</Text>
        </View>
        {isPrivate ? <Text style={s.privateLock} accessibilityLabel="Morceau privé">🔒</Text> : null}
        <View style={s.actionSquares}>
          <TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} square />
          <TouchableOpacity style={s.squareShare} onPress={() => void shareProfileTrack(user.username, track.title, track.artist)} accessibilityLabel="Partager ce morceau">
            <Text style={s.squareShareIcon}>↗</Text>
          </TouchableOpacity>
        </View>
        {hasDetails ? (
          <TouchableOpacity style={s.expandToggle} onPress={() => toggleTrackExpanded(key)} accessibilityLabel={expanded ? 'Masquer les détails' : 'Voir les détails : découverte'} accessibilityRole="button">
            <Text style={s.expandToggleText}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {expanded ? (
        <View style={s.expandedPanel}>
          {isFirstKeep ? (
            <View style={s.firstKeepBlock}>
              <View style={s.firstKeepRow}><View style={s.firstKeepBadge}><Text style={s.firstKeepBadgeText}>🥇 1er KEEP</Text></View><Text style={s.firstKeepCount}>{impact!.recoveryCount + 1} KEEPs</Text></View>
              <Text style={s.firstKeepLine}>@{user.username} a été le premier à KEEP ce son{daysAgo(detectedAt) != null ? ` · il y a ${daysAgo(detectedAt)}j` : ''}</Text>
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
        </View>
      ) : null}
    </View>
    );
  };

  const tabContent = () => {
    if (activeTab === 'TRACKS') {
      if (!publicKeptTracks.length && !privateKeptTracks.length) return <Empty text="Tes morceaux apparaîtront ici." />;
      return <View style={s.keepList}>
        <Text style={s.ownerKeepHint}>Loki construit ton univers : Vibes et artistes. Tu gardes le contrôle du Public/Privé et des noms.</Text>
        {publicKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null, entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId ? 'SOCIAL' : 'SELF', 'sourceCertificationTier' in entry ? entry.sourceCertificationTier : undefined, 'sourceIsFollowing' in entry ? entry.sourceIsFollowing : undefined, entry.detectedAt))}
        {/* Adel (21/09/2026) : "chaque musique est identifiée par un
            utilisateur, c'est l'idée de départ" -- un morceau privé reste
            rattaché à son découvreur comme n'importe quel autre, seule sa
            visibilité change (grisé + 🔒), jamais son attribution. */}
        {privateKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null, entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId ? 'SOCIAL' : 'SELF', 'sourceCertificationTier' in entry ? entry.sourceCertificationTier : undefined, 'sourceIsFollowing' in entry ? entry.sourceIsFollowing : undefined, entry.detectedAt, true))}
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
      return <View style={s.list}>{vibesHint}{displayPlaylists.map((playlist) => {
        const expanded = expandedPlaylistId === playlist.id;
        const tracks = playlistTracks[playlist.id] ?? [];
        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);
        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);
        const isPublic = preference?.isPublic ?? smart?.isPublic ?? false;
        return <View key={playlist.id} style={s.playlistBlock}>
          <TouchableOpacity style={s.listRow} onPress={() => void togglePlaylist(playlist)} accessibilityLabel={`Ouvrir ${playlist.name}`}>
            {playlist.coverUrl ? <Image source={{ uri: playlist.coverUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {isPublic ? 'Public' : 'Privé'}</Text></View>
            <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          <View style={s.playlistButtons}>
            <TouchableOpacity style={s.playlistShareButton} onPress={() => void openPlaylistSwipe(playlist)}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>
            {isPublic ? <TouchableOpacity style={s.playlistShareButtonSecondary} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareTextSecondary}>↗ Partager</Text></TouchableOpacity> : null}
          </View>
          {expanded ? <View style={s.playlistTracks}>{loadingPlaylistId === playlist.id ? <Text style={s.muted}>Chargement…</Text> : tracks.length ? tracks.map((track) => renderCompactTrack(track, `${playlist.id}-${track.id}`)) : <Text style={s.muted}>Aucun morceau dans cette playlist.</Text>}</View> : null}
        </View>;
      })}</View>;
    }

    const items = artists;
    if (!items.length) return <Empty text="Tes artistes apparaîtront ici." />;
    // Adel (01/09/2026) : "range les albums comme sur playlist" -- même bloc
    // encadré, même bouton ▶ SWIPE dédié et même dépli inline des morceaux
    // que l'onglet Vibes, plutôt qu'une simple ligne avec une note générique.
    return <View style={s.list}>{items.map((item) => {
      const selected = publicSwipeTracks.filter((track) => canonicalArtistIdentity(track) === item.key);
      const artworkUrl = selected.find((track) => track.artworkUrl)?.artworkUrl;
      const expanded = expandedGroupItem === item.key;
      return <View key={item.key} style={s.playlistBlock}>
        <TouchableOpacity style={s.listRow} onPress={() => setExpandedGroupItem(expanded ? null : item.key)} accessibilityLabel={`Ouvrir ${item.label}`}>
          {artworkUrl ? <Image source={{ uri: artworkUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
          <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item.label}</Text><Text style={s.playlistCount}>{selected.length} {selected.length > 1 ? 'morceaux' : 'morceau'}</Text></View>
          <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
        </TouchableOpacity>
        <View style={s.playlistButtons}>
          <TouchableOpacity style={s.playlistShareButton} onPress={() => openSelectionSwipe({ title: item.label, subtitle: 'Tous les morceaux de cet artiste dans ta collection.', tracks: selected })}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>
        </View>
        {expanded ? <View style={s.playlistTracks}>{selected.map((track) => renderCompactTrack(track, `${item.key}-${track.id}`))}</View> : null}
      </View>;
    })}</View>;
  };

  // Adel (16-17/09/2026) : "il y a une explication, et il y a ce qu'on doit
  // faire" -- chaque rubrique du menu affiche son explication SUR PLACE.
  // Seul "Mon solde Free" reste entièrement navigable ici (info pure) ;
  // les autres gardent un bouton "Ouvrir" vers leur écran dédié pour toute
  // action réellement complexe (achat, upload, connexion de service).
  const openFromMenu = (screen: string, params?: Record<string, unknown>) => { setMenuOpen(false); setExpandedMenuItem(null); navigation.navigate(screen, params); };
  const renderMenuDetail = (key: string) => {
    if (key === 'free') return <>
      <Text style={s.shareTitle}>Ton solde Free</Text>
      <Text style={s.shareSubtitle}>{freeBalance != null ? `${freeBalance} Free disponibles.` : 'Solde indisponible pour le moment.'}</Text>
      {freeBalance === 0 ? (
        <View style={s.freeEmptyCallout}>
          <Text style={s.freeEmptyCalloutTitle}>Solde à zéro : comment recharger ?</Text>
          <Text style={s.freeEmptyCalloutText}>1. Partage ton profil : chaque nouvel abonné qu'il t'apporte te rapporte des Free.</Text>
          <Text style={s.freeEmptyCalloutText}>2. Joue à Loki Battle : gagne des Free en répondant juste.</Text>
          <Text style={s.freeEmptyCalloutText}>3. Passe à une formule payante : plus de Free offerts chaque mois, sans attendre.</Text>
          <TouchableOpacity style={s.shareActionPrimary} onPress={() => { setMenuOpen(false); setExpandedMenuItem(null); void shareProfile(user.username); }}><Text style={s.shareActionPrimaryText}>PARTAGER MON PROFIL</Text></TouchableOpacity>
        </View>
      ) : null}
      <View style={s.linkPreview}>
        <Text style={s.linkPreviewText}>🎧 Écouter et reconnaître : toujours gratuit</Text>
        <Text style={s.linkPreviewText}>💾 Garder un morceau sur ton profil : -{freeCostPerKeep} Free</Text>
        <Text style={s.linkPreviewText}>🎮 Battle solo (entraînement) : gratuit</Text>
        <Text style={s.linkPreviewText}>⚡ Battle en ligne : mise de Free au départ</Text>
        <Text style={s.linkPreviewText}>🏆 Gagné au Battle au total : +{freeWon} Free</Text>
        <Text style={s.linkPreviewText}>💔 Perdu au Battle au total : -{freeLost} Free</Text>
        <Text style={s.linkPreviewText}>📅 Free offerts chaque mois selon ta formule — prochain versement dans {daysUntilNextFreeCredit} jour{daysUntilNextFreeCredit > 1 ? 's' : ''} (le 1er du mois)</Text>
      </View>
      <TouchableOpacity style={s.shareActionPrimary} onPress={() => openFromMenu('Offers')}><Text style={s.shareActionPrimaryText}>VOIR LES OFFRES</Text></TouchableOpacity>
    </>;

    if (key === 'profile') return <>
      <Text style={s.shareTitle}>Réglages du profil</Text>
      <Text style={s.shareSubtitle}>@{user.username} · modifie ta photo, ta bio, ton pseudo, et retrouve le bouton pour te déconnecter.</Text>
      <TouchableOpacity style={s.shareActionPrimary} onPress={() => openFromMenu('ProfileSettings')}><Text style={s.shareActionPrimaryText}>OUVRIR LES RÉGLAGES</Text></TouchableOpacity>
    </>;

    if (key === 'notifications') return <>
      <Text style={s.shareTitle}>Notifications</Text>
      <Text style={s.shareSubtitle}>{unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}.` : 'Tu es à jour, aucune notification en attente.'} Nouveaux abonnés, reprises de tes découvertes, réponses à tes soirées : tout arrive ici.</Text>
      <TouchableOpacity style={s.shareActionPrimary} onPress={() => openFromMenu('Notifications')}><Text style={s.shareActionPrimaryText}>VOIR MES NOTIFICATIONS</Text></TouchableOpacity>
    </>;

    if (key === 'music') return <>
      <Text style={s.shareTitle}>Services musicaux</Text>
      <Text style={s.shareSubtitle}>Connecte Spotify, Deezer, YouTube Music ou SoundCloud pour importer tes favoris et garder ta musique automatiquement. Le nombre de services actifs en même temps dépend de ta formule.</Text>
      <TouchableOpacity style={s.shareActionPrimary} onPress={() => openFromMenu('MusicConnections')}><Text style={s.shareActionPrimaryText}>GÉRER MES SERVICES</Text></TouchableOpacity>
    </>;

    if (key === 'offers') return <>
      <Text style={s.shareTitle}>Offres &amp; crédits</Text>
      <Text style={s.shareSubtitle}>Formule actuelle : {planCode}. {creditUnlimited ? 'Téléchargements illimités.' : creditRemaining != null ? `${creditRemaining} téléchargement${creditRemaining > 1 ? 's' : ''} restant${creditRemaining > 1 ? 's' : ''}.` : ''} Compare Premium, Creator Pro et Venue Pro, et vois tous les avantages en détail.</Text>
      <TouchableOpacity style={s.shareActionPrimary} onPress={() => openFromMenu('Offers')}><Text style={s.shareActionPrimaryText}>VOIR LES OFFRES</Text></TouchableOpacity>
    </>;

    if (key === 'sellPlaylists') return <>
      <Text style={s.shareTitle}>Vendre mes playlists</Text>
      <Text style={s.shareSubtitle}>Depuis l'onglet Playlists, appuie sur "VENDRE" sur une playlist, un album (groupe par artiste) ou un seul morceau -- prix fixe entre 0,50€ et 10€, à choisir dans une liste, rien à écrire. L'acheteur paie directement sur ton lien de paiement personnel, Loki ne touche jamais cet argent. Débloqué à partir d'un certain nombre d'abonnés. Retrouve ici toutes tes ventes en cours et les paiements à confirmer.</Text>
      <TouchableOpacity style={s.shareActionPrimary} onPress={() => openFromMenu('PlaylistSale')}><Text style={s.shareActionPrimaryText}>GÉRER MES VENTES</Text></TouchableOpacity>
    </>;

    if (key === 'publicProfile') return <>
      <Text style={s.shareTitle}>Profil public, réseaux &amp; site web</Text>
      <PublicProfilePanel navigation={navigation} />
    </>;

    if (key === 'creator') return <>
      <Text style={s.shareTitle}>Type de profil &amp; outils créateur</Text>
      <CreatorToolsPanel navigation={navigation} />
    </>;

    if (key === 'help') return <>
      <Text style={s.shareTitle}>Aide, légal &amp; comptes bloqués</Text>
      <HelpLegalPanel profileId={user.id} username={user.username} enabled={!accountRequired} />
    </>;

    if (key === 'account') return <>
      <Text style={s.shareTitle}>Compte &amp; déconnexion</Text>
      <AccountActionsPanel />
    </>;

    return null;
  };

  return <SafeAreaView style={s.container}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topBar}>
        <TouchableOpacity style={[s.plan, planStyle]} onPress={() => { setMenuOpen(true); setExpandedMenuItem('free'); }} accessibilityLabel="Solde Free et historique"><Text style={s.planText}>{planLabel}</Text></TouchableOpacity>
        <View style={s.actions}>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Notifications')} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}>
            <Text style={s.bell}>🔔</Text>
            {unreadCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.menuButton} onPress={() => setMenuOpen(true)} accessibilityLabel="Menu du profil"><Text style={s.menuText}>☰</Text></TouchableOpacity>
        </View>
      </View>

      <View style={s.hero}>
        <View style={s.identity}>
          {user.avatar ? <Image source={{uri:user.avatar}} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>K</Text></View>}
          <View style={s.identityText}>
            <View style={s.usernameLine}><Text style={s.username}>{user.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
            <View style={s.profileMetaLeft}>
              {/* Adel (07/09/2026) : "quand il a la pastille payante ... il a
                  la possibilité de cliquer dessus et il peut changer DJ etc."
                  -- Creator Pro (9,99 €) et Venue Pro (29,99 €) débloquent
                  déjà le changement de type de profil (CreatorToolsPanel,
                  Réglages avancés) ; raccourci direct depuis la pastille au
                  lieu d'obliger à chercher dans les réglages. Même couleur
                  que la certification, comme pour le badge Free. */}
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
                  onPress={() => Alert.alert(
                    'Débloque DJ, Artiste, Créateur, Producteur…',
                    'Passe à Creator Pro pour changer ton profil en DJ, Artiste, Créateur ou Producteur. Passe à Venue Pro si tu es un lieu ou un établissement.',
                    [
                      { text: 'Plus tard', style: 'cancel' },
                      { text: 'Établissement · Venue Pro', onPress: () => navigation.navigate('Offers', { focusPlan: 'VENUE_PRO' }) },
                      { text: 'DJ / Artiste · Creator Pro', onPress: () => navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO' }) },
                    ],
                  )}
                  accessibilityRole="button"
                  accessibilityLabel="Voir comment débloquer DJ, Artiste, Créateur ou Producteur"
                >
                  <Text style={[s.kindBadgeText, { color: certificationColors.ring }]}>{PROFILE_KIND_LABELS[user.kind]}</Text>
                </TouchableOpacity>
              )}
              {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
            </View>
          </View>
        </View>
        {accountRequired ? <TouchableOpacity style={s.accountBanner} onPress={() => openAccount('create')}><Text style={s.accountBannerTitle}>Créer mon compte Loki</Text><Text style={s.accountBannerText}>Conserve ton profil avec ton identifiant Loki, ton mot de passe et une adresse e-mail vérifiée.</Text></TouchableOpacity> : null}
        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        {/* DESIGN_SYSTEM v3 (21/09/2026) : SWIPE devient l'action plein-largeur
            (violet, principale) juste sous l'identité ; PARTAGER redescend en
            action secondaire (grise), conformément à la hiérarchie des
            couleurs v3 (violet = actions principales uniquement). */}
        <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser ma collection en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
        <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerShareTextSecondary}>PARTAGER</Text></TouchableOpacity>
      </View>

      {/* DESIGN_SYSTEM v3 (21/09/2026) : ordre d'implémentation -- 5) collection
          + Filtrer, 9) offres actives, 10) communauté (4 compteurs), 11)
          progression Creator Pro, 12) Battle & présence, 13) Loki DNA, 14)
          liens & réseaux. Zéro suppression : chaque bloc ci-dessous existait
          déjà plus haut dans l'écran, seul l'ordre d'affichage change. */}
      <View style={s.collectionHeader}>
        <Text style={s.collectionTitle}>Ma collection</Text>
        <Text style={s.collectionCount}>{profileTotalKeepCount} {profileTotalKeepCount > 1 ? 'morceaux' : 'morceau'}</Text>
      </View>
      <View style={s.tabsRow}>
        <View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityLabel={`Profil ${tab.label}`} accessibilityState={{ selected: activeTab === tab.key }} style={s.tab} onPress={()=>switchProfileTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>
        {activeTab === 'TRACKS' && trackGenreOptions.length > 0 ? (
          <TouchableOpacity style={s.filterButton} onPress={() => setStyleModalOpen(true)} accessibilityLabel={`Filtrer par style, ${trackGenreOptions.length} disponibles`}>
            <Text style={s.filterButtonText}>Filtrer</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View key={`profile-tab-${activeTab}`}>{tabContent()}</View>

      {/* (21/09/2026) Adel a signalé un bouton "ACHETER" vert sur le
          profil -- c'était CE bloc : il s'affichait sur son PROPRE profil
          (playlistSaleOffers = ses propres offres, seller_id = user.id) et
          ne pouvait jamais aboutir (le serveur refuse CANNOT_BUY_OWN_PLAYLIST).
          Un vendeur ne doit jamais voir un CTA d'achat sur sa propre offre ;
          la gestion (modifier/retirer) vit déjà dans le menu "Vendre mes
          playlists" (PlaylistSalePanel). Remplacé par un simple statut. */}
      {marketplaceEnabled && playlistSaleOffers.length > 0 ? (
        <View style={s.ownOffersStatus}>
          <Text style={s.ownOffersStatusText}>
            🏷️ {playlistSaleOffers.length} découverte{playlistSaleOffers.length > 1 ? 's' : ''} musicale{playlistSaleOffers.length > 1 ? 's' : ''} en vente
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('PlaylistSale')} accessibilityLabel="Gérer mes découvertes en vente">
            <Text style={s.ownOffersManageLink}>Gérer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={s.communitySection}>
        {/* Adel (09/09/2026) : "abonnement on devrait le descendre a la
            place du bouton reprise et reprise le remonter a la place de
            abonnement ... des fois il peut avoir 15 reprises mais
            uniquement trois abonnes ... c'est comme si il s'est
            indirectement abonne" -- Reprises (portee reelle, y compris les
            gens non abonnes qui ont quand meme garde un morceau) rejoint
            Abonnes ; Abonnements descend a cote de Morceaux. */}
        <ProfileCounterRow kind="connections" items={[
          { value: profileFollowerCount, label: 'Abonnés', active: communityMode === 'followers', onPress: () => setCommunityMode((v) => v === 'followers' ? null : 'followers') },
          { value: profileUserKeepCount, label: 'Reprises', onPress: () => setRepriseListOpen(true) },
        ]} />
        {!accountRequired && communityMode === 'followers' ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} mode={communityMode} /> : null}
        <ProfileCounterRow kind="keeps" items={[
          { value: profileTotalKeepCount, label: 'Morceaux', onPress: () => switchProfileTab('TRACKS') },
          { value: profileFollowingCount, label: 'Abonnements', active: communityMode === 'following', onPress: () => setCommunityMode((v) => v === 'following' ? null : 'following') },
        ]} />
        {!accountRequired && communityMode === 'following' ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} mode={communityMode} /> : null}
      </View>

      {!accountRequired && growthStatus ? (
        growthStatus.audienceProUnlocked ? (
          // Adel (15/09/2026) : "je veux que quand on clique dessus, il y
          // ait un petit pop-up qui explique à quoi ça va servir. Qu'est-ce
          // que ça débloque, quels seront les avantages ?" -- réponse
          // honnête, sans inventer d'avantage qui n'existe pas encore.
          <TouchableOpacity style={[s.growthPanel, s.sectionMargin]} onPress={() => Alert.alert(
            '🏆 Audience Pro débloquée',
            `Ce badge signale à toute la communauté que tu as une vraie audience (${growthStatus.audienceProThreshold ?? 1000}+ abonnés).\n\nAvantages déjà actifs :\n· Free en bonus sur ton solde\n· Des profils Découverte et essais Vibes Auto en plus, gagnés à mesure que ta communauté grandit\n\nC'est aussi le premier palier vers la vente de playlists (déblocage séparé, par abonnés) quand tu en as assez.`,
          )}><Text style={s.growthBadgeText}>🏆 AUDIENCE PRO DÉBLOQUÉE · {growthStatus.followers} abonnés</Text><Text style={[s.growthText, { textAlign: 'center', marginTop: 4 }]}>Toucher pour voir les avantages ⓘ</Text></TouchableOpacity>
        ) : growthStatus.nextFollowerGoal ? (
          <View style={[s.growthPanel, s.sectionMargin]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={[s.growthText, { flex: 1 }]}>{growthStatus.followers}/{growthStatus.nextFollowerGoal} abonnés · encore {Math.max(0, growthStatus.nextFollowerGoal - growthStatus.followers)} avant ton prochain bonus Loki</Text>
              {/* Adel (14/09/2026) : "un point d'interrogation, il met une
                  explication claire. C'est quoi le bonus ?" -- les paliers
                  d'abonnés (25/100/250/500/1000) donnent des bonus
                  différents (profils Découverte, essais Vibes Auto, Free,
                  Audience Pro à 1000) ; jamais un seul type de bonus,
                  d'où une explication générale plutôt qu'un chiffre figé
                  qui pourrait se tromper si Adel change les seuils. */}
              <TouchableOpacity hitSlop={8} onPress={() => Alert.alert('Bonus Loki', 'Chaque palier d’abonnés débloque un bonus différent : des profils Découverte en plus, des essais Vibes Auto gratuits, du Free en plus, et à 1000 abonnés le badge Audience Pro. Plus tu as d’abonnés, plus les bonus grandissent.')}>
                <Text style={{ color: colors.primaryLight, fontSize: 15, fontWeight: '900', marginLeft: 6 }}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <View style={s.growthBarTrack}><View style={[s.growthBarFill, { width: `${Math.min(100, Math.round((growthStatus.followers / growthStatus.nextFollowerGoal) * 100))}%` }]} /></View>
          </View>
        ) : null
      ) : null}

      {/* Adel (02/09/2026) : "le bouton est parfait, par contre je le ferai
          un tout petit peu plus petit ... mettre un petit bouton info pour
          comprendre" -- ligne compacte (juste Disponible/Indisponible),
          l'explication ne s'affiche plus que sur demande via le ⓘ. */}
      {battleFeatureEnabled && !accountRequired ? (
        <View style={s.sectionMargin}>
          <View style={[s.battleAvailabilityRow, battleAvailable && s.battleAvailabilityRowOn]}>
            <TouchableOpacity
              style={s.battleAvailabilityMain}
              disabled={battleAvailabilityBusy}
              onPress={() => { void setBattleAvailable(!battleAvailable); }}
              accessibilityRole="switch"
              accessibilityState={{ checked: battleAvailable }}
              accessibilityLabel="Disponible pour un Battle"
            >
              <PresenceDot online={battleAvailable} />
              <Text style={s.battleAvailabilityTitle}>{battleAvailable ? 'Disponible' : 'Indisponible'}</Text>
            </TouchableOpacity>
            <TouchableOpacity hitSlop={8} onPress={() => setBattleAvailabilityInfoOpen((v) => !v)} accessibilityRole="button" accessibilityLabel="Comment marche la disponibilité Battle">
              <Text style={s.battleAvailabilityInfoIcon}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          {battleAvailabilityInfoOpen ? (
            <Text style={s.battleAvailabilityHint}>Reçois des invitations Battle même ailleurs dans Loki, sans jouer en solo. Pour lancer un défi : Soirées → Loki BATTLE.</Text>
          ) : null}
          {/* DESIGN_SYSTEM v3 (21/09/2026) : victoires/rang/partie en cours --
              lus depuis Supabase (keep_battle_my_stats, keep_battle_global_
              leaderboard, arène active) ; rien ne s'affiche tant que ces
              appels n'ont pas répondu, jamais un chiffre par défaut inventé. */}
          {battleStats ? (
            <Text style={s.battlePresenceLine}>🏆 {battleStats.wins} victoire{battleStats.wins > 1 ? 's' : ''}{battleInProgress ? ' · ⚡ Partie en cours' : ''} · {battleRank ? `Rang #${battleRank}` : 'Non classé'}</Text>
          ) : null}
        </View>
      ) : null}

      {dnaFeatureEnabled && (
        <View style={s.dna}>
          <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>Loki DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
          {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=>{
            const match = trackGenreOptions.find((row) => row.genre === g.genre);
            return match ? (
              <TouchableOpacity key={g.genre} style={s.chip} onPress={() => openSelectionSwipe({ title: g.genre, subtitle: `Tes morceaux ${g.genre} dans ta collection.`, tracks: publicSwipeTracks.filter((track) => (track.genres ?? []).some((genre) => genre.trim() === g.genre)) })}><Text style={s.chipText}>{g.genre}</Text></TouchableOpacity>
            ) : <View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>;
          })}</View> : <Text style={s.muted}>Commence une session Loki pour construire ton ADN musical.</Text>}
        </View>
      )}

      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

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
      subtitle="Aperçu exact du Swipe proposé à tes abonnés."
      emptyTitle="Aucun morceau public à prévisualiser."
      backLabel="REVENIR AU PROFIL"
      previewOnly
      onClose={() => setProfileSwipeOpen(false)}
    />

    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => (expandedMenuItem ? setExpandedMenuItem(null) : setMenuOpen(false))}>
      <View style={s.modalBackdrop}><View style={s.shareSheet}>
        <View style={s.sheetHandle} />
        {expandedMenuItem ? (
          <>
            <TouchableOpacity style={s.menuBackRow} onPress={() => setExpandedMenuItem(null)}><Text style={s.menuBackText}>‹ Menu</Text></TouchableOpacity>
            <ScrollView style={{ maxHeight: 440 }}>{renderMenuDetail(expandedMenuItem)}</ScrollView>
          </>
        ) : (
          <>
            <Text style={s.shareTitle}>Menu</Text>
            <ScrollView style={{ maxHeight: 440, marginTop: 4 }}>
              {MENU_ITEMS.filter((item) => item.key !== 'sellPlaylists' || marketplaceEnabled).map((item) => (
                <TouchableOpacity key={item.key} style={s.listRow} onPress={() => setExpandedMenuItem(item.key)}>
                  <Text style={[s.listText, { flex: 1 }]}>{item.icon} {item.label}</Text>
                  {item.key === 'free' ? <Text style={s.playlistCount}>{freeBalance ?? '…'}</Text> : null}
                  {item.key === 'notifications' && unreadCount > 0 ? <Text style={s.playlistCount}>{unreadCount > 99 ? '99+' : unreadCount}</Text> : null}
                  <Text style={s.menuChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
        <TouchableOpacity style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 }} onPress={() => { setMenuOpen(false); setExpandedMenuItem(null); }}><Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>Fermer</Text></TouchableOpacity>
      </View></View>
    </Modal>

    <Modal visible={styleModalOpen} transparent animationType="fade" onRequestClose={() => setStyleModalOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.shareSheet}>
        <Text style={s.shareTitle}>Parcourir par style</Text>
        <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
          {trackGenreOptions.map(({ genre, count }) => (
            <TouchableOpacity key={genre} style={s.listRow} onPress={() => { setStyleModalOpen(false); openSelectionSwipe({ title: genre, subtitle: `Tes morceaux ${genre} dans ta collection.`, tracks: publicSwipeTracks.filter((track) => (track.genres ?? []).some((g) => g.trim() === genre)) }); }}>
              <Text style={[s.listText, { flex: 1 }]}>{genre}</Text>
              <Text style={s.playlistCount}>{count}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 }} onPress={() => setStyleModalOpen(false)}><Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>Fermer</Text></TouchableOpacity>
      </View></View>
    </Modal>

    <MusicSwipeDeckModal
      visible={Boolean(selectionSwipe)}
      tracks={selectionSwipe?.tracks ?? []}
      title={selectionSwipe?.title ?? 'Vibe Loki'}
      subtitle={selectionSwipe?.subtitle ?? 'Ta sélection.'}
      emptyTitle="Aucun morceau dans cette sélection."
      backLabel="REVENIR AU PROFIL"
      previewOnly
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

    <Modal visible={accountOpen} transparent animationType="fade" onRequestClose={() => { setAccountOpen(false); setPendingFollowUsername(''); }}>
      <View style={s.modalBackdrop}>
        <View style={[s.shareSheet, s.accountSheet]}>
          <View style={s.sheetHandle} />
          <UsernameAccountForm initialMode={accountMode} followUsername={pendingFollowUsername} onSuccess={() => { setAccountOpen(false); setPendingFollowUsername(''); }} />
          <TouchableOpacity style={s.cancelShare} onPress={() => { setAccountOpen(false); setPendingFollowUsername(''); }}><Text style={s.cancelShareText}>CONTINUER EN MODE DÉMO</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={kindPickerOpen} transparent animationType="fade" onRequestClose={() => setKindPickerOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Type de profil</Text>
          <Text style={s.shareSubtitle}>Ta formule {planCode === 'VENUE_PRO' ? 'Lieu Pro' : 'Créateur Pro'} te permet de changer de type à tout moment.</Text>
          <View style={s.kindPickerGrid}>
            {kindChoices.map((choice) => (
              <TouchableOpacity key={choice.key} disabled={kindChangeBusy} style={[s.kindChoice, user.kind === choice.key && s.kindChoiceOn]} onPress={() => void changeKind(choice.key)}>
                <Text style={[s.kindChoiceText, user.kind === choice.key && s.kindChoiceTextOn]}>{choice.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelShare} onPress={() => setKindPickerOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={repriseListOpen} transparent animationType="fade" onRequestClose={() => setRepriseListOpen(false)}>
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
                    <Text style={[s.repriseFollowButtonText, r.isFollowing && s.repriseFollowButtonTextOn]}>{repriseFollowBusyId === r.profileId ? '…' : r.isFollowing ? 'ABONNÉ' : 'SUIVRE'}</Text>
                  </TouchableOpacity>
                </View>
              );
            }) : <Text style={s.muted}>Personne n’a encore repris tes morceaux.</Text>}
          </ScrollView>
          <TouchableOpacity style={s.cancelShare} onPress={() => setRepriseListOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Partager mon profil Loki</Text>
          <Text style={s.shareSubtitle}>Ton univers musical tient dans un lien. Fais découvrir ton Loki DNA, tes Vibes, tes réseaux et ce qui te ressemble.</Text>
          <View style={s.linkPreview}><Text style={s.linkPreviewText} numberOfLines={2}>{publicProfileLink}</Text></View>
          <TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>FAIRE DÉCOUVRIR MON Loki</Text></TouchableOpacity>
          <TouchableOpacity style={s.shareAction} onPress={shareEmail}><Text style={s.shareActionText}>✉  Partager par e-mail</Text><Text style={s.shareActionHint}>Ton application Mail s’ouvre, tu choisis les destinataires</Text></TouchableOpacity>
          <TouchableOpacity style={s.shareAction} onPress={showQr}><Text style={s.shareActionText}>▦  Mon QR Loki</Text><Text style={s.shareActionHint}>Carte d’identité musicale prête pour une story</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setShareOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.qrShell}>
          <TouchableOpacity style={s.qrCloseTop} onPress={() => setQrOpen(false)} accessibilityLabel="Fermer le QR Loki"><Text style={s.qrCloseTopText}>✕</Text></TouchableOpacity>
          <ScrollView style={s.qrScroll} contentContainerStyle={s.qrScrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.qrCard}>
            <View style={s.qrBrandRow}><Text style={s.qrLogo}>Loki</Text><Text style={s.qrDnaLabel}>DIGITAL DNA</Text></View>
            <View style={s.qrIdentityRow}>
              {user.avatar ? <Image source={{uri:user.avatar}} style={s.qrAvatar}/> : <View style={[s.qrAvatar,s.qrAvatarFallback]}><Text style={s.qrAvatarText}>K</Text></View>}
              <View style={s.qrIdentityText}><Text style={s.qrUsername}>{user.username}</Text><Text style={s.qrKind}>{PROFILE_KIND_LABELS[user.kind]}</Text>{(user.city || user.countryCode) ? <Text style={s.qrLocation}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}</View>
            </View>
            {user.bio ? <Text style={s.qrBio} numberOfLines={3}>{user.bio}</Text> : <Text style={s.qrBio}>Mon univers musical, en un scan.</Text>}
            {identityGenres.length ? <View style={s.qrGenres}>{identityGenres.map((genre) => <View key={genre} style={s.qrGenre}><Text style={s.qrGenreText}>{genre}</Text></View>)}</View> : null}
            <View style={s.qrBox}><QRCode value={publicProfileLink} size={164} color="#FFFFFF" backgroundColor="#0E0A14" /></View>
            <Text style={s.qrScan}>SCAN POUR DÉCOUVRIR MON PROFIL</Text>
            <Text style={s.qrTagline}>Tes goûts te ressemblent.</Text>
            <Text style={s.qrWebsite}>Loki · adelkhatra-bit.github.io/KEEP</Text>
          </View>
          <Text style={s.screenshotHint}>Ta carte d’identité musicale : photo, bio, ville, styles et QR. Fais une capture ou partage-la pour donner envie de découvrir ton univers.</Text>
          <TouchableOpacity style={s.shareActionPrimary} onPress={() => { setQrOpen(false); void shareNative(); }}><Text style={s.shareActionPrimaryText}>PARTAGER MON UNIVERS</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setQrOpen(false)}><Text style={s.cancelShareText}>FERMER</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function Empty({text}:{text:string}){return <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.muted}>{text}</Text></View>}

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},content:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24},demoTitle:{...typography.h2,color:colors.textPrimary,marginBottom:8},primary:{marginTop:20,minHeight:50,width:'100%',borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.white,fontSize:16,fontWeight:'900'},
  topBar:{minHeight:46,paddingHorizontal:18,paddingTop:5,paddingBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kindBadge:{minHeight:24,paddingHorizontal:9,borderRadius:12,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},kindBadgeText:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},kindBadgeEdit:{fontSize:11,fontWeight:'900'},actions:{flexDirection:'row',gap:7,alignItems:'center'},iconButton:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,position:'relative'},iconText:{color:colors.textPrimary,fontSize:18,fontWeight:'700'},bell:{fontSize:16},menuButton:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight},menuText:{color:'#FFFFFF',fontSize:28,lineHeight:30,fontWeight:'900'},menuChevron:{color:colors.primaryLight,fontSize:18,fontWeight:'900',marginLeft:6},menuBackRow:{minHeight:36,justifyContent:'center',marginBottom:2},menuBackText:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},notificationBadge:{position:'absolute',right:-4,top:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:colors.danger,borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},notificationBadgeText:{color:'#FFF',fontSize:10,fontWeight:'900'},plan:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},planFree:{backgroundColor:`${colors.success}22`,borderColor:colors.success},planExhausted:{backgroundColor:`${colors.danger}22`,borderColor:colors.danger},planPaid:{backgroundColor:`${colors.primary}33`,borderColor:colors.primaryLight},planText:{color:'#FFF',fontSize:12,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:10},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:64,height:64,borderRadius:32,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:25,fontWeight:'800'},identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:6},location:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},bio:{color:colors.textPrimary,fontSize:14,lineHeight:20,marginTop:9},ownerActions:{flexDirection:'row',alignItems:'center',gap:7,marginTop:10},ownerEditButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},ownerShareButton:{minHeight:48,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',marginTop:8},ownerSwipeButton:{minHeight:52,borderRadius:16,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:12,width:'100%'},ownerActionText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},ownerShareTextSecondary:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},accountBanner:{marginTop:12,padding:12,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},accountBannerTitle:{color:'#FFF',fontSize:14,fontWeight:'900'},accountBannerText:{color:colors.textPrimary,fontSize:13,lineHeight:18,marginTop:3},
  sectionMargin:{marginHorizontal:18,marginTop:10},
battleAvailabilityRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingVertical:7,paddingHorizontal:10,borderRadius:12,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},battleAvailabilityRowOn:{backgroundColor:`${colors.success}22`,borderColor:colors.success},battleAvailabilityMain:{flexDirection:'row',alignItems:'center',gap:6,flex:1},battleAvailabilityDot:{fontSize:13},battleAvailabilityTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},battleAvailabilityInfoIcon:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},battleAvailabilityHint:{color:colors.textPrimary,fontSize:12,lineHeight:16,marginTop:5,paddingHorizontal:2},battlePresenceLine:{color:colors.textPrimary,fontSize:12,fontWeight:'700',marginTop:6,paddingHorizontal:2},
  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800',marginTop:2},dnaScore:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{paddingHorizontal:10,paddingVertical:5,borderRadius:radius.pill,backgroundColor:colors.smartBadgeBg},chipText:{color:colors.smartBadgeText,fontSize:12,fontWeight:'700'},muted:{color:colors.textPrimary,fontSize:13,lineHeight:18},
  websiteButton:{marginHorizontal:18,marginTop:10,minHeight:44,borderRadius:radius.pill,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},websiteButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},socialHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},socialTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},musicLink:{color:colors.primaryLight,fontSize:13,fontWeight:'800'},socialRow:{flexDirection:'row',justifyContent:'space-between',marginTop:12},socialButton:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},socialButtonOn:{backgroundColor:colors.backgroundCard,borderColor:colors.primaryLight},
  growthPanel:{padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},growthText:{color:colors.textPrimary,fontSize:12,fontWeight:'700',lineHeight:17},growthBarTrack:{marginTop:8,height:6,borderRadius:3,backgroundColor:colors.backgroundCard,overflow:'hidden'},growthBarFill:{height:6,borderRadius:3,backgroundColor:colors.primaryLight},growthBadgeText:{color:colors.success,fontSize:13,fontWeight:'900',textAlign:'center'},browseChipsRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},browseChip:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},browseChipText:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},
  communitySection:{marginHorizontal:18,gap:2},
  collectionHeader:{marginHorizontal:18,marginTop:16,flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'},collectionTitle:{color:colors.textPrimary,fontSize:19,fontWeight:'700'},collectionCount:{color:colors.textMuted,fontSize:13,fontWeight:'600'},
  ownOffersStatus:{marginHorizontal:18,marginTop:10,minHeight:44,paddingHorizontal:14,borderRadius:12,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},ownOffersStatusText:{color:colors.textPrimary,fontSize:12,fontWeight:'700',flex:1},ownOffersManageLink:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},
  tabsRow:{marginTop:10,paddingHorizontal:10,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border},tabs:{flex:1,flexDirection:'row'},tab:{flex:1,alignItems:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},indicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},filterButton:{marginBottom:8,minHeight:30,paddingHorizontal:12,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},filterButtonText:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},
  keepList:{marginHorizontal:18,marginTop:10,gap:7},ownerKeepHint:{color:colors.textMuted,fontSize:12,lineHeight:17,marginBottom:2},
  // Adel (21/09/2026) : hauteur fixe (64) explicite sur la rangée
  // principale -- plus jamais de variation selon le contenu. Le panneau
  // dépliable (expandedPanel) vit HORS de cette rangée, dans trackCard.
  trackCard:{borderRadius:13,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
  keepRow:{flexDirection:'row',alignItems:'center',height:64,paddingHorizontal:8,gap:8},keepRowPrivate:{opacity:0.55},privateLock:{fontSize:13},keepCover:{width:48,height:48,borderRadius:9,backgroundColor:colors.backgroundCard},coverFallback:{alignItems:'center',justifyContent:'center'},keepCoverK:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},keepInfo:{flex:1,minWidth:0},keepTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},keepArtist:{color:colors.textMuted,fontSize:12,marginTop:2},
  expandToggle:{width:32,height:44,alignItems:'center',justifyContent:'center'},expandToggleText:{color:colors.textMuted,fontSize:16,fontWeight:'900'},
  expandedPanel:{paddingHorizontal:8,paddingBottom:10,paddingTop:2,gap:6,borderTopWidth:1,borderTopColor:colors.border},
  firstKeepBlock:{gap:2},firstKeepRow:{flexDirection:'row',alignItems:'center',gap:8},firstKeepBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:10,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success},firstKeepBadgeText:{color:colors.success,fontSize:11,fontWeight:'900'},firstKeepCount:{color:colors.textMuted,fontSize:11,fontWeight:'800'},firstKeepLine:{color:colors.textMuted,fontSize:11,lineHeight:15},trackMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,flexWrap:'wrap'},discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'},originLabel:{color:colors.textPrimary,fontSize:12,fontWeight:'800',letterSpacing:.1},originUserLink:{minHeight:24,paddingHorizontal:8,borderRadius:12,backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success,alignItems:'center',justifyContent:'center'},originUserText:{color:colors.success,fontSize:12,fontWeight:'900'},originProtected:{color:colors.success,fontSize:12,fontWeight:'800'},
  // Maquette validée "Cartes Loki — nouveau design" (21/09/2026) : carrés
  // d'action 40×40 uniformes, toujours visibles dans la rangée fixe.
  actionSquares:{flexDirection:'row',alignItems:'center',gap:6},
  squareShare:{width:40,height:40,borderRadius:10,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},squareShareIcon:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},
  list:{marginHorizontal:18,marginTop:10},playlistBlock:{borderBottomWidth:1,borderBottomColor:colors.border,paddingBottom:6},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:10},note:{width:38,height:38,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},noteText:{color:colors.primaryLight,fontSize:18,fontWeight:'800'},playlistText:{flex:1,minWidth:0,marginLeft:12},listText:{color:colors.textPrimary,fontSize:14,fontWeight:'600'},playlistCount:{color:colors.textMuted,fontSize:12,marginTop:2},chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900',paddingHorizontal:7},playlistButtons:{flexDirection:'row',justifyContent:'flex-end',gap:7,paddingBottom:6},playlistShareButton:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},playlistShareText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},playlistShareButtonSecondary:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},playlistShareTextSecondary:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},playlistTracks:{paddingBottom:8,paddingLeft:6},empty:{alignItems:'center',paddingVertical:50,paddingHorizontal:20},emptyIcon:{color:colors.primaryLight,fontSize:28,marginBottom:10},
  modalBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,0.78)',justifyContent:'center',alignItems:'center',padding:14},shareSheet:{width:'100%',maxWidth:520,backgroundColor:colors.backgroundElevated,borderRadius:26,borderWidth:1,borderColor:colors.border,padding:18,paddingBottom:24},accountSheet:{maxHeight:'92%'},sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:colors.border,alignSelf:'center',marginBottom:16},shareTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',textAlign:'center'},shareSubtitle:{color:colors.textMuted,fontSize:14,lineHeight:20,textAlign:'center',marginTop:6},freeEmptyCallout:{marginTop:14,padding:12,borderRadius:14,backgroundColor:`${colors.danger}1F`,borderWidth:1,borderColor:colors.danger},freeEmptyCalloutTitle:{color:colors.danger,fontSize:13,fontWeight:'900',marginBottom:6},freeEmptyCalloutText:{color:colors.textPrimary,fontSize:12,lineHeight:17,marginTop:3},linkPreview:{marginTop:14,padding:11,borderRadius:12,backgroundColor:colors.background,borderWidth:1,borderColor:colors.border},linkPreviewText:{color:colors.primaryLight,fontSize:13,textAlign:'center'},shareActionPrimary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},shareActionPrimaryText:{color:'#FFF',fontSize:14,fontWeight:'900'},shareAction:{minHeight:48,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,paddingHorizontal:14,justifyContent:'center',marginTop:9},shareActionText:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},shareActionHint:{color:colors.textMuted,fontSize:12,marginTop:2},cancelShare:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},kindPickerGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,width:'100%',marginTop:14},kindChoice:{minHeight:42,paddingHorizontal:14,borderRadius:21,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},kindChoiceOn:{backgroundColor:colors.primary,borderColor:colors.primary},kindChoiceText:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},kindChoiceTextOn:{color:'#FFF'},repriseSheet:{maxHeight:'82%'},repriseScroll:{width:'100%',marginTop:12,maxHeight:420},repriseRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,borderBottomWidth:1,borderBottomColor:colors.border},repriseAvatar:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundCard},repriseInfo:{flex:1,minWidth:0},repriseNameRow:{flexDirection:'row',alignItems:'center',gap:6},repriseUsername:{color:'#FFF',fontSize:14,fontWeight:'900',flexShrink:1},repriseGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:4},repriseGenreChip:{paddingHorizontal:7,paddingVertical:2,borderRadius:9,borderWidth:1},repriseGenreText:{fontSize:9,fontWeight:'800'},repriseFollowButton:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},repriseFollowButtonOn:{backgroundColor:`${colors.success}22`,borderWidth:1,borderColor:colors.success},repriseFollowButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},repriseFollowButtonTextOn:{color:colors.success},cancelShareText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},
  qrShell:{width:'100%',maxWidth:520,maxHeight:'96%',alignItems:'center',backgroundColor:'#0E0A14',borderRadius:24,paddingTop:42,paddingHorizontal:4,paddingBottom:6,position:'relative'},qrCloseTop:{position:'absolute',right:10,top:8,width:44,height:44,borderRadius:22,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',zIndex:20},qrCloseTopText:{color:'#FFFFFF',fontSize:16,fontWeight:'900'},qrScroll:{width:'100%'},qrScrollContent:{alignItems:'center',paddingHorizontal:4,paddingBottom:8},qrCard:{width:'100%',backgroundColor:'#0E0A14',borderRadius:26,padding:20,borderWidth:1,borderColor:'#8B5CF6'},qrBrandRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},qrLogo:{color:'#FFFFFF',fontSize:27,fontWeight:'900',letterSpacing:6},qrDnaLabel:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1.2},qrIdentityRow:{flexDirection:'row',alignItems:'center',marginTop:20},qrAvatar:{width:64,height:64,borderRadius:32,backgroundColor:'#241936',borderWidth:1,borderColor:'#8B5CF6'},qrAvatarFallback:{alignItems:'center',justifyContent:'center'},qrAvatarText:{color:'#B79CFF',fontSize:24,fontWeight:'900'},qrIdentityText:{flex:1,marginLeft:12},qrUsername:{color:'#FFFFFF',fontSize:22,fontWeight:'900'},qrKind:{color:'#B79CFF',fontSize:12,fontWeight:'900',marginTop:2},qrLocation:{color:'#E1D8EA',fontSize:12,marginTop:3},qrBio:{color:'#F4EFF8',fontSize:13,lineHeight:18,marginTop:14},qrGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:11},qrGenre:{backgroundColor:'#211831',borderRadius:999,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:'#6E4BA5'},qrGenreText:{color:'#D9C7FF',fontSize:11,fontWeight:'800'},qrBox:{alignSelf:'center',marginTop:18,padding:12,backgroundColor:'#0E0A14',borderRadius:16,borderWidth:2,borderColor:'#8B5CF6'},qrScan:{color:'#FFFFFF',fontSize:11,fontWeight:'900',letterSpacing:1,textAlign:'center',marginTop:11},qrTagline:{color:'#B79CFF',fontSize:13,fontWeight:'900',textAlign:'center',marginTop:5},qrWebsite:{color:'#FFFFFF',fontSize:11,fontWeight:'900',textAlign:'center',marginTop:8,letterSpacing:.25},screenshotHint:{color:'#FFFFFF',fontSize:12,lineHeight:17,textAlign:'center',marginTop:10,paddingHorizontal:10},
});
