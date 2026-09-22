import React from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import { SocialLink } from '../types';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from './SocialPlatformIcon';
import { createProfileService } from '../services/profileService';
import { stageGuestProfileForUpgrade } from '../services/guestUpgradeService';
import { supabase } from '../services/supabaseClient';
import { loadCurrentPlanCode } from '../services/planService';

const NETWORKS: { platform: SocialLink['platform']; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'snapchat', label: 'Snapchat' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'x', label: 'X' },
  { platform: 'facebook', label: 'Facebook' },
];

// Adel (16-17/09/2026) : "pourquoi tu ne les mets pas directement dans le
// pop-up ... l'idée c'est je clique sur une fonction, j'ai le résultat,
// sans être mélangé à d'autres trucs" -- ce panneau (visibilité + réseaux
// sociaux + site web, auparavant l'onglet 1 de Réglages avancés) se
// déplie maintenant directement à l'intérieur du menu du profil, plus de
// deuxième écran à ouvrir.
export default function PublicProfilePanel({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingNetwork, setSavingNetwork] = React.useState<SocialLink['platform'] | null>(null);
  const [planCode, setPlanCode] = React.useState('FREE');
  const [websiteSaving, setWebsiteSaving] = React.useState(false);

  React.useEffect(() => {
    if (!user?.id || isLocalGuest || isDemoMode) return;
    let live = true;
    loadCurrentPlanCode(user.id).then((code) => { if (live) setPlanCode(code); }).catch(() => {});
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  if (!user) return null;

  const websiteAccess = planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO';
  const websiteLink = user.socialLinks.find((l) => l.platform === 'website');
  const websiteLabelDraft = drafts.website_label ?? websiteLink?.label ?? '';
  const websiteUrlDraft = drafts.website_url ?? websiteLink?.url ?? '';
  const linkFor = (platform: SocialLink['platform']) => user.socialLinks.find((l) => l.platform === platform);

  const persistSocialLinks = async (links: SocialLink[], platform: SocialLink['platform'], successMessage: string) => {
    const nextUser = { ...user, socialLinks: links };
    setSavingNetwork(platform);
    try {
      if (isDemoMode) { setUser(nextUser); Alert.alert('Mode démo', 'Ce réglage est temporaire dans le mode démo.'); return; }
      if (isLocalGuest || !supabase) {
        setUser(nextUser);
        if (isLocalGuest) await stageGuestProfileForUpgrade(nextUser);
        Alert.alert('Réseau enregistré', 'Le lien est conservé sur cet appareil. Il sera repris automatiquement lorsque tu créeras ton compte Loki Music.');
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

  const saveWebsite = async () => {
    if (!websiteAccess) return void Alert.alert('Formule requise', 'Le bouton site web est réservé à Creator Pro et Venue Pro.', [
      { text: 'Plus tard', style: 'cancel' }, { text: 'Voir les offres', onPress: () => navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'WEBSITE_BUTTON' }) },
    ]);
    const url = websiteUrlDraft.trim();
    const label = websiteLabelDraft.trim();
    if (!url) return void Alert.alert('Lien manquant', 'Ajoute le lien de ton site.');
    if (!label) return void Alert.alert('Nom manquant', 'Donne un nom à ton bouton (ex : Mon site, Réserver, Boutique).');
    setWebsiteSaving(true);
    try {
      const links = [
        ...user.socialLinks.filter((l) => l.platform !== 'website'),
        { platform: 'website', url, label, visibility: websiteLink?.visibility ?? 'PUBLIC' } as SocialLink,
      ];
      await persistSocialLinks(links, 'website', 'Ton bouton site web est actif sur ton profil.');
      setDrafts((prev) => ({ ...prev, website_label: label, website_url: url }));
    } finally {
      setWebsiteSaving(false);
    }
  };

  const removeWebsite = async () => {
    const links = user.socialLinks.filter((link) => link.platform !== 'website');
    await persistSocialLinks(links, 'website', 'Le bouton site web a été retiré de ton profil.');
    setDrafts((prev) => ({ ...prev, website_label: '', website_url: '' }));
  };

  return <View>
    <View style={s.switchRow}>
      <View style={s.switchText}><Text style={s.label}>Profil visible</Text><Text style={s.help}>Permet aux autres utilisateurs de découvrir tes goûts musicaux.</Text></View>
      <Switch value={user.isPublic} onValueChange={(value) => void updateProfileVisibility(value)} trackColor={{ false: colors.background, true: colors.primary }} />
    </View>

    <Text style={[s.sectionTitle, { marginTop: 16 }]}>Réseaux sociaux</Text>
    <Text style={s.help}>Un logo en couleur signifie que le réseau est renseigné.</Text>
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
            <TouchableOpacity style={s.primaryButton} onPress={() => saveNetwork(platform)} disabled={savingNetwork === platform}><Text style={s.primaryText}>{savingNetwork === platform ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity>
            {existing ? <>
              <TouchableOpacity style={s.secondaryButton} onPress={() => toggleNetworkVisibility(platform)} disabled={savingNetwork === platform}><Text style={s.secondaryText}>{existing.visibility === 'PUBLIC' ? 'Public' : 'Privé'}</Text></TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => removeNetwork(platform)} disabled={savingNetwork === platform}><Text style={s.dangerText}>Supprimer</Text></TouchableOpacity>
            </> : null}
          </View>
        </View>
      );
    })}

    <Text style={[s.sectionTitle, { marginTop: 16 }]}>Site web {websiteAccess ? '' : '🔒'}</Text>
    <Text style={s.help}>{websiteAccess
      ? 'Un bouton avec le nom de ton choix s’affiche sur ton profil public.'
      : 'Réservé aux formules Creator Pro et Venue Pro.'}</Text>
    {websiteAccess ? (
      <View style={s.networkBlock}>
        <TextInput style={s.input} value={websiteLabelDraft} onChangeText={(text) => setDrafts((prev) => ({ ...prev, website_label: text }))} placeholder="Nom du bouton (ex : Mon site)" placeholderTextColor={colors.textMuted} maxLength={24} />
        <TextInput style={s.input} value={websiteUrlDraft} onChangeText={(text) => setDrafts((prev) => ({ ...prev, website_url: text }))} placeholder="Lien du site (https://...)" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} />
        <View style={s.row}>
          <TouchableOpacity style={s.primaryButton} onPress={() => void saveWebsite()} disabled={websiteSaving}><Text style={s.primaryText}>{websiteSaving ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity>
          {websiteLink ? <TouchableOpacity style={s.secondaryButton} onPress={() => void removeWebsite()} disabled={websiteSaving}><Text style={s.dangerText}>Supprimer</Text></TouchableOpacity> : null}
        </View>
      </View>
    ) : (
      <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'WEBSITE_BUTTON' })}><Text style={s.primaryText}>Voir Creator Pro</Text></TouchableOpacity>
    )}
  </View>;
}

const s = StyleSheet.create({
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' }, help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, switchText: { flex: 1 },
  networkBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }, networkTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 }, networkLabelWrap: { flex: 1 },
  logo: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, logoOff: { backgroundColor: '#17121F', borderColor: '#40354E' },
  connectionState: { color: colors.textMuted, fontSize: 11, fontWeight: '800', marginTop: 1 },
  input: { minHeight: 42, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  primaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', backgroundColor: colors.primary }, primaryText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  secondaryButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated }, secondaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' }, dangerText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
});
