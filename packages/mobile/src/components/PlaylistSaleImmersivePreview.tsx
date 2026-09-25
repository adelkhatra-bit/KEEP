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
  'Tu connais son univers. Maintenant, fais confiance à son oreille.',
  'Pas de titre. Pas de pochette. Juste le son.',
  'Chaque extrait est une pièce de sa sélection secrète.',
  'Funk, Techno, Pop… le mélange reste secret jusqu’au déblocage.',
  'Le prochain extrait peut être celui que tu cherchais sans le savoir.',
  'Si ton oreille dit oui, débloque toute la collection.',
];

const EXPLAINER_LINES = [
  'Tous les extraits de cette collection défilent ici, sans révéler leur identité.',
  'Après déblocage, la collection rejoint ton Loki Music en privé par défaut.',
  'Tu pourras ensuite choisir de la rendre publique ou de la garder pour toi.',
  'Aucun titre, artiste ni vraie jaquette n’est envoyé à cet écran avant le déblocage.',
];

const ROTATE_MS = 4200;

interface Props {
  offer: PublicPlaylistSaleOffer;
  visible: boolean;
  onClose: () => void;
  onConfirmPurchase: (offer: PublicPlaylistSaleOffer) => void;
  busy?: boolean;
  purchaseEnabled?: boolean;
}

export default function PlaylistSaleImmersivePreview({ offer, visible, onClose, onConfirmPurchase, busy, purchaseEnabled = true }: Props) {
  const [marketingIndex, setMarketingIndex] = useState(0);
  const [explainerIndex, setExplainerIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [tracks, setTracks] = useState<PlaylistSalePreviewTrack[] | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.3))).current;
  const secretPulse = useRef(new Animated.Value(0)).current;
  const revealGlow = useRef(new Animated.Value(0)).current;
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
      () => { clearCountdown(); setPlaying(false); setSecondsLeft(0); },
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
    setDetailsOpen(false);
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
    // Écran stable : aucun texte ne défile pendant que l'utilisateur écoute.
    // Les détails restent derrière « En savoir plus ».
    return () => {
      live = false;
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
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(secretPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(secretPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    pulse.start();
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(revealGlow, { toValue: 1, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(revealGlow, { toValue: 0, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    glow.start();
    return () => { cancelled = true; loops.forEach((l) => l.stop()); pulse.stop(); glow.stop(); };
  }, [visible, bars, secretPulse, revealGlow]);

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
  const freeAccess = offer.paymentMode === 'FREE';
  const priceLabel = freeAccess
    ? `${offer.freePrice ?? 0} FREE`
    : `${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}`;
  const styleMixLabel = offer.genres?.length ? offer.genres.slice(0, 4).join(' · ') : 'Mix musical secret';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Fermer l'aperçu"><Text style={s.closeBtnText}>✕</Text></TouchableOpacity>

          <Animated.View style={[s.secretHero, { transform: [{ scale: secretPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] }]}>
            <View style={s.secretVinyl}><Text style={s.secretVinylNote}>♪</Text></View>
            <View style={s.secretHeroCopy}>
              <Text style={s.eyebrow}>SÉLECTION SECRÈTE</Text>
              <Text style={s.playlistName} numberOfLines={2}>{offer.playlistName}</Text>
              <Text style={s.secretHook}>Et si ton prochain coup de cœur était juste derrière ?</Text>
            </View>
          </Animated.View>
          <Text style={s.meta}>{trackCountLabel} découverte{trackCountLabel > 1 ? 's' : ''} · {styleMixLabel}</Text>
          <Text style={s.secretMeta}>Écoute sans voir. Laisse ton oreille décider.</Text>
          <View style={s.totalPricePill}><Text style={s.totalPriceLabel}>{offer.paymentMode === 'FREE' ? 'PRIX EN FREE' : 'PRIX TOTAL'}</Text><Text style={s.totalPriceValue}>{priceLabel}</Text></View>

          <View style={s.promiseBox}><Text style={s.promiseKicker}>UNE PORTE VERS UN AUTRE UNIVERS</Text><Text style={s.marketing}>Quelques secondes pour t’évader. Le reste se découvre derrière.</Text></View>

          <SwipeDeck
            enabled={!tracksLoading && !tracksUnavailable}
            resetKey={trackIndex}
            onSwipeLeft={() => playTrackAt(trackIndex - 1)}
            onSwipeRight={() => playTrackAt(trackIndex + 1)}
            leftLabel="◀ EXTRAIT PRÉCÉDENT"
            rightLabel="EXTRAIT SUIVANT ▶"
            hint={tracksUnavailable ? '' : 'Même geste que Swipe · tu changes d’extrait quand TU le décides'}
          >
            <TouchableOpacity
              style={s.swipeCard}
              activeOpacity={0.85}
              disabled={tracksLoading || tracksUnavailable}
              onPress={togglePlayPause}
              accessibilityLabel="Extrait masqué, appuie pour lire ou mettre en pause"
            >
              <View style={s.visual}>
                <Animated.View pointerEvents="none" style={[s.mysteryGlow, { opacity: revealGlow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] }), transform: [{ scale: revealGlow.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.08] }) }] }]} />
                <View style={s.mysteryLock}><Text style={s.mysteryLockText}>?</Text></View>
                {bars.map((bar, i) => (
                  <Animated.View key={i} style={[s.bar, { height: bar.interpolate({ inputRange: [0, 1], outputRange: [16, 64] }) }]} />
                ))}
              </View>
              {!tracksLoading && !tracksUnavailable ? <Text style={s.mysteryCaption}>MORCEAU {trackIndex + 1} · IDENTITÉ VERROUILLÉE</Text> : null}
              <Text style={s.trackStatus}>
                {tracksLoading
                  ? 'Chargement des extraits...'
                  : tracksUnavailable
                    ? 'Aperçu indisponible pour le moment'
                    : `Écoute secrète ${trackIndex + 1}/${tracks!.length}${playing ? ` · 0:${String(secondsLeft).padStart(2, '0')}` : ' · en pause'}`}
              </Text>
            </TouchableOpacity>
          </SwipeDeck>

          {!tracksLoading && !tracksUnavailable ? (
            <View style={s.previewControls}>
              <TouchableOpacity style={s.previewControlButton} onPress={() => playTrackAt(trackIndex - 1)}><Text style={s.previewControlText}>‹ PRÉCÉDENT</Text></TouchableOpacity>
              <TouchableOpacity style={s.previewPlayButton} onPress={togglePlayPause}><Text style={s.previewPlayText}>{playing ? 'Ⅱ PAUSE' : '▶ ÉCOUTER'}</Text></TouchableOpacity>
              <TouchableOpacity style={s.previewControlButton} onPress={() => playTrackAt(trackIndex + 1)}><Text style={s.previewControlText}>SUIVANT ›</Text></TouchableOpacity>
            </View>
          ) : null}

          {!tracksLoading && !tracksUnavailable ? (
            <View style={s.protectionBadge}>
              <Text style={s.protectionBadgeText}>🛡️ Préécoute protégée · extraits courts · identité masquée · lecture séquentielle</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.detailsToggle} onPress={() => setDetailsOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}>
            <Text style={s.detailsToggleText}>{detailsOpen ? 'Moins d’infos' : 'En savoir plus'}</Text><Text style={s.detailsChevron}>{detailsOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {detailsOpen ? <Text style={s.explainer}>{EXPLAINER_LINES[explainerIndex]}</Text> : null}

          {/* Adel (21/09/2026, décision 2) : "documente clairement dans
              l'UI que le vendeur doit confirmer réception, et prévois un
              encart avertissement acheteur" -- fonctionnement manuel tant
              que l'API PayPal réelle n'est pas intégrée. Encart permanent,
              pas seulement l'Alert transitoire après ouverture du lien. */}
          {purchaseEnabled && !freeAccess ? (
            <View style={s.manualNotice}>
              <Text style={s.manualNoticeText}>ℹ️ Le paiement se fait sur le lien personnel du créateur de la collection (hors Loki Music). Loki Music ne voit ni ne garantit ce paiement : l'accès se débloque quand le créateur confirme l'avoir reçu.</Text>
            </View>
          ) : null}

          {purchaseEnabled ? (
            <>
              <TouchableOpacity
                style={s.waiverRow}
                onPress={() => setWaiverAccepted((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: waiverAccepted }}
                accessibilityLabel={freeAccess ? `Confirmer l'utilisation de ${priceLabel} pour toute la collection` : 'Renonciation au droit de rétractation'}
              >
                <View style={[s.checkbox, waiverAccepted && s.checkboxOn]}>{waiverAccepted ? <Text style={s.checkboxMark}>✓</Text> : null}</View>
                <Text style={s.waiverText}>
                  {freeAccess
                    ? `Je confirme utiliser ${priceLabel} pour débloquer les ${trackCountLabel} morceau${trackCountLabel > 1 ? 'x' : ''} de cette collection en une seule fois.`
                    : 'Je demande l’accès numérique dès confirmation du paiement par le créateur de la collection et je renonce expressément à mon droit de rétractation de 14 jours dès le déblocage du contenu dans mon Loki Music.'}
                </Text>
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: waiverAccepted ? revealGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }) : 1 }] }}>
              <TouchableOpacity
                style={[s.buyButton, !waiverAccepted && s.buyButtonDisabled]}
                disabled={!waiverAccepted || busy}
                onPress={() => onConfirmPurchase(offer)}
                accessibilityLabel={`Débloquer et ajouter à mon Loki Music, ${priceLabel}`}
              >
                <Text style={[s.buyButtonText, !waiverAccepted && s.buyButtonTextDisabled]}>{busy ? '…' : `RÉVÉLER LA SÉLECTION · ${priceLabel}`}</Text>
              </TouchableOpacity>
              </Animated.View>
              <Text style={s.noRefund}>
                {freeAccess
                  ? `Un seul débit de ${priceLabel} débloque toute la collection. Aucun débit n’est effectué morceau par morceau.`
                  : 'Après confirmation du paiement et déblocage du contenu, aucun remboursement possible sur cet accès numérique déjà fourni.'}
              </Text>
            </>
          ) : (
            <View style={s.nativePreviewNotice}>
              <Text style={s.nativePreviewTitle}>APERÇU MOBILE ACTIF</Text>
              <Text style={s.nativePreviewText}>Tu peux écouter les extraits anonymes et parcourir les collections verrouillées. L’achat n’est pas activé dans cette version mobile.</Text>
            </View>
          )}
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
  secretHero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, padding: 12, borderRadius: 20, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primary },
  secretVinyl: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#09090D', borderWidth: 5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  secretVinylNote: { color: colors.primaryLight, fontSize: 28, fontWeight: '900' },
  secretHeroCopy: { flex: 1 },
  eyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  playlistName: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: 3 },
  secretHook: { color: colors.textPrimary, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 5 },
  meta: { color: colors.textMutedGrey, fontSize: 12, marginTop: 2 },
  secretMeta: { color: colors.primaryLight, fontSize: 10, lineHeight: 14, marginTop: 4, fontWeight: '800' },
  totalPricePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(45,225,194,.10)', borderWidth: 1, borderColor: 'rgba(45,225,194,.42)' },
  totalPriceLabel: { color: colors.textMutedGrey, fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  totalPriceValue: { color: colors.success, fontSize: 13, fontWeight: '900' },
  promiseBox: { marginTop: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.primaryFaint, borderWidth: 1, borderColor: colors.border },
  promiseKicker: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  marketing: { color: colors.textPrimary, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center', marginTop: 3 },
  swipeCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingVertical: 18, marginTop: 6 },
  visual: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, height: 92, position: 'relative', overflow: 'hidden', borderRadius: 18 },
  mysteryGlow: { position: 'absolute', width: 116, height: 116, borderRadius: 58, backgroundColor: colors.primary, top: -12 },
  mysteryLock: { position: 'absolute', top: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  mysteryLockText: { color: colors.primaryLight, fontSize: 24, fontWeight: '900' },
  mysteryCaption: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 7 },
  bar: { width: 8, borderRadius: 4, backgroundColor: colors.primary },
  trackStatus: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 10 },
  explainer: { color: colors.textMuted, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  detailsToggle: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 5, paddingHorizontal: 10 },
  detailsToggleText: { color: colors.primaryLight, fontSize: 11, fontWeight: '800' },
  detailsChevron: { color: colors.primaryLight, fontSize: 14, fontWeight: '900' },
  previewControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  previewControlButton: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  previewControlText: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  previewPlayButton: { flex: 1.15, minHeight: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  previewPlayText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
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
  buyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.25 },
  buyButtonTextDisabled: { color: colors.textMuted },
  noRefund: { color: colors.textMuted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  nativePreviewNotice: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: colors.primaryFaint, borderWidth: 1, borderColor: colors.primary },
  nativePreviewTitle: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  nativePreviewText: { color: colors.textPrimary, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
