import React from 'react';
import { Image, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Mission C (23/09/2026) — Ligne d'un morceau VERROUILLÉ (en vente) sur un
 * profil tiers. Jusqu'ici les morceaux d'une offre active étaient totalement
 * masqués des vues publiques gratuites (voir loadMaskedPlaylistSaleTrackIds).
 * Adel : "le morceau en vente doit rester visible dans la liste, avec un
 * badge EN VENTE ... il ne doit pas être caché." Ce composant les rend donc
 * visibles SANS jamais trahir le modèle Anti-Shazam : le titre affiché est
 * toujours « ??? » et l'artiste « Artiste masqué », la pochette est floutée
 * et coiffée d'un cadenas. Les vrais titre/artiste/jaquette ne sont jamais
 * révélés tant que l'achat n'est pas payé, même si le parent les passe. Le
 * clic délègue au parent (onUnlockPress) qui ouvre l'aperçu immersif
 * waveform + CTA « Débloquer ».
 *
 * S'appuie sur la même grammaire visuelle que TrackActionRow.tsx (source de
 * vérité de la ligne morceau : pochette 56×56, rayon 14, fond backgroundCard,
 * bordure border) pour rester cohérent avec le reste des listes de morceaux.
 * Tokens colors.ts uniquement — aucune couleur en dur.
 */
export interface LockedTrackRowProps {
  track: { id: string; title?: string; artistName?: string; thumbnailUrl?: string };
  priceCents: number;
  /** Par défaut EUR (« € »). Toute autre devise est affichée après le montant. */
  currencyCode?: string;
  onUnlockPress: () => void;
}

/** Anti-Shazam : jamais le vrai titre/artiste, quelle que soit la donnée reçue. */
const MASKED_TITLE = '???';
const MASKED_ARTIST = 'Artiste masqué';

function formatPrice(priceCents: number, currencyCode: string): string {
  const amount = (priceCents / 100).toFixed(2).replace('.', ',');
  return currencyCode === 'EUR' ? `${amount}€` : `${amount} ${currencyCode}`;
}

export default function LockedTrackRow({
  track,
  priceCents,
  currencyCode = 'EUR',
  onUnlockPress,
}: LockedTrackRowProps) {
  const priceLabel = formatPrice(priceCents, currencyCode);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.coverWrap}>
          {track.thumbnailUrl ? (
            <Image source={{ uri: track.thumbnailUrl }} style={styles.cover} blurRadius={16} />
          ) : (
            <View style={[styles.cover, styles.coverFallback]}>
              <Text style={styles.coverFallbackText}>♪</Text>
            </View>
          )}
          <View style={styles.lockOverlay}>
            <Text style={styles.lockOverlayIcon}>🔒</Text>
          </View>
        </View>

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{MASKED_TITLE}</Text>
            <View style={styles.badge} accessibilityLabel="En vente">
              <Text style={styles.badgeText}>EN VENTE</Text>
            </View>
          </View>
          <Text style={styles.artist} numberOfLines={1}>{MASKED_ARTIST}</Text>
        </View>

        <TouchableOpacity
          style={styles.unlockButton}
          onPress={onUnlockPress}
          accessibilityRole="button"
          accessibilityLabel={`Débloquer cette découverte, ${priceLabel}`}
        >
          <Text style={styles.unlockButtonLabel}>Débloquer</Text>
          <Text style={styles.unlockButtonPrice}>{priceLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const COVER = 56;
const ROW_HEIGHT = 64;

const styles = StyleSheet.create({
  card: { borderRadius: 14, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, paddingHorizontal: 8, gap: 8 },
  coverWrap: { width: COVER, height: COVER, flexShrink: 0, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  cover: { width: COVER, height: COVER, borderRadius: 10, backgroundColor: colors.backgroundElevated },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: colors.primaryLight, fontSize: 18, fontWeight: '900' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  lockOverlayIcon: { fontSize: 20 },
  info: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, color: colors.textMutedGrey, fontSize: 13, fontWeight: '800' },
  badge: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  badgeText: { color: colors.danger, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  artist: { color: colors.textMutedGrey, fontSize: 11, marginTop: 2 },
  unlockButton: { flexShrink: 0, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  unlockButtonLabel: { color: colors.white, fontSize: 11, fontWeight: '900' },
  unlockButtonPrice: { color: colors.white, fontSize: 10, fontWeight: '800', marginTop: 1 },
});
