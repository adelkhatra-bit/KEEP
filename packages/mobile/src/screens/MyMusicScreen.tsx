import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PersonalThemeBackdrop from '../components/PersonalThemeBackdrop';
// KEEP_PUBLIC_RUNTIME_PROBE_PLAYLISTS: forces Pages to rebuild this exact screen source.
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Image, Linking, Modal, TextInput, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useTranslation } from 'react-i18next';
import { analyzeLibrary, canonicalArtistIdentity, canonicalTrackIdentity, CanonicalTrack, groupTracksByArtist, LibraryAnalysis, ProviderPlaylist } from '@keep/music';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { useUserStore } from '../store/useUserStore';
import { musicEngine } from '../services/musicEngine';
import { sharePlaylist } from '../services/sharingService';
import { prepareKeylessMusicExport } from '../services/keylessMusicBridge';
import { loadPlaylistPreferences, preferenceFor, savePlaylistPreference, KeepPlaylistPreference } from '../services/keepLibraryService';
import { getSmartSortAccess, QuotaAccess } from '../services/growthAccessService';
import { addTracksToOffer, choosePurchaseVisibility, clearPlaylistSalePrice, getPlaylistSaleAccess, loadDeliveredPlaylistSaleTracks, loadMyOfferedTrackIds, loadMyPlaylistPurchaseLibrary, loadMyPlaylistSaleOffers, loadPendingVisibilityChoice, PendingVisibilityChoice, PlaylistOfferedTrack, PlaylistPurchaseLibraryEntry, PlaylistSaleAccess, PlaylistSaleOffer, PlaylistSalePaymentMode, removeTrackFromOffer, SALE_PRESET_FREE, SALE_PRESET_PRICES_CENTS, setPlaylistSaleOfferForSelection, setPlaylistSalePrice, updateOfferPaymentMode, updateOfferPrice } from '../services/playlistSaleService';
import { isFeatureEnabled, isPlaylistMarketplaceVisible } from '../services/featureFlagService';
import { getMyPayoutMethods, normalizePayoutLinkInput, payoutProviderLabel, setMyPayoutLink } from '../services/payoutLinkService';
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
import TrackActionRow from '../components/TrackActionRow';
import ContextHelpSheet from '../components/ContextHelpSheet';
import PayPalQrPayoutControl from '../components/PayPalQrPayoutControl';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

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
type LibraryTab = 'MUSIQUES' | 'VIBES' | 'ARTISTES' | 'SERVICES';
const LIBRARY_TABS: Array<{ key: LibraryTab; label: string }> = [
  { key: 'VIBES', label: 'Styles' }, { key: 'MUSIQUES', label: 'Musiques' },
  { key: 'ARTISTES', label: 'Artistes' },
];
const ARTIST_ID_PREFIX = 'keep-artist:';
const STYLE_ID_PREFIX = 'keep-style:';

const SALE_CURRENCIES = [
  { code: 'EUR', label: '€ EUR' },
  { code: 'USD', label: '$ USD' },
  { code: 'GBP', label: '£ GBP' },
  { code: 'CHF', label: 'CHF' },
  { code: 'CAD', label: '$ CAD' },
  { code: 'AUD', label: '$ AUD' },
  { code: 'AED', label: 'AED' },
] as const;

function defaultSaleCurrency(countryCode?: string | null): string {
  const country = String(countryCode || '').trim().toUpperCase();
  if (['FR','DE','ES','IT','PT','BE','NL','LU','IE','AT','FI','GR','CY','MT','EE','LV','LT','SI','SK','HR'].includes(country)) return 'EUR';
  if (country === 'GB') return 'GBP';
  if (country === 'CH') return 'CHF';
  if (country === 'CA') return 'CAD';
  if (country === 'AU') return 'AUD';
  if (country === 'AE') return 'AED';
  if (country === 'US') return 'USD';
  return 'EUR';
}

function saleCurrencyLabel(code: string): string {
  return SALE_CURRENCIES.find((item) => item.code === code)?.label ?? code;
}

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
  SELLER_PAYOUT_NOT_CONFIGURED: "Ajoute soit ton lien PayPal.Me, soit ton QR PayPal avant de publier une collection en euros.",
  SELLER_PAYOUT_LINK_INSECURE: "Ton lien PayPal doit commencer par https://, ou utilise uniquement ton QR PayPal.",
  SELLER_PAYOUT_QR_INSECURE: "Ton QR PayPal enregistré n’est plus valide. Remplace-le puis réessaie.",
  PLAYLIST_SALE_ACTIVE_LIMIT: "Tu as atteint le nombre maximum de collections actives. Retire une ancienne collection avant d'en publier une nouvelle.",
};

const resolveSaleSaveError = (raw: string, followers?: number | null, threshold?: number | null): string => {
  const msg = String(raw || '');
  const limitMatch = msg.match(/PLAYLIST_SALE_ACTIVE_LIMIT(?::\s*(\d+))?/);
  if (limitMatch) {
    const limit = Number(limitMatch[1] ?? 50);
    return `Tu as atteint la limite de ${limit} collections actives. Retire une ancienne collection avant d'en publier une nouvelle.`;
  }
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
  const [workspaceTab, setWorkspaceTab] = useState<'LIBRARY'>('LIBRARY');
  const [mobileSection, setMobileSection] = useState<'HOME' | 'TRACKS' | 'EDIT' | 'ORGANIZE'>('HOME');
  const [visibilityIntroOpen, setVisibilityIntroOpen] = useState(false);
  const [socialSectionExpanded, setSocialSectionExpanded] = useState(true);
  const [originFilter, setOriginFilter] = useState<'ALL' | 'PRIVATE' | 'LISTEN' | 'SESSION' | 'USERS' | 'IDENTIFIED' | 'PULSE'>('ALL');
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
  // Les achats restent visibles ici même si la marketplace est masquée plus tard :
  // une collection déjà payée appartient toujours à l'utilisateur.
  const [purchaseLibrary, setPurchaseLibrary] = useState<PlaylistPurchaseLibraryEntry[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState<PlaylistPurchaseLibraryEntry | null>(null);
  const [purchaseTracks, setPurchaseTracks] = useState<CanonicalTrack[]>([]);
  const [purchaseTracksLoading, setPurchaseTracksLoading] = useState(false);
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
  const [playlistHelpOpen, setPlaylistHelpOpen] = useState(false);
  const [payoutLink, setPayoutLink] = useState('');
  const [payoutLinkDraft, setPayoutLinkDraft] = useState('');
  const [payoutQrUrl, setPayoutQrUrl] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);
  useEffect(() => {
    let live = true;
    if (!userId || isLocalGuest || isDemoMode) { setPayoutLink(''); setPayoutLinkDraft(''); setPayoutQrUrl(''); return undefined; }
    const loadPayout = () => getMyPayoutMethods().then((value) => { if (live) { setPayoutLink(value.link); setPayoutLinkDraft(value.link); setPayoutQrUrl(value.qrUrl); } }).catch(() => { if (live) { setPayoutLink(''); setPayoutLinkDraft(''); setPayoutQrUrl(''); } });
    void loadPayout();
    const unsubscribe = navigation?.addListener?.('focus', loadPayout);
    return () => { live = false; unsubscribe?.(); };
  }, [userId, isLocalGuest, isDemoMode, navigation]);

  const savePayoutDirect = async () => {
    const clean = normalizePayoutLinkInput(payoutLinkDraft);
    if (!/^https:\/\//i.test(clean)) {
      Alert.alert('Lien de paiement', 'Entre ton pseudo PayPal.Me (ex. tonpseudo) ou un lien https:// sécurisé.');
      return;
    }
    setPayoutSaving(true);
    try {
      const saved = await setMyPayoutLink(clean);
      const finalLink = saved || clean;
      setPayoutLink(finalLink);
      setPayoutLinkDraft(finalLink);
      Alert.alert('Paiement prêt', payoutProviderLabel(finalLink) + ' est enregistré. Tu peux maintenant publier en euros.');
    } catch (e: any) {
      Alert.alert('Lien de paiement', e?.message || 'Impossible d’enregistrer ce lien pour le moment.');
    } finally {
      setPayoutSaving(false);
    }
  };

  const openPayPalMe = async () => {
    try {
      await Linking.openURL('https://www.paypal.com/paypalme/');
    } catch {
      Alert.alert('PayPal.Me', 'Impossible d’ouvrir PayPal pour le moment. Tu peux coller directement ton lien https://paypal.me/... ci-dessous.');
    }
  };

  const testPayoutDirect = () => {
    const clean = normalizePayoutLinkInput(payoutLinkDraft);
    if (!/^https:\/\//i.test(clean)) {
      Alert.alert('Tester le paiement', 'Entre ton pseudo PayPal.Me ou un lien https:// valide.');
      return;
    }
    // Pas de canOpenURL/await avant : l'ouverture doit partir directement du
    // tap pour ne pas être bloquée par Chrome/Safari.
    void Linking.openURL(clean).catch(() => {
      Alert.alert('Tester le paiement', 'Ce lien ne s’ouvre pas. Vérifie-le avant de publier en euros.');
    });
  };
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
  // montants sont pré-écrits" -- la publication concerne une collection
  // nommée de plusieurs morceaux. Le popup ne crée jamais un produit morceau
  // par morceau ; le mode € ou FREE utilise des choix fixes.
  const [sellTarget, setSellTarget] = useState<
    | { kind: 'playlist'; playlist: ProviderPlaylist }
    | { kind: 'selection'; key: string; name: string; trackIds: string[]; coverUrl?: string | null }
    | null
  >(null);
  const [sellPaymentMode, setSellPaymentMode] = useState<PlaylistSalePaymentMode | null>(null);
  const [sellPriceCents, setSellPriceCents] = useState<number | null>(null);
  const [sellFreePrice, setSellFreePrice] = useState<number | null>(null);
  const [sellCurrencyCode, setSellCurrencyCode] = useState<string>(() => defaultSaleCurrency((user as any)?.countryCode));
  const [saleCartReviewOpen, setSaleCartReviewOpen] = useState(false);
  const [sellBusy, setSellBusy] = useState(false);
  const [saleSelectionMode, setSaleSelectionMode] = useState(false);
  const [selectedSaleTrackIds, setSelectedSaleTrackIds] = useState<Set<string>>(new Set());
  const [saleEditOfferTarget, setSaleEditOfferTarget] = useState<{ offerId: string; playlistName: string } | null>(null);
  const [saleReturnToPicks, setSaleReturnToPicks] = useState(false);
  const [saleCartHydrated, setSaleCartHydrated] = useState(false);
  const saleCartStorageKey = useMemo(() => userId ? `keep:pepites-cart:${userId}` : '', [userId]);
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

  // Point d'entrée unique : Pépites ouvre Playlists comme sélecteur,
  // mais le panier reste persistant et le retour vers Pépites est mémorisé.
  useEffect(() => {
    if (!route?.params?.createSaleCollection) return;
    let live = true;
    const returnToPicks = Boolean(route?.params?.returnToPicks);
    setWorkspaceTab('LIBRARY');
    setMobileSection('TRACKS');
    setActiveTab('MUSIQUES');
    setOriginFilter('LISTEN');
    setManageMusicMode(true);
    setSaleEditOfferTarget(null);
    setSaleReturnToPicks(returnToPicks);
    setSaleSelectionMode(true);
    setSaleCartHydrated(false);
    const hydrate = async () => {
      let ids: string[] = [];
      if (saleCartStorageKey) {
        try {
          const raw = await AsyncStorage.getItem(saleCartStorageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
        } catch {}
      }
      if (!live) return;
      setSelectedSaleTrackIds(new Set(ids));
      setSaleCartHydrated(true);
    };
    void hydrate();
    navigation?.setParams?.({ createSaleCollection: undefined, returnToPicks: undefined, source: undefined });
    return () => { live = false; };
  }, [navigation, route?.params?.createSaleCollection, route?.params?.returnToPicks, saleCartStorageKey]);

  useEffect(() => {
    if (!saleSelectionMode || saleEditOfferTarget || !saleCartHydrated || !saleCartStorageKey) return;
    void AsyncStorage.setItem(saleCartStorageKey, JSON.stringify(Array.from(selectedSaleTrackIds))).catch(() => {});
  }, [saleSelectionMode, saleEditOfferTarget, saleCartHydrated, saleCartStorageKey, selectedSaleTrackIds]);

  useEffect(() => {
    const offerId = String(route?.params?.manageSaleOfferId || '').trim();
    if (!offerId) return;
    const playlistName = String(route?.params?.manageSaleOfferName || 'Collection publiée').trim() || 'Collection publiée';
    setWorkspaceTab('LIBRARY');
    setMobileSection('TRACKS');
    setActiveTab('MUSIQUES');
    setOriginFilter('LISTEN');
    const includedIds = Object.entries(myOfferedTrackIds)
      .filter(([, row]) => row.offerId === offerId)
      .map(([trackId]) => trackId);
    setSelectedSaleTrackIds(new Set(includedIds));
    setSaleEditOfferTarget({ offerId, playlistName });
    setSaleSelectionMode(true);
    navigation?.setParams?.({ manageSaleOfferId: undefined, manageSaleOfferName: undefined });
  }, [navigation, route?.params?.manageSaleOfferId, route?.params?.manageSaleOfferName, myOfferedTrackIds]);

  // Le route param peut arriver avant la carte Supabase des morceaux de l'offre.
  // Dans ce cas l'ancien effet cochait zéro morceau puis effaçait le paramètre.
  // Dès que la carte réelle arrive, on ajoute les morceaux déjà inclus sans
  // écraser les nouveaux choix faits par l'utilisateur.
  useEffect(() => {
    const offerId = saleEditOfferTarget?.offerId;
    if (!saleSelectionMode || !offerId) return;
    const includedIds = Object.entries(myOfferedTrackIds)
      .filter(([, row]) => row.offerId === offerId)
      .map(([trackId]) => trackId);
    if (!includedIds.length) return;
    setSelectedSaleTrackIds((current) => {
      const next = new Set(current);
      includedIds.forEach((trackId) => next.add(trackId));
      return next;
    });
  }, [saleEditOfferTarget?.offerId, saleSelectionMode, myOfferedTrackIds]);

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
      originSource: entry.originSource,
      importedFrom: entry.importedFrom,
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
  const lokiPulseEntries = useMemo(
    () => ownDiscoveryEntries.filter((entry: any) => String(entry.originSource || '').toLowerCase() === 'loki_pulse'),
    [ownDiscoveryEntries],
  );
  const sessionEntries = useMemo(
    () => ownDiscoveryEntries.filter((entry: any) => String(entry.originSource || '').toLowerCase() === 'session_history'),
    [ownDiscoveryEntries],
  );
  const identifiedEntries = useMemo(
    () => ownDiscoveryEntries.filter((entry: any) => {
      const source = String(entry.originSource || '').toLowerCase();
      return source !== 'loki_pulse' && source !== 'provider_favorite_import' && source !== 'session_history';
    }),
    [ownDiscoveryEntries],
  );
  const ownDiscoveryTracks = useMemo(() => ownDiscoveryEntries.map((entry) => entry.track), [ownDiscoveryEntries]);
  const socialRepriseTracks = useMemo(() => socialRepriseEntries.map((entry) => entry.track), [socialRepriseEntries]);
  const privateEntries = useMemo(
    () => localKeptEntries.filter((entry) =>
      entry.visibility === 'PRIVATE' || Boolean(myOfferedTrackIds[entry.track.id])
    ),
    [localKeptEntries, myOfferedTrackIds],
  );
  const privateTracks = useMemo(() => privateEntries.map((entry) => entry.track), [privateEntries]);
  const localKeptTracks = useMemo(() => localKeptEntries.map((entry) => entry.track), [localKeptEntries]);
  const privateOrProtectedEntries = useMemo(
    () => localKeptEntries.filter((entry) => entry.visibility === 'PRIVATE' || Boolean(myOfferedTrackIds[entry.track.id])),
    [localKeptEntries, myOfferedTrackIds],
  );
  const privateOrProtectedTracks = useMemo(() => privateOrProtectedEntries.map((entry) => entry.track), [privateOrProtectedEntries]);
  const saleCartTracks = useMemo(
    () => localKeptTracks.filter((track) => selectedSaleTrackIds.has(track.id)),
    [localKeptTracks, selectedSaleTrackIds],
  );
  const saleCartConflictCount = useMemo(
    () => saleCartTracks.filter((track) => Boolean(myOfferedTrackIds[track.id])).length,
    [saleCartTracks, myOfferedTrackIds],
  );
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

  const refreshPurchaseLibrary = async () => {
    if (!userId || isLocalGuest || isDemoMode) {
      setPurchaseLibrary([]);
      return;
    }
    const rows = await loadMyPlaylistPurchaseLibrary(6).catch(() => []);
    setPurchaseLibrary(rows);
  };

  const openPurchasedCollection = async (entry: PlaylistPurchaseLibraryEntry) => {
    setPurchaseOpen(entry);
    setPurchaseTracks([]);
    setPurchaseTracksLoading(true);
    try {
      setPurchaseTracks(await loadDeliveredPlaylistSaleTracks(entry.deliveredPlaylistId));
    } catch {
      setPurchaseTracks([]);
      Alert.alert('Mes collections', 'Impossible de charger cette collection pour le moment.');
    } finally {
      setPurchaseTracksLoading(false);
    }
  };

  useEffect(() => {
    const requestedId = String(route?.params?.openPurchasePlaylistId || '').trim();
    if (!requestedId || !purchaseLibrary.length) return;
    const entry = purchaseLibrary.find((row) => row.deliveredPlaylistId === requestedId || row.paymentId === requestedId);
    if (!entry) return;
    setWorkspaceTab('LIBRARY');
    setMobileSection('HOME');
    void openPurchasedCollection(entry);
    navigation?.setParams?.({ openPurchasePlaylistId: undefined, source: undefined });
  }, [navigation, route?.params?.openPurchasePlaylistId, purchaseLibrary]);

  const refreshLibrary = async () => {
    await syncUnsyncedKeeps().catch(() => {});
    if (!isLocalGuest && !isDemoMode) {
      // La session Supabase est la source d'identité réelle. Après un OTA ou
      // une reconnexion, le store profil peut arriver quelques millisecondes
      // plus tard : ne jamais vider Mes musiques uniquement parce que userId
      // n'est pas encore hydraté localement.
      const persisted = await loadOwnPersistedKeeps().catch(() => null);
      if (persisted) setServerKeeps(persisted);
    } else {
      setServerKeeps([]);
    }
    await refresh().catch(() => {});
    await refreshSmartState().catch(() => {});
    await refreshSaleState().catch(() => {});
    await refreshPurchaseLibrary().catch(() => {});
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
    setPurchaseLibrary([]);
    setPurchaseOpen(null);
    setPurchaseTracks([]);
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

  const applyWholeLibraryVisibility = async (visibility: 'PUBLIC' | 'PRIVATE') => {
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

  const setWholeLibraryVisibility = async (visibility: 'PUBLIC' | 'PRIVATE') => {
    const needsChange = visibility === 'PUBLIC' ? privateKeepCount : publicKeepCount;
    if (!needsChange || bulkVisibilityBusy) return;
    if (visibility === 'PUBLIC') {
      const saleTracks = Object.values(myOfferedTrackIds);
      const offerIds = Array.from(new Set(saleTracks.map((row) => row.offerId).filter(Boolean)));
      if (saleTracks.length > 0) {
        Alert.alert(
          'Collections protégées',
          `${saleTracks.length} morceau${saleTracks.length > 1 ? 'x sont' : ' est'} dans ${offerIds.length} collection${offerIds.length > 1 ? 's' : ''} à débloquer. Ils resteront masqués tant que la collection est active. Pour les rendre publics, retire-les d’abord de la collection.`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Gérer mes collections', onPress: () => { setActiveTab('MUSIQUES'); setSaleSelectionMode(false); setSaleEditOfferTarget(null); setManageMusicMode(true); } },
            { text: 'Publier le reste', onPress: () => { void applyWholeLibraryVisibility('PUBLIC'); } },
          ],
        );
        return;
      }
    }
    await applyWholeLibraryVisibility(visibility);
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
        : `${analysis.totalTracks} morceaux analysés · ${stylePlaylists.length} Style${stylePlaylists.length > 1 ? 's' : ''} musical${stylePlaylists.length > 1 ? 'aux' : ''} détecté${stylePlaylists.length > 1 ? 's' : ''}.`
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

  const closeSellModal = () => {
    setSellTarget(null);
    setSellPaymentMode(null);
    setSellPriceCents(null);
    setSellFreePrice(null);
    setSellCurrencyCode(defaultSaleCurrency((user as any)?.countryCode));
  };

  const setSaleTrackVisibility = async (trackId: string, visibility: 'PUBLIC' | 'PRIVATE') => {
    const track = localKeptTracks.find((item) => item.id === trackId);
    if (!track) throw new Error('TRACK_NOT_FOUND');
    if (!isLocalGuest && !isDemoMode) await persistOwnTrackVisibility(track, visibility);
    useSessionHistoryStore.setState((state) => ({
      sessions: state.sessions.map((session) => ({
        ...session,
        tracks: session.tracks.map((item) => item.status === 'kept' && trackIdentity(item.track) === trackIdentity(track) ? { ...item, visibility } : item),
      })),
    }));
  };

  const applySaleTrackToggle = async (trackId: string) => {
    const offered = myOfferedTrackIds[trackId];
    const includedInEditedOffer = Boolean(saleEditOfferTarget && offered?.offerId === saleEditOfferTarget.offerId);
    if (trackVisibilityBusy === trackId) return;

    // Édition d'une collection publiée : les changements sont immédiats.
    if (saleEditOfferTarget) {
      setTrackVisibilityBusy(trackId);
      try {
        if (includedInEditedOffer) {
          const result = await removeTrackFromOffer(saleEditOfferTarget.offerId, trackId);
          setSelectedSaleTrackIds((current) => { const next = new Set(current); next.delete(trackId); return next; });
          if (result.offerClosed) {
            Alert.alert('Collection', 'Le dernier morceau a été retiré : la collection est maintenant fermée.');
            setSaleSelectionMode(false);
            setSaleEditOfferTarget(null);
          }
        } else {
          await addTracksToOffer(saleEditOfferTarget.offerId, [trackId]);
          setSelectedSaleTrackIds((current) => new Set(current).add(trackId));
        }
        await refreshSaleState();
      } catch (e: any) {
        Alert.alert('Collection', e?.message ?? 'Impossible de modifier les morceaux de cette collection.');
      } finally {
        setTrackVisibilityBusy(null);
      }
      return;
    }

    // Nouvelle collection : vrai panier local. Aucune visibilité n'est modifiée
    // et aucune vente n'existe tant que l'utilisateur n'a pas validé.
    setSelectedSaleTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId); else next.add(trackId);
      return next;
    });
  };

  const toggleSaleTrack = async (trackId: string) => {
    const offered = myOfferedTrackIds[trackId];
    const includedInEditedOffer = Boolean(saleEditOfferTarget && offered?.offerId === saleEditOfferTarget.offerId);
    const selected = selectedSaleTrackIds.has(trackId);
    const alreadySoldElsewhere = Boolean(offered && !includedInEditedOffer);

    // Retirer du panier reste toujours immédiat.
    if (selected && !saleEditOfferTarget) {
      await applySaleTrackToggle(trackId);
      return;
    }

    if (alreadySoldElsewhere) {
      const title = localKeptTracks.find((item) => item.id === trackId)?.title || 'Ce morceau';
      Alert.alert(
        'Déjà dans une collection active',
        `« ${title} » est déjà publié dans « ${offered?.playlistName || 'une collection'} ». Souhaites-tu quand même l’ajouter à ce panier ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Ajouter quand même', onPress: () => { void applySaleTrackToggle(trackId); } },
        ],
      );
      return;
    }

    await applySaleTrackToggle(trackId);
  };

  const leaveSaleCart = async () => {
    setSaleSelectionMode(false);
    setSaleEditOfferTarget(null);
    if (saleReturnToPicks) {
      navigation.navigate('PlaylistSale', { source: 'PEPITES_CART', resumeCart: true });
    }
  };

  const cancelSaleSelection = async () => {
    if (saleEditOfferTarget) {
      setSaleSelectionMode(false);
      setSelectedSaleTrackIds(new Set());
      setSaleEditOfferTarget(null);
      return;
    }
    setSaleSelectionMode(false);
    setSelectedSaleTrackIds(new Set());
    setSaleEditOfferTarget(null);
    setSaleReturnToPicks(false);
    setSaleCartHydrated(true);
    if (saleCartStorageKey) await AsyncStorage.removeItem(saleCartStorageKey).catch(() => undefined);
  };

  const createSaleSelection = () => {
    if (saleCartTracks.length < 2) {
      Alert.alert('Panier Pépites', 'Choisis au moins 2 morceaux. Une Pépite représente une vraie sélection, jamais un morceau isolé.');
      return;
    }
    setSaleCartReviewOpen(true);
  };

  const confirmSaleCart = () => {
    if (saleCartTracks.length < 2) {
      setSaleCartReviewOpen(false);
      return;
    }
    setSaleCartReviewOpen(false);
    openSellModal({
      kind: 'selection',
      key: `selection:${Date.now()}`,
      name: `Ma Pépite · ${saleCartTracks.length} titres`,
      trackIds: saleCartTracks.map((track) => track.id),
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
              await persistOwnTrackVisibility(track, 'PUBLIC');
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
          text: 'Gérer la collection',
          onPress: () => navigation.navigate('PlaylistSale', {
            manageSaleOfferId: offered.offerId,
            manageSaleOfferName: offered.playlistName,
          }),
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
    setPayoutLinkDraft(payoutLink);
    const existingKey = target?.kind === 'playlist' ? target.playlist.id : target?.key;
    const existing = existingKey ? myOffers[existingKey] : undefined;
    setSellPaymentMode(existing ? (existing.paymentMode === 'FREE' ? 'FREE' : Platform.OS === 'web' ? 'MONEY' : null) : null);
    setSellPriceCents(existing?.priceCents || null);
    setSellFreePrice(existing?.freePrice ?? null);
    setSellCurrencyCode(existing?.currencyCode || defaultSaleCurrency((user as any)?.countryCode));
  };

  const saveSellPrice = async () => {
    if (!sellTarget) return;
    if (!sellPaymentMode) {
      Alert.alert('Mode de déblocage requis', Platform.OS === 'web'
        ? 'Choisis comment cette collection sera débloquée : ⚡ FREE ou paiement direct.'
        : 'Choisis le déblocage ⚡ FREE. Le paiement externe en euros est désactivé dans l’app iOS/Android.');
      return;
    }
    if (sellPaymentMode === 'MONEY' && Platform.OS !== 'web') {
      Alert.alert('Paiement € indisponible dans l’app', 'Pour protéger la soumission App Store / Google Play, un contenu numérique ne peut pas être publié ici avec un paiement externe.');
      return;
    }
    const amount = sellPaymentMode === 'FREE' ? sellFreePrice : sellPriceCents;
    if (!amount) {
      Alert.alert('Montant requis', sellPaymentMode === 'FREE' ? 'Choisis le nombre de FREE demandé.' : 'Choisis un montant dans la devise sélectionnée.');
      return;
    }
    if (sellPaymentMode === 'MONEY' && !payoutLink.trim() && !payoutQrUrl.trim()) {
      Alert.alert(
        'Mode de paiement requis',
        'Pour publier avec un paiement direct, configure un lien PayPal.Me ou ajoute ton QR PayPal.',
        [
          { text: 'OK', style: 'cancel' },
        ],
      );
      return;
    }
    const stableKey = sellTarget.kind === 'playlist' ? sellTarget.playlist.id : sellTarget.key;
    setSellBusy(true);
    try {
      const allowExisting = sellTarget.kind === 'selection'
        && sellTarget.trackIds.some((trackId) => Boolean(myOfferedTrackIds[trackId]));
      const offer = sellTarget.kind === 'selection'
        ? await setPlaylistSaleOfferForSelection(sellTarget.trackIds, sellTarget.name, sellPaymentMode, amount, sellCurrencyCode, allowExisting)
        : sellPaymentMode === 'MONEY'
          ? await setPlaylistSalePrice(sellTarget.playlist.id, sellTarget.playlist.name, sellPriceCents ?? 0, sellCurrencyCode)
          : (() => { throw new Error('FREE_REQUIRES_MULTI_TRACK_SELECTION'); })();
      setMyOffers((prev) => ({ ...prev, [stableKey]: offer }));
      await refreshSaleState();
      const publishedFromPepitesCart = sellTarget.kind === 'selection' && sellTarget.key.startsWith('selection:') && saleReturnToPicks;
      if (sellTarget.kind === 'selection' && sellTarget.key.startsWith('selection:')) {
        setSaleSelectionMode(false);
        setSelectedSaleTrackIds(new Set());
        setSaleEditOfferTarget(null);
        setSaleCartHydrated(true);
        if (saleCartStorageKey) await AsyncStorage.removeItem(saleCartStorageKey).catch(() => undefined);
      }
      closeSellModal();
      if (publishedFromPepitesCart) {
        setSaleReturnToPicks(false);
        navigation.navigate('PlaylistSale', { source: 'PEPITES_CART', createdOfferId: offer.offerId || offer.playlistId });
      }
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

  const toggleTrackVisibility = async (track: CanonicalTrack, saleVisibilityConfirmed = false) => {
    const entry = localEntryForTrack(track);
    if (!entry) return Alert.alert('Visibilité', 'Cette musique vient d’une Vibe ou d’un service connecté. Modifie la visibilité de sa collection.');
    const key = trackIdentity(track);
    if (trackVisibilityBusy === key || trackDeleteBusy === key) return;
    const next = entry.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    const offered = myOfferedTrackIds[track.id];
    if (next === 'PUBLIC' && offered) {
      Alert.alert(
        'Cette musique est dans une collection active',
        `« ${track.title} » fait partie de « ${offered.playlistName} ». Tant que la collection est active, Loki la masque aux visiteurs. Si tu la rends publique, elle doit d’abord être retirée de cette collection.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Gérer la collection', onPress: () => navigation.navigate('PlaylistSale', { manageSaleOfferId: offered.offerId, manageSaleOfferName: offered.playlistName }) },
          { text: 'Retirer de la collection + Public', style: 'destructive', onPress: () => {
            setTrackVisibilityBusy(key);
            void (async () => {
              try {
                await removeTrackFromOffer(offered.offerId, track.id);
                await setSaleTrackVisibility(track.id, 'PUBLIC');
                setMyOfferedTrackIds((prev) => { const nextOffers = { ...prev }; delete nextOffers[track.id]; return nextOffers; });
                await refreshSaleState();
                await refreshLibrary();
                Alert.alert('Musique publique', 'Le morceau a été retiré de la collection active et est maintenant public sur ton profil.');
              } catch (e: any) {
                Alert.alert('Visibilité', e?.message ?? 'Impossible de retirer ce morceau de la collection active pour le moment.');
              } finally {
                setTrackVisibilityBusy(null);
              }
            })();
          } },
        ],
      );
      return;
    }
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
    const includedInEditedOffer = Boolean(saleEditOfferTarget && offered?.offerId === saleEditOfferTarget.offerId);
    const offeredElsewhere = Boolean(offered && (!saleEditOfferTarget || !includedInEditedOffer));
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
          style={[styles.selectionCheck, selectedSaleTrackIds.has(track.id) && styles.selectionCheckOn, offeredElsewhere && !selectedSaleTrackIds.has(track.id) && styles.selectionCheckAlreadySold, notOwnDiscovery && styles.selectionCheckLocked]}
          onPress={() => notOwnDiscovery
            ? Alert.alert('Non éligible', `« ${track.title} » ne peut pas rejoindre cette collection : elle vient d’un autre utilisateur. Seul son découvreur d’origine peut l’intégrer à une collection exclusive.`)
            : void toggleSaleTrack(track.id)}
          disabled={trackVisibilityBusy === track.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectedSaleTrackIds.has(track.id), disabled: Boolean(notOwnDiscovery) }}
          accessibilityLabel={notOwnDiscovery
            ? `${track.title} non éligible à une collection exclusive, découverte par un autre utilisateur`
            : selectedSaleTrackIds.has(track.id)
              ? `Retirer ${track.title} du panier`
              : offeredElsewhere
                ? `${track.title} est déjà dans une collection active, ajouter quand même au panier`
                : `Ajouter ${track.title} au panier`}
        ><Text style={styles.selectionCheckText}>{notOwnDiscovery ? '🔒' : selectedSaleTrackIds.has(track.id) ? '✓ RETIRER' : '+ PANIER'}</Text></TouchableOpacity> : null}
        <View style={styles.trackRowGrid}>
          <TrackActionRow
            coverUrl={track.artworkUrl}
            title={track.title}
            artist={track.artist}
            badge={offered ? { label: saleSelectionMode ? '◆ DÉJÀ PUBLIÉE' : `◆ Collection · ${offered.playlistName}`, onPress: () => editExistingTrackOffer(track) } : undefined}
            originBadge={localEntry ? {
              label: localEntry.sourceProfileId
                ? `${localEntry.sourceUsername ? `🔒 PARTAGE SEUL · DE ${localEntry.sourceUsername.replace(/^@+/, '')}` : '🔒 PARTAGE SEUL · AUTRE UTILISATEUR'}`
                : String((localEntry as any).originSource || '').toLowerCase() === 'loki_pulse'
                  ? 'LOKI PULSE'
                  : String((localEntry as any).originSource || '').toLowerCase() === 'session_history'
                    ? 'SESSION D’ÉCOUTE'
                    : String((localEntry as any).originSource || '').toLowerCase() === 'listen'
                      ? 'ÉCOUTE LOKI'
                      : String((localEntry as any).originSource || '').toLowerCase() === 'provider_favorite_import'
                        ? `IMPORT ${String((localEntry as any).importedFrom || 'SERVICE').replace(/_/g, ' ').toUpperCase()}`
                        : 'IDENTIFIÉ PAR LOKI',
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
            {localEntry?.sourceUsername ? <>
              <View style={styles.trackSourceRow}>
                <Text style={styles.trackSourceLabel}>Découvert par</Text>
                <TouchableOpacity onPress={() => openSourceProfile(localEntry.sourceUsername)} accessibilityRole="link" accessibilityLabel={`Ouvrir le profil de ${localEntry.sourceUsername}`}>
                  <Text style={styles.trackSourceLink}>{localEntry.sourceUsername.replace(/^@+/, '')}</Text>
                </TouchableOpacity>
              </View>
              {localEntry.sourceProfileId ? <Text style={styles.trackSourceOwnership}>🔒 Partage autorisé · vente FREE/€ bloquée</Text> : null}
            </> : null}
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
              {/* Vente centralisée dans Collections/Pépites : aucun bouton de
                  création de vente sur une ligne de morceau. */}
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
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.playlistCover as any} /> : <View style={[styles.playlistCover, styles.playlistCoverFallback]}><Text style={styles.playlistCoverText}>{isSmart ? '✦' : '♪'}</Text></View>}
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
        </View> : null}
      </View> : null}
    </View>;
  };

  return (
    <SafeAreaView style={styles.container}><PersonalThemeBackdrop />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>Playlists</Text>
        </View>
        <TouchableOpacity
          style={styles.headerHelpButton}
          onPress={() => setPlaylistHelpOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Tout comprendre sur Playlists"
        >
          <Text style={styles.headerHelpButtonText}>?</Text>
        </TouchableOpacity>
      </View>

      {mobileSection === 'HOME' ? <View style={styles.focusHome}>
        <TouchableOpacity style={styles.focusPrimary} onPress={() => { setWorkspaceTab('LIBRARY'); setMobileSection('TRACKS'); setActiveTab('MUSIQUES'); }}>
          <View style={styles.focusPrimaryIcon}><Text style={styles.focusPrimaryIconText}>♫</Text></View>
          <View style={styles.focusPrimaryCopy}>
            <Text style={styles.focusPrimaryTitle}>Écouter mes morceaux · {localKeptEntries.length}</Text>
            <Text style={styles.focusPrimaryHint}>Toute ta musique au même endroit</Text>
          </View>
          <Text style={styles.focusChoiceArrow}>›</Text>
        </TouchableOpacity>

        {purchaseLibrary.length ? (
          <View style={styles.purchaseHome}>
            <View style={styles.purchaseHomeHead}>
              <Text style={styles.purchaseHomeTitle}>DERNIERS ACHATS</Text>
              <Text style={styles.purchaseHomeCount}>{purchaseLibrary.length}</Text>
            </View>
            {purchaseLibrary.slice(0, 3).map((entry) => (
              <TouchableOpacity key={entry.paymentId} style={styles.purchaseHomeRow} onPress={() => { void openPurchasedCollection(entry); }} accessibilityLabel={`Écouter mon achat ${entry.playlistName}`}>
                <View style={styles.purchaseHomeIcon}><Text style={styles.purchaseHomeIconText}>✓</Text></View>
                <View style={styles.purchaseHomeCopy}>
                  <Text style={styles.purchaseHomeName} numberOfLines={1}>{entry.playlistName}</Text>
                  <Text style={styles.purchaseHomeMeta} numberOfLines={1}>@{entry.sellerUsername} · {entry.trackCount} titre{entry.trackCount > 1 ? 's' : ''}</Text>
                </View>
                <Text style={styles.purchaseHomePlay}>▶</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.purchaseHomeHint}>Tes achats restent aussi classés automatiquement dans tes Styles.</Text>
          </View>
        ) : null}

        <View style={styles.focusActionStack}>
          <TouchableOpacity style={styles.focusActionRow} onPress={() => setVisibilityIntroOpen(true)}>
            <View style={styles.focusActionIcon}><Text style={styles.focusActionIconText}>✎</Text></View>
            <View style={styles.focusActionCopy}><Text style={styles.focusActionTitle}>Choisir ce qui est visible</Text><Text style={styles.focusActionHint}>Comprendre avant de modifier</Text></View>
            <Text style={styles.focusChoiceArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.focusActionRow} onPress={() => { setWorkspaceTab('LIBRARY'); setMobileSection('ORGANIZE'); setActiveTab('VIBES'); }}>
            <View style={styles.focusActionIcon}><Text style={styles.focusActionIconText}>☷</Text></View>
            <View style={styles.focusActionCopy}><Text style={styles.focusActionTitle}>Trier ma musique</Text><Text style={styles.focusActionHint}>Par style ou par artiste</Text></View>
            <Text style={styles.focusChoiceArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.focusServiceLink} onPress={() => { setWorkspaceTab('LIBRARY'); setMobileSection('ORGANIZE'); setActiveTab('SERVICES'); }} accessibilityLabel="Afficher les services musicaux ici">
          <Text style={styles.focusServiceIcon}>＋</Text>
          <View style={styles.focusServiceCopy}>
            <Text style={styles.focusServiceTitle}>Connecter mes applis musique</Text>
            <Text style={styles.focusServiceHint}>Spotify, Apple Music et autres</Text>
          </View>
          <Text style={styles.focusChoiceArrow}>›</Text>
        </TouchableOpacity>

      </View> : <View style={styles.focusBar}>
        <TouchableOpacity style={styles.focusBack} onPress={() => { setMobileSection('HOME'); setWorkspaceTab('LIBRARY'); setManageMusicMode(false); }} accessibilityLabel="Revenir aux choix Mes musiques"><Text style={styles.focusBackText}>‹</Text></TouchableOpacity>
        <View style={styles.focusBarCopy}><Text style={styles.focusBarTitle}>{saleSelectionMode ? (saleEditOfferTarget ? 'Modifier la collection' : 'Créer une collection') : mobileSection === 'EDIT' ? 'Choisir ce qui est visible' : mobileSection === 'ORGANIZE' ? 'Trier ma musique' : 'Mes morceaux'}</Text></View>
      </View>}
      {workspaceTab === 'LIBRARY' && mobileSection === 'ORGANIZE' ? <View style={styles.mobileAccordionBody}>{activeTab === 'SERVICES' ? <View style={styles.inlineServicesCard}><Text style={styles.inlineServicesTitle}>Services musicaux</Text><Text style={styles.inlineServicesText}>Connecte ou synchronise tes services depuis Mes musiques. La gestion détaillée reste intégrée à ce parcours.</Text><TouchableOpacity style={styles.inlineServicesAction} onPress={() => navigation.navigate('MusicConnections')}><Text style={styles.inlineServicesActionText}>GÉRER MES CONNEXIONS</Text></TouchableOpacity></View> : <View style={styles.tabs}>{LIBRARY_TABS.filter((tab) => tab.key !== 'MUSIQUES').map((tab) => (
        <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => setActiveTab(tab.key)}><Text style={[styles.tabText, activeTab === tab.key && styles.tabTextOn]}>{tab.label}</Text>{activeTab === tab.key ? <View style={styles.tabIndicator} /> : null}</TouchableOpacity>
      ))}</View>}</View> : null}

      {workspaceTab === 'LIBRARY' && mobileSection === 'EDIT' && activeTab === 'MUSIQUES' ? (
        <View style={[styles.manageGuide, manageMusicMode && styles.manageGuideActive]}>
          <TouchableOpacity style={styles.manageGuideIcon} onPress={() => setVisibilityIntroOpen(true)} accessibilityLabel="Comprendre la visibilité de mes morceaux"><Text style={styles.manageGuideIconText}>?</Text></TouchableOpacity>
          <View style={styles.manageGuideCopy}>
            <Text style={styles.manageGuideTitle}>{manageMusicMode ? 'COMMANDES VISIBLES' : 'MA VISIBILITÉ'}</Text>
            <Text style={styles.manageGuideText} numberOfLines={1}>{manageMusicMode ? 'Public · Privé · Retirer sous chaque morceau' : 'Rien ne change tant que tu ne choisis pas une action'}</Text>
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
            accessibilityLabel={manageMusicMode ? 'Terminer la gestion de visibilité' : 'Gérer la visibilité de mes morceaux'}
          >
            <Text style={[styles.manageModeButtonText, manageMusicMode && styles.manageModeButtonTextActive]}>
              {manageMusicMode ? 'TERMINER' : 'GÉRER'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {workspaceTab === 'LIBRARY' && mobileSection === 'ORGANIZE' && activeTab === 'VIBES' ? <View style={styles.organizeAction}>
        <View style={styles.organizeActionCopy}>
          <Text style={styles.vibeBarTitle}>{sortGateLabel(sortAccess)}</Text>
          <Text style={styles.vibeBarHint}>{sortAccess?.unlimited ? 'Loki Music classe automatiquement tes morceaux par style.' : sortAccess?.allowed ? 'Analyse tes morceaux et mets les styles à jour.' : 'Cette fonction nécessite Creator Pro ou un essai débloqué.'}</Text>
        </View>
        <TouchableOpacity style={[styles.organizeActionButton, sortAccess && !sortAccess.allowed && !sortAccess.unlimited && styles.vibeBarLocked]} onPress={() => void runOrganizeAnalysis()} disabled={analyzing} accessibilityRole="button" accessibilityLabel="Mettre à jour le classement musical">
          {analyzing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.organizeActionButtonText}>{sortAccess?.allowed || sortAccess?.unlimited ? 'METTRE À JOUR' : 'DÉBLOQUER'}</Text>}
        </TouchableOpacity>
      </View> : null}

      {workspaceTab === 'LIBRARY' && mobileSection === 'EDIT' && localKeptEntries.length ? <View style={styles.libraryStrip}>
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

      {workspaceTab === 'LIBRARY' && mobileSection === 'TRACKS' && activeTab === 'MUSIQUES' && localKeptEntries.length && !saleSelectionMode ? <View style={styles.originSummary}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.originFilters}>
          {([
            ['ALL', 'TOUT'],
            ['PRIVATE', 'PRIVÉ'],
            ['LISTEN', 'DÉCOUVERTE'],
            ['SESSION', 'SESSION'],
            ['USERS', '🔒 REPRISE'],
            ['IDENTIFIED', 'IDENTIFIÉ'],
            ['PULSE', 'LOKI'],
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
        </ScrollView>
      </View> : null}

      {workspaceTab === 'LIBRARY' && mobileSection === 'ORGANIZE' && activeTab === 'VIBES' && analysis ? <TouchableOpacity style={styles.analysisSummary} onPress={() => setAnalysisExpanded((value) => !value)}>
        <Text style={styles.analysisSummaryText} numberOfLines={2}>{analysisMessage}</Text><Text style={styles.analysisChevron}>{analysisExpanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity> : null}
      {workspaceTab === 'LIBRARY' && mobileSection === 'ORGANIZE' && activeTab === 'VIBES' && analysis && analysisExpanded ? <View style={styles.analysisCard}>
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

      {mobileSection === 'HOME' ? null : activeTab === 'MUSIQUES' ? (
        <FlatList
          data={originFilter === 'USERS' ? socialRepriseTracks
            : originFilter === 'PRIVATE' ? privateTracks
            : originFilter === 'PULSE' ? lokiPulseEntries.map((entry) => entry.track)
            : originFilter === 'SESSION' ? sessionEntries.map((entry) => entry.track)
            : originFilter === 'IDENTIFIED' ? identifiedEntries.map((entry) => entry.track)
            : originFilter === 'ALL' ? localKeptTracks
            : saleEditOfferTarget
              ? ownDiscoveryTracks
                  .filter((track) => !myOfferedTrackIds[track.id] || myOfferedTrackIds[track.id].offerId === saleEditOfferTarget.offerId)
                  .sort((a, b) => Number(selectedSaleTrackIds.has(b.id)) - Number(selectedSaleTrackIds.has(a.id)))
              : ownDiscoveryTracks}
          renderItem={({ item }) => renderTrack(item)}
          keyExtractor={(item) => `own:${trackIdentity(item)}`}
          refreshing={isLoading}
          onRefresh={() => { void refreshLibrary(); }}
          ListHeaderComponent={saleSelectionMode ? (
            <View style={styles.saleWizardIntro}>
              <View style={styles.saleWizardTopRow}><Text style={styles.saleWizardStep}>ÉTAPE 1 SUR 4</Text><Text style={styles.saleWizardCount}>{selectedSaleTrackIds.size} sélectionné{selectedSaleTrackIds.size > 1 ? 's' : ''}</Text></View>
              <Text style={styles.saleWizardTitle}>Choisis les musiques</Text>
              <Text style={styles.saleWizardHint}>Ajoute au moins 2 morceaux au panier. Un titre déjà en vente reste sélectionnable : Loki te prévient, puis le déplacera vers la nouvelle Pépite au moment de publier. Tu peux le retirer du panier à tout moment. Rien n’est publié avant validation.</Text>
            </View>
          ) : <>
            {regularPlaylists.length ? (
              <View style={styles.playlistFoldersIntro}>
                <Text style={styles.playlistFoldersTitle}>MES PLAYLISTS</Text>
                <Text style={styles.playlistFoldersHint}>Tes collections complètes restent accessibles ici. Tes Styles automatiques sont dans l’onglet Styles.</Text>
                {regularPlaylists.map((playlist) => <View key={`manual:${playlist.id}`}>{renderPlaylist({ item: playlist })}</View>)}
              </View>
            ) : null}
            {localKeptEntries.length ? <View style={[styles.originSection, originFilter === 'USERS' ? styles.originSectionSocial : styles.originSectionOwn]}>
              <View style={styles.originSectionHeader}>
                <View style={styles.originSectionTitleRow}>
                  <Text style={styles.originSectionIcon}>{originFilter === 'USERS' ? '👥' : '🎧'}</Text>
                  <Text style={[styles.originSectionTitle, originFilter === 'USERS' ? styles.originSectionTitleSocial : styles.originSectionTitleOwn]}>
                    {originFilter === 'USERS'
                      ? "🔒 Reprises d'autres utilisateurs"
                      : originFilter === 'PRIVATE'
                        ? 'Mes morceaux privés · collections protégées'
                      : originFilter === 'PULSE'
                        ? 'Loki Pulse'
                        : originFilter === 'SESSION'
                          ? 'Gardées depuis mes sessions'
                          : originFilter === 'IDENTIFIED'
                            ? 'Identifiées par Loki'
                            : originFilter === 'ALL'
                              ? 'Tous mes morceaux'
                              : 'Mes découvertes'}
                  </Text>
                </View>
                <Text style={[styles.originSectionCount, originFilter === 'USERS' ? styles.originSectionCountSocial : styles.originSectionCountOwn]}>
                  {originFilter === 'USERS'
                    ? socialRepriseEntries.length
                    : originFilter === 'PRIVATE'
                      ? privateEntries.length
                    : originFilter === 'PULSE'
                      ? lokiPulseEntries.length
                      : originFilter === 'SESSION'
                        ? sessionEntries.length
                        : originFilter === 'IDENTIFIED'
                          ? identifiedEntries.length
                          : originFilter === 'ALL'
                            ? localKeptEntries.length
                            : ownDiscoveryEntries.length} titres
                </Text>
              </View>
            </View> : null}
          </>}
          ListFooterComponent={!saleSelectionMode && originFilter === 'ALL' && socialRepriseEntries.length ? <View style={[styles.originSection, styles.originSectionSocial]}>
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
              <Text style={styles.styleCountHint}>{localKeptTracks.length} morceaux analysés · même source Supabase que ton profil. Tous les styles détectés sont listés ci-dessous, sans limite à 3.</Text>
            </View>
          ) : null}
          ListFooterComponent={activeTab === 'VIBES' && automaticStylePlaylists.length ? (
            <View style={styles.autoVibesSection}>
              <Text style={styles.autoVibesTitle}>SUGGESTIONS AUTO · {automaticStylePlaylists.length}</Text>
              <Text style={styles.autoVibesHint}>Ces suggestions ne sont PAS comptées dans tes {stylePlaylists.length} Styles musicaux affichés sur ton profil.</Text>
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
          <View style={styles.selectionToolbarTop}>
            <View style={styles.selectionCartIcon}><Text style={styles.selectionCartIconText}>◆</Text></View>
            <View style={styles.selectionToolbarCopy}>
              <Text style={styles.selectionToolbarEyebrow}>{saleEditOfferTarget ? 'COLLECTION EN COURS' : 'TON PANIER PÉPITES'}</Text>
              <Text style={styles.selectionToolbarTitle} numberOfLines={1}>{saleEditOfferTarget ? `Modifier · ${saleEditOfferTarget.playlistName}` : `${selectedSaleTrackIds.size} morceau${selectedSaleTrackIds.size > 1 ? 'x' : ''} sélectionné${selectedSaleTrackIds.size > 1 ? 's' : ''}`}</Text>
              {!saleEditOfferTarget ? <Text style={styles.selectionToolbarHint}>{selectedSaleTrackIds.size < 2 ? 'Choisis encore des morceaux.' : 'Panier prêt · vérifie avant de choisir le prix.'}</Text> : null}
            </View>
          </View>
          <View style={styles.stickySelectionActions}>
            <TouchableOpacity style={styles.selectionCancelButton} onPress={() => saleEditOfferTarget ? void cancelSaleSelection() : saleReturnToPicks ? void leaveSaleCart() : void cancelSaleSelection()}><Text style={styles.selectionCancelText}>{saleEditOfferTarget ? 'TERMINER' : saleReturnToPicks ? '‹ PÉPITES' : 'ANNULER'}</Text></TouchableOpacity>
            {saleEditOfferTarget ? (
              <TouchableOpacity style={styles.selectionAddButton} onPress={() => navigation.navigate('PlaylistSale', { manageSaleOfferId: saleEditOfferTarget.offerId, manageSaleOfferName: saleEditOfferTarget.playlistName })}>
                <Text style={styles.selectionAddText}>PRIX · PAIEMENT · STATUT</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.selectionCreateButton, selectedSaleTrackIds.size < 2 && styles.selectionCreateDisabled]} disabled={selectedSaleTrackIds.size < 2} onPress={createSaleSelection}>
                <Text style={styles.selectionCreateText}>{selectedSaleTrackIds.size < 2 ? 'PANIER EN COURS' : 'VOIR MON PANIER'}</Text>
                {selectedSaleTrackIds.size >= 2 ? <Text style={styles.selectionCreateSubtext}>Tout est bon ? →</Text> : null}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}

      <Modal visible={visibilityIntroOpen} transparent animationType="fade" onRequestClose={() => setVisibilityIntroOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.editCard, styles.playlistHelpCard]}>
            <View style={styles.playlistHelpHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.editTitle}>Choisir ce qui est visible</Text>
                <Text style={styles.editHint}>Tu gardes le contrôle. Aucun morceau ne change sans ton choix.</Text>
              </View>
              <TouchableOpacity style={styles.playlistHelpClose} onPress={() => setVisibilityIntroOpen(false)} accessibilityLabel="Fermer l’aide visibilité">
                <Text style={styles.playlistHelpCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.playlistHelpSteps}>
              <View style={styles.playlistHelpStep}><Text style={styles.playlistHelpNo}>1</Text><View style={styles.playlistHelpCopy}><Text style={styles.playlistHelpTitle}>PUBLIC</Text><Text style={styles.playlistHelpText}>Visible sur ton profil et écoutable par les autres.</Text></View></View>
              <View style={styles.playlistHelpStep}><Text style={styles.playlistHelpNo}>2</Text><View style={styles.playlistHelpCopy}><Text style={styles.playlistHelpTitle}>PRIVÉ</Text><Text style={styles.playlistHelpText}>Reste dans ta musique, mais disparaît de ton profil public.</Text></View></View>
              <View style={styles.playlistHelpStep}><Text style={styles.playlistHelpNo}>3</Text><View style={styles.playlistHelpCopy}><Text style={styles.playlistHelpTitle}>COLLECTION EN VENTE</Text><Text style={styles.playlistHelpText}>Toujours protégée. Même “TOUT PUBLIC” ne peut pas rendre public un morceau d’une collection active.</Text></View></View>
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={() => {
              setVisibilityIntroOpen(false);
              setWorkspaceTab('LIBRARY');
              setMobileSection('EDIT');
              setActiveTab('MUSIQUES');
              setManageMusicMode(true);
              setOriginFilter('ALL');
              setSocialSectionExpanded(true);
            }}><Text style={styles.saveText}>GÉRER MA VISIBILITÉ</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setVisibilityIntroOpen(false)}><Text style={styles.cancelText}>Plus tard</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ContextHelpSheet
        visible={playlistHelpOpen}
        title="Tout faire dans Playlists"
        intro="Tout ce que tu peux faire avec ta musique, expliqué simplement."
        steps={[
          { title: 'Écouter tes morceaux', text: 'Retrouve les morceaux que tu as gardés, achetés ou reçus et lance leur écoute.' },
          { title: 'Choisir Public ou Privé', text: 'Public apparaît sur ton profil. Privé reste uniquement dans ta bibliothèque.' },
          { title: 'Trier automatiquement', text: 'Loki range les morceaux par styles et artistes pour que tu les retrouves vite.' },
          { title: 'Créer une collection', text: 'Sélectionne plusieurs morceaux, vérifie ton panier, choisis FREE ou monnaie quand la fonction est disponible, puis publie.' },
          { title: 'Gérer tes collections débloquées', text: 'Les collections déjà obtenues restent dans Playlists et ne disparaissent pas si la marketplace est masquée.' },
          { title: 'Connecter tes services', text: 'Utilise tes services musicaux compatibles pour écouter ou exporter tes playlists.' },
        ]}
        onClose={() => setPlaylistHelpOpen(false)}
      />

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
      <Modal visible={saleCartReviewOpen} transparent animationType="fade" onRequestClose={() => setSaleCartReviewOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.saleModalScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.editCard, styles.saleCartReviewCard]}>
              <View style={styles.saleWizardTopRow}>
                <Text style={styles.saleWizardStep}>ÉTAPE 2 SUR 4</Text>
                <Text style={styles.saleWizardCount}>{saleCartTracks.length} TITRE{saleCartTracks.length > 1 ? 'S' : ''}</Text>
              </View>
              <Text style={styles.saleCartReviewTitle}>Ton panier est prêt</Text>
              <Text style={styles.saleCartReviewHint}>Vérifie ta sélection maintenant. Rien n’est publié et aucun prix n’est encore demandé.</Text>

              <View style={styles.saleCartSummaryRow}>
                <View style={styles.saleCartSummaryStat}><Text style={styles.saleCartSummaryValue}>{saleCartTracks.length}</Text><Text style={styles.saleCartSummaryLabel}>MORCEAUX</Text></View>
                <View style={styles.saleCartSummaryDivider} />
                <View style={styles.saleCartSummaryStat}><Text style={[styles.saleCartSummaryValue, saleCartConflictCount > 0 && styles.saleCartSummaryWarn]}>{saleCartConflictCount}</Text><Text style={styles.saleCartSummaryLabel}>DÉJÀ EN VENTE</Text></View>
                <View style={styles.saleCartSummaryDivider} />
                <View style={styles.saleCartSummaryStat}><Text style={styles.saleCartSummaryValue}>{Math.max(0, saleCartTracks.length - saleCartConflictCount)}</Text><Text style={styles.saleCartSummaryLabel}>NOUVEAUX</Text></View>
              </View>

              <View style={styles.saleCartTrackList}>
                {saleCartTracks.slice(0, 8).map((track, index) => (
                  <View key={track.id} style={styles.saleCartTrackRow}>
                    <Text style={styles.saleCartTrackNo}>{String(index + 1).padStart(2, '0')}</Text>
                    {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.saleCartTrackCover as any} /> : <View style={[styles.saleCartTrackCover, styles.saleCartTrackCoverFallback]}><Text style={styles.saleCartTrackCoverText}>♪</Text></View>}
                    <View style={styles.saleCartTrackCopy}>
                      <Text style={styles.saleCartTrackTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.saleCartTrackArtist} numberOfLines={1}>{track.artist}</Text>
                    </View>
                    {myOfferedTrackIds[track.id] ? <Text style={styles.saleCartTrackBadge}>DÉJÀ EN VENTE</Text> : <Text style={styles.saleCartTrackBadgeNew}>OK</Text>}
                  </View>
                ))}
                {saleCartTracks.length > 8 ? <Text style={styles.saleCartMore}>+ {saleCartTracks.length - 8} autre{saleCartTracks.length - 8 > 1 ? 's' : ''} morceau{saleCartTracks.length - 8 > 1 ? 'x' : ''}</Text> : null}
              </View>

              {saleCartConflictCount > 0 ? (
                <View style={styles.saleCartWarning}>
                  <Text style={styles.saleCartWarningTitle}>AUCUN DOUBLON CRÉÉ</Text>
                  <Text style={styles.saleCartWarningText}>{saleCartConflictCount} morceau{saleCartConflictCount > 1 ? 'x sont' : ' est'} déjà proposé ailleurs. Loki garde la musique unique et référence simplement ce{saleCartConflictCount > 1 ? 's' : ''} titre{saleCartConflictCount > 1 ? 's' : ''} dans cette nouvelle Pépite.</Text>
                </View>
              ) : null}

              <TouchableOpacity style={styles.saleCartConfirmButton} onPress={confirmSaleCart}>
                <Text style={styles.saleCartConfirmTitle}>OUI, TOUT EST BON</Text>
                <Text style={styles.saleCartConfirmHint}>Choisir ensuite FREE ou une devise</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saleCartEditButton} onPress={() => setSaleCartReviewOpen(false)}>
                <Text style={styles.saleCartEditText}>MODIFIER MA SÉLECTION</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!sellTarget} transparent animationType="fade" onRequestClose={closeSellModal}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.saleModalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.editCard, styles.saleWizardCard]}>
              <View style={styles.saleWizardTopRow}>
                <Text style={styles.saleWizardStep}>ÉTAPE 3 SUR 4</Text>
                <Text style={styles.saleWizardCount}>{sellTarget?.kind === 'selection' ? String(sellTarget.trackIds.length) + ' titres' : 'Collection'}</Text>
              </View>
              <Text style={styles.editTitle}>Choisis comment tu veux être payé</Text>
              <Text style={styles.editHint}>Ta sélection est validée. Maintenant choisis FREE ou une devise, puis ton prix.</Text>

              {sellTarget?.kind === 'selection' ? <TextInput
                style={styles.input}
                value={sellTarget.name}
                maxLength={100}
                onChangeText={(name) => setSellTarget((current) => current?.kind === 'selection' ? { ...current, name } : current)}
                placeholder="Nom de la collection"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Nom de la collection exclusive"
              /> : null}

              <Text style={styles.saleStepLabel}>MODE DE DÉBLOCAGE</Text>
              <View style={styles.saleModeGrid}>
                <TouchableOpacity style={[styles.saleModeCard, sellPaymentMode === 'FREE' && styles.saleModeCardOn]} onPress={() => setSellPaymentMode('FREE')} accessibilityLabel="Choisir un déblocage en FREE">
                  <Text style={styles.saleModeIcon}>⚡</Text>
                  <Text style={styles.saleModeTitle}>FREE</Text>
                  <Text style={styles.saleModeHint}>Dans Loki Music · aucun paiement externe</Text>
                </TouchableOpacity>
                {Platform.OS === 'web' ? <TouchableOpacity style={[styles.saleModeCard, sellPaymentMode === 'MONEY' && styles.saleModeCardOn]} onPress={() => setSellPaymentMode('MONEY')} accessibilityLabel="Choisir un déblocage en euros">
                  <Text style={styles.saleModeIcon}>◎</Text>
                  <Text style={styles.saleModeTitle}>PAIEMENT DIRECT</Text>
                  <Text style={styles.saleModeHint}>Devise selon ton pays · PayPal ou lien personnel</Text>
                </TouchableOpacity> : null}
              </View>

              {sellPaymentMode ? <>
                {sellPaymentMode === 'MONEY' && Platform.OS === 'web' ? (
                  <>
                    <Text style={styles.saleStepLabel}>DEVISE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.saleCurrencyRow}>
                      {SALE_CURRENCIES.map((currency) => (
                        <TouchableOpacity key={currency.code} style={[styles.saleCurrencyChip, sellCurrencyCode === currency.code && styles.saleCurrencyChipOn]} onPress={() => setSellCurrencyCode(currency.code)}>
                          <Text style={[styles.saleCurrencyChipText, sellCurrencyCode === currency.code && styles.saleCurrencyChipTextOn]}>{currency.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <Text style={styles.saleStepLabel}>PRIX DE LA COLLECTION</Text>
                <View style={styles.priceChipsRow}>
                  {(sellPaymentMode === 'FREE' ? SALE_PRESET_FREE : SALE_PRESET_PRICES_CENTS).map((amount) => {
                    const selected = sellPaymentMode === 'FREE' ? sellFreePrice === amount : sellPriceCents === amount;
                    return <TouchableOpacity
                      key={sellPaymentMode + ':' + String(amount)}
                      style={[styles.priceChip, selected && styles.priceChipOn]}
                      onPress={() => sellPaymentMode === 'FREE' ? setSellFreePrice(amount) : setSellPriceCents(amount)}
                    >
                      <Text style={[styles.priceChipText, selected && styles.priceChipTextOn]}>{sellPaymentMode === 'FREE' ? String(amount) + ' FREE' : (amount / 100).toFixed(2).replace('.', ',') + ' ' + saleCurrencyLabel(sellCurrencyCode)}</Text>
                    </TouchableOpacity>;
                  })}
                </View>
              </> : <Text style={styles.salePriceExplain}>{Platform.OS === 'web' ? 'Choisis FREE ou PAIEMENT DIRECT pour afficher les prix correspondants.' : 'Choisis FREE pour fixer le prix de la collection.'}</Text>}

              <View style={styles.saleWizardDivider} />
              <View style={styles.saleWizardTopRow}><Text style={styles.saleWizardStep}>ÉTAPE 4 SUR 4</Text><Text style={styles.saleWizardCount}>PUBLIER</Text></View>

              {sellPaymentMode === 'MONEY' && Platform.OS === 'web' ? (
                <View style={[styles.salePaymentSetup, (payoutLink.trim() || payoutQrUrl.trim()) ? styles.salePaymentGateReady : styles.salePaymentGateMissing]}>
                  <Text style={styles.salePaymentGateTitle}>{payoutLink.trim() ? '✓ ' + payoutProviderLabel(payoutLink) + ' déjà enregistré' : payoutQrUrl.trim() ? '✓ QR PayPal enregistré' : 'PAIEMENT À CONFIGURER'}</Text>
                  <Text style={styles.salePaymentGateHint}>Ton lien est mémorisé sur ton profil. PayPal.Me est recommandé : le montant et la devise sélectionnée sont préremplis pour l’acheteur.</Text>
                  <Text style={styles.payoutChecklist}>1 · Ton pseudo PayPal.Me suffit  ·  2 · QR PayPal en secours  ·  3 · Loki mémorise les deux</Text>
                  <TextInput
                    style={styles.payoutInput}
                    value={payoutLinkDraft}
                    onChangeText={setPayoutLinkDraft}
                    placeholder="Pseudo PayPal.Me ou https://paypal.me/tonpseudo"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    accessibilityLabel="Lien de paiement personnel"
                  />
                  <View style={styles.payoutWizardActions}>
                    <TouchableOpacity style={styles.paypalOpenButton} onPress={() => void openPayPalMe()} accessibilityLabel="Ouvrir PayPal.Me"><Text style={styles.paypalOpenText}>1 · OUVRIR PAYPAL.ME</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.payoutTestButton} onPress={testPayoutDirect} disabled={!payoutLinkDraft.trim()} accessibilityLabel="Tester mon lien de paiement"><Text style={styles.payoutTestText}>2 · TESTER MON LIEN</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.payoutSaveButton, (!payoutLinkDraft.trim() || payoutSaving) && styles.selectionCreateDisabled]} disabled={!payoutLinkDraft.trim() || payoutSaving} onPress={() => void savePayoutDirect()}>
                      {payoutSaving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.payoutSaveText}>3 · ENREGISTRER LE LIEN</Text>}
                    </TouchableOpacity>
                  </View>
                  {userId ? <PayPalQrPayoutControl profileId={userId} qrUrl={payoutQrUrl} onChange={setPayoutQrUrl} disabled={payoutSaving} /> : null}
                  <Text style={styles.salePaymentFootnote}>Loki Music n’encaisse pas l’argent. Tu confirmes ensuite la réception avant le déblocage.</Text>
                </View>
              ) : sellPaymentMode === 'FREE' ? (
                <View style={[styles.salePaymentSetup, styles.salePaymentGateReady]}>
                  <Text style={styles.salePaymentGateTitle}>⚡ FREE LOKI MUSIC</Text>
                  <Text style={styles.salePaymentGateHint}>Aucun PayPal ni carte bancaire. Le prix est payé en FREE dans Loki Music.</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.saveButton, (!sellPaymentMode || (sellPaymentMode === 'MONEY' ? (!sellPriceCents || (!payoutLink.trim() && !payoutQrUrl.trim())) : !sellFreePrice)) && styles.publishButtonDisabled]}
                onPress={() => void saveSellPrice()}
                disabled={sellBusy || !sellPaymentMode || (sellPaymentMode === 'MONEY' ? (!sellPriceCents || (!payoutLink.trim() && !payoutQrUrl.trim())) : !sellFreePrice)}
              >
                {sellBusy ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveText}>PUBLIER LA COLLECTION</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={closeSellModal}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={Boolean(purchaseOpen)} transparent animationType="fade" onRequestClose={() => setPurchaseOpen(null)}>
        <View style={styles.modalBackdrop}><View style={[styles.editCard, styles.purchaseModalCard]}>
          <View style={styles.purchaseModalHead}>
            <View style={styles.purchaseModalHeadCopy}>
              <Text style={styles.editTitle}>{purchaseOpen?.playlistName || 'Ma collection'}</Text>
              <Text style={styles.purchaseModalSeller}>{purchaseOpen?.sellerUsername ? `@${purchaseOpen.sellerUsername}` : ''}</Text>
            </View>
            <TouchableOpacity style={styles.purchaseModalClose} onPress={() => setPurchaseOpen(null)} accessibilityLabel="Fermer mes collections"><Text style={styles.purchaseModalCloseText}>×</Text></TouchableOpacity>
          </View>
          {purchaseTracksLoading ? <ActivityIndicator color={colors.primaryLight} style={{ marginVertical: 24 }} /> : (
            <ScrollView style={styles.purchaseTracksScroll} contentContainerStyle={styles.purchaseTracksContent}>
              {purchaseTracks.map((track) => (
                <View key={track.id} style={styles.purchaseTrackRow}>
                  {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: colors.backgroundCard }} /> : <View style={[styles.purchaseTrackCover, styles.purchaseTrackCoverFallback]}><Text style={styles.purchaseTrackCoverText}>♪</Text></View>}
                  <View style={styles.purchaseTrackCopy}><Text style={styles.purchaseTrackTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.purchaseTrackArtist} numberOfLines={1}>{track.artist}</Text></View>
                  <TrackPreviewButton trackKey={`purchase:${purchaseOpen?.paymentId || 'unknown'}:${track.id}`} previewUrl={track.previewUrl} square />
                </View>
              ))}
              {!purchaseTracks.length ? <Text style={styles.editHint}>Aucun titre lisible dans cette collection.</Text> : null}
            </ScrollView>
          )}
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
  header:{paddingVertical:13,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerCopy:{flex:1,minWidth:0},title:{...typography.h1,color:colors.textPrimary,fontSize:24,lineHeight:28},headerSubtitle:{color:colors.textMuted,fontSize:10,marginTop:1},headerHelpButton:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},headerHelpButtonText:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},servicesButton:{backgroundColor:colors.primary,borderRadius:radius.pill,paddingHorizontal:11,minHeight:44,alignItems:'center',justifyContent:'center'},servicesButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  playlistHelpCard:{maxWidth:460,gap:14},
  playlistHelpHead:{flexDirection:'row',alignItems:'flex-start',gap:10},
  playlistHelpClose:{width:32,height:32,borderRadius:16,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  playlistHelpCloseText:{color:colors.textPrimary,fontSize:20,fontWeight:'900',lineHeight:22},
  playlistHelpSteps:{gap:9},
  playlistHelpStep:{minHeight:56,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  playlistHelpNo:{width:28,height:28,borderRadius:14,backgroundColor:colors.primary,color:'#FFF',fontSize:12,fontWeight:'900',textAlign:'center',lineHeight:28},
  playlistHelpCopy:{flex:1,minWidth:0},
  playlistHelpTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  playlistHelpText:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:2},
  focusHome:{marginHorizontal:14,marginTop:12,gap:12},
  focusHomeTitle:{color:colors.textPrimary,fontSize:22,fontWeight:'900'},
  focusHomeHint:{color:colors.textMuted,fontSize:13,lineHeight:19,marginBottom:2},
  focusPrimary:{minHeight:80,paddingHorizontal:15,paddingVertical:13,borderRadius:20,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center',gap:13},
  focusPrimaryIcon:{width:46,height:46,borderRadius:15,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  focusPrimaryIconText:{color:colors.primaryLight,fontSize:21,fontWeight:'900'},
  focusPrimaryCopy:{flex:1,minWidth:0},focusPrimaryTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900'},focusPrimaryHint:{color:colors.textMuted,fontSize:12,lineHeight:17,marginTop:4},
  purchaseHome:{borderRadius:18,borderWidth:1,borderColor:'rgba(45,225,194,.36)',backgroundColor:'rgba(45,225,194,.06)',padding:10,gap:7},
  purchaseHomeHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:3},
  purchaseHomeTitle:{color:colors.success,fontSize:10,fontWeight:'900',letterSpacing:1},
  purchaseHomeCount:{minWidth:24,height:24,borderRadius:12,backgroundColor:'rgba(45,225,194,.14)',color:colors.success,textAlign:'center',lineHeight:24,fontSize:11,fontWeight:'900'},
  purchaseHomeRow:{minHeight:52,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:9},
  purchaseHomeIcon:{width:30,height:30,borderRadius:15,backgroundColor:'rgba(45,225,194,.12)',borderWidth:1,borderColor:colors.success,alignItems:'center',justifyContent:'center'},
  purchaseHomeIconText:{color:colors.success,fontSize:14,fontWeight:'900'},
  purchaseHomeCopy:{flex:1,minWidth:0},purchaseHomeName:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},purchaseHomeMeta:{color:colors.textMuted,fontSize:10,fontWeight:'700',marginTop:2},
  purchaseHomePlay:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},purchaseHomeHint:{color:colors.textMuted,fontSize:9,lineHeight:13,paddingHorizontal:3},
  focusActionStack:{gap:10},
  focusActionRow:{minHeight:70,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:12},
  focusActionIcon:{width:40,height:40,borderRadius:13,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  focusActionIconText:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},
  focusActionCopy:{flex:1,minWidth:0},focusActionTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},focusActionHint:{color:colors.textMuted,fontSize:12,lineHeight:17,marginTop:3},
  focusServiceLink:{minHeight:62,paddingHorizontal:14,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,flexDirection:'row',alignItems:'center',gap:11},
  focusServiceIcon:{width:30,textAlign:'center',color:colors.primaryLight,fontSize:20,fontWeight:'900'},focusServiceCopy:{flex:1,minWidth:0},focusServiceTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900'},focusServiceHint:{color:colors.textMuted,fontSize:12,lineHeight:17,marginTop:2},
  focusLearnMore:{marginTop:4,paddingHorizontal:4,color:colors.textSecondary,fontSize:12,lineHeight:18},
  focusLearnMoreButton:{alignSelf:'center',minHeight:36,justifyContent:'center',paddingHorizontal:16,marginTop:2},focusLearnMoreButtonText:{color:colors.primaryLight,fontSize:12,fontWeight:'800'},
  inlineServicesCard:{margin:spacing.md,padding:spacing.lg,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},inlineServicesTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginBottom:6},inlineServicesText:{color:colors.textSecondary,fontSize:13,lineHeight:19,marginBottom:14},inlineServicesAction:{minHeight:48,borderRadius:radius.md,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},inlineServicesActionText:{color:'#FFF',fontWeight:'900',fontSize:12},
  focusChoice:{minHeight:66,paddingHorizontal:12,paddingVertical:9,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center',gap:11},
  focusChoiceIcon:{width:40,height:40,borderRadius:12,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},
  focusChoiceIconText:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},
  focusChoiceCopy:{flex:1,minWidth:0},focusChoiceTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},focusChoiceHint:{color:colors.textMuted,fontSize:10,marginTop:2},focusChoiceArrow:{color:colors.textPrimary,fontSize:24,fontWeight:'800'},
  purchaseModalCard:{width:'92%',maxWidth:520,maxHeight:'78%'},
  purchaseModalHead:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10},purchaseModalHeadCopy:{flex:1,minWidth:0},purchaseModalSeller:{color:colors.primaryLight,fontSize:11,fontWeight:'800',marginTop:2},
  purchaseModalClose:{width:36,height:36,borderRadius:18,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},purchaseModalCloseText:{color:colors.textPrimary,fontSize:24,lineHeight:26,fontWeight:'700'},
  purchaseTracksScroll:{maxHeight:430},purchaseTracksContent:{gap:7,paddingBottom:4},
  purchaseTrackRow:{minHeight:58,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:7,flexDirection:'row',alignItems:'center',gap:9},
  purchaseTrackCover:{width:42,height:42,borderRadius:10,backgroundColor:colors.backgroundCard},purchaseTrackCoverFallback:{alignItems:'center',justifyContent:'center'},purchaseTrackCoverText:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},
  purchaseTrackCopy:{flex:1,minWidth:0},purchaseTrackTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},purchaseTrackArtist:{color:colors.textMuted,fontSize:10,fontWeight:'700',marginTop:2},
  focusBar:{marginHorizontal:12,marginTop:9,marginBottom:5,minHeight:54,borderRadius:15,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:9},
  focusBack:{width:38,height:38,borderRadius:12,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},focusBackText:{color:colors.primaryLight,fontSize:30,fontWeight:'700',lineHeight:32},focusBarCopy:{flex:1},focusBarTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},focusBarHint:{color:colors.textMuted,fontSize:9,marginTop:1},
  mobileAccordion:{marginHorizontal:12,marginTop:8,gap:7},
  mobileAccordionRow:{minHeight:58,paddingHorizontal:11,paddingVertical:8,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center',gap:10},
  mobileAccordionRowOn:{borderColor:colors.primary},
  mobileAccordionIcon:{width:36,height:36,borderRadius:10,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},
  mobileAccordionIconText:{color:colors.primaryLight,fontSize:17,fontWeight:'900'},
  mobileAccordionCopy:{flex:1,minWidth:0},
  mobileAccordionTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  mobileAccordionHint:{color:colors.textMuted,fontSize:9,marginTop:2},
  mobileAccordionChevron:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},
  mobileAccordionBody:{borderWidth:1,borderColor:colors.primary,borderRadius:15,overflow:'hidden',backgroundColor:colors.backgroundCard},
  tabs:{marginTop:10,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},tab:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},tabIndicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},
  organizeAction:{marginHorizontal:0,marginBottom:10,borderWidth:1,borderColor:colors.primary,borderRadius:16,backgroundColor:colors.backgroundCard,padding:13,gap:11},organizeActionCopy:{gap:4},organizeActionButton:{minHeight:44,borderRadius:13,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:16},organizeActionButtonText:{color:colors.white,fontSize:12,fontWeight:'900',letterSpacing:.4},vibeBar:{marginHorizontal:14,marginTop:8,minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.primary,backgroundColor:'#171020',paddingHorizontal:12,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:8},vibeBarLocked:{borderColor:'#493369'},vibeBarCopy:{flex:1},vibeBarTitle:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},vibeBarHint:{color:'#FFFFFF',fontSize:11,lineHeight:15,marginTop:2,fontWeight:'700'},vibeArrow:{fontSize:16},
  styleCountHeader:{marginBottom:10,padding:12,borderRadius:18,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primary},
  styleCountTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',letterSpacing:.5},
  styleCountHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:3},
  autoVibesSection:{marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border},
  autoVibesTitle:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:.7,marginBottom:2},
  autoVibesHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginBottom:8},
  manageGuide:{marginHorizontal:12,marginTop:7,paddingHorizontal:10,paddingVertical:7,borderRadius:14,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary,flexDirection:'row',alignItems:'center',gap:10},
  manageGuideActive:{borderColor:colors.keep,backgroundColor:colors.successFaint},
  manageHelpBox:{marginHorizontal:12,marginTop:6,paddingHorizontal:12,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard},
  manageHelpTitle:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.6},
  manageHelpText:{color:colors.textMutedGrey,fontSize:10,lineHeight:15,marginTop:4},
  manageModeButton:{minHeight:34,paddingHorizontal:9,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  manageModeButtonActive:{borderColor:colors.keep},
  manageModeButtonText:{color:colors.primaryLight,fontSize:8,fontWeight:'900'},
  manageModeButtonTextActive:{color:colors.keep},
  manageGuideIcon:{width:30,height:30,borderRadius:15,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  manageGuideIconText:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  manageGuideCopy:{flex:1,minWidth:0},
  manageGuideTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.6},
  manageGuideText:{color:colors.textMutedGrey,fontSize:10,lineHeight:14,marginTop:2},
  libraryStrip:{marginHorizontal:14,marginTop:5,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,minHeight:50,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:5},stat:{minWidth:46,alignItems:'center',justifyContent:'center',paddingHorizontal:3},statValue:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},statLabel:{color:colors.textMuted,fontSize:7,fontWeight:'900',marginTop:1},statLabelPublic:{color:'#68F2B1'},statLabelPrivate:{color:'#FF758F'},visibilityTools:{flex:1,flexDirection:'row',justifyContent:'flex-end',gap:5},visibilityMini:{minHeight:34,paddingHorizontal:7,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},visibilityMiniPublic:{backgroundColor:'#123D2C',borderColor:'#38D990'},visibilityMiniPrivate:{backgroundColor:'#4A171B',borderColor:'#F0525D'},visibilityMiniText:{color:'#FFFFFF',fontSize:7.5,fontWeight:'900'},
  originSummary:{marginHorizontal:14,marginTop:5,alignItems:'center'},originSummaryText:{color:colors.textMuted,fontSize:11,fontWeight:'800'},originOwnCount:{color:colors.keep},originSocialCount:{color:colors.primaryLight},originTotalCount:{color:colors.textPrimary},
  originFilters:{width:'100%',flexDirection:'row',gap:6},originFilterButton:{flex:1,minHeight:36,paddingHorizontal:5,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},originFilterButtonOn:{borderColor:colors.primaryLight,backgroundColor:colors.backgroundCard},originFilterText:{color:colors.textMuted,fontSize:8,fontWeight:'900',textAlign:'center'},originFilterTextOn:{color:colors.textPrimary},
  originSection:{borderRadius:18,borderWidth:1,overflow:'hidden',marginBottom:10},originSectionOwn:{borderColor:colors.keep,backgroundColor:colors.successFaint},originSectionSocial:{borderColor:colors.primary,backgroundColor:colors.primaryFaint,marginTop:10},originSectionHeader:{minHeight:52,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},originSectionTitleRow:{flexDirection:'row',alignItems:'center',gap:7,flex:1,minWidth:0},originSectionIcon:{fontSize:15},originSectionTitle:{fontSize:14,fontWeight:'900',flexShrink:1},originSectionTitleOwn:{color:colors.keep},originSectionTitleSocial:{color:colors.primaryLight},originSectionRight:{flexDirection:'row',alignItems:'center',gap:7},originSectionCount:{fontSize:10,fontWeight:'900'},originSectionCountOwn:{color:colors.keep},originSectionCountSocial:{color:colors.primaryLight},originSectionChevron:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},originSectionBody:{paddingHorizontal:8,paddingBottom:8,gap:6},

  analysisSummary:{marginHorizontal:14,marginTop:6,minHeight:44,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8},analysisSummaryText:{flex:1,color:colors.textPrimary,fontSize:10,lineHeight:14,fontWeight:'800'},analysisChevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},analysisCard:{marginHorizontal:14,marginTop:4,backgroundColor:colors.backgroundElevated,borderRadius:12,padding:10,gap:4},analysisLine:{color:colors.textSecondary,fontSize:11},genreToggle:{flexDirection:'row',alignItems:'center',gap:6},genreLine:{flex:1,color:colors.primaryLight,fontSize:10,lineHeight:15},genreChevron:{color:colors.primaryLight,fontSize:14,fontWeight:'900'},genreChips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:2},genreChip:{paddingHorizontal:9,paddingVertical:5,borderRadius:999,backgroundColor:'#2A203A',borderWidth:1,borderColor:'#7652AF'},genreChipText:{color:'#C9B3FF',fontSize:9,fontWeight:'800'},analysisHelp:{color:colors.textMuted,fontSize:9,lineHeight:14},
  selectionToolbar:{marginBottom:8,padding:10,borderRadius:14,borderWidth:1,borderColor:'#6F5520',backgroundColor:'#211A0C',flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},selectionStartButton:{flex:1,minHeight:44,borderRadius:20,backgroundColor:'#3D2F10',borderWidth:1,borderColor:'#FFD166',alignItems:'center',justifyContent:'center'},selectionStartText:{color:'#FFD166',fontSize:10,fontWeight:'900'},selectionToolbarCopy:{flex:1,minWidth:150},selectionToolbarTitle:{color:'#FFFFFF',fontSize:11,fontWeight:'900'},selectionCancelButton:{minHeight:36,paddingHorizontal:9,borderRadius:17,borderWidth:1,borderColor:'#6A6076',alignItems:'center',justifyContent:'center'},selectionCancelText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},selectionAddButton:{minHeight:36,paddingHorizontal:9,borderRadius:17,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},selectionAddText:{color:'#FFF',fontSize:8,fontWeight:'900'},selectionCreateButton:{flex:1,minHeight:54,paddingHorizontal:14,borderRadius:16,backgroundColor:'#FFD166',alignItems:'center',justifyContent:'center'},selectionCreateDisabled:{opacity:.38},selectionCreateText:{color:'#1B1405',fontSize:11,fontWeight:'900',letterSpacing:.3},selectionCreateSubtext:{color:'#5A420D',fontSize:9,fontWeight:'800',marginTop:2},selectionCheck:{minWidth:70,height:34,paddingHorizontal:7,borderRadius:17,borderWidth:2,borderColor:'#7C7088',alignItems:'center',justifyContent:'center'},selectionCheckOn:{backgroundColor:'#6F5520',borderColor:'#FFD166'},selectionCheckAlreadySold:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},selectionCheckDisabled:{opacity:.35},selectionCheckLocked:{opacity:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},selectionCheckText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},
  saleWizardIntro:{marginHorizontal:2,marginBottom:12,padding:14,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint},saleWizardTopRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},saleWizardStep:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},saleWizardCount:{color:colors.keep,fontSize:10,fontWeight:'900'},saleWizardTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginTop:7},saleWizardHint:{color:colors.textMutedGrey,fontSize:12,lineHeight:18,marginTop:5},
  // (21/09/2026) : "ce bouton descend au fur et à mesure" -- barre de
  // confirmation collée en bas de l'écran pendant la sélection multiple.
  listWithStickyFooter:{paddingBottom:150},
  stickySelectionFooter:{position:'absolute',left:10,right:10,bottom:8,minHeight:124,padding:12,borderRadius:20,borderWidth:1,borderColor:'#D49A20',backgroundColor:'#211A0C',gap:10,shadowColor:'#000',shadowOpacity:0.38,shadowRadius:14,shadowOffset:{width:0,height:6},elevation:10},
  selectionToolbarTop:{flexDirection:'row',alignItems:'center',gap:10},
  selectionCartIcon:{width:38,height:38,borderRadius:19,backgroundColor:'#FFD166',alignItems:'center',justifyContent:'center'},
  selectionCartIconText:{color:'#1B1405',fontSize:16,fontWeight:'900'},
  selectionToolbarEyebrow:{color:'#FFD166',fontSize:8,fontWeight:'900',letterSpacing:1},
  selectionToolbarHint:{color:colors.textMutedGrey,fontSize:9,fontWeight:'700',marginTop:2},
  stickySelectionActions:{flexDirection:'row',alignItems:'stretch',gap:8},
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
  trackSourceRow:{flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap'},trackSourceLabel:{color:colors.textMuted,fontSize:8,fontWeight:'700'},trackSourceLink:{color:colors.primaryLight,fontSize:8,fontWeight:'900',textDecorationLine:'underline'},trackActions:{flexDirection:'row',alignItems:'stretch',gap:5},visibilityTrackButton:{flex:1,minHeight:44,paddingHorizontal:4,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},visibilityTrackPublic:{backgroundColor:'#123D2C',borderColor:'#38D990'},visibilityTrackPrivate:{backgroundColor:'#4A171B',borderColor:'#F0525D'},visibilityTrackText:{color:'#FFFFFF',fontSize:7.5,fontWeight:'900'},deleteTrackButton:{flex:1,minHeight:44,paddingHorizontal:4,borderRadius:14,borderWidth:1,borderColor:'#8C4650',backgroundColor:'#311419',alignItems:'center',justifyContent:'center'},deleteTrackText:{color:'#FF9AA8',fontSize:7,fontWeight:'900'},loadingText:{color:colors.textMuted,fontSize:10,paddingVertical:8},collectionActions:{flexDirection:'row',justifyContent:'flex-end',gap:6,marginTop:2},serviceMini:{minHeight:44,paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},serviceMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},shareMini:{minHeight:44,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:'#38D990',backgroundColor:'#123D2C',alignItems:'center',justifyContent:'center'},shareMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},
  trackSourceOwnership:{color:colors.danger,fontSize:9,fontWeight:'900',marginTop:3,marginLeft:4},
  emptyCard:{margin:12,padding:18,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,alignItems:'center'},emptyTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800'},emptyText:{color:colors.textSecondary,fontSize:11,textAlign:'center',marginTop:6,lineHeight:16},emptyButton:{marginTop:10,backgroundColor:colors.primary,borderRadius:radius.pill,minHeight:44,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},emptyButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  saleCartReviewCard:{width:'100%',maxWidth:560,alignSelf:'center',padding:18,gap:12,borderColor:'#D49A20'},
  saleCartReviewTitle:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:2},
  saleCartReviewHint:{color:colors.textSecondary,fontSize:12,lineHeight:18},
  saleCartSummaryRow:{minHeight:68,borderRadius:16,borderWidth:1,borderColor:'#6F5520',backgroundColor:'#171107',flexDirection:'row',alignItems:'center',paddingHorizontal:8},
  saleCartSummaryStat:{flex:1,alignItems:'center',justifyContent:'center'},saleCartSummaryValue:{color:'#FFD166',fontSize:20,fontWeight:'900'},saleCartSummaryWarn:{color:'#FFB454'},saleCartSummaryLabel:{color:colors.textMutedGrey,fontSize:7.5,fontWeight:'900',marginTop:2,textAlign:'center'},
  saleCartSummaryDivider:{width:1,height:34,backgroundColor:'#5F4818'},
  saleCartTrackList:{gap:7},
  saleCartTrackRow:{minHeight:52,borderRadius:13,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:8,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:8},
  saleCartTrackNo:{width:22,color:colors.textMuted,fontSize:9,fontWeight:'900'},saleCartTrackCover:{width:38,height:38,borderRadius:9,backgroundColor:colors.backgroundCard},saleCartTrackCoverFallback:{alignItems:'center',justifyContent:'center'},saleCartTrackCoverText:{color:colors.primaryLight,fontSize:15,fontWeight:'900'},
  saleCartTrackCopy:{flex:1,minWidth:0},saleCartTrackTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},saleCartTrackArtist:{color:colors.textMuted,fontSize:9,marginTop:2},
  saleCartTrackBadge:{color:'#FFB454',fontSize:7,fontWeight:'900'},saleCartTrackBadgeNew:{color:colors.success,fontSize:8,fontWeight:'900'},saleCartMore:{color:colors.textMutedGrey,fontSize:9,fontWeight:'800',textAlign:'center',paddingTop:2},
  saleCartWarning:{borderRadius:14,borderWidth:1,borderColor:'#7B5B18',backgroundColor:'#2A1F09',padding:10},saleCartWarningTitle:{color:'#FFD166',fontSize:9,fontWeight:'900',letterSpacing:.7},saleCartWarningText:{color:colors.textSecondary,fontSize:10,lineHeight:15,marginTop:3},
  saleCartConfirmButton:{minHeight:58,borderRadius:17,backgroundColor:'#FFD166',alignItems:'center',justifyContent:'center',paddingHorizontal:14},saleCartConfirmTitle:{color:'#1B1405',fontSize:12,fontWeight:'900'},saleCartConfirmHint:{color:'#5A420D',fontSize:9,fontWeight:'800',marginTop:2},
  saleCartEditButton:{minHeight:42,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},saleCartEditText:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},
  saleCurrencyRow:{gap:7,paddingBottom:2},saleCurrencyChip:{minHeight:38,paddingHorizontal:12,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},saleCurrencyChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primary},saleCurrencyChipText:{color:colors.textSecondary,fontSize:9,fontWeight:'900'},saleCurrencyChipTextOn:{color:'#FFF'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.76)',justifyContent:'center'},modalScroll:{flexGrow:1,justifyContent:'center',padding:18},saleModalScroll:{flexGrow:1,justifyContent:'center',paddingHorizontal:14,paddingVertical:24},editCard:{backgroundColor:colors.backgroundCard,borderRadius:18,borderWidth:1,borderColor:colors.border,padding:16,gap:9},saleWizardCard:{width:'100%',maxWidth:560,alignSelf:'center',padding:18},editTitle:{color:colors.textPrimary,fontSize:19,fontWeight:'900'},editHint:{color:colors.textMuted,fontSize:10,lineHeight:15},input:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:12,color:colors.textPrimary,fontSize:13},multiline:{minHeight:76,paddingTop:10,textAlignVertical:'top'},visibilityButton:{minHeight:44,borderRadius:12,borderWidth:1,justifyContent:'center',alignItems:'center'},visibilityButtonPublic:{backgroundColor:'#123D2C',borderColor:'#38D990'},visibilityButtonPrivate:{backgroundColor:'#4A171B',borderColor:'#F0525D'},visibilityText:{color:'#FFFFFF',fontSize:11,fontWeight:'900'},saveButton:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},saveText:{color:'#FFF',fontSize:11,fontWeight:'900'},cancelButton:{minHeight:44,alignItems:'center',justifyContent:'center'},cancelText:{color:colors.textMuted,fontSize:10,fontWeight:'700'},salePriceHeader:{marginTop:12,marginBottom:8,padding:11,borderRadius:14,backgroundColor:'rgba(124,92,252,.10)',borderWidth:1,borderColor:'rgba(167,139,250,.45)'},salePriceLabel:{color:colors.primaryLight,fontSize:11,fontWeight:'900',letterSpacing:.8},salePriceExplain:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,fontWeight:'700',marginTop:4},salePriceSummary:{color:colors.success,fontSize:12,lineHeight:17,fontWeight:'900',textAlign:'center',marginTop:9},saleStepLabel:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:12,marginBottom:7},salePaymentGate:{minHeight:58,borderRadius:15,borderWidth:1,paddingHorizontal:12,paddingVertical:10,marginBottom:10},salePaymentGateReady:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)'},salePaymentGateMissing:{borderColor:colors.danger,backgroundColor:'rgba(255,92,114,.08)'},salePaymentGateTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},salePaymentGateHint:{color:colors.textMuted,fontSize:10,lineHeight:15,marginTop:3},priceChipsRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},priceChip:{minHeight:44,paddingHorizontal:14,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},priceChipOn:{backgroundColor:colors.primaryFaint,borderColor:colors.primaryLight},priceChipText:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},priceChipTextOn:{color:colors.primaryLight},saleModeGrid:{flexDirection:'row',gap:10},saleModeCard:{flex:1,minHeight:116,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:12,alignItems:'flex-start',justifyContent:'center'},saleModeCardOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},saleModeIcon:{color:colors.primaryLight,fontSize:24,fontWeight:'900'},saleModeTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900',marginTop:6},saleModeHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:15,marginTop:4},saleWizardDivider:{height:1,backgroundColor:colors.border,marginVertical:6},salePaymentSetup:{borderRadius:16,borderWidth:1,padding:13,gap:8},payoutInput:{minHeight:48,borderRadius:13,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:12,color:colors.textPrimary,fontSize:13},payoutChecklist:{color:colors.textSecondary,fontSize:10,lineHeight:16,fontWeight:'700'},payoutWizardActions:{gap:8},paypalOpenButton:{minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:10},paypalOpenText:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},payoutTestButton:{minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.06)',alignItems:'center',justifyContent:'center',paddingHorizontal:10},payoutTestText:{color:colors.keep,fontSize:10,fontWeight:'900'},payoutSaveButton:{minHeight:44,borderRadius:14,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:10},payoutSaveText:{color:'#FFFFFF',fontSize:10,fontWeight:'900'},salePaymentFootnote:{color:colors.textMuted,fontSize:9,lineHeight:14},publishButtonDisabled:{opacity:.4},
});
