import React from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { SocialLink } from '../types';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import { createProfileService } from '../services/profileService';
import { stageGuestProfileForUpgrade } from '../services/guestUpgradeService';
import { supabase } from '../services/supabaseClient';

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
  const setUser = useUserStore((s) => s.setUser);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingNetwork, setSavingNetwork] = React.useState<SocialLink['platform'] | null>(null);

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.muted}>Aucun compte actif.</Text></View></SafeAreaView>;

  const goToTab = (screen: 'MyMusic' | 'Profile') => navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen } }] });
  const linkFor = (platform: SocialLink['platform']) => user.socialLinks.find((l) => l.platform === platform);

  const persistSocialLinks = async (links: SocialLink[], platform: SocialLink['platform'], successMessage: string) => {
    const nextUser = { ...user, socialLinks: links };
    setSavingNetwork(platform);
    try {
      if (isDemoMode) {
        setUser(nextUser);
        Alert.alert('Mode démo', 'Ce réglage est temporaire dans le mode démo.');
        return;
      }
      if (isLocalGuest || !supabase) {
        setUser(nextUser);
        if (isLocalGuest) await stageGuestProfileForUpgrade(nextUser);
        Alert.alert('Réseau enregistré', 'Le lien est conservé sur cet appareil. Il sera repris automatiquement lorsque tu créeras ton compte KEEP.');
        return;
      }
      await createProfileService(supabase).saveOwnProfile(nextUser);
      setUser(nextUser);
      Alert.alert('Réseau enregistré', successMessage);
    } catch (e: any) {
      Alert.alert('Réseau social', e?.message || 'Impossible d’enregistrer ce réseau pour le moment.');
    } finally {
      setSavingNetwork(null);
    }
  };

  const updateProfileVisibility = async (value: boolean) => {
    const nextUser = { ...user, isPublic: value };
    setUser(nextUser);
    try {
      if (isLocalGuest) await stageGuestProfileForUpgrade(nextUser);
      else if (supabase && !isDemoMode) await createProfileService(supabase).saveOwnProfile(nextUser);
    } catch {
      Alert.alert('Profil public', 'La visibilité sera resynchronisée à la prochaine connexion.');
    }
  };

  const saveNetwork = async (platform: SocialLink['platform']) => {
    const value = (drafts[platform] ?? linkFor(platform)?.url ?? '').trim();
    if (!value) return void Alert.alert('Lien manquant', 'Ajoute le lien de ton réseau social.');
    const existing = linkFor(platform);
    const links = [
      ...user.socialLinks.filter((l) => l.platform !== platform),
      { platform, url: value, visibility: existing?.visibility ?? 'PUBLIC' } as SocialLink,
    ];
    await persistSocialLinks(links, platform, 'Le logo s’allume maintenant avec la couleur du réseau sur ton profil.');
    setDrafts((prev) => ({ ...prev, [platform]: value }));
  };

  const toggleNetworkVisibility = async (platform: SocialLink['platform']) => {
    const links = user.socialLinks.map((link) => link.platform === platform ? { ...link, visibility: link.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' } as SocialLink : link);
    const next = links.find((link) => link.platform === platform);
    await persistSocialLinks(links, platform, next?.visibility === 'PUBLIC' ? 'Ce réseau est maintenant visible sur ton profil.' : 'Ce réseau est maintenant privé.');
  };

  const removeNetwork = async (platform: SocialLink['platform']) => {
    const links = user.socialLinks.filter((link) => link.platform !== platform);
    await persistSocialLinks(links, platform, 'Le réseau a été retiré de ton profil.');
    setDrafts((prev) => ({ ...prev, [platform]: '' }));
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerButton} onPress={() => goToTab('Profile')} accessibilityLabel="Retour au profil"><Text style={s.headerText}>‹ Profil</Text></TouchableOpacity>
        <Text style={s.title}>Réglages avancés</Text>
        <TouchableOpacity style={s.headerButton} onPress={() => goToTab('MyMusic')} accessibilityLabel="Revenir aux Playlists"><Text style={[s.headerText, s.right]}>Playlists</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Navigation</Text>
          <Action label="← Revenir aux Playlists" onPress={() => goToTab('MyMusic')} />
          <Action label="Retour au profil" onPress={() => goToTab('Profile')} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Raccourcis</Text>
          <Action label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          <Action label="Services musicaux" onPress={() => navigation.navigate('MusicConnections')} />
          <Action label="Offre & crédits" onPress={() => navigation.navigate('Offers')} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Profil public</Text>
          <View style={s.switchRow}>
            <View style={s.switchText}><Text style={s.label}>Profil visible</Text><Text style={s.help}>Permet aux autres utilisateurs de découvrir tes goûts musicaux.</Text></View>
            <Switch value={user.isPublic} onValueChange={(value) => void updateProfileVisibility(value)} trackColor={{ false: colors.background, true: colors.primary }} />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Réseaux sociaux</Text>
          <Text style={s.help}>Un logo en couleur signifie que le réseau est renseigné. Un logo sombre signifie qu’il n’est pas encore connecté à ton profil.</Text>
          {NETWORKS.map(({ platform, label }) => {
            const existing = linkFor(platform);
            const connected = !!existing?.url.trim();
            const brandColor = SOCIAL_BRAND_COLORS[platform] ?? '#FFFFFF';
            const value = drafts[platform] ?? existing?.url ?? '';
            return (
              <View key={platform} style={s.networkBlock}>
                <View style={s.networkTitle}>
                  <View style={[s.logo, connected ? { backgroundColor: `${brandColor}26`, borderColor: brandColor } : s.logoOff]}>
                    <SocialPlatformIcon platform={platform} size={20} color={connected ? brandColor : colors.textMuted} />
                  </View>
                  <View style={s.networkLabelWrap}>
                    <Text style={s.label}>{label}</Text>
                    <Text style={[s.connectionState, connected && { color: brandColor }]}>{connected ? 'Connecté au profil' : 'Non renseigné'}</Text>
                  </View>
                </View>
                <TextInput style={s.input} value={value} onChangeText={(text) => setDrafts((prev) => ({ ...prev, [platform]: text }))} placeholder={`Lien ${label}`} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} />
                <View style={s.row}>
                  <TouchableOpacity style={s.primaryButton} onPress={() => saveNetwork(platform)} disabled={savingNetwork === platform} accessibilityLabel={`Enregistrer ${label}`}><Text style={s.primaryText}>{savingNetwork === platform ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity>
                  {existing ? <>
                    <TouchableOpacity style={s.secondaryButton} onPress={() => toggleNetworkVisibility(platform)} disabled={savingNetwork === platform} accessibilityLabel={`${existing.visibility === 'PUBLIC' ? 'Rendre privé' : 'Rendre public'} ${label}`}><Text style={s.secondaryText}>{existing.visibility === 'PUBLIC' ? 'Public' : 'Privé'}</Text></TouchableOpacity>
                    <TouchableOpacity style={s.secondaryButton} onPress={() => removeNetwork(platform)} disabled={savingNetwork === platform} accessibilityLabel={`Supprimer ${label}`}><Text style={s.dangerText}>Supprimer</Text></TouchableOpacity>
                  </> : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity style={s.action} onPress={onPress}><Text style={s.actionText}>{label}</Text><Text style={s.actionArrow}>›</Text></TouchableOpacity>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, muted: { color: colors.textMuted },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 82, minHeight: 42, justifyContent: 'center' }, headerText: { color: colors.primaryLight, fontSize: 13, fontWeight: '800' }, right: { textAlign: 'right' }, title: { color: colors.textPrimary, fontSize: 17, fontWeight: '900' },
  content: { padding: 16, paddingBottom: 42 }, section: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 14 }, sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' }, help: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }, action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border }, actionText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' }, actionArrow: { color: colors.primaryLight, fontSize: 22 }, switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, switchText: { flex: 1 },
  networkBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }, networkTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 }, networkLabelWrap: { flex: 1 }, logo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent:'center', borderWidth: 1 }, logoOff: { backgroundColor: '#17121F', borderColor: '#40354E' }, connectionState: { color: colors.textMuted, fontSize: 9, fontWeight: '800', marginTop: 2 }, input: { minHeight: 46, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.textPrimary, backgroundColor: colors.background }, row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 9 },
  primaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', backgroundColor: colors.primary }, primaryText: { color: colors.white, fontSize: 12, fontWeight: '900' }, secondaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated }, secondaryText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' }, dangerText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
});