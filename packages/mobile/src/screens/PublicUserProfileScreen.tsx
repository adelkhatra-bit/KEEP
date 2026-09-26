import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { canonicalArtistIdentity, CanonicalTrack, groupTracksByArtist } from '@keep/music';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { requestSocialLink } from '../services/notificationService';
import { DiscoveryImpact, loadProfileDiscoveryImpacts, loadProfileReprisers, loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, ProfileRepriser, PublicProfileSnapshot } from '../services/publicProfileStateService';
import CommunityConnectionsPanel, { CommunityMode } from '../components/CommunityConnectionsPanel';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { KeepVisibility, ProfileKind, SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import TrackActionRow from '../components/TrackActionRow';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import ProfileCertificationBadge, { CERTIFICATION_META } from '../components/ProfileCertificationBadge';
import ProfileCounterRow from '../components/ProfileCounterRow';
import ProfileMotionReveal from '../components/ProfileMotionReveal';
import MotionActionButton from '../components/MotionActionButton';
import ProfileStyleCard from '../components/ProfileStyleCard';
import { commitKeep } from '../services/keepTrackAction';
import { enrichMissingGenres } from '../services/keylessGenreService';
import { loadPublicSmartAlbums, loadPublicSmartAlbumTracks, persistEnrichedGenres, SmartAlbumRecord } from '../services/smartAlbumService';
import { shareProfile, shareProfileTrack } from '../services/sharingService';
import { blockUser, isBlockedEitherWay, reportUser, unblockUser, REPORT_REASONS, ReportReason } from '../services/moderationService';
import { loadDeliveredPlaylistSaleTracks, loadMaskedPlaylistSaleTrackIds, loadMyPlaylistSaleUnlocks, loadOwnPlaylistSaleOfferTracks, loadPlaylistSaleOfferPreviewTracks, loadPlaylistSaleOffersForProfile, PublicPlaylistSaleOffer, purchasePlaylistOfferWithFree, requestPlaylistPurchase } from '../services/playlistSaleService';
import { isFeatureEnabled, isPlaylistMarketplaceEnabled, isPlaylistMarketplaceVisible } from '../services/featureFlagService';
import PlaylistSaleImmersivePreview from '../components/PlaylistSaleImmersivePreview';
import { preloadTrackPreview, stopTrackPreview, toggleTrackPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { resolveTrackPreviewUrl } from '../services/trackPreviewResolver';
import { recordProfileSwipeListen } from '../services/profileSwipeListenService';
import { buildPayoutCheckoutUrl, payoutProviderLabel } from '../services/payoutLinkService';
import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';
import { sendBattleChallenge } from '../services/keepBattleLiveService';
import { formatProfilePresence, loadProfilePresence } from '../services/profilePresenceService';

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
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Établissement',
};

const QUERY_CHUNK_SIZE = 120;

function chunks<T>(items: T[], size = QUERY_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function PublicUserProfileScreen({ route, navigation }: any) {
  const username = route?.params?.username as string | undefined;
  const viewer = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
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
  const [followNudgeVisible, setFollowNudgeVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [inlineStylePlayingKey, setInlineStylePlayingKey] = useState<string | null>(null);
  const [inlineListenNotice, setInlineListenNotice] = useState<string | null>(null);
  const inlineQueueGenerationRef = useRef(0);
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
  const [repriseLoading, setRepriseLoading] = useState(false);
  const [reprisers, setReprisers] = useState<ProfileRepriser[]>([]);
  const [repriseFollowBusyId, setRepriseFollowBusyId] = useState<string | null>(null);
  // Adel (14/09/2026) : "sur le profil utilisateur, fait pareil quand on va
  // visiter un autre utilisateur" -- affiche les playlists que CE profil a
  // mises en vente (nom + prix), même si l'achat réel n'est pas encore
  // possible (Stripe Connect pas branché) : jamais un CTA qui prétend
  // encaisser tant que ce n'est pas vrai.
  const [saleOffers, setSaleOffers] = useState<PublicPlaylistSaleOffer[]>([]);
  const [publicVibes, setPublicVibes] = useState<SmartAlbumRecord[]>([]);
  const [saleUnlocks, setSaleUnlocks] = useState<Record<string, { offerId: string; deliveredPlaylistId: string }>>({});
  const [folderSwipeTracks, setFolderSwipeTracks] = useState<CanonicalTrack[]>([]);
  const [folderSwipeTitle, setFolderSwipeTitle] = useState('');
  const [folderLoadingId, setFolderLoadingId] = useState<string | null>(null);
  // Adel (20/09/2026) : marketplace playlists (ACHETER) en "coming soon" --
  // paiement par lien externe, non conforme Apple IAP pour du contenu
  // numérique déverrouillé dans l'app. Code intact, juste masqué tant que
  // le flag Super Admin 'playlist_marketplace' reste désactivé.
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(false);
  const [marketplacePurchaseEnabled, setMarketplacePurchaseEnabled] = useState(false);
  const [battleFeatureEnabled, setBattleFeatureEnabled] = useState(false);
  const [battleInviteBusy, setBattleInviteBusy] = useState(false);
  const [profilePresence, setProfilePresence] = useState<{ lastSeenAt: string | null; online: boolean }>({ lastSeenAt: null, online: false });
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
    if (!marketplaceEnabled || !profile?.id) { setSaleOffers([]); return undefined; }
    let live = true;
    loadPlaylistSaleOffersForProfile(profile.id).then((rows) => { if (live) setSaleOffers(rows); }).catch(() => { if (live) setSaleOffers([]); });
    return () => { live = false; };
  }, [marketplaceEnabled, profile?.id]);
  useEffect(() => {
    if (!profile?.id) { setPublicVibes([]); return undefined; }
    let live = true;
    loadPublicSmartAlbums(profile.id).then((rows) => { if (live) setPublicVibes(rows); }).catch(() => { if (live) setPublicVibes([]); });
    return () => { live = false; };
  }, [profile?.id]);
  useEffect(() => {
    if (!viewer?.id || isLocalGuest || isDemoMode) { setSaleUnlocks({}); return undefined; }
    let live = true;
    loadMyPlaylistSaleUnlocks().then((rows) => { if (live) setSaleUnlocks(rows); }).catch(() => { if (live) setSaleUnlocks({}); });
    return () => { live = false; };
  }, [viewer?.id, isLocalGuest, isDemoMode, saleOffers.length]);

  // Une Vibe KEEP_SMART mise en vente ne doit jamais apparaître deux fois :
  // une fois gratuitement comme Vibe publique ET une fois verrouillée comme
  // offre payante. L'offre verrouillée remplace la carte publique jusqu'au
  // déblocage. Cela protège aussi le contenu : aucun accès indirect au Swipe
  // gratuit de la même sélection avant achat.
  const saleProtectedSmartAlbumIds = useMemo(() => new Set(
    saleOffers
      .map((offer) => String(offer.playlistId || '').trim())
      .filter((id) => id.startsWith('keep-smart:'))
      .map((id) => id.slice('keep-smart:'.length))
      .filter(Boolean),
  ), [saleOffers]);
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
      setLoading(true);
      setError(null);
      setPublicSnapshot(null);
      setDiscoveryImpacts({});
      setViewerKeepTrackIds(new Set());
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
        setProfile(result);
        setFollowerCount(result.followerCount);

        const snapshotPromise = loadPublicProfileSnapshot(result.id).catch(() => null);
        const impactPromise = loadProfileDiscoveryImpacts(result.id).catch(() => ({}));

        if (viewer?.id && viewer.id !== result.id && !isLocalGuest && !isDemoMode) {
          const { data: existing } = await supabase.from('follows').select('follower_id').eq('follower_id', viewer.id).eq('followee_id', result.id).maybeSingle();
          if (!cancelled) setIsFollowing(!!existing);
        } else if (!cancelled) {
          setIsFollowing(false);
        }

        const canonicalKeeps = await loadPublicProfileKeeps(result.id);
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
        } as PublicKeepTrack));

        if (cancelled) return;
        // Adel (15/09/2026) : "je ne vends pas de la musique, je vends ma
        // découverte et ma playlist ... pas de doublon" -- si tout est déjà
        // visible gratuitement ailleurs sur le profil, il n'y a rien à
        // débloquer en payant. Les morceaux d'une playlist en vente active
        // sont donc masqués de TOUTES les vues publiques gratuites (liste,
        // styles, artistes), jamais pour le propriétaire lui-même.
        const isOwnProfile = Boolean(viewer?.id && viewer.id === result.id);
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
              .eq('profile_id', viewer.id)
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
        if (!cancelled) setError('Impossible de charger ce profil pour le moment.');
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
  }, [username, viewer?.id, isLocalGuest, isDemoMode, navigation]);

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
  // (21/09/2026) refonte collection -- "PAR ARTISTE" (bouton + modale)
  // retiré : l'onglet Artistes ci-dessous ouvre exactement la même liste,
  // avec la même action (Swipe filtré). Ne pas garder les deux, même
  // fonction, pour ne pas dupliquer.
  const [activeTab, setActiveTab] = useState<ProfileTab>('TRACKS');
  // (21/09/2026, Adel) : "le bloc Loki DNA prend trop de place sur le profil
  // visité, ça noie le reste" -- replié par défaut avec un résumé condensé
  // sur une ligne. Le profil PERSONNEL garde le bloc complet, non touché
  // ici -- demande explicite d'Adel. (Contrairement à "Morceaux publics",
  // jamais replié -- ce sont deux décisions distinctes, la musique doit
  // rester visible immédiatement.)
  const [dnaExpanded, setDnaExpanded] = useState(false);
  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const track of swipeTracks) for (const genre of track.genres ?? []) {
      const clean = genre.trim();
      if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([genre, count]) => ({ genre, count }));
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

  const openSaleFolder = (offer: PublicPlaylistSaleOffer) => {
    const ownerViewingSelf = Boolean(viewer?.id && profile?.id && viewer.id === profile.id);
    if (ownerViewingSelf) {
      void openFolderSwipe(offer.playlistName, () => loadOwnPlaylistSaleOfferTracks(offer.offerId), `sale:${offer.offerId}`);
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
    setImmersivePreviewOffer(offer);
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
  const [immersivePreviewOffer, setImmersivePreviewOffer] = useState<PublicPlaylistSaleOffer | null>(null);
  const buyPlaylistOffer = async (offer: PublicPlaylistSaleOffer) => {
    if (purchaseBusyId) return;
    if (!viewer || isLocalGuest || isDemoMode) {
      goToOwnProfile();
      return;
    }

    // FREE = monnaie interne Loki Music : le déblocage est atomique et
    // immédiat, y compris sur mobile. Un seul débit débloque TOUTE la
    // collection, jamais morceau par morceau.
    if (offer.paymentMode === 'FREE') {
      setPurchaseBusyId(offer.offerId);
      try {
        const result = await purchasePlaylistOfferWithFree(offer.offerId);
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
        const match = message.match(/NOT_ENOUGH_FREE:(\d+):(\d+)/);
        if (match) Alert.alert('Pas assez de FREE', `Tu as ${match[1]} FREE, cette collection en demande ${match[2]}.`);
        else if (message.includes('authentication_required')) goToOwnProfile();
        else Alert.alert('Collection', 'Impossible de débloquer cette collection en FREE pour le moment.');
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
      // La RPC attend l'UUID de l'offre, jamais l'identifiant technique de
      // playlist (qui peut être "keep-selection:...").
      const request = await requestPlaylistPurchase(offer.offerId);
      if (!request.payoutLink) { Alert.alert('Paiement pas encore prêt', `${request.sellerUsername || 'Ce créateur'} n'a pas encore ajouté de lien de paiement personnel.`); return; }
      const checkoutUrl = buildPayoutCheckoutUrl(request.payoutLink, request.amountCents, request.currencyCode);
      const provider = payoutProviderLabel(request.payoutLink);
      const amount = (request.amountCents / 100).toFixed(2).replace('.', ',');
      await Linking.openURL(checkoutUrl);
      setImmersivePreviewOffer(null);
      Alert.alert(
        `${provider} ouvert`,
        provider === 'PayPal'
          ? `Le prix total de ${amount} ${request.currencyCode} est prérempli dans PayPal. Il ne reste qu'à valider le paiement. L'accès sera débloqué dès que ${request.sellerUsername || 'le créateur'} confirme la réception.`
          : `Paie le prix total de ${amount} ${request.currencyCode} sur le lien qui vient de s'ouvrir. L'accès sera débloqué dès que ${request.sellerUsername || 'le créateur'} confirme la réception.`,
      );
    } catch (e: any) {
      const message = String(e?.message || '');
      if (message.includes('authentication_required')) goToOwnProfile();
      else if (message.includes('SELLER_PAYOUT_NOT_CONFIGURED')) Alert.alert('Paiement pas encore prêt', `${profile?.username || 'Ce créateur'} n’a pas encore configuré son lien PayPal ou son lien de paiement.`);
      else if (message.includes('SELLER_PAYOUT_LINK_INSECURE')) Alert.alert('Paiement temporairement indisponible', 'Le créateur doit enregistrer un lien de paiement sécurisé avant de pouvoir proposer cette collection.');
      else Alert.alert('Erreur', 'Impossible de lancer le déblocage pour le moment.');
    } finally {
      setPurchaseBusyId(null);
    }
  };
  const goToOwnProfile = () => useAccountGateStore.getState().requestAccount('create');

  const challengeProfileToBattle = async () => {
    if (!profile || battleInviteBusy || viewer?.id === profile.id) return;
    if (!viewer || isLocalGuest || isDemoMode) {
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
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki Music requis', `Crée ou connecte ton compte Loki Music : tu suivras ${profile?.username || 'ce profil'} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', profile?.username) },
      ]);
      return;
    }
    if (!profile || viewer.id === profile.id || followBusy) return;
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
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki Music requis', `Crée ou connecte ton compte Loki Music : tu suivras ${repriser.username} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', repriser.username) },
      ]);
      return;
    }
    if (repriseFollowBusyId) return;
    setRepriseFollowBusyId(repriser.profileId);
    try {
      if (repriser.isFollowing) {
        const { error } = await supabase.rpc('keep_unfollow_profile', { p_followee_id: repriser.profileId });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: repriser.profileId });
        if (error) throw error;
      }
      setReprisers((rows) => rows.map((r) => r.profileId === repriser.profileId ? { ...r, isFollowing: !r.isFollowing } : r));
    } catch {
      Alert.alert('Abonnement', 'Impossible de mettre à jour l’abonnement pour le moment.');
    } finally {
      setRepriseFollowBusyId(null);
    }
  };

  const requireAccountForModeration = () => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
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
      Alert.alert('Signalement envoyé', 'Merci, notre équipe va l’examiner.');
    } catch {
      Alert.alert('Envoi impossible', 'Réessaie dans un instant.');
    } finally {
      setModerationBusy(false);
    }
  };

  const toggleLike = async (trackId: string) => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte Loki Music pour liker ce morceau.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    const alreadyLiked = likedTrackIds.has(trackId);
    const next = new Set(likedTrackIds);
    if (alreadyLiked) {
      const { error: deleteError } = await supabase.from('track_likes').delete().eq('profile_id', viewer.id).eq('track_id', trackId);
      if (deleteError) return;
      next.delete(trackId);
      setLikeCounts((current) => ({ ...current, [trackId]: Math.max(0, (current[trackId] || 0) - 1) }));
    } else {
      const { error: insertError } = await supabase.from('track_likes').insert({ profile_id: viewer.id, track_id: trackId });
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
    if (!profile || !viewer || viewer.id === profile.id || isFollowing) return;
    setFollowNudgeVisible(true);
  };

  const addCanonicalToMyKeep = async (canonical: CanonicalTrack, visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!viewer || isLocalGuest) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour ajouter cette musique à ta collection.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return false;
    }
    if (profile && viewer.id === profile.id) return false;
    if (alreadyInMyKeep(canonical.id)) {
      showAlreadyKept(canonical.title);
      return false;
    }
    try {
      await commitKeep(canonical, [], undefined, { visibility, context: { source: 'public_profile_swipe', sourceProfileId: profile?.id } });
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
    if (!viewer) {
      Alert.alert('Compte Loki Music requis', 'Crée ou connecte ton compte pour ajouter cette musique à ta collection.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    if (profile && viewer.id === profile.id) return;
    if (alreadyInMyKeep(track.trackId)) {
      showAlreadyKept(track.title);
      return;
    }
    if (addingTrackIds.has(track.trackId)) return;
    setKeepPromptTrack(track);
  };

  const addToMyKeep = async (track: PublicKeepTrack, visibility: KeepVisibility) => {
    if (!viewer || isLocalGuest) {
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
      await commitKeep(canonical, [], undefined, { visibility, context: { source: 'public_profile', sourceProfileId: profile?.id } });
      setViewerKeepTrackIds((current) => new Set(current).add(track.trackId));
      maybeSuggestFollow();
      Alert.alert(
        isDemoMode ? 'Mode démo' : 'Ajouté à ta collection',
        isDemoMode
          ? `« ${track.title} » est gardé temporairement en ${visibility === 'PUBLIC' ? 'PUBLIC sur le profil' : 'PRIVÉ'} pour la démonstration.`
          : `« ${track.title} » est maintenant dans tes musiques.`,
      );
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

  const certificationTier: ProfileCertificationTier = publicSnapshot?.certificationTier ?? 'UNVERIFIED';
  const followingCount = publicSnapshot?.following ?? profile.followingCount;
  const kindLabel = PROFILE_KIND_LABELS[profile.kind] ?? 'Utilisateur';
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
          {viewer?.id !== profile.id ? (
            <TouchableOpacity style={styles.shareTopButton} onPress={() => setModerationMenuOpen(true)} accessibilityLabel="Signaler ou bloquer ce profil"><Text style={styles.shareTopText}>⋯</Text></TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.unifiedCounters}>
          <ProfileCounterRow kind="connections" items={[
            { value: followerCount, label: 'Abonnés', disabled: true },
            { value: socialKeepCount, label: 'Reprises', hint: 'Impact public de ses découvertes dans la communauté.', onPress: () => setRepriseListOpen(true) },
            { value: directKeepCount, label: 'Morceaux', hint: 'Ouvre ses morceaux publics.', onPress: () => setActiveTab('TRACKS') },
            { value: followingCount, label: 'Abonnements', disabled: true },
          ]} />
        </View>

        <ProfileMotionReveal motionKey={`visitor-hero:${profile.id}`} delay={40} style={styles.hero}>
          <View style={styles.identity}>
            {profile.avatar ? <Image source={{ uri: profile.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{(profile.username || 'K').replace(/^@/, '').slice(0, 1).toUpperCase()}</Text></View>}
            <View style={styles.identityText}>
              <View style={styles.usernameLine}><Text style={styles.username}>{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaLeft}>
                  <View style={[styles.kindBadge, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}><Text style={[styles.kindBadgeText, { color: certificationColors.ring }]}>{kindLabel}</Text></View>
                  {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}
                  <View style={styles.presencePill} accessibilityLabel={formatProfilePresence(profilePresence.lastSeenAt, profilePresence.online)}>
                    <View style={[styles.presenceDot, profilePresence.online && styles.presenceDotOnline]} />
                    <Text style={[styles.presenceText, profilePresence.online && styles.presenceTextOnline]}>{formatProfilePresence(profilePresence.lastSeenAt, profilePresence.online)}</Text>
                  </View>
                </View>

              </View>
            </View>
          </View>
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          {viewer?.id !== profile.id ? (
            <View style={styles.visitorActionRow}>
              {tracks.length > 0 ? (
                <TouchableOpacity style={[styles.visitorActionChip, styles.visitorActionChipPrimary]} onPress={() => openBrowseSwipe(null)} accessibilityLabel={`Swiper les découvertes de ${profile.username}`}>
                  <Text style={styles.visitorActionIcon}>▶</Text><Text style={styles.visitorActionLabel}>SWIPE</Text>
                </TouchableOpacity>
              ) : <View style={styles.visitorActionChipPlaceholder} />}
              {battleFeatureEnabled ? (
                <TouchableOpacity style={[styles.visitorActionChip, styles.visitorActionChipNeutral]} onPress={() => void challengeProfileToBattle()} disabled={battleInviteBusy} accessibilityLabel={`Défier ${profile.username} en Battle`}>
                  <Text style={styles.visitorActionIcon}>⚡</Text><Text style={styles.visitorActionLabel}>{battleInviteBusy ? 'ENVOI…' : 'BATTLE'}</Text>
                </TouchableOpacity>
              ) : <View style={styles.visitorActionChipPlaceholder} />}
              <TouchableOpacity style={[styles.visitorActionChip, styles.visitorActionChipPrimary]} onPress={() => void shareProfile(profile.username)} accessibilityLabel={`Partager le profil de ${profile.username}`}>
                <Text style={styles.visitorActionIcon}>↗</Text><Text style={styles.visitorActionLabel}>PARTAGER</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ProfileMotionReveal>

        {marketplaceEnabled ? (
          <ProfileMotionReveal motionKey={`visitor-market:${profile.id}:${saleOffers.length}`} compact style={styles.marketplaceSection}>
            <View style={styles.marketplaceHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.marketplaceKicker}>✦ PÉPITES EN MOUVEMENT</Text>
                <Text style={styles.sectionTitle}>À découvrir</Text>
              </View>
              {saleOffers.length > 0 ? (
                <View style={styles.marketplaceCountPill}>
                  <Text style={styles.marketplaceCountText}>{saleOffers.length} COLLECTION{saleOffers.length > 1 ? 'S' : ''}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.marketplacePulseLine}><View style={styles.marketplaceLiveDot} /><Text style={styles.marketplaceHint}>Écoute avant de savoir · {saleOffers.reduce((sum, offer) => sum + (offer.trackCount || 0), 0)} titres cachés</Text></View>
            {saleOffers.length === 0 ? (
              <View style={styles.marketplaceEmpty}>
                <Text style={styles.marketplaceEmptyText}>Aucune pépite à révéler pour le moment</Text>
              </View>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.saleCarouselContent}
                  snapToInterval={272}
                  decelerationRate="fast"
                  accessibilityLabel="Collections musicales à débloquer"
                >
                  {saleOffers.map((offer, index) => {
                    const unlocked = Boolean(saleUnlocks[offer.offerId]?.deliveredPlaylistId) || Boolean(viewer?.id && viewer.id === profile.id);
                    const priceLabel = offer.paymentMode === 'FREE'
                      ? `${offer.freePrice ?? 0} FREE`
                      : `${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}`;
                    const styleLabel = offer.genres?.length
                      ? offer.genres.slice(0, 3).join(' · ')
                      : 'Mix musical secret';
                    return (
                      <ProfileStyleCard
                        key={`sale-carousel:${offer.offerId}`}
                        title={offer.playlistName || `Collection #${index + 1}`}
                        subtitle={unlocked
                          ? `${offer.trackCount} découverte${offer.trackCount > 1 ? 's' : ''} · ${styleLabel}`
                          : `${offer.trackCount} pépite${offer.trackCount > 1 ? 's' : ''} · ${styleLabel}`}
                        mode={unlocked ? 'UNLOCKED' : 'LOCKED'}
                        badgeLabel={unlocked ? '✓ DÉBLOQUÉE' : `✦ ${offer.trackCount} À RÉVÉLER`}
                        priceLabel={unlocked ? undefined : priceLabel}
                        onPress={() => openSaleFolder(offer)}
                        accessibilityLabel={unlocked
                          ? `Ouvrir la collection ${offer.playlistName}`
                          : `Écouter les pépites ${offer.playlistName}, ${offer.trackCount} morceaux, ${priceLabel}`}
                        onPlayPress={() => openSaleFolder(offer)}
                        playAccessibilityLabel={unlocked
                          ? `Écouter la collection ${offer.playlistName}`
                          : `Lancer la préécoute anonyme de toute la collection ${offer.playlistName}`}
                        style={styles.saleCarouselCard}
                      />
                    );
                  })}
                </ScrollView>
                <Text style={styles.saleCarouselHint}>← Glisse · touche · écoute →</Text>
              </>
            )}
          </ProfileMotionReveal>
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

        <Modal visible={styleModalOpen} transparent animationType="fade" onRequestClose={() => setStyleModalOpen(false)}>
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
        </Modal>

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
              <Text style={styles.sectionTitle}>Morceaux publics</Text>
              <Text style={styles.publicCount}>{tracks.length}</Text>
            </View>
            {tracks.length === 0 ? <View style={styles.emptyMusic}><Text style={styles.emptyMusicIcon}>♪</Text><Text style={styles.muted}>Aucun morceau public sur ce profil.</Text></View> : null}
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

        <View style={styles.dna}>
          <TouchableOpacity style={styles.dnaHeader} onPress={() => setDnaExpanded((v) => !v)} accessibilityRole="button" accessibilityLabel={dnaExpanded ? 'Réduire son ADN musical' : 'Voir son ADN musical'}>
            <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.dnaEyebrow}>Loki Music DNA</Text><Text style={styles.dnaTitle}>Son empreinte musicale</Text></View>
            <Text style={styles.chevron}>{dnaExpanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {/* Adel (21/09/2026) : "le bloc ADN prend trop de place sur le
              profil visité, ça noie le reste" -- replié, résumé condensé sur
              une ligne (styles puis artistes, texte simple). Déplié, le
              détail complet reste identique à avant (mêmes puces cliquables,
              rien de supprimé). */}
          {!dnaExpanded ? (
            profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0 ? (
              <Text style={styles.dnaCondensed} numberOfLines={1}>{[...profile.favoriteGenres.slice(0, 3), ...profile.favoriteArtists.slice(0, 2)].join(' · ')}</Text>
            ) : (
              <Text style={styles.mutedSmall}>Aucune préférence musicale publique renseignée pour le moment.</Text>
            )
          ) : (
            <>
              {/* Adel (14/09/2026) : "ça aussi, il faut y ranger correctement"
                  -- styles et artistes mélangés dans une seule liste plate (ex:
                  "R&B/Soul, Hip-hop/Rap, Miguel, The Gap Band" sans distinction).
                  Deux rangées étiquetées séparément ; une puce qui correspond à
                  un style/artiste réel de la collection ouvre directement le
                  Swipe filtré, au lieu de rester une simple étiquette
                  décorative. Le résumé "Albums : <titres bruts concaténés>"
                  retiré : peu lisible et déjà couvert par la sélection Artiste
                  (un album, ici, c'est quasi toujours un seul morceau -- audit
                  du 13/09). */}
              {profile.favoriteGenres.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.dnaRowLabel}>STYLES</Text>
                  <View style={styles.chips}>{profile.favoriteGenres.slice(0, 6).map((item) => {
                    const match = genreOptions.find((g) => g.genre === item);
                    return match ? (
                      <TouchableOpacity key={item} style={styles.chip} onPress={() => openBrowseSwipe({ type: 'genre', value: item, label: item })}><Text style={styles.chipText}>{item}</Text></TouchableOpacity>
                    ) : (
                      <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>
                    );
                  })}</View>
                </View>
              ) : null}
              {profile.favoriteArtists.length > 0 ? (
                <View style={{ marginTop: 8 }}>
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
              {profile.favoriteGenres.length === 0 && profile.favoriteArtists.length === 0 ? <Text style={styles.mutedSmall}>Aucune préférence musicale publique renseignée pour le moment.</Text> : null}
            </>
          )}
        </View>

        {immersivePreviewOffer ? (
          <PlaylistSaleImmersivePreview
            offer={immersivePreviewOffer}
            visible={Boolean(immersivePreviewOffer)}
            busy={purchaseBusyId === immersivePreviewOffer.offerId}
            onClose={() => setImmersivePreviewOffer(null)}
            onConfirmPurchase={(offer) => void buyPlaylistOffer(offer)}
            purchaseEnabled={immersivePreviewOffer.paymentMode === 'FREE' || marketplacePurchaseEnabled}
          />
        ) : null}

        {(() => {
          const configuredSocials = SOCIALS.filter((item) => profile.socialLinks.some((link) => link.platform === item.platform && link.url.trim()));
          if (!configuredSocials.length) return null;
          return (
            <View style={styles.socialHub}>
              <Text style={styles.socialTitle}>Ses réseaux</Text>
              <View style={styles.socialRow}>
                {configuredSocials.map((item) => (
                  <TouchableOpacity key={item.platform} style={[styles.socialButton, styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF'} /></TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}

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

      <MusicSwipeDeckModal
        visible={swipeOpen}
        tracks={folderSwipeTracks.length ? folderSwipeTracks : browseSwipeTracks}
        title={folderSwipeTracks.length ? folderSwipeTitle : browseFilter ? `${profile.username} · ${browseFilter.label}` : `La collection de ${profile.username}`}
        sourceUsername={profile.username}
        sourceAvatarUrl={profile.avatar}
        sourceProfileId={profile.id}
        subtitle="Les extraits démarrent automatiquement. Si un morceau est déjà dans ta collection, aucun doublon n’est créé."
        askVisibilityOnKeep
        requiresAccount={!viewer || isLocalGuest}
        onClose={() => { setSwipeOpen(false); setBrowseFilter(null); setFolderSwipeTracks([]); setFolderSwipeTitle(''); }}
        onKeep={addCanonicalToMyKeep}
      />

      {/* Adel (09/09/2026) : "meme design que le profil normal" -- meme
          liste "qui a repris" que sur son propre profil (pastille de
          certification + style musical + suivre en retour). */}
      <Modal visible={repriseListOpen} transparent animationType="fade" onRequestClose={() => setRepriseListOpen(false)}>
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
                      <Text style={[styles.repriseFollowButtonText, r.isFollowing && styles.repriseFollowButtonTextOn]}>{repriseFollowBusyId === r.profileId ? '…' : r.isFollowing ? 'ABONNÉ' : 'SUIVRE'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }) : <Text style={styles.muted}>Personne n’a encore repris ses morceaux.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.cancelShare} onPress={() => setRepriseListOpen(false)}><Text style={styles.cancelShareText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={moderationMenuOpen} transparent animationType="fade" onRequestClose={() => setModerationMenuOpen(false)}>
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
      </Modal>

      <Modal visible={reportPickerOpen} transparent animationType="fade" onRequestClose={() => setReportPickerOpen(false)}>
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
      </Modal>

      <Modal visible={!!keepPromptTrack} transparent animationType="fade" onRequestClose={() => setKeepPromptTrack(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.shareSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.shareTitle}>Garder ce morceau ?</Text>
            {keepPromptTrack ? <Text style={styles.keepPromptTrack} numberOfLines={2}>{keepPromptTrack.title} · {keepPromptTrack.artist}</Text> : null}
            <TouchableOpacity style={[styles.keepChoice, styles.keepChoicePublic]} disabled={keepPromptTrack ? addingTrackIds.has(keepPromptTrack.trackId) : false} onPress={() => keepPromptTrack && void addToMyKeep(keepPromptTrack, 'PUBLIC')} accessibilityLabel="Visible sur mon profil">
              <Text style={styles.keepChoicePublicTitle}>VISIBLE SUR MON PROFIL</Text>
              <Text style={styles.keepChoiceText}>Le morceau sera rangé et visible dans ton univers Loki Music.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.keepChoice, styles.keepChoicePrivate]} disabled={keepPromptTrack ? addingTrackIds.has(keepPromptTrack.trackId) : false} onPress={() => keepPromptTrack && void addToMyKeep(keepPromptTrack, 'PRIVATE')} accessibilityLabel="Garder en privé">
              <Text style={styles.keepChoicePrivateTitle}>GARDER EN PRIVÉ</Text>
              <Text style={styles.keepChoiceText}>Le morceau reste dans ta bibliothèque sans apparaître sur ton profil.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelShare} onPress={() => setKeepPromptTrack(null)}>
              <Text style={styles.cancelShareText}>ANNULER — NE RIEN GARDER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  inlineListenNoticeText:{color:colors.keep,fontSize:11,fontWeight:'900',textAlign:'center'},topBar:{minHeight:48,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{width:44,height:44,color:colors.textPrimary,fontSize:32,lineHeight:44,textAlign:'center'},topSpacer:{flex:1},shareTopButton:{width:44,height:44,borderRadius:22,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},shareTopText:{color:'#FFFFFF',fontSize:18,fontWeight:'900'},moderationOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},moderationCard:{width:'100%',maxWidth:360,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',paddingVertical:6},moderationTitle:{color:'#F8F6FC',fontSize:13,fontWeight:'900',padding:14,paddingBottom:6},moderationRow:{minHeight:50,justifyContent:'center',paddingHorizontal:16,borderTopWidth:1,borderTopColor:'#2B2038'},moderationRowText:{color:'#F8F6FC',fontSize:14,fontWeight:'700'},moderationRowDanger:{color:'#FF5F83'},kindBadge:{minHeight:24,paddingHorizontal:9,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#7CF2B9',fontSize:13,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:12},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:64,height:64,borderRadius:32,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:25,fontWeight:'800'},identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:6},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:1},identityMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5},location:{color:'#FFFFFF',fontSize:13,fontWeight:'800'},presencePill:{flexDirection:'row',alignItems:'center',gap:5,minHeight:22,paddingHorizontal:8,borderRadius:11,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},presenceDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.textMuted},presenceDotOnline:{backgroundColor:colors.success},presenceText:{color:colors.textMuted,fontSize:10,fontWeight:'800'},presenceTextOnline:{color:colors.success},bio:{color:'#FFFFFF',fontSize:15,lineHeight:21,marginTop:12},
visitorSwipeMotion:{marginTop:12},visitorBattleMotion:{marginTop:8},visitorSwipeButton:{minHeight:52,borderRadius:16,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',marginTop:12,width:'100%'},visitorSwipeButtonText:{color:'#FFFFFF',fontSize:14,fontWeight:'900'},visitorBattleButton:{minHeight:46,borderRadius:15,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:8,width:'100%'},visitorBattleButtonText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},

  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800',marginTop:2},dnaRowLabel:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:0.5},dnaCondensed:{color:colors.textMuted,fontSize:12,fontWeight:'600',marginTop:6},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:6},chip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:10,paddingVertical:5},chipText:{color:colors.smartBadgeText,fontSize:12,fontWeight:'700'},mutedSmall:{color:'#FFFFFF',fontSize:12,lineHeight:17,marginTop:8},
  websiteButton:{marginHorizontal:18,marginTop:10,minHeight:44,borderRadius:radius.pill,backgroundColor:'#21182F',borderWidth:1,borderColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},websiteButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},socialRow:{width:'100%',flexDirection:'row',justifyContent:'space-between',gap:7,marginTop:12},socialButton:{flex:1,maxWidth:46,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,opacity:.82},socialButtonConfigured:{backgroundColor:colors.backgroundCard,borderColor:colors.primaryLight,opacity:1},
  browseSection:{marginHorizontal:18,marginTop:12,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},browseChipsRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},browseChip:{minHeight:32,maxWidth:220,paddingHorizontal:12,borderRadius:16,backgroundColor:'#21182F',borderWidth:1,borderColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},browseChipText:{color:'#FFFFFF',fontSize:12,fontWeight:'800'},
  folderIntro:{marginBottom:10},folderIntroText:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,marginTop:4},folderGrid:{gap:8},folderCard:{minHeight:68,flexDirection:'row',alignItems:'center',gap:10,padding:9,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},folderCardSale:{backgroundColor:'rgba(124,92,252,.09)',borderColor:colors.primary},folderCardUnlocked:{backgroundColor:'rgba(45,225,194,.08)',borderColor:colors.success},folderIcon:{width:50,height:50,borderRadius:12,backgroundColor:'rgba(124,92,252,.16)',borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center'},folderIconSale:{backgroundColor:'rgba(124,92,252,.12)'},folderIconText:{color:'#FFF',fontSize:20,fontWeight:'900'},folderCover:{width:50,height:50,borderRadius:12,backgroundColor:colors.backgroundElevated},folderCopy:{flex:1,minWidth:0},folderTitle:{color:'#FFF',fontSize:14,fontWeight:'900'},folderMeta:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:3},folderAction:{color:colors.primaryLight,fontSize:24,fontWeight:'900'},folderPrice:{minWidth:58,minHeight:32,paddingHorizontal:8,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},folderUnlockedPill:{backgroundColor:'rgba(45,225,194,.18)',borderWidth:1,borderColor:colors.success},folderPriceText:{color:'#FFF',fontSize:10,fontWeight:'900'},
    visitorActionRow:{flexDirection:'row',alignItems:'stretch',gap:8,marginTop:12},
  visitorActionChip:{flex:1,minWidth:0,minHeight:54,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',gap:3,paddingHorizontal:4},
  visitorActionChipPrimary:{backgroundColor:colors.primaryFaint,borderColor:colors.primary},
  visitorActionChipSuccess:{backgroundColor:colors.successFaint,borderColor:colors.success},
  visitorActionChipNeutral:{backgroundColor:colors.backgroundElevated,borderColor:colors.border},
  visitorActionChipBattle:{backgroundColor:'rgba(255,184,77,.08)',borderColor:'rgba(255,184,77,.45)'},
  visitorActionChipFollowing:{backgroundColor:`${colors.success}22`,borderColor:colors.success},
  visitorActionChipPlaceholder:{flex:1,minWidth:0},
  visitorActionIcon:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},
  visitorActionLabel:{color:colors.textPrimary,fontSize:9,fontWeight:'900',letterSpacing:.55,textAlign:'center'},
  sellerSignal:{minHeight:74,marginTop:12,padding:12,borderRadius:20,backgroundColor:colors.successFaint,borderWidth:1,borderColor:colors.keep,flexDirection:'row',alignItems:'center',gap:10},
  sellerSignalIcon:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center'},
  sellerSignalIconText:{color:colors.keep,fontSize:18,fontWeight:'900'},
  sellerSignalCopy:{flex:1,minWidth:0},
  sellerSignalKicker:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:.9},
  sellerSignalTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900',marginTop:2},
  sellerSignalMeta:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:2},
  sellerSignalArrow:{color:colors.keep,fontSize:26,fontWeight:'700'},
  marketplaceSection:{marginHorizontal:18,marginTop:14,padding:14,borderRadius:22,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  marketplaceHeaderRow:{flexDirection:'row',alignItems:'flex-start',gap:10},
  marketplaceKicker:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1.2,marginBottom:4},
  marketplacePulseLine:{flexDirection:'row',alignItems:'center',gap:7,marginTop:6},
  marketplaceLiveDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.keep},
  marketplaceCountPill:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  marketplaceCountText:{color:colors.textPrimary,fontSize:9,fontWeight:'900',letterSpacing:.5},
  saleCarouselContent:{gap:12,paddingTop:12,paddingRight:14},
  saleCarouselCard:{width:260,marginBottom:0},
  saleCarouselHint:{color:colors.textMutedGrey,fontSize:9,fontWeight:'700',textAlign:'center',marginTop:10},
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
  marketplaceMore:{color:colors.textMutedGrey,fontSize:10,fontWeight:'700',textAlign:'center',marginTop:2},saleShowcase:{marginHorizontal:18,marginTop:16,marginBottom:4,padding:14,borderRadius:18,backgroundColor:colors.backgroundElevated,borderWidth:1.5,borderColor:colors.primary},saleShowcaseHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:6},saleShowcaseEyebrow:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:1.2},saleShowcaseCount:{color:colors.textMutedGrey,fontSize:11,fontWeight:'800'},marketplaceHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:4},marketplaceList:{gap:8,marginTop:10},marketplaceEmpty:{marginTop:10,minHeight:44,borderRadius:14,backgroundColor:'#0F1B16',borderWidth:1,borderColor:'#2D5C4F',alignItems:'center',justifyContent:'center'},marketplaceEmptyText:{color:colors.textMuted,fontSize:11,fontWeight:'700'},marketplaceCard:{padding:8,borderRadius:14,backgroundColor:'#0F1B16',borderWidth:1,borderColor:'#2D5C4F'},marketplaceCardTop:{minHeight:66,flexDirection:'row',alignItems:'center',gap:10},marketplaceCover:{width:50,height:50,borderRadius:10,backgroundColor:'#21182F'},marketplaceCoverFallback:{alignItems:'center',justifyContent:'center'},marketplaceCoverIcon:{color:'#38D990',fontSize:20,fontWeight:'900'},marketplaceCopy:{flex:1,minWidth:0},marketplaceTitle:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},marketplaceMeta:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:3},marketplacePriceButton:{minWidth:56,minHeight:34,paddingHorizontal:9,borderRadius:17,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},marketplacePriceText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},immersiveLaunchButton:{marginTop:8,minHeight:38,borderRadius:19,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},immersiveLaunchButtonHot:{backgroundColor:'rgba(45,225,194,.12)',borderColor:colors.keep},immersiveLaunchText:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},immersiveLaunchTextHot:{color:colors.keep,fontSize:13,fontWeight:'900'},
  browseHint:{color:colors.textMuted,fontSize:12,marginTop:6},artistTrackRow:{flexDirection:'row',alignItems:'center',gap:10,marginTop:12},artistTrackCover:{width:48,height:48,borderRadius:10,backgroundColor:'#21182F'},artistTrackCoverPlaceholder:{alignItems:'center',justifyContent:'center'},artistTrackCoverPlaceholderText:{fontSize:20},artistTrackTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},artistTrackAlbum:{color:colors.textMuted,fontSize:11,marginTop:1},artistTrackPrice:{color:'#E5F266',fontSize:12,fontWeight:'900',marginTop:3},artistTrackBuyButton:{minHeight:32,paddingHorizontal:14,borderRadius:16,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},artistTrackBuyButtonText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},
  sectionTitle:{...typography.h3,color:colors.textPrimary},
  unifiedCounters:{marginHorizontal:18,marginTop:4,marginBottom:8,gap:2},
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
  editCard:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},editTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900',textAlign:'center'},cancelButton:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},cancelText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},
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
