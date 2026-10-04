import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProviderPlaylist } from '@keep/music';
import { colors } from '../theme/colors';
import type { KeepVisibility } from '../types';

type KeepDecisionModalProps = {
  visible: boolean;
  trackTitle?: string | null;
  trackArtist?: string | null;
  costFree?: number | null;
  busy?: boolean;
  editMode?: boolean;
  playlists?: ProviderPlaylist[];
  selectedPlaylistId?: string;
  onSelectPlaylist?: (playlistId: string) => void;
  onChoose: (visibility: KeepVisibility) => void | Promise<void>;
  onCancel: () => void;
};

export function KeepDecisionModal({
  visible,
  trackTitle,
  trackArtist,
  costFree,
  busy = false,
  editMode = false,
  playlists = [],
  selectedPlaylistId,
  onSelectPlaylist,
  onChoose,
  onCancel,
}: KeepDecisionModalProps) {
  const safeCost = Math.max(0, Number(costFree ?? 0));
  const trackLabel = [trackTitle, trackArtist].filter(Boolean).join(' · ');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.eyebrow}>{editMode ? 'TON MORCEAU · TA VISIBILITÉ' : 'TON MORCEAU · TA VISIBILITÉ'}</Text>
          <Text style={s.title}>{editMode ? 'Modifier la visibilité' : 'Garder ce morceau ?'}</Text>
          {trackLabel ? <Text style={s.track} numberOfLines={2}>{trackLabel}</Text> : null}
          <Text style={s.body}>
            {editMode
              ? 'Choisis ce que les autres verront. Aucun FREE supplémentaire n’est débité pour modifier ce choix.'
              : 'Choisis seulement si tu veux vraiment le garder. Rien n’est enregistré et aucun FREE n’est débité tant que tu n’as pas choisi.'}
          </Text>

          {!editMode && costFree != null ? (
            <View style={s.costNotice}>
              <Text style={s.costValue}>{safeCost}</Text>
              <View style={s.costCopy}>
                <Text style={s.costTitle}>FREE SERONT DÉBITÉS</Text>
                <Text style={s.costText}>Uniquement après ta confirmation Public ou Privé.</Text>
              </View>
            </View>
          ) : null}

          {!editMode && playlists.length > 0 ? (
            <View style={s.destinationBlock}>
              <Text style={s.destinationLabel}>RANGER DANS</Text>
              <View style={s.destinationWrap}>
                {playlists.slice(0, 8).map((playlist) => {
                  const selected = selectedPlaylistId === playlist.id;
                  return (
                    <TouchableOpacity
                      key={playlist.id}
                      style={[s.destinationPill, selected && s.destinationPillOn]}
                      onPress={() => onSelectPlaylist?.(playlist.id)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[s.destinationText, selected && s.destinationTextOn]} numberOfLines={1}>{playlist.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.choice, s.choicePublic]}
            onPress={() => { void onChoose('PUBLIC'); }}
            disabled={busy}
            accessibilityLabel="Visible sur mon profil"
          >
            <Text style={s.choicePublicTitle}>{busy ? 'ENREGISTREMENT…' : 'VISIBLE SUR MON PROFIL'}</Text>
            <Text style={s.choiceText}>Le morceau sera rangé et visible dans ton univers Loki Music.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.choice, s.choicePrivate]}
            onPress={() => { void onChoose('PRIVATE'); }}
            disabled={busy}
            accessibilityLabel="Garder en privé"
          >
            <Text style={s.choicePrivateTitle}>{busy ? 'ENREGISTREMENT…' : 'GARDER EN PRIVÉ'}</Text>
            <Text style={s.choiceText}>Le morceau reste dans ta bibliothèque sans apparaître sur ton profil.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancel} onPress={onCancel} disabled={busy} accessibilityLabel="Annuler sans garder">
            <Text style={s.cancelText}>{editMode ? 'ANNULER' : 'ANNULER — NE RIEN GARDER'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

type KeepSuccessModalProps = {
  visible: boolean;
  trackTitle?: string | null;
  trackArtist?: string | null;
  costFree?: number | null;
  visibility?: KeepVisibility | null;
  continueLabel?: string;
  onContinue: () => void | Promise<void>;
};

export function KeepSuccessModal({
  visible,
  trackTitle,
  trackArtist,
  costFree,
  visibility,
  continueLabel = 'PARFAIT',
  onContinue,
}: KeepSuccessModalProps) {
  const trackLabel = [trackTitle, trackArtist].filter(Boolean).join(' · ');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { void onContinue(); }}>
      <View style={s.overlay}>
        <View style={s.successCard}>
          <View style={s.successOrb}><Text style={s.successOrbText}>✓</Text></View>
          <Text style={s.successEyebrow}>C’EST GARDÉ</Text>
          <Text style={s.successTitle}>Merci pour ta découverte</Text>
          {trackLabel ? <Text style={s.successTrack} numberOfLines={2}>{trackLabel}</Text> : null}
          {costFree != null ? <Text style={s.successDebit}>{Math.max(0, Number(costFree))} FREE débités</Text> : null}
          <Text style={s.successBody}>
            {visibility === 'PUBLIC'
              ? 'Le morceau est visible sur ton profil et tes abonnés peuvent recevoir la notification de ta nouvelle musique.'
              : 'Le morceau est gardé en privé dans ta bibliothèque. Rien n’est publié et aucune notification de nouveau morceau n’est envoyée à tes abonnés.'}
          </Text>
          <TouchableOpacity style={s.successButton} onPress={() => { void onContinue(); }} accessibilityLabel="Fermer la confirmation">
            <Text style={s.successButtonText}>{continueLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 380, borderRadius: 22, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', padding: 18 },
  eyebrow: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  title: { color: '#F8F6FC', fontSize: 21, fontWeight: '900', marginTop: 4 },
  track: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: 7 },
  body: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 8 },
  costNotice: { marginTop: 12, minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.keep, backgroundColor: 'rgba(45,225,194,.10)', paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  costValue: { minWidth: 38, color: colors.keep, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  costCopy: { flex: 1, minWidth: 0 },
  costTitle: { color: colors.keep, fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  costText: { color: colors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  destinationBlock: { marginTop: 14 },
  destinationLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginBottom: 7 },
  destinationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  destinationPill: { minHeight: 32, maxWidth: '100%', paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#312348', backgroundColor: '#120D1B', alignItems: 'center', justifyContent: 'center' },
  destinationPillOn: { borderColor: colors.primaryLight, backgroundColor: 'rgba(139,92,246,0.18)' },
  destinationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', maxWidth: 160 },
  destinationTextOn: { color: colors.primaryLight },
  choice: { minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginTop: 11, justifyContent: 'center', borderWidth: 1 },
  choicePublic: { borderColor: '#68F2B1', backgroundColor: 'rgba(104,242,177,0.08)' },
  choicePrivate: { borderColor: '#312348', backgroundColor: '#120D1B' },
  choicePublicTitle: { color: '#68F2B1', fontSize: 11, fontWeight: '900' },
  choicePrivateTitle: { color: '#F8F6FC', fontSize: 11, fontWeight: '900' },
  choiceText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, marginTop: 3 },
  cancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  cancelText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  successCard: { width: '100%', maxWidth: 390, borderRadius: 24, borderWidth: 1, borderColor: colors.keep, backgroundColor: colors.backgroundCard, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: .35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  successOrb: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(45,225,194,.14)', borderWidth: 1, borderColor: colors.keep, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  successOrbText: { color: colors.keep, fontSize: 28, fontWeight: '900' },
  successEyebrow: { color: colors.keep, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  successTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  successTrack: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  successDebit: { color: colors.keep, fontSize: 15, fontWeight: '900', marginTop: 12 },
  successBody: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  successButton: { width: '100%', minHeight: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  successButtonText: { color: '#FFF', fontSize: 12, fontWeight: '900', letterSpacing: .7 },
});
