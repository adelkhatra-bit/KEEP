import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderPlaylist } from '@keep/music';
import { KeepVisibility, SessionTrackEntry } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { playTrackPreviewSegment, stopTrackPreview } from '../services/audioPreviewService';

interface Props {
  entry: SessionTrackEntry;
  onKeep?: (entryId: string, playlistId?: string) => void;
  onPass?: (entryId: string) => void;
  onVisibilityChange?: (entryId: string, visibility: KeepVisibility) => void;
  onUnlock?: () => void;
  playlists?: ProviderPlaylist[];
}

export default function TrackRow({ entry, onKeep, onPass, onVisibilityChange, onUnlock, playlists }: Props) {
  const { t } = useTranslation();
  const { track, status } = entry;
  const topPlaylistName = entry.recommendations[0]?.playlistName;
  const visibility: KeepVisibility = entry.visibility ?? 'PRIVATE';
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewKey = `session:${entry.id}`;
  const externalPlayUrl = track.externalUrls?.appleMusic
    || track.externalUrls?.spotify
    || track.externalUrls?.universal
    || track.externalUrls?.youtubeSearch;

  useEffect(() => () => {
    void stopTrackPreview(previewKey);
  }, [previewKey]);

  const handleKeepPress = () => {
    if (entry.creditLocked) { onUnlock?.(); return; }
    if (!playlists || playlists.length <= 1 || !onKeep) { onKeep?.(entry.id); return; }
    Alert.alert(t('session.chooseDestination'), undefined, playlists.map((p) => ({ text: p.name, onPress: () => onKeep(entry.id, p.id) })));
  };

  const playSnippet = async (positionMillis: number) => {
    if (!track.previewUrl || previewBusy) return;
    setPreviewBusy(true);
    try {
      await playTrackPreviewSegment(previewKey, track.previewUrl, positionMillis, 7000);
    } catch {
      Alert.alert('Extrait indisponible', 'Impossible de lire cet extrait pour le moment.');
    } finally {
      setPreviewBusy(false);
    }
  };

  const openExternal = async () => {
    if (!externalPlayUrl) return;
    try { await Linking.openURL(externalPlayUrl); }
    catch { Alert.alert('Lecture indisponible', 'Impossible d’ouvrir ce morceau pour le moment.'); }
  };

  const availableLabel = track.availableOn?.length ? `Disponible : ${track.availableOn.join(' · ')}` : '';

  return (
    <View style={[styles.row, entry.creditLocked && styles.rowLocked]}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.artwork} /> : <View style={[styles.artwork, styles.artworkPlaceholder]}><Text style={styles.artworkGlyph}>♪</Text></View>}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
        {track.album && <Text style={styles.album} numberOfLines={1}>{track.album}</Text>}
        {availableLabel ? <Text style={styles.platforms} numberOfLines={1}>{availableLabel}</Text> : null}
        {(track.previewUrl || externalPlayUrl) ? <View style={styles.previewRow}>
          {track.previewUrl ? <>
            <TouchableOpacity style={styles.previewPill} onPress={() => void playSnippet(0)} disabled={previewBusy}><Text style={styles.previewText}>{previewBusy ? '…' : '▶ 0s'}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.previewPill} onPress={() => void playSnippet(10000)} disabled={previewBusy}><Text style={styles.previewText}>▶ 10s</Text></TouchableOpacity>
            <TouchableOpacity style={styles.previewPill} onPress={() => void playSnippet(20000)} disabled={previewBusy}><Text style={styles.previewText}>▶ 20s</Text></TouchableOpacity>
          </> : null}
          {externalPlayUrl ? <TouchableOpacity style={styles.youtubePill} onPress={() => void openExternal()}><Text style={styles.youtubeText}>{track.previewUrl ? 'Ouvrir' : '▶ Écouter'}</Text></TouchableOpacity> : null}
        </View> : <Text style={styles.audioUnavailable}>Audio indisponible</Text>}
        {entry.creditLocked ? <Text style={styles.lockedText}>🔒 En attente · l’écoute reste disponible</Text> : null}
      </View>

      {status === 'pending' && (onKeep || onPass) ? (
        <View style={styles.actions}>
          {onPass && <TouchableOpacity style={styles.passBtn} onPress={() => onPass(entry.id)} hitSlop={8}><Text style={styles.passBtnText}>✕</Text></TouchableOpacity>}
          {onKeep && <TouchableOpacity style={[styles.keepBtn, entry.creditLocked && styles.unlockBtn]} onPress={handleKeepPress} hitSlop={8}><Text style={[styles.keepBtnText, entry.creditLocked && styles.unlockBtnText]}>{entry.creditLocked ? '🔒' : '✓'}</Text></TouchableOpacity>}
        </View>
      ) : (
        <View style={styles.statusBadge}>
          {status === 'kept' && <Text style={styles.keptText}>✓ {topPlaylistName ?? t('listen.keep')}</Text>}
          {status === 'kept' && onVisibilityChange && <TouchableOpacity style={[styles.visibilityPill, visibility === 'PUBLIC' ? styles.visibilityPublic : styles.visibilityPrivate]} onPress={() => onVisibilityChange(entry.id, visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC')} accessibilityLabel={visibility === 'PUBLIC' ? 'Masquer ce morceau du profil' : 'Afficher ce morceau sur le profil'}><Text style={visibility === 'PUBLIC' ? styles.visibilityPublicText : styles.visibilityPrivateText}>{visibility === 'PUBLIC' ? 'Public' : 'Privé'}</Text></TouchableOpacity>}
          {status === 'passed' && <Text style={styles.passedText}>✕ {t('listen.pass')}</Text>}
          {status === 'pending' && <Text style={styles.pendingText}>•</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.sm, gap: spacing.md },
  rowLocked: { backgroundColor: 'rgba(139,92,246,.06)', borderRadius: radius.md, paddingHorizontal: 6 },
  artwork: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.backgroundCard },
  artworkPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  artworkGlyph: { color: colors.textMuted, fontSize: 20 },
  info: { flex: 1, minWidth: 0 },
  title: { ...typography.bodyBold, color: colors.textPrimary },
  artist: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  album: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontStyle: 'italic' },
  platforms: { fontSize: 10, color: colors.primaryLight, marginTop: 3, fontWeight: '700' },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  previewPill: { minHeight: 24, paddingHorizontal: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  previewText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  youtubePill: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: '#211018', borderWidth: 1, borderColor: '#7A2035', alignItems: 'center', justifyContent: 'center' },
  youtubeText: { color: '#FF6B86', fontSize: 9, fontWeight: '900' },
  audioUnavailable: { color: colors.textMuted, fontSize: 9, marginTop: 5 },
  lockedText: { color: colors.primaryLight, fontSize: 9, fontWeight: '800', marginTop: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: 8 },
  passBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.pass, alignItems: 'center', justifyContent: 'center' },
  passBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  keepBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.keep, alignItems: 'center', justifyContent: 'center' },
  keepBtnText: { color: colors.black, fontWeight: '700', fontSize: 15 },
  unlockBtn: { backgroundColor: '#2B2038', borderWidth: 1, borderColor: colors.primaryLight },
  unlockBtnText: { color: colors.primaryLight, fontSize: 13 },
  statusBadge: { minWidth: 76, alignItems: 'flex-end', gap: 5, paddingTop: 8 },
  keptText: { color: colors.keep, fontSize: 12, fontWeight: '700' },
  passedText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  pendingText: { color: colors.textMuted, fontSize: 16 },
  visibilityPill: { minHeight: 24, paddingHorizontal: 9, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  visibilityPublic: { backgroundColor: 'rgba(104,242,177,0.12)', borderColor: '#68F2B1' },
  visibilityPrivate: { backgroundColor: colors.backgroundCard, borderColor: colors.border },
  visibilityPublicText: { color: '#68F2B1', fontSize: 10, fontWeight: '800' },
  visibilityPrivateText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
});
