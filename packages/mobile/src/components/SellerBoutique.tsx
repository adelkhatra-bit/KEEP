import ChatDockHost from './ChatDockHost';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import type { PlaylistSaleOverlap, PublicPlaylistSaleOffer } from '../services/playlistSaleService';

// Adel (02/10/2026) : « boutique vendeur » validée (maquette Boutique Pépites
// Loki). Le Drop du moment ne montre plus que 3 collections « à la une » ;
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

type Props = {
  offers: PublicPlaylistSaleOffer[];
  sellerUsername: string;
  overlaps: Record<string, PlaylistSaleOverlap>;
  unlockedOfferIds: Set<string>;
  onOpenOffer: (offer: PublicPlaylistSaleOffer) => void;
  /** Même composant pour le propriétaire et ses visiteurs : aucune deuxième version du Drop. */
  ownerMode?: boolean;
};

export function salePriceLabel(offer: PublicPlaylistSaleOffer): string {
  if (offer.paymentMode === 'FREE') return offer.freePrice != null ? `${offer.freePrice} FREE` : 'FREE';
  return `${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? ' €' : ` ${offer.currencyCode}`}`;
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

// Bannière Pépites (Adel, 02/10/2026, maquette validée) : une bulle par
// style, comme Loki Pulse -- couleur + nom + nombre de drops, JAMAIS de
// jaquette ni de titre. La taille suit le nombre de collections du style.
const BUBBLE_COLORS: { bg: string; border: string; text: string }[] = [
  { bg: '#7C5CFC', border: '#A78BFA', text: '#FFFFFF' },
  { bg: '#E8C26A', border: '#F5DA97', text: '#2A2110' },
  { bg: '#1B8F7D', border: '#7AF0DB', text: '#FFFFFF' },
  { bg: '#C2563A', border: '#FFB08F', text: '#FFFFFF' },
  { bg: '#2F5DA8', border: '#93C5FD', text: '#FFFFFF' },
];
const BANNER_MAX_BUBBLES = 6;

function StyleBubble({ genre, count, index, size, onPress, reduceMotion }: { genre: string; count: number; index: number; size: number; onPress: () => void; reduceMotion: boolean }) {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) { float.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1600 + index * 230, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(float, { toValue: 0, duration: 1600 + index * 230, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [float, index, reduceMotion]);
  const palette = BUBBLE_COLORS[index % BUBBLE_COLORS.length];
  return (
    <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [-4, 4] : [3, -5] }) }] }}>
      <TouchableOpacity
        style={[s.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg, borderColor: palette.border }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Voir les ${count} collection${count > 1 ? 's' : ''} ${genre}`}
      >
        <Text style={[s.bubbleGenre, { color: palette.text, fontSize: size >= 80 ? 14 : size >= 66 ? 12 : 11 }]} numberOfLines={1}>{genre}</Text>
        <Text style={[s.bubbleCount, { color: palette.text }]}>{size >= 66 ? `${count} drop${count > 1 ? 's' : ''}` : count}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function PriceToken({ offer, unlocked }: { offer: PublicPlaylistSaleOffer; unlocked: boolean }) {
  if (unlocked) return <View style={[s.token, s.tokenUnlocked]}><Text style={[s.tokenText, s.tokenTextUnlocked]}>✓ DÉBLOQUÉE</Text></View>;
  const free = offer.paymentMode === 'FREE';
  return (
    <View style={[s.token, free ? s.tokenFree : s.tokenMoney]}>
      <Text style={[s.tokenText, free ? s.tokenTextFree : s.tokenTextMoney]} numberOfLines={1}>
        {free ? `✦ ${salePriceLabel(offer)}` : `€ ${salePriceLabel(offer).replace(' €', '')}`}
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Écouter l'aperçu de ${offer.playlistName}, ${offer.trackCount} titres, ${unlocked ? 'débloquée' : salePriceLabel(offer)}`}
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

export default function SellerBoutique({ offers, sellerUsername, overlaps, unlockedOfferIds, onOpenOffer, ownerMode = false }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  // Règle Apple 3.1.1 : pas de vente € de contenu numérique hors achat intégré.
  const visibleOffers = useMemo(
    () => (Platform.OS === 'ios' ? offers.filter((offer) => offer.paymentMode === 'FREE') : offers),
    [offers],
  );
  const ranked = useMemo(
    () => ownerMode ? visibleOffers : rankForViewer(visibleOffers, overlaps, unlockedOfferIds),
    [visibleOffers, overlaps, unlockedOfferIds, ownerMode],
  );
  const featured = useMemo(
    () => (ownerMode ? ranked : ranked.filter((offer) => !unlockedOfferIds.has(offer.offerId))).slice(0, DROP_FEATURED_MAX),
    [ranked, unlockedOfferIds, ownerMode],
  );
  const freeCount = visibleOffers.filter((offer) => offer.paymentMode === 'FREE').length;
  const moneyCount = visibleOffers.length - freeCount;
  const [dropIndex, setDropIndex] = useState(0);
  const [shelfFilter, setShelfFilter] = useState<'ALL' | 'FREE' | 'MONEY' | 'NEW'>('ALL');
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState<FilterKey>('ALL');
  const [storeSort, setStoreSort] = useState<SortKey>('FOR_YOU');
  const [storeQuery, setStoreQuery] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (live) setReduceMotion(Boolean(value)); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => { setDropIndex((value) => (featured.length ? value % featured.length : 0)); }, [featured.length]);

  const shelf = useMemo(() => {
    const base = shelfFilter === 'NEW' ? visibleOffers : ranked;
    const filtered = base.filter((offer) => shelfFilter === 'FREE' ? offer.paymentMode === 'FREE' : shelfFilter === 'MONEY' ? offer.paymentMode !== 'FREE' : true);
    return filtered.slice(0, SHELF_MAX);
  }, [ranked, visibleOffers, shelfFilter]);

  // Styles de la bannière : nombre de collections par style principal.
  const genreCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleOffers.forEach((offer) => { const genre = offer.genres?.[0] || 'Mix'; counts.set(genre, (counts.get(genre) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [visibleOffers]);
  const newTracksForViewer = useMemo(
    () => ownerMode ? 0 : visibleOffers.filter((offer) => !unlockedOfferIds.has(offer.offerId) && overlaps[offer.offerId]).reduce((sum, offer) => sum + overlaps[offer.offerId].missingCount, 0),
    [visibleOffers, unlockedOfferIds, overlaps, ownerMode],
  );
  const openGenre = (genre: string) => {
    setStoreFilter(`GENRE:${genre}`);
    setStoreSort('FOR_YOU');
    setStoreQuery('');
    setStoreOpen(true);
  };

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
      if (storeFilter === 'FREE' && offer.paymentMode !== 'FREE') return false;
      if (storeFilter === 'MONEY' && offer.paymentMode === 'FREE') return false;
      if (storeFilter.startsWith('GENRE:') && !(offer.genres || []).includes(storeFilter.slice(6))) return false;
      if (query && !`${offer.playlistName} ${(offer.genres || []).join(' ')}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [ranked, visibleOffers, storeFilter, storeSort, storeQuery]);

  if (!visibleOffers.length) return null;
  const drop = featured.length ? featured[dropIndex % featured.length] : null;
  const dropNew = drop ? newForViewer(drop, overlaps) : 0;
  // 2 colonnes : largeur utile = fenêtre (640 max) - marges 16 - bordures - espace 10.
  const maxGenreCount = genreCounts[0]?.[1] || 1;
  const bannerGenres = genreCounts.slice(0, BANNER_MAX_BUBBLES);
  const hiddenGenreCount = Math.max(0, genreCounts.length - BANNER_MAX_BUBBLES);
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
          <Text style={s.bannerKicker} numberOfLines={1}>{ownerMode ? 'MES PÉPITES' : `LES PÉPITES DE @${sellerUsername.toUpperCase()}`}</Text>
        </View>
        <Text style={s.bannerTitle}>{ownerMode
          ? `${visibleOffers.length} collection${visibleOffers.length > 1 ? 's' : ''} publiée${visibleOffers.length > 1 ? 's' : ''}`
          : `${visibleOffers.length} collection${visibleOffers.length > 1 ? 's' : ''} à écouter avant de choisir`}</Text>
        <View style={s.bubbles} accessibilityLabel="Styles des collections">
          {bannerGenres.map(([genre, count], index) => (
            <StyleBubble
              key={genre}
              genre={genre}
              count={count}
              index={index}
              size={Math.round(54 + 30 * (count / maxGenreCount))}
              reduceMotion={reduceMotion}
              onPress={() => openGenre(genre)}
            />
          ))}
          {hiddenGenreCount > 0 ? (
            <TouchableOpacity style={[s.bubble, s.bubbleMore]} onPress={() => { setStoreFilter('ALL'); setStoreOpen(true); }} accessibilityRole="button" accessibilityLabel={`Voir les ${hiddenGenreCount} autres styles`}>
              <Text style={s.bubbleMoreText}>+{hiddenGenreCount}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.bannerPills}>
          {freeCount > 0 ? <View style={[s.bannerPill, s.tokenFree]}><Text style={[s.bannerPillText, s.tokenTextFree]}>✦ {freeCount} en FREE</Text></View> : null}
          {moneyCount > 0 ? <View style={[s.bannerPill, s.tokenMoney]}><Text style={[s.bannerPillText, s.tokenTextMoney]}>€ {moneyCount}</Text></View> : null}
          {newTracksForViewer > 0 ? <View style={[s.bannerPill, s.bannerPillNew]}><Text style={[s.bannerPillText, s.bannerPillNewText]}>{newTracksForViewer} nouveauté{newTracksForViewer > 1 ? 's' : ''} pour toi</Text></View> : null}
        </View>
        <TouchableOpacity
          style={s.bannerCta}
          onPress={() => { const first = featured[0] || ranked[0]; if (first) onOpenOffer(first); }}
          accessibilityRole="button"
          accessibilityLabel={ownerMode ? 'Gérer mes collections' : 'Écouter les aperçus des pépites'}
        >
          <Text style={s.bannerCtaText}>{ownerMode ? '◆ GÉRER MES COLLECTIONS' : '▶ ÉCOUTER LES APERÇUS'}</Text>
        </TouchableOpacity>
      </View>

      {drop ? (
        <TouchableOpacity style={s.drop} onPress={() => onOpenOffer(drop)} accessibilityRole="button" accessibilityLabel={`Drop du moment : ${drop.playlistName}, ${salePriceLabel(drop)}`}>
          <View style={s.dropHead}>
            <Text style={s.dropKicker}>DROP DU MOMENT</Text>
            <Text style={s.dropPosition}>{(dropIndex % featured.length) + 1}/{featured.length}</Text>
          </View>
          <Text style={s.dropFeatured}>★ À LA UNE</Text>
          <Text style={s.dropTitle} numberOfLines={1}>{drop.playlistName || 'Collection'}</Text>
          <Text style={s.dropMeta} numberOfLines={1}>
            {drop.trackCount} titres · {drop.genres?.[0] || 'Mix'}{ownerMode ? ' · publication active' : dropNew > 0 ? ` · ${dropNew} nouveau${dropNew > 1 ? 'x' : ''} pour toi` : ' · déjà chez toi'}
          </Text>
          <View style={s.dropFoot}>
            <PriceToken offer={drop} unlocked={false} />
            {featured.length > 1 ? (
              <View style={s.dots}>
                {featured.map((row, dotIndex) => (
                  <TouchableOpacity key={row.offerId} onPress={() => setDropIndex(dotIndex)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} accessibilityLabel={`Afficher le drop ${dotIndex + 1}`} style={[s.dot, dotIndex === dropIndex % featured.length && s.dotOn]} />
                ))}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={s.shelfHead}>
        <Text style={s.shelfTitle} numberOfLines={1}>{ownerMode ? 'Mes collections' : `Boutique de @${sellerUsername}`}</Text>
        <TouchableOpacity onPress={() => setStoreOpen(true)} accessibilityRole="button" accessibilityLabel={`Voir toute la boutique, ${visibleOffers.length} collections`}>
          <Text style={s.seeAll}>Tout voir · {visibleOffers.length} ›</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chips}>
        {([['ALL', `Tout ${visibleOffers.length}`], ['FREE', `FREE ${freeCount}`], ...(moneyCount > 0 ? [['MONEY', `€ ${moneyCount}`]] : []), ['NEW', 'Nouveautés']] as [typeof shelfFilter, string][]).map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.chip, shelfFilter === key && s.chipOn]} onPress={() => setShelfFilter(key)} accessibilityRole="button" accessibilityState={{ selected: shelfFilter === key }}>
            <Text style={[s.chipText, shelfFilter === key && s.chipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf} accessibilityLabel="Collections à débloquer">
        {shelf.map((offer) => (
          <OfferCard key={offer.offerId} offer={offer} overlaps={overlaps} unlocked={unlockedOfferIds.has(offer.offerId)} onPress={() => onOpenOffer(offer)} width={142} />
        ))}
      </ScrollView>
      <Text style={s.hint}>{ownerMode ? 'Même Drop que voient tes visiteurs · touche une collection pour la gérer' : 'Aperçu sans révéler les titres · une collection déjà acquise reste signalée'}</Text>

      <Modal visible={storeOpen} animationType="slide" transparent onRequestClose={() => setStoreOpen(false)}>
        <View style={s.storeBackdrop}>
          <View style={s.store}>
            <View style={s.storeHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.storeKicker}>{ownerMode ? 'MES COLLECTIONS' : 'BOUTIQUE'}</Text>
                <Text style={s.storeTitle} numberOfLines={1}>@{sellerUsername}</Text>
              </View>
              <TouchableOpacity style={s.storeClose} onPress={() => setStoreOpen(false)} accessibilityRole="button" accessibilityLabel="Fermer la boutique">
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
              {([['ALL', 'Tout'], ['FREE', 'FREE'], ...(moneyCount > 0 ? [['MONEY', '€']] : []), ...(selectedGenre && !topGenres.includes(selectedGenre) ? [selectedGenre, ...topGenres] : topGenres).map((genre) => [`GENRE:${genre}`, genre])] as [FilterKey, string][]).map(([key, label]) => (
                <TouchableOpacity key={key} style={[s.chip, storeFilter === key && s.chipOn]} onPress={() => setStoreFilter(key)} accessibilityRole="button" accessibilityState={{ selected: storeFilter === key }}>
                  <Text style={[s.chipText, storeFilter === key && s.chipTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedGenre ? (
              <View style={s.universe}>
                <View style={s.universeBubble}><Text style={s.universeBubbleText} numberOfLines={1}>{selectedGenre}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.universeTitle} numberOfLines={1}>Univers {selectedGenre} de @{sellerUsername}</Text>
                  <Text style={s.universeMeta}>{selectedGenreCount} collection{selectedGenreCount > 1 ? 's' : ''}{selectedGenreNew > 0 ? ` · ${selectedGenreNew} nouveauté${selectedGenreNew > 1 ? 's' : ''} pour toi` : ''}</Text>
                </View>
              </View>
            ) : null}
            <Text style={s.storeCount}>{storeRows.length} collection{storeRows.length > 1 ? 's' : ''}</Text>
            <ScrollView style={s.storeList} contentContainerStyle={s.grid}>
              {storeRows.map((offer) => (
                <OfferCard
                  key={offer.offerId}
                  offer={offer}
                  overlaps={overlaps}
                  unlocked={unlockedOfferIds.has(offer.offerId)}
                  width={storeCardWidth}
                  onPress={() => { setStoreOpen(false); onOpenOffer(offer); }}
                />
              ))}
              {!storeRows.length ? <Text style={s.empty}>Aucune collection ne correspond.</Text> : null}
            </ScrollView>
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
  bubbles: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  bubble: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bubbleGenre: { fontWeight: '900', textAlign: 'center' },
  bubbleCount: { fontSize: 10, fontWeight: '800', marginTop: 1 },
  bubbleMore: { width: 56, height: 56, borderRadius: 28, borderColor: colors.border, backgroundColor: colors.backgroundCard },
  bubbleMoreText: { color: colors.textSecondary, fontSize: 12, fontWeight: '900' },
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
  drop: { borderRadius: 20, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: 'rgba(124,92,252,.10)', padding: 14 },
  dropHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropKicker: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  dropPosition: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  dropFeatured: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: .8, marginTop: 6 },
  dropTitle: { color: colors.textPrimary, fontSize: 19, fontWeight: '900', marginTop: 4 },
  dropMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  dropFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 18, backgroundColor: colors.primaryLight },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 },
  empty: { color: colors.textSecondary, fontSize: 13, paddingVertical: 20 },
});
