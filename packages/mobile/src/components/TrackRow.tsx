import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderPlaylist } from '@keep/music';
import { SessionTrackEntry } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

interface Props {
  entry: SessionTrackEntry;
  onKeep?: (entryId: string, playlistId?: string) => void;
  onPass?: (entryId: string) => void;
  /** Playlists disponibles pour "choisir où les ranger" — sans elles, GARDER utilise la recommandation SmartPlaylistRouter n°1. */
  playlists?: ProviderPlaylist[];
}

/**
 * Ligne compacte "esprit Spotify/Apple Music" — remplace l'ancienne
 * pochette 260x260. Une jaquette ~56x56, titre/artiste/album, statut ou
 * actions GARDER/PASSER.
 */
export default function TrackRow({ entry, onKeep, onPass, playlists }: Props) {
  const { t } = useTranslation();
  const { track, status } = entry;
  const topPlaylistName = entry.recommendations[0]?.playlistName;

  const handleKeepPress = () => {
    if (!playlists || playlists.length <= 1 || !onKeep) {
      onKeep?.(entry.id);
      return;
    }
    Alert.alert(
      t('session.chooseDestination'),
      undefined,
      playlists.map((p) => ({ text: p.name, onPress: () => onKeep(entry.id, p.id) }))
    );
  };

  return (
    <View style={styles.row}>
      {track.artworkUrl ? (
        <Image source={{ uri: track.artworkUrl }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.artworkPlaceholder]}>
          <Text style={styles.artworkGlyph}>♪</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
        {track.album && <Text style={styles.album} numberOfLines={1}>{track.album}</Text>}
      </View>

      {status === 'pending' && (onKeep || onPass) ? (
        <View style={styles.actions}>
          {onPass && (
            <TouchableOpacity style={styles.passBtn} onPress={() => onPass(entry.id)} hitSlop={8}>
              <Text style={styles.passBtnText}>✕</Text>
            </TouchableOpacity>
          )}
          {onKeep && (
            <TouchableOpacity style={styles.keepBtn} onPress={handleKeepPress} hitSlop={8}>
              <Text style={styles.keepBtnText}>✓</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.statusBadge}>
          {status === 'kept' && <Text style={styles.keptText}>✓ {topPlaylistName ?? t('listen.keep')}</Text>}
          {status === 'passed' && <Text style={styles.passedText}>{t('listen.pass')}</Text>}
          {status === 'pending' && <Text style={styles.pendingText}>•</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  artwork: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.backgroundCard },
  artworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  artworkGlyph: { color: colors.textMuted, fontSize: 20 },
  info: { flex: 1, minWidth: 0 },
  title: { ...typography.bodyBold, color: colors.textPrimary },
  artist: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  album: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  passBtn: {
    width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.pass,
    alignItems: 'center', justifyContent: 'center',
  },
  passBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  keepBtn: {
    width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.keep,
    alignItems: 'center', justifyContent: 'center',
  },
  keepBtnText: { color: colors.black, fontWeight: '700', fontSize: 15 },
  statusBadge: { minWidth: 60, alignItems: 'flex-end' },
  keptText: { color: colors.keep, fontSize: 12, fontWeight: '700' },
  passedText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  pendingText: { color: colors.textMuted, fontSize: 16 },
});
