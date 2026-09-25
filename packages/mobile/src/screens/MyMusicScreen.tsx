import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Image, Modal, TextInput, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useTranslation } from 'react-i18next';
import { analyzeLibrary, canonicalArtistIdentity, CanonicalTrack, groupTracksByArtist, LibraryAnalysis, ProviderPlaylist } from '@keep/music';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';
import { musicEngine } from '../services/musicEngine';
import { sharePlaylist } from '../services/sharingService';
import { prepareKeylessMusicExport } from '../services/keylessMusicBridge';
import { loadPlaylistPreferences, preferenceFor, savePlaylistPreference, KeepPlaylistPreference } from '../services/keepLibraryService';
import { getSmartSortAccess, QuotaAccess } from '../services/growthAccessService';
import { addTracksToOffer, choosePurchaseVisibility, clearPlaylistSalePrice, getPlaylistSaleAccess, loadMyOfferedTrackIds, loadMyPlaylistSaleOffers, loadPendingVisibilityChoice, PendingVisibilityChoice, PlaylistOfferedTrack, PlaylistSaleAccess, PlaylistSaleOffer, PlaylistSalePaymentMode, removeTrackFromOffer, SALE_PRESET_FREE, SALE_PRESET_PRICES_CENTS, setPlaylistSaleOfferForSelection, setPlaylistSalePrice, updateOfferPaymentMode, updateOfferPrice } from '../services/playlistSaleService';
import { isFeatureEnabled, isPlaylistMarketplaceVisible } from '../services/featureFlagService';
import { persistOwnTrackVisibility, removeOwnTrackFromKeep } from '../services/keepVisibilityService';
import { loadOwnPersistedKeeps, PersistedKeepDecision } from '../services/keepMusicCoreRecognition';
import {
  isSmartAlbumUiId,
  loadOwnSmartAlbums,
  loadSmartAlbumTracks,
  refreshOwnSmartAlbums,
  smartAlbumAsProviderPlaylist,
  SmartAlbumRecord,
} from '../services/smartAlbumService';
import TrackPreviewButton from '../components/TrackPreviewButton';
import LockedFeatureCard from '../components/LockedFeatureCard';
import TrackActionRow from '../components/TrackActionRow';
import { colors } from '../theme/colors';
import { radius, typography } from '../theme/spacing';

const ALL_KEEP_VIEW_ID = 'keep-all-music-view';
type PlaylistWithTracks = { playlist: ProviderPlaylist; tracks: CanonicalTrack[] };
// Adel (02/09/2026) : "il devrait avoir quatre briques comme sur le profil
// dans ma playlist ... un utilisateur télécharge plusieurs musiques de
// Maître Gims, ça devrait créer un [groupe] vu que c'est le même chanteur
// ... il manque connecté au profil." Même repère que ProfilePublicScreen,
// pour que le rangement soit cohérent partout au lieu de deux systèmes
// séparés.
// Adel (13/09/2026, audit) : Albums retiré ici aussi (même correction que
// ProfilePublicScreen) -- vérifié sur les vraies données, 98,8% des albums
// gardés n'ont qu'un seul morceau : la rubrique affichait quasi toujours la
// même chose qu'Artistes, avec le même bloc d'affichage.
type LibraryTab = 'MUSIQUES' | 'VIBES' | 'ARTISTES';
const LIBRARY_TABS: Array<{ key: LibraryTab; label: string }> = [
  { key: 'VIBES', label: 'Styles' }, { key: 'MUSIQUES', label: 'Musiques' },
  { key: 'ARTISTES', label: 'Artistes' },
];
const ARTIST_ID_PREFIX = 'keep-artist:';
const STYLE_ID_PREFIX = 'keep-style:';

function trackIdentity(track: CanonicalTrack) {
  const isrc = track.isrc?.trim().toUpperCase();
  if (isrc) return `isrc:${isrc}`;
  const title = track.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const artist = track.artist.trim().toLowerCase().replace(/\s+/g, ' ');
  return `meta:${title}|${artist}`;
}

function sortGateLabel(access: QuotaAccess | null) {
  if (!access) return 'STYLES Loki Music';
  if (access.unlimited) return 'STYLES AUTO · ILLIMITÉ';
  if (access.allowed && (access.remaining ?? 0) > 0) return `TESTER LE TRI PAR STYLES · ${access.remaining} RESTANT${access.remaining === 1 ? '' : 'S'}`;
  return '🔒 STYLES AUTOMATIQUES';
}

// Adel : le serveur (RPC keep_playlist_sale_set_price_for_selection_v2) lève des
// exceptions typées. On les traduit une à une en français clair au lieu d'avaler
// tous les cas dans un « Impossible d'enregistrer ce prix ». Code brut affiché si
// inconnu, jamais de message générique silencieux.
const SALE_SAVE_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: 'Ta session a expiré, reconnecte-toi puis réessaie.',
  TRACK_SELECTION_REQUIRED: 'Sélectionne au moins un titre.',
  TRACK_SELECTION_TOO_LARGE: 'Maximum 200 titres par collection.',
  PRICE_MUST_BE_A_PRESET_AMOUNT: 'Choisis un des prix proposés ou saisis un montant valide.',
  PLAYLIST_NAME_TOO_LONG: 'Le nom de la playlist est trop long (100 caractères max).',
  COVER_URL_MUST_BE_HTTPS: "L'image de couverture doit être en HTTPS.",
  TRACK_SELECTION_NOT_OWNED: "Tu peux publier uniquement les morceaux que tu as toi-même découverts. Un ou plusieurs titres viennent d'autres profils — retire-les de cette collection.",
  OFFER_NOT_FOUND_OR_NOT_YOURS: "Cette offre est introuvable ou ne t'appartient pas.",
  OFFER_NOT_ACTIVE: "Cette offre n'est plus active.",
  TRACK_NOT_IN_OFFER: "Ce morceau ne fait pas partie de l'offre.",
};

const resolveSaleSaveError = (raw: string, followers?: number | null, threshold?: number | null): string => {
  const msg = String(raw || '');
  const lockedMatch = msg.match(/PLAYLIST_SALE_LOCKED(?::\s*(\d+))?/);
  if (lockedMatch) {
    const required = Number(lockedMatch[1] ?? threshold ?? 100);
    const current = Number(followers ?? 0);
    const missing = Math.max(required - current, 0);
    return `Il te faut au moins ${required} abonnés pour publier une collection exclusive` + (missing > 0 ? ` (il t'en manque ${missing}).` : '.');
  }
  for (const code of Object.keys(SALE_SAVE_ERROR_MESSAGES)) {
    if (msg.includes(code)) return SALE_SAVE_ERROR_MESSAGES[code];
  }
  return `Une erreur inattendue est survenue${msg ? ` (${msg})` : ''}. Réessaie ou contacte le support.`;
};

export default function MyMusicScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const { playlists, isLoading, refresh } = usePlaylistStore();
  const user = useUserStore((s) => s.user);
  const userId = user?.id ?? '';
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const setAllKeptVisibility = useSessionHistoryStore((s) => s.setAllKeptVisibility);
  const syncUnsyncedKeeps = useSessionHistoryStore((s) => s.syncUnsyncedKeeps);
  const [analysis, setAnalysis] = useState<LibraryAnalysis | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [genresExpanded, setGenresExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tracksByPlaylist, setTracksByPlaylist] = useState<Record<string, CanonicalTrack[]>>({});
  const [loadingPlaylist, setLoadingPlaylist] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, KeepPlaylistPreference>>({});
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumRecord[]>([]);
  const [sortAccess, setSortAccess] = useState<QuotaAccess | null>(null);
  const [editing, setEditing] = useState<ProviderPlaylist | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [bulkVisibilityBusy, setBulkVisibilityBusy] = useState<'PUBLIC' | 'PRIVATE' | null>(null);
  const [trackVisibilityBusy, setTrackVisibilityBusy] = useState<string | null>(null);
  const [trackDeleteBusy, setTrackDeleteBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LibraryTab>('VIBES');
  const [socialSectionExpanded, setSocialSectionExpanded] = useState(true);
  const [originFilter, setOriginFilter] = useState<'ALL' | 'LISTEN' | 'USERS'>('ALL');
  const [serverKeeps, setServerKeeps] = useState<PersistedKeepDecision[]>([]);
  // Adel (14/09/2026) : "chaque utilisateur ... vendre leur playlist ...
  // pour le debloquer il faut un certain nombre d'abonnes" -- construit
  // integralement SAUF le paiement reel (Stripe Connect reserve a Adel,
  // meme principe que le teaser deja existant sur les evenements payants).
  // Fixer un prix est reel et sauvegarde ; aucun encaissement n'est
  // possible tant que Stripe Connect n'est pas branche cote serveur.
  const [saleAccess, setSaleAccess] = useState<PlaylistSaleAccess | null>(null);
  const [myOffers, setMyOffers] = useState<Record<string, PlaylistSaleOffer>>({});
  const [myOfferedTrackIds, setMyOfferedTrackIds] = useState<Record<string, PlaylistOfferedTrack>>({});
  // Adel (21/09/2026, mission 2/3) : popup "Rendre publique / Garder
  // masquée" à la première ouverture de l'app après qu'un achat a été
  // livré (le vendeur confirme manuellement, donc pas de webhook -- voir
  // playlistSaleService.ts). Une seule fois par achat (visibility_choice_made).
  const [pendingVisibilityChoice, setPendingVisibilityChoice] = useState<PendingVisibilityChoice | null>(null);
  const [visibilityChoiceBusy, setVisibilityChoiceBusy] = useState(false);
  // Adel (21/09/2026) : "Hauteur fixe et uniforme pour toutes les cartes ...
  // le reste des informations passe dans un menu dépliable." Public/Privé,
  // Supprimer, Vendre et "Donné par" ne changent plus la hauteur de la
  // rangée -- ils vivent dans ce panneau, replié par défaut. Seule la
  // lecture reste visible en permanence (mandat explicite de la mission).
  const [expandedTrackKeys, setExpandedTrackKeys] = useState<Set<string>>(new Set());
  const toggleTrackExpanded = (key: string) => setExpandedTrackKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Adel (20/09/2026) : marketplace playlists (VENDRE) mise en "coming
  // soon" -- paiement par lien externe, non conforme Apple IAP pour du
  // contenu numérique déverrouillé dans l'app. Code intact, juste masqué
  // tant que le flag Super Admin 'playlist_marketplace' reste désactivé.
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(false);
  // (21/09/2026) BUG RÉEL corrigé (Adel : "1000 abonnés assignés via Super
  // Admin, la fonction reste verrouillée") : ce check ne tournait qu'une
  // fois au montage (deps vides) -- un changement fait dans Super Admin
  // pendant que l'écran était déjà monté (flag, bypass de test) n'était
  // jamais relu sans tuer et rouvrir l'app en entier. Recalculé aussi à
  // chaque focus de l'écran, comme refreshLibrary juste en dessous.
  useEffect(() => {
    let live = true;
    const check = () => { isPlaylistMarketplaceVisible().then((enabled) => { if (live) setMarketplaceEnabled(enabled); }); };
    check();
    const unsubscribe = navigation?.addListener?.('focus', check);
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);
  // Adel (16-17/09/2026) : "l'utilisateur va pouvoir sélectionner les
  // musiques qu'il va vendre ou les albums complets ... assure-toi que les
  // montants sont pré-écrits" -- vendre une playlist nommée entière OU une
  // sélection explicite de morceaux (un groupe par artiste affiché ici
  // comme "album", ou un seul morceau), même popup, prix en chips fixes.
  const [sellTarget, setSellTarget] = useState<
    | { kind: 'playlist'; playlist: ProviderPlaylist }
    | { kind: 'selection'; key: string; name: string; trackIds: string[]; coverUrl?: string | null }
    | null
  >(null);
  const [sellPaymentMode, setSellPaymentMode] = useState<PlaylistSalePaymentMode>('MONEY');
  const [sellPriceCents, setSellPriceCents] = useState<number | null>(null);
  const [sellFreePrice, setSellFreePrice] = useState<number | null>(null);
  const [sellBusy, setSellBusy] = useState(false);
  const [saleSelectionMode, setSaleSelectionMode] = useState(false);
  const [selectedSaleTrackIds, setSelectedSaleTrackIds] = useState<Set<string>>(new Set());
  const [saleEditOfferTarget, setSaleEditOfferTarget] = useState<{ offerId: string; playlistName: string } | null>(null);
  const [manageMusicMode, setManageMusicMode] = useState(false);

  useEffect(() => {
    if (!route?.params?.openManageMusic) return;
    setActiveTab('MUSIQUES');
    setOriginFilter('ALL');
    setSocialSectionExpanded(true);
    setSaleSelectionMode(false);
    setSaleEditOfferTarget(null);
    setManageMusicMode(true);
    navigation?.setParams?.({ openManageMusic: undefined });
  }, [navigation, route?.params?.openManageMusic]);

  useEffect(() => {
    const offerId = String(route?.params?.manageSaleOfferId || '').trim();
    if (!offerId) return;
    const playlistName = String(route?.params?.manageSaleOfferName || 'Collection publiée').trim() || 'Collection publiée';
    setActiveTab('MUSIQUES');
    setOriginFilter('LISTEN');
    setSelectedSaleTrackIds(new Set());
    setSaleEditOfferTarget({ offerId, playlistName });
    setSaleSelectionMode(true);
    navigation?.setParams?.({ manageSaleOfferId: undefined, manageSaleOfferName: undefined });
  }, [navigation, route?.params?.manageSaleOfferId, route?.params?.manageSaleOfferName]);

  const localKeptEntries = useMemo(() => {
    // Source canonique = Supabase. L'historique de sessions reste utile pour
    // les KEEPs locaux non encore synchronisés, mais il ne doit plus pouvoir
    // masquer un KEEP serveur quand l'utilisateur a supprimé une ancienne
    // session de son historique.
    const local = sessions.flatMap((session) => session.tracks
      .filter((entry) => entry.status === 'kept')
      .map((entry) => ({ ...entry, sessionId: session.id })));
    const remote = serverKeeps.map((entry) => ({
      id: `server-${entry.decisionId}`,
      track: entry.track,
      recommendations: [],
      status: 'kept' as const,
      detectedAt: entry.detectedAt,
      visibility: entry.visibility,
      keepDecisionId: entry.decisionId,
      sourceProfileId: entry.sourceProfileId,
      sourceUsername: entry.sourceUsername,
      creditSource: entry.creditPolicy === 'SOCIAL_ZERO_CREDIT' ? 'SOCIAL' as const : 'FREE' as const,
      sessionId: entry.sessionId || '__keep-server-library__',
    }));
    const unique = new Map<string, (typeof remote)[number] | (typeof local)[number]>();

    // Le serveur passe d'abord : visibilité et origine sociale y sont les
    // références durables. Le local n'ajoute ensuite que les morceaux encore
    // absents du serveur (offline / synchro en attente).
    for (const entry of remote) unique.set(trackIdentity(entry.track), entry);
    for (const entry of local) {
      const key = trackIdentity(entry.track);
      if (!unique.has(key)) unique.set(key, entry);
    }

    return Array.from(unique.values()).sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [sessions, serverKeeps]);

  const ownDiscoveryEntries = useMemo(
    () => localKeptEntries.filter((entry) => !entry.sourceProfileId),
    [localKeptEntries],
  );
  const socialRepriseEntries = useMemo(
    () => localKeptEntries.filter((entry) => Boolean(entry.sourceProfileId)),
    [localKeptEntries],
  );
  const ownDiscoveryTracks = useMemo(() => ownDiscoveryEntries.map((entry) => entry.track), [ownDiscoveryEntries]);
  const socialRepriseTracks = useMemo(() => socialRepriseEntries.map((entry) => entry.track), [socialRepriseEntries]);
  const localKeptTracks = useMemo(() => localKeptEntries.map((entry) => entry.track), [localKeptEntries]);
  useEffect(() => {
    const genre = String(route?.params?.preselectSaleGenre || '').trim();
    if (!genre) return;
    const normalizedGenre = genre.toLocaleLowerCase('fr-FR');
    const trackIds = localKeptTracks
      .filter((track) => (track.genres ?? []).some((value) => value.trim().toLocaleLowerCase('fr-FR') === normalizedGenre))
      .map((track) => track.id);
    setActiveTab('MUSIQUES');
    setOriginFilter('LISTEN');
    setSaleEditOfferTarget(null);
    setSelectedSaleTrackIds(new Set(trackIds));
    setSaleSelectionMode(true);
    navigation?.setParams?.({ preselectSaleGenre: undefined });
    if (!trackIds.length) Alert.alert('Créer une collection', `Aucun morceau ${genre} n’est disponible dans ta bibliothèque pour le moment.`);
  }, [localKeptTracks, navigation, route?.params?.preselectSaleGenre]);
  const publicKeepCount = useMemo(() => localKeptEntries.filter((entry) => entry.visibility === 'PUBLIC').length, [localKeptEntries]);
  const privateKeepCount = localKeptEntries.length - publicKeepCount;
  const providerId = musicEngine.musicProvider.providerId || 'Loki Music';

  const refreshSmartState = async () => {
    if (!userId || isLocalGuest || isDemoMode) {
      setSortAccess(null);
      setSmartAlbums([]);
      return;
    }
    try {
      const gate = await getSmartSortAccess(false);
      setSortAccess(gate);
      const albums = gate.unlimited ? await refreshOwnSmartAlbums() : await loadOwnSmartAlbums();
      setSmartAlbums(albums);
    } catch {
      setSortAccess(null);
      setSmartAlbums(await loadOwnSmartAlbums().catch(() => []));
    }
  };

  const refreshSaleState = async () => {
    if (!marketplaceEnabled || !userId || isLocalGuest || isDemoMode) {
      setSaleAccess(null);
      setMyOffers({});
      setMyOfferedTrackIds({});
      setPendingVisibilityChoice(null);
      return;
    }
    try {
      const [access, offers, offeredTracks, pendingChoice] = await Promise.all([getPlaylistSaleAccess(), loadMyPlaylistSaleOffers(), loadMyOfferedTrackIds(), loadPendingVisibilityChoice()]);
      setPendingVisibilityChoice(pendingChoice);
      setSaleAccess(access);
      setMyOffers(Object.fromEntries(offers.filter((o) => o.isActive).map((o) => [o.playlistId, o])));
      // (21/09/2026) BUG RÉEL corrigé (Adel, profil adel4a) : myOffers seul
      // ne permet jamais de retrouver "ce morceau précis est-il déjà en
      // vente" après un rechargement -- ni pour une vente individuelle ni
      // pour une sélection multiple (les deux passent par
      // setPlaylistSalePriceForSelection, dont le vrai playlist_id serveur
      // est toujours 'keep-selection:<uuid>', jamais 'track:<id>' ni la clé
      // éphémère utilisée un instant côté écran). Ce nouveau mapping,
      // indexé par track_id réel, comble ce trou.
      setMyOfferedTrackIds(offeredTracks);
    } catch {
      setSaleAccess(null);
      setMyOffers({});
      setMyOfferedTrackIds({});
    }
  };

  const refreshLibrary = async () => {
    await syncUnsyncedKeeps().catch(() => {});
    if (userId && !isLocalGuest && !isDemoMode) {
      const persisted = await loadOwnPersistedKeeps().catch(() => null);
      if (persisted) setServerKeeps(persisted);
    } else {
      setServerKeeps([]);
    }
    await refresh().catch(() => {});
    await refreshSmartState().catch(() => {});
    await refreshSaleState().catch(() => {});
  };

  useEffect(() => {
    setTracksByPlaylist({});
    setExpandedId(null);
    setAnalysis(null);
    setPreferences({});
    setSmartAlbums([]);
    setSortAccess(null);
    setSaleAccess(null);
    setMyOffers({});
    setServerKeeps([]);
  }, [userId]);

  // Adel (21/09/2026) BUG RÉEL corrigé : "1000 abonnés assignés via Super
  // Admin, la fonction reste verrouillée" -- ce n'était pas le check du
  // flag lui-même (déjà corrigé plus haut) mais CET effet : il capturait
  // refreshLibrary/refreshSaleState dans une fermeture figée au montage, où
  // marketplaceEnabled valait encore `false` (la lecture async du flag
  // n'avait pas fini). Le listener de focus rappelait ensuite indéfiniment
  // cette même fermeture périmée -- saleAccess restait donc bloqué à null
  // pour toujours, même une fois le flag/bypass activé côté serveur.
  // Ajouter marketplaceEnabled aux deps force un nouveau fetch (et un
  // nouveau listener à jour) dès que le flag passe à true.
  useEffect(() => {
    void refreshLibrary();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshLibrary(); });
    return () => unsubscribe?.();
  }, [navigation, refresh, syncUnsyncedKeeps, userId, isLocalGuest, isDemoMode, marketplaceEnabled]);

  useEffect(() => {
    let live = true;
    void loadPlaylistPreferences(providerId).then((next) => { if (live) setPreferences(next); });
    return () => { live = false; };
  }, [providerId, playlists.length, smartAlbums.length, userId]);

  const basePlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = [];
    if (localKeptTracks.length) {
      result.push({
        id: ALL_KEEP_VIEW_ID,
        name: 'Toute ma musique',
        description: 'Tous tes morceaux au même endroit.',
        trackCount: localKeptTracks.length,
        isKeepManaged: true,
      });
    }
    for (const album of smartAlbums) result.push(smartAlbumAsProviderPlaylist(album));
    for (const playlist of playlists) result.push(playlist);
    return result;
  }, [localKeptTracks.length, playlists, smartAlbums]);

  const displayPlaylists = useMemo(() => basePlaylists.map((playlist) => {
    if (playlist.id === ALL_KEEP_VIEW_ID) return playlist;
    const pref = preferenceFor(preferences, providerId, playlist.id);
    return pref ? { ...playlist, name: pref.name || playlist.name, description: pref.description || playlist.description } : playlist;
  }), [basePlaylists, preferences, providerId]);

  // Adel (02/09/2026) : même tri alphabétique par artiste/album que le
  // Profil (ProfilePublicScreen) -- si plusieurs morceaux de Maître Gims
  // sont gardés, ils se retrouvent dans le même groupe au lieu d'être
  // éparpillés un par un.
  // Adel (14/09/2026) : "un système anti doublon" -- même correction que
  // ProfilePublicScreen, groupTracksByArtist (packages/music, déjà testé,
  // jamais branché avant) au lieu d'une égalité de chaîne : insensible aux
  // accents/majuscules/espaces, regroupe un featuring sous l'artiste principal.
  const artistPlaylists = useMemo<ProviderPlaylist[]>(() => {
    return groupTracksByArtist(localKeptTracks)
      .map((group) => ({ id: `${ARTIST_ID_PREFIX}${group.key}`, name: group.name, trackCount: group.trackCount, isKeepManaged: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [localKeptTracks]);

  // Source unique des Styles : mêmes morceaux gardés que le profil.
  // Les Vibes automatiques restent distinctes et sont rendues séparément
  // pour éviter de confondre "3 Vibes Auto" avec "X styles musicaux".
  const profileStyleGroups = useMemo(() => {
    const map = new Map<string, { label: string; tracks: CanonicalTrack[] }>();
    for (const track of localKeptTracks) {
      const genres = (track.genres ?? []).map((genre) => genre.trim()).filter(Boolean);
      const labels = genres.length ? genres : ['Sans genre'];
      for (const genre of labels) {
        const key = genre.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
        const current = map.get(key) ?? { label: genre, tracks: [] };
        if (!current.tracks.some((row) => row.id === track.id)) current.tracks.push(track);
        map.set(key, current);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.tracks.length - a.tracks.length || a.label.localeCompare(b.label))
      .map(({ label, tracks }) => ({ genre: label, tracks }));
  }, [localKeptTracks]);

  const stylePlaylists = useMemo<ProviderPlaylist[]>(
    () => profileStyleGroups.map(({ genre, tracks }) => ({
      id: `${STYLE_ID_PREFIX}${encodeURIComponent(genre)}`,
      name: genre,
      trackCount: tracks.length,
      isKeepManaged: true,
    })),
    [profileStyleGroups],
  );
  const automaticStylePlaylists = useMemo(
    () => displayPlaylists.filter((playlist) => isSmartAlbumUiId(playlist.id)),
    [displayPlaylists],
  );
  const regularPlaylists = useMemo(
    () => displayPlaylists.filter((playlist) => !isSmartAlbumUiId(playlist.id)),
    [displayPlaylists],
  );
  const tabPlaylists = activeTab === 'ARTISTES' ? artistPlaylists : stylePlaylists;

  const loadProviderTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {
    if (tracksByPlaylist[playlist.id]) return tracksByPlaylist[playlist.id];
    const session = await musicEngine.getSession();
    const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
    setTracksByPlaylist((state) => ({ ...state, [playlist.id]: tracks }));
    return tracks;
  };

  const loadTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {
    if (playlist.id === ALL_KEEP_VIEW_ID) {
      setTracksByPlaylist((state) => ({ ...state, [ALL_KEEP_VIEW_ID]: localKeptTracks }));
      return localKeptTracks;
    }
    if (playlist.id.startsWith(ARTIST_ID_PREFIX)) {
      const key = playlist.id.slice(ARTIST_ID_PREFIX.length);
      const tracks = localKeptTracks.filter((track) => canonicalArtistIdentity(track) === key);
      setTracksByPlaylist((state) => ({ ...state, [playlist.id]: tracks }));
      return tracks;
    }
    if (playlist.id.startsWith(STYLE_ID_PREFIX)) {
      const genre = decodeURIComponent(playlist.id.slice(STYLE_ID_PREFIX.length));
      const genreKey = genre.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
      const tracks = localKeptTracks.filter((track) => {
        const genres = (track.genres ?? []).map((value) => value.trim()).filter(Boolean);
        return genre === 'Sans genre'
          ? genres.length === 0
          : genres.some((value) => value.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ') === genreKey);
      });
      setTracksByPlaylist((state) => ({ ...state, [playlist.id]: tracks }));
      return tracks;
    }
    setLoadingPlaylist(playlist.id);
    try {
      const tracks = isSmartAlbumUiId(playlist.id) ? await loadSmartAlbumTracks(playlist.id) : await loadProviderTracks(playlist);
      setTracksByPlaylist((state) => ({ ...state, [playlist.id]: tracks }));
      return tracks;
    } finally {
      setLoadingPlaylist(null);
    }
  };

  const togglePlaylist = async (playlist: ProviderPlaylist) => {
    if (expandedId === playlist.id) return setExpandedId(null);
    setExpandedId(playlist.id);
    try { await loadTracks(playlist); }
    catch (e: any) { Alert.alert('Mes musiques', e?.message ?? 'Impossible de charger les morceaux.'); }
  };

  const setWholeLibraryVisibility = async (visibility: 'PUBLIC' | 'PRIVATE') => {
    const needsChange = visibility === 'PUBLIC' ? privateKeepCount : publicKeepCount;
    if (!needsChange || bulkVisibilityBusy) return;
    setBulkVisibilityBusy(visibility);
    try {
      await setAllKeptVisibility(visibility);
      await syncUnsyncedKeeps();
    } catch (e: any) {
      Alert.alert('Visibilité', e?.message ?? 'Impossible de modifier toute la bibliothèque pour le moment.');
    } finally {
      setBulkVisibilityBusy(null);
    }
  };

  const analyzeCurrentLibrary = async () => {
    const withTracks: PlaylistWithTracks[] = [];
    for (const playlist of basePlaylists.filter((item) => !isSmartAlbumUiId(item.id))) {
      withTracks.push({ playlist, tracks: await loadTracks(playlist) });
    }
    const nextRaw = analyzeLibrary(withTracks);
    const next = nextRaw.totalTracks <= 1
      ? { ...nextRaw, unclassifiedCount: 0, duplicateGroups: [], duplicateCount: 0 }
      : nextRaw;
    setAnalysis(next);
    setAnalysisExpanded(false);
  };

  const runOrganizeAnalysis = async () => {
    if (!userId || isLocalGuest || isDemoMode) {
      navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'SMART_SORTING' });
      return;
    }
    setAnalyzing(true);
    try {
      const gate = await getSmartSortAccess(true);
      setSortAccess(gate);
      if (!gate.allowed && !gate.unlimited) {
        navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'SMART_SORTING' });
        return;
      }
      const albums = await refreshOwnSmartAlbums();
      setSmartAlbums(albums);
      await analyzeCurrentLibrary();
      const nextGate = await getSmartSortAccess(false).catch(() => gate);
      setSortAccess(nextGate);
    } catch (e: any) {
      Alert.alert('Vibes Loki Music', e?.message ?? 'Impossible de ranger automatiquement la bibliothèque pour le moment.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Même source que le profil ET que les cartes de l'onglet Styles.
  const genreSummary = useMemo(
    () => profileStyleGroups.map(({ genre, tracks }) => [genre, tracks.length] as [string, number]),
    [profileStyleGroups],
  );
  const topGenres = useMemo(() => genreSummary.slice(0, 5), [genreSummary]);

  const analysisMessage = analysis
    ? analysis.totalTracks === 0
      ? 'Aucun morceau à analyser pour le moment.'
      : analysis.totalTracks === 1
        ? '1 morceau trouvé · Loki Music attend davantage de matière.'
        : `${analysis.totalTracks} morceaux analysés · ${smartAlbums.length} Vibe${smartAlbums.length > 1 ? 's' : ''} Loki Music disponible${smartAlbums.length > 1 ? 's' : ''}.`
    : null;

  const openEdit = (playlist: ProviderPlaylist) => {
    const pref = preferenceFor(preferences, providerId, playlist.id);
    setEditing(playlist);
    setEditName(pref?.name || playlist.name);
    setEditDescription(pref?.description ?? playlist.description ?? '');
    setEditPublic(pref?.isPublic ?? false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const preference: KeepPlaylistPreference = {
      provider: providerId,
      providerPlaylistId: editing.id,
      name: editName.trim() || editing.name,
      description: editDescription.trim(),
      isPublic: editPublic,
      coverUrl: editing.coverUrl,
    };
    setSavingEdit(true);
    try {
      await savePlaylistPreference(preference);
      setPreferences((state) => ({ ...state, [`${providerId}:${editing.id}`]: preference }));
      setSmartAlbums((rows) => rows.map((row) => `keep-smart:${row.id}` === editing.id ? { ...row, name: preference.name, description: preference.description, isPublic: preference.isPublic } : row));
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Vibe Loki Music', e?.message ?? 'Impossible d’enregistrer les modifications.');
    } finally {
      setSavingEdit(false);
    }
  };

  const closeSellModal = () => { setSellTarget(null); setSellPriceCents(null); };

  const toggleSaleTrack = (trackId: string) => {
    // (21/09/2026) : un morceau déjà dans une offre active ne peut pas être
    // rebundlé silencieusement dans une nouvelle sélection -- il faut
    // d'abord modifier/retirer l'offre existante (bouton "🏷️ En vente").
    if (myOfferedTrackIds[trackId]) return;
    setSelectedSaleTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId); else next.add(trackId);
      return next;
    });
  };

  const cancelSaleSelection = () => {
    setSaleSelectionMode(false);
    setSelectedSaleTrackIds(new Set());
    setSaleEditOfferTarget(null);
  };

  const createSaleSelection = () => {
    const tracks = localKeptTracks.filter((track) => selectedSaleTrackIds.has(track.id));
    if (tracks.length < 2) {
      Alert.alert('Collection exclusive', 'Choisis au moins 2 morceaux. Une collection représente ton univers musical, jamais un morceau isolé.');
      return;
    }
    openSellModal({
      kind: 'selection',
      key: `selection:${Date.now()}`,
      name: `Ma collection · ${tracks.length} titres`,
      trackIds: tracks.map((track) => track.id),
      coverUrl: null,
    });
  };

  // (21/09/2026, Partie 4) : "je dois pouvoir ajouter d'autres morceaux à
  // cette offre existante sans devoir tout supprimer et recommencer" --
  // réutilise la sélection multiple déjà construite (cases à cocher) au
  // lieu d'un nouveau sélecteur, avec un choix d'offre si plusieurs
  // existent (dérivé de myOfferedTrackIds, déjà chargé -- aucun appel
  // réseau de plus).
  const existingOffersForAdd = useMemo(() => {
    const byOfferId = new Map<string, { offerId: string; playlistName: string; priceCents: number }>();
    Object.values(myOfferedTrackIds).forEach((entry) => {
      if (!byOfferId.has(entry.offerId)) byOfferId.set(entry.offerId, { offerId: entry.offerId, playlistName: entry.playlistName, priceCents: entry.priceCents });
    });
    return Array.from(byOfferId.values());
  }, [myOfferedTrackIds]);

  const addSelectedTracksToOffer = async (offerId: string) => {
    const trackIds = Array.from(selectedSaleTrackIds).filter((id) => !myOfferedTrackIds[id]);
    if (!trackIds.length) {
      Alert.alert('Sélection', 'Choisis au moins un morceau qui n’est pas déjà inclus dans une collection publiée.');
      return;
    }
    try {
      const result = await addTracksToOffer(offerId, trackIds);
      Alert.alert('Collection mise à jour', `${result.addedCount} morceau${result.addedCount > 1 ? 'x' : ''} ajouté${result.addedCount > 1 ? 's' : ''} (${result.trackCount} au total).`);
      setSelectedSaleTrackIds(new Set());
      await refreshSaleState();
    } catch {
      Alert.alert('Collection', 'Impossible d’ajouter ces morceaux à la collection pour le moment.');
    }
  };

  const addSelectionToExistingOffer = () => {
    const trackIds = Array.from(selectedSaleTrackIds).filter((id) => !myOfferedTrackIds[id]);
    if (!trackIds.length) return Alert.alert('Sélection', 'Choisis au moins un morceau qui n’est pas déjà inclus dans une collection publiée.');
    if (saleEditOfferTarget) {
      void addSelectedTracksToOffer(saleEditOfferTarget.offerId);
      return;
    }
    if (existingOffersForAdd.length === 1) {
      void addSelectedTracksToOffer(existingOffersForAdd[0].offerId);
      return;
    }
    Alert.alert(
      'Ajouter à quelle collection ?',
      undefined,
      [
        ...existingOffersForAdd.map((offer) => ({
          text: `${offer.playlistName} · ${(offer.priceCents / 100).toFixed(2)}€`,
          onPress: () => void addSelectedTracksToOffer(offer.offerId),
        })),
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  };

  // (21/09/2026) BUG RÉEL corrigé (Adel, profil adel4a) : "modifier l'offre"
  // d'un morceau déjà en vente. Il n'existe pas de RPC "mettre à jour le
  // prix d'une offre existante" -- on retire l'ancienne (par son vrai
  // offerId, maintenant connu grâce à keep_playlist_sale_my_offered_track_ids)
  // puis on rouvre le popup prix normal, pré-rempli à l'ancien prix pour
  // que confirmer recrée la même offre au même tarif si rien ne change.
  // (21/09/2026, Adel) : "le vendeur ne peut jamais perdre ses morceaux ...
  // réversibilité totale avec retour à l'état d'origine" -- déjà garanti par
  // construction : le masquage public (keep_playlist_sale_masked_track_ids)
  // ne fait que FILTRER les morceaux des offres actives à l'affichage,
  // jamais toucher keep_decisions.visibility -- retirer l'offre suffit donc
  // à retrouver exactement l'état d'avant-vente, sans rien à restaurer.
  // Seul un vrai NOUVEL état ("garder masqué volontairement") nécessite une
  // action explicite, ajoutée ici en réutilisant persistOwnTrackVisibility
  // (déjà utilisé plus haut sur cet écran pour PUBLIC/PRIVÉ), sans nouvelle
  // RPC ni nouveau système.
  // (21/09/2026, Partie 4) BUG RÉEL corrigé : les 3 actions retiraient
  // TOUTE l'offre (clearPlaylistSalePrice sur tout le playlist_id) même
  // pour retirer/repricer UN SEUL morceau -- invisible tant qu'une offre
  // n'avait qu'un morceau (le seul cas réel observé jusqu'ici), mais
  // aurait détruit les autres morceaux d'une offre à plusieurs titres.
  // removeTrackFromOffer/updateOfferPrice touchent l'offre EXISTANTE par
  // son offerId réel, sans jamais recréer ni perdre les autres morceaux.
  const editExistingTrackOffer = (track: CanonicalTrack) => {
    const offered = myOfferedTrackIds[track.id];
    if (!offered) return;
    Alert.alert(
      'Gérer cette collection',
      `« ${track.title} » fait déjà partie de « ${offered.playlistName} ». Que veux-tu faire ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer de la collection',
          onPress: async () => {
            try {
              await removeTrackFromOffer(offered.offerId, track.id);
              setMyOfferedTrackIds((prev) => { const next = { ...prev }; delete next[track.id]; return next; });
            } catch {
              Alert.alert('Collection', 'Impossible de retirer ce morceau de la collection pour le moment.');
            }
          },
        },
        {
          text: 'Retirer et garder privé',
          onPress: async () => {
            try {
              await removeTrackFromOffer(offered.offerId, track.id);
              await persistOwnTrackVisibility(track, 'PRIVATE');
              setMyOfferedTrackIds((prev) => { const next = { ...prev }; delete next[track.id]; return next; });
            } catch {
              Alert.alert('Collection', 'Impossible de retirer ce morceau de la collection pour le moment.');
            }
          },
        },
        {
          text: 'Changer le prix',
          onPress: () => {
            Alert.alert(
              'Nouveau prix',
              `Prix actuel : ${(offered.priceCents / 100).toFixed(2)}€`,
              [
                ...SALE_PRESET_PRICES_CENTS.map((cents) => ({
                  text: `${(cents / 100).toFixed(2)}€`,
                  onPress: async () => {
                    try {
                      await updateOfferPrice(offered.offerId, cents);
                      setMyOfferedTrackIds((prev) => ({ ...prev, [track.id]: { ...offered, priceCents: cents } }));
                    } catch {
                      Alert.alert('Collection', 'Impossible de changer le prix pour le moment.');
                    }
                  },
                })),
                { text: 'Annuler', style: 'cancel' },
              ],
            );
          },
        },
      ],
    );
  };

  const openSellModal = (target: typeof sellTarget) => {
    if (!saleAccess?.unlocked) {
      Alert.alert('◆ Collection exclusive', `Réservé à partir de ${saleAccess?.threshold ?? 100} abonnés. Tu en as ${saleAccess?.followers ?? 0} pour l'instant.`);
      return;
    }
    setSellTarget(target);
    const existingKey = target?.kind === 'playlist' ? target.playlist.id : target?.key;
    const existing = existingKey ? myOffers[existingKey] : undefined;
    const mode: PlaylistSalePaymentMode = existing?.paymentMode === 'FREE' ? 'FREE' : 'MONEY';
    setSellPaymentMode(mode);
    setSellPriceCents(existing?.priceCents || null);
    setSellFreePrice(existing?.freePrice ?? null);
  };

  const saveSellPrice = async () => {
    if (!sellTarget) return;
    const amount = sellPaymentMode === 'FREE' ? sellFreePrice : sellPriceCents;
    if (!amount) {
      Alert.alert('Montant requis', sellPaymentMode === 'FREE' ? 'Choisis le nombre de FREE demandé.' : 'Choisis un montant en euros.');
      return;
    }
    const stableKey = sellTarget.kind === 'playlist' ? sellTarget.playlist.id : sellTarget.key;
    setSellBusy(true);
    try {
      const offer = sellTarget.kind === 'selection'
        ? await setPlaylistSaleOfferForSelection(sellTarget.trackIds, sellTarget.name, sellPaymentMode, amount, 'EUR')
        : sellPaymentMode === 'MONEY'
          ? await setPlaylistSalePrice(sellTarget.playlist.id, sellTarget.playlist.name, sellPriceCents ?? 0)
          : (() => { throw new Error('FREE_REQUIRES_MULTI_TRACK_SELECTION'); })();
      setMyOffers((prev) => ({ ...prev, [stableKey]: offer }));
      await refreshSaleState();
      if (sellTarget.kind === 'selection' && sellTarget.key.startsWith('selection:')) cancelSaleSelection();
      closeSellModal();
    } catch (e: any) {
      const raw = String(e?.message || e || '');
      if (raw.includes('FREE_REQUIRES_MULTI_TRACK_SELECTION')) {
        Alert.alert('Collection exclusive', 'Pour utiliser les FREE, crée une collection depuis la sélection multiple de morceaux.');
      } else {
        Alert.alert('Collection', resolveSaleSaveError(raw, saleAccess?.followers, saleAccess?.threshold));
      }
    } finally {
      setSellBusy(false);
    }
  };

  const removeSellPrice = async () => {
    if (!sellTarget) return;
    const stableKey = sellTarget.kind === 'playlist' ? sellTarget.playlist.id : sellTarget.key;
    // Le serveur identifie l'offre par son VRAI playlist_id (peut différer
    // de la clé stable pour une sélection) -- on le relit depuis l'offre
    // déjà chargée en mémoire.
    const realId = myOffers[stableKey]?.playlistId ?? stableKey;
    setSellBusy(true);
    try {
      await clearPlaylistSalePrice(realId);
      setMyOffers((prev) => { const next = { ...prev }; delete next[stableKey]; return next; });
      closeSellModal();
    } catch {
      Alert.alert('Collection', 'Impossible de retirer cette collection pour le moment.');
    } finally {
      setSellBusy(false);
    }
  };

  const localEntryForTrack = (track: CanonicalTrack) => localKeptEntries.find((item) => trackIdentity(item.track) === trackIdentity(track));

  const toggleTrackVisibility = async (track: CanonicalTrack) => {
    const entry = localEntryForTrack(track);
    if (!entry) return Alert.alert('Visibilité', 'Cette musique vient d’une Vibe ou d’un service connecté. Modifie la visibilité de sa collection.');
    const key = trackIdentity(track);
    if (trackVisibilityBusy === key || trackDeleteBusy === key) return;
    const next = entry.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    setTrackVisibilityBusy(key);
    try {
      if (isLocalGuest || isDemoMode) {
        useSessionHistoryStore.setState((state) => ({
          sessions: state.sessions.map((session) => ({
            ...session,
            tracks: session.tracks.map((item) => item.status === 'kept' && trackIdentity(item.track) === key ? { ...item, visibility: next } : item),
          })),
        }));
        return;
      }

      const persisted = await persistOwnTrackVisibility(track, next);
      useSessionHistoryStore.setState((state) => ({
        sessions: state.sessions.map((session) => ({
          ...session,
          tracks: session.tracks.map((item) => {
            if (item.status !== 'kept' || trackIdentity(item.track) !== key) return item;
            return {
              ...item,
              visibility: persisted.visibility,
              keepDecisionId: item.id === entry.id ? persisted.decisionId : item.keepDecisionId,
            };
          }),
        })),
      }));
      await syncUnsyncedKeeps();
    } catch (e: any) {
      Alert.alert('Visibilité', e?.message ?? 'Impossible de modifier la visibilité de ce morceau pour le moment.');
    } finally {
      setTrackVisibilityBusy(null);
    }
  };

  const removeTrackNow = async (track: CanonicalTrack) => {
    const key = trackIdentity(track);
    if (trackDeleteBusy === key || trackVisibilityBusy === key) return;
    setTrackDeleteBusy(key);
    try {
      if (!isLocalGuest && !isDemoMode) await removeOwnTrackFromKeep(track);

      useSessionHistoryStore.setState((state) => ({
        sessions: state.sessions
          .map((session) => ({
            ...session,
            tracks: session.tracks.filter((item) => !(item.status === 'kept' && trackIdentity(item.track) === key)),
          }))
          .filter((session) => session.tracks.length > 0),
      }));
      setTracksByPlaylist((state) => Object.fromEntries(
        Object.entries(state).map(([playlistId, tracks]) => [playlistId, tracks.filter((item) => trackIdentity(item) !== key)]),
      ) as Record<string, CanonicalTrack[]>);
      setAnalysis(null);
      await refreshSmartState().catch(() => {});
      await refresh().catch(() => {});
    } catch (e: any) {
      Alert.alert('Supprimer', e?.message ?? 'Impossible de supprimer ce morceau pour le moment.');
    } finally {
      setTrackDeleteBusy(null);
    }
  };

  const confirmRemoveTrack = (track: CanonicalTrack) => {
    const message = `${track.title} sera retiré de Loki Music et ne sera plus visible sur ton profil. Cette action ne supprime rien de Spotify ou Apple Music.`;
    if (Platform.OS === 'web') {
      const confirmFn = typeof globalThis !== 'undefined' ? (globalThis as any).confirm : undefined;
      if (typeof confirmFn === 'function' && confirmFn(`Supprimer ce morceau ?\n\n${message}`)) void removeTrackNow(track);
      return;
    }
    Alert.alert(
      'Supprimer ce morceau ?',
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void removeTrackNow(track) },
      ],
    );
  };

  const openSourceProfile = (sourceUsername?: string) => {
    const clean = sourceUsername?.trim().replace(/^@+/, '');
    if (!clean) return;
    navigation.navigate('PublicProfile', { username: clean });
  };

  const renderTrack = (track: CanonicalTrack) => {
    const localEntry = localEntryForTrack(track);
    const key = trackIdentity(track);
    const publicTrack = localEntry?.visibility === 'PUBLIC';
    const visibilityBusy = trackVisibilityBusy === key;
    const deleteBusy = trackDeleteBusy === key;
    const busy = visibilityBusy || deleteBusy;
    const offered = myOfferedTrackIds[track.id];
    const expanded = expandedTrackKeys.has(key);
    // Adel (21/09/2026) : un morceau reçu d'un autre profil (pas sa propre
    // découverte) ne peut jamais être mis en vente -- cadenas visible dans
    // la sélection au lieu d'un blocage silencieux, sans toucher au design.
    const notOwnDiscovery = Boolean(localEntry?.sourceProfileId);
    // Adel (21/09/2026, maquette interactive validée :
    // https://claude.ai/artifact/9X4dx8oMmCJ3hkRGndc7BW) : grille à
    // colonnes fixes, seule source de vérité TrackActionRow. La sélection
    // multiple (case à cocher) reste hors grille, à gauche -- interaction
    // de mode, pas une action de morceau. Public/Privé, Supprimer, Vendre
    // et "Donné par" restent dans le panneau dépliable (actions de
    // gestion, pas des interactions rapides).
    return (
      <View key={key} style={styles.trackRowOuter}>
        {saleSelectionMode && localEntry ? <TouchableOpacity
          style={[styles.selectionCheck, selectedSaleTrackIds.has(track.id) && styles.selectionCheckOn, offered && styles.selectionCheckDisabled, notOwnDiscovery && styles.selectionCheckLocked]}
          onPress={() => notOwnDiscovery
            ? Alert.alert('Non éligible', `« ${track.title} » ne peut pas rejoindre cette collection : elle vient d’un autre utilisateur. Seul son découvreur d’origine peut l’intégrer à une collection exclusive.`)
            : toggleSaleTrack(track.id)}
          disabled={Boolean(offered)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectedSaleTrackIds.has(track.id), disabled: Boolean(offered || notOwnDiscovery) }}
          accessibilityLabel={notOwnDiscovery ? `${track.title} non éligible à une collection exclusive, découverte par un autre utilisateur` : offered ? `${track.title} déjà dans une collection publiée, ouvre cette collection pour la modifier` : `Sélectionner ${track.title}`}
        ><Text style={styles.selectionCheckText}>{notOwnDiscovery ? '🔒' : selectedSaleTrackIds.has(track.id) ? '✓' : ''}</Text></TouchableOpacity> : null}
        <View style={styles.trackRowGrid}>
          <TrackActionRow
            coverUrl={track.artworkUrl}
            title={track.title}
            artist={track.artist}
            badge={offered ? { label: `◆ Collection · ${offered.playlistName}`, onPress: () => editExistingTrackOffer(track) } : undefined}
            originBadge={localEntry ? {
              label: localEntry.sourceProfileId
                ? `UTILISATEUR${localEntry.sourceUsername ? ` · @${localEntry.sourceUsername.replace(/^@+/, '')}` : ''}`
                : 'ÉCOUTE',
              tone: localEntry.sourceProfileId ? 'social' : 'listen',
              onPress: localEntry.sourceProfileId && localEntry.sourceUsername
                ? () => openSourceProfile(localEntry.sourceUsername)
                : undefined,
            } : undefined}
            playSlot={<TrackPreviewButton trackKey={track.id} previewUrl={track.previewUrl} square />}
            actions={[]}
            expandable={!manageMusicMode && Boolean(localEntry)}
            expanded={manageMusicMode || expanded}
            onToggleExpand={manageMusicMode ? undefined : () => toggleTrackExpanded(key)}
          >
            {localEntry?.sourceUsername ? <View style={styles.trackSourceRow}>
              <Text style={styles.trackSourceLabel}>Donné par</Text>
              <TouchableOpacity onPress={() => openSourceProfile(localEntry.sourceUsername)} accessibilityRole="link" accessibilityLabel={`Ouvrir le profil de ${localEntry.sourceUsername}`}>
                <Text style={styles.trackSourceLink}>{localEntry.sourceUsername.replace(/^@+/, '')}</Text>
              </TouchableOpacity>
            </View> : null}
            <View style={styles.trackActions}>
              <TouchableOpacity
                style={[styles.visibilityTrackButton, publicTrack ? styles.visibilityTrackPublic : styles.visibilityTrackPrivate]}
                onPress={() => void toggleTrackVisibility(track)}
                disabled={busy}
                accessibilityLabel={publicTrack ? 'Musique publique, appuyer pour la passer en privé' : 'Musique privée, appuyer pour la passer en public'}
              >
                {visibilityBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.visibilityTrackText}>{publicTrack ? 'PUBLIC' : 'PRIVÉ'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteTrackButton}
                onPress={() => confirmRemoveTrack(track)}
                disabled={busy}
                accessibilityLabel="Supprimer ce morceau de Loki Music"
              >
                {deleteBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.deleteTrackText}>SUPPRIMER</Text>}
              </TouchableOpacity>
              {/* Règle produit 25/09/2026 : jamais de produit morceau par
                  morceau. Ce bouton sélectionne uniquement ce titre pour
                  composer une collection exclusive de plusieurs morceaux.
                  Une collection déjà publiée reste gérable depuis son badge. */}
              {marketplaceEnabled ? (
                offered ? (
                  <TouchableOpacity
                    style={[styles.sellTrackButton, styles.sellTrackButtonOffered]}
                    onPress={() => editExistingTrackOffer(track)}
                    accessibilityLabel={`Gérer la collection contenant ${track.title}`}
                  >
                    <Text style={[styles.sellTrackText, styles.sellTrackTextOffered]}>{`◆ Dans collection · ${offered.playlistName}`}</Text>
                  </TouchableOpacity>
                ) : (
                  <LockedFeatureCard
                    unlocked={Boolean(saleAccess?.unlocked)}
                    title="Créer une collection exclusive"
                    requirementLabel="abonnés"
                    current={saleAccess?.followers ?? 0}
                    required={saleAccess?.threshold ?? 100}
                    benefit="Compose une collection avec tes découvertes, fixe € / FREE, publie-la et suis chaque déblocage dans ton historique."
                    actionLabel="Voir mon profil"
                    onAction={() => navigation.navigate('Main', { screen: 'Profile' })}
                    lockedTeaser={<View style={styles.sellTrackButton}><Text style={styles.sellTrackText}>🔒 COLLECTION</Text></View>}
                  >
                    <TouchableOpacity
                      style={styles.sellTrackButton}
                      onPress={() => {
                        setOriginFilter('LISTEN');
                        setSelectedSaleTrackIds((current) => new Set(current).add(track.id));
                        setSaleSelectionMode(true);
                      }}
                      accessibilityLabel={`Sélectionner ${track.title} pour une collection exclusive`}
                    >
                      <Text style={styles.sellTrackText}>＋ COLLECTION</Text>
                    </TouchableOpacity>
                  </LockedFeatureCard>
                )
              ) : null}
            </View>
          </TrackActionRow>
        </View>
      </View>
    );
  };

  const renderPlaylist = ({ item }: { item: ProviderPlaylist }) => {
    const isAllKeepView = item.id === ALL_KEEP_VIEW_ID;
    const isArtistGroup = item.id.startsWith(ARTIST_ID_PREFIX);
    const isStyleGroup = item.id.startsWith(STYLE_ID_PREFIX);
    const isGroupView = isArtistGroup || isStyleGroup;
    const isSmart = isSmartAlbumUiId(item.id);
    const pref = isAllKeepView || isGroupView ? null : preferenceFor(preferences, providerId, item.id);
    const expanded = expandedId === item.id;
    const tracks = isAllKeepView ? (tracksByPlaylist[ALL_KEEP_VIEW_ID] ?? localKeptTracks) : (tracksByPlaylist[item.id] ?? []);
    const actualCount = isAllKeepView ? localKeptTracks.length : item.trackCount;
    const visibility = isAllKeepView ? `${publicKeepCount} public · ${privateKeepCount} privé` : isGroupView ? null : (pref?.isPublic ? 'Public' : 'Privé');
    return <View style={[styles.playlistBlock, isSmart && styles.smartBlock]}>
      <TouchableOpacity style={styles.playlistCard} onPress={() => void togglePlaylist(item)} accessibilityLabel={`Ouvrir ${item.name}`}>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.playlistCover} /> : <View style={[styles.playlistCover, styles.playlistCoverFallback]}><Text style={styles.playlistCoverText}>{isSmart ? '✦' : '♪'}</Text></View>}
        <View style={styles.playlistInfo}>
          <View style={styles.playlistTitleRow}><Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>{isSmart ? <View style={styles.smartPill}><Text style={styles.smartPillText}>VIBE</Text></View> : null}</View>
          <Text style={styles.songCount}>{actualCount} morceau{actualCount > 1 ? 'x' : ''}{visibility ? ` · ${visibility}` : ''}</Text>
        </View>
        {!isAllKeepView && !isGroupView ? <TouchableOpacity style={styles.miniEdit} onPress={() => openEdit(item)}><Text style={styles.miniEditText}>✎</Text></TouchableOpacity> : null}
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {expanded ? <View style={styles.tracksPanel}>
        {loadingPlaylist === item.id ? <Text style={styles.loadingText}>Chargement…</Text> : tracks.length ? tracks.map(renderTrack) : <Text style={styles.loadingText}>Aucun morceau dans cette collection.</Text>}
        {!isAllKeepView ? <View style={styles.collectionActions}>
          <TouchableOpacity style={styles.serviceMini} onPress={async () => {
            try {
              const exportTracks = tracks.length ? tracks : await loadTracks(item);
              if (!exportTracks.length) return Alert.alert('Services musicaux', 'Cette Vibe ne contient encore aucun morceau.');
              await prepareKeylessMusicExport(item.name, exportTracks);
              navigation.navigate('MusicConnections');
            } catch (e: any) {
              Alert.alert('Services musicaux', e?.message ?? 'Impossible de préparer cette Vibe.');
            }
          }}><Text style={styles.serviceMiniText}>♫ SERVICES</Text></TouchableOpacity>
          <TouchableOpacity style={styles.shareMini} onPress={() => sharePlaylist(item.id, item.name).catch(() => Alert.alert('Partager', 'Partage indisponible pour le moment.'))}><Text style={styles.shareMiniText}>↗ PARTAGER</Text></TouchableOpacity>
          {marketplaceEnabled && !isAllKeepView ? (
            myOffers[item.id] ? (
              <TouchableOpacity style={styles.sellMini} onPress={() => (isGroupView ? openSellModal({ kind: 'selection', key: item.id, name: item.name, trackIds: tracks.map((t) => t.id), coverUrl: tracks.find((t) => Boolean(t.artworkUrl))?.artworkUrl ?? null }) : openSellModal({ kind: 'playlist', playlist: item }))}>
                <Text style={styles.sellMiniText}>{`💶 ${(myOffers[item.id].priceCents / 100).toFixed(2)}€`}</Text>
              </TouchableOpacity>
            ) : (
              <LockedFeatureCard
                unlocked={Boolean(saleAccess?.unlocked)}
                title={isGroupView ? 'Créer une collection avec cet album' : 'Créer une collection avec cette playlist'}
                requirementLabel="abonnés"
                current={saleAccess?.followers ?? 0}
                required={saleAccess?.threshold ?? 100}
                benefit="Compose une collection avec tes découvertes, fixe € / FREE, publie-la et suis chaque déblocage dans ton historique."
                actionLabel="Voir mon profil"
                onAction={() => navigation.navigate('Main', { screen: 'Profile' })}
                lockedTeaser={<View style={styles.sellMini}><Text style={styles.sellMiniText}>🔒 COLLECTION</Text></View>}
              >
                <TouchableOpacity style={styles.sellMini} onPress={() => {
                  if (isGroupView) openSellModal({ kind: 'selection', key: item.id, name: item.name, trackIds: tracks.map((t) => t.id), coverUrl: tracks.find((t) => Boolean(t.artworkUrl))?.artworkUrl ?? null });
                  else openSellModal({ kind: 'playlist', playlist: item });
                }}>
                  <Text style={styles.sellMiniText}>{isGroupView ? '◆ CRÉER AVEC CET ALBUM' : '◆ CRÉER UNE COLLECTION'}</Text>
                </TouchableOpacity>
              </LockedFeatureCard>
            )
          ) : null}
        </View> : null}
      </View> : null}
    </View>;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>Mes musiques</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>Styles · Playlists · Artistes</Text>
        </View>
        <TouchableOpacity style={styles.servicesButton} onPress={() => navigation.navigate('MusicConnections')} accessibilityLabel="Gérer les services musicaux"><Text style={styles.servicesButtonText}>＋ Services</Text></TouchableOpacity>
      </View>

      <View style={styles.tabs}>{LIBRARY_TABS.map((tab) => (
        <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => setActiveTab(tab.key)} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab.key }} accessibilityLabel={tab.label}>
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextOn]}>{tab.label}</Text>
          {activeTab === tab.key ? <View style={styles.tabIndicator} /> : null}
        </TouchableOpacity>
      ))}</View>

      {activeTab === 'MUSIQUES' ? (
        <View style={[styles.manageGuide, manageMusicMode && styles.manageGuideActive]}>
          <View style={styles.manageGuideIcon}><Text style={styles.manageGuideIconText}>{manageMusicMode ? '✓' : '♫'}</Text></View>
          <View style={styles.manageGuideCopy}>
            <Text style={styles.manageGuideTitle}>{manageMusicMode ? 'MODE GESTION ACTIF' : 'GÉRER MES MUSIQUES'}</Text>
            <Text style={styles.manageGuideText}>
              {manageMusicMode
                ? 'Toutes les commandes sont ouvertes sous chaque morceau : PUBLIC / PRIVÉ, SUPPRIMER et COLLECTION. Le bouton ▶ reste uniquement pour écouter.'
                : 'Touche TOUT GÉRER : chaque morceau affichera immédiatement PUBLIC / PRIVÉ, SUPPRIMER et COLLECTION, sans chercher dans un sous-menu.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.manageModeButton, manageMusicMode && styles.manageModeButtonActive]}
            onPress={() => setManageMusicMode((value) => {
              const next = !value;
              if (next) {
                setOriginFilter('ALL');
                setSocialSectionExpanded(true);
              }
              return next;
            })}
            accessibilityRole="button"
            accessibilityLabel={manageMusicMode ? 'Terminer la gestion des musiques' : 'Ouvrir toutes les commandes de gestion'}
          >
            <Text style={[styles.manageModeButtonText, manageMusicMode && styles.manageModeButtonTextActive]}>
              {manageMusicMode ? 'TERMINER' : 'TOUT GÉRER'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {activeTab === 'VIBES' ? <TouchableOpacity style={[styles.vibeBar, sortAccess && !sortAccess.allowed && !sortAccess.unlimited && styles.vibeBarLocked]} onPress={() => void runOrganizeAnalysis()} disabled={analyzing}>
        <View style={styles.vibeBarCopy}><Text style={styles.vibeBarTitle}>{analyzing ? 'Loki Music RANGE…' : sortGateLabel(sortAccess)}</Text><Text style={styles.vibeBarHint}>{sortAccess?.unlimited ? 'Le rangement se met à jour automatiquement.' : sortAccess?.allowed ? 'Essai disponible · tu gardes le contrôle des noms.' : 'Creator Pro requis, ou gagne un essai avec ta communauté.'}</Text></View>
        <Text style={styles.vibeArrow}>{sortAccess?.allowed || sortAccess?.unlimited ? '✦' : '🔒'}</Text>
      </TouchableOpacity> : null}

      {localKeptEntries.length ? <View style={styles.libraryStrip}>
        <View style={styles.stat}><Text style={styles.statValue}>{publicKeepCount}</Text><Text style={[styles.statLabel, styles.statLabelPublic]}>PUBLIC</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{privateKeepCount}</Text><Text style={[styles.statLabel, styles.statLabelPrivate]}>PRIVÉ</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{localKeptEntries.length}</Text><Text style={styles.statLabel}>TOTAL</Text></View>
        <View style={styles.visibilityTools}>
          <TouchableOpacity style={[styles.visibilityMini, styles.visibilityMiniPublic]} onPress={() => void setWholeLibraryVisibility('PUBLIC')} disabled={privateKeepCount === 0 || bulkVisibilityBusy !== null}>
            {bulkVisibilityBusy === 'PUBLIC' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.visibilityMiniText}>TOUT PUBLIC</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.visibilityMini, styles.visibilityMiniPrivate]} onPress={() => void setWholeLibraryVisibility('PRIVATE')} disabled={publicKeepCount === 0 || bulkVisibilityBusy !== null}>
            {bulkVisibilityBusy === 'PRIVATE' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.visibilityMiniText}>TOUT PRIVÉ</Text>}
          </TouchableOpacity>
        </View>
      </View> : null}

      {activeTab === 'MUSIQUES' && localKeptEntries.length ? <View style={styles.originSummary}>
        <Text style={styles.originSummaryText}>
          <Text style={styles.originOwnCount}>{ownDiscoveryEntries.length} découverts</Text>
          {' · '}
          <Text style={styles.originSocialCount}>{socialRepriseEntries.length} repris</Text>
          {' · Total '}
          <Text style={styles.originTotalCount}>{localKeptEntries.length}</Text>
        </Text>
        <View style={styles.originFilters}>
          {([
            ['ALL', `TOUT · ${localKeptEntries.length}`],
            ['LISTEN', `DÉCOUVERTES · ${ownDiscoveryEntries.length}`],
            ['USERS', `REPRISES · ${socialRepriseEntries.length}`],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.originFilterButton, originFilter === key && styles.originFilterButtonOn]}
              onPress={() => setOriginFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: originFilter === key }}
              accessibilityLabel={label}
            >
              <Text style={[styles.originFilterText, originFilter === key && styles.originFilterTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View> : null}

      {activeTab === 'VIBES' && analysis ? <TouchableOpacity style={styles.analysisSummary} onPress={() => setAnalysisExpanded((value) => !value)}>
        <Text style={styles.analysisSummaryText} numberOfLines={2}>{analysisMessage}</Text><Text style={styles.analysisChevron}>{analysisExpanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity> : null}
      {activeTab === 'VIBES' && analysis && analysisExpanded ? <View style={styles.analysisCard}>
        <Text style={styles.analysisLine}>{t('myMusic.songsAnalyzed', { count: analysis.totalTracks })}</Text>
        {topGenres.length ? (
          <TouchableOpacity
            style={styles.genreToggle}
            activeOpacity={genreSummary.length > topGenres.length ? 0.6 : 1}
            onPress={() => genreSummary.length > topGenres.length && setGenresExpanded((v) => !v)}
          >
            <Text style={styles.genreLine}>
              Styles : {(genresExpanded ? genreSummary : topGenres).map(([genre, count]) => `${genre} ${count}`).join(' · ')}
            </Text>
            {genreSummary.length > topGenres.length ? (
              <Text style={styles.genreChevron}>{genresExpanded ? '⌃' : '⌄'}</Text>
            ) : null}
          </TouchableOpacity>
        ) : null}
        {genresExpanded && genreSummary.length > topGenres.length ? (
          <View style={styles.genreChips}>
            {genreSummary.map(([genre, count]) => (
              <View key={genre} style={styles.genreChip}><Text style={styles.genreChipText}>{genre} · {count}</Text></View>
            ))}
          </View>
        ) : null}
        <Text style={styles.analysisHelp}>Loki Music crée les Styles automatiquement sans supprimer tes morceaux. Tu peux les renommer et les rendre publiques ou privées.</Text>
      </View> : null}

      {activeTab === 'MUSIQUES' ? (
        <FlatList
          data={originFilter === 'USERS' ? socialRepriseTracks : ownDiscoveryTracks}
          renderItem={({ item }) => renderTrack(item)}
          keyExtractor={(item) => `own:${trackIdentity(item)}`}
          refreshing={isLoading}
          onRefresh={() => { void refreshLibrary(); }}
          ListHeaderComponent={<>
            {regularPlaylists.length ? (
              <View style={styles.playlistFoldersIntro}>
                <Text style={styles.playlistFoldersTitle}>MES PLAYLISTS</Text>
                <Text style={styles.playlistFoldersHint}>Tes collections complètes restent accessibles ici. Tes Styles automatiques sont dans l’onglet Styles.</Text>
                {regularPlaylists.map((playlist) => <View key={`manual:${playlist.id}`}>{renderPlaylist({ item: playlist })}</View>)}
              </View>
            ) : null}
            {marketplaceEnabled && localKeptTracks.length && !saleSelectionMode ? <View style={styles.selectionToolbar}>
              <LockedFeatureCard
                unlocked={Boolean(saleAccess?.unlocked)}
                title="Créer une collection exclusive"
                requirementLabel="abonnés"
                current={saleAccess?.followers ?? 0}
                required={saleAccess?.threshold ?? 100}
                benefit="Sélectionne plusieurs morceaux, mélange les styles si tu veux, puis publie-les comme une collection exclusive avec un prix en € ou en FREE."
                actionLabel="Voir mon profil"
                onAction={() => navigation.navigate('Main', { screen: 'Profile' })}
                lockedTeaser={<View style={styles.selectionStartButton}><Text style={styles.selectionStartText}>🔒 CRÉER UNE COLLECTION EXCLUSIVE</Text></View>}
              >
                <TouchableOpacity style={styles.selectionStartButton} onPress={() => setSaleSelectionMode(true)} accessibilityLabel="Créer une collection exclusive"><Text style={styles.selectionStartText}>＋ CRÉER UNE COLLECTION EXCLUSIVE</Text></TouchableOpacity>
              </LockedFeatureCard>
            </View> : null}
            {localKeptEntries.length ? <View style={[styles.originSection, originFilter === 'USERS' ? styles.originSectionSocial : styles.originSectionOwn]}>
              <View style={styles.originSectionHeader}>
                <View style={styles.originSectionTitleRow}>
                  <Text style={styles.originSectionIcon}>{originFilter === 'USERS' ? '👥' : '🎧'}</Text>
                  <Text style={[styles.originSectionTitle, originFilter === 'USERS' ? styles.originSectionTitleSocial : styles.originSectionTitleOwn]}>
                    {originFilter === 'USERS' ? "🔒 Reprises d'autres utilisateurs" : 'Mes découvertes'}
                  </Text>
                </View>
                <Text style={[styles.originSectionCount, originFilter === 'USERS' ? styles.originSectionCountSocial : styles.originSectionCountOwn]}>
                  {originFilter === 'USERS' ? socialRepriseEntries.length : ownDiscoveryEntries.length} titres
                </Text>
              </View>
            </View> : null}
          </>}
          ListFooterComponent={originFilter === 'ALL' && socialRepriseEntries.length ? <View style={[styles.originSection, styles.originSectionSocial]}>
            <TouchableOpacity
              style={styles.originSectionHeader}
              onPress={() => setSocialSectionExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: socialSectionExpanded }}
              accessibilityLabel="Afficher ou masquer les musiques reprises d'autres utilisateurs"
            >
              <View style={styles.originSectionTitleRow}><Text style={styles.originSectionIcon}>👥</Text><Text style={[styles.originSectionTitle, styles.originSectionTitleSocial]}>🔒 Reprises d'autres utilisateurs</Text></View>
              <View style={styles.originSectionRight}><Text style={[styles.originSectionCount, styles.originSectionCountSocial]}>{socialRepriseEntries.length} titres</Text><Text style={styles.originSectionChevron}>{socialSectionExpanded ? '⌄' : '›'}</Text></View>
            </TouchableOpacity>
            {socialSectionExpanded ? <View style={styles.originSectionBody}>{socialRepriseTracks.map((track) => (
              <View key={`social:${trackIdentity(track)}`}>{renderTrack(track)}</View>
            ))}</View> : null}
          </View> : null}
          ListEmptyComponent={socialRepriseEntries.length ? null : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Aucune musique gardée</Text><Text style={styles.emptyText}>Garde quelques morceaux : Loki Music construira ensuite ton univers et, selon ta formule, tes Styles automatiques.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Main', { screen: 'Listen' })}><Text style={styles.emptyButtonText}>ÉCOUTER</Text></TouchableOpacity></View>}
          contentContainerStyle={[styles.list, saleSelectionMode && styles.listWithStickyFooter]}
        />
      ) : (
        <FlatList
          data={tabPlaylists}
          renderItem={renderPlaylist}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isLoading}
          onRefresh={() => { void refreshLibrary(); }}
          ListHeaderComponent={activeTab === 'VIBES' ? (
            <View style={styles.styleCountHeader}>
              <Text style={styles.styleCountTitle}>MES STYLES · {stylePlaylists.length}</Text>
              <Text style={styles.styleCountHint}>Même compteur que ton profil · calculé uniquement avec tes morceaux gardés.</Text>
            </View>
          ) : null}
          ListFooterComponent={activeTab === 'VIBES' && automaticStylePlaylists.length ? (
            <View style={styles.autoVibesSection}>
              <Text style={styles.autoVibesTitle}>VIBES AUTO · {automaticStylePlaylists.length}</Text>
              <Text style={styles.autoVibesHint}>Classements intelligents séparés de tes Styles musicaux.</Text>
              {automaticStylePlaylists.map((playlist) => <View key={`auto:${playlist.id}`}>{renderPlaylist({ item: playlist })}</View>)}
            </View>
          ) : null}
          ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>{activeTab === 'ARTISTES' ? 'Tes artistes apparaîtront ici.' : 'Aucune musique gardée'}</Text><Text style={styles.emptyText}>Garde quelques morceaux : Loki Music construira ensuite ton univers et, selon ta formule, tes Vibes automatiques.</Text><TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Main', { screen: 'Listen' })}><Text style={styles.emptyButtonText}>ÉCOUTER</Text></TouchableOpacity></View>}
        />
      )}

      {/* Adel (21/09/2026) : "ce bouton descend au fur et à mesure pour ne
          pas avoir à remonter jusqu'en haut pour valider" -- barre de
          confirmation collée en bas de l'écran pendant la sélection,
          au lieu de rester en haut de la liste (ListHeaderComponent). */}
      {activeTab === 'MUSIQUES' && saleSelectionMode ? (
        <View style={styles.stickySelectionFooter}>
          <View style={styles.selectionToolbarCopy}>
            <Text style={styles.selectionToolbarTitle}>{saleEditOfferTarget ? `Modifier · ${saleEditOfferTarget.playlistName}` : `${selectedSaleTrackIds.size} morceau${selectedSaleTrackIds.size > 1 ? 'x' : ''} sélectionné${selectedSaleTrackIds.size > 1 ? 's' : ''}`}</Text>
            <Text style={styles.selectionToolbarHint}>{saleEditOfferTarget ? 'Sélectionne de nouveaux morceaux. Pour en retirer un déjà inclus, touche son badge collection puis “Retirer de la collection”.' : 'Appuie sur les ronds, puis crée ta collection exclusive.'}</Text>
          </View>
          <View style={styles.stickySelectionActions}>
            <TouchableOpacity style={styles.selectionCancelButton} onPress={cancelSaleSelection}><Text style={styles.selectionCancelText}>{saleEditOfferTarget ? 'TERMINER' : 'ANNULER'}</Text></TouchableOpacity>
            {saleEditOfferTarget ? (
              <TouchableOpacity style={[styles.selectionAddButton, !selectedSaleTrackIds.size && styles.selectionCreateDisabled]} disabled={!selectedSaleTrackIds.size} onPress={addSelectionToExistingOffer}>
                <Text style={styles.selectionAddText}>＋ AJOUTER ({selectedSaleTrackIds.size})</Text>
              </TouchableOpacity>
            ) : (
              <>
                {existingOffersForAdd.length ? (
                  <TouchableOpacity style={styles.selectionAddButton} disabled={!selectedSaleTrackIds.size} onPress={addSelectionToExistingOffer}><Text style={styles.selectionAddText}>＋ COLLECTION EXISTANTE</Text></TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[styles.selectionCreateButton, selectedSaleTrackIds.size < 2 && styles.selectionCreateDisabled]} disabled={selectedSaleTrackIds.size < 2} onPress={createSaleSelection}><Text style={styles.selectionCreateText}>CRÉER LA COLLECTION ({selectedSaleTrackIds.size})</Text></TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ) : null}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><View style={styles.editCard}>
          <Text style={styles.editTitle}>{editing && isSmartAlbumUiId(editing.id) ? 'Renommer ma Vibe' : 'Modifier la collection'}</Text>
          <Text style={styles.editHint}>Le nom et la visibilité restent entièrement sous ton contrôle.</Text>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Nom" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.multiline]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline />
          <TouchableOpacity style={[styles.visibilityButton, editPublic ? styles.visibilityButtonPublic : styles.visibilityButtonPrivate]} onPress={() => setEditPublic((v) => !v)}><Text style={styles.visibilityText}>{editPublic ? 'PUBLIC · Visible sur mon profil' : 'PRIVÉ · Masquée du profil'}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveText}>ENREGISTRER</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(null)}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
        </View></ScrollView></View>
      </Modal>

      {/* Adel (16-17/09/2026) : "assure-toi que les montants sont
          pré-écrits pour éviter les bugs ... ça peut se vendre maximum 10
          euros" -- prix en chips fixes, plus de saisie libre. Sert à la
          fois pour une playlist entière, un album (groupe par artiste) et
          un seul morceau -- même popup, sellTarget change juste ce qui est
          vendu. */}
      <Modal visible={!!sellTarget} transparent animationType="fade" onRequestClose={closeSellModal}>
        <View style={styles.modalBackdrop}><View style={styles.editCard}>
          <Text style={styles.editTitle}>Créer la collection · {sellTarget?.kind === 'playlist' ? sellTarget.playlist.name : sellTarget?.name}</Text>
          <Text style={styles.editHint}>L'acheteur paiera directement sur ton lien de paiement personnel (Réglages &gt; Type de profil &amp; outils créateur). Loki Music ne touche jamais cet argent.</Text>
          {sellTarget?.kind === 'selection' ? <TextInput
            style={styles.input}
            value={sellTarget.name}
            maxLength={100}
            onChangeText={(name) => setSellTarget((current) => current?.kind === 'selection' ? { ...current, name } : current)}
            placeholder="Nom de la collection"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Nom de la collection exclusive"
          /> : null}
          {sellTarget?.kind === 'selection' ? (
            <View style={styles.priceChipsRow}>
              <TouchableOpacity
                style={[styles.priceChip, sellPaymentMode === 'MONEY' && styles.priceChipOn]}
                onPress={() => setSellPaymentMode('MONEY')}
                accessibilityLabel="Choisir un déblocage en euros"
              >
                <Text style={[styles.priceChipText, sellPaymentMode === 'MONEY' && styles.priceChipTextOn]}>€ EUROS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.priceChip, sellPaymentMode === 'FREE' && styles.priceChipOn]}
                onPress={() => setSellPaymentMode('FREE')}
                accessibilityLabel="Choisir un déblocage en FREE"
              >
                <Text style={[styles.priceChipText, sellPaymentMode === 'FREE' && styles.priceChipTextOn]}>⚡ FREE</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.salePriceHeader}>
            <Text style={styles.salePriceLabel}>ACCÈS À TOUTE LA COLLECTION</Text>
            <Text style={styles.salePriceExplain}>
              {sellTarget?.kind === 'selection'
                ? `Ce montant débloque les ${sellTarget.trackIds.length} titre${sellTarget.trackIds.length > 1 ? 's' : ''} ensemble — jamais morceau par morceau.`
                : 'Ce montant débloque toute la collection — jamais chaque morceau séparément.'}
            </Text>
          </View>
          {sellPaymentMode === 'MONEY' ? (
            <View style={styles.priceChipsRow}>
              {SALE_PRESET_PRICES_CENTS.map((cents) => (
                <TouchableOpacity key={cents} style={[styles.priceChip, sellPriceCents === cents && styles.priceChipOn]} onPress={() => setSellPriceCents(cents)}>
                  <Text style={[styles.priceChipText, sellPriceCents === cents && styles.priceChipTextOn]}>{(cents / 100).toFixed(2).replace('.', ',')}€</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.priceChipsRow}>
              {SALE_PRESET_FREE.map((free) => (
                <TouchableOpacity key={free} style={[styles.priceChip, sellFreePrice === free && styles.priceChipOn]} onPress={() => setSellFreePrice(free)}>
                  <Text style={[styles.priceChipText, sellFreePrice === free && styles.priceChipTextOn]}>{free} FREE</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {sellPaymentMode === 'MONEY' && sellPriceCents ? <Text style={styles.salePriceSummary}>
            DÉBLOCAGE COMPLET · {(sellPriceCents / 100).toFixed(2).replace('.', ',')}€ {sellTarget?.kind === 'selection' ? `pour ${sellTarget.trackIds.length} titre${sellTarget.trackIds.length > 1 ? 's' : ''}` : 'pour toute la collection'}
          </Text> : null}
          {sellPaymentMode === 'FREE' && sellFreePrice ? <Text style={styles.salePriceSummary}>
            DÉBLOCAGE COMPLET · {sellFreePrice} FREE pour {sellTarget?.kind === 'selection' ? `${sellTarget.trackIds.length} titre${sellTarget.trackIds.length > 1 ? 's' : ''}` : 'toute la collection'}
          </Text> : null}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => void saveSellPrice()}
            disabled={sellBusy || (sellPaymentMode === 'MONEY' ? !sellPriceCents : !sellFreePrice)}
          >
            {sellBusy ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveText}>PUBLIER LA COLLECTION</Text>}
          </TouchableOpacity>
          {sellTarget && myOffers[sellTarget.kind === 'playlist' ? sellTarget.playlist.id : sellTarget.key] ? (
            <TouchableOpacity style={styles.cancelButton} onPress={() => void removeSellPrice()} disabled={sellBusy}><Text style={[styles.cancelText, { color: colors.danger }]}>RETIRER DU PROFIL</Text></TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.cancelButton} onPress={closeSellModal}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Adel (21/09/2026, mission 2/3) : "après paiement, choix immédiat
          Rendre publique / Garder masquée" -- affiché la première fois que
          cet écran se recharge après une livraison marketplace (voir
          keep_playlist_sale_pending_visibility_choice, une seule fois par
          achat). Les morceaux restent PRIVATE par défaut tant que ce choix
          n'est pas fait -- comportement déjà en place, inchangé. */}
      <Modal visible={!!pendingVisibilityChoice} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}><View style={styles.editCard}>
          <Text style={styles.editTitle}>🎉 Découverte débloquée</Text>
          <Text style={styles.editHint}>
            {pendingVisibilityChoice ? `${pendingVisibilityChoice.trackCount} titre${pendingVisibilityChoice.trackCount > 1 ? 's' : ''} de la sélection de ${pendingVisibilityChoice.sellerUsername ? `@${pendingVisibilityChoice.sellerUsername}` : 'ce profil'} ${pendingVisibilityChoice.trackCount > 1 ? 'ont rejoint' : 'a rejoint'} ton Loki Music, avec le badge « 🥇 1er Gardé ». Veux-tu rendre cette playlist publique sur ton profil, ou la garder masquée pour toi ?` : ''}
          </Text>
          <TouchableOpacity
            style={styles.saveButton}
            disabled={visibilityChoiceBusy}
            onPress={async () => {
              if (!pendingVisibilityChoice) return;
              setVisibilityChoiceBusy(true);
              try {
                await choosePurchaseVisibility(pendingVisibilityChoice.paymentId, true);
                setPendingVisibilityChoice(null);
                await refreshLibrary();
              } catch { Alert.alert('Erreur', 'Impossible d’enregistrer ce choix pour le moment.'); }
              finally { setVisibilityChoiceBusy(false); }
            }}
          >
            {visibilityChoiceBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>RENDRE PUBLIQUE</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            disabled={visibilityChoiceBusy}
            onPress={async () => {
              if (!pendingVisibilityChoice) return;
              setVisibilityChoiceBusy(true);
              try {
                await choosePurchaseVisibility(pendingVisibilityChoice.paymentId, false);
                setPendingVisibilityChoice(null);
                await refreshLibrary();
              } catch { Alert.alert('Erreur', 'Impossible d’enregistrer ce choix pour le moment.'); }
              finally { setVisibilityChoiceBusy(false); }
            }}
          >
            <Text style={styles.cancelText}>Garder masquée</Text>
          </TouchableOpacity>
          <Text style={styles.editHint}>Modifiable à tout moment plus tard, morceau par morceau, dans « Mes musiques ».</Text>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},
  header:{paddingVertical:13,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerCopy:{flex:1,minWidth:0},title:{...typography.h1,color:colors.textPrimary},headerSubtitle:{color:colors.textMuted,fontSize:10,marginTop:1},servicesButton:{backgroundColor:colors.primary,borderRadius:radius.pill,paddingHorizontal:11,minHeight:44,alignItems:'center',justifyContent:'center'},servicesButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  tabs:{marginTop:10,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},tab:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},tabIndicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},
  vibeBar:{marginHorizontal:14,marginTop:8,minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.primary,backgroundColor:'#171020',paddingHorizontal:12,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:8},vibeBarLocked:{borderColor:'#493369'},vibeBarCopy:{flex:1},vibeBarTitle:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},vibeBarHint:{color:'#FFFFFF',fontSize:11,lineHeight:15,marginTop:2,fontWeight:'700'},vibeArrow:{fontSize:16},
  styleCountHeader:{marginBottom:10,padding:12,borderRadius:18,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primary},
  styleCountTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',letterSpacing:.5},
  styleCountHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:3},
  autoVibesSection:{marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border},
  autoVibesTitle:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:.7,marginBottom:2},
  autoVibesHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginBottom:8},
  manageGuide:{marginHorizontal:12,marginTop:10,padding:12,borderRadius:18,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary,flexDirection:'row',alignItems:'center',gap:10},
  manageGuideActive:{borderColor:colors.keep,backgroundColor:colors.successFaint},
  manageModeButton:{minHeight:34,paddingHorizontal:9,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  manageModeButtonActive:{borderColor:colors.keep},
  manageModeButtonText:{color:colors.primaryLight,fontSize:8,fontWeight:'900'},
  manageModeButtonTextActive:{color:colors.keep},
  manageGuideIcon:{width:38,height:38,borderRadius:19,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  manageGuideIconText:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  manageGuideCopy:{flex:1,minWidth:0},
  manageGuideTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.6},
  manageGuideText:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:2},
  libraryStrip:{marginHorizontal:14,marginTop:6,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,minHeight:68,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:5},stat:{minWidth:46,alignItems:'center',justifyContent:'center',paddingHorizontal:3},statValue:{color:colors.textPrimary,fontSize:17,fontWeight:'900'},statLabel:{color:colors.textMuted,fontSize:7,fontWeight:'900',marginTop:1},statLabelPublic:{color:'#68F2B1'},statLabelPrivate:{color:'#FF758F'},visibilityTools:{flex:1,flexDirection:'row',justifyContent:'flex-end',gap:5},visibilityMini:{minHeight:44,paddingHorizontal:7,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},visibilityMiniPublic:{backgroundColor:'#123D2C',borderColor:'#38D990'},visibilityMiniPrivate:{backgroundColor:'#4A171B',borderColor:'#F0525D'},visibilityMiniText:{color:'#FFFFFF',fontSize:7.5,fontWeight:'900'},
  originSummary:{marginHorizontal:14,marginTop:7,alignItems:'center'},originSummaryText:{color:colors.textMuted,fontSize:11,fontWeight:'800'},originOwnCount:{color:colors.keep},originSocialCount:{color:colors.primaryLight},originTotalCount:{color:colors.textPrimary},
  originFilters:{width:'100%',flexDirection:'row',gap:6,marginTop:8},originFilterButton:{flex:1,minHeight:44,paddingHorizontal:5,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},originFilterButtonOn:{borderColor:colors.primaryLight,backgroundColor:colors.backgroundCard},originFilterText:{color:colors.textMuted,fontSize:8,fontWeight:'900',textAlign:'center'},originFilterTextOn:{color:colors.textPrimary},
  originSection:{borderRadius:18,borderWidth:1,overflow:'hidden',marginBottom:10},originSectionOwn:{borderColor:colors.keep,backgroundColor:colors.successFaint},originSectionSocial:{borderColor:colors.primary,backgroundColor:colors.primaryFaint,marginTop:10},originSectionHeader:{minHeight:52,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},originSectionTitleRow:{flexDirection:'row',alignItems:'center',gap:7,flex:1,minWidth:0},originSectionIcon:{fontSize:15},originSectionTitle:{fontSize:14,fontWeight:'900',flexShrink:1},originSectionTitleOwn:{color:colors.keep},originSectionTitleSocial:{color:colors.primaryLight},originSectionRight:{flexDirection:'row',alignItems:'center',gap:7},originSectionCount:{fontSize:10,fontWeight:'900'},originSectionCountOwn:{color:colors.keep},originSectionCountSocial:{color:colors.primaryLight},originSectionChevron:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},originSectionBody:{paddingHorizontal:8,paddingBottom:8,gap:6},

  analysisSummary:{marginHorizontal:14,marginTop:6,minHeight:44,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8},analysisSummaryText:{flex:1,color:colors.textPrimary,fontSize:10,lineHeight:14,fontWeight:'800'},analysisChevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},analysisCard:{marginHorizontal:14,marginTop:4,backgroundColor:colors.backgroundElevated,borderRadius:12,padding:10,gap:4},analysisLine:{color:colors.textSecondary,fontSize:11},genreToggle:{flexDirection:'row',alignItems:'center',gap:6},genreLine:{flex:1,color:colors.primaryLight,fontSize:10,lineHeight:15},genreChevron:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},genreChips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:2},genreChip:{paddingHorizontal:9,paddingVertical:5,borderRadius:999,backgroundColor:'#2A203A',borderWidth:1,borderColor:'#7652AF'},genreChipText:{color:'#C9B3FF',fontSize:9,fontWeight:'800'},analysisHelp:{color:colors.textMuted,fontSize:9,lineHeight:14},
  selectionToolbar:{marginBottom:8,padding:10,borderRadius:14,borderWidth:1,borderColor:'#6F5520',backgroundColor:'#211A0C',flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},selectionStartButton:{flex:1,minHeight:44,borderRadius:20,backgroundColor:'#3D2F10',borderWidth:1,borderColor:'#FFD166',alignItems:'center',justifyContent:'center'},selectionStartText:{color:'#FFD166',fontSize:10,fontWeight:'900'},selectionToolbarCopy:{flex:1,minWidth:150},selectionToolbarTitle:{color:'#FFFFFF',fontSize:11,fontWeight:'900'},selectionToolbarHint:{color:colors.textMutedGrey,fontSize:8,marginTop:2},selectionCancelButton:{minHeight:44,paddingHorizontal:9,borderRadius:17,borderWidth:1,borderColor:'#6A6076',alignItems:'center',justifyContent:'center'},selectionCancelText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},selectionAddButton:{minHeight:44,paddingHorizontal:9,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},selectionAddText:{color:'#FFF',fontSize:8,fontWeight:'900'},selectionCreateButton:{minHeight:44,paddingHorizontal:10,borderRadius:17,backgroundColor:'#FFD166',alignItems:'center',justifyContent:'center'},selectionCreateDisabled:{opacity:.38},selectionCreateText:{color:'#1B1405',fontSize:8,fontWeight:'900'},selectionCheck:{width:28,height:28,borderRadius:14,borderWidth:2,borderColor:'#7C7088',alignItems:'center',justifyContent:'center'},selectionCheckOn:{backgroundColor:'#FFD166',borderColor:'#FFD166'},selectionCheckDisabled:{opacity:.35},selectionCheckLocked:{opacity:1,borderColor:colors.danger,backgroundColor:'rgba(255,92,114,0.12)'},selectionCheckText:{color:'#1B1405',fontSize:15,fontWeight:'900'},
  // (21/09/2026) : "ce bouton descend au fur et à mesure" -- barre de
  // confirmation collée en bas de l'écran pendant la sélection multiple.
  listWithStickyFooter:{paddingBottom:96},
  stickySelectionFooter:{position:'absolute',left:12,right:12,bottom:12,padding:10,borderRadius:14,borderWidth:1,borderColor:'#6F5520',backgroundColor:'#211A0C',gap:8,shadowColor:'#000',shadowOpacity:0.3,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:6},
  stickySelectionActions:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},
  playlistFoldersIntro:{marginBottom:14},playlistFoldersTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900',letterSpacing:.6},playlistFoldersHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:4,marginBottom:8},
  list:{paddingHorizontal:12,paddingVertical:8,flexGrow:1},playlistBlock:{backgroundColor:colors.backgroundCard,borderRadius:13,marginVertical:5,overflow:'hidden',borderWidth:1,borderColor:colors.border},smartBlock:{borderColor:'#493369'},playlistCard:{flexDirection:'row',minHeight:70,alignItems:'center'},playlistCover:{width:70,height:70,backgroundColor:colors.backgroundElevated},playlistCoverFallback:{alignItems:'center',justifyContent:'center'},playlistCoverText:{color:colors.primaryLight,fontSize:22,fontWeight:'900'},playlistInfo:{flex:1,paddingHorizontal:10},playlistTitleRow:{flexDirection:'row',alignItems:'center',gap:6},playlistName:{flexShrink:1,fontSize:14,fontWeight:'800',color:colors.textPrimary},smartPill:{paddingHorizontal:6,paddingVertical:3,borderRadius:999,backgroundColor:'#2A203A',borderWidth:1,borderColor:'#7652AF'},smartPillText:{color:'#C9B3FF',fontSize:7,fontWeight:'900'},songCount:{fontSize:9,color:colors.keep,marginTop:4,fontWeight:'700'},chevron:{color:colors.primaryLight,fontSize:18,paddingHorizontal:8},miniEdit:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},miniEditText:{color:colors.textSecondary,fontSize:13,fontWeight:'900'},
  tracksPanel:{borderTopWidth:1,borderTopColor:colors.border,padding:8,gap:6,backgroundColor:colors.backgroundElevated},
  // Adel (21/09/2026) : hauteur fixe (56, plus compacte que les cartes de
  // profil car cette liste est déjà nichée dans un panneau déplié) --
  // plus jamais de variation selon le contenu. Le panneau dépliable
  // (expandedPanel) vit HORS de cette rangée, dans trackCard.
  // Adel (21/09/2026, maquette interactive validée) : la grille elle-même
  // (pochette/titre/carrés/chevron/panneau) vit désormais dans
  // TrackActionRow.tsx (source de vérité unique) -- ne reste ici que
  // l'habillage propre à cet écran (case de sélection multiple hors grille).
  trackRowOuter:{flexDirection:'row',alignItems:'center',gap:8},trackRowGrid:{flex:1,minWidth:0},
  trackSourceRow:{flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap'},trackSourceLabel:{color:colors.textMuted,fontSize:8,fontWeight:'700'},trackSourceLink:{color:colors.primaryLight,fontSize:8,fontWeight:'900',textDecorationLine:'underline'},trackActions:{flexDirection:'row',alignItems:'stretch',gap:5},visibilityTrackButton:{flex:1,minHeight:44,paddingHorizontal:4,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},visibilityTrackPublic:{backgroundColor:'#123D2C',borderColor:'#38D990'},visibilityTrackPrivate:{backgroundColor:'#4A171B',borderColor:'#F0525D'},visibilityTrackText:{color:'#FFFFFF',fontSize:7.5,fontWeight:'900'},deleteTrackButton:{flex:1,minHeight:44,paddingHorizontal:4,borderRadius:14,borderWidth:1,borderColor:'#8C4650',backgroundColor:'#311419',alignItems:'center',justifyContent:'center'},deleteTrackText:{color:'#FF9AA8',fontSize:7,fontWeight:'900'},loadingText:{color:colors.textMuted,fontSize:10,paddingVertical:8},collectionActions:{flexDirection:'row',justifyContent:'flex-end',gap:6,marginTop:2},serviceMini:{minHeight:44,paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},serviceMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},shareMini:{minHeight:44,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:'#38D990',backgroundColor:'#123D2C',alignItems:'center',justifyContent:'center'},shareMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},sellMini:{minHeight:44,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:'#FFD166',backgroundColor:'#3D2F10',alignItems:'center',justifyContent:'center'},sellMiniText:{color:'#FFD166',fontSize:8,fontWeight:'900'},sellTrackButton:{flex:1,minHeight:44,paddingHorizontal:4,borderRadius:14,borderWidth:1,borderColor:'#FFD166',backgroundColor:'#3D2F10',alignItems:'center',justifyContent:'center'},sellTrackButtonOffered:{borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated},sellTrackText:{color:'#FFD166',fontSize:7,fontWeight:'900'},sellTrackTextOffered:{color:colors.primaryLight},
  emptyCard:{margin:12,padding:18,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center'},emptyTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800'},emptyText:{color:colors.textSecondary,fontSize:11,textAlign:'center',marginTop:6,lineHeight:16},emptyButton:{marginTop:10,backgroundColor:colors.primary,borderRadius:radius.pill,minHeight:44,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},emptyButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.76)',justifyContent:'center'},modalScroll:{flexGrow:1,justifyContent:'center',padding:18},editCard:{backgroundColor:colors.backgroundCard,borderRadius:18,borderWidth:1,borderColor:colors.border,padding:16,gap:9},editTitle:{color:colors.textPrimary,fontSize:19,fontWeight:'900'},editHint:{color:colors.textMuted,fontSize:10,lineHeight:15},input:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:12,color:colors.textPrimary,fontSize:13},multiline:{minHeight:76,paddingTop:10,textAlignVertical:'top'},visibilityButton:{minHeight:44,borderRadius:12,borderWidth:1,justifyContent:'center',alignItems:'center'},visibilityButtonPublic:{backgroundColor:'#123D2C',borderColor:'#38D990'},visibilityButtonPrivate:{backgroundColor:'#4A171B',borderColor:'#F0525D'},visibilityText:{color:'#FFFFFF',fontSize:11,fontWeight:'900'},saveButton:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},saveText:{color:'#FFF',fontSize:11,fontWeight:'900'},cancelButton:{minHeight:44,alignItems:'center',justifyContent:'center'},cancelText:{color:colors.textMuted,fontSize:10,fontWeight:'700'},salePriceHeader:{marginTop:12,marginBottom:8,padding:11,borderRadius:14,backgroundColor:'rgba(124,92,252,.10)',borderWidth:1,borderColor:'rgba(167,139,250,.45)'},salePriceLabel:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:.8},salePriceExplain:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,fontWeight:'700',marginTop:4},salePriceSummary:{color:colors.success,fontSize:12,lineHeight:17,fontWeight:'900',textAlign:'center',marginTop:9},priceChipsRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},priceChip:{minHeight:44,paddingHorizontal:14,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},priceChipOn:{backgroundColor:'#3D2F10',borderColor:'#FFD166'},priceChipText:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},priceChipTextOn:{color:'#FFD166'},
});
