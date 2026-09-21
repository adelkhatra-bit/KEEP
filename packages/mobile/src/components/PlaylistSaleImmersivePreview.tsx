import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import PlaylistSalePreview from './PlaylistSalePreview';
import type { PublicPlaylistSaleOffer } from '../services/playlistSaleService';

/**
 * Aperçu immersif d'une découverte musicale en vente (Adel, 21/09/2026).
 * Réutilise PlaylistSalePreview pour l'audio (keep_playlist_sale_offer_preview_tracks,
 * déjà en place -- rien de réinventé côté masquage/lecture 15s). N'ajoute que
 * l'habillage : visuel animé léger, textes qui tournent, et le déblocage
 * (achat) avec la case de renonciation obligatoire au droit de rétractation
 * (conformité Code de la consommation -- contenu numérique fourni
 * immédiatement, voir docs/legal/CGV.md).
 *
 * Vocabulaire (mission conformité 21/09/2026) : on ne "vend" jamais une
 * musique ni un artiste -- on donne accès à une DÉCOUVERTE musicale
 * (sélection curatée). Aucun titre, artiste ni jaquette n'apparaît ici tant
 * que l'achat n'est pas confirmé.
 */
const MARKETING_LINES = [
  'Cette découverte est très réclamée en ce moment.',
  'Une sélection musicale rare, à débloquer avant qu’elle ne file.',
  'D’autres l’ont déjà rejointe dans leur Loki.',
];

const EXPLAINER_LINES = [
  'Après l’accès, cette découverte est liée directement à ton profil Loki.',
  'Tu choisis ensuite de la rendre publique ou de la garder pour toi.',
  'Aucun titre ni artiste n’est jamais dévoilé avant l’accès.',
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
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.3))).current;
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    if (!visible) return undefined;
    setWaiverAccepted(false);
    const marketingTimer = setInterval(() => setMarketingIndex((i) => (i + 1) % MARKETING_LINES.length), ROTATE_MS);
    const explainerTimer = setInterval(() => setExplainerIndex((i) => (i + 1) % EXPLAINER_LINES.length), ROTATE_MS + 900);
    return () => { clearInterval(marketingTimer); clearInterval(explainerTimer); };
  }, [visible]);

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Fermer l'aperçu"><Text style={s.closeBtnText}>✕</Text></TouchableOpacity>

          <Text style={s.eyebrow}>DÉCOUVERTE À DÉBLOQUER</Text>
          <Text style={s.playlistName} numberOfLines={2}>{offer.playlistName}</Text>
          <Text style={s.meta}>{offer.trackCount} titre{offer.trackCount > 1 ? 's' : ''} · masqués jusqu'à l'accès</Text>

          <View style={s.visual}>
            {bars.map((bar, i) => (
              <Animated.View key={i} style={[s.bar, { height: bar.interpolate({ inputRange: [0, 1], outputRange: [16, 64] }) }]} />
            ))}
          </View>

          <Text style={s.marketing}>{MARKETING_LINES[marketingIndex]}</Text>
          <Text style={s.explainer}>{EXPLAINER_LINES[explainerIndex]}</Text>

          <PlaylistSalePreview playlistId={offer.playlistId} trackCount={offer.trackCount} />

          <TouchableOpacity style={s.waiverRow} onPress={() => setWaiverAccepted((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: waiverAccepted }} accessibilityLabel="Renonciation au droit de rétractation">
            <View style={[s.checkbox, waiverAccepted && s.checkboxOn]}>{waiverAccepted ? <Text style={s.checkboxMark}>✓</Text> : null}</View>
            <Text style={s.waiverText}>Je reconnais que l'accès à cette découverte musicale est fourni immédiatement après paiement et je renonce expressément à mon droit de rétractation de 14 jours.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.buyButton, !waiverAccepted && s.buyButtonDisabled]}
            disabled={!waiverAccepted || busy}
            onPress={() => onConfirmPurchase(offer)}
            accessibilityLabel={`Débloquer cette découverte pour ${(offer.priceCents / 100).toFixed(2)} ${offer.currencyCode}`}
          >
            <Text style={[s.buyButtonText, !waiverAccepted && s.buyButtonTextDisabled]}>{busy ? '…' : `Débloquer cette découverte · ${(offer.priceCents / 100).toFixed(2)}${offer.currencyCode === 'EUR' ? '€' : ` ${offer.currencyCode}`}`}</Text>
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
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  visual: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, height: 72, marginTop: 16, marginBottom: 4 },
  bar: { width: 8, borderRadius: 4, backgroundColor: colors.primary },
  marketing: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 10, minHeight: 20 },
  explainer: { color: colors.textMuted, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 4, minHeight: 32 },
  waiverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: 10, borderRadius: 12, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
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
