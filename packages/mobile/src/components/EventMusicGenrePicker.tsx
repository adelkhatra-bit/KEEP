import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { searchMusicGenres, type MusicGenreOption } from '../services/pulsePreferenceService';
import { colors } from '../theme/colors';
import { Alert } from '../utils/keepAlert';

type Props = { selected: string[]; onChange: (genres: string[]) => void };

export default function EventMusicGenrePicker({ selected, onChange }: Props) {
  const [options, setOptions] = useState<MusicGenreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    void searchMusicGenres('', 140).then((rows) => {
      if (live) { setOptions(rows); setFailed(rows.length === 0); }
    }).catch(() => { if (live) setFailed(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [attempt]);
  const normalize = (genre: string) => genre.trim().toLowerCase();
  const toggle = (genre: string) => {
    const existing = selected.some((value) => normalize(value) === normalize(genre));
    if (!existing && selected.length >= 12) return;
    onChange(existing ? selected.filter((value) => normalize(value) !== normalize(genre)) : [...selected, genre]);
  };
  return (
    <View style={s.section} testID="event-music-genres">
      <View style={s.heading}>
        <Text style={s.title}>Styles de la soirée · {selected.length}/12</Text>
        <TouchableOpacity style={s.help} accessibilityRole="button" accessibilityLabel="À quoi servent les styles de la soirée" onPress={() => Alert.alert('Styles de la soirée', 'Choisis les musiques réellement prévues. Après validation, Loki Pulse pourra proposer ta soirée aux personnes de ce style dans ton pays.')}><Text style={s.helpText}>ⓘ</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color={colors.primaryLight} /> : failed ? <TouchableOpacity style={s.choice} accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={s.text}>Recharger les styles</Text></TouchableOpacity> : (
        <ScrollView style={s.scroll} nestedScrollEnabled contentContainerStyle={s.choices}>
          {Array.from(new Set([...selected, ...options.map((option) => option.label)])).map((genre) => {
            const checked = selected.some((value) => normalize(value) === normalize(genre));
            return <TouchableOpacity key={genre} style={[s.choice, checked && s.selected]} onPress={() => toggle(genre)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`Style ${genre}`} testID={`event-genre-${normalize(genre)}`}><Text style={s.text}>{checked ? '✓ ' : ''}{genre}</Text></TouchableOpacity>;
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginVertical: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 13, fontWeight: '800', flex: 1 },
  help: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  helpText: { color: colors.textPrimary, fontSize: 22 },
  scroll: { maxHeight: 180 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, paddingHorizontal: 12, justifyContent: 'center' },
  selected: { borderColor: colors.primaryLight, backgroundColor: colors.primary },
  text: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
});
