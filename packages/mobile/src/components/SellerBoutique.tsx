import ChatDockHost from './ChatDockHost';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { unlockWebAudioForGesture } from '../services/audioPreviewService';
import { colors } from '../theme/colors';
import type { PlaylistSaleOverlap, PublicPlaylistSaleOffer } from '../services/playlistSaleService';

// Adel (02/10/2026) : « boutique vendeur » validée (maquette Boutique Pépites
// Loki). La Boutique musicale met en avant 3 collections « à la une » ;
// toutes les autres vont dans une étagère (10 max) puis une boutique complète,
// filtrable (Tout / FREE / € / styles) et triable, sans limite de nombre.
// Deux identités : FREE = pièce ronde violette, € = ticket doré.
// Sur iPhone, les collections en € restent masquées (règle Apple 3.1.1) tant
// que l'achat intégré n'est pas branché.
// Les données, prix et achats ne changent pas : toucher une carte ouvre la
// même fenêtre d'écoute « Pépites à découvrir » qu'avant.

export const DROP_FEATURED_MAX = 3;
export const SHELF_MAX = 10;

const GOLD = '#E8C26A';
const GOLD_DARK = '#2A2110';

const GENRE_GRADIENTS: [string, string][] = [
  ['#7C5CFC', '#3B2A86'],
  ['#E8C26A', '#6B4E1C'],
  ['#2DE1C2', '#1B5E57'],
  ['#FF8A5C', '#7A2E4F'],
  ['#4A90E2', '#24306B'],
];

type SortKey = 'FOR_YOU' | 'NEW' | 'PRICE';
type FilterKey = 'ALL' | 'FREE' | 'MONEY' | `GENRE:${string}`;

export const SELLER_BOUTIQUE_SECTION_STYLE: ViewStyle = {
  marginHorizontal: 18,
  marginTop: 14,
  paddingVertical: 14,
  paddingHorizontal: 14,
  borderRadius: 22,
  backgroundColor: colors.backgroundElevated,
  borderWidth: 1,
  borderColor: colors.primary,
};

type Props = {
  offers: PublicPlaylistSaleOffer[];
  sellerUsername: string;
  overlaps: Record<string, PlaylistSaleOverlap>;
  unlockedOfferIds: Set<string>;
  onOpenOffer: (offer: PublicPlaylistSaleOffer) => void;
  /** Le gros CTA "LES APERÇUS" enchaîne les Pépites à la une en une seule action. */
  onOpenAllOffers?: (offers: PublicPlaylistSaleOffer[]) => void;
  /** Achat groupé des collections encore verrouillées, sans supprimer l'achat unitaire. */
  onBuyAllOffers?: (offers: PublicPlaylistSaleOffer[]) => void;
  buyAllBusy?: boolean;
  /** Même composant pour le propriétaire et ses visiteurs : aucune deuxième version de la Boutique musicale. */
  ownerMode?: boolean;
  /** Nom naturel du visiteur pour une personnalisation légère, jamais affiché avec @. */
  viewerUsername?: string;
};

export function salePriceLabel(offer: PublicPlaylistSaleOffer): string {
  const money = `${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? ' €' : ` ${offer.currencyCode}`}`;
  if (offer.paymentMode === 'FREE') return offer.freePrice != null ? `${offer.freePrice} FREE` : 'FREE';
  if (offer.paymentMode === 'BOTH') return `${offer.freePrice ?? 0} FREE ou ${money}`;
  return money;
}

function genreGradient(genre: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < genre.length; i += 1) hash = (hash * 31 + genre.charCodeAt(i)) >>> 0;
  return GENRE_GRADIENTS[hash % GENRE_GRADIENTS.length];
}

function newForViewer(offer: PublicPlaylistSaleOffer, overlaps: Record<string, PlaylistSaleOverlap>): number {
  const overlap = overlaps[offer.offerId];
  return overlap ? overlap.missingCount : offer.trackCount;
}

// « Pour toi » : d'abord ce qui apporte le plus de nouveaux titres au
// visiteur, jamais ce qu'il a déjà débloqué ; l'ordre serveur (récence) départage.
function rankForViewer(offers: PublicPlaylistSaleOffer[], overlaps: Record<string, PlaylistSaleOverlap>, unlocked: Set<string>) {
  return offers
    .map((offer, position) => ({ offer, position }))
    .sort((a, b) => {
      const ua = unlocked.has(a.offer.offerId) ? 1 : 0;
      const ub = unlocked.has(b.offer.offerId) ? 1 : 0;
      if (ua !== ub) return ua - ub;
      const diff = newForViewer(b.offer, overlaps) - newForViewer(a.offer, overlaps);
      return diff !== 0 ? diff : a.position - b.position;
    })
    .map((row) => row.offer);
}

function PriceToken({ offer, unlocked }: { offer: PublicPlaylistSaleOffer; unlocked: boolean }) {
  if (unlocked) return <View style={[s.token, s.tokenUnlocked]}><Text style={[s.tokenText, s.tokenTextUnlocked]}>✓ DÉBLOQUÉE</Text></View>;
  const free = offer.paymentMode === 'FREE';
  const dual = offer.paymentMode === 'BOTH';
  const nativeMoneyProtected = offer.paymentMode === 'MONEY' && Platform.OS !== 'web';
  return (
    <View style={[s.token, free ? s.tokenFree : s.tokenMoney]}>
      <Text style={[s.tokenText, free ? s.tokenTextFree : s.tokenTextMoney]} numberOfLines={1}>
        {nativeMoneyProtected ? 'PROTÉGÉE' : dual ? `✦ ${salePriceLabel(offer)}` : free ? `✦ ${salePriceLabel(offer)}` : `€ ${salePriceLabel(offer).replace(' €', '')}`}
      </Text>
    </View>
  );
}

function OfferCard({ offer, overlaps, unlocked, onPress, width }: { offer: PublicPlaylistSaleOffer; overlaps: Record<string, PlaylistSaleOverlap>; unlocked: boolean; onPress: () => void; width: number }) {
  const genre = offer.genres?.[0] || 'Mix';
  const overlap = overlaps[offer.offerId];
  const ownedAll = Boolean(overlap && overlap.totalCount > 0 && overlap.missingCount === 0);
  return (
    <TouchableOpacity
      style={[s.card, { width }]}
      onPressIn={unlockWebAudioForGesture}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Écouter l'aperçu de ${offer.playlistName}, ${offer.trackCount} titres, ${unlocked ? 'débloquée' : offer.paymentMode !== 'FREE' && Platform.OS !== 'web' ? 'protégée' : salePriceLabel(offer)}`}
    >
      <LinearGradient colors={genreGradient(genre)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cover}>
        {ownedAll ? <Text style={s.coverOwned}>✓ DÉJÀ CHEZ TOI</Text> : overlap && overlap.missingCount > 0 ? <Text style={s.coverNew}>{overlap.missingCount} NOUVEAU{overlap.missingCount > 1 ? 'X' : ''}</Text> : null}
        <Text style={s.coverGenre} numberOfLines={1}>{genre.toUpperCase()}</Text>
      </LinearGradient>
      <Text style={s.cardTitle} numberOfLines={2}>{offer.playlistName || 'Collection'}</Text>
      <Text style={s.cardMeta}>{offer.trackCount} titre{offer.trackCount > 1 ? 's' : ''}</Text>
      <PriceToken offer={offer} unlocked={unlocked} />
    </TouchableOpacity>
  );
}

export default function SellerBoutique({ offers, sellerUsername, overlaps, unlockedOfferIds, onOpenOffer, onOpenAllOffers, onBuyAllOffers, buyAllBusy = false, ownerMode = false, viewerUsername }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const sellerName = String(sellerUsername || 'Loki').replace(/^@+/, '').trim() || 'Loki';
  const viewerName = String(viewerUsername || '').replace(/^@+/, '').trim();
  // Le profil montre toujours l'intégralité du club musical. Sur iPhone,
  // les éventuelles restrictions de paiement sont appliquées à l'étape
  // d'achat ; elles ne doivent jamais faire disparaître des collections.
  const visibleOffers = useMemo(() => offers, [offers]);
  const ranked = useMemo(
    () => ownerMode ? visibleOffers : rankForViewer(visibleOffers, overlaps, unlockedOfferIds),
    [visibleOffers, overlaps, unlockedOfferIds, ownerMode],
  );
  const featured = useMemo(
    () => (ownerMode ? ranked : ranked.filter((offer) => !unlockedOfferIds.has(offer.offerId))).slice(0, DROP_FEATURED_MAX),
    [ranked, unlockedOfferIds, ownerMode],
  );
  const freeCount = visibleOffers.filter((offer) => offer.paymentMode === 'FREE' || offer.paymentMode === 'BOTH').length;
  const moneyCount = visibleOffers.filter((offer) => offer.paymentMode === 'MONEY' || offer.paymentMode === 'BOTH').length;
  const bundleOffers = useMemo(
    () => ownerMode ? [] : visibleOffers.filter((offer) => !unlockedOfferIds.has(offer.offerId)),
    [ownerMode, visibleOffers, unlockedOfferIds],
  );
  const actionableBundleOffers = useMemo(
    () => Platform.OS === 'web' ? bundleOffers.filter((offer) => offer.paymentMode !== 'BOTH') : bundleOffers.filter((offer) => offer.paymentMode === 'FREE'),
    [bundleOffers],
  );
  const bundleFreeTotal = useMemo(
    () => actionableBundleOffers.filter((offer) => offer.paymentMode === 'FREE').reduce((sum, offer) => sum + Math.max(0, Number(offer.freePrice ?? 0)), 0),
    [actionableBundleOffers],
  );
  const bundleMoneyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    actionableBundleOffers.filter((offer) => offer.paymentMode !== 'FREE').forEach((offer) => {
      const currency = String(offer.currencyCode || 'EUR').toUpperCase();
      totals.set(currency, (totals.get(currency) || 0) + Math.max(0, Number(offer.priceCents || 0)));
    });
    return Array.from(totals.entries());
  }, [actionableBundleOffers]);
  const bundleTotalLabel = useMemo(() => {
    const parts: string[] = [];
    if (bundleFreeTotal > 0) parts.push(`${bundleFreeTotal} FREE`);
    bundleMoneyTotals.forEach(([currency, cents]) => {
      const amount = (cents / 100).toFixed(2).replace('.', ',');
      parts.push(currency === 'EUR' ? `${amount} €` : `${amount} ${currency}`);
    });
    return parts.join(' + ');
  }, [bundleFreeTotal, bundleMoneyTotals]);
  const newTracksForViewer = useMemo(
    () => ownerMode
      ? 0
      : visibleOffers
        .filter((offer) => !unlockedOfferIds.has(offer.offerId) && overlaps[offer.offerId])
        .reduce((sum, offer) => sum + overlaps[offer.offerId].missingCount, 0),
    [visibleOffers, unlockedOfferIds, overlaps, ownerMode],
  );
  const [shelfFilter, setShelfFilter] = useState<'ALL' | 'FREE' | 'MONEY' | 'NEW'>('ALL');
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState<FilterKey>('ALL');
  const [storeSort, setStoreSort] = useState<SortKey>('FOR_YOU');
  const [storeQuery, setStoreQuery] = useState('');
  const shelf = useMemo(() => {
    const base = shelfFilter === 'NEW' ? visibleOffers : ranked;
    const filtered = base.filter((offer) => shelfFilter === 'FREE' ? (offer.paymentMode === 'FREE' || offer.paymentMode === 'BOTH') : shelfFilter === 'MONEY' ? (offer.paymentMode === 'MONEY' || offer.paymentMode === 'BOTH') : true);
    return filtered.slice(0, SHELF_MAX);
  }, [ranked, visibleOffers, shelfFilter]);

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>();
    visibleOffers.forEach((offer) => { const genre = offer.genres?.[0]; if (genre) counts.set(genre, (counts.get(genre) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([genre]) => genre);
  }, [visibleOffers]);

  const storeRows = useMemo(() => {
    const query = storeQuery.trim().toLowerCase();
    const base = storeSort === 'FOR_YOU' ? ranked : storeSort === 'NEW' ? visibleOffers : [...visibleOffers].sort((a, b) => {
      // Prix croissant : FREE d'abord (par nombre de FREE), puis €.
      const av = a.paymentMode === 'FREE' ? (a.freePrice ?? 0) : 100000 + a.priceCents;
      const bv = b.paymentMode === 'FREE' ? (b.freePrice ?? 0) : 100000 + b.priceCents;
      return av - bv;
    });
    return base.filter((offer) => {
      if (storeFilter === 'FREE' && offer.paymentMode !== 'FREE' && offer.paymentMode !== 'BOTH') return false;
      if (storeFilter === 'MONEY' && offer.paymentMode !== 'MONEY' && offer.paymentMode !== 'BOTH') return false;
      if (storeFilter.startsWith('GENRE:') && !(offer.genres || []).includes(storeFilter.slice(6))) return false;
      if (query && !`${offer.playlistName} ${(offer.genres || []).join(' ')}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [ranked, visibleOffers, storeFilter, storeSort, storeQuery]);

  if (!visibleOffers.length) return null;
  const drop = featured[0] ?? null;
  const dropNew = drop ? newForViewer(drop, overlaps) : 0;
  // 2 colonnes : largeur utile = fenêtre (640 max) - marges 16 - bordures - espace 10.
  const selectedGenre = storeFilter.startsWith('GENRE:') ? storeFilter.slice(6) : null;
  const selectedGenreNew = !ownerMode && selectedGenre
    ? visibleOffers.filter((offer) => (offer.genres || []).includes(selectedGenre) && !unlockedOfferIds.has(offer.offerId) && overlaps[offer.offerId]).reduce((sum, offer) => sum + overlaps[offer.offerId].missingCount, 0)
    : 0;
  const selectedGenreCount = selectedGenre ? visibleOffers.filter((offer) => (offer.genres || []).includes(selectedGenre)).length : 0;
  const storeCardWidth = Math.floor((Math.min(windowWidth, 640) - 16 * 2 - 2 - 10 - 2) / 2);

  return (
    <View style={s.root}>
      <View style={s.banner}>
        <View style={s.bannerHead}>
          <View style={s.liveDot} />
          <Text style={s.bannerKicker} numberOfLines={1}>{ownerMode ? 'MA BOUTIQUE MUSICALE · MES PÉPITES' : 'BOUTIQUE MUSICALE · SES PÉPITES'}</Text>
        </View>
        <Text style={s.bannerTitle}>{`${visibleOffers.length} collection${visibleOffers.length > 1 ? 's' : ''} · 1 clic pour écouter`}</Text>
        <Text style={s.bannerPersonal} numberOfLines={2}>
          {ownerMode
            ? 'Ton club musical est prêt. Lance directement une collection.'
            : viewerName
              ? `${viewerName}, découvre la sélection de ${sellerName}.`
              : `Découvre la sélection de ${sellerName}.`}
        </Text>
        <View style={s.bannerPills}>
          {freeCount > 0 ? <View style={[s.bannerPill, s.tokenFree]}><Text style={[s.bannerPillText, s.tokenTextFree]}>✦ {freeCount} en FREE</Text></View> : null}
          {moneyCount > 0 ? <View style={[s.bannerPill, s.tokenMoney]}><Text style={[s.bannerPillText, s.tokenTextMoney]}>{Platform.OS === 'web' ? `€ ${moneyCount}` : `${moneyCount} PROTÉGÉE${moneyCount > 1 ? 'S' : ''}`}</Text></View> : null}
          {newTracksForViewer > 0 ? <View style={[s.bannerPill, s.bannerPillNew]}><Text style={[s.bannerPillText, s.bannerPillNewText]}>{newTracksForViewer} nouveauté{newTracksForViewer > 1 ? 's' : ''} pour toi</Text></View> : null}
        </View>
        <TouchableOpacity
          style={s.bannerCta}
          onPressIn={unlockWebAudioForGesture}
          onPress={() => {
            const queue = featured.length ? featured : ranked.slice(0, 1);
            if (!queue.length) return;
            if (onOpenAllOffers) onOpenAllOffers(queue);
            else onOpenOffer(queue[0]);
          }}
          accessibilityRole="button"
          accessibilityLabel="Écouter tous les aperçus des pépites à la une"
        >
          <Text style={s.bannerCtaText}>▶ ÉCOUTER LES APERÇUS</Text>
        </TouchableOpacity>
      </View>

      {drop ? (
        <TouchableOpacity style={s.drop} onPressIn={unlockWebAudioForGesture} onPress={() => onOpenOffer(drop)} accessibilityRole="button" accessibilityLabel={`Pépite à la une : ${drop.playlistName}, ${drop.paymentMode !== 'FREE' && Platform.OS !== 'web' ? 'protégée' : salePriceLabel(drop)}`}>
          <LinearGradient colors={genreGradient(drop.genres?.[0] || 'Mix')} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.dropGradient}>
            <View style={s.dropHead}>
              <View style={s.dropLive}>
                <View style={s.dropLiveDot} />
                <Text style={s.dropKicker}>BOUTIQUE MUSICALE</Text>
              </View>
            </View>
            <View style={s.dropMain}>
              <View style={s.dropCopy}>
                <Text style={s.dropFeatured}>★ PÉPITE À LA UNE</Text>
                <Text style={s.dropTitle} numberOfLines={1}>{drop.playlistName || 'Collection'}</Text>
                <Text style={s.dropMeta} numberOfLines={1}>
                  {drop.trackCount} titres · {drop.genres?.[0] || 'Mix'}{ownerMode ? '' : dropNew > 0 ? ` · ${dropNew} nouveau${dropNew > 1 ? 'x' : ''} pour toi` : ' · déjà chez toi'}
                </Text>
              </View>
              <View style={s.dropPlay}><Text style={s.dropPlayText}>▶</Text></View>
            </View>
            <View style={s.dropListenStrip}>
              <Text style={s.dropListenText}>{ownerMode ? 'TOUCHE POUR ÉCOUTER TA COLLECTION' : 'TOUCHE POUR ÉCOUTER · TITRES PROTÉGÉS'}</Text>
              <Text style={s.dropListenArrow}>›</Text>
            </View>
            <View style={s.dropFoot}>
              <PriceToken offer={drop} unlocked={false} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <View style={s.shelfHead}>
        <Text style={s.shelfTitle} numberOfLines={1}>{ownerMode ? 'Mes collections' : 'Toutes les Pépites'}</Text>
        <TouchableOpacity onPress={() => setStoreOpen(true)} accessibilityRole="button" accessibilityLabel={`Voir toute la boutique musicale, ${visibleOffers.length} collections`}>
          <Text style={s.seeAll}>Tout voir · {visibleOffers.length} ›</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chips}>
        {([['ALL', `Tout ${visibleOffers.length}`], ['FREE', `FREE ${freeCount}`], ...(moneyCount > 0 ? [['MONEY', Platform.OS === 'web' ? `€ ${moneyCount}` : `PROTÉGÉES ${moneyCount}`]] : []), ['NEW', 'Nouveautés']] as [typeof shelfFilter, string][]).map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.chip, shelfFilter === key && s.chipOn]} onPress={() => setShelfFilter(key)} accessibilityRole="button" accessibilityState={{ selected: shelfFilter === key }}>
            <Text style={[s.chipText, shelfFilter === key && s.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {!ownerMode && onBuyAllOffers && actionableBundleOffers.length > 1 ? (
        <View style={s.bundleBar}>
          <View style={s.bundleCopy}>
            <Text style={s.bundleTitle}>TOTAL DES PÉPITES · {actionableBundleOffers.length}</Text>
            <Text style={s.bundleTotal}>{bundleTotalLabel || 'Prix à confirmer'}</Text>
            <Text style={s.bundleHint}>Tu peux toujours débloquer une collection seule.</Text>
          </View>
          <TouchableOpacity
            style={[s.bundleButton, buyAllBusy && s.bundleButtonDisabled]}
            disabled={buyAllBusy}
            onPress={() => onBuyAllOffers(actionableBundleOffers)}
            accessibilityRole="button"
            accessibilityLabel={`Tout prendre, ${actionableBundleOffers.length} collections, total ${bundleTotalLabel}`}
          >
            <Text style={s.bundleButtonText}>{buyAllBusy ? 'EN COURS…' : 'TOUT PRENDRE'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf} accessibilityLabel="Collections à débloquer">
        {shelf.map((offer) => (
          <OfferCard key={offer.offerId} offer={offer} overlaps={overlaps} unlocked={unlockedOfferIds.has(offer.offerId)} onPress={() => onOpenOffer(offer)} width={142} />
        ))}
      </ScrollView>
      <Text style={s.hint}>{ownerMode
        ? 'Touche une collection pour l’écouter directement. Pour modifier une collection publiée, utilise ◆ PÉPITES sur ton profil.'
        : `Merci pour ta visite${viewerName ? ` ${viewerName}` : ''} · écoute, puis garde seulement ce qui te ressemble.`}</Text>

      <Modal visible={storeOpen} animationType="slide" transparent onRequestClose={() => setStoreOpen(false)}>
        <View style={s.storeBackdrop}>
          <View style={s.store}>
            <View style={s.storeHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.storeKicker}>BOUTIQUE MUSICALE</Text>
                <Text style={s.storeTitle} numberOfLines={1}>{ownerMode ? 'MES COLLECTIONS' : 'PÉPITES LOKI'}</Text>
              </View>
              <TouchableOpacity style={s.storeClose} onPress={() => setStoreOpen(false)} accessibilityRole="button" accessibilityLabel="Fermer la boutique musicale">
                <Text style={s.storeCloseText}>×</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={storeQuery}
              onChangeText={setStoreQuery}
              placeholder="Rechercher une collection, un style…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={s.search}
              autoCorrect={false}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chips}>
              {([['FOR_YOU', 'Pour toi'], ['NEW', 'Nouveautés'], ['PRICE', 'Prix croissant']] as [SortKey, string][]).map(([key, label]) => (
                <TouchableOpacity key={key} style={[s.chip, storeSort === key && s.chipOn]} onPress={() => setStoreSort(key)} accessibilityRole="button" accessibilityState={{ selected: storeSort === key }}>
                  <Text style={[s.chipText, storeSort === key && s.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chips}>
              {([['ALL', 'Tout'], ['FREE', 'FREE'], ...(moneyCount > 0 ? [['MONEY', Platform.OS === 'web' ? '€' : 'PROTÉGÉES']] : []), ...(selectedGenre && !topGenres.includes(selectedGenre) ? [selectedGenre, ...topGenres] : topGenres).map((genre) => [`GENRE:${genre}`, genre])] as [FilterKey, string][]).map(([key, label]) => (
                <TouchableOpacity key={key} style={[s.chip, storeFilter === key && s.chipOn]} onPress={() => setStoreFilter(key)} accessibilityRole="button" accessibilityState={{ selected: storeFilter === key }}>
                  <Text style={[s.chipText, storeFilter === key && s.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedGenre ? (
              <View style={s.universe}>
                <View style={s.universeBubble}><Text style={s.universeBubbleText} numberOfLines={1}>{selectedGenre}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.universeTitle} numberOfLines={1}>Univers {selectedGenre}</Text>
                  <Text style={s.universeMeta}>{selectedGenreCount} collection{selectedGenreCount > 1 ? 's' : ''}{selectedGenreNew > 0 ? ` · ${selectedGenreNew} nouveauté${selectedGenreNew > 1 ? 's' : ''} pour toi` : ''}</Text>
                </View>
              </View>
            ) : null}
            <Text style={s.storeCount}>{storeRows.length} collection{storeRows.length > 1 ? 's' : ''}</Text>
            <FlatList
              style={s.storeList}
              contentContainerStyle={s.storeGridContent}
              columnWrapperStyle={s.storeGridRow}
              data={storeRows}
              numColumns={2}
              keyExtractor={(offer) => offer.offerId}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={Platform.OS !== 'web'}
              renderItem={({ item: offer }) => (
                <OfferCard
                  offer={offer}
                  overlaps={overlaps}
                  unlocked={unlockedOfferIds.has(offer.offerId)}
                  width={storeCardWidth}
                  onPress={() => { setStoreOpen(false); onOpenOffer(offer); }}
                />
              )}
              ListEmptyComponent={<Text style={s.empty}>Aucune collection ne correspond.</Text>}
            />
          </View>
        </View>
        <ChatDockHost active={storeOpen} />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 10, marginTop: 10 },
  banner: { borderRadius: 22, borderWidth: 1, borderColor: colors.primary, backgroundColor: '#140F24', padding: 16, gap: 12, overflow: 'hidden' },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.keep },
  bannerKicker: { flex: 1, color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  bannerTitle: { color: colors.textPrimary, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  bannerPersonal: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  bubbleGenre: { fontWeight: '900', textAlign: 'center' },
  bannerPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bannerPill: { minHeight: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bannerPillText: { fontSize: 12, fontWeight: '900' },
  bannerPillNew: { borderColor: colors.keep, backgroundColor: 'transparent' },
  bannerPillNewText: { color: colors.keep },
  bannerCta: { minHeight: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  bannerCtaText: { color: '#140F24', fontSize: 14, fontWeight: '900', letterSpacing: .4 },
  universe: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: colors.primary, padding: 12 },
  universeBubble: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  universeBubbleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  universeTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  universeMeta: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 2 },
  drop: { borderRadius: 20, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: 'rgba(124,92,252,.10)', padding: 14, overflow: 'hidden' },
  dropGradient: { margin: -14, padding: 14, borderRadius: 19 },
  dropHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropLive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.keep },
  dropMain: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  dropCopy: { flex: 1, minWidth: 0 },
  dropPlay: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: 'rgba(255,255,255,.55)', backgroundColor: 'rgba(255,255,255,.13)', alignItems: 'center', justifyContent: 'center' },
  dropPlayText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginLeft: 2 },
  dropListenStrip: { minHeight: 34, marginTop: 12, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.28)', backgroundColor: 'rgba(0,0,0,.18)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropListenText: { flex: 1, color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: .45 },
  dropListenArrow: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', lineHeight: 23 },
  dropKicker: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  dropFeatured: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: .8, marginTop: 6 },
  dropTitle: { color: colors.textPrimary, fontSize: 19, fontWeight: '900', marginTop: 4 },
  dropMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  dropFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  shelfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  shelfTitle: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  seeAll: { color: colors.primaryLight, fontSize: 12, fontWeight: '900' },
  // Rangées horizontales : jamais écrasées dans une colonne qui rétrécit.
  chipRow: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '900' },
  chipTextOn: { color: '#FFFFFF' },
  shelf: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  bundleBar: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,194,106,.46)', backgroundColor: 'rgba(232,194,106,.08)', padding: 12, gap: 10 },
  bundleCopy: { minWidth: 0 },
  bundleTitle: { color: colors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: .55 },
  bundleTotal: { color: GOLD, fontSize: 17, fontWeight: '900', marginTop: 3 },
  bundleHint: { color: colors.textSecondary, fontSize: 9, fontWeight: '700', marginTop: 3 },
  bundleButton: { minHeight: 44, borderRadius: 14, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  bundleButtonDisabled: { opacity: .55 },
  bundleButtonText: { color: GOLD_DARK, fontSize: 12, fontWeight: '900', letterSpacing: .5 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, padding: 8, gap: 5 },
  cover: { height: 112, borderRadius: 12, padding: 8, justifyContent: 'space-between' },
  coverGenre: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: .8, alignSelf: 'flex-start' },
  coverNew: { alignSelf: 'flex-end', color: '#FFFFFF', fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(0,0,0,.35)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  coverOwned: { alignSelf: 'flex-end', color: colors.keep, fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(0,0,0,.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  cardTitle: { color: colors.textPrimary, fontSize: 13, lineHeight: 17, fontWeight: '900', minHeight: 34 },
  cardMeta: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  token: { alignSelf: 'flex-start', minHeight: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tokenFree: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  tokenMoney: { backgroundColor: GOLD, borderColor: '#F5DA97', borderStyle: 'dashed' },
  tokenUnlocked: { backgroundColor: 'rgba(45,225,194,.12)', borderColor: colors.keep },
  tokenText: { fontSize: 11, fontWeight: '900', letterSpacing: .3 },
  tokenTextFree: { color: '#FFFFFF' },
  tokenTextMoney: { color: GOLD_DARK },
  tokenTextUnlocked: { color: colors.keep },
  hint: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  storeBackdrop: { flex: 1, backgroundColor: 'rgba(3,2,7,.86)', justifyContent: 'flex-end', alignItems: 'center' },
  store: { width: '100%', maxWidth: 640, maxHeight: '92%', flexShrink: 1, backgroundColor: colors.backgroundElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  storeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  storeKicker: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  storeTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 2 },
  storeClose: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  storeCloseText: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  search: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, color: colors.textPrimary, paddingHorizontal: 12, fontSize: 15 },
  storeCount: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  storeList: { flexGrow: 0, flexShrink: 1 },
  storeGridContent: { gap: 10, paddingBottom: 24 },
  storeGridRow: { gap: 10 },
  empty: { color: colors.textSecondary, fontSize: 13, paddingVertical: 20 },
});
