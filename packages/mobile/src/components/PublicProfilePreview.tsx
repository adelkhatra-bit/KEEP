import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { computeMusicDNA, DnaSourceDecision, ProviderPlaylist } from '@keep/music';
import { User } from '../types';
import { KeepSession } from '../types';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import VerifiedBadge from './VerifiedBadge';
import { musicEngine } from '../services/musicEngine';
import { getPlaylistProviderUrl } from '../utils/providerLinks';
import { fetchProfileKeeps, ProfileKeepRow } from '../services/profileApi';

/** Cf. demande explicite du 24/08/2026 -- boutons de redirection réseaux sociaux, un par plateforme connectée. */
const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📷', tiktok: '🎵', facebook: '📘', snapchat: '👻', youtube: '▶️', x: '✕', website: '🔗', other: '🔗',
};
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', snapchat: 'Snapchat', youtube: 'YouTube', x: 'X', website: 'Site web', other: 'Lien',
};

/**
 * Rendu EXACT de ce qu'un visiteur voit en ouvrant le lien/QR de ce profil --
 * jamais les champs privés (email, date de naissance, genre), jamais les
 * liens sociaux marqués PRIVATE, jamais si `user.isPublic` est faux (cf.
 * demande explicite du 22/08/2026 : "prévoir un système pour visualiser le
 * profil de l'utilisateur ... comme les autres utilisateurs le verront").
 */
export default function PublicProfilePreview({ user, sessions, playlists = [] }: { user: User; sessions: KeepSession[]; playlists?: ProviderPlaylist[] }) {
  const { t } = useTranslation();

  /**
   * BUG RÉEL trouvé le 24/08/2026 (test réel dans le navigateur, demandé
   * explicitement par Adel) : ce composant n'a JAMAIS interrogé le serveur
   * pour les morceaux réellement GARDÉS -- seules les playlists provider et
   * le DNA (calculé depuis `sessions`, données locales) s'affichaient.
   * `GET /profiles/:username/keeps` filtre déjà TOUJOURS sur
   * visibility='PUBLIC' côté serveur (voir fetchProfileKeeps) -- l'appeler
   * avec son propre nom d'utilisateur donne exactement ce qu'un vrai
   * visiteur verrait, PRIVATE inclus jamais renvoyé.
   */
  const [publicKeeps, setPublicKeeps] = useState<ProfileKeepRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (user.isPublic && user.username) {
      fetchProfileKeeps(user.username).then((rows) => {
        if (!cancelled) setPublicKeeps(rows);
      });
    } else {
      setPublicKeeps(null);
    }
    return () => {
      cancelled = true;
    };
  }, [user.username, user.isPublic]);

  const myDna = useMemo(() => {
    const decisions: DnaSourceDecision[] = sessions.flatMap((s) =>
      s.tracks
        .filter((tr) => tr.status === 'kept')
        .map((tr) => ({ artist: tr.track.artist, genres: tr.track.genres ?? [], decision: 'KEPT' as const, createdAt: tr.detectedAt }))
    );
    return computeMusicDNA(decisions);
  }, [sessions]);

  const kindLabel = (kind: User['kind']) =>
    ({ USER: t('profile.kindUser'), CREATOR: t('profile.kindCreator'), DJ: t('profile.kindDj'), ARTIST: t('profile.kindArtist'), PRODUCER: t('profile.kindProducer'), VENUE: t('profile.kindVenue') }[kind]);

  const publicLinks = user.socialLinks.filter((l) => l.visibility === 'PUBLIC');

  // KEEP est un miroir, jamais un hébergeur -- taper une playlist ouvre la
  // vraie plateforme (Spotify, etc.), jamais une lecture simulée dans KEEP.
  const activeProviderId = (() => {
    try {
      return musicEngine.musicProvider.providerId;
    } catch {
      return undefined;
    }
  })();
  const openPlaylist = (playlistId: string) => {
    if (!activeProviderId) return;
    const url = getPlaylistProviderUrl(activeProviderId, playlistId);
    if (url) Linking.openURL(url).catch(() => {});
  };

  if (!user.isPublic) {
    return (
      <View style={styles.privateBox}>
        <Text style={styles.privateEmoji}>🔒</Text>
        <Text style={styles.privateText}>{t('profile.previewPrivate')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {user.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarGlyph}>{user.username.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.usernameRow}>
          <Text style={styles.username}>{user.username}</Text>
          <VerifiedBadge plan={user.plan} size="sm" />
        </View>
        <View style={styles.kindChip}>
          <Text style={styles.kindChipText}>{kindLabel(user.kind)}</Text>
        </View>
        {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        {(user.city || user.countryCode) && (
          <Text style={styles.location}>📍 {[user.city, user.countryCode].filter(Boolean).join(' · ')}</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <Stat value={user.playlistCount} label={t('myMusic.playlists')} />
        <Stat value={user.followerCount} label={t('profile.followers')} />
        <Stat value={user.followingCount} label={t('profile.following')} />
      </View>

      {publicKeeps && publicKeeps.length > 0 && (
        <Section title={t('profile.discoveries')}>
          <View style={styles.waitingList}>
            {publicKeeps.map((k) => (
              <View key={k.id} style={styles.discoveryRow}>
                {k.track.artworkUrl ? (
                  <Image source={{ uri: k.track.artworkUrl }} style={styles.waitingArtwork} />
                ) : (
                  <View style={[styles.waitingArtwork, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarGlyph}>♪</Text>
                  </View>
                )}
                <View style={styles.discoveryInfo}>
                  <Text style={styles.discoveryTitle} numberOfLines={1}>{k.track.title}</Text>
                  <Text style={styles.discoveryArtist} numberOfLines={1}>{k.track.artist}{k.track.album ? ` · ${k.track.album}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      )}
      {publicKeeps && publicKeeps.length === 0 && (
        <Section title={t('profile.discoveries')}>
          <Text style={styles.emptyHint}>{t('profile.discoveriesEmpty')}</Text>
        </Section>
      )}

      {user.favoriteGenres.length > 0 && (
        <Section title={t('profile.favoriteGenres')}>
          <View style={styles.chipsWrap}>
            {user.favoriteGenres.map((g) => (
              <View key={g} style={styles.chip}><Text style={styles.chipText}>{g}</Text></View>
            ))}
          </View>
        </Section>
      )}

      {user.favoriteArtists.length > 0 && (
        <Section title={t('profile.favoriteArtists')}>
          <View style={styles.chipsWrap}>
            {user.favoriteArtists.map((a) => (
              <View key={a} style={styles.chip}><Text style={styles.chipText}>{a}</Text></View>
            ))}
          </View>
        </Section>
      )}

      {playlists.length > 0 && (
        <Section title={t('myMusic.playlists')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistRow}>
            {playlists.map((p) => {
              const canOpen = activeProviderId && !!getPlaylistProviderUrl(activeProviderId, p.id);
              return (
                <TouchableOpacity key={p.id} style={styles.playlistCard} onPress={() => openPlaylist(p.id)} disabled={!canOpen} activeOpacity={canOpen ? 0.7 : 1}>
                  {p.coverUrl ? (
                    <Image source={{ uri: p.coverUrl }} style={styles.playlistCover} />
                  ) : (
                    <View style={[styles.playlistCover, styles.playlistCoverPlaceholder]}>
                      <Text style={styles.playlistCoverGlyph}>♪</Text>
                    </View>
                  )}
                  <Text style={styles.playlistName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.playlistCount}>
                    {canOpen ? t('profile.listenOn', { platform: 'Spotify' }) : t('profile.trackCount', { count: p.trackCount })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Section>
      )}

      {myDna.totalDecisions > 0 && (
        <Section title={t('profile.keepDnaTitle')}>
          <View style={styles.chipsWrap}>
            {myDna.topGenres.map((g) => (
              <View key={g.genre} style={styles.dnaChip}><Text style={styles.dnaChipText}>{g.genre}</Text></View>
            ))}
          </View>
        </Section>
      )}

      {publicLinks.length > 0 && (
        <Section title={t('profile.socialLinks')}>
          {/* Cf. demande explicite du 24/08/2026 -- "un bouton par exemple
              Instagram, redirigé directement sur l'Instagram du client" :
              boutons cliquables, jamais une liste de texte -- KEEP ne fait
              qu'ouvrir la vraie plateforme, jamais un aperçu intégré. */}
          <View style={styles.chipsWrap}>
            {publicLinks.map((l) => (
              <TouchableOpacity
                key={l.platform}
                style={styles.socialBtn}
                onPress={() => Linking.openURL(l.url).catch(() => {})}
                activeOpacity={0.75}
              >
                <Text style={styles.socialBtnIcon}>{PLATFORM_ICONS[l.platform] ?? '🔗'}</Text>
                <Text style={styles.socialBtnLabel}>{t('profile.socialFollowCta', { platform: PLATFORM_LABELS[l.platform] ?? l.platform })}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
      )}

      <View style={styles.followBtn}>
        <Text style={styles.followBtnText}>+ Follow</Text>
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { maxHeight: 480 },
  content: { padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.backgroundCard, marginBottom: spacing.sm },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { color: colors.textMuted, fontSize: 28, fontWeight: '700' },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  username: { ...typography.h3, color: colors.textPrimary },
  kindChip: { backgroundColor: colors.smartBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3, marginTop: spacing.xs },
  kindChipText: { color: colors.smartBadgeText, fontSize: 11, fontWeight: '700' },
  bio: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  location: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  // Même taille/token que TrackRow.tsx/MyMusicScreen.tsx (48x48, radius.sm) --
  // jamais une deuxième valeur d'artwork inventée ici (docs/KEEP_DESIGN_SYSTEM.md).
  waitingList: { gap: spacing.xs },
  discoveryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.backgroundCard, borderRadius: radius.md, padding: spacing.sm },
  waitingArtwork: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.backgroundElevated },
  discoveryInfo: { flex: 1, minWidth: 0 },
  discoveryTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  discoveryArtist: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  statCard: { flex: 1, backgroundColor: colors.backgroundCard, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  statNumber: { ...typography.bodyBold, color: colors.primaryLight, fontSize: 18 },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { backgroundColor: colors.backgroundCard, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  dnaChip: { backgroundColor: colors.smartBadgeBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  dnaChipText: { color: colors.smartBadgeText, fontSize: 11, fontWeight: '700' },
  linkLine: { color: colors.textSecondary, fontSize: 12, marginBottom: 2 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.backgroundCard,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border,
  },
  socialBtnIcon: { fontSize: 14 },
  socialBtnLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  playlistRow: { gap: spacing.sm, paddingRight: spacing.md },
  playlistCard: { width: 96 },
  playlistCover: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.backgroundCard },
  playlistCoverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  playlistCoverGlyph: { color: colors.textMuted, fontSize: 24 },
  playlistName: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  playlistCount: { color: colors.textMuted, fontSize: 10, marginTop: 1 },
  followBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  followBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  privateBox: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  privateEmoji: { fontSize: 32 },
  privateText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
