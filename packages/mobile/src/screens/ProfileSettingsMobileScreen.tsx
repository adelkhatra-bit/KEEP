import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';
import { GenderOption } from '../types';

const GENDERS: { key: GenderOption; label: string }[] = [
  { key: 'MALE', label: 'Homme' },
  { key: 'FEMALE', label: 'Femme' },
  { key: 'OTHER', label: 'Autre' },
  { key: 'PREFER_NOT_TO_SAY', label: 'Ne pas préciser' },
];

export default function ProfileSettingsMobileScreen({ navigation }: any) {
  const { user, updateUser, setPrivateInfo } = useUserStore();
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '');
  const [website, setWebsite] = useState(user?.website ?? '');
  const [birthDate, setBirthDate] = useState(user?.privateInfo.birthDate ?? '');
  const [gender, setGender] = useState<GenderOption | undefined>(user?.privateInfo.gender);
  const [error, setError] = useState('');

  if (!user) {
    return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.muted}>Aucun compte actif.</Text></View></SafeAreaView>;
  }

  const save = () => {
    const cleanUsername = username.trim().replace(/^@+/, '').replace(/\s+/g, '');
    if (cleanUsername.length < 3) {
      setError('Le pseudo doit contenir au moins 3 caractères.');
      return;
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setError('La date de naissance doit être au format AAAA-MM-JJ.');
      return;
    }
    setError('');
    updateUser({
      username: cleanUsername,
      bio: bio.trim(),
      city: city.trim() || undefined,
      countryCode: countryCode.trim().toUpperCase().slice(0, 2) || undefined,
      website: website.trim() || undefined,
    });
    setPrivateInfo({ birthDate: birthDate || undefined, gender });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}><Text style={s.headerBtnText}>‹ Retour</Text></TouchableOpacity>
        <Text style={s.title}>Modifier le profil</Text>
        <TouchableOpacity style={s.headerBtn} onPress={save}><Text style={s.saveText}>Enregistrer</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Section title="Identité">
          <Field label="Pseudo" value={username} onChangeText={setUsername} placeholder="tonpseudo" autoCapitalize="none" />
          <Text style={s.hint}>Visible publiquement sous la forme @{username.trim().replace(/^@+/, '') || 'pseudo'}.</Text>
          <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Quelques mots sur toi" multiline />
        </Section>

        <Section title="Localisation">
          <View style={s.row}>
            <View style={s.flex2}><Field label="Ville" value={city} onChangeText={setCity} placeholder="Lyon" /></View>
            <View style={s.flex1}><Field label="Pays" value={countryCode} onChangeText={setCountryCode} placeholder="FR" maxLength={2} autoCapitalize="characters" /></View>
          </View>
          <Field label="Site web" value={website} onChangeText={setWebsite} placeholder="https://..." autoCapitalize="none" />
        </Section>

        <Section title="Informations privées" subtitle="Ces informations ne sont pas affichées sur ton profil public.">
          <Field label="Date de naissance" value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-JJ" keyboardType="numbers-and-punctuation" />
          <Text style={s.hint}>Utilisée notamment pour les futurs filtres d’âge et événements 18+.</Text>
          <Text style={s.label}>Genre</Text>
          <View style={s.genderWrap}>
            {GENDERS.map((item) => (
              <TouchableOpacity key={item.key} style={[s.genderChip, gender === item.key && s.genderChipActive]} onPress={() => setGender(item.key)}>
                <Text style={[s.genderText, gender === item.key && s.genderTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={s.primary} onPress={save}><Text style={s.primaryText}>Enregistrer les modifications</Text></TouchableOpacity>

        <TouchableOpacity style={s.playlists} onPress={() => navigation.navigate('Main', { screen: 'MyMusic' })}>
          <Text style={s.playlistsText}>← Revenir aux Playlists</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.advanced} onPress={() => navigation.navigate('AdvancedProfileSettings')}>
          <Text style={s.advancedText}>Réglages avancés du profil</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}{children}</View>;
}

function Field({ label, ...props }: any) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput style={[s.input, props.multiline && s.multiline]} placeholderTextColor={colors.textMuted} {...props} /></View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn: { minWidth: 72, minHeight: 40, justifyContent: 'center' },
  headerBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  saveText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 38 },
  section: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, marginBottom: 16 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  sectionSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  field: { marginTop: 14 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.textPrimary, paddingHorizontal: 12, fontSize: 14, backgroundColor: colors.background },
  multiline: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 7 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  genderWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  genderChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  genderText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  genderTextActive: { color: colors.white },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 12, fontSize: 12, fontWeight: '700' },
  primary: { minHeight: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  playlists: { minHeight: 48, marginTop: 12, borderRadius: 24, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  playlistsText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  advanced: { minHeight: 44, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  advancedText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
});
