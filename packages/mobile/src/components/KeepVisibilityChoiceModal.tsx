import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

type PlaylistChoice = { id: string; name: string };

type Props = {
  visible: boolean;
  title?: string;
  trackLabel?: string | null;
  body?: string;
  costFree?: number | null;
  playlists?: PlaylistChoice[];
  selectedPlaylistId?: string;
  onSelectPlaylist?: (playlistId: string) => void;
  onPublic: () => void;
  onPrivate: () => void;
  onCancel: () => void;
  busy?: boolean;
  editMode?: boolean;
};

export default function KeepVisibilityChoiceModal({
  visible,
  title,
  trackLabel,
  body = 'Choisis ce que les autres verront. Tu pourras modifier ce choix plus tard.',
  costFree,
  playlists = [],
  selectedPlaylistId,
  onSelectPlaylist,
  onPublic,
  onPrivate,
  onCancel,
  busy = false,
  editMode = false,
}: Props) {
  const cost = Math.max(0, Number(costFree || 0));
  const showCost = !editMode && cost > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.eyebrow}>{editMode ? 'VISIBILITÉ' : 'GARDER CE MORCEAU'}</Text>
          <Text style={s.title}>{title || (editMode ? 'Modifier la visibilité' : 'Garder ce morceau')}</Text>
          {trackLabel ? <Text style={s.track} numberOfLines={2}>{trackLabel}</Text> : null}

          {showCost ? (
            <View style={s.costBox}>
              <Text style={s.costAmount}>{cost} FREE</Text>
              <Text style={s.costCaption}>seront débités après ton choix</Text>
            </View>
          ) : null}

          <Text style={s.body}>{body}</Text>

          {!editMode && playlists.length > 1 && onSelectPlaylist ? (
            <View style={s.playlists}>
              <Text style={s.label}>DESTINATION</Text>
              <View style={s.playlistWrap}>
                {playlists.slice(0, 5).map((playlist) => {
                  const selected = selectedPlaylistId === playlist.id;
                  return (
                    <TouchableOpacity
                      key={playlist.id}
                      style={[s.playlist, selected && s.playlistOn]}
                      onPress={() => onSelectPlaylist(playlist.id)}
                      disabled={busy}
                    >
                      <Text style={[s.playlistText, selected && s.playlistTextOn]} numberOfLines={1}>
                        {playlist.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.choice, s.publicChoice]}
            onPress={onPublic}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Public sur mon profil"
          >
            <Text style={s.publicTitle}>PUBLIC SUR MON PROFIL</Text>
            <Text style={s.choiceText}>Le morceau apparaît dans ton univers Loki Music partagé.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.choice, s.privateChoice]}
            onPress={onPrivate}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Garder en privé"
          >
            <Text style={s.privateTitle}>GARDER EN PRIVÉ</Text>
            <Text style={s.choiceText}>Le morceau reste dans ta bibliothèque et n’apparaît pas sur ton profil public.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancel} onPress={onCancel} disabled={busy}>
            <Text style={s.cancelText}>ANNULER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,3,8,.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 24,
    backgroundColor: '#151020',
    borderWidth: 1,
    borderColor: '#6E4BA3',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  eyebrow: {
    color: '#B79CFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  title: {
    color: '#FFF',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  track: {
    color: '#D8CFE3',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 5,
  },
  costBox: {
    alignSelf: 'center',
    minWidth: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.keep,
    backgroundColor: 'rgba(45,225,194,.09)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 15,
  },
  costAmount: {
    color: colors.keep,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  costCaption: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  body: {
    color: '#FFF',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 13,
    marginBottom: 4,
  },
  playlists: { marginTop: 12 },
  label: { color: '#AFA5BC', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 },
  playlistWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playlist: {
    minHeight: 32,
    maxWidth: '100%',
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A3346',
    backgroundColor: '#0B0A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistOn: { borderColor: '#B79CFF', backgroundColor: 'rgba(124,92,252,.18)' },
  playlistText: { color: '#AFA5BC', fontSize: 11, fontWeight: '700', maxWidth: 150 },
  playlistTextOn: { color: '#B79CFF' },
  choice: {
    minHeight: 68,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
  },
  publicChoice: { borderColor: colors.keep, backgroundColor: 'rgba(45,225,194,.09)' },
  privateChoice: { borderColor: '#5B3F8C', backgroundColor: '#21182F' },
  publicTitle: { color: colors.keep, fontSize: 12, fontWeight: '900' },
  privateTitle: { color: '#D6C2FA', fontSize: 12, fontWeight: '900' },
  choiceText: { color: '#FFF', fontSize: 11, lineHeight: 16, marginTop: 3 },
  cancel: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  cancelText: { color: '#AFA5BC', fontSize: 11, fontWeight: '900' },
});
