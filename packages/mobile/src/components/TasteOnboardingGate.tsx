import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import KeepModal from './KeepModal';
import MusicTasteQuestionnaire from './MusicTasteQuestionnaire';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { loadPulsePreferenceState } from '../services/pulsePreferenceService';
import { topGenresFromSessions, needsTasteOnboarding } from '../services/tasteOnboarding';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import type { GenderOption } from '../types';
import { colors } from '../theme/colors';

const GENDERS: Array<{ key: GenderOption; label: string }> = [
  { key: 'MALE', label: 'Homme' },
  { key: 'FEMALE', label: 'Femme' },
  { key: 'OTHER', label: 'Autre' },
  { key: 'PREFER_NOT_TO_SAY', label: 'Je préfère ne pas dire' },
];

/**
 * Inscription (Adel, 06/10/2026, IDEA-152) : après la création du compte (y compris depuis le mode démo), l'utilisateur répond OBLIGATOIREMENT,
 * en quelques secondes : genre (une touche) + styles (puces déjà cochées d'après son historique) ; langue et pays sont déjà détectés.
 * Ces réponses alimentent le profil musical, Loki Pulse et les suggestions d'amis au même style. Jamais pour le mode démo / invité.
 */
export default function TasteOnboardingGate() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const setUser = useUserStore((s) => s.setUser);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<GenderOption | undefined>(undefined);
  const prefill = useMemo(() => topGenresFromSessions(sessions as any), [sessions]);

  useEffect(() => {
    let live = true;
    if (!user?.id || isDemoMode || isLocalGuest || !supabase) { setOpen(false); return undefined; }
    const timer = setTimeout(() => {
      void loadPulsePreferenceState().then((state) => { if (live) setOpen(needsTasteOnboarding(state)); }).catch(() => {});
    }, 1200);
    return () => { live = false; clearTimeout(timer); };
  }, [user?.id, isDemoMode, isLocalGuest]);

  useEffect(() => { setGender(user?.privateInfo?.gender); }, [user?.id]);

  if (!open || !user) return null;
  const genderKnown = Boolean(user.privateInfo?.gender);

  const saveGender = async () => {
    if (genderKnown || !gender || !supabase) return;
    const next = { ...user, privateInfo: { ...user.privateInfo, gender } };
    try { await createProfileService(supabase).saveOwnProfile(next); setUser(next); } catch { /* le genre pourra être complété dans le profil ; le style, lui, est enregistré */ }
  };

  return (
    <KeepModal visible animationType="slide" onRequestClose={() => {}} presentationStyle="fullScreen">
      <SafeAreaView style={s.safe} testID="taste-onboarding">
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.title}>Bienvenue sur Loki Music 👋</Text>
          <Text style={s.subtitle}>Deux touches et c’est prêt : Loki te propose des musiques et des amis qui te ressemblent.</Text>
          {genderKnown ? null : (
            <View style={s.block}>
              <Text style={s.label}>Tu es…</Text>
              <View style={s.genderRow}>
                {GENDERS.map((g) => (
                  <TouchableOpacity key={g.key} style={[s.genderChip, gender === g.key && s.genderChipOn]} onPress={() => setGender(g.key)} accessibilityRole="button" accessibilityState={{ selected: gender === g.key }} testID={`onboarding-gender-${g.key}`}>
                    <Text style={[s.genderText, gender === g.key && s.genderTextOn]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <MusicTasteQuestionnaire
            compact
            required
            prefillGenres={prefill}
            validateBefore={() => (genderKnown || gender ? null : 'Choisis une option pour « Tu es… » (tu peux répondre « Je préfère ne pas dire »).')}
            onDone={() => { void saveGender().finally(() => setOpen(false)); }}
            onLater={() => {}}
          />
        </ScrollView>
      </SafeAreaView>
    </KeepModal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // Ordinateur (Adel 10/10/2026) : le titre et le genre restaient collés à gauche pendant que la carte était centrée → colonne centrée unique.
  content: { padding: 16, paddingBottom: 24, width: '100%', maxWidth: 680, alignSelf: 'center' },
  title: { color: colors.white, fontSize: 24, fontWeight: '900' },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, marginTop: 6, marginBottom: 12 },
  block: { marginBottom: 12 },
  label: { color: colors.white, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChip: { minHeight: 46, paddingHorizontal: 16, borderRadius: 23, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  genderChipOn: { borderColor: colors.primaryLight, backgroundColor: colors.primary },
  genderText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  genderTextOn: { color: '#FFFFFF' },
});
