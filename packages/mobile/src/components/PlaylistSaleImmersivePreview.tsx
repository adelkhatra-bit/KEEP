import ChatDockHost from './ChatDockHost';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, Modal, Platform, ScrollView, Text, TouchableOpacity, View, StyleSheet, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import SwipeDeck from './SwipeDeck';
import { loadPlaylistSaleOfferOverlap, loadPlaylistSaleOfferPreviewTracks, PlaylistSaleOverlap, PlaylistSalePreviewTrack, PublicPlaylistSaleOffer } from '../services/playlistSaleService';
import { playAntiShazamPreviewSegment, playTrackPreviewFromGesture, stopAntiShazamPreview, unlockWebAudioForGesture } from '../services/audioPreviewService';
import { acceptMarketplacePaymentTerms } from '../services/musicAgoraService';

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
// Fenêtre en 3 couches (validée par Adel le 02/10/2026) : haut fixe (titre,
// vendeur, prix), milieu qui défile (écoute, détails), bas toujours visible
// (confirmation + déblocage). Tout texte de plus d'une ligne est réduit à une
// ligne avec un « en savoir plus » discret : l'utilisateur qui connaît déjà le
// fonctionnement n'a pas à relire.
const PAYPAL_FLOW_FULL = 'PAYPAL DIRECT · tu paies le créateur · il confirme la réception · Loki débloque la collection';
const NO_REFUND_FULL = 'Après confirmation du paiement et déblocage du contenu, aucun remboursement possible sur cet accès numérique déjà fourni.';
const MONEY_WAIVER_FULL = 'Je demande l’accès numérique dès confirmation du paiement par le créateur et je renonce à mon droit de rétractation une fois le contenu débloqué.';
const MARKETPLACE_TERMS_URL = `${(process.env.EXPO_PUBLIC_WEB_URL || 'https://adelkhatra-bit.github.io/KEEP').replace(/\/$/, '')}/terms/`;

function MoreToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Text
      style={s.moreLink}
      // Ne coche jamais la case parente : le lien reste un simple dépli.
      onPress={(e: any) => { e?.stopPropagation?.(); onToggle(); }}
      accessibilityRole="button"
      suppressHighlighting
    >
      {open ? ' réduire' : ' en savoir plus'}
    </Text>
  );
}

interface Props {
  offer: PublicPlaylistSaleOffer;
  visible: boolean;
  onClose: () => void;
  onConfirmPurchase: (offer: PublicPlaylistSaleOffer) => void;
  busy?: boolean;
  purchaseEnabled?: boolean;
  moneyPurchaseEnabled?: boolean;
  ownerMode?: boolean;
  sourceUsername?: string;
  onOpenProfile?: () => void;
  freeBalance?: number | null;
  purchaseError?: string | null;
  onRechargeFree?: () => void;
  onRequestMissingTracks?: (offer: PublicPlaylistSaleOffer) => void;
  requestMissingBusy?: boolean;
}

export default function PlaylistSaleImmersivePreview({ offer, visible, onClose, onConfirmPurchase, busy, purchaseEnabled = true, moneyPurchaseEnabled = purchaseEnabled, ownerMode = false, sourceUsername, onOpenProfile, freeBalance = null, purchaseError = null, onRechargeFree, onRequestMissingTracks, requestMissingBusy = false }: Props) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const compact = windowHeight < 760 || windowWidth < 360;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleMore = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<'FREE' | 'MONEY'>(offer.paymentMode === 'MONEY' ? 'MONEY' : 'FREE');
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<PlaylistSalePreviewTrack[] | null>(null);
  const [overlap, setOverlap] = useState<PlaylistSaleOverlap | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.3))).current;
  const secretPulse = useRef(new Animated.Value(0)).current;
  const revealGlow = useRef(new Animated.Value(0)).current;
  const ctaGlow = useRef(new Animated.Value(0)).current;
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
    setPreviewError(null);
    clearCountdown();
    // La durée est renvoyée par le service afin que le compte à rebours reste
    // synchronisé avec l'extrait réellement joué.
    void playAntiShazamPreviewSegment(
      previewKeyRef.current,
      available[safeIdx].previewUrl,
      (isPlaying) => setPlaying(isPlaying),
      () => { clearCountdown(); setPlaying(false); setSecondsLeft(0); },
    ).then((durationMs) => {
      setSecondsLeft(Math.round(durationMs / 1000));
      countdownRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    }).catch(() => {
      clearCountdown();
      setPlaying(false);
      setSecondsLeft(0);
      setPreviewError('Lecture impossible. Appuie sur ▶ pour réessayer.');
    });
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
    setSelectedPaymentMode(offer.paymentMode === 'MONEY' ? 'MONEY' : 'FREE');
    setTermsBusy(false);
    setTermsError(null);
    setDetailsOpen(false);
    setExpanded({});
    setTracks(null);
    setOverlap(null);
    tracksRef.current = null;
    setTrackIndex(0);
    setPlaying(false);
    setPreviewError(null);
    let live = true;
    // Toujours décochée à chaque ouverture : cette transaction exige un geste
    // explicite, même si le compte avait accepté les CGU auparavant.
    Promise.all([
      loadPlaylistSaleOfferPreviewTracks(offer.playlistId, offer.offerId),
      loadPlaylistSaleOfferOverlap(offer.offerId).catch(() => null),
    ]).then(([loaded, overlapResult]) => {
      if (!live) return;
      setTracks(loaded);
      setOverlap(overlapResult);
      tracksRef.current = loaded;
      // Le tap sur la carte a déjà déverrouillé l'audio dans le profil.
      // On lance donc immédiatement la première pépite dès que la RPC masquée
      // a livré les previews, sans imposer un deuxième tap « Écouter ».
      if (loaded.length > 0) playTrackAt(0);
    }).catch(() => { if (live) { setTracks([]); setOverlap(null); tracksRef.current = []; setPreviewError('Les extraits protégés ne sont pas disponibles pour le moment.'); } });
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
      Animated.timing(secretPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(secretPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    pulse.start();
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(revealGlow, { toValue: 1, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(revealGlow, { toValue: 0, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    glow.start();
    const cta = Animated.loop(Animated.sequence([
      Animated.timing(ctaGlow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(ctaGlow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    cta.start();
    return () => { cancelled = true; loops.forEach((l) => l.stop()); pulse.stop(); glow.stop(); cta.stop(); };
  }, [visible, bars, secretPulse, revealGlow, ctaGlow]);

  function togglePlayPause() {
    const available = tracksRef.current;
    const currentTrack = available?.[trackIndex];
    if (!currentTrack?.previewUrl) return;

    if (playing) {
      clearCountdown();
      void stopAntiShazamPreview(previewKeyRef.current);
      setPlaying(false);
      return;
    }

    clearCountdown();
    setPreviewError(null);
    setSecondsLeft(Math.round(15000 / 1000));

    // Le bouton ▶ est un vrai geste utilisateur : on appelle play() dans ce
    // geste, sans attendre un loader/Promise qui ferait perdre l'autorisation
    // autoplay sur Safari/iPhone.
    void playTrackPreviewFromGesture(
      previewKeyRef.current,
      currentTrack.previewUrl,
      (isPlaying) => setPlaying(isPlaying),
      () => { clearCountdown(); setPlaying(false); setSecondsLeft(0); },
      15000,
    ).then(() => {
      setPlaying(true);
      countdownRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    }).catch(() => {
      setPlaying(false);
      setSecondsLeft(0);
      setPreviewError('Lecture impossible. Appuie à nouveau sur ▶.');
    });
  }

  const tracksLoading = tracks === null;
  const tracksUnavailable = tracks !== null && tracks.length === 0;
  const trackCountLabel = offer.trackCount || tracks?.length || 0;
  const dualAccess = offer.paymentMode === 'BOTH';
  const freeAccess = selectedPaymentMode === 'FREE';
  const priceLabel = freeAccess
    ? `${offer.freePrice ?? 0} FREE`
    : `${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}`;
  const styleMixLabel = offer.genres?.length ? offer.genres.slice(0, 3).join(' · ') : 'Mix musical secret';
  const requiredFree = Math.max(0, Number(offer.freePrice ?? 0));
  const freeInsufficient = freeAccess && freeBalance != null && freeBalance < requiredFree;
  const freeBlocked = freeAccess && Boolean(purchaseError || freeInsufficient);
  const normalizedUsername = sourceUsername?.replace(/^@+/, '') || '';
  const currentTrackOwned = ownerMode || Boolean(tracks?.[trackIndex]?.alreadyOwned);
  const allAlreadyOwned = ownerMode || Boolean(overlap && overlap.totalCount > 0 && overlap.missingCount === 0);
  const partiallyOwned = Boolean(overlap && overlap.ownedCount > 0 && overlap.missingCount > 0);

  const detailsTitle = ownerMode
    ? 'TA COLLECTION · DÉJÀ CHEZ TOI'
    : allAlreadyOwned
      ? 'TU AS DÉJÀ TOUTE CETTE COLLECTION'
    : partiallyOwned
      ? `CE QUE TU OBTIENS · ${overlap?.missingCount ?? 0} NOUVEAU${(overlap?.missingCount ?? 0) > 1 ? 'X' : ''}`
      : `CE QUE TU OBTIENS · ${trackCountLabel} MORCEAU${trackCountLabel > 1 ? 'X' : ''}`;
  const creditErrorFull = purchaseError || ('Tu as ' + (freeBalance ?? 0) + ' FREE, il en faut ' + requiredFree + '. Recharge tes FREE pour continuer.');
  const creditErrorShort = freeBalance != null ? `Tu as ${freeBalance} FREE, il en faut ${requiredFree}.` : 'Solde FREE insuffisant.';

  const acceptTerms = async () => {
    if (waiverAccepted || termsBusy) return;
    setTermsBusy(true);
    setTermsError(null);
    try {
      await acceptMarketplacePaymentTerms('playlist_sale');
      setWaiverAccepted(true);
    } catch {
      setWaiverAccepted(false);
      setTermsError('Impossible d’enregistrer ton acceptation. Réessaie avant de payer.');
    } finally {
      setTermsBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        {/* Hauteur = écran disponible (plus de plancher à 520 px qui poussait le
            bouton de déblocage hors de l'écran sur les petits téléphones). */}
        <View style={[s.card, compact && s.cardCompact, { maxHeight: windowHeight - 24 }]}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Fermer l'aperçu"><Text style={s.closeBtnText}>✕</Text></TouchableOpacity>

          {/* COUCHE 1 · fixe : titre, vendeur, prix */}
          <View style={s.layerTop}>
            <View style={[s.secretHero, compact && s.secretHeroCompact]}>
              <View style={s.secretVinyl}><Text style={s.secretVinylNote}>♪</Text></View>
              <View style={s.secretHeroCopy}>
                <Text style={s.eyebrow}>PÉPITES À DÉCOUVRIR</Text>
                <Text style={s.playlistName} numberOfLines={1}>{offer.playlistName}</Text>
              </View>
            </View>
            <Text style={s.meta} numberOfLines={1}>{trackCountLabel} découverte{trackCountLabel > 1 ? 's' : ''} · {styleMixLabel} · extrait 15 s</Text>

            <View style={s.sellerPriceRow}>
              {normalizedUsername && onOpenProfile ? (
                <TouchableOpacity style={s.profileLink} onPress={onOpenProfile} accessibilityLabel={'Voir le profil de ' + normalizedUsername}>
                  <Text style={s.profileLinkText}>{normalizedUsername}</Text>
                  <Text style={s.profileLinkArrow}>›</Text>
                </TouchableOpacity>
              ) : <View />}
              <View style={[s.totalPricePill, freeAccess ? s.totalPricePillFree : s.totalPricePillMoney]}>
                <Text style={[s.totalPriceLabel, freeAccess ? s.totalPriceLabelFree : s.totalPriceLabelMoney]}>{freeAccess ? 'FREE' : 'PAYPAL'}</Text>
                <Text style={[s.totalPriceValue, freeAccess ? s.totalPriceValueFree : s.totalPriceValueMoney]}>{priceLabel}</Text>
              </View>
            </View>
            {/* Toujours visible (comme l'original) : l'utilisateur voit tout de
                suite ce qu'il a déjà et ce qui est nouveau (Adel, 02/10/2026). */}
            {overlap && overlap.totalCount > 0 ? (
              <View style={[s.overlapSummary, allAlreadyOwned && s.overlapBarAll]}>
                <View style={s.overlapStat}><Text style={s.overlapStatValue}>{overlap.totalCount}</Text><Text style={s.overlapStatLabel}>TOTAL</Text></View>
                <View style={s.overlapDivider} />
                <View style={s.overlapStat}><Text style={[s.overlapStatValue, overlap.ownedCount > 0 && s.overlapOwned]}>{overlap.ownedCount}</Text><Text style={s.overlapStatLabel}>DÉJÀ CHEZ TOI</Text></View>
                <View style={s.overlapDivider} />
                <View style={s.overlapStat}><Text style={[s.overlapStatValue, overlap.missingCount > 0 && s.overlapNew]}>{overlap.missingCount}</Text><Text style={s.overlapStatLabel}>NOUVEAUX</Text></View>
              </View>
            ) : null}
            {allAlreadyOwned ? <Text style={s.overlapAllText}>✓ rien à reprendre</Text> : null}
          </View>

          {/* COUCHE 2 · défile : écoute, détails, PayPal, demande des manquants */}
          <ScrollView style={s.layerMiddle} showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={s.content}>
          <SwipeDeck
            enabled={!tracksLoading && !tracksUnavailable}
            resetKey={trackIndex}
            onSwipeLeft={() => { unlockWebAudioForGesture(); playTrackAt(trackIndex - 1); }}
            onSwipeRight={() => { unlockWebAudioForGesture(); playTrackAt(trackIndex + 1); }}
            leftLabel="◀ EXTRAIT PRÉCÉDENT"
            rightLabel="EXTRAIT SUIVANT ▶"
            hint={tracksUnavailable ? '' : 'Glisse pour changer de pépite'}
          >
            <TouchableOpacity
              style={s.swipeCard}
              activeOpacity={0.85}
              disabled={tracksLoading || tracksUnavailable}
              onPress={togglePlayPause}
              accessibilityLabel="Extrait masqué, appuie pour lire ou mettre en pause"
            >
              <Animated.View style={[s.visual, compact && s.visualCompact, {
                transform: reduceMotionRef.current ? [] : [
                  { perspective: 700 },
                  { rotateY: revealGlow.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] }) },
                  { rotateX: revealGlow.interpolate({ inputRange: [0, 1], outputRange: ['3deg', '-3deg'] }) },
                ],
              }]}>
                <Animated.View pointerEvents="none" style={[s.mysteryGlow, { opacity: revealGlow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] }), transform: [{ scale: revealGlow.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.08] }) }] }]} />
                <View style={s.mysteryLock}><Text style={s.mysteryLockText}>?</Text></View>
                {bars.map((bar, i) => (
                  <Animated.View key={i} style={[s.bar, { height: bar.interpolate({ inputRange: [0, 1], outputRange: [16, 64] }) }]} />
                ))}
              </Animated.View>
              {!tracksLoading && !tracksUnavailable ? (
                <View style={[s.trackOwnershipPill, currentTrackOwned ? s.trackOwnershipOwned : s.trackOwnershipNew]}>
                  <Text style={[s.trackOwnershipText, currentTrackOwned ? s.trackOwnershipTextOwned : s.trackOwnershipTextNew]}>
                    {currentTrackOwned ? '✓ TU L’AS DÉJÀ' : '✦ NOUVELLE POUR TOI'}
                  </Text>
                </View>
              ) : null}
              <Text style={s.trackStatus} numberOfLines={1}>
                {tracksLoading
                  ? 'Chargement des extraits...'
                  : tracksUnavailable
                    ? 'Aperçu indisponible pour le moment'
                    : previewError || `${trackIndex + 1}/${tracks!.length}${playing ? ` · 0:${String(secondsLeft).padStart(2, '0')}` : ' · appuie sur ▶ pour écouter'}`}
              </Text>
            </TouchableOpacity>
          </SwipeDeck>

          {!tracksLoading && !tracksUnavailable ? (
            <View style={[s.previewControls, compact && s.previewControlsCompact]}>
              <TouchableOpacity style={s.previewControlButton} onPress={() => { unlockWebAudioForGesture(); playTrackAt(trackIndex - 1); }}><Text style={s.previewControlText}>‹ PRÉCÉDENT</Text></TouchableOpacity>
              <Animated.View style={[s.ctaGlowShell,{borderColor:ctaGlow.interpolate({inputRange:[0,1],outputRange:[colors.primary,colors.success]})}]}><TouchableOpacity style={s.previewPlayButton} onPress={togglePlayPause}><Text style={s.previewPlayText}>{playing ? 'Ⅱ' : '▶'}</Text></TouchableOpacity></Animated.View>
              <TouchableOpacity style={s.previewControlButton} onPress={() => { unlockWebAudioForGesture(); playTrackAt(trackIndex + 1); }}><Text style={s.previewControlText}>SUIVANT ›</Text></TouchableOpacity>
            </View>
          ) : null}

          {/* « Ce que tu obtiens » : une ligne, dépliable (Total / Déjà chez
              toi / Nouveaux + explication, contenu inchangé). */}
          <View style={[s.unlockExplain, allAlreadyOwned && s.unlockExplainOwned]}>
            <TouchableOpacity
              style={s.detailsHeader}
              onPress={() => setDetailsOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel={`${detailsTitle}. ${detailsOpen ? 'Masquer le détail' : 'Afficher le détail'}`}
            >
              <Text style={[s.unlockExplainTitle, allAlreadyOwned && s.unlockExplainTitleOwned, s.detailsTitle]} numberOfLines={1}>{detailsTitle}</Text>
              <Text style={[s.detailsChevron, allAlreadyOwned && s.unlockExplainTitleOwned]}>{detailsOpen ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {detailsOpen ? (
              <>
                <Text style={s.unlockExplainText}>
                  {ownerMode
                    ? 'Tu vois ici exactement l’aperçu proposé aux visiteurs. Ce sont tes morceaux : aucun déblocage ni ajout n’est possible.'
                    : allAlreadyOwned
                      ? 'Aucun paiement ni FREE nécessaire : tous les morceaux sont déjà dans ta musique.'
                    : partiallyOwned
                      ? `Tu as déjà ${overlap?.ownedCount ?? 0} morceau${(overlap?.ownedCount ?? 0) > 1 ? 'x' : ''}. Ils ne seront jamais ajoutés en double. Le Drop sert à révéler uniquement ce qui te manque.`
                      : `Tu écoutes les extraits gratuitement. Le bouton ci-dessous sert uniquement à révéler cette collection et à ajouter ses morceaux à ton Loki Music.`}
                </Text>
              </>
            ) : null}
          </View>

          {/* Adel (21/09/2026, décision 2) : "documente clairement dans
              l'UI que le vendeur doit confirmer réception, et prévois un
              encart avertissement acheteur" -- fonctionnement manuel tant
              que l'API PayPal réelle n'est pas intégrée. Encart permanent,
              réduit à une ligne + « en savoir plus » (Adel, 02/10/2026). */}
          {purchaseEnabled && !freeAccess ? (
            <View style={s.moneyFlow}>
              <View style={s.moneyFlowDot} />
              <Text style={s.moneyFlowText}>
                {expanded.paypal ? PAYPAL_FLOW_FULL : 'PAYPAL DIRECT · validé par le créateur'}
                <MoreToggle open={Boolean(expanded.paypal)} onToggle={() => toggleMore('paypal')} />
              </Text>
            </View>
          ) : null}

          {partiallyOwned && onRequestMissingTracks ? (
            <TouchableOpacity
              style={s.missingRequestButton}
              disabled={requestMissingBusy}
              onPress={() => onRequestMissingTracks(offer)}
              accessibilityLabel={`Demander seulement les ${overlap?.missingCount ?? 0} morceaux manquants contre des FREE`}
            >
              <Text style={s.missingRequestTitle}>{requestMissingBusy ? '…' : `DEMANDER ${overlap?.missingCount ?? 0} MANQUANT${(overlap?.missingCount ?? 0) > 1 ? 'S' : ''}`}</Text>
              <Text style={s.missingRequestHint} numberOfLines={1}>Le créateur pourra te faire une offre en FREE.</Text>
            </TouchableOpacity>
          ) : null}
          </ScrollView>

          {/* COUCHE 3 · toujours visible : confirmation + déblocage */}
          <View style={s.layerBottom}>
          {ownerMode ? (
            <View style={[s.nativePreviewNotice, s.ownerPreviewNotice]}>
              <Text style={s.nativePreviewTitle}>TA COLLECTION · DÉJÀ CHEZ TOI</Text>
              <Text style={s.nativePreviewText}>Tu peux écouter les aperçus et contrôler exactement ce que verra un visiteur. Déblocage et ajout sont bloqués parce que cette collection est la tienne.</Text>
            </View>
          ) : purchaseEnabled ? (
            <>
              {dualAccess ? (
                <View style={s.dualChoice}>
                  <Text style={s.dualChoiceTitle}>CHOISIS TON MODE DE DÉBLOCAGE</Text>
                  <View style={s.dualChoiceRow}>
                    <TouchableOpacity style={[s.dualChoiceButton, selectedPaymentMode === 'FREE' && s.dualChoiceButtonOn]} onPress={() => { setSelectedPaymentMode('FREE'); setWaiverAccepted(false); setTermsError(null); }} accessibilityState={{ selected: selectedPaymentMode === 'FREE' }}>
                      <Text style={[s.dualChoiceButtonText, selectedPaymentMode === 'FREE' && s.dualChoiceButtonTextOn]}>⚡ {offer.freePrice ?? 0} FREE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.dualChoiceButton, selectedPaymentMode === 'MONEY' && s.dualChoiceButtonOn, !moneyPurchaseEnabled && s.dualChoiceButtonDisabled]} disabled={!moneyPurchaseEnabled} onPress={() => { setSelectedPaymentMode('MONEY'); setWaiverAccepted(false); setTermsError(null); }} accessibilityState={{ selected: selectedPaymentMode === 'MONEY', disabled: !moneyPurchaseEnabled }}>
                      <Text style={[s.dualChoiceButtonText, selectedPaymentMode === 'MONEY' && s.dualChoiceButtonTextOn]}>{moneyPurchaseEnabled ? `PAYPAL · ${(offer.priceCents / 100).toFixed(2).replace('.', ',')}${offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}` : 'PAYPAL INDISPONIBLE'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              {freeBlocked ? (
                <View style={s.creditError}>
                  <Text style={s.creditErrorTitle}>FREE INSUFFISANTS</Text>
                  <Text style={s.creditErrorText}>
                    {expanded.credit ? creditErrorFull : creditErrorShort}
                    {creditErrorFull !== creditErrorShort ? <MoreToggle open={Boolean(expanded.credit)} onToggle={() => toggleMore('credit')} /> : null}
                  </Text>
                  {onRechargeFree ? <TouchableOpacity style={s.rechargeButton} onPress={onRechargeFree} accessibilityLabel="Recharger mes FREE"><Text style={s.rechargeButtonText}>RECHARGER MES FREE</Text></TouchableOpacity> : null}
                </View>
              ) : null}

              <TouchableOpacity
                style={[s.waiverRow, waiverAccepted ? s.waiverRowAccepted : s.waiverRowPending]}
                onPress={() => { if (!waiverAccepted && !termsBusy) void acceptTerms(); }}
                disabled={termsBusy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: waiverAccepted, disabled: termsBusy }}
                accessibilityLabel={freeAccess ? `Accepter les conditions pour utiliser ${priceLabel} sur toute la collection` : 'Accepter les conditions générales et la renonciation au droit de rétractation'}
              >
                <View style={[s.checkbox, waiverAccepted ? s.checkboxOn : s.checkboxPending]}>
                  {waiverAccepted ? <Text style={s.checkboxMark}>✓</Text> : <Text style={s.checkboxMarkPending}>{termsBusy ? '…' : '!'}</Text>}
                </View>
                <View style={s.waiverCopy}>
                  <Text style={[s.waiverState, waiverAccepted ? s.waiverStateAccepted : s.waiverStatePending]}>
                    {waiverAccepted ? '✓ CONDITIONS ACCEPTÉES' : termsBusy ? 'VALIDATION…' : 'CONDITIONS À ACCEPTER'}
                  </Text>
                  <Text style={s.waiverText}>
                    {freeAccess
                      ? `J’accepte les Conditions générales Loki Music et l’utilisation de ${priceLabel} pour débloquer toute cette collection.`
                      : expanded.waiver ? MONEY_WAIVER_FULL : 'J’accepte les Conditions générales Loki Music et l’accès dès confirmation du paiement, sans rétractation après déblocage.'}
                    {!freeAccess ? <MoreToggle open={Boolean(expanded.waiver)} onToggle={() => toggleMore('waiver')} /> : null}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.termsLink}
                onPress={() => { void Linking.openURL(MARKETPLACE_TERMS_URL); }}
                accessibilityRole="link"
                accessibilityLabel="Lire les Conditions générales Loki Music"
              >
                <Text style={s.termsLinkText}>LIRE LES CONDITIONS GÉNÉRALES</Text>
              </TouchableOpacity>
              {termsError ? <Text style={s.termsError}>{termsError}</Text> : null}

              <Animated.View style={[s.buyGlowShell,{ borderColor: ctaGlow.interpolate({inputRange:[0,1],outputRange:[colors.primary,colors.success]}), transform: [{ scale: waiverAccepted ? revealGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }) : 1 }] }]}>
              <TouchableOpacity
                style={[s.buyButton, (!waiverAccepted || freeBlocked || allAlreadyOwned) && s.buyButtonDisabled]}
                disabled={!waiverAccepted || busy || freeBlocked || allAlreadyOwned}
                onPress={() => onConfirmPurchase(dualAccess ? { ...offer, paymentMode: selectedPaymentMode } : offer)}
                accessibilityLabel={allAlreadyOwned ? 'Tu as déjà tous les morceaux' : freeBlocked ? 'FREE insuffisants, recharge nécessaire' : freeAccess ? `Débloquer la collection avec ${priceLabel}` : `Commencer ma transaction PayPal, ${priceLabel}`}
              >
                <Text style={[s.buyButtonText, (!waiverAccepted || freeBlocked || allAlreadyOwned) && s.buyButtonTextDisabled]} numberOfLines={1}>{busy ? '…' : allAlreadyOwned ? 'DÉJÀ DANS TA MUSIQUE' : freeBlocked ? 'FREE INSUFFISANTS' : !waiverAccepted ? 'ACCEPTE LES CONDITIONS POUR CONTINUER' : freeAccess ? `DÉBLOQUER LA COLLECTION · ${priceLabel}` : `COMMENCER MA TRANSACTION · ${priceLabel}`}</Text>
              </TouchableOpacity>
              </Animated.View>
              {!freeAccess ? <Text style={s.noRefund}>{expanded.refund ? NO_REFUND_FULL : 'Aucun remboursement après déblocage.'}<MoreToggle open={Boolean(expanded.refund)} onToggle={() => toggleMore('refund')} /></Text> : null}
            </>
          ) : (
            <View style={s.nativePreviewNotice}>
              <Text style={s.nativePreviewTitle}>PAIEMENT À ACTIVER</Text>
              <Text style={s.nativePreviewText}>
                {expanded.native ? 'Le créateur doit avoir un lien de paiement personnel actif pour débloquer cette collection.' : 'Lien de paiement du créateur inactif.'}
                <MoreToggle open={Boolean(expanded.native)} onToggle={() => toggleMore('native')} />
              </Text>
            </View>
          )}
          </View>
        </View>
      </View>
      <ChatDockHost active={visible} />
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(3,2,7,0.86)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.backgroundElevated, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'column', position: 'relative', overflow: 'hidden' },
  layerTop: { paddingBottom: 6 },
  layerMiddle: { flexGrow: 0, flexShrink: 1 },
  layerBottom: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailsTitle: { flex: 1 },
  moreLink: { color: colors.primaryLight, fontSize: 10, fontWeight: '800' },
  cardCompact:{padding:10,borderRadius:20},
  content:{paddingTop:2,paddingBottom:4},
  closeBtn: { position: 'absolute', right: 12, top: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  closeBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  secretHero: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 4, padding: 10, paddingRight:44, borderRadius: 18, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  secretHeroCompact:{paddingVertical:7,minHeight:64},
  secretVinyl: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#09090D', borderWidth: 5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  secretVinylNote: { color: colors.primaryLight, fontSize: 28, fontWeight: '900' },
  secretHeroCopy: { flex: 1 },
  eyebrow: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  playlistName: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', marginTop: 3 },
  meta: { color: colors.textMutedGrey, fontSize: 11, lineHeight: 16, marginTop: 6 },
  sellerPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  profileLink: { flexShrink: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard },
  profileLinkText: { color: colors.primaryLight, fontSize: 10, fontWeight: '900' },
  profileLinkArrow: { color: colors.primaryLight, fontSize: 16, fontWeight: '900' },
  totalPricePill: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  // Boutique vendeur (02/10/2026) : FREE = violet, € = or, partout.
  totalPricePillFree: { backgroundColor: 'rgba(124,92,252,.18)', borderColor: colors.primaryLight },
  totalPricePillMoney: { backgroundColor: 'rgba(232,194,106,.14)', borderColor: '#E8C26A' },
  totalPriceLabel: { fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  totalPriceLabelFree: { color: colors.primaryLight },
  totalPriceLabelMoney: { color: '#E8C26A' },
  totalPriceValue: { fontSize: 13, fontWeight: '900' },
  totalPriceValueFree: { color: '#FFFFFF' },
  totalPriceValueMoney: { color: '#E8C26A' },
  overlapSummary:{marginTop:7,minHeight:46,borderRadius:12,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,paddingHorizontal:8,paddingVertical:6,flexDirection:'row',alignItems:'center',position:'relative'},
  overlapBarAll:{borderColor:colors.success,backgroundColor:'rgba(45,225,194,.08)'},
  overlapStat:{flex:1,alignItems:'center',justifyContent:'center'},
  overlapStatValue:{color:colors.textPrimary,fontSize:13,fontWeight:'900',lineHeight:16},
  overlapStatLabel:{color:colors.textMuted,fontSize:9,fontWeight:'900',letterSpacing:.75,marginTop:1},
  overlapOwned:{color:colors.success},
  overlapNew:{color:colors.primaryLight},
  overlapDivider:{width:1,height:24,backgroundColor:colors.border},
  overlapAllText:{color:colors.success,fontSize:9,fontWeight:'900',marginTop:5},
  unlockExplain:{marginTop:7,borderRadius:13,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint,paddingHorizontal:10,paddingVertical:8},
  unlockExplainOwned:{borderColor:colors.success,backgroundColor:'rgba(45,225,194,.07)'},
  unlockExplainTitle:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:.65},
  unlockExplainTitleOwned:{color:colors.success},
  unlockExplainText:{color:colors.textPrimary,fontSize:10,lineHeight:15,fontWeight:'700',marginTop:3},
  trackOwnershipPill:{marginTop:7,minHeight:24,borderRadius:12,borderWidth:1,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},
  trackOwnershipOwned:{borderColor:colors.success,backgroundColor:'rgba(45,225,194,.08)'},
  trackOwnershipNew:{borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  trackOwnershipText:{fontSize:9,fontWeight:'900',letterSpacing:.65},
  trackOwnershipTextOwned:{color:colors.success},
  trackOwnershipTextNew:{color:colors.primaryLight},
  missingRequestButton:{marginTop:8,minHeight:48,borderRadius:16,borderWidth:1,borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  missingRequestTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.45},
  missingRequestHint:{color:colors.textMuted,fontSize:9,fontWeight:'700',marginTop:2},
  swipeCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingVertical: 18, marginTop: 6 },
  visual: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, height: 72, position: 'relative', overflow: 'hidden', borderRadius: 18 },
  visualCompact:{height:58},
  mysteryGlow: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: colors.primary, top: -12 },
  mysteryLock: { position: 'absolute', top: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  mysteryLockText: { color: colors.primaryLight, fontSize: 24, fontWeight: '900' },
  bar: { width: 8, borderRadius: 4, backgroundColor: colors.primary },
  trackStatus: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 10 },
  detailsChevron: { color: colors.primaryLight, fontSize: 14, fontWeight: '900' },
  previewControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  previewControlsCompact:{marginTop:4},
  previewControlButton: { flex: 1, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  previewControlText: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  ctaGlowShell:{flex:1.15,borderWidth:2,borderRadius:25,padding:2,backgroundColor:colors.backgroundElevated},
  previewPlayButton: { minHeight: 42, borderRadius: 21, backgroundColor: colors.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  previewPlayText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  creditError: { marginTop: 9, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,92,114,0.10)', borderWidth: 1, borderColor: colors.danger },
  creditErrorTitle: { color: colors.danger, fontSize: 11, fontWeight: '900', letterSpacing: .8 },
  creditErrorText: { color: colors.danger, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 4 },
  rechargeButton: { width: '100%', minHeight: 42, marginTop: 9, borderRadius: 21, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  rechargeButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  moneyFlow:{marginTop:6,minHeight:38,borderRadius:12,borderWidth:1,borderColor:'rgba(167,139,250,.42)',backgroundColor:'rgba(124,92,252,.09)',paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:8},
  moneyFlowDot:{width:7,height:7,borderRadius:4,backgroundColor:colors.primaryLight,flexShrink:0},
  moneyFlowText:{flex:1,color:colors.textSecondary,fontSize:9.5,lineHeight:14,fontWeight:'800'},
  waiverRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 7, padding: 9, borderRadius: 12, backgroundColor: colors.backgroundCard, borderWidth: 2 },
  waiverRowPending: { borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.08)' },
  waiverRowAccepted: { borderColor: colors.success, backgroundColor: 'rgba(45,225,194,.08)' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxPending: { borderColor: colors.danger, backgroundColor: 'rgba(255,92,114,.16)' },
  checkboxOn: { backgroundColor: colors.success, borderColor: colors.success },
  checkboxMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  checkboxMarkPending: { color: colors.danger },
  waiverCopy: { flex: 1, minWidth: 0 },
  waiverState: { fontSize: 9, fontWeight: '900', letterSpacing: .5, marginBottom: 3 },
  waiverStatePending: { color: colors.danger },
  waiverStateAccepted: { color: colors.success },
  waiverText: { flex: 1, color: colors.textPrimary, fontSize: 11.5, lineHeight: 16 },
  termsLink: { width: '100%', minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  termsLinkText: { color: colors.primaryLight, fontSize: 9.5, fontWeight: '900', textDecorationLine: 'underline' },
  termsError: { color: colors.danger, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 2 },
  buyGlowShell: { width: '100%', borderWidth: 1, borderRadius: 18, padding: 2 },
  buyButton: { width: '100%', minHeight: 46, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buyButtonDisabled: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  buyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.25 },
  buyButtonTextDisabled: { color: colors.textMuted },
  noRefund: { color: colors.textMuted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  nativePreviewNotice: { marginTop: 6, padding: 12, borderRadius: 16, backgroundColor: colors.primaryFaint, borderWidth: 1, borderColor: colors.primary },
  ownerPreviewNotice: { borderColor: colors.keep, backgroundColor: 'rgba(229,242,102,.08)' },
  nativePreviewTitle: { color: colors.primaryLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  nativePreviewText: { color: colors.textPrimary, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
