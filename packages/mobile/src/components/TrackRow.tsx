import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderPlaylist } from '@keep/music';
import { SessionTrackEntry } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { AppAlert as Alert } from '../utils/AppAlert';

interface Props {
  entry: SessionTrackEntry;
  onKeep?: (entryId: string, playlistId?: string) => void;
  onPass?: (entryId: string) => void;
  /** Playlists disponibles pour "choisir où les ranger" — sans elles, GARDER utilise la recommandation SmartPlaylistRouter n°1. */
  playlists?: ProviderPlaylist[];
}

const PLATFORM_LABEL: Record<string, string> = {
  spotify: 'Spotify', apple_music: 'Apple Music', youtube: 'YouTube', youtube_music: 'YouTube Music',
};
const STATUS_ICON: Record<string, string> = { found: '✅', not_found: '❌', unknown: '❓' };

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

  // KEEP est un miroir, jamais un hébergeur : dès qu'un morceau est
  // identifié, un lien réel (AudD song_link) permet d'ouvrir directement les
  // plateformes où il est disponible -- jamais une lecture simulée dans KEEP
  // (cf. demande explicite du 22/08/2026).
  const openSongLink = () => {
    if (track.songLink) Linking.openURL(track.songLink).catch(() => {});
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={openSongLink} disabled={!track.songLink} activeOpacity={track.songLink ? 0.7 : 1} style={styles.tapArea}>
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
          {!!entry.availability?.length && (
            <Text style={styles.availabilityLine} numberOfLines={1}>
              {entry.availability.map((a) => `${STATUS_ICON[a.status]} ${PLATFORM_LABEL[a.providerId] ?? a.providerId}`).join('  ')}
            </Text>
          )}
          {!!track.songLink && <Text style={styles.listenLink}>{t('listen.findOnPlatforms')}</Text>}
        </View>
      </TouchableOpacity>

      {status === 'pending' && (onKeep || onPass) ? (
        <View style={styles.actions}>
          {!!track.songLink && (
            <TouchableOpacity style={styles.relistenBtn} onPress={openSongLink} hitSlop={8}>
              <Text style={styles.relistenBtnText}>🔊</Text>
            </TouchableOpacity>
          )}
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
          {status === 'kept' && entry.syncState === 'waiting_sync' && <Text style={styles.keptText}>✓ {t('listen.keep')}</Text>}
          {status === 'kept' && entry.syncState !== 'waiting_sync' && <Text style={styles.keptText}>✓ {topPlaylistName ?? t('listen.keep')}</Text>}
          {status === 'passed' && <Text style={styles.passedText}>{t('listen.pass')}</Text>}
          {status === 'already_owned' && (
            <Text style={styles.alreadyOwnedText} numberOfLines={2}>
              {track.album ? t('session.alreadyOwnedIn', { album: track.album }) : t('session.alreadyOwned')}
            </Text>
          )}
          {status === 'pending' && <Text style={styles.pendingText}>•</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  // 52 -> 48 (audit Design System du 24/08/2026, docs/KEEP_DESIGN_SYSTEM.md)
  // -- taille unifiée "jaquette en ligne de liste" avec MyMusicScreen/ProfileScreen.
  artwork: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.backgroundCard },
  artworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  artworkGlyph: { color: colors.textMuted, fontSize: 20 },
  info: { flex: 1, minWidth: 0 },
  title: { ...typography.bodyBold, color: colors.textPrimary },
  artist: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  album: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontStyle: 'italic' },
  availabilityLine: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  tapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listenLink: { color: colors.primaryLight, fontSize: 10, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  relistenBtn: {
    width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.backgroundCard,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primaryLight,
  },
  relistenBtnText: { fontSize: 15 },
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
  alreadyOwnedText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', textAlign: 'right', maxWidth: 120 },
  pendingText: { color: colors.textMuted, fontSize: 16 },
});
