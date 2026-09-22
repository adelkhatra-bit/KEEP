import React from 'react';
import { Image, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Adel (21/09/2026) : "Grille à colonnes fixes, largeurs fixes, alignement
 * vertical strict." Maquette interactive validée
 * (https://claude.ai/artifact/9X4dx8oMmCJ3hkRGndc7BW) : pochette 56×56,
 * zone titre flexible, carrés d'action 40×40 (rayon 10, fond #1A1A2E,
 * aucun texte, icône seule), chevron 24×24. Source de vérité UNIQUE pour
 * la mise en page d'une ligne de morceau -- appliquée telle quelle sur
 * MyMusicScreen.tsx, ProfilePublicScreen.tsx, PublicUserProfileScreen.tsx.
 *
 * Nommé `TrackActionRow` (pas `TrackRow`) : un composant `TrackRow.tsx`
 * DIFFÉRENT existe déjà (prompts Garder/Passer de l'écran Session) et est
 * utilisé par SessionRecapScreen.tsx -- vérifié avant d'écrire ce fichier,
 * jamais touché ni renommé.
 *
 * Alignement garanti par flexbox (largeur fixe + `flexShrink: 0` sur
 * chaque colonne) plutôt que des positions `x` absolues (validé par Adel :
 * plus robuste sur petit écran, même résultat visuel). `actions` est la
 * liste des carrés APRÈS Play (Like/État/Partager selon l'écran -- un
 * écran peut en avoir 1, 2 ou 3 selon ce qui a réellement un sens pour lui ;
 * jamais deux carrés différents pour un même concept d'état sur une même
 * ligne).
 */
export type TrackActionRowAction = {
  key: string;
  icon: string;
  counter?: number;
  /** Colore l'icône (jamais le fond du carré, qui reste #1A1A2E). */
  tone?: 'success' | 'pink' | 'gold';
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

export type TrackActionRowProps = {
  coverUrl?: string | null;
  coverFallbackText?: string;
  title: string;
  artist: string;
  dimmed?: boolean;
  lockIcon?: boolean;
  /**
   * Adel (21/09/2026) : "le morceau en vente doit rester visible dans la
   * liste, avec un badge EN VENTE ... il ne doit pas être caché." Pastille
   * courte sur la ligne du titre (jamais une 3e ligne -- la hauteur de la
   * rangée reste fixe), pour un statut qui ne doit pas exiger de déplier
   * le panneau pour être vu.
   */
  badge?: { label: string; onPress?: () => void };
  /** Rendu tel quel (typiquement <TrackPreviewButton square />) -- ce composant ne réimplémente jamais la logique audio. */
  playSlot: React.ReactNode;
  actions: TrackActionRowAction[];
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Contenu du panneau déplié (ex. badge 1er KEEP, "Découvert par", Public/Privé, Supprimer, Vendre). */
  children?: React.ReactNode;
};

const TONE_COLOR: Record<NonNullable<TrackActionRowAction['tone']>, string> = {
  success: colors.success,
  pink: '#FF5F83',
  gold: '#E8C766',
};

export default function TrackActionRow({
  coverUrl,
  coverFallbackText = '♪',
  title,
  artist,
  dimmed = false,
  lockIcon = false,
  badge,
  playSlot,
  actions,
  expandable = false,
  expanded = false,
  onToggleExpand,
  children,
}: TrackActionRowProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.row, dimmed && styles.rowDimmed]}>
        {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.cover} /> : <View style={[styles.cover, styles.coverFallback]}><Text style={styles.coverFallbackText}>{coverFallbackText}</Text></View>}
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {badge ? (
              <TouchableOpacity style={styles.badge} onPress={badge.onPress} disabled={!badge.onPress} accessibilityLabel={badge.label}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
        </View>
        {lockIcon ? <Text style={styles.lock} accessibilityLabel="Morceau privé">🔒</Text> : null}
        {playSlot}
        {actions.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.square}
            onPress={action.onPress}
            disabled={action.disabled}
            accessibilityLabel={action.accessibilityLabel}
            accessibilityRole="button"
          >
            <Text style={[styles.squareIcon, action.tone ? { color: TONE_COLOR[action.tone] } : null]}>{action.icon}</Text>
            {typeof action.counter === 'number' ? (
              <Text style={[styles.squareCounter, action.tone ? { color: TONE_COLOR[action.tone] } : null]}>{action.counter}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
        {expandable ? (
          <TouchableOpacity style={styles.chevron} onPress={onToggleExpand} accessibilityLabel={expanded ? 'Masquer les détails' : 'Voir les détails'} accessibilityRole="button">
            <Text style={styles.chevronText}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {expandable && expanded ? <View style={styles.panel}>{children}</View> : null}
    </View>
  );
}

const SQUARE = 40;
const COVER = 56;
const CHEVRON = 24;
const ROW_HEIGHT = 64;

const styles = StyleSheet.create({
  card: { borderRadius: 14, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, paddingHorizontal: 8, gap: 8 },
  rowDimmed: { opacity: 0.55 },
  cover: { width: COVER, height: COVER, borderRadius: 10, flexShrink: 0, backgroundColor: colors.backgroundElevated },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: colors.primaryLight, fontSize: 18, fontWeight: '900' },
  info: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  artist: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  badge: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: `${colors.success}22`, borderWidth: 1, borderColor: colors.success },
  badgeText: { color: colors.success, fontSize: 9, fontWeight: '900' },
  lock: { fontSize: 13 },
  square: { width: SQUARE, height: SQUARE, flexShrink: 0, borderRadius: 10, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' },
  squareIcon: { color: '#8B87A0', fontSize: 15, fontWeight: '900' },
  squareCounter: { color: colors.textMuted, fontSize: 8, fontWeight: '800', marginTop: 1 },
  chevron: { width: CHEVRON, height: CHEVRON, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  chevronText: { color: colors.textMuted, fontSize: 13, fontWeight: '900' },
  panel: { paddingHorizontal: 8, paddingBottom: 10, paddingTop: 8, gap: 6, borderTopWidth: 1, borderTopColor: colors.border },
});
