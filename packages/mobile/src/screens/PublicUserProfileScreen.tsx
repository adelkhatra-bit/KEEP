import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { CanonicalTrack } from '@keep/music';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { requestSocialLink } from '../services/notificationService';
import { DiscoveryImpact, loadProfileDiscoveryImpacts, loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, PublicProfileSnapshot } from '../services/publicProfileStateService';
import { useUserStore } from '../store/useUserStore';
import { ProfileKind, SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';
import ProfileCounterRow from '../components/ProfileCounterRow';
import DiscoveryImpactLabel from '../components/DiscoveryImpactLabel';
import { commitKeep } from '../services/keepTrackAction';
import { shareProfile, shareProfileTrack } from '../services/sharingService';
import { blockUser, isBlockedEitherWay, reportUser, unblockUser, REPORT_REASONS, ReportReason } from '../services/moderationService';

type PublicKeepTrack = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  previewUrl?: string;
  availableOn?: string[];
  externalUrls?: Record<string, string>;
  isrc?: string;
  durationSec?: number;
  genres?: string[];
  providerIds?: Record<string, string | undefined>;
  sourceUserId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
};
type SocialPlatform = SocialLink['platform'];

const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'snapchat', label: 'Snapchat' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'x', label: 'X' },
  { platform: 'facebook', label: 'Facebook' },
];
const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Établissement',
};

const KEEP_PAGE_SIZE = 250;
const QUERY_CHUNK_SIZE = 120;

function chunks<T>(items: T[], size = QUERY_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function PublicUserProfileScreen({ route, navigation }: any) {
  const username = route?.params?.username as string | undefined;
  const viewer = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [profile, setProfile] = useState<User | null>(null);
  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [tracks, setTracks] = useState<PublicKeepTrack[]>([]);
  const [directKeepCount, setDirectKeepCount] = useState(0);
  const [socialKeepCount, setSocialKeepCount] = useState(0);
  const [discoveryImpacts, setDiscoveryImpacts] = useState<Record<string, DiscoveryImpact>>({});
  const [viewerKeepTrackIds, setViewerKeepTrackIds] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [addingTrackIds, setAddingTrackIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [moderationMenuOpen, setModerationMenuOpen] = useState(false);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPublicSnapshot(null);
      setDiscoveryImpacts({});
      setViewerKeepTrackIds(new Set());
      if (!username || !supabase) { setError('Profil indisponible.'); setLoading(false); return; }
      try {
        const result = await createProfileService(supabase).loadPublicProfileByUsername(username);
        if (cancelled) return;
        if (!result) { setError('Ce profil est privé ou introuvable.'); return; }
        // AJOUT (31/08/2026, exigence Apple 1.2 UGC) : si l'un a bloque l'autre
        // (dans n'importe quel sens), le contenu reste cache -- reutilise l'etat
        // d'erreur existant, deja affiche a la place du contenu, sans nouvel ecran.
        if (viewer && viewer.id !== result.id) {
          const blocked = await isBlockedEitherWay(result.id).catch(() => false);
          if (cancelled) return;
          if (blocked) { setIsBlocked(true); setError('Ce profil est indisponible.'); return; }
        }
        setProfile(result);
        setFollowerCount(result.followerCount);

        const snapshotPromise = loadPublicProfileSnapshot(result.id).catch(() => null);
        const impactPromise = loadProfileDiscoveryImpacts(result.id).catch(() => ({}));

        if (viewer?.id && viewer.id !== result.id && !isLocalGuest && !isDemoMode) {
          const { data: existing } = await supabase.from('follows').select('follower_id').eq('follower_id', viewer.id).eq('followee_id', result.id).maybeSingle();
          if (!cancelled) setIsFollowing(!!existing);
        } else if (!cancelled) {
          setIsFollowing(false);
        }

        const canonicalKeeps = await loadPublicProfileKeeps(result.id);
        if (cancelled) return;
        const normalized = canonicalKeeps.map((entry) => ({
          id: entry.decisionId,
          trackId: entry.track.id,
          title: entry.track.title,
          artist: entry.track.artist,
          album: entry.track.album ?? null,
          artworkUrl: entry.track.artworkUrl ?? null,
          previewUrl: entry.track.previewUrl,
          availableOn: entry.track.availableOn ?? [],
          externalUrls: entry.track.externalUrls ?? {},
          isrc: entry.track.isrc,
          durationSec: entry.track.durationSec,
          genres: entry.track.genres ?? [],
          providerIds: entry.track.providerIds ?? {},
          sourceUserId: entry.sourceUserId,
          sourceProfileId: entry.sourceProfileId,
          sourceUsername: entry.sourceUsername,
        } as PublicKeepTrack));

        if (cancelled) return;
        setTracks(normalized);
        const impacts = await impactPromise;
        if (cancelled) return;
        setDiscoveryImpacts(impacts);
        const localDiscoveryImpactCount = Object.values(impacts).reduce((total, impact) => total + (impact.originProfileId === result.id ? impact.recoveryCount : 0), 0);
        const snapshot = await snapshotPromise;
        if (cancelled) return;
        if (snapshot) {
          setPublicSnapshot(snapshot);
          setDirectKeepCount(snapshot.directPublicKeeps);
          setSocialKeepCount(snapshot.socialPublicKeeps);
          setFollowerCount(snapshot.followers);
        } else {
          setSocialKeepCount(localDiscoveryImpactCount);
          setDirectKeepCount(normalized.length);
        }

        const ids = Array.from(new Set(normalized.map((track) => track.trackId).filter(Boolean)));
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        const alreadyKept = new Set<string>();

        for (const idChunk of chunks(ids)) {
          const { data: likes } = await supabase.from('track_likes').select('profile_id,track_id').in('track_id', idChunk);
          for (const row of likes ?? []) {
            counts[row.track_id] = (counts[row.track_id] || 0) + 1;
            if (viewer?.id && row.profile_id === viewer.id) mine.add(row.track_id);
          }

          if (viewer?.id && viewer.id !== result.id && !isLocalGuest && !isDemoMode) {
            const { data: ownKeeps } = await supabase
              .from('keep_decisions')
              .select('track_id')
              .eq('profile_id', viewer.id)
              .eq('decision', 'KEPT')
              .in('track_id', idChunk);
            for (const row of ownKeeps ?? []) if (row.track_id) alreadyKept.add(String(row.track_id));
          }
        }

        if (!cancelled) {
          setLikeCounts(counts);
          setLikedTrackIds(mine);
          setViewerKeepTrackIds(alreadyKept);
        }
      } catch {
        if (!cancelled) setError('Impossible de charger ce profil pour le moment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const unsubscribe = navigation?.addListener?.('focus', () => { void load(); });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [username, viewer?.id, isLocalGuest, isDemoMode, navigation]);

  const albums = useMemo(() => Array.from(new Set(tracks.map((track) => track.album).filter(Boolean) as string[])), [tracks]);
  const swipeTracks = useMemo<CanonicalTrack[]>(() => tracks.map((track) => ({
    id: track.trackId,
    isrc: track.isrc,
    title: track.title,
    artist: track.artist,
    album: track.album || undefined,
    durationSec: track.durationSec,
    artworkUrl: track.artworkUrl || undefined,
    previewUrl: track.previewUrl,
    availableOn: track.availableOn,
    externalUrls: track.externalUrls,
    genres: track.genres,
    providerIds: track.providerIds || {},
  })), [tracks]);

  const goToOwnProfile = () => navigation.navigate('Main', { screen: 'Profile' });
  const shareThisProfile = async () => {
    if (!profile) return;
    try { await shareProfile(profile.username); }
    catch { Alert.alert('Partage', 'Impossible d’ouvrir le partage pour le moment.'); }
  };

  const openSocial = async (platform: SocialPlatform) => {
    if (!profile) return;
    const link = profile.socialLinks.find((item) => item.platform === platform && item.url.trim());
    if (!link) {
      if (viewer && viewer.id !== profile.id) {
        try { await requestSocialLink(profile.id, platform); } catch { }
      }
      Alert.alert('Réseau non partagé', 'Cette personne ne partage pas ce réseau');
      return;
    }
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau social pour le moment.'); }
  };

  const toggleFollow = async () => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte KEEP pour suivre ce profil.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    if (!profile || viewer.id === profile.id || followBusy) return;
    setFollowBusy(true);
    if (isFollowing) {
      const { error: deleteError } = await supabase.from('follows').delete().eq('follower_id', viewer.id).eq('followee_id', profile.id);
      if (!deleteError) { setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1)); }
    } else {
      const { error: insertError } = await supabase.from('follows').insert({ follower_id: viewer.id, followee_id: profile.id });
      if (!insertError) { setIsFollowing(true); setFollowerCount((c) => c + 1); }
    }
    setFollowBusy(false);
  };

  const requireAccountForModeration = () => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte KEEP pour signaler ou bloquer un profil.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return false;
    }
    return true;
  };

  const handleToggleBlock = async () => {
    if (!requireAccountForModeration() || !profile || moderationBusy) return;
    setModerationMenuOpen(false);
    setModerationBusy(true);
    try {
      if (isBlocked) {
        await unblockUser(profile.id);
        setIsBlocked(false);
        Alert.alert('Débloqué', `@${profile.username} peut à nouveau apparaître pour toi.`);
      } else {
        await blockUser(profile.id);
        setIsBlocked(true);
        setIsFollowing(false);
        Alert.alert('Bloqué', `@${profile.username} ne pourra plus interagir avec ton profil, et son contenu ne s’affichera plus pour toi.`);
      }
    } catch {
      Alert.alert('Action impossible', 'Réessaie dans un instant.');
    } finally {
      setModerationBusy(false);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    if (!profile || moderationBusy) return;
    setReportPickerOpen(false);
    setModerationBusy(true);
    try {
      await reportUser(profile.id, reason, undefined, { source: 'public_profile' });
      Alert.alert('Signalement envoyé', 'Merci, notre équipe va l’examiner.');
    } catch {
      Alert.alert('Envoi impossible', 'Réessaie dans un instant.');
    } finally {
      setModerationBusy(false);
    }
  };

  const toggleLike = async (trackId: string) => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte KEEP pour liker ce morceau.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    const alreadyLiked = likedTrackIds.has(trackId);
    const next = new Set(likedTrackIds);
    if (alreadyLiked) {
      const { error: deleteError } = await supabase.from('track_likes').delete().eq('profile_id', viewer.id).eq('track_id', trackId);
      if (deleteError) return;
      next.delete(trackId);
      setLikeCounts((current) => ({ ...current, [trackId]: Math.max(0, (current[trackId] || 0) - 1) }));
    } else {
      const { error: insertError } = await supabase.from('track_likes').insert({ profile_id: viewer.id, track_id: trackId });
      if (insertError) return;
      next.add(trackId);
      setLikeCounts((current) => ({ ...current, [trackId]: (current[trackId] || 0) + 1 }));
    }
    setLikedTrackIds(next);
  };

  const alreadyInMyKeep = (trackId: string) => viewerKeepTrackIds.has(trackId);

  const showAlreadyKept = (title: string) => {
    Alert.alert('Déjà dans ton KEEP', `« ${title} » est déjà dans tes musiques. KEEP ne crée pas de doublon.`);
  };

  const addCanonicalToMyKeep = async (canonical: CanonicalTrack, visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!viewer || isLocalGuest || isDemoMode) {
      setSwipeOpen(false);
      Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte pour ajouter cette musique à ton KEEP.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return false;
    }
    if (profile && viewer.id === profile.id) return false;
    if (alreadyInMyKeep(canonical.id)) {
      showAlreadyKept(canonical.title);
      return false;
    }
    try {
      await commitKeep(canonical, [], undefined, { visibility, context: { source: 'public_profile_swipe', sourceProfileId: profile?.id } });
      setViewerKeepTrackIds((current) => new Set(current).add(canonical.id));
      return true;
    } catch (e: any) {
      if (e?.message === 'CREDITS_EXHAUSTED') {
        setSwipeOpen(false);
        Alert.alert('Crédits gratuits utilisés', 'Passe à Premium pour continuer à ajouter les découvertes à ton KEEP.', [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' }) },
        ]);
        return false;
      }
      throw e;
    }
  };

  const addToMyKeep = async (track: PublicKeepTrack) => {
    if (!viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte pour ajouter cette musique à ton KEEP.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: goToOwnProfile },
      ]);
      return;
    }
    if (profile && viewer.id === profile.id) return;
    if (alreadyInMyKeep(track.trackId)) {
      showAlreadyKept(track.title);
      return;
    }
    if (addingTrackIds.has(track.trackId)) return;
    const canonical: CanonicalTrack = {
      id: track.trackId,
      isrc: track.isrc,
      title: track.title,
      artist: track.artist,
      album: track.album || undefined,
      durationSec: track.durationSec,
      artworkUrl: track.artworkUrl || undefined,
      previewUrl: track.previewUrl,
      availableOn: track.availableOn,
      externalUrls: track.externalUrls,
      genres: track.genres,
      providerIds: track.providerIds || {},
    };
    setAddingTrackIds((current) => new Set(current).add(track.trackId));
    try {
      await commitKeep(canonical, [], undefined, { visibility: 'PRIVATE', context: { source: 'public_profile', sourceProfileId: profile?.id } });
      setViewerKeepTrackIds((current) => new Set(current).add(track.trackId));
      Alert.alert('Ajouté à ton KEEP', `« ${track.title} » est maintenant dans tes musiques.`);
    } catch (e: any) {
      if (e?.message === 'CREDITS_EXHAUSTED') {
        Alert.alert('Crédits gratuits utilisés', 'Tu peux toujours écouter les extraits et continuer tes sessions. Passe à Premium pour débloquer les fonctions payantes.', [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' }) },
        ]);
      } else {
        Alert.alert('KEEP', e?.message || 'Impossible d’ajouter ce morceau pour le moment.');
      }
    } finally {
      setAddingTrackIds((current) => { const next = new Set(current); next.delete(track.trackId); return next; });
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator color={colors.primaryLight} /></View></SafeAreaView>;
  if (!profile || error) return <SafeAreaView style={styles.container}><View style={styles.topBar}><TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}><Text style={styles.back}>‹</Text></TouchableOpacity></View><View style={styles.center}><Text style={styles.muted}>{error ?? 'Profil introuvable.'}</Text></View></SafeAreaView>;

  const certificationTier: ProfileCertificationTier = publicSnapshot?.certificationTier ?? 'UNVERIFIED';
  const followingCount = publicSnapshot?.following ?? profile.followingCount;
  const kindLabel = PROFILE_KIND_LABELS[profile.kind] ?? 'Utilisateur';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View style={styles.topSpacer} />
          {viewer?.id !== profile.id ? (
            <TouchableOpacity style={styles.shareTopButton} onPress={() => setModerationMenuOpen(true)} accessibilityLabel="Signaler ou bloquer ce profil"><Text style={styles.shareTopText}>⋯</Text></TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.shareTopButton} onPress={() => void shareThisProfile()} accessibilityLabel="Partager ce profil"><Text style={styles.shareTopText}>↗</Text></TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.identity}>
            {profile.avatar ? <Image source={{ uri: profile.avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>K</Text></View>}
            <View style={styles.identityText}>
              <View style={styles.usernameLine}><Text style={styles.username}>@{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaLeft}>
                  <View style={styles.kindBadge}><Text style={styles.kindBadgeText}>{kindLabel}</Text></View>
                  {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}
                </View>
                <View style={styles.identityMeta}>
                  {viewer?.id !== profile.id && (
                    <TouchableOpacity style={[styles.followButton, isFollowing && styles.followButtonActive]} onPress={toggleFollow} disabled={followBusy} accessibilityLabel={isFollowing ? 'Ne plus suivre' : 'Suivre'}>
                      <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>{isFollowing ? 'Abonné(e)' : '+ Suivre'}</Text>
                    </TouchableOpacity>
                  )}
                  {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipePreview} onPress={() => setSwipeOpen(true)}><Text style={styles.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity> : null}
                </View>
              </View>
            </View>
          </View>
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
          <ProfileCounterRow kind="connections" items={[
            { value: followerCount, label: 'Abonnés' },
            { value: followingCount, label: 'Abonnements' },
          ]} />
        </View>

        <View style={styles.socialHub}>
          <Text style={styles.socialTitle}>Ses réseaux</Text>
          <View style={styles.socialRow}>
            {SOCIALS.map((item) => {
              const configured = Boolean(profile.socialLinks.find((link) => link.platform === item.platform && link.url.trim()));
              return <TouchableOpacity key={item.platform} style={[styles.socialButton, configured && styles.socialButtonConfigured]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#5C5468'} /></TouchableOpacity>;
            })}
          </View>
        </View>

        <View style={styles.dna}>
          <View style={styles.dnaHeader}><View><Text style={styles.dnaEyebrow}>KEEP DNA</Text><Text style={styles.dnaTitle}>Son empreinte musicale</Text></View><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {(profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0)
            ? <View style={styles.chips}>{[...profile.favoriteGenres, ...profile.favoriteArtists].slice(0,8).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View>
            : <Text style={styles.mutedSmall}>Aucune préférence musicale publique renseignée pour le moment.</Text>}
          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')}</Text> : null}
        </View>

        {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipeLaunch} onPress={() => setSwipeOpen(true)}><Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text><Text style={styles.swipeLaunchText}>Lecture automatique des extraits · KEEP te signale les morceaux déjà présents dans tes musiques.</Text></TouchableOpacity> : null}

        <View style={styles.visitorKeepCounters}>
          <ProfileCounterRow kind="keeps" items={[
            { value: directKeepCount, label: 'KEEP' },
            { value: socialKeepCount, label: 'KEEP utilisateurs' },
          ]} />
        </View>

        <View style={styles.publicMusicSection}>
          <View style={styles.musicSectionHeader}><Text style={styles.sectionTitle}>KEEP publics</Text><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {tracks.length === 0 ? <View style={styles.emptyMusic}><Text style={styles.emptyMusicIcon}>♪</Text><Text style={styles.muted}>Aucun morceau public sur ce profil.</Text></View> : (
            <View style={styles.musicList}>{tracks.map((track) => {
              const liked = likedTrackIds.has(track.trackId);
              const adding = addingTrackIds.has(track.trackId);
              const alreadyKept = alreadyInMyKeep(track.trackId);
              const directDiscovery = !track.sourceUserId && !track.sourceProfileId;
              const discoveryUsername = track.sourceUsername || (directDiscovery ? profile.username : '');
              const discoveryImpact = discoveryImpacts[track.trackId];
              return <View key={track.id} style={styles.musicRow}>
                {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.musicCover} /> : <View style={[styles.musicCover, styles.musicCoverFallback]}><Text style={styles.musicFallback}>K</Text></View>}
                <View style={styles.trackInfo}>
                  <View style={styles.trackTitleRow}>
                    <View style={styles.trackTitleBlock}><Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.album ? ` · ${track.album}` : ''}</Text></View>
                    <TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} compact />
                  </View>
                  <View style={styles.discoveryOriginRow}>
                    <Text style={styles.discoveryOriginLabel}>Découvert avec Écouter par</Text>
                    {discoveryUsername ? discoveryUsername === profile.username ? <Text style={styles.discoveryOriginUser}>@{discoveryUsername}</Text> : (
                      <TouchableOpacity onPress={() => navigation.navigate('PublicUserProfile', { username: discoveryUsername })} accessibilityLabel={`Ouvrir le profil du découvreur ${discoveryUsername}`}>
                        <Text style={styles.discoveryOriginUser}>@{discoveryUsername}</Text>
                      </TouchableOpacity>
                    ) : <Text style={styles.discoveryOriginProtected}>découvreur d’origine protégé</Text>}
                  </View>
                  <DiscoveryImpactLabel impact={discoveryImpact} />
                  <View style={styles.trackActions}>
                    {viewer?.id !== profile.id ? <TouchableOpacity style={[styles.keepButton, alreadyKept && styles.alreadyKeepButton]} onPress={() => alreadyKept ? showAlreadyKept(track.title) : void addToMyKeep(track)} disabled={adding}><Text style={[styles.keepButtonText, alreadyKept && styles.alreadyKeepButtonText]}>{adding ? '…' : alreadyKept ? '✓ DÉJÀ DANS TON KEEP' : '+ KEEP'}</Text></TouchableOpacity> : null}
                    <TouchableOpacity style={styles.shareButton} onPress={() => void shareProfileTrack(profile.username, track.title, track.artist)}><Text style={styles.shareButtonText}>↗ Partager</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.likeButton, liked && styles.likeButtonActive]} onPress={() => void toggleLike(track.trackId)} accessibilityLabel={liked ? 'Retirer le like' : 'Liker ce morceau'}><Text style={[styles.likeHeart, liked && styles.likeHeartActive]}>{liked ? '♥' : '♡'}</Text><Text style={styles.likeCount}>{likeCounts[track.trackId] || 0}</Text></TouchableOpacity>
                  </View>
                </View>
              </View>;
            })}</View>
          )}
        </View>
      </ScrollView>

      <MusicSwipeDeckModal
        visible={swipeOpen}
        tracks={swipeTracks}
        title={`Le KEEP de @${profile.username}`}
        subtitle="Les extraits démarrent automatiquement. Si un morceau est déjà dans ton KEEP, aucun doublon n’est créé."
        askVisibilityOnKeep
        onClose={() => setSwipeOpen(false)}
        onKeep={addCanonicalToMyKeep}
      />

      <Modal visible={moderationMenuOpen} transparent animationType="fade" onRequestClose={() => setModerationMenuOpen(false)}>
        <View style={styles.moderationOverlay}>
          <View style={styles.moderationCard}>
            <TouchableOpacity style={styles.moderationRow} onPress={() => { setModerationMenuOpen(false); setReportPickerOpen(true); }}>
              <Text style={styles.moderationRowText}>Signaler ce profil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moderationRow} disabled={moderationBusy} onPress={() => void handleToggleBlock()}>
              <Text style={[styles.moderationRowText, styles.moderationRowDanger]}>{isBlocked ? 'Débloquer ce profil' : 'Bloquer ce profil'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moderationRow} onPress={() => setModerationMenuOpen(false)}>
              <Text style={styles.moderationRowText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={reportPickerOpen} transparent animationType="fade" onRequestClose={() => setReportPickerOpen(false)}>
        <View style={styles.moderationOverlay}>
          <View style={styles.moderationCard}>
            <Text style={styles.moderationTitle}>Pourquoi signales-tu ce profil ?</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity key={r.value} style={styles.moderationRow} disabled={moderationBusy} onPress={() => void handleReport(r.value)}>
                <Text style={styles.moderationRowText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.moderationRow} onPress={() => setReportPickerOpen(false)}>
              <Text style={styles.moderationRowText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},scroll:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl},topBar:{minHeight:48,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{color:colors.textPrimary,fontSize:38,lineHeight:42},topSpacer:{flex:1},shareTopButton:{width:36,height:36,borderRadius:18,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},shareTopText:{color:'#FFFFFF',fontSize:18,fontWeight:'900'},moderationOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},moderationCard:{width:'100%',maxWidth:360,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',paddingVertical:6},moderationTitle:{color:'#F8F6FC',fontSize:13,fontWeight:'900',padding:14,paddingBottom:6},moderationRow:{minHeight:50,justifyContent:'center',paddingHorizontal:16,borderTopWidth:1,borderTopColor:'#2B2038'},moderationRowText:{color:'#F8F6FC',fontSize:14,fontWeight:'700'},moderationRowDanger:{color:'#FF5F83'},kindBadge:{minHeight:21,paddingHorizontal:7,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#7CF2B9',fontSize:8,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:12},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:68,height:68,borderRadius:34,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:25,fontWeight:'800'},identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:6},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:1},identityMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5},location:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},bio:{color:'#FFFFFF',fontSize:15,lineHeight:21,marginTop:12},
  followButton:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#123D2C',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},followButtonActive:{backgroundColor:'#173529',borderColor:'#38D990'},followButtonText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},followButtonTextActive:{color:'#FFFFFF'},swipePreview:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},

  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800',marginTop:2},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:10,paddingVertical:5},chipText:{color:colors.smartBadgeText,fontSize:11,fontWeight:'700'},mutedSmall:{color:'#FFFFFF',fontSize:12,lineHeight:17,marginTop:8},albumSummaryText:{color:colors.textSecondary,fontSize:10,lineHeight:15,marginTop:8},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},socialRow:{width:'100%',flexDirection:'row',justifyContent:'space-between',gap:7,marginTop:12},socialButton:{flex:1,maxWidth:46,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',opacity:.82},socialButtonConfigured:{backgroundColor:'#5B3F8C',borderColor:'#A884FA',opacity:1},
  visitorKeepCounters:{marginHorizontal:18},sectionTitle:{...typography.h3,color:colors.textPrimary},swipeLaunch:{marginHorizontal:18,marginTop:10,minHeight:58,borderRadius:16,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',paddingHorizontal:14,paddingVertical:10},swipeLaunchTitle:{color:'#FFF',fontSize:11,fontWeight:'900'},swipeLaunchText:{color:'#E5DBF2',fontSize:9,lineHeight:13,textAlign:'center',marginTop:3},publicMusicSection:{paddingHorizontal:18,marginTop:16},musicSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:spacing.md},publicCount:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},emptyMusic:{alignItems:'center',paddingVertical:spacing.xxl,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},emptyMusicIcon:{color:colors.primaryLight,fontSize:28,marginBottom:spacing.sm},musicList:{gap:8},musicRow:{flexDirection:'row',alignItems:'center',padding:9,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},musicCover:{width:52,height:52,borderRadius:10,backgroundColor:colors.backgroundCard},musicCoverFallback:{alignItems:'center',justifyContent:'center'},musicFallback:{color:colors.primaryLight,fontSize:19,fontWeight:'900'},trackInfo:{flex:1,minWidth:0,marginLeft:10},trackTitleRow:{flexDirection:'row',alignItems:'center',gap:6},trackTitleBlock:{flex:1,minWidth:0},trackTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},trackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:5,flexWrap:'wrap'},discoveryOriginLabel:{color:'#FFFFFF',fontSize:9,fontWeight:'800'},discoveryOriginUser:{color:'#7CF2B9',fontSize:10,fontWeight:'900'},discoveryOriginProtected:{color:'#7CF2B9',fontSize:9,fontWeight:'800'},trackActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:7},keepButton:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},keepButtonText:{color:'#0E0A14',fontSize:9,fontWeight:'900'},alreadyKeepButton:{backgroundColor:'#201A28',borderWidth:1,borderColor:'#4B4257'},alreadyKeepButtonText:{color:'#FFFFFF'},shareButton:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center'},shareButtonText:{color:colors.primaryLight,fontSize:9,fontWeight:'800'},likeButton:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'#1A1225',borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},likeButtonActive:{borderColor:'#FF5F83',backgroundColor:'rgba(255,95,131,.10)'},likeHeart:{color:colors.textSecondary,fontSize:14},likeHeartActive:{color:'#FF5F83'},likeCount:{color:colors.textSecondary,fontSize:9,fontWeight:'800'},muted:{color:colors.textMuted,fontSize:14,textAlign:'center'},
});