import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import KeepModal from './KeepModal';
import { lokiText } from '../theme/lokiText';


export type KeepChoiceVisibility = 'PUBLIC' | 'PRIVATE';

type Destination = { id: string; name: string };

type Props = {
  visible: boolean;
  title?: string;
  trackTitle?: string;
  trackArtist?: string;
  costFree?: number | null;
  showCost?: boolean;
  destinations?: Destination[];
  selectedDestinationId?: string;
  onSelectDestination?: (id: string) => void;
  busy?: boolean;
  onConfirm: (visibility: KeepChoiceVisibility) => void | Promise<void>;
  onCancel: () => void;
  publicLabel?: string;
  privateLabel?: string;
  body?: string;
};

export default function KeepChoiceModal({
  visible,
  title = 'Garder ce morceau ?',
  trackTitle,
  trackArtist,
  costFree = 3,
  showCost = true,
  destinations = [],
  selectedDestinationId,
  onSelectDestination,
  busy = false,
  onConfirm,
  onCancel,
  publicLabel = 'VISIBLE SUR MON PROFIL',
  privateLabel = 'GARDER EN PRIVÉ',
  body = 'Choisis seulement si tu veux vraiment le garder. Rien n’est enregistré et aucun FREE n’est débité tant que tu n’as pas choisi.',
}: Props) {
  const trackLine = [trackTitle, trackArtist].filter(Boolean).join(' · ');
  return (
    <KeepModal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.eyebrow}>TON MORCEAU · TA VISIBILITÉ</Text>
          <Text style={s.title}>{title}</Text>
          {trackLine ? <Text style={s.track} numberOfLines={2}>{trackLine}</Text> : null}
          <Text style={s.body}>{body}</Text>

          {showCost && costFree != null ? (
            <View style={s.costNotice}>
              <Text style={s.costValue}>{Math.max(0, Number(costFree) || 0)}</Text>
              <View style={s.costCopy}>
                <Text style={s.costTitle}>FREE SERONT DÉBITÉS</Text>
                <Text style={s.costText}>Uniquement après ta confirmation Public ou Privé.</Text>
              </View>
            </View>
          ) : null}

          {destinations.length > 0 && onSelectDestination ? (
            <View style={s.destinationBlock}>
              <Text style={s.destinationLabel}>RANGER DANS</Text>
              <View style={s.destinationWrap}>
                {destinations.slice(0, 8).map((destination) => {
                  const selected = selectedDestinationId === destination.id;
                  return (
                    <TouchableOpacity
                      key={destination.id}
                      style={[s.destinationPill, selected && s.destinationPillOn]}
                      onPress={() => onSelectDestination(destination.id)}
                      disabled={busy}
                    >
                      <Text style={[s.destinationText, selected && s.destinationTextOn]} numberOfLines={1}>{destination.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.choice, s.publicChoice]}
            onPress={() => { void onConfirm('PUBLIC'); }}
            disabled={busy}
            accessibilityLabel="Visible sur mon profil"
          >
            <Text style={s.publicTitle}>{busy ? 'ENREGISTREMENT…' : publicLabel}</Text>
            <Text style={s.choiceText}>Le morceau sera rangé et visible dans ton univers Loki Music.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.choice, s.privateChoice]}
            onPress={() => { void onConfirm('PRIVATE'); }}
            disabled={busy}
            accessibilityLabel="Garder en privé"
          >
            <Text style={s.privateTitle}>{busy ? 'ENREGISTREMENT…' : privateLabel}</Text>
            <Text style={s.choiceText}>Le morceau reste dans ta bibliothèque sans apparaître sur ton profil.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancel} onPress={onCancel} disabled={busy} accessibilityLabel="Annuler sans garder">
            <Text style={s.cancelText}>ANNULER — NE RIEN GARDER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeepModal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 390, borderRadius: 24, backgroundColor: '#151020', borderWidth: 1, borderColor: '#493369', padding: 18 },
  eyebrow: { color: colors.primaryLight, fontSize: lokiText.label.fontSize, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#F8F6FC', fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 5 },
  track: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 7 },
  body: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 8 },
  costNotice: { marginTop: 14, minHeight: 70, borderRadius: 16, borderWidth: 1, borderColor: colors.success, backgroundColor: 'rgba(45,225,194,.08)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 },
  costValue: { color: colors.success, fontSize: 34, lineHeight: 38, fontWeight: '900', minWidth: 44, textAlign: 'center' },
  costCopy: { flex: 1, minWidth: 0 },
  costTitle: { color: colors.success, fontSize: 11, fontWeight: '900', letterSpacing: .4 },
  costText: { color: '#FFFFFF', fontSize: lokiText.label.fontSize, lineHeight: 14, fontWeight: '700', marginTop: 2 },
  destinationBlock: { marginTop: 14 },
  destinationLabel: { color: '#FFFFFF', fontSize: lokiText.label.fontSize, fontWeight: '900', letterSpacing: 1.1, marginBottom: 7 },
  destinationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  destinationPill: { minHeight: 32, maxWidth: '100%', paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#312348', backgroundColor: '#120D1B', alignItems: 'center', justifyContent: 'center' },
  destinationPillOn: { borderColor: colors.primaryLight, backgroundColor: 'rgba(139,92,246,0.18)' },
  destinationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', maxWidth: 160 },
  destinationTextOn: { color: colors.primaryLight },
  choice: { minHeight: 62, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginTop: 11, justifyContent: 'center', borderWidth: 1 },
  publicChoice: { borderColor: '#68F2B1', backgroundColor: 'rgba(104,242,177,0.08)' },
  privateChoice: { borderColor: '#312348', backgroundColor: '#120D1B' },
  publicTitle: { color: '#68F2B1', fontSize: 11, fontWeight: '900' },
  privateTitle: { color: '#F8F6FC', fontSize: 11, fontWeight: '900' },
  choiceText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, marginTop: 3 },
  cancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  cancelText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
