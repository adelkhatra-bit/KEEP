import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../services/supabaseClient';
import { createProfileService } from '../../services/profileService';
import { useUserStore } from '../../store/useUserStore';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';

// Maquette validée (docs/mockups/Onboarding.html, 22/09/2026) : chips de
// styles musicaux proposés juste après la création de compte. Liste fixe
// alignée sur la maquette -- ne remplace pas favoriteGenres en texte libre
// ailleurs dans l'app (profil, découverte), qui restent inchangés.
const GENRES = ['Pop', 'Rap FR', 'Afrobeats', 'Électro', 'R&B', 'Rock', 'Jazz', 'Raï', 'Latino'];

type Props = {
  onDone: () => void;
  onSkip: () => void;
};

export default function OnboardingGenresScreen({ onDone, onSkip }: Props) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (genre: string) => {
    setSelected((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  };

  const confirm = async () => {
    if (!user) return onDone();
    const nextUser = { ...user, favoriteGenres: selected.length ? selected : user.favoriteGenres };
    setBusy(true);
    try {
      if (supabase && selected.length) {
        await createProfileService(supabase).saveOwnProfile(nextUser).catch(() => null);
      }
      setUser(nextUser);
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <Text style={s.title}>Quels styles musicaux aimes-tu ?</Text>
        <View style={s.chips}>
          {GENRES.map((genre) => {
            const on = selected.includes(genre);
            return (
              <TouchableOpacity
                key={genre}
                style={[s.chip, on && s.chipOn]}
                onPress={() => toggle(genre)}
                accessibilityRole="button"
                accessibilityLabel={genre}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{genre}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={s.count}>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</Text>
        <TouchableOpacity style={s.primary} onPress={confirm} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>CONTINUER</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.ghost} onPress={onSkip} disabled={busy} accessibilityRole="button" accessibilityLabel="Passer cette étape">
          <Text style={s.ghostText}>Passer cette étape</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.keep, borderColor: colors.keep },
  chipText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: colors.black, fontWeight: '900' },
  count: { color: colors.textMutedGrey, fontSize: 14, textAlign: 'center' },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  ghost: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: colors.primaryLight, fontSize: 14, fontWeight: '700' },
});
