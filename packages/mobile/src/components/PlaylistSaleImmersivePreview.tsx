import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import SwipeDeck from './SwipeDeck';
import { loadPlaylistSaleOfferPreviewTracks, PlaylistSalePreviewTrack, PublicPlaylistSaleOffer } from '../services/playlistSaleService';
import { playAntiShazamPreviewSegment, stopAntiShazamPreview } from '../services/audioPreviewService';

/**
 * Aperçu immersif d'une découverte musicale en vente (Adel, 21/09/2026,
 * refonte swipe multi-morceaux du 21/09/2026 -- mission "Preview swipe
 * multi-morceaux"). Charge directement les extraits masqués
 * (keep_playlist_sale_offer_preview_tracks, RIEN de réinventé côté
 * masquage : cette RPC ne renvoie jamais titre/artiste/jaquette) et les
 * fait défiler en swipe, comme le Swipe de découverte KEEP (SwipeDeck,
 * réutilisé tel quel pour le geste). Chaque swipe change d'extrait, jamais
 * de décision GARDER/PASSER -- il n'y a rien à garder tant que l'accès
 * n'est pas payé.
 *
 * Vocabulaire (mission conformité 21/09/2026) : on ne "vend" jamais une
 * musique ni un artiste -- on donne accès à une DÉCOUVERTE musicale
 * (sélection curatée). Aucun titre, artiste ni jaquette n'apparaît ici tant
 * que l'achat n'est pas confirmé.
 */
const MARKETING_LINES = [
  'Écoute les extraits avant de choisir.',
  'Cette collection a été préparée par ce profil Loki Music.',
  'Débloque la sélection pour découvrir tous ses morceaux.',
];

const EXPLAINER_LINES = [
  'Après l’achat, cette découverte est liée directement à ton profil Loki Music.',
  'Tu choisis ensuite de la rendre publique ou de la garder pour toi.',
  'Aucun titre ni artiste n’est jamais dévoilé avant l’achat.',
];

const ROTATE_MS = 4200;

interface Props {
  offer: PublicPlaylistSaleOffer;
  visible: boolean;
  onClose: () => void;
  onConfirmPurchase: (offer: PublicPlaylistSaleOffer) => void;
  busy?: boolean;
}

export default function PlaylistSaleImmersivePreview({ offer, visible, onClose, onConfirmPurchase, busy }: Props) {
  const [marketingIndex, setMarketingIndex] = useState(0);
  const [explainerIndex, setExplainerIndex] = useState(0);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [tracks, setTracks] = useState<PlaylistSalePreviewTrack[] | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.3))).current;
  const reduceMotionRef = useRef(false);
  const previewKeyRef = useRef(`playlist-sale-immersive:${offer.playlistId}`);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tracksRef = useRef<PlaylistSalePreviewTrack[] | null>(null);

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  function playTrackAt(idx: number) {
    const available = tracksRef.current;
    if (!available || available.length === 0) return;
    const safeIdx = ((idx % available.length) + available.length) % available.length;
    setTrackIndex(safeIdx);
    clearCountdown();
    // Anti-Shazam (Adel, 22/09/2026) : la durée de l'extrait n'est plus fixe
    // (5-8s aléatoires, décidés côté service) -- le compte à rebours démarre
    // seulement une fois la durée réelle connue.
    void playAntiShazamPreviewSegment(
      previewKeyRef.current,
      available[safeIdx].previewUrl,
      (isPlaying) => setPlaying(isPlaying),
      () => { clearCountdown(); playTrackAt(safeIdx + 1); },
    ).then((durationMs) => {
      setSecondsLeft(Math.round(durationMs / 1000));
      countdownRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    }).catch(() => {});
  }

  // Reset + chargement des extraits à chaque ouverture -- jamais de case
  // pré-cochée, jamais un vieux jeu d'extraits d'une offre précédente.
  useEffect(() => {
    if (!visible) {
      clearCountdown();
      void stopAntiShazamPreview(previewKeyRef.current);
      return undefined;
    }
    setWaiverAccepted(false);
    setTracks(null);
    tracksRef.current = null;
    setTrackIndex(0);
    setPlaying(false);
    let live = true;
    loadPlaylistSaleOfferPreviewTracks(offer.playlistId).then((loaded) => {
      if (!live) return;
      setTracks(loaded);
      tracksRef.current = loaded;
      if (loaded.length > 0) playTrackAt(0);
    }).catch(() => { if (live) { setTracks([]); tracksRef.current = []; } });
    const marketingTimer = setInterval(() => setMarketingIndex((i) => (i + 1) % MARKETING_LINES.length), ROTATE_MS);
    const explainerTimer = setInterval(() => setExplainerIndex((i) => (i + 1) % EXPLAINER_LINES.length), ROTATE_MS + 900);
    return () => {
      live = false;
      clearInterval(marketingTimer);
      clearInterval(explainerTimer);
      clearCountdown();
      void stopAntiShazamPreview(previewKeyRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, offer.playlistId]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((enabled) => { if (!cancelled) reduceMotionRef.current = Boolean(enabled); }).catch(() => {});
    if (reduceMotionRef.current) return undefined;
    const loops = bars.map((bar, i) => Animated.loop(
      Animated.sequence([
        Animated.timing(bar, { toValue: 1, duration: 620 + i * 90, easing: Easing.inOut(Easing.sin), useNativeDriver: false, delay: i * 80 }),
        Animated.timing(bar, { toValue: 0.3, duration: 620 + i * 90, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    ));
    loops.forEach((l) => l.start());
    return () => { cancelled = true; loops.forEach((l) => l.stop()); };
  }, [visible, bars]);

  function togglePlayPause() {
    if (playing) {
      clearCountdown();
      void stopAntiShazamPreview(previewKeyRef.current);
      setPlaying(false);
      return;
    }
    playTrackAt(trackIndex);
  }

  const tracksLoading = tracks === null;
  const tracksUnavailable = tracks !== null && tracks.length === 0;
  const trackCountLabel = offer.trackCount || tracks?.length || 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Fermer l'aperçu"><Text style={s.closeBtnText}>✕</Text></TouchableOpacity>

          <Text style={s.eyebrow}>DÉCOUVERTE À DÉBLOQUER</Text>
          <Text style={s.playlistName} numberOfLines={2}>{offer.playlistName}</Text>
          <Text style={s.meta}>{trackCountLabel} titre{trackCountLabel > 1 ? 's' : ''} · masqués jusqu'à l'achat</Text>
          <View style={s.totalPricePill}><Text style={s.totalPriceLabel}>PRIX TOTAL</Text><Text style={s.totalPriceValue}>{(offer.priceCents / 100).toFixed(2).replace('.', ',')}{offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}</Text></View>

          <Text style={s.marketing}>{MARKETING_LINES[marketingIndex]}</Text>

          <SwipeDeck
            enabled={!tracksLoading && !tracksUnavailable}
            resetKey={trackIndex}
            onSwipeLeft={() => playTrackAt(trackIndex - 1)}
            onSwipeRight={() => playTrackAt(trackIndex + 1)}
            leftLabel="◀ EXTRAIT PRÉCÉDENT"
            rightLabel="EXTRAIT SUIVANT ▶"
            hint={tracksUnavailable ? '' : 'Glisse pour changer d’extrait -- titre, artiste et jaquette restent masqués jusqu’à l’achat'}
          >
            <TouchableOpacity
              style={s.swipeCard}
              activeOpacity={0.85}
              disabled={tracksLoading || tracksUnavailable}
              onPress={togglePlayPause}
              accessibilityLabel="Extrait masqué, appuie pour lire ou mettre en pause"
            >
              <View style={s.visual}>
                {bars.map((bar, i) => (
                  <Animated.View key={i} style={[s.bar, { height: bar.interpolate({ inputRange: [0, 1], outputRange: [16, 64] }) }]} />
                ))}
              </View>
              <Text style={s.trackStatus}>
                {tracksLoading
                  ? 'Chargement des extraits...'
                  : tracksUnavailable
                    ? 'Aperçu indisponible pour le moment'
                    : `Extrait masqué ${trackIndex + 1}/${tracks!.length}${playing ? ` · 0:${String(secondsLeft).padStart(2, '0')}` : ' · en pause'}`}
              </Text>
            </TouchableOpacity>
          </SwipeDeck>

          {!tracksLoading && !tracksUnavailable ? (
            <View style={s.protectionBadge}>
              <Text style={s.protectionBadgeText}>🛡️ Extrait protégé · décalage aléatoire · hauteur modifiée · voix off Loki Music</Text>
            </View>
          ) : null}

          <Text style={s.explainer}>{EXPLAINER_LINES[explainerIndex]}</Text>

          {/* Adel (21/09/2026, décision 2) : "documente clairement dans
              l'UI que le vendeur doit confirmer réception, et prévois un
              encart avertissement acheteur" -- fonctionnement manuel tant
              que l'API PayPal réelle n'est pas intégrée. Encart permanent,
              pas seulement l'Alert transitoire après ouverture du lien. */}
          <View style={s.manualNotice}>
            <Text style={s.manualNoticeText}>ℹ️ Le paiement se fait sur le lien personnel du vendeur (hors Loki Music). Loki Music ne voit ni ne garantit ce paiement : l'accès se débloque quand le vendeur confirme l'avoir reçu.</Text>
          </View>

          <TouchableOpacity style={s.waiverRow} onPress={() => setWaiverAccepted((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: waiverAccepted }} accessibilityLabel="Renonciation au droit de rétractation">
            <View style={[s.checkbox, waiverAccepted && s.checkboxOn]}>{waiverAccepted ? <Text style={s.checkboxMark}>✓</Text> : null}</View>
            <Text style={s.waiverText}>Je reconnais que l'accès à cette découverte musicale est fourni immédiatement après paiement et je renonce expressément à mon droit de rétractation de 14 jours.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.buyButton, !waiverAccepted && s.buyButtonDisabled]}
            disabled={!waiverAccepted || busy}
            onPress={() => onConfirmPurchase(offer)}
            accessibilityLabel={`Acheter et ajouter à mon Loki Music, prix total ${(offer.priceCents / 100).toFixed(2).replace('.', ',')} ${offer.currencyCode}`}
          >
            <Text style={[s.buyButtonText, !waiverAccepted && s.buyButtonTextDisabled]}>{busy ? '…' : `Acheter et ajouter à mon Loki Music · ${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}`}</Text>
          </TouchableOpacity>
          <Text style={s.noRefund}>Accès numérique immédiat : aucun remboursement possible une fois la renonciation validée.</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,2,7,0.86)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.backgroundElevated, borderRadius: 26, borderWidth: 1, borderColor: colors.border, padding: 20, position: 'relative' },
  closeBtn: { position: 'absolute', right: 12, top: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  closeBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  eyebrow: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  playlistName: { color: colors.textPrimary, fontSize: 19, fontWeight: '800', marginTop: 4 },
  meta: { color: colors.textMutedGrey, fontSize: 12, marginTop: 2 },
  totalPricePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(45,225,194,.10)', borderWidth: 1, borderColor: 'rgba(45,225,194,.42)' },
  totalPriceLabel: { color: colors.textMutedGrey, fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  totalPriceValue: { color: colors.success, fontSize: 13, fontWeight: '900' },
  marketing: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 10, minHeight: 20 },
  swipeCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingVertical: 18, marginTop: 6 },
  visual: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, height: 72 },
  bar: { width: 8, borderRadius: 4, backgroundColor: colors.primary },
  trackStatus: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 10 },
  explainer: { color: colors.textMuted, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 10, minHeight: 32 },
  protectionBadge: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primary, alignSelf: 'center' },
  protectionBadgeText: { color: colors.primaryLight, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  manualNotice: { marginTop: 4, padding: 10, borderRadius: 12, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  manualNoticeText: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  waiverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  waiverText: { flex: 1, color: colors.textPrimary, fontSize: 11.5, lineHeight: 16 },
  buyButton: { minHeight: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  buyButtonDisabled: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  buyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  buyButtonTextDisabled: { color: colors.textMuted },
  noRefund: { color: colors.textMuted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
});
