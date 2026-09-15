import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderPlaylist } from '@keep/music';
import { KeepVisibility, SessionTrackEntry } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import TrackListenControls from './TrackListenControls';

const IMPORT_SOURCE_LABEL: Record<string, string> = {
  spotify: 'Depuis Spotify',
  deezer: 'Depuis Deezer',
  apple_music: 'Depuis Apple Music',
  youtube_music: 'Depuis YouTube Music',
  soundcloud: 'Depuis SoundCloud',
  tidal: 'Depuis TIDAL',
};

interface Props {
  entry: SessionTrackEntry;
  onKeep?: (entryId: string, playlistId?: string, visibility?: KeepVisibility) => void;
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
  const [keepPromptOpen, setKeepPromptOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | undefined>(undefined);
  const [keepSubmitting, setKeepSubmitting] = useState(false);

  const destinationOptions = useMemo(() => playlists ?? [], [playlists]);

  useEffect(() => {
    if (!keepPromptOpen) return;
    setSelectedPlaylistId(
      entry.recommendations?.[0]?.playlistId
      || entry.keptPlaylistId
      || destinationOptions[0]?.id,
    );
  }, [destinationOptions, entry.keptPlaylistId, entry.recommendations, keepPromptOpen]);

  const handleKeepPress = () => {
    if (entry.creditLocked) { onUnlock?.(); return; }
    if (!onKeep || keepSubmitting) return;
    setKeepPromptOpen(true);
  };

  const confirmIndividualKeep = async (nextVisibility: KeepVisibility) => {
    if (!onKeep || keepSubmitting) return;
    setKeepSubmitting(true);
    try {
      await Promise.resolve(onKeep(entry.id, selectedPlaylistId, nextVisibility));
      setKeepPromptOpen(false);
    } finally {
      setKeepSubmitting(false);
    }
  };

  const availableLabel = track.availableOn?.length ? `Disponible : ${track.availableOn.join(' · ')}` : '';
  // Adel (02/09/2026) : "il faut bien donner la provenance ... si ça vient de
  // Spotify bien dire que c'est Spotify, si ça vient de Deezer bien dire que
  // ça vient de Deezer" -- affiché uniquement pour un morceau importé par la
  // synchro automatique des favoris, jamais pour une détection micro classique.
  const importedFromLabel = entry.importedFrom ? IMPORT_SOURCE_LABEL[entry.importedFrom] ?? entry.importedFrom : null;

  return (
    <>
      <View style={[styles.row, entry.creditLocked && styles.rowLocked]}>
        {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.artwork} /> : <View style={[styles.artwork, styles.artworkPlaceholder]}><Text style={styles.artworkGlyph}>♪</Text></View>}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
          {track.album && <Text style={styles.album} numberOfLines={1}>{track.album}</Text>}
          {importedFromLabel ? <View style={styles.importedPill}><Text style={styles.importedPillText}>{importedFromLabel}</Text></View> : null}
          {availableLabel ? <Text style={styles.platforms} numberOfLines={1}>{availableLabel}</Text> : null}
          <TrackListenControls track={track} previewKey={`session:${entry.id}`} />
          {entry.creditLocked ? <Text style={styles.lockedText}>🔒 En attente · l’écoute reste disponible</Text> : null}
        </View>

        {status === 'pending' && (onKeep || onPass) ? (
          <View style={styles.actions}>
            {onPass && <TouchableOpacity style={styles.passBtn} onPress={() => onPass(entry.id)} hitSlop={8}><Text style={styles.passBtnText}>✕</Text></TouchableOpacity>}
            {onKeep && <TouchableOpacity style={[styles.keepBtn, entry.creditLocked && styles.unlockBtn]} onPress={handleKeepPress} hitSlop={8} accessibilityLabel="Garder ce morceau"><Text style={[styles.keepBtnText, entry.creditLocked && styles.unlockBtnText]}>{entry.creditLocked ? '🔒' : '♡'}</Text></TouchableOpacity>}
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

      <Modal visible={keepPromptOpen} transparent animationType="fade" onRequestClose={() => !keepSubmitting && setKeepPromptOpen(false)}>
        <View style={styles.keepOverlay}>
          <View style={styles.keepPromptCard}>
            <Text style={styles.keepPromptEyebrow}>TON MORCEAU · TA VISIBILITÉ</Text>
            <Text style={styles.keepPromptTitle}>Garder ce morceau ?</Text>
            <Text style={styles.keepPromptTrack} numberOfLines={2}>{track.title} · {track.artist}</Text>
            <Text style={styles.keepPromptBody}>Même fonctionnement que dans SWIPER : choisis d’abord où ranger le morceau, puis s’il apparaît sur ton profil.</Text>

            {destinationOptions.length > 0 ? <View style={styles.destinationBlock}>
              <Text style={styles.destinationLabel}>RANGER DANS</Text>
              <View style={styles.destinationWrap}>
                {destinationOptions.slice(0, 8).map((playlist) => {
                  const selected = selectedPlaylistId === playlist.id;
                  return <TouchableOpacity key={playlist.id} style={[styles.destinationPill, selected && styles.destinationPillOn]} onPress={() => setSelectedPlaylistId(playlist.id)} disabled={keepSubmitting}>
                    <Text style={[styles.destinationText, selected && styles.destinationTextOn]} numberOfLines={1}>{playlist.name}</Text>
                  </TouchableOpacity>;
                })}
              </View>
            </View> : null}

            <TouchableOpacity style={[styles.keepChoice, styles.keepChoicePublic]} onPress={() => { void confirmIndividualKeep('PUBLIC'); }} disabled={keepSubmitting} accessibilityLabel="Visible sur mon profil">
              <Text style={styles.keepChoicePublicTitle}>{keepSubmitting ? 'ENREGISTREMENT…' : 'VISIBLE SUR MON PROFIL'}</Text>
              <Text style={styles.keepChoiceText}>Le morceau sera rangé et visible dans ton univers Loki.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.keepChoice, styles.keepChoicePrivate]} onPress={() => { void confirmIndividualKeep('PRIVATE'); }} disabled={keepSubmitting} accessibilityLabel="Garder en privé">
              <Text style={styles.keepChoicePrivateTitle}>{keepSubmitting ? 'ENREGISTREMENT…' : 'GARDER EN PRIVÉ'}</Text>
              <Text style={styles.keepChoiceText}>Le morceau reste dans ta bibliothèque sans apparaître sur ton profil.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.keepCancel} onPress={() => setKeepPromptOpen(false)} disabled={keepSubmitting} accessibilityLabel="Annuler sans garder">
              <Text style={styles.keepCancelText}>ANNULER — NE RIEN GARDER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
  importedPill: { alignSelf: 'flex-start', minHeight: 20, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: 'rgba(139,92,246,.14)', borderWidth: 1, borderColor: colors.primaryLight, marginTop: 3, justifyContent: 'center' },
  importedPillText: { color: colors.primaryLight, fontSize: 9, fontWeight: '900' },
  lockedText: { color: colors.primaryLight, fontSize: 9, fontWeight: '800', marginTop: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: 8 },
  passBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.pass, alignItems: 'center', justifyContent: 'center' },
  passBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  keepBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.keep, alignItems: 'center', justifyContent: 'center' },
  keepBtnText: { color: colors.black, fontWeight: '900', fontSize: 17 },
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

  keepOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  keepPromptCard: { width: '100%', maxWidth: 380, borderRadius: 22, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', padding: 18 },
  keepPromptEyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  keepPromptTitle: { color: '#F8F6FC', fontSize: 21, fontWeight: '900', marginTop: 4 },
  keepPromptTrack: { color:'#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: 7 },
  keepPromptBody: { color:'#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 8 },
  destinationBlock: { marginTop: 14 },
  destinationLabel: { color:'#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 7 },
  destinationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  destinationPill: { minHeight: 32, maxWidth: '100%', paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#312348', backgroundColor: '#120D1B', alignItems: 'center', justifyContent: 'center' },
  destinationPillOn: { borderColor: colors.primaryLight, backgroundColor: 'rgba(139,92,246,0.18)' },
  destinationText: { color:'#FFFFFF', fontSize: 11, fontWeight: '800', maxWidth: 160 },
  destinationTextOn: { color: colors.primaryLight },
  keepChoice: { minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginTop: 11, justifyContent: 'center', borderWidth: 1 },
  keepChoicePublic: { borderColor: '#68F2B1', backgroundColor: 'rgba(104,242,177,0.08)' },
  keepChoicePrivate: { borderColor: '#312348', backgroundColor: '#120D1B' },
  keepChoicePublicTitle: { color: '#68F2B1', fontSize: 11, fontWeight: '900' },
  keepChoicePrivateTitle: { color: '#F8F6FC', fontSize: 11, fontWeight: '900' },
  keepChoiceText: { color:'#FFFFFF', fontSize: 11, lineHeight: 15, marginTop: 3 },
  keepCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  keepCancelText: { color:'#FFFFFF', fontSize: 11, fontWeight: '900' },
});