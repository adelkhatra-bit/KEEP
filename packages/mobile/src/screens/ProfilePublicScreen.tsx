import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { computeMusicDNA, DnaSourceDecision } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { SocialLink } from '../types';
import { shareProfile } from '../services/sharingService';

type ProfileTab = 'KEEP' | 'PLAYLISTS' | 'ARTISTS' | 'ALBUMS';

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'KEEP', label: 'KEEP' },
  { key: 'PLAYLISTS', label: 'Playlists' },
  { key: 'ARTISTS', label: 'Artistes' },
  { key: 'ALBUMS', label: 'Albums' },
];

const SOCIAL_GLYPHS: Record<SocialLink['platform'], string> = {
  instagram: '◎',
  tiktok: '♪',
  facebook: 'f',
  snapchat: '⌁',
  youtube: '▶',
  x: '𝕏',
  website: '↗',
  other: '•',
};

export default function ProfilePublicScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const [activeTab, setActiveTab] = useState<ProfileTab>('KEEP');

  const keptTracks = useMemo(
    () => sessions.flatMap((session) => session.tracks.filter((entry) => entry.status === 'kept')),
    [sessions]
  );

  const dna = useMemo(() => {
    const decisions: DnaSourceDecision[] = keptTracks.map((entry) => ({
      artist: entry.track.artist,
      genres: entry.track.genres ?? [],
      decision: 'KEPT',
      createdAt: entry.detectedAt,
    }));
    return computeMusicDNA(decisions);
  }, [keptTracks]);

  const artists = useMemo(
    () => Array.from(new Set(keptTracks.map((entry) => entry.track.artist))).slice(0, 18),
    [keptTracks]
  );

  const albums = useMemo(
    () => Array.from(new Set(keptTracks.map((entry) => entry.track.album).filter(Boolean) as string[])).slice(0, 18),
    [keptTracks]
  );

  const playlists = useMemo(() => {
    const names = keptTracks.flatMap((entry) => entry.recommendations.map((recommendation) => recommendation.playlistName));
    return Array.from(new Set(names)).slice(0, 18);
  }, [keptTracks]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.demoTitle}>Profil KEEP</Text>
          <Text style={styles.demoSubtitle}>Aucun compte actif. Tu peux entrer immédiatement pour tester l’application.</Text>
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => enterDemoMode()}
            accessibilityRole="button"
            accessibilityLabel="Entrer en mode démo"
          >
            <Text style={styles.demoButtonText}>ENTRER EN MODE DÉMO</Text>
            <Text style={styles.demoButtonHint}>Accéder à KEEP sans créer de compte</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const publicSocialLinks = user.socialLinks.filter((link) => link.visibility === 'PUBLIC');

  const openSocialLink = async (link: SocialLink) => {
    let url = link.url.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau social pour le moment.');
    }
  };

  const handleShare = async () => {
    try {
      await shareProfile(user.username);
    } catch {
      // Native share sheet cancelled by the user.
    }
  };

  const renderTabContent = () => {
    if (activeTab === 'KEEP') {
      if (keptTracks.length === 0) return <EmptyState text="Tes morceaux KEEP apparaîtront ici." />;
      return (
        <View style={styles.grid}>
          {keptTracks.slice(0, 18).map((entry) => (
            <View key={entry.id} style={styles.musicTile}>
              {entry.track.artworkUrl ? (
                <Image source={{ uri: entry.track.artworkUrl }} style={styles.musicCover} />
              ) : (
                <View style={[styles.musicCover, styles.coverFallback]}>
                  <Text style={styles.coverFallbackText}>K</Text>
                </View>
              )}
              <Text style={styles.tileTitle} numberOfLines={1}>{entry.track.title}</Text>
              <Text style={styles.tileSubtitle} numberOfLines={1}>{entry.track.artist}</Text>
            </View>
          ))}
        </View>
      );
    }

    const items = activeTab === 'PLAYLISTS' ? playlists : activeTab === 'ARTISTS' ? artists : albums;
    if (items.length === 0) {
      return <EmptyState text={activeTab === 'PLAYLISTS' ? 'Tes playlists apparaîtront ici.' : activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;
    }

    return (
      <View style={styles.listCard}>
        {items.map((item) => (
          <View key={item} style={styles.listRow}>
            <View style={styles.listIcon}><Text style={styles.listIconText}>♪</Text></View>
            <Text style={styles.listText} numberOfLines={1}>{item}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Profil</Text>
          <View style={styles.topActions}>
            <TouchableOpacity style={styles.iconButton} onPress={handleShare} accessibilityLabel="Partager le profil">
              <Text style={styles.iconButtonText}>↗</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Modifier le profil">
              <Text style={styles.iconButtonText}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.identityRow}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>K</Text></View>
            )}
            <View style={styles.identityText}>
              <Text style={styles.username}>@{user.username}</Text>
              <Text style={styles.kind}>{user.kind}</Text>
              {(user.city || user.countryCode) && (
                <Text style={styles.location}>{[user.city, user.countryCode].filter(Boolean).join(' · ')}</Text>
              )}
            </View>
          </View>

          {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          {publicSocialLinks.length > 0 && (
            <View style={styles.socialRow}>
              {publicSocialLinks.map((link) => (
                <TouchableOpacity
                  key={link.platform}
                  style={styles.socialButton}
                  onPress={() => openSocialLink(link)}
                  accessibilityLabel={link.platform}
                >
                  <Text style={styles.socialGlyph}>{SOCIAL_GLYPHS[link.platform]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.statsRow}>
            <Stat value={keptTracks.length} label="KEEP" />
            <Stat value={user.followerCount} label="Abonnés" />
            <Stat value={user.followingCount} label="Abonnements" />
          </View>
        </View>

        <View style={styles.dnaCard}>
          <View style={styles.dnaHeader}>
            <View>
              <Text style={styles.dnaEyebrow}>KEEP DNA</Text>
              <Text style={styles.dnaTitle}>Ton empreinte musicale</Text>
            </View>
            <Text style={styles.dnaScore}>{Math.round(dna.diversityScore * 100)}%</Text>
          </View>
          {dna.topGenres.length > 0 ? (
            <View style={styles.chips}>
              {dna.topGenres.slice(0, 5).map((genre) => (
                <View key={genre.genre} style={styles.genreChip}>
                  <Text style={styles.genreChipText}>{genre.genre}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>
          )}
        </View>

        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <TouchableOpacity key={tab.key} style={styles.tabButton} onPress={() => setActiveTab(tab.key)}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              {activeTab === tab.key && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>

        {renderTabContent()}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>♪</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  demoTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  demoSubtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: spacing.xl },
  demoButton: { width: '100%', minHeight: 64, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  demoButtonText: { ...typography.button, color: colors.white, fontWeight: '900' },
  demoButtonHint: { color: colors.white, opacity: 0.78, fontSize: 11, marginTop: 3 },
  scrollContent: { paddingBottom: spacing.xxl },
  topBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: { ...typography.h2, color: colors.textPrimary },
  topActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  iconButtonText: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.backgroundCard },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryLight, fontSize: 34, fontWeight: '800' },
  identityText: { flex: 1, marginLeft: spacing.lg },
  username: { ...typography.h2, color: colors.textPrimary },
  kind: { color: colors.primaryLight, fontSize: 12, fontWeight: '800', marginTop: 4 },
  location: { color: colors.textMuted, fontSize: 13, marginTop: 5 },
  bio: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.lg },
  socialRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' },
  socialButton: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border,
  },
  socialGlyph: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  statsRow: {
    marginTop: spacing.xl, flexDirection: 'row', backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  statValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  dnaCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.lg,
    borderRadius: radius.lg, backgroundColor: colors.backgroundElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  dnaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dnaEyebrow: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  dnaTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 3 },
  dnaScore: { color: colors.primaryLight, fontSize: 24, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  genreChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.smartBadgeBg },
  genreChipText: { color: colors.smartBadgeText, fontSize: 12, fontWeight: '700' },
  tabs: {
    marginTop: spacing.xl, paddingHorizontal: spacing.md, flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tabButton: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.md, position: 'relative' },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.textPrimary },
  tabIndicator: { position: 'absolute', bottom: -1, height: 2, width: '70%', backgroundColor: colors.primaryLight, borderRadius: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm },
  musicTile: { width: '33.333%', padding: spacing.xs },
  musicCover: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.backgroundCard },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: colors.primaryLight, fontSize: 28, fontWeight: '900' },
  tileTitle: { color: colors.textPrimary, fontSize: 11, fontWeight: '700', marginTop: 6 },
  tileSubtitle: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  listCard: { marginHorizontal: spacing.xl, marginTop: spacing.md },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  listIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundCard },
  listIconText: { color: colors.primaryLight, fontSize: 18, fontWeight: '800' },
  listText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginLeft: spacing.md },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl * 2, paddingHorizontal: spacing.xl },
  emptyIcon: { color: colors.primaryLight, fontSize: 30, marginBottom: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
