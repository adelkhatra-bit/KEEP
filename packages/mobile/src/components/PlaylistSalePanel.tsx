import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { createAuthService } from '../services/authService';
import { createProfileService } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { cancelPlaylistSalePayment, getPlaylistSaleAccess, PlaylistSaleAccess, PlaylistSaleOffer, clearPlaylistSalePrice, declinePlaylistSaleTrackRequest, loadMyOfferedTrackIds, loadMyPlaylistSaleOffers, loadMyPlaylistSales, loadMyPlaylistPurchases, loadMyPlaylistSaleTrackRequests, loadPlaylistSaleTrackRequestTracks, markPlaylistSalePaid, offerPlaylistSaleRequestSelectionWithFree, PlaylistOfferedTrack, PlaylistSalePaymentMode, PlaylistSaleSellerRequestTrack, PlaylistSaleSellerTrackRequest, PlaylistSaleTransaction, SALE_PRESET_FREE, SALE_PRESET_PRICES_CENTS, setPlaylistSaleOfferForSelection, updateOfferPaymentMode } from '../services/playlistSaleService';
import { Alert } from '../utils/keepAlert';
import { syncMarketplaceDelivery } from '../services/musicProviderSyncService';
import { isPlaylistMarketplaceEnabled, isPlaylistMarketplaceVisible } from '../services/featureFlagService';
import { splitSaleOffersByStatus } from '../services/saleListPaging';
import { loadOwnPersistedKeeps } from '../services/keepMusicCoreRecognition';
import { getMyPayoutMethods, normalizePayoutLinkInput, setMyPayoutLink } from '../services/payoutLinkService';
import { openPlaylistPaymentProof } from '../services/playlistPaymentProofService';
import { acceptMarketplacePaymentTerms, loadMarketplacePaymentTermsAccepted } from '../services/musicAgoraService';
import type { CanonicalTrack } from '@keep/music';
import PayPalQrPayoutControl from './PayPalQrPayoutControl';

type PriceEditState = { offerId: string; playlistId: string; playlistName: string; paymentMode: PlaylistSalePaymentMode; priceCents: number; freePrice: number | null } | null;

const MARKETPLACE_CURRENCIES = [
  { code: 'EUR', label: '€ EUR' },
  { code: 'USD', label: '$ USD' },
  { code: 'GBP', label: '£ GBP' },
  { code: 'CHF', label: 'CHF' },
  { code: 'CAD', label: '$ CAD' },
  { code: 'AUD', label: '$ AUD' },
  { code: 'AED', label: 'AED' },
  { code: 'JPY', label: '¥ JPY' },
  { code: 'CNY', label: '¥ CNY' },
  { code: 'INR', label: '₹ INR' },
  { code: 'BRL', label: 'R$ BRL' },
  { code: 'MXN', label: '$ MXN' },
  { code: 'KRW', label: '₩ KRW' },
  { code: 'SGD', label: '$ SGD' },
  { code: 'HKD', label: '$ HKD' },
  { code: 'NZD', label: '$ NZD' },
  { code: 'SEK', label: 'kr SEK' },
  { code: 'NOK', label: 'kr NOK' },
  { code: 'DKK', label: 'kr DKK' },
  { code: 'PLN', label: 'zł PLN' },
  { code: 'CZK', label: 'Kč CZK' },
] as const;

function currencyForCountry(countryCode?: string | null): string {
  const country = String(countryCode || '').trim().toUpperCase();
  if (['FR','DE','ES','IT','PT','BE','NL','LU','IE','AT','FI','GR','CY','MT','EE','LV','LT','SI','SK','HR'].includes(country)) return 'EUR';
  if (country === 'GB') return 'GBP';
  if (country === 'CH') return 'CHF';
  if (country === 'CA') return 'CAD';
  if (country === 'AU') return 'AUD';
  if (country === 'AE') return 'AED';
  if (country === 'US') return 'USD';
  if (country === 'JP') return 'JPY';
  if (country === 'CN') return 'CNY';
  if (country === 'IN') return 'INR';
  if (country === 'BR') return 'BRL';
  if (country === 'MX') return 'MXN';
  if (country === 'KR') return 'KRW';
  if (country === 'SG') return 'SGD';
  if (country === 'HK') return 'HKD';
  if (country === 'NZ') return 'NZD';
  if (country === 'SE') return 'SEK';
  if (country === 'NO') return 'NOK';
  if (country === 'DK') return 'DKK';
  if (country === 'PL') return 'PLN';
  if (country === 'CZ') return 'CZK';
  return 'EUR';
}

function transactionAmountLabel(transaction: PlaylistSaleTransaction, direction: 'RECEIVED' | 'SPENT' | 'NEUTRAL' = 'NEUTRAL'): string {
  if (transaction.paymentMode === 'FREE' || transaction.amountFree > 0) {
    const sign = direction === 'RECEIVED' ? '+ ' : direction === 'SPENT' ? '− ' : '';
    return `${sign}${transaction.amountFree} FREE`;
  }
  return `${(transaction.amountCents / 100).toFixed(2).replace('.', ',')}€ ${transaction.currencyCode}`;
}

function transactionFreeBalanceLabel(transaction: PlaylistSaleTransaction): string | null {
  if (transaction.paymentMode !== 'FREE' && transaction.amountFree <= 0) return null;
  if (transaction.freeBalanceBefore == null || transaction.freeBalanceAfter == null) return 'Solde FREE de départ non enregistré pour cet ancien déblocage.';
  return `Solde FREE : ${transaction.freeBalanceBefore} → ${transaction.freeBalanceAfter}`;
}

export default function PlaylistSalePanel({ navigation, route }: any) {
  const focusOfferId: string | undefined = route?.params?.manageSaleOfferId;
  const focusPaymentId: string | undefined = route?.params?.focusPaymentId;
  const openPaymentHistory = route?.params?.openPaymentHistory === true;
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [realSessionUserId, setRealSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return undefined;
    let live = true;
    const auth = createAuthService(supabase);
    const profiles = createProfileService(supabase);

    const reconcile = async () => {
      const session = await auth.getCurrentSession().catch(() => null);
      if (!live) return;
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
        } catch {}
      }
    };

    void reconcile();
    const offFocus = navigation?.addListener?.('focus', () => { void reconcile(); });
    const offAuth = auth.onSessionChange((session) => {
      if (!live) return;
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

  const effectiveAuthenticatedUserId = realSessionUserId
    || (!isLocalGuest && !isDemoMode ? user?.id ?? null : null);
  const accountRequired = !effectiveAuthenticatedUserId;
  const [access, setAccess] = useState<PlaylistSaleAccess | null>(null);
  const [offers, setOffers] = useState<PlaylistSaleOffer[]>([]);
  const [sales, setSales] = useState<PlaylistSaleTransaction[]>([]);
  const [purchases, setPurchases] = useState<PlaylistSaleTransaction[]>([]);
  const [trackRequests, setTrackRequests] = useState<PlaylistSaleSellerTrackRequest[]>([]);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [requestTracks, setRequestTracks] = useState<Record<string, PlaylistSaleSellerRequestTrack[]>>({});
  const [requestSelections, setRequestSelections] = useState<Record<string, Set<string>>>({});
  const [requestTracksBusyId, setRequestTracksBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PriceEditState>(null);
  const [error, setError] = useState('');
  const [retiredOpen, setRetiredOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (openPaymentHistory || focusPaymentId) setHistoryOpen(true);
  }, [openPaymentHistory, focusPaymentId]);
  const [offerFilter, setOfferFilter] = useState<'ALL' | 'FREE' | 'MONEY'>('ALL');
  const [collectionCartOpen, setCollectionCartOpen] = useState(false);
  const [collectionCartStep, setCollectionCartStep] = useState<'TRACKS' | 'REVIEW' | 'PRICE' | 'PUBLISH'>('TRACKS');
  const [collectionCartLoading, setCollectionCartLoading] = useState(false);
  const [collectionCartTracks, setCollectionCartTracks] = useState<CanonicalTrack[]>([]);
  const [collectionCartIds, setCollectionCartIds] = useState<Set<string>>(new Set());
  const [collectionCartOffered, setCollectionCartOffered] = useState<Record<string, PlaylistOfferedTrack>>({});
  const [collectionCartQuery, setCollectionCartQuery] = useState('');
  const [collectionCartName, setCollectionCartName] = useState('');
  const [collectionCartPaymentMode, setCollectionCartPaymentMode] = useState<PlaylistSalePaymentMode>('FREE');
  const [collectionCartPriceCents, setCollectionCartPriceCents] = useState<number | null>(null);
  const [collectionCartFreePrice, setCollectionCartFreePrice] = useState<number | null>(null);
  const [collectionCartCurrencyCode, setCollectionCartCurrencyCode] = useState<string>(() => currencyForCountry((user as any)?.countryCode));
  const [collectionCartPayoutLink, setCollectionCartPayoutLink] = useState('');
  const [collectionCartPayoutQrUrl, setCollectionCartPayoutQrUrl] = useState('');
  const collectionCartScrollRef = useRef<ScrollView | null>(null);

  // Chaque étape Pépites est un écran de travail en soi. Quand l'utilisateur
  // valide en bas, la nouvelle étape doit apparaître immédiatement à son début
  // au lieu de conserver l'ancien offset de scroll très bas.
  useEffect(() => {
    if (!collectionCartOpen) return;
    const pinStepTop = () => collectionCartScrollRef.current?.scrollTo({ y: 0, animated: false });
    requestAnimationFrame(pinStepTop);
    const t1 = setTimeout(pinStepTop, 60);
    const t2 = setTimeout(pinStepTop, 180);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [collectionCartOpen, collectionCartStep]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      // Un retour vers Pépites ne doit jamais réutiliser un ancien offset de
      // scroll : on repart sur le contenu visible, sans chercher la zone à
      // swiper.
      requestAnimationFrame(() => collectionCartScrollRef.current?.scrollTo({ y: 0, animated: false }));
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation]);
  const visibleCollectionCartTracks = useMemo(() => {
    const needle = collectionCartQuery.trim().toLocaleLowerCase('fr-FR');
    const rows = needle
      ? collectionCartTracks.filter((track) => `${track.title} ${track.artist}`.toLocaleLowerCase('fr-FR').includes(needle))
      : collectionCartTracks;
    return rows.slice(0, 300);
  }, [collectionCartQuery, collectionCartTracks]);
  const collectionCartDuplicateCount = useMemo(
    () => Array.from(collectionCartIds).filter((trackId) => Boolean(collectionCartOffered[trackId])).length,
    [collectionCartIds, collectionCartOffered],
  );
  const selectedCollectionCartTracks = useMemo(
    () => collectionCartTracks.filter((track) => collectionCartIds.has(track.id)),
    [collectionCartTracks, collectionCartIds],
  );
  const { published, retired } = useMemo(() => splitSaleOffersByStatus(offers, focusOfferId), [offers, focusOfferId]);
  const freePublished = useMemo(() => published.filter((item) => item.paymentMode === 'FREE'), [published]);
  const moneyPublished = useMemo(() => published.filter((item) => item.paymentMode !== 'FREE'), [published]);
  const filteredPublished = useMemo(() => offerFilter === 'FREE' ? freePublished : offerFilter === 'MONEY' ? moneyPublished : published, [freePublished, moneyPublished, offerFilter, published]);
  const activeLimitReached = Boolean(access && access.activeOffers >= access.maxActiveOffers);
  // Adel (20/09/2026) : marketplace playlists en "coming soon" -- paiement
  // par lien externe, non conforme Apple IAP pour du contenu numérique
  // déverrouillé dans l'app. Garde-fou d'accès direct (deep-link/route),
  // au cas où le point d'entrée menu serait contourné -- le flag Super
  // Admin 'playlist_marketplace' reste la seule source de vérité.
  const [marketplaceEnabled, setMarketplaceEnabled] = useState<boolean | null>(null);
  const [marketplaceTransactionEnabled, setMarketplaceTransactionEnabled] = useState(false);
  // (21/09/2026) BUG RÉEL corrigé : ce check ne tournait qu'au montage --
  // un changement de flag/bypass fait dans Super Admin pendant que l'écran
  // était déjà ouvert n'était jamais relu sans relancer l'app. Recalculé
  // aussi à chaque focus.
  useEffect(() => {
    let live = true;
    const check = async () => {
      const [visible, transactionEnabled] = await Promise.all([
        isPlaylistMarketplaceVisible(),
        isPlaylistMarketplaceEnabled(),
      ]);
      if (!live) return;
      setMarketplaceEnabled(visible);
      setMarketplaceTransactionEnabled(transactionEnabled);
    };
    void check();
    const unsubscribe = navigation?.addListener?.('focus', () => { void check(); });
    return () => { live = false; unsubscribe?.(); };
  }, [navigation]);

  const resetCollectionCart = () => {
    setCollectionCartOpen(false);
    setCollectionCartStep('TRACKS');
    setCollectionCartTracks([]);
    setCollectionCartIds(new Set());
    setCollectionCartOffered({});
    setCollectionCartQuery('');
    setCollectionCartName('');
    setCollectionCartPaymentMode('FREE');
    setCollectionCartPriceCents(null);
    setCollectionCartFreePrice(null);
    setCollectionCartCurrencyCode(currencyForCountry((user as any)?.countryCode));
    setCollectionCartPayoutQrUrl('');
  };

  const openCollectionCart = async () => {
    if (activeLimitReached) {
      Alert.alert('Limite atteinte', `Tu as déjà ${access?.maxActiveOffers ?? 0} collections actives. Retire une ancienne collection avant d’en publier une nouvelle.`);
      return;
    }
    setCollectionCartOpen(true);
    setCollectionCartStep('TRACKS');
    setCollectionCartIds(new Set());
    setCollectionCartQuery('');
    setCollectionCartName('');
    setCollectionCartPaymentMode('FREE');
    setCollectionCartPriceCents(null);
    setCollectionCartFreePrice(null);
    setCollectionCartCurrencyCode(currencyForCountry((user as any)?.countryCode));
    setCollectionCartLoading(true);
    try {
      const [keeps, offered, payout] = await Promise.all([
        loadOwnPersistedKeeps(1000),
        loadMyOfferedTrackIds(),
        user?.id ? getMyPayoutMethods() : Promise.resolve({ link: '', qrUrl: '' }),
      ]);
      const byTrack = new Map<string, CanonicalTrack>();
      keeps.filter((row) => !row.sourceProfileId).forEach((row) => byTrack.set(row.track.id, row.track));
      setCollectionCartTracks(Array.from(byTrack.values()).reverse());
      setCollectionCartOffered(offered);
      setCollectionCartPayoutLink(payout.link || '');
      setCollectionCartPayoutQrUrl(payout.qrUrl || '');
    } catch (e: any) {
      Alert.alert('Pépites', e?.message || 'Impossible de charger tes morceaux pour le moment.');
      setCollectionCartOpen(false);
    } finally {
      setCollectionCartLoading(false);
    }
  };

  const addCollectionCartTrack = (trackId: string) => {
    setCollectionCartIds((current) => {
      if (current.has(trackId)) return current;
      if (current.size >= 200) {
        Alert.alert('Panier complet', 'Une collection peut contenir au maximum 200 morceaux.');
        return current;
      }
      const next = new Set(current);
      next.add(trackId);
      return next;
    });
  };

  const toggleCollectionCartTrack = (track: CanonicalTrack) => {
    if (collectionCartIds.has(track.id)) {
      setCollectionCartIds((current) => { const next = new Set(current); next.delete(track.id); return next; });
      return;
    }
    const offered = collectionCartOffered[track.id];
    if (offered) {
      Alert.alert(
        'Cette musique est déjà dans une collection active',
        `« ${track.title} » est déjà présente dans « ${offered.playlistName} ». Souhaites-tu quand même l’ajouter à ce panier ?`,
        [
          { text: 'Non', style: 'cancel' },
          { text: 'AJOUTER QUAND MÊME', onPress: () => addCollectionCartTrack(track.id) },
        ],
      );
      return;
    }
    addCollectionCartTrack(track.id);
  };

  const chooseMoneyModeWithTerms = (onAccepted: () => void) => {
    void loadMarketplacePaymentTermsAccepted()
      .then((accepted) => {
        if (accepted) {
          onAccepted();
          return;
        }
        Alert.alert(
          'Conditions de déblocage',
          'Pour recevoir un paiement PayPal via Loki Music, tu dois accepter les règles : vérifier les fonds avant tout déblocage, conserver les preuves et ne jamais valider un paiement non reçu. Un abus peut entraîner un retrait de Free, une suspension ou un bannissement.',
          [
            { text: 'ANNULER', style: 'cancel' },
            { text: 'LIRE LES CONDITIONS', onPress: () => { void Linking.openURL('https://adelkhatra-bit.github.io/KEEP/terms/'); } },
            {
              text: 'J’ACCEPTE',
              onPress: () => {
                void acceptMarketplacePaymentTerms('seller_collection')
                  .then(() => onAccepted())
                  .catch(() => Alert.alert('Conditions', 'Impossible d’enregistrer ton acceptation pour le moment.'));
              },
            },
          ],
        );
      })
      .catch(() => Alert.alert('Conditions', 'Impossible de vérifier ton acceptation pour le moment.'));
  };

  const continueCollectionCart = () => {
    if (collectionCartIds.size < 2) {
      Alert.alert('Panier Pépites', 'Ajoute au moins 2 morceaux avant de continuer.');
      return;
    }
    if (!collectionCartName.trim()) setCollectionCartName(`Ma collection · ${collectionCartIds.size} titres`);
    setCollectionCartStep('REVIEW');
  };

  const confirmCollectionCartReview = () => {
    if (collectionCartIds.size < 2) {
      setCollectionCartStep('TRACKS');
      return;
    }
    setCollectionCartStep('PRICE');
  };

  const continueCollectionCartPrice = async () => {
    const amount = collectionCartPaymentMode === 'FREE' ? collectionCartFreePrice : collectionCartPriceCents;
    if (!amount) {
      Alert.alert('Prix', collectionCartPaymentMode === 'FREE' ? 'Choisis le nombre de FREE demandé.' : 'Choisis le prix dans la devise sélectionnée.');
      return;
    }
    if (collectionCartPaymentMode === 'MONEY') {
      const rawPayout = collectionCartPayoutLink.trim();
      const clean = normalizePayoutLinkInput(rawPayout);
      if (!clean && !collectionCartPayoutQrUrl.trim()) {
        Alert.alert('PayPal requis', 'Ajoute ton pseudo PayPal.Me, ton lien PayPal.Me ou ton QR PayPal avant de publier.');
        return;
      }
      if (clean) {
        let paypalOk = false;
        try {
          const url = new URL(clean);
          const host = url.hostname.toLowerCase().replace(/^www\./, '');
          paypalOk = url.protocol === 'https:' && (host === 'paypal.me' || host === 'paypal.com' || host.endsWith('.paypal.com'));
        } catch {}
        if (!paypalOk) {
          Alert.alert('Lien PayPal non reconnu', 'Utilise un lien sécurisé PayPal, par exemple https://paypal.me/tonpseudo, ou retire le lien et utilise ton QR.');
          return;
        }
        setBusy(true);
        try {
          const saved = await setMyPayoutLink(clean);
          setCollectionCartPayoutLink(saved || clean);
        } catch (e: any) {
          Alert.alert('Paiement', e?.message || 'Impossible d’enregistrer ton lien de paiement.');
          setBusy(false);
          return;
        }
        setBusy(false);
      }
    }
    if (collectionCartPaymentMode === 'MONEY') {
      const accepted = await loadMarketplacePaymentTermsAccepted().catch(() => false);
      if (!accepted) {
        Alert.alert(
          'Conditions des paiements entre utilisateurs',
          'Loki Music ne reçoit pas l’argent. Le paiement est direct entre les deux utilisateurs. Le propriétaire de la collection doit vérifier lui-même les fonds avant tout déblocage. Les abus peuvent entraîner retrait de Free, suspension ou bannissement.',
          [
            { text: 'LIRE LES CONDITIONS', onPress: () => { void Linking.openURL('https://adelkhatra-bit.github.io/KEEP/terms/'); } },
            { text: 'ANNULER', style: 'cancel' },
            {
              text: 'J’ACCEPTE',
              onPress: () => {
                void acceptMarketplacePaymentTerms('playlist_sale_publish')
                  .then(() => setCollectionCartStep('PUBLISH'))
                  .catch(() => Alert.alert('Conditions', 'Impossible d’enregistrer ton acceptation pour le moment.'));
              },
            },
          ],
        );
        return;
      }
    }
    setCollectionCartStep('PUBLISH');
  };

  const publishCollectionCart = async () => {
    if (busy || collectionCartIds.size < 2) return;
    const amount = collectionCartPaymentMode === 'FREE' ? collectionCartFreePrice : collectionCartPriceCents;
    if (!amount) return;
    setBusy(true);
    try {
      // Dernier contrôle côté serveur juste avant publication. Le QR PayPal
      // enregistré est une méthode de paiement valable à lui seul : il ne
      // faut jamais exiger en plus un lien PayPal.Me.
      if (collectionCartPaymentMode === 'MONEY') {
        const payout = await getMyPayoutMethods();
        setCollectionCartPayoutLink(payout.link || '');
        setCollectionCartPayoutQrUrl(payout.qrUrl || '');
        if (!payout.link.trim() && !payout.qrUrl.trim()) {
          setCollectionCartStep('PRICE');
          Alert.alert('Paiement requis', 'Ajoute soit ton lien PayPal.Me, soit ton QR PayPal avant de publier.');
          return;
        }
      }

      const created = await setPlaylistSaleOfferForSelection(
        Array.from(collectionCartIds),
        collectionCartName.trim() || `Ma collection · ${collectionCartIds.size} titres`,
        collectionCartPaymentMode,
        amount,
        collectionCartCurrencyCode,
        collectionCartDuplicateCount > 0,
      );
      await loadData();
      resetCollectionCart();
      const publishedTrackCount = Number(created.trackCount ?? collectionCartIds.size);
      Alert.alert('Pépite publiée', `« ${created.playlistName} » est en ligne avec ${publishedTrackCount} morceau${publishedTrackCount > 1 ? 'x' : ''}. Tu es resté dans Pépites.`);
    } catch (e: any) {
      const raw = String(e?.message || e || '');
      if (raw.includes('SELLER_PAYOUT_NOT_CONFIGURED')) {
        setCollectionCartStep('PRICE');
        Alert.alert('Paiement requis', 'Ajoute soit ton lien PayPal.Me, soit ton QR PayPal avant de publier.');
      } else if (raw.includes('SELLER_PAYOUT_QR_INSECURE')) {
        setCollectionCartStep('PRICE');
        Alert.alert('QR PayPal', 'Ton QR enregistré n’est plus valide. Remplace-le puis republie.');
      } else if (raw.includes('SELLER_PAYOUT_LINK_INSECURE')) {
        setCollectionCartStep('PRICE');
        Alert.alert('Lien PayPal', 'Ton lien PayPal doit être sécurisé en https://, ou utilise uniquement ton QR.');
      } else if (raw.includes('TERMS_ACCEPTANCE_REQUIRED')) {
        setCollectionCartStep('PRICE');
        chooseMoneyModeWithTerms(() => { void publishCollectionCart(); });
      } else {
        Alert.alert('Publication', raw || 'Impossible de publier cette collection.');
      }
    } finally {
      setBusy(false);
    }
  };

  const loadData = async () => {
    if (accountRequired) {
      setAccess(null);
      setOffers([]);
      setSales([]);
      setPurchases([]);
      setTrackRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [liveAccess, liveOffers, liveSales, livePurchases, liveTrackRequests] = await Promise.all([
        getPlaylistSaleAccess(),
        loadMyPlaylistSaleOffers(),
        loadMyPlaylistSales(),
        loadMyPlaylistPurchases(),
        loadMyPlaylistSaleTrackRequests(),
      ]);
      setAccess(liveAccess);
      setOffers(liveOffers);
      setSales(liveSales);
      setPurchases(livePurchases);
      setTrackRequests(liveTrackRequests);
    } catch (e: any) {
      setError(e?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Adel (16-17/09/2026) : "l'utilisateur se fait payer directement" -- une
  // fois payé sur SON lien perso (hors KEEP), le vendeur confirme ici -- ça
  // débloque l'accès de CET acheteur précis (démasquage des morceaux).
  const handleOpenPaymentProof = async (transaction: PlaylistSaleTransaction) => {
    try {
      const url = await openPlaylistPaymentProof(transaction.id);
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Preuve de paiement', e?.message || 'Impossible d’ouvrir la preuve pour le moment.');
    }
  };

  const handleCancelPendingPayment = (transaction: PlaylistSaleTransaction) => {
    if (transaction.buyerMarkedPaidAt || transaction.paymentProofPath) {
      Alert.alert('Transaction déjà engagée', 'Un paiement ou une preuve a déjà été signalé. Tu dois confirmer, refuser ou traiter le litige ; l’annulation simple est bloquée.');
      return;
    }
    Alert.alert(
      'Annuler cette transaction ?',
      `@${transaction.counterpartUsername} sera prévenu immédiatement que tu ne vas pas au bout de « ${transaction.playlistName} ».`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'ANNULER ET PRÉVENIR',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await cancelPlaylistSalePayment(transaction.id);
              await loadData();
              Alert.alert('Transaction annulée', `@${transaction.counterpartUsername} a été prévenu.`);
            } catch (e: any) {
              Alert.alert('Annulation impossible', String(e?.message || 'Impossible d’annuler cette transaction pour le moment.'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleMarkPaid = (transaction: PlaylistSaleTransaction) => {
    if (!transaction.buyerMarkedPaidAt || !transaction.paymentProofPath) {
      Alert.alert(
        'Confirmation impossible',
        'Attends que l’acheteur clique sur « J’AI PAYÉ » et joigne sa preuve. Ensuite vérifie réellement ton compte PayPal avant de confirmer.',
      );
      return;
    }
    Alert.alert(
      'Confirmer la réception du paiement',
      `La preuve jointe est une aide, pas une validation bancaire. Confirme uniquement après avoir vérifié sur TON compte PayPal que ${(transaction.amountCents / 100).toFixed(2).replace('.', ',')} ${transaction.currencyCode} de @${transaction.counterpartUsername} sont réellement reçus. La Pépite "${transaction.playlistName}" sera alors débloquée automatiquement.`,
      [
        { text: 'Annuler', onPress: () => {} },
        {
          text: 'J’ai reçu les fonds',
          onPress: async () => {
            setBusy(true);
            try {
              const delivered = await markPlaylistSalePaid(transaction.id);
              const providerSync = await syncMarketplaceDelivery(transaction.id).catch(() => null);
              await loadData();
              if (!providerSync?.connectedProviders) {
                Alert.alert('Pépite débloquée', `« ${delivered.playlistName} » et ses ${delivered.trackCount} titre${delivered.trackCount > 1 ? 's' : ''} sont maintenant dans le Loki Music de @${transaction.counterpartUsername}. Il pourra choisir Public ou Privé.`);
              } else {
                const complete = providerSync.results.filter((row) => row.status === 'COMPLETE').map((row) => row.provider).join(', ');
                Alert.alert('Pépite débloquée', `Livraison Loki Music terminée${complete ? ` et synchronisée vers ${complete}` : ''}. L’acheteur peut maintenant choisir Public ou Privé.`);
              }
            } catch (e: any) {
              const message = String(e?.message || '');
              Alert.alert(
                'Erreur',
                message.includes('BUYER_HAS_NOT_MARKED_PAID') || message.includes('PAYMENT_PROOF_REQUIRED')
                  ? 'L’acheteur doit d’abord signaler son paiement et joindre une preuve.'
                  : (e?.message || 'Impossible de confirmer ce paiement.'),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    void loadData();
  }, [accountRequired, user?.id]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void loadData();
    });
    return () => unsubscribe?.();
  }, [navigation]);

  const toggleRequestDetails = async (request: PlaylistSaleSellerTrackRequest) => {
    if (expandedRequestId === request.requestId) {
      setExpandedRequestId(null);
      return;
    }
    setExpandedRequestId(request.requestId);
    if (requestTracks[request.requestId]) return;
    setRequestTracksBusyId(request.requestId);
    try {
      const tracks = await loadPlaylistSaleTrackRequestTracks(request.requestId);
      setRequestTracks((current) => ({ ...current, [request.requestId]: tracks }));
      setRequestSelections((current) => ({ ...current, [request.requestId]: new Set(tracks.map((track) => track.trackId)) }));
    } catch {
      setRequestTracks((current) => ({ ...current, [request.requestId]: [] }));
      Alert.alert('Demande', 'Impossible de charger les titres manquants.');
    } finally {
      setRequestTracksBusyId(null);
    }
  };

  const toggleRequestedTrack = (requestId: string, trackId: string) => {
    setRequestSelections((current) => {
      const next = new Set(current[requestId] ?? []);
      if (next.has(trackId)) next.delete(trackId); else next.add(trackId);
      return { ...current, [requestId]: next };
    });
  };

  const answerTrackRequest = async (request: PlaylistSaleSellerTrackRequest, freePrice: number) => {
    if (busy) return;
    const selectedIds = Array.from(requestSelections[request.requestId] ?? []);
    if (!selectedIds.length) {
      Alert.alert('Choisis un titre', 'Sélectionne au moins un morceau à proposer.');
      return;
    }
    setBusy(true);
    try {
      const result = await offerPlaylistSaleRequestSelectionWithFree(request.requestId, selectedIds, freePrice);
      await loadData();
      setExpandedRequestId(null);
      setRequestTracks((current) => { const next = { ...current }; delete next[request.requestId]; return next; });
      setRequestSelections((current) => { const next = { ...current }; delete next[request.requestId]; return next; });
      Alert.alert('Offre envoyée', `@${request.buyerUsername} peut maintenant débloquer ${result.trackCount} morceau${result.trackCount > 1 ? 'x' : ''} pour ${result.freePrice} FREE.`);
    } catch (e: any) {
      Alert.alert('Demande', e?.message || 'Impossible d’envoyer cette offre.');
    } finally {
      setBusy(false);
    }
  };

  const declineTrackRequest = async (request: PlaylistSaleSellerTrackRequest) => {
    if (busy) return;
    setBusy(true);
    try {
      await declinePlaylistSaleTrackRequest(request.requestId);
      await loadData();
    } catch (e: any) {
      Alert.alert('Demande', e?.message || 'Impossible de fermer cette demande.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAccess = async () => {
    if (!editing) return;
    const amount = editing.paymentMode === 'FREE' ? editing.freePrice : editing.priceCents;
    if (!amount) {
      Alert.alert('Montant requis', editing.paymentMode === 'FREE' ? 'Choisis le nombre de FREE demandé.' : 'Choisis un montant en euros.');
      return;
    }
    setBusy(true);
    try {
      await updateOfferPaymentMode(editing.offerId, editing.paymentMode, amount);
      await loadData();
      setEditing(null);
      Alert.alert('Collection mise à jour', editing.paymentMode === 'FREE'
        ? `Accès fixé à ${amount} FREE pour toute la collection.`
        : `Accès fixé à ${(amount / 100).toFixed(2).replace('.', ',')}€ pour toute la collection.`);
    } catch (e: any) {
      Alert.alert('Collection', e?.message || 'Impossible de modifier le mode d’accès.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearPrice = async (playlistId: string) => {
    Alert.alert('Retirer la collection', "La collection ne sera plus proposée. Les personnes qui l'ont déjà débloquée garderont leur accès.", [
      { text: 'Annuler', onPress: () => {} },
      {
        text: 'Désactiver',
        onPress: async () => {
          setBusy(true);
          try {
            await clearPlaylistSalePrice(playlistId);
            await loadData();
            Alert.alert('Succès', 'Collection retirée du profil.');
          } catch (e: any) {
            Alert.alert('Erreur', e?.message || 'Impossible de désactiver.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (marketplaceEnabled === false) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyText}>Bientôt disponible.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (accountRequired || !user) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} accessibilityLabel="Retour">
            <Text style={s.back}>‹</Text>
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.title}>◆ Pépites</Text>
            <Text style={s.subtitle}>Collections exclusives</Text>
          </View>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.empty}>
          <View style={s.guestGateCard}>
            <Text style={s.guestGateEyebrow}>MODE ESSAI</Text>
            <Text style={s.guestGateTitle}>Publier une Pépite</Text>
            <Text style={s.guestGateText}>Tu peux écouter gratuitement. Pour publier une collection exclusive, recevoir des FREE ou un paiement et utiliser les fonctions vendeur, connecte-toi ou crée ton compte.</Text>
            <TouchableOpacity style={s.guestGatePrimary} onPress={() => useAccountGateStore.getState().requestAccount('login')}>
              <Text style={s.guestGatePrimaryText}>SE CONNECTER</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.guestGateSecondary} onPress={() => useAccountGateStore.getState().requestAccount('create')}>
              <Text style={s.guestGateSecondaryText}>CRÉER UN COMPTE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.guestGateBack} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}>
              <Text style={s.guestGateBackText}>‹ RETOUR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => collectionCartOpen ? resetCollectionCart() : (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
          accessibilityLabel={collectionCartOpen ? "Quitter la création de Pépite" : "Retour"}
        >
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>{collectionCartOpen ? 'Créer ma Pépite' : '◆ Pépites'}</Text>
          <Text style={s.subtitle}>
            {collectionCartOpen
              ? `Étape ${collectionCartStep === 'TRACKS' ? '1' : collectionCartStep === 'REVIEW' ? '2' : collectionCartStep === 'PRICE' ? '3' : '4'} sur 4`
              : 'Collections · FREE ou €'}
          </Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        ref={collectionCartScrollRef}
        contentContainerStyle={[s.content, collectionCartOpen && s.contentCollectionFocus]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={s.centerView}>
            <ActivityIndicator color={colors.primaryLight} size="large" />
          </View>
        ) : error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>❌ {error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => void loadData()}>
              <Text style={s.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : !access ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyBoxText}>Impossible de charger les données d'accès.</Text>
          </View>
        ) : (
          <>
            {collectionCartOpen ? (
              <View style={s.collectionCartCard}>
                <View style={s.collectionCartHead}>
                  <View style={{flex:1,minWidth:0}}>
                    <Text style={s.collectionCartEyebrow}>PANIER PÉPITES · ÉTAPE {collectionCartStep === 'TRACKS' ? '1' : collectionCartStep === 'REVIEW' ? '2' : collectionCartStep === 'PRICE' ? '3' : '4'} SUR 4</Text>
                    <Text style={s.collectionCartTitle}>{collectionCartStep === 'TRACKS' ? 'Choisis tes morceaux' : collectionCartStep === 'REVIEW' ? 'Ton panier est prêt' : collectionCartStep === 'PRICE' ? 'Prix & paiement' : 'Dernière vérification'}</Text>
                    <Text style={s.collectionCartHint}>{collectionCartIds.size} morceau{collectionCartIds.size > 1 ? 'x' : ''} dans le panier · tu peux en retirer à tout moment.</Text>
                  </View>
                  <TouchableOpacity style={s.collectionCartClose} onPress={resetCollectionCart} accessibilityLabel="Fermer le panier sans publier"><Text style={s.collectionCartCloseText}>×</Text></TouchableOpacity>
                </View>

                {collectionCartStep === 'TRACKS' ? (
                  <>
                    <TextInput value={collectionCartQuery} onChangeText={setCollectionCartQuery} placeholder="Rechercher un morceau ou un artiste" placeholderTextColor={colors.textMuted} style={s.collectionCartSearch} />
                    {collectionCartLoading ? <ActivityIndicator color={colors.primaryLight} style={{marginVertical:18}} /> : visibleCollectionCartTracks.length ? (
                      <View style={s.collectionCartList}>
                        {visibleCollectionCartTracks.map((track) => {
                          const selected = collectionCartIds.has(track.id);
                          const already = collectionCartOffered[track.id];
                          return (
                            <View key={track.id} style={[s.collectionCartTrack, selected && s.collectionCartTrackOn]}>
                              {track.artworkUrl ? <Image source={{uri:track.artworkUrl}} style={s.collectionCartCover as any} /> : <View style={[s.collectionCartCover,s.collectionCartCoverEmpty]}><Text style={s.collectionCartCoverText}>♪</Text></View>}
                              <View style={s.collectionCartTrackCopy}>
                                <Text style={s.collectionCartTrackTitle} numberOfLines={1}>{track.title}</Text>
                                <Text style={s.collectionCartTrackArtist} numberOfLines={1}>{track.artist}</Text>
                                {already ? <Text style={s.collectionCartAlready}>DÉJÀ EN VENTE · {already.playlistName}</Text> : null}
                              </View>
                              <TouchableOpacity style={[s.collectionCartAction, selected && s.collectionCartRemove]} onPress={() => toggleCollectionCartTrack(track)} accessibilityLabel={selected ? `Retirer ${track.title} du panier` : `Ajouter ${track.title} au panier`}>
                                <Text style={s.collectionCartActionText}>{selected ? 'RETIRER' : '+ PANIER'}</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    ) : <Text style={s.collectionCartEmpty}>Aucun morceau éligible trouvé.</Text>}
                    <Text style={s.collectionCartBottomCount}>{collectionCartIds.size} sélectionné{collectionCartIds.size > 1 ? 's' : ''} · 200 maximum</Text>
                    {collectionCartIds.size >= 2 ? (
                      <View style={s.collectionCartReadyDock}>
                        <View style={s.collectionCartReadyCopy}>
                          <Text style={s.collectionCartReadyEyebrow}>MON PANIER EST PRÊT</Text>
                          <Text style={s.collectionCartReadyTitle}>{collectionCartIds.size} morceaux sélectionnés</Text>
                          <Text style={s.collectionCartReadyHint}>Tu es arrivé en bas : valide ici, sans jamais remonter dans la liste.</Text>
                        </View>
                        <TouchableOpacity style={s.collectionCartReadyButton} onPress={continueCollectionCart} accessibilityLabel="J’ai fini ma sélection, ouvrir mon panier">
                          <Text style={s.collectionCartReadyButtonTitle}>J’AI FINI MA SÉLECTION</Text>
                          <Text style={s.collectionCartReadyButtonHint}>OUVRIR MON PANIER →</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={s.collectionCartNeedMore}>
                        <Text style={s.collectionCartNeedMoreText}>Choisis au moins 2 morceaux. La validation apparaîtra ici, en bas de ta sélection.</Text>
                      </View>
                    )}
                  </>
                ) : collectionCartStep === 'REVIEW' ? (
                  <>
                    <View style={s.collectionCartReviewHero}>
                      <Text style={s.collectionCartReviewHeroEyebrow}>TA SÉLECTION</Text>
                      <Text style={s.collectionCartReviewHeroTitle}>{collectionCartIds.size} morceau{collectionCartIds.size > 1 ? 'x' : ''} dans ton panier</Text>
                      <Text style={s.collectionCartReviewHeroHint}>Aucun prix n’est demandé tant que tu n’as pas confirmé cette sélection.</Text>
                    </View>

                    <View style={s.collectionCartReviewStats}>
                      <View style={s.collectionCartReviewStat}><Text style={s.collectionCartReviewStatValue}>{collectionCartIds.size}</Text><Text style={s.collectionCartReviewStatLabel}>TOTAL</Text></View>
                      <View style={s.collectionCartReviewDivider} />
                      <View style={s.collectionCartReviewStat}><Text style={[s.collectionCartReviewStatValue, collectionCartDuplicateCount > 0 && s.collectionCartReviewStatWarn]}>{collectionCartDuplicateCount}</Text><Text style={s.collectionCartReviewStatLabel}>DÉJÀ EN VENTE</Text></View>
                      <View style={s.collectionCartReviewDivider} />
                      <View style={s.collectionCartReviewStat}><Text style={s.collectionCartReviewStatValue}>{Math.max(0, collectionCartIds.size - collectionCartDuplicateCount)}</Text><Text style={s.collectionCartReviewStatLabel}>NOUVEAUX</Text></View>
                    </View>

                    <View style={s.collectionCartReviewList}>
                      {selectedCollectionCartTracks.slice(0, 8).map((track, index) => (
                        <View key={track.id} style={s.collectionCartReviewTrack}>
                          <Text style={s.collectionCartReviewTrackNo}>{String(index + 1).padStart(2, '0')}</Text>
                          {track.artworkUrl ? <Image source={{uri:track.artworkUrl}} style={s.collectionCartReviewCover as any} /> : <View style={[s.collectionCartReviewCover,s.collectionCartCoverEmpty]}><Text style={s.collectionCartCoverText}>♪</Text></View>}
                          <View style={s.collectionCartReviewTrackCopy}>
                            <Text style={s.collectionCartReviewTrackTitle} numberOfLines={1}>{track.title}</Text>
                            <Text style={s.collectionCartReviewTrackArtist} numberOfLines={1}>{track.artist}</Text>
                          </View>
                          {collectionCartOffered[track.id] ? <Text style={s.collectionCartReviewExisting}>DÉJÀ EN VENTE</Text> : <Text style={s.collectionCartReviewOk}>OK</Text>}
                        </View>
                      ))}
                      {selectedCollectionCartTracks.length > 8 ? <Text style={s.collectionCartReviewMore}>+ {selectedCollectionCartTracks.length - 8} autre{selectedCollectionCartTracks.length - 8 > 1 ? 's' : ''}</Text> : null}
                    </View>

                    {collectionCartDuplicateCount > 0 ? <View style={s.collectionCartReviewNotice}><Text style={s.collectionCartReviewNoticeTitle}>AUCUN DOUBLON CRÉÉ</Text><Text style={s.collectionCartReviewNoticeText}>Les morceaux déjà proposés ailleurs restent référencés une seule fois dans Loki. Ils peuvent appartenir à plusieurs Pépites sans dupliquer la musique.</Text></View> : null}

                    <TouchableOpacity style={s.collectionCartReviewConfirm} onPress={confirmCollectionCartReview}>
                      <Text style={s.collectionCartReviewConfirmTitle}>OUI, MA SÉLECTION EST TERMINÉE</Text>
                      <Text style={s.collectionCartReviewConfirmHint}>Continuer vers FREE ou paiement en devise →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.collectionCartReviewEdit} onPress={() => setCollectionCartStep('TRACKS')}><Text style={s.collectionCartReviewEditText}>MODIFIER MON PANIER</Text></TouchableOpacity>
                  </>
                ) : collectionCartStep === 'PRICE' ? (
                  <>
                    <Text style={s.collectionCartFieldLabel}>NOM DE LA COLLECTION</Text>
                    <TextInput value={collectionCartName} onChangeText={setCollectionCartName} style={s.collectionCartInput} maxLength={100} />
                    <Text style={s.collectionCartFieldLabel}>MODE DE PAIEMENT</Text>
                    <View style={s.collectionCartModeRow}>
                      <TouchableOpacity style={[s.collectionCartMode, collectionCartPaymentMode === 'FREE' && s.collectionCartModeOn]} onPress={() => setCollectionCartPaymentMode('FREE')}><Text style={s.collectionCartModeText}>⚡ FREE</Text></TouchableOpacity>
                      <TouchableOpacity style={[s.collectionCartMode, collectionCartPaymentMode === 'MONEY' && s.collectionCartModeOn]} onPress={() => chooseMoneyModeWithTerms(() => setCollectionCartPaymentMode('MONEY'))}><Text style={s.collectionCartModeText}>PayPal · DEVISE</Text></TouchableOpacity>
                    </View>
                    {collectionCartPaymentMode === 'MONEY' ? (
                      <>
                        <Text style={s.collectionCartFieldLabel}>DEVISE</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.collectionCartCurrencyRow}>
                          {MARKETPLACE_CURRENCIES.map((currency) => (
                            <TouchableOpacity key={currency.code} style={[s.collectionCartCurrencyChip, collectionCartCurrencyCode === currency.code && s.collectionCartCurrencyChipOn]} onPress={() => setCollectionCartCurrencyCode(currency.code)}>
                              <Text style={[s.collectionCartCurrencyText, collectionCartCurrencyCode === currency.code && s.collectionCartCurrencyTextOn]}>{currency.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                    <View style={s.collectionCartPresetGrid}>
                      {(collectionCartPaymentMode === 'FREE' ? SALE_PRESET_FREE : SALE_PRESET_PRICES_CENTS).map((amount) => {
                        const selected = collectionCartPaymentMode === 'FREE' ? collectionCartFreePrice === amount : collectionCartPriceCents === amount;
                        return <TouchableOpacity key={`${collectionCartPaymentMode}:${amount}`} style={[s.collectionCartPreset, selected && s.collectionCartPresetOn]} onPress={() => collectionCartPaymentMode === 'FREE' ? setCollectionCartFreePrice(amount) : setCollectionCartPriceCents(amount)}><Text style={s.collectionCartPresetText}>{collectionCartPaymentMode === 'FREE' ? `${amount} FREE` : `${(amount/100).toFixed(2).replace('.',',')} ${collectionCartCurrencyCode}`}</Text></TouchableOpacity>;
                      })}
                    </View>
                    {collectionCartPaymentMode === 'MONEY' ? (
                      <View style={s.collectionCartPayout}>
                        <Text style={s.collectionCartFieldLabel}>{collectionCartPayoutLink.trim() ? 'PAYPAL DÉJÀ ENREGISTRÉ' : 'TON LIEN PAYPAL.ME'}</Text>
                        <TextInput value={collectionCartPayoutLink} onChangeText={setCollectionCartPayoutLink} autoCapitalize="none" autoCorrect={false} placeholder="Pseudo PayPal.Me ou https://paypal.me/tonpseudo" placeholderTextColor={colors.textMuted} style={s.collectionCartInput} />
                        <View style={s.collectionCartPayoutActions}>
                          <TouchableOpacity style={s.collectionCartSecondary} onPress={() => { void Linking.openURL('https://www.paypal.com/paypalme/'); }}><Text style={s.collectionCartSecondaryText}>OUVRIR PAYPAL.ME</Text></TouchableOpacity>
                          <TouchableOpacity style={s.collectionCartSecondary} disabled={!collectionCartPayoutLink.trim() || busy} onPress={async () => { try { const saved=await setMyPayoutLink(collectionCartPayoutLink.trim()); setCollectionCartPayoutLink(saved || collectionCartPayoutLink.trim()); Alert.alert('Paiement','Lien enregistré. Il sera prérempli la prochaine fois.'); } catch(e:any) { Alert.alert('Paiement',e?.message || 'Impossible d’enregistrer le lien.'); } }}><Text style={s.collectionCartSecondaryText}>ENREGISTRER PAYPAL</Text></TouchableOpacity>
                        </View>
                        {user?.id ? <PayPalQrPayoutControl profileId={user.id} qrUrl={collectionCartPayoutQrUrl} onChange={setCollectionCartPayoutQrUrl} disabled={busy} /> : null}
                        <Text style={s.collectionCartPayoutHint}>PayPal.Me est conseillé sur le même téléphone. Le QR reste disponible comme solution de secours.</Text>
                      </View>
                    ) : null}
                    <View style={s.collectionCartFooter}>
                      <TouchableOpacity style={s.collectionCartBackStep} onPress={() => setCollectionCartStep('REVIEW')}><Text style={s.collectionCartBackStepText}>REVOIR LE PANIER</Text></TouchableOpacity>
                      <TouchableOpacity style={s.collectionCartContinue} onPress={() => { void continueCollectionCartPrice(); }}><Text style={s.collectionCartContinueText}>VALIDER LE PRIX</Text></TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={s.collectionCartReview}>
                      <Text style={s.collectionCartReviewTitle}>{collectionCartName.trim() || `Ma collection · ${collectionCartIds.size} titres`}</Text>
                      <Text style={s.collectionCartReviewLine}>{collectionCartIds.size} morceaux</Text>
                      <Text style={s.collectionCartReviewLine}>{collectionCartPaymentMode === 'FREE' ? `${collectionCartFreePrice} FREE` : `${((collectionCartPriceCents || 0)/100).toFixed(2).replace('.',',')} ${collectionCartCurrencyCode}`}</Text>
                      {collectionCartDuplicateCount ? <Text style={s.collectionCartReviewWarn}>{collectionCartDuplicateCount} morceau{collectionCartDuplicateCount > 1 ? 'x' : ''} déjà en vente resteront aussi dans leurs collections actuelles.</Text> : null}
                    </View>
                    <View style={s.collectionCartFooter}>
                      <TouchableOpacity style={s.collectionCartBackStep} disabled={busy} onPress={() => setCollectionCartStep('PRICE')}><Text style={s.collectionCartBackStepText}>MODIFIER</Text></TouchableOpacity>
                      <TouchableOpacity style={s.collectionCartPublish} disabled={busy} onPress={() => { void publishCollectionCart(); }}>{busy ? <ActivityIndicator color={colors.background} /> : <Text style={s.collectionCartPublishText}>PUBLIER LA PÉPITE</Text>}</TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ) : null}

            {!collectionCartOpen ? <>
            {/* Accès */}
            <View style={[s.accessCard, access.unlocked && s.accessCardUnlocked]}>
              <Text style={s.accessEyebrow}>CRÉER UNE COLLECTION</Text>
              <View style={s.accessRow}>
                <View style={s.accessStat}>
                  <Text style={s.accessValue}>{access.followers}</Text>
                  <Text style={s.accessLabel}>Abonnés</Text>
                </View>
                <View style={s.accessSeparator} />
                <View style={s.accessStat}>
                  <Text style={s.accessValue}>{access.threshold}</Text>
                  <Text style={s.accessLabel}>Seuil requis</Text>
                </View>
                <View style={s.accessSeparator} />
                <View style={s.accessStat}>
                  <Text style={access.unlocked ? s.accessValueGreen : s.accessValueRed}>{access.unlocked ? '✓' : '✗'}</Text>
                  <Text style={s.accessLabel}>{access.unlocked ? 'Débloquée' : 'Verrouillée'}</Text>
                </View>
              </View>
              {!access.unlocked ? (
                <>
                  <Text style={s.accessHint}>
                    🔒 Il te manque {Math.max(access.threshold - access.followers, 0)} abonné{Math.max(access.threshold - access.followers, 0) > 1 ? 's' : ''}. Fais grandir ta communauté pour débloquer la publication.
                  </Text>
                  <Text style={s.accessBenefit}>Une collection = un nom + plusieurs morceaux. En € : paiement direct. En FREE : déblocage dans la communauté.</Text>
                  <TouchableOpacity
                    style={[s.createCollectionBtn, s.createCollectionBtnLocked]}
                    onPress={() => Alert.alert('Collections verrouillées', `Atteins ${access.threshold} abonnés pour publier. Tu en as ${access.followers}. Une fois débloqué, tu pourras choisir € ou FREE pour toute la collection.`)}
                    accessibilityLabel="Voir comment débloquer la création de collections"
                  >
                    <Text style={s.createCollectionBtnText}>🔒 CRÉER UNE COLLECTION</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.accessBenefit}>Parcours simple : 1. choisis tes morceaux · 2. vérifie ton panier · 3. choisis FREE ou une devise · 4. publie.</Text>
                  <Text style={s.collectionLimitText}>Collections actives : {access.activeOffers} / {access.maxActiveOffers} · 200 morceaux maximum</Text>
                  <TouchableOpacity
                    style={[s.createCollectionBtn, activeLimitReached && s.createCollectionBtnLocked]}
                    onPress={() => activeLimitReached
                      ? Alert.alert('Limite atteinte', `Tu as déjà ${access.maxActiveOffers} collections actives. Retire une ancienne collection avant d'en publier une nouvelle.`)
                      : void openCollectionCart()}
                    accessibilityLabel={activeLimitReached ? "Limite de collections actives atteinte" : "Créer une nouvelle collection exclusive"}
                  >
                    <Text style={s.createCollectionBtnText}>{activeLimitReached ? 'LIMITE DE COLLECTIONS ATTEINTE' : '＋ CRÉER UNE COLLECTION'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={s.modeDashboard}>
              <View style={s.modeDashboardHead}>
                <View>
                  <Text style={s.modeDashboardEyebrow}>TES COLLECTIONS PUBLIÉES</Text>
                  <Text style={s.modeDashboardTitle}>{published.length} collection{published.length > 1 ? 's' : ''}</Text>
                </View>
                <View style={s.modeCounts}>
                  <Text style={s.modeCountFree}>⚡ {freePublished.length} FREE</Text>
                  <Text style={s.modeCountMoney}>€ {moneyPublished.length} EUROS</Text>
                </View>
              </View>
              <View style={s.modeTabs}>
                {([
                  ['ALL', 'TOUTES', published.length],
                  ['FREE', '⚡ FREE', freePublished.length],
                  ['MONEY', '€ EUROS', moneyPublished.length],
                ] as const).map(([key, label, count]) => (
                  <TouchableOpacity key={key} style={[s.modeTab, offerFilter === key && s.modeTabOn]} onPress={() => setOfferFilter(key)} accessibilityRole="button" accessibilityState={{ selected: offerFilter === key }}>
                    <Text style={[s.modeTabText, offerFilter === key && s.modeTabTextOn]}>{label} · {count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.modeDashboardHint}>{offerFilter === 'FREE' ? 'Collections débloquées avec des FREE Loki Music.' : offerFilter === 'MONEY' ? 'Collections en euros avec paiement direct sur le lien personnel du propriétaire.' : 'Filtre tes collections sans mélanger FREE et argent réel.'}</Text>
            </View>
            {/* Adel (21/09/2026, décision 2) : encart permanent -- le
                fonctionnement reste manuel tant que l'API de paiement
                réelle n'est pas intégrée. Le vendeur doit comprendre AVANT
                de confirmer un déblocage que c'est lui, et lui seul, qui
                certifie avoir reçu l'argent. */}
            {marketplaceTransactionEnabled ? (
              <View style={s.manualNotice}>
                <Text style={s.manualNoticeTitle}>ℹ️ Fonctionnement actuel : confirmation manuelle</Text>
                <Text style={s.manualNoticeText}>Loki Music n'encaisse jamais et ne vérifie pas les paiements externes. Confirme « Paiement reçu » uniquement après avoir réellement reçu l'argent sur ton lien personnel : cette confirmation débloque toute la collection pour l'acheteur.</Text>
              </View>
            ) : (
              <View style={s.manualNotice}>
                <Text style={s.manualNoticeTitle}>GESTION DES COLLECTIONS ACTIVE</Text>
                <Text style={s.manualNoticeText}>Tu peux créer et organiser tes collections, modifier les morceaux et choisir € / FREE. Les paiements externes restent désactivés dans cette version mobile.</Text>
              </View>
            )}

            {/* Offres Actives */}
            {published.length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>{offerFilter === 'FREE' ? 'COLLECTIONS FREE' : offerFilter === 'MONEY' ? 'COLLECTIONS EN EUROS' : 'TOUTES LES COLLECTIONS'} ({filteredPublished.length})</Text>
                <Text style={s.sectionHint}>Chaque carte est un lot complet. FREE et euros sont séparés visuellement.</Text>
                {filteredPublished.length ? <FlatList
                  scrollEnabled={false}
                  data={filteredPublished}
                  keyExtractor={(item) => item.offerId || item.playlistId}
                  renderItem={({ item }) => (
                    <View style={[s.offerCard, item.paymentMode === 'FREE' ? s.offerCardFree : s.offerCardMoney, focusOfferId && (item.offerId === focusOfferId || item.playlistId === focusOfferId) && s.offerCardFocus]}>
                      <View style={s.offerTop}>
                        <View style={s.offerInfo}>
                          <Text style={s.offerName}>{item.playlistName}</Text>
                          <Text style={s.offerPrice}>
                            {item.paymentMode === 'FREE'
                              ? `${item.freePrice ?? 0} FREE`
                              : item.currencyCode === 'EUR'
                                ? `${(item.priceCents / 100).toFixed(2).replace('.', ',')} €`
                                : `${(item.priceCents / 100).toFixed(2).replace('.', ',')} ${item.currencyCode}`}
                          </Text>
                          {item.genres?.length ? <Text style={s.offerDate}>{item.genres.slice(0, 4).join(' · ')}</Text> : null}
                          <Text style={s.offerDate}>{item.trackCount ?? 0} morceau{(item.trackCount ?? 0) > 1 ? 'x' : ''} dans ce lot</Text>
                        </View>
                        <View style={[s.offerBadge, item.paymentMode === 'FREE' ? s.offerBadgeFree : s.offerBadgeMoney]}>
                          <Text style={s.offerBadgeText}>{item.paymentMode === 'FREE' ? '⚡ FREE' : 'PAYPAL'}</Text>
                        </View>
                      </View>
                      <Text style={s.offerDate}>Mise à jour: {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
                      <View style={s.offerActions}>
                        <TouchableOpacity
                          style={s.manageTracksBtn}
                          disabled={busy}
                          onPress={() => navigation.navigate('Main', {
                            screen: 'MyMusic',
                            params: {
                              manageSaleOfferId: item.offerId || item.playlistId,
                              manageSaleOfferName: item.playlistName,
                            },
                          })}
                          accessibilityLabel={`Modifier les musiques de ${item.playlistName}`}
                        >
                          <Text style={s.manageTracksBtnText}>✎ MODIFIER</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.editBtn}
                          disabled={busy}
                          onPress={() => setEditing({
                            offerId: item.offerId || '',
                            playlistId: item.playlistId,
                            playlistName: item.playlistName,
                            paymentMode: item.paymentMode === 'FREE' ? 'FREE' : 'MONEY',
                            priceCents: item.priceCents,
                            freePrice: item.freePrice ?? null,
                          })}
                          accessibilityLabel={`Modifier le mode d’accès de ${item.playlistName}`}
                        >
                          <Text style={s.editBtnText}>€ / FREE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.removeBtn}
                          disabled={busy}
                          onPress={() => void handleClearPrice(item.playlistId)}
                          accessibilityLabel={`Retirer ${item.playlistName} des collections publiées`}
                        >
                          <Text style={s.removeBtnText}>✕ Retirer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                /> : <View style={s.filterEmpty}><Text style={s.filterEmptyTitle}>Aucune collection dans ce mode</Text><Text style={s.filterEmptyText}>Change de filtre ou crée une nouvelle collection.</Text></View>}
              </View>
            )}

            {/* Collections retirées : visibles ICI seulement (jamais sur le
                profil ni pour les visiteurs), repliées par défaut. */}
            {retired.length > 0 && (
              <View style={s.offersSection}>
                <TouchableOpacity style={s.retiredToggle} onPress={() => setRetiredOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: retiredOpen }} accessibilityLabel={`${retiredOpen ? 'Masquer' : 'Afficher'} les ${retired.length} collections retirées`}>
                  <Text style={s.sectionTitle}>RETIRÉES ({retired.length})</Text>
                  <Text style={s.retiredToggleIcon}>{retiredOpen ? '˄' : '˅'}</Text>
                </TouchableOpacity>
                {retiredOpen ? <Text style={s.sectionHint}>Non visibles sur ton profil ni par les visiteurs.</Text> : null}
                {retiredOpen ? retired.map((item) => (
                  <View key={item.offerId || item.playlistId} style={[s.offerCard, s.offerCardRetired]}>
                    <View style={s.offerTop}>
                      <View style={s.offerInfo}>
                        <Text style={s.offerName}>{item.playlistName}</Text>
                        <Text style={s.offerDate}>{item.trackCount ?? 0} morceau{(item.trackCount ?? 0) > 1 ? 'x' : ''} · retirée le {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
                      </View>
                      <View style={[s.offerBadge, s.offerBadgeRetired]}>
                        <Text style={[s.offerBadgeText, s.offerBadgeTextRetired]}>RETIRÉE</Text>
                      </View>
                    </View>
                  </View>
                )) : null}
              </View>
            )}

            {trackRequests.length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>DEMANDES PERSONNALISÉES ({trackRequests.length})</Text>
                <Text style={s.sectionHint}>Ils ont déjà une partie de ta collection. Choisis le prix des titres manquants.</Text>
                {trackRequests.map((request) => (
                  <View key={request.requestId} style={[s.offerCard, s.requestCard]}>
                    <View style={s.requestTop}>
                      <View style={s.offerInfo}>
                        <Text style={s.offerName}>@{request.buyerUsername}</Text>
                        <Text style={s.requestMeta}>{request.missingCount} manquant{request.missingCount > 1 ? 's' : ''} · {request.playlistName}</Text>
                      </View>
                      <TouchableOpacity style={s.requestDecline} disabled={busy} onPress={() => { void declineTrackRequest(request); }} accessibilityLabel="Refuser cette demande"><Text style={s.requestDeclineText}>×</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity style={s.requestChoose} disabled={busy} onPress={() => { void toggleRequestDetails(request); }}>
                      <Text style={s.requestChooseText}>{expandedRequestId === request.requestId ? 'MASQUER LES TITRES' : `CHOISIR LES ${request.missingCount} TITRE${request.missingCount > 1 ? 'S' : ''}`}</Text>
                      <Text style={s.requestChooseArrow}>{expandedRequestId === request.requestId ? '⌃' : '⌄'}</Text>
                    </TouchableOpacity>
                    {expandedRequestId === request.requestId ? (
                      <View style={s.requestDetails}>
                        {requestTracksBusyId === request.requestId ? <ActivityIndicator color={colors.primaryLight} /> : (requestTracks[request.requestId] ?? []).map((track) => {
                          const selected = requestSelections[request.requestId]?.has(track.trackId) ?? false;
                          return (
                            <TouchableOpacity key={track.trackId} style={[s.requestTrackRow, selected && s.requestTrackRowOn]} onPress={() => toggleRequestedTrack(request.requestId, track.trackId)}>
                              {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.requestTrackCover as any} /> : <View style={[s.requestTrackCover,s.requestTrackCoverEmpty]}><Text style={s.requestTrackCoverText}>♪</Text></View>}
                              <View style={s.requestTrackCopy}><Text style={s.requestTrackTitle} numberOfLines={1}>{track.title}</Text><Text style={s.requestTrackArtist} numberOfLines={1}>{track.artist}</Text></View>
                              <View style={[s.requestCheck, selected && s.requestCheckOn]}><Text style={s.requestCheckText}>{selected ? '✓' : ''}</Text></View>
                            </TouchableOpacity>
                          );
                        })}
                        {(requestTracks[request.requestId] ?? []).length ? (
                          <>
                            <Text style={s.requestSelectionCount}>{requestSelections[request.requestId]?.size ?? 0} sélectionné{(requestSelections[request.requestId]?.size ?? 0) > 1 ? 's' : ''}</Text>
                            <View style={s.requestPriceRow}>
                              {SALE_PRESET_FREE.slice(0, 4).map((amount) => (
                                <TouchableOpacity key={amount} style={s.requestPrice} disabled={busy || !(requestSelections[request.requestId]?.size)} onPress={() => { void answerTrackRequest(request, amount); }}>
                                  <Text style={s.requestPriceText}>{amount} FREE</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* Ventes en attente de confirmation -- l'acheteur a déjà cliqué
                Acheter (payé ou en train de payer sur le lien du vendeur) */}
            {marketplaceTransactionEnabled && sales.filter((s2) => s2.status === 'PENDING').length > 0 && (
              <View style={s.offersSection}>
                <Text style={s.sectionTitle}>DÉBLOCAGES EN ATTENTE ({sales.filter((s2) => s2.status === 'PENDING').length})</Text>
                {sales.filter((s2) => s2.status === 'PENDING').map((sale) => (
                  <View key={sale.id} style={s.offerCard}>
                    <View style={s.offerTop}>
                      <View style={s.offerInfo}>
                        <Text style={s.offerName}>@{sale.counterpartUsername} · {sale.playlistName}</Text>
                        <Text style={s.offerPrice}>{transactionAmountLabel(sale, 'NEUTRAL')}</Text>
                      </View>
                    </View>
                    <Text style={s.offerDate}>Demandé le {new Date(sale.createdAt).toLocaleDateString('fr-FR')}</Text>
                    <Text style={[s.historyStatus, sale.buyerMarkedPaidAt ? s.historyStatusDone : s.historyStatusPending]}>
                      {sale.buyerMarkedPaidAt
                        ? `✓ @${sale.counterpartUsername} indique avoir payé${sale.paymentProofName ? ` · preuve : ${sale.paymentProofName}` : ''}`
                        : `⏳ @${sale.counterpartUsername} n’a pas encore signalé son paiement`}
                    </Text>
                    {sale.paymentProofPath ? (
                      <TouchableOpacity style={s.manageTracksBtn} disabled={busy} onPress={() => { void handleOpenPaymentProof(sale); }}>
                        <Text style={s.manageTracksBtnText}>VOIR LA PREUVE DE PAIEMENT</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={[s.editBtn, (!sale.buyerMarkedPaidAt || !sale.paymentProofPath) && s.pendingConfirmDisabled]} disabled={busy || !sale.buyerMarkedPaidAt || !sale.paymentProofPath} onPress={() => handleMarkPaid(sale)}>
                      <Text style={s.editBtnText}>{sale.buyerMarkedPaidAt && sale.paymentProofPath ? '✓ J’AI REÇU LES FONDS · DÉBLOQUER' : 'EN ATTENTE DE LA PREUVE ACHETEUR'}</Text>
                    </TouchableOpacity>
                    {!sale.buyerMarkedPaidAt && !sale.paymentProofPath ? (
                      <TouchableOpacity style={s.removeBtn} disabled={busy} onPress={() => handleCancelPendingPayment(sale)} accessibilityLabel="Annuler cette transaction et prévenir l’acheteur">
                        <Text style={s.removeBtnText}>ANNULER LA TRANSACTION · PRÉVENIR</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* Message si verrouillé */}
            {!access.unlocked && (
              <View style={s.lockedBox}>
                <Text style={s.lockedTitle}>🔒 Collections verrouillées</Text>
                <Text style={s.lockedText}>
                  Tu dois avoir au moins {access.threshold} abonnés pour publier des collections exclusives. Partage ton profil et développe ta communauté !
                </Text>
              </View>
            )}

            {/* Message si accès mais pas d'offres */}
            {access.unlocked && published.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyBoxTitle}>Aucune collection exclusive publiée</Text>
                <Text style={s.emptyBoxText}>Commence par sélectionner plusieurs morceaux et crée ta première collection exclusive.</Text>
              </View>
            )}

            {(sales.length + purchases.length > 0) && (
              <View style={s.offersSection}>
                <TouchableOpacity
                  style={s.historyToggle}
                  onPress={() => setHistoryOpen((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: historyOpen }}
                  accessibilityLabel={historyOpen ? 'Masquer l’historique Pépites' : 'Voir l’historique Pépites'}
                >
                  <View style={s.historyToggleCopy}>
                    <Text style={s.historyToggleKicker}>PÉPITES</Text>
                    <Text style={s.historyToggleTitle}>Voir l’historique</Text>
                    <Text style={s.historyToggleMeta}>{sales.length} accès proposé{sales.length > 1 ? 's' : ''} · {purchases.length} accès obtenu{purchases.length > 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={s.historyToggleIcon}>{historyOpen ? '˄' : '˅'}</Text>
                </TouchableOpacity>

                {historyOpen ? (
                  <View style={s.historyList}>
                    {sales.map((sale) => (
                      <View key={`sale:${sale.id}`} style={[s.offerCard, s.historyCard, focusPaymentId === sale.id && s.historyCardFocused]}>
                        <View style={s.historyTop}>
                          <View style={s.offerInfo}>
                            <Text style={s.historyDirection}>VENTE · @{sale.counterpartUsername}</Text>
                            <Text style={s.offerName}>{sale.playlistName}</Text>
                          </View>
                          <View style={[s.offerBadge, sale.paymentMode === 'FREE' ? s.offerBadgeFree : s.offerBadgeMoney]}>
                            <Text style={s.offerBadgeText}>{sale.paymentMode === 'FREE' ? '⚡ FREE' : '€'}</Text>
                          </View>
                        </View>
                        <Text style={s.offerPrice}>{transactionAmountLabel(sale, 'RECEIVED')}</Text>
                        <Text style={s.historyDate}>{new Date(sale.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                        {transactionFreeBalanceLabel(sale) ? <Text style={s.historyDetail}>{transactionFreeBalanceLabel(sale)}</Text> : null}
                        <Text style={[s.historyStatus, sale.status === 'COMPLETED' ? s.historyStatusDone : s.historyStatusPending]}>
                          {sale.status === 'COMPLETED' ? '✓ Vente terminée · musique débloquée' : '⏳ Paiement à confirmer'}
                        </Text>
                      </View>
                    ))}
                    {purchases.map((purchase) => (
                      <View key={`purchase:${purchase.id}`} style={[s.offerCard, s.historyCard, focusPaymentId === purchase.id && s.historyCardFocused]}>
                        <View style={s.historyTop}>
                          <View style={s.offerInfo}>
                            <Text style={s.historyDirection}>ACHAT · @{purchase.counterpartUsername}</Text>
                            <Text style={s.offerName}>{purchase.playlistName}</Text>
                          </View>
                          <View style={[s.offerBadge, purchase.paymentMode === 'FREE' ? s.offerBadgeFree : s.offerBadgeMoney]}>
                            <Text style={s.offerBadgeText}>{purchase.paymentMode === 'FREE' ? '⚡ FREE' : '€'}</Text>
                          </View>
                        </View>
                        <Text style={s.offerPrice}>{transactionAmountLabel(purchase, 'SPENT')}</Text>
                        <Text style={s.historyDate}>{new Date(purchase.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</Text>
                        {transactionFreeBalanceLabel(purchase) ? <Text style={s.historyDetail}>{transactionFreeBalanceLabel(purchase)}</Text> : null}
                        <Text style={[s.historyStatus, purchase.status === 'COMPLETED' ? s.historyStatusDone : s.historyStatusPending]}>
                          {purchase.status === 'COMPLETED' ? '✓ Collection débloquée dans Loki Music' : '⏳ En attente de confirmation du propriétaire'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
            </> : null}
          </>
        )}
      </ScrollView>

      {/* Modal d'édition de prix */}
      {editing && (
        <View style={s.modal}>
          <TouchableOpacity style={s.modalOverlay} onPress={() => setEditing(null)} />
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Mode de déblocage</Text>
            <Text style={s.modalSubtitle}>{editing.playlistName}</Text>
            <Text style={s.sectionHint}>Un seul montant débloque tous les morceaux de cette collection.</Text>
            <View style={s.pricePresetGrid}>
              <TouchableOpacity
                style={[s.pricePreset, editing.paymentMode === 'MONEY' && s.pricePresetSelected]}
                disabled={busy}
                onPress={() => chooseMoneyModeWithTerms(() => setEditing({ ...editing, paymentMode: 'MONEY' }))}
              >
                <Text style={[s.pricePresetText, editing.paymentMode === 'MONEY' && s.pricePresetTextSelected]}>€ EUROS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.pricePreset, editing.paymentMode === 'FREE' && s.pricePresetSelected]}
                disabled={busy}
                onPress={() => setEditing({ ...editing, paymentMode: 'FREE' })}
              >
                <Text style={[s.pricePresetText, editing.paymentMode === 'FREE' && s.pricePresetTextSelected]}>⚡ FREE</Text>
              </TouchableOpacity>
            </View>
            <View style={s.pricePresetGrid}>
              {(editing.paymentMode === 'FREE' ? SALE_PRESET_FREE : SALE_PRESET_PRICES_CENTS).map((amount) => {
                const selected = editing.paymentMode === 'FREE' ? editing.freePrice === amount : editing.priceCents === amount;
                return (
                  <TouchableOpacity
                    key={`${editing.paymentMode}:${amount}`}
                    style={[s.pricePreset, selected && s.pricePresetSelected]}
                    disabled={busy}
                    onPress={() => setEditing(editing.paymentMode === 'FREE'
                      ? { ...editing, freePrice: amount }
                      : { ...editing, priceCents: amount })}
                  >
                    <Text style={[s.pricePresetText, selected && s.pricePresetTextSelected]}>
                      {editing.paymentMode === 'FREE' ? `${amount} FREE` : `${(amount / 100).toFixed(2).replace('.', ',')} €`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                disabled={busy}
                onPress={() => setEditing(null)}
              >
                <Text style={s.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalSaveBtn}
                disabled={busy || (editing.paymentMode === 'FREE' ? !editing.freePrice : !editing.priceCents)}
                onPress={() => void handleUpdateAccess()}
              >
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={s.modalSaveBtnText}>ENREGISTRER</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.textPrimary, fontSize: 36, lineHeight: 40, width: 42 },
  headerText: { flex: 1, alignItems: 'center' },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '800', marginTop: 2 },
  headerSpacer: { width: 42 },
  historyLink: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  historyLinkText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  contentCollectionFocus:{paddingTop:12,paddingHorizontal:12,paddingBottom:28,gap:0},
  collectionLimitText: { color: colors.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  collectionCartCard:{width:'100%',borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:14,gap:10},
  collectionCartHead:{flexDirection:'row',alignItems:'flex-start',gap:10},collectionCartEyebrow:{color:colors.keep,fontSize:9,fontWeight:'900',letterSpacing:1},collectionCartTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',marginTop:4},collectionCartHint:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:4},
  collectionCartClose:{width:40,height:40,borderRadius:20,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},collectionCartCloseText:{color:colors.textPrimary,fontSize:24,lineHeight:26},
  collectionCartSearch:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,color:colors.textPrimary,paddingHorizontal:12,fontSize:12,fontWeight:'700'},
  collectionCartList:{gap:7},collectionCartTrack:{minHeight:66,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:8,flexDirection:'row',alignItems:'center',gap:9},collectionCartTrackOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.08)'},
  collectionCartCover:{width:48,height:48,borderRadius:12,backgroundColor:colors.background},collectionCartCoverEmpty:{alignItems:'center',justifyContent:'center'},collectionCartCoverText:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
  collectionCartTrackCopy:{flex:1,minWidth:0},collectionCartTrackTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},collectionCartTrackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},collectionCartAlready:{color:'#FFD166',fontSize:8,fontWeight:'900',marginTop:4},
  collectionCartAction:{minHeight:38,minWidth:74,paddingHorizontal:9,borderRadius:19,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},collectionCartRemove:{borderColor:'#FF7885',backgroundColor:'#4A171B'},collectionCartActionText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},collectionCartEmpty:{color:colors.textMuted,fontSize:11,textAlign:'center',paddingVertical:18},
  collectionCartFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:4},collectionCartCount:{color:colors.keep,fontSize:11,fontWeight:'900'},collectionCartContinue:{minHeight:52,paddingHorizontal:18,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},collectionCartContinueHero:{flex:1,minHeight:70,backgroundColor:colors.primary},collectionCartContinueDisabled:{opacity:.35},collectionCartContinueText:{color:'#FFFFFF',fontSize:11,fontWeight:'900',letterSpacing:.5},collectionCartContinueSubtext:{color:'#DCE7FF',fontSize:9,fontWeight:'900',marginTop:3},
  collectionCartReadyDock:{borderRadius:20,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,padding:14,gap:12,marginTop:2},
  collectionCartReadyCopy:{gap:3},collectionCartReadyEyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.9},collectionCartReadyTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},collectionCartReadyHint:{color:colors.textSecondary,fontSize:10,lineHeight:15,fontWeight:'700'},
  collectionCartReadyButton:{minHeight:76,borderRadius:18,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',paddingHorizontal:16,shadowColor:'#000',shadowOpacity:.22,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:7},
  collectionCartReadyButtonTitle:{color:'#FFF',fontSize:12,fontWeight:'900',letterSpacing:.5},collectionCartReadyButtonHint:{color:'#DCE7FF',fontSize:9,fontWeight:'900',marginTop:4,letterSpacing:.4},
  collectionCartNeedMore:{minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:12,justifyContent:'center'},collectionCartNeedMoreText:{color:colors.textMuted,fontSize:9.5,lineHeight:14,fontWeight:'700'},
  collectionCartBottomCount:{color:colors.textMuted,fontSize:9,fontWeight:'800',textAlign:'center',paddingVertical:4},
  collectionCartReviewHero:{borderRadius:18,borderWidth:1,borderColor:'#D49A20',backgroundColor:'#211A0C',padding:16},collectionCartReviewHeroEyebrow:{color:'#FFD166',fontSize:9,fontWeight:'900',letterSpacing:1},collectionCartReviewHeroTitle:{color:colors.textPrimary,fontSize:22,fontWeight:'900',marginTop:5},collectionCartReviewHeroHint:{color:colors.textSecondary,fontSize:11,lineHeight:16,marginTop:5},
  collectionCartReviewStats:{minHeight:70,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,flexDirection:'row',alignItems:'center',paddingHorizontal:8},collectionCartReviewStat:{flex:1,alignItems:'center'},collectionCartReviewStatValue:{color:colors.keep,fontSize:20,fontWeight:'900'},collectionCartReviewStatWarn:{color:'#FFD166'},collectionCartReviewStatLabel:{color:colors.textMuted,fontSize:7.5,fontWeight:'900',textAlign:'center',marginTop:2},collectionCartReviewDivider:{width:1,height:34,backgroundColor:colors.border},
  collectionCartReviewList:{gap:7},collectionCartReviewTrack:{minHeight:52,borderRadius:13,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:8,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:8},collectionCartReviewTrackNo:{width:22,color:colors.textMuted,fontSize:9,fontWeight:'900'},collectionCartReviewCover:{width:38,height:38,borderRadius:9,backgroundColor:colors.background},collectionCartReviewTrackCopy:{flex:1,minWidth:0},collectionCartReviewTrackTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},collectionCartReviewTrackArtist:{color:colors.textMuted,fontSize:9,marginTop:2},collectionCartReviewExisting:{color:'#FFD166',fontSize:7,fontWeight:'900'},collectionCartReviewOk:{color:colors.success,fontSize:8,fontWeight:'900'},collectionCartReviewMore:{color:colors.textMuted,fontSize:9,fontWeight:'800',textAlign:'center'},
  collectionCartReviewNotice:{borderRadius:14,borderWidth:1,borderColor:'#7B5B18',backgroundColor:'#2A1F09',padding:10},collectionCartReviewNoticeTitle:{color:'#FFD166',fontSize:9,fontWeight:'900',letterSpacing:.7},collectionCartReviewNoticeText:{color:colors.textSecondary,fontSize:10,lineHeight:15,marginTop:3},
  collectionCartReviewConfirm:{minHeight:76,borderRadius:20,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',paddingHorizontal:16,shadowColor:'#000',shadowOpacity:.22,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:7},collectionCartReviewConfirmTitle:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},collectionCartReviewConfirmHint:{color:'#DCE7FF',fontSize:9,fontWeight:'900',marginTop:4},collectionCartReviewEdit:{minHeight:44,borderRadius:15,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},collectionCartReviewEditText:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},
  collectionCartCurrencyRow:{gap:7,paddingVertical:2},collectionCartCurrencyChip:{minHeight:38,paddingHorizontal:12,borderRadius:19,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},collectionCartCurrencyChipOn:{borderColor:colors.primaryLight,backgroundColor:colors.primary},collectionCartCurrencyText:{color:colors.textSecondary,fontSize:9,fontWeight:'900'},collectionCartCurrencyTextOn:{color:'#FFF'},
  collectionCartFieldLabel:{color:colors.textMuted,fontSize:9,fontWeight:'900',letterSpacing:.7,marginTop:3},collectionCartInput:{minHeight:46,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,color:colors.textPrimary,paddingHorizontal:12,fontSize:12,fontWeight:'700'},
  collectionCartModeRow:{flexDirection:'row',gap:8},collectionCartMode:{flex:1,minHeight:44,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},collectionCartModeOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},collectionCartModeText:{color:colors.textPrimary,fontSize:10,fontWeight:'900'},
  collectionCartPresetGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},collectionCartPreset:{minWidth:82,minHeight:42,paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},collectionCartPresetOn:{borderColor:colors.keep,backgroundColor:'rgba(45,225,194,.10)'},collectionCartPresetText:{color:colors.textPrimary,fontSize:10,fontWeight:'900'},
  collectionCartPayout:{gap:7},collectionCartPayoutHint:{color:colors.textMuted,fontSize:9,lineHeight:14,marginTop:8},collectionCartPayoutActions:{flexDirection:'row',gap:7,flexWrap:'wrap'},collectionCartSecondary:{minHeight:42,paddingHorizontal:11,borderRadius:14,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},collectionCartSecondaryText:{color:colors.textPrimary,fontSize:8,fontWeight:'900'},
  collectionCartBackStep:{minHeight:44,paddingHorizontal:14,borderRadius:22,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},collectionCartBackStepText:{color:colors.textMuted,fontSize:9,fontWeight:'900'},collectionCartReview:{borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:14,gap:5},collectionCartReviewTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900'},collectionCartReviewLine:{color:colors.keep,fontSize:12,fontWeight:'900'},collectionCartReviewWarn:{color:'#FFD166',fontSize:10,lineHeight:15,fontWeight:'800',marginTop:4},collectionCartPublish:{minHeight:46,paddingHorizontal:18,borderRadius:23,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},collectionCartPublishText:{color:colors.background,fontSize:10,fontWeight:'900',letterSpacing:.5},
  centerView: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  errorBox: { borderRadius: radius.lg, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.pass, padding: spacing.lg, alignItems: 'center' },
  errorText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  retryBtn: { marginTop: spacing.md, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.pass },
  retryBtnText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  emptyBox: { borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center' },
  emptyBoxTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  emptyBoxText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  guestGateCard:{width:'100%',maxWidth:420,borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.backgroundElevated,padding:18,gap:10},
  guestGateEyebrow:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},
  guestGateTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900'},
  guestGateText:{color:colors.textSecondary,fontSize:12,lineHeight:18},
  guestGatePrimary:{minHeight:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:4},
  guestGatePrimaryText:{color:'#fff',fontSize:12,fontWeight:'900'},
  guestGateSecondary:{minHeight:44,borderRadius:22,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},
  guestGateSecondaryText:{color:colors.primaryLight,fontSize:12,fontWeight:'900'},
  guestGateBack:{minHeight:42,alignItems:'center',justifyContent:'center'},
  guestGateBackText:{color:colors.textMuted,fontSize:11,fontWeight:'900'},
  accessCard: { borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  accessCardUnlocked: { borderColor: colors.success, backgroundColor: colors.successSoft },
  accessEyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  accessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: spacing.md },
  accessStat: { alignItems: 'center' },
  accessValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  accessValueGreen: { color: colors.success, fontSize: 20, fontWeight: '900' },
  accessValueRed: { color: colors.pass, fontSize: 20, fontWeight: '900' },
  accessLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  accessSeparator: { width: 1, height: 30, backgroundColor: colors.border },
  accessHint: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: spacing.md, textAlign: 'center', lineHeight: 16 },
  accessBenefit: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: spacing.md, textAlign: 'center' },
  createCollectionBtn: { minHeight: 48, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  createCollectionBtnLocked: { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
  createCollectionBtnText: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: .35 },
  modeDashboard:{borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:spacing.md},
  modeDashboardHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},modeDashboardEyebrow:{color:colors.textMuted,fontSize:9,fontWeight:'900',letterSpacing:1},modeDashboardTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900',marginTop:3},modeCounts:{alignItems:'flex-end',gap:3},modeCountFree:{color:colors.keep,fontSize:10,fontWeight:'900'},modeCountMoney:{color:colors.primaryLight,fontSize:10,fontWeight:'900'},
  modeTabs:{flexDirection:'row',gap:7,marginTop:14},modeTab:{flex:1,minHeight:42,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center',paddingHorizontal:5},modeTabOn:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},modeTabText:{color:colors.textMuted,fontSize:9,fontWeight:'900'},modeTabTextOn:{color:colors.textPrimary},modeDashboardHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:15,marginTop:9},
  filterEmpty:{borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:16,alignItems:'center'},filterEmptyTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},filterEmptyText:{color:colors.textMuted,fontSize:10,marginTop:4,textAlign:'center'},
  manualNotice: { marginTop: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  manualNoticeTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  manualNoticeText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 4 },
  offersSection: { marginTop: spacing.lg },
  requestCard:{borderColor:'rgba(167,139,250,.45)',padding:12},
  requestTop:{flexDirection:'row',alignItems:'flex-start',gap:8},
  requestMeta:{color:colors.textMuted,fontSize:10,fontWeight:'700',marginTop:3},
  requestDecline:{width:30,height:30,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  requestDeclineText:{color:colors.textMuted,fontSize:20,lineHeight:22,fontWeight:'700'},
  requestChoose:{minHeight:42,marginTop:9,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  requestChooseText:{color:colors.textPrimary,fontSize:9,fontWeight:'900',letterSpacing:.4},requestChooseArrow:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  requestDetails:{marginTop:8,gap:6},requestTrackRow:{minHeight:54,borderRadius:13,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,padding:6,flexDirection:'row',alignItems:'center',gap:8},
  requestTrackRowOn:{borderColor:colors.primary},requestTrackCover:{width:38,height:38,borderRadius:9,backgroundColor:colors.backgroundCard},requestTrackCoverEmpty:{alignItems:'center',justifyContent:'center'},requestTrackCoverText:{color:colors.primaryLight,fontSize:16,fontWeight:'900'},
  requestTrackCopy:{flex:1,minWidth:0},requestTrackTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},requestTrackArtist:{color:colors.textMuted,fontSize:9,fontWeight:'700',marginTop:2},
  requestCheck:{width:24,height:24,borderRadius:7,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},requestCheckOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},requestCheckText:{color:colors.white,fontSize:12,fontWeight:'900'},
  requestSelectionCount:{color:colors.textMuted,fontSize:9,fontWeight:'800',textAlign:'right'},
  requestPriceRow:{flexDirection:'row',gap:6,marginTop:5},
  requestPrice:{flex:1,minHeight:38,borderRadius:19,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center'},
  requestPriceText:{color:colors.primaryLight,fontSize:9,fontWeight:'900'},
  sectionTitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: spacing.md },
  sectionHint: { color: colors.textMutedGrey, fontSize: 11, lineHeight: 16, marginTop: -6, marginBottom: spacing.md },
  offerCard: { borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  offerCardFree:{borderColor:'rgba(45,225,194,.45)'},offerCardMoney:{borderColor:'rgba(168,132,250,.50)'},
  offerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  offerInfo: { flex: 1 },
  offerName: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  offerPrice: { color: colors.success, fontSize: 16, fontWeight: '900', marginTop: 2 },
  offerBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth:1 },
  offerBadgeFree:{backgroundColor:'rgba(45,225,194,.12)',borderColor:colors.keep},offerBadgeMoney:{backgroundColor:colors.primaryFaint,borderColor:colors.primaryLight},
  offerBadgeText: { color: colors.textPrimary, fontSize: 10, fontWeight: '900' },
  offerBadgeRetired: { backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  offerBadgeTextRetired: { color: colors.textMutedGrey },
  offerCardRetired: { opacity: .75 },
  offerCardFocus: { borderColor: colors.primary, borderWidth: 2 },
  retiredToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  retiredToggleIcon: { color: colors.primaryLight, fontSize: 18, fontWeight: '900', marginBottom: spacing.md },
  historyToggle:{minHeight:64,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,paddingHorizontal:13,paddingVertical:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  historyToggleCopy:{flex:1,minWidth:0},
  historyToggleKicker:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:1.1},
  historyToggleTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900',marginTop:2},
  historyToggleMeta:{color:colors.textMutedGrey,fontSize:9,fontWeight:'700',marginTop:3},
  historyToggleIcon:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
  historyList:{marginTop:10},
  historyCard:{padding:12},historyCardFocused:{borderColor:colors.keep,borderWidth:2},
  historyTop:{flexDirection:'row',alignItems:'flex-start',gap:8},
  historyDirection:{color:colors.primaryLight,fontSize:8,fontWeight:'900',letterSpacing:.8,marginBottom:3},
  historyDate:{color:colors.textMuted,fontSize:9,fontWeight:'700',marginTop:4},
  historyDetail:{color:colors.textMutedGrey,fontSize:9,lineHeight:13,marginTop:3},
  historyStatus:{fontSize:9,fontWeight:'900',marginTop:7},
  historyStatusDone:{color:colors.keep},
  historyStatusPending:{color:colors.primaryLight},
  offerDate: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: spacing.md },
  offerActions: { flexDirection: 'row', gap: spacing.sm },
  manageTracksBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  manageTracksBtnText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
  editBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', marginTop: 8 },
  editBtnText: { color: colors.white, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  pendingConfirmDisabled:{opacity:.38},
  removeBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.pass, alignItems: 'center' },
  removeBtnText: { color: colors.pass, fontSize: 11, fontWeight: '900' },
  lockedBox: { borderRadius: radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primaryLight, padding: spacing.lg },
  lockedTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '900' },
  lockedText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginTop: spacing.sm, lineHeight: 17 },
  modal: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modalOverlay: { ...StyleSheet.absoluteFillObject },
  modalContent: { backgroundColor: colors.backgroundCard, borderRadius: radius.xl, padding: spacing.lg, width: '85%', borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  modalSubtitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm },
  pricePresetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  pricePreset: { width: '31%', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  pricePresetSelected: { backgroundColor: colors.success, borderColor: colors.success },
  pricePresetText: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  pricePresetTextSelected: { color: colors.background },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  modalSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.success, alignItems: 'center' },
  modalSaveBtnText: { color: colors.background, fontSize: 12, fontWeight: '900' },
});
