import React from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { SocialLink } from '../types';

const NETWORKS: { platform: SocialLink['platform']; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'snapchat', label: 'Snapchat' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'x', label: 'X' },
  { platform: 'facebook', label: 'Facebook' },
];

export default function AdvancedProfileSettingsScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const addSocialLink = useUserStore((s) => s.addSocialLink);
  const removeSocialLink = useUserStore((s) => s.removeSocialLink);
  const toggleSocialLinkVisibility = useUserStore((s) => s.toggleSocialLinkVisibility);
  const updateUser = useUserStore((s) => s.updateUser);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  if (!user) {
    return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.muted}>Aucun compte actif.</Text></View></SafeAreaView>;
  }

  const linkFor = (platform: SocialLink['platform']) => user.socialLinks.find((l) => l.platform === platform);

  const saveNetwork = (platform: SocialLink['platform']) => {
    const value = (drafts[platform] ?? linkFor(platform)?.url ?? '').trim();
    if (!value) {
      Alert.alert('Lien manquant', 'Ajoute le lien de ton réseau social.');
      return;
    }
    addSocialLink({ platform, url: value, visibility: linkFor(platform)?.visibility ?? 'PUBLIC' });
    setDrafts((prev) => ({ ...prev, [platform]: value }));
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerButton} onPress={() => navigation.goBack()} accessibilityLabel="Retour au profil">
          <Text style={s.headerText}>‹ Retour</Text>
        </TouchableOpacity>
        <Text style={s.title}>Réglages avancés</Text>
        <TouchableOpacity style={s.headerButton} onPress={() => navigation.navigate('Main', { screen: 'MyMusic' })} accessibilityLabel="Revenir aux Playlists">
          <Text style={[s.headerText, s.right]}>Playlists</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Raccourcis</Text>
          <Action label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          <Action label="Services musicaux" onPress={() => navigation.navigate('MusicConnections')} />
          <Action label="Offre & crédits" onPress={() => navigation.navigate('Plans')} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Profil public</Text>
          <View style={s.switchRow}>
            <View style={s.switchText}><Text style={s.label}>Profil visible</Text><Text style={s.help}>Permet aux autres utilisateurs de découvrir tes goûts musicaux.</Text></View>
            <Switch value={user.isPublic} onValueChange={(value) => updateUser({ isPublic: value })} trackColor={{ false: colors.background, true: colors.primary }} />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Réseaux sociaux</Text>
          <Text style={s.help}>Ces boutons apparaissent sur ton profil. Si un lien est public, un abonné peut l’ouvrir directement.</Text>
          {NETWORKS.map(({ platform, label }) => {
            const existing = linkFor(platform);
            const value = drafts[platform] ?? existing?.url ?? '';
            return (
              <View key={platform} style={s.networkBlock}>
                <Text style={s.label}>{label}</Text>
                <TextInput
                  style={s.input}
                  value={value}
                  onChangeText={(text) => setDrafts((prev) => ({ ...prev, [platform]: text }))}
                  placeholder={`Lien ${label}`}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={s.row}>
                  <TouchableOpacity style={s.primaryButton} onPress={() => saveNetwork(platform)}><Text style={s.primaryText}>Enregistrer</Text></TouchableOpacity>
                  {existing ? (
                    <>
                      <TouchableOpacity style={s.secondaryButton} onPress={() => toggleSocialLinkVisibility(platform)}><Text style={s.secondaryText}>{existing.visibility === 'PUBLIC' ? 'Public' : 'Privé'}</Text></TouchableOpacity>
                      <TouchableOpacity style={s.secondaryButton} onPress={() => removeSocialLink(platform)}><Text style={s.dangerText}>Supprimer</Text></TouchableOpacity>
                    </>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={s.backPlaylists} onPress={() => navigation.navigate('Main', { screen: 'MyMusic' })}>
          <Text style={s.backPlaylistsText}>← Revenir aux Playlists</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity style={s.action} onPress={onPress}><Text style={s.actionText}>{label}</Text><Text style={s.actionArrow}>›</Text></TouchableOpacity>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 82, minHeight: 42, justifyContent: 'center' },
  headerText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' },
  right: { textAlign: 'right' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '900' },
  content: { padding: 16, paddingBottom: 42 },
  section: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 14 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  help: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  actionText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  actionArrow: { color: colors.primaryLight, fontSize: 22 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1 },
  networkBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  input: { minHeight: 46, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.textPrimary, backgroundColor: colors.background },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 9 },
  primaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', backgroundColor: colors.primary },
  primaryText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  secondaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  secondaryText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  dangerText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  backPlaylists: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  backPlaylistsText: { color: colors.primaryLight, fontSize: 13, fontWeight: '900' },
});