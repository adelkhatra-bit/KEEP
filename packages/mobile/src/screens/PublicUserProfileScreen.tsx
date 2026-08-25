import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

type PublicKeepTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
};

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

export default function PublicUserProfileScreen({ route, navigation }: any) {
  const username = route?.params?.username as string | undefined;
  const [profile, setProfile] = useState<User | null>(null);
  const [tracks, setTracks] = useState<PublicKeepTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!username || !supabase) {
        setError('Profil indisponible.');
        setLoading(false);
        return;
      }

      try {
        const result = await createProfileService(supabase).loadPublicProfileByUsername(username);
        if (cancelled) return;
        if (!result) {
          setError('Ce profil est privé ou introuvable.');
          return;
        }
        setProfile(result);

        // La RLS Supabase ne laisse passer ici que les décisions KEEP publiques
        // d'un profil lui-même public. Une musique PRIVATE n'est donc jamais
        // envoyée au visiteur, même si le client était modifié.
        const { data, error: keepError } = await supabase
          .from('keep_decisions')
          .select('id, created_at, tracks!inner(id,title,artist,album,artwork_url)')
          .eq('profile_id', result.id)
          .eq('decision', 'KEPT')
          .eq('visibility', 'PUBLIC')
          .order('created_at', { ascending: false })
          .limit(60);

        if (!keepError && !cancelled) {
          const normalized = (data ?? []).map((row: any) => ({
            id: row.id,
            title: row.tracks?.title ?? 'Titre inconnu',
            artist: row.tracks?.artist ?? 'Artiste inconnu',
            album: row.tracks?.album ?? null,
            artworkUrl: row.tracks?.artwork_url ?? null,
          }));
          setTracks(normalized);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger ce profil pour le moment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [username]);

  const openSocial = async (link: SocialLink) => {
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau social.');
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator color={colors.primaryLight} /></View></SafeAreaView>;
  }

  if (!profile || error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></TouchableOpacity></View>
        <View style={styles.center}><Text style={styles.muted}>{error ?? 'Profil introuvable.'}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <Text style={styles.title}>@{profile.username}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.hero}>
          {profile.avatar ? <Image source={{ uri: profile.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>K</Text></View>}
          <Text style={styles.username}>@{profile.username}</Text>
          <Text style={styles.kind}>{profile.kind}</Text>
          {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <View style={styles.socialRow}>
            {profile.socialLinks.map((link) => (
              <TouchableOpacity key={link.platform} style={styles.socialButton} onPress={() => openSocial(link)} accessibilityLabel={link.platform}>
                <Text style={styles.socialGlyph}>{SOCIAL_GLYPHS[link.platform]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.statsRow}>
            <Stat value={tracks.length} label="KEEP" />
            <Stat value={profile.followerCount} label="Abonnés" />
            <Stat value={profile.followingCount} label="Abonnements" />
          </View>

          {(profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0) && (
            <View style={styles.musicIdentity}>
              <Text style={styles.sectionTitle}>KEEP DNA</Text>
              <View style={styles.chips}>
                {[...profile.favoriteGenres, ...profile.favoriteArtists].slice(0, 10).map((item) => (
                  <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.publicMusicSection}>
          <View style={styles.musicSectionHeader}>
            <Text style={styles.sectionTitle}>KEEP publics</Text>
            <Text style={styles.publicCount}>{tracks.length}</Text>
          </View>
          {tracks.length === 0 ? (
            <View style={styles.emptyMusic}>
              <Text style={styles.emptyMusicIcon}>♪</Text>
              <Text style={styles.muted}>Aucun morceau public sur ce profil.</Text>
            </View>
          ) : (
            <View style={styles.musicGrid}>
              {tracks.map((track) => (
                <View key={track.id} style={styles.musicTile}>
                  {track.artworkUrl ? (
                    <Image source={{ uri: track.artworkUrl }} style={styles.musicCover} />
                  ) : (
                    <View style={[styles.musicCover, styles.musicCoverFallback]}><Text style={styles.avatarText}>K</Text></View>
                  )}
                  <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  topBar: { minHeight: 56, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: colors.textPrimary, fontSize: 38, lineHeight: 42 },
  title: { ...typography.h3, color: colors.textPrimary },
  placeholder: { width: 28 },
  hero: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  avatar: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.backgroundCard },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryLight, fontSize: 30, fontWeight: '900' },
  username: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg },
  kind: { color: colors.primaryLight, fontSize: 12, fontWeight: '800', marginTop: 5 },
  location: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  bio: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.lg },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  socialButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  socialGlyph: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  statsRow: { width: '100%', flexDirection: 'row', marginTop: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  statValue: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  musicIdentity: { width: '100%', marginTop: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { backgroundColor: colors.smartBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
  chipText: { color: colors.smartBadgeText, fontSize: 12, fontWeight: '700' },
  publicMusicSection: { paddingHorizontal: spacing.xl, marginTop: spacing.xxl },
  musicSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  publicCount: { color: colors.primaryLight, fontSize: 13, fontWeight: '900' },
  emptyMusic: { alignItems: 'center', paddingVertical: spacing.xxl, borderRadius: radius.lg, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border },
  emptyMusicIcon: { color: colors.primaryLight, fontSize: 28, marginBottom: spacing.sm },
  musicGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  musicTile: { width: '33.333%', padding: spacing.xs },
  musicCover: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.backgroundCard },
  musicCoverFallback: { alignItems: 'center', justifyContent: 'center' },
  trackTitle: { color: colors.textPrimary, fontSize: 11, fontWeight: '800', marginTop: 6 },
  trackArtist: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
