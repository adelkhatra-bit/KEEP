import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { CanonicalTrack } from '@keep/music';
import { supabase } from '../services/supabaseClient';
import { createProfileService } from '../services/profileService';
import { requestSocialLink } from '../services/notificationService';
import { DiscoveryImpact, loadProfileDiscoveryImpacts, loadProfileReprisers, loadPublicProfileKeeps, loadPublicProfileSnapshot, ProfileCertificationTier, ProfileRepriser, PublicProfileSnapshot } from '../services/publicProfileStateService';
import CommunityConnectionsPanel, { CommunityMode } from '../components/CommunityConnectionsPanel';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { KeepVisibility, ProfileKind, SocialLink, User } from '../types';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import ProfileCertificationBadge, { CERTIFICATION_META } from '../components/ProfileCertificationBadge';
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
  sourceCertificationTier?: ProfileCertificationTier;
  sourceIsFollowing?: boolean;
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
  // Adel (09/09/2026) : "j'ai appuye sur garder ... normalement il y aurait
  // du y avoir un popup, souhaitez-vous la mettre en prive ou en public,
  // et il m'a pas demande" -- meme choix que dans SWIPER/TrackRow, jamais
  // saute pour ce bouton en ligne.
  const [keepPromptTrack, setKeepPromptTrack] = useState<PublicKeepTrack | null>(null);
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
  // Adel (09/09/2026) : "meme design que le profil normal" -- Abonnes/
  // Abonnements et Reprises deviennent cliquables ici aussi (pastilles +
  // style musical, liste "qui a repris"), comme sur son propre profil.
  const [communityMode, setCommunityMode] = useState<CommunityMode>(null);
  const [repriseListOpen, setRepriseListOpen] = useState(false);
  const [repriseLoading, setRepriseLoading] = useState(false);
  const [reprisers, setReprisers] = useState<ProfileRepriser[]>([]);
  const [repriseFollowBusyId, setRepriseFollowBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // BUG RÉEL trouvé le 01/09/2026 (Adel, capture à l'appui : deux
    // notifications "Visite de ton profil" avec la même seconde exacte) :
    // le `void load()` du montage ET le premier événement `focus` de
    // Navigation se déclenchent tous les deux dès la toute première
    // ouverture de cet écran -- `load()` tournait donc deux fois en
    // parallèle, doublant chaque requête (dont notify_profile_view). Le
    // tout premier `focus` est ignoré ici puisque le `void load()` juste en
    // dessous le couvre déjà ; les focus suivants (retour sur cet écran)
    // continuent de recharger normalement.
    let skipNextFocus = true;
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
          sourceCertificationTier: entry.sourceCertificationTier,
          sourceIsFollowing: entry.sourceIsFollowing,
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
    const unsubscribe = navigation?.addListener?.('focus', () => {
      if (skipNextFocus) { skipNextFocus = false; return; }
      void load();
    });
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

  const goToOwnProfile = () => useAccountGateStore.getState().requestAccount('create');
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
    // Adel (08/09/2026, audit partage puis "ne pas bouger d'endroit") : cette
    // pastille redirigeait un invité vers l'onglet Profil, perdant à la fois
    // l'intention de suivi ET l'endroit où il se trouvait. Le popup de
    // création de compte s'ouvre maintenant ICI, par-dessus cet écran, avec
    // le profil visé déjà transmis (SourceProfileQuickView faisait déjà ça
    // pour l'intention, il manquait juste le "rester sur place").
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki requis', `Crée ou connecte ton compte Loki : tu suivras ${profile?.username || 'ce profil'} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', profile?.username) },
      ]);
      return;
    }
    if (!profile || viewer.id === profile.id || followBusy) return;
    setFollowBusy(true);
    // Adel (audit partage) : le suivi doit passer par les RPC sécurisées
    // (comme partout ailleurs dans l'appli), pas par une écriture directe sur
    // `follows` qui contourne le plafond d'abonnements du plan.
    if (isFollowing) {
      const { error } = await supabase.rpc('keep_unfollow_profile', { p_followee_id: profile.id });
      if (!error) { setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1)); }
    } else {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: profile.id });
      if (!error) { setIsFollowing(true); setFollowerCount((c) => c + 1); }
      else if (String(error.message || '').includes('FOLLOW_LIMIT')) Alert.alert('Limite atteinte', 'Ton plan actuel limite le nombre de profils que tu peux suivre.');
    }
    setFollowBusy(false);
  };

  useEffect(() => {
    let live = true;
    if (!repriseListOpen || !profile) return undefined;
    setRepriseLoading(true);
    loadProfileReprisers(profile.id).then((rows) => { if (live) setReprisers(rows); }).catch(() => { if (live) setReprisers([]); }).finally(() => { if (live) setRepriseLoading(false); });
    return () => { live = false; };
  }, [repriseListOpen, profile?.id]);

  const toggleRepriserFollow = async (repriser: ProfileRepriser) => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki requis', `Crée ou connecte ton compte Loki : tu suivras ${repriser.username} automatiquement dès que ton compte sera prêt.`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create', repriser.username) },
      ]);
      return;
    }
    if (repriseFollowBusyId) return;
    setRepriseFollowBusyId(repriser.profileId);
    try {
      if (repriser.isFollowing) {
        const { error } = await supabase.rpc('keep_unfollow_profile', { p_followee_id: repriser.profileId });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: repriser.profileId });
        if (error) throw error;
      }
      setReprisers((rows) => rows.map((r) => r.profileId === repriser.profileId ? { ...r, isFollowing: !r.isFollowing } : r));
    } catch {
      Alert.alert('Abonnement', 'Impossible de mettre à jour l’abonnement pour le moment.');
    } finally {
      setRepriseFollowBusyId(null);
    }
  };

  const requireAccountForModeration = () => {
    if (!supabase || !viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte Loki pour signaler ou bloquer un profil.', [
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
        Alert.alert('Débloqué', `${profile.username} peut à nouveau apparaître pour toi.`);
      } else {
        await blockUser(profile.id);
        setIsBlocked(true);
        setIsFollowing(false);
        Alert.alert('Bloqué', `${profile.username} ne pourra plus interagir avec ton profil, et son contenu ne s’affichera plus pour toi.`);
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
      Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte Loki pour liker ce morceau.', [
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
    Alert.alert('Déjà dans ta collection', `« ${title} » est déjà dans tes musiques. Loki ne crée pas de doublon.`);
  };

  const addCanonicalToMyKeep = async (canonical: CanonicalTrack, visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!viewer || isLocalGuest || isDemoMode) {
      setSwipeOpen(false);
      Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte pour ajouter cette musique à ta collection.', [
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
        Alert.alert('Crédits gratuits utilisés', 'Passe à Premium pour continuer à ajouter les découvertes à ta collection.', [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' }) },
        ]);
        return false;
      }
      throw e;
    }
  };

  const openKeepPrompt = (track: PublicKeepTrack) => {
    if (!viewer || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte pour ajouter cette musique à ta collection.', [
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
    setKeepPromptTrack(track);
  };

  const addToMyKeep = async (track: PublicKeepTrack, visibility: KeepVisibility) => {
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
      await commitKeep(canonical, [], undefined, { visibility, context: { source: 'public_profile', sourceProfileId: profile?.id } });
      setViewerKeepTrackIds((current) => new Set(current).add(track.trackId));
      Alert.alert('Ajouté à ta collection', `« ${track.title} » est maintenant dans tes musiques.`);
    } catch (e: any) {
      if (e?.message === 'CREDITS_EXHAUSTED') {
        Alert.alert('Crédits gratuits utilisés', 'Tu peux toujours écouter les extraits et continuer tes sessions. Passe à Premium pour débloquer les fonctions payantes.', [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Voir Premium', onPress: () => navigation.navigate('Offers', { focusPlan: 'PREMIUM', sourceFeature: 'PUBLIC_PLAYLISTS' }) },
        ]);
      } else {
        Alert.alert('Loki', e?.message || 'Impossible d’ajouter ce morceau pour le moment.');
      }
    } finally {
      setKeepPromptTrack(null);
      setAddingTrackIds((current) => { const next = new Set(current); next.delete(track.trackId); return next; });
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator color={colors.primaryLight} /></View></SafeAreaView>;
  if (!profile || error) return <SafeAreaView style={styles.container}><View style={styles.topBar}><TouchableOpacity onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}><Text style={styles.back}>‹</Text></TouchableOpacity></View><View style={styles.center}><Text style={styles.muted}>{error ?? 'Profil introuvable.'}</Text></View></SafeAreaView>;

  const certificationTier: ProfileCertificationTier = publicSnapshot?.certificationTier ?? 'UNVERIFIED';
  const followingCount = publicSnapshot?.following ?? profile.followingCount;
  const kindLabel = PROFILE_KIND_LABELS[profile.kind] ?? 'Utilisateur';
  // Règle (07/09/2026, Adel) : un badge Free ou de type de profil reprend
  // toujours la couleur de la certification correspondante.
  const certificationColors = CERTIFICATION_META[certificationTier] ?? CERTIFICATION_META.UNVERIFIED;

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
              <View style={styles.usernameLine}><Text style={styles.username}>{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaLeft}>
                  <View style={[styles.kindBadge, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}><Text style={[styles.kindBadgeText, { color: certificationColors.ring }]}>{kindLabel}</Text></View>
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
          {/* Adel (09/09/2026) : "meme design que le profil normal ...
              abonnement descend a la place de reprise et reprise remonte" --
              memes pastilles/style musical au clic, meme ordre que le
              propre profil. */}
          <ProfileCounterRow kind="connections" items={[
            { value: followerCount, label: 'Abonnés', active: communityMode === 'followers', onPress: () => setCommunityMode((v) => v === 'followers' ? null : 'followers') },
            { value: socialKeepCount, label: 'Reprises', onPress: () => setRepriseListOpen(true) },
          ]} />
          {!isLocalGuest && !isDemoMode && communityMode === 'followers' ? <CommunityConnectionsPanel userId={profile.id} navigation={navigation} mode={communityMode} /> : null}
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

        {/* Adel (02/09/2026) : "on me montrera pas le lien du site, on
            mettra un bouton" -- jamais l'URL affichée, juste le libellé
            choisi par le propriétaire du profil. */}
        {(() => {
          const websiteLink = profile.socialLinks.find((link) => link.platform === 'website' && link.url.trim());
          if (!websiteLink) return null;
          const openWebsite = async () => {
            let url = websiteLink.url.trim();
            if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
            try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce site pour le moment.'); }
          };
          return <TouchableOpacity style={styles.websiteButton} onPress={() => void openWebsite()} accessibilityLabel={websiteLink.label || 'Site web'}><Text style={styles.websiteButtonText}>🔗 {websiteLink.label || 'Site web'}</Text></TouchableOpacity>;
        })()}

        <View style={styles.dna}>
          <View style={styles.dnaHeader}><View><Text style={styles.dnaEyebrow}>Loki DNA</Text><Text style={styles.dnaTitle}>Son empreinte musicale</Text></View><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {(profile.favoriteGenres.length > 0 || profile.favoriteArtists.length > 0)
            ? <View style={styles.chips}>{[...profile.favoriteGenres, ...profile.favoriteArtists].slice(0,8).map((item) => <View key={item} style={styles.chip}><Text style={styles.chipText}>{item}</Text></View>)}</View>
            : <Text style={styles.mutedSmall}>Aucune préférence musicale publique renseignée pour le moment.</Text>}
          {albums.length > 0 ? <Text style={styles.albumSummaryText} numberOfLines={2}>Albums : {albums.slice(0,5).join(' · ')}</Text> : null}
        </View>

        {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipeLaunch} onPress={() => setSwipeOpen(true)}><Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SA COLLECTION EN SWIPE</Text><Text style={styles.swipeLaunchText}>Lecture automatique des extraits · Loki te signale les morceaux déjà présents dans tes musiques.</Text></TouchableOpacity> : null}

        <View style={styles.visitorKeepCounters}>
          <ProfileCounterRow kind="keeps" items={[
            { value: directKeepCount, label: 'Morceaux' },
            { value: followingCount, label: 'Abonnements', active: communityMode === 'following', onPress: () => setCommunityMode((v) => v === 'following' ? null : 'following') },
          ]} />
          {!isLocalGuest && !isDemoMode && communityMode === 'following' ? <CommunityConnectionsPanel userId={profile.id} navigation={navigation} mode={communityMode} /> : null}
        </View>

        <View style={styles.publicMusicSection}>
          <View style={styles.musicSectionHeader}><Text style={styles.sectionTitle}>Morceaux publics</Text><Text style={styles.publicCount}>{tracks.length}</Text></View>
          {tracks.length === 0 ? <View style={styles.emptyMusic}><Text style={styles.emptyMusicIcon}>♪</Text><Text style={styles.muted}>Aucun morceau public sur ce profil.</Text></View> : (
            <View style={styles.musicList}>{tracks.map((track) => {
              const liked = likedTrackIds.has(track.trackId);
              const adding = addingTrackIds.has(track.trackId);
              const alreadyKept = alreadyInMyKeep(track.trackId);
              const directDiscovery = !track.sourceUserId && !track.sourceProfileId;
              const discoveryUsername = track.sourceUsername || (directDiscovery ? profile.username : '');
              const discoveryImpact = discoveryImpacts[track.trackId];
              // Adel (09/09/2026) : "c'est pas du tout le meme design que
              // sur le profil, reamenage utilise le meme design sauf que tu
              // rajoutes le coeur en plus" -- meme structure compacte que le
              // propre profil (bouton(s) en ligne a cote du titre), avec le
              // coeur en plus et un bouton Garder en ligne (au lieu de la
              // pile Jouer/Garder pleine largeur).
              // Adel (09/09/2026, second passage) : "descends [Decouvert par]
              // aligne a Partager et aux petits coeurs ... laisse-le du cote
              // ou y a marque Jouer et Garder" -- Decouvert par descend dans
              // la ligne Partager/coeur, aligne a droite (meme cote que
              // Jouer/Garder au-dessus), Partager+coeur groupes a gauche.
              const trackLikeCount = likeCounts[track.trackId] || 0;
              return <View key={track.id} style={styles.musicRow}>
                {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.musicCover} /> : <View style={[styles.musicCover, styles.musicCoverFallback]}><Text style={styles.musicFallback}>K</Text></View>}
                <View style={styles.trackInfo}>
                  <View style={styles.trackTitleRow}>
                    <View style={styles.trackTitleBlock}><Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.album ? ` · ${track.album}` : ''}</Text></View>
                    <View style={styles.trackRightColumn}>
                      <View style={styles.trackInlineActions}>
                        <TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} compact small />
                        {viewer?.id !== profile.id ? (
                          <TouchableOpacity style={[styles.keepButtonInline, alreadyKept && styles.alreadyKeepButton]} onPress={() => alreadyKept ? showAlreadyKept(track.title) : openKeepPrompt(track)} disabled={adding}>
                            <Text style={[styles.keepButtonText, alreadyKept && styles.alreadyKeepButtonText]} numberOfLines={1}>{adding ? '…' : alreadyKept ? '✓ Gardé' : '+ Garder'}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <DiscoveryImpactLabel impact={discoveryImpact} />
                  <View style={styles.trackActions}>
                    <View style={styles.trackActionsLeft}>
                      <TouchableOpacity style={styles.shareButton} onPress={() => void shareProfileTrack(profile.username, track.title, track.artist)}><Text style={styles.shareButtonText}>↗ Partager</Text></TouchableOpacity>
                      {/* Adel (09/09/2026) : "quand il y a pas de j'aime, mets
                          le coeur en vert, entoure-le pour qu'on le voit bien"
                          -- incite a etre le premier a liker. */}
                      <TouchableOpacity style={[styles.likeButton, liked && styles.likeButtonActive, !liked && trackLikeCount === 0 && styles.likeButtonEmpty]} onPress={() => void toggleLike(track.trackId)} accessibilityLabel={liked ? 'Retirer le like' : 'Liker ce morceau'}><Text style={[styles.likeHeart, liked && styles.likeHeartActive]}>{liked ? '♥' : '♡'}</Text><Text style={styles.likeCount}>{trackLikeCount}</Text></TouchableOpacity>
                    </View>
                    <View style={styles.discoveryOriginRow}>
                      <Text style={styles.discoveryOriginLabel}>Découvert par</Text>
                      {discoveryUsername ? discoveryUsername === profile.username ? <View style={[styles.discoveryOriginPill, { backgroundColor: `${certificationColors.colors[certificationColors.colors.length - 1]}33`, borderColor: certificationColors.ring }]}><Text style={[styles.discoveryOriginUser, { color: certificationColors.ring }]}>{discoveryUsername}</Text></View> : (() => {
                        const tierColors = track.sourceCertificationTier ? (CERTIFICATION_META[track.sourceCertificationTier] ?? CERTIFICATION_META.UNVERIFIED) : null;
                        // Adel (08/09/2026) : "si abonne on met vert, si pas
                        // abonne on met rouge ... incite a cliquer dessus" --
                        // le contour porte ce signal, le fond reste la couleur
                        // de certification.
                        const followBorder = track.sourceIsFollowing === false ? '#FF6C8C' : track.sourceIsFollowing === true ? '#38D990' : null;
                        return (
                          <TouchableOpacity
                            style={[styles.discoveryOriginPill, tierColors ? { backgroundColor: `${tierColors.colors[tierColors.colors.length - 1]}33`, borderColor: tierColors.ring } : null, followBorder ? { borderColor: followBorder, borderWidth: 2 } : null]}
                            onPress={() => navigation.navigate('PublicProfile', { username: discoveryUsername })}
                            accessibilityLabel={`Ouvrir le profil du découvreur ${discoveryUsername}${track.sourceIsFollowing === false ? ', non suivi' : ''}`}
                          >
                            <Text style={[styles.discoveryOriginUser, tierColors ? { color: tierColors.ring } : null]}>{discoveryUsername}</Text>
                          </TouchableOpacity>
                        );
                      })() : <Text style={styles.discoveryOriginProtected}>découvreur d’origine protégé</Text>}
                    </View>
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
        title={`La collection de ${profile.username}`}
        subtitle="Les extraits démarrent automatiquement. Si un morceau est déjà dans ta collection, aucun doublon n’est créé."
        askVisibilityOnKeep
        requiresAccount={!viewer || isLocalGuest || isDemoMode}
        onClose={() => setSwipeOpen(false)}
        onKeep={addCanonicalToMyKeep}
      />

      {/* Adel (09/09/2026) : "meme design que le profil normal" -- meme
          liste "qui a repris" que sur son propre profil (pastille de
          certification + style musical + suivre en retour). */}
      <Modal visible={repriseListOpen} transparent animationType="fade" onRequestClose={() => setRepriseListOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.shareSheet, styles.repriseSheet]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.shareTitle}>Qui a repris ses morceaux</Text>
            <Text style={styles.shareSubtitle}>{reprisers.length} utilisateur{reprisers.length > 1 ? 's ont' : ' a'} gardé un morceau découvert en premier par {profile.username}.</Text>
            <ScrollView style={styles.repriseScroll}>
              {repriseLoading ? <Text style={styles.muted}>Chargement…</Text> : reprisers.length ? reprisers.map((r) => {
                const tierColors = CERTIFICATION_META[r.certificationTier] ?? CERTIFICATION_META.UNVERIFIED;
                return (
                  <View key={r.profileId} style={styles.repriseRow}>
                    {r.avatarUrl ? <Image source={{ uri: r.avatarUrl }} style={styles.repriseAvatar} /> : <View style={[styles.repriseAvatar, styles.avatarFallback]}><Text style={styles.avatarText}>{r.username.slice(0,1).toUpperCase()}</Text></View>}
                    <View style={styles.repriseInfo}>
                      <View style={styles.repriseNameRow}><Text style={styles.repriseUsername} numberOfLines={1}>{r.username}</Text><ProfileCertificationBadge tier={r.certificationTier} compact /></View>
                      {r.favoriteGenres.length ? <View style={styles.repriseGenres}>{r.favoriteGenres.slice(0,3).map((g) => <View key={g} style={[styles.repriseGenreChip, { borderColor: tierColors.ring }]}><Text style={[styles.repriseGenreText, { color: tierColors.ring }]}>{g}</Text></View>)}</View> : null}
                    </View>
                    <TouchableOpacity disabled={repriseFollowBusyId === r.profileId} style={[styles.repriseFollowButton, r.isFollowing && styles.repriseFollowButtonOn]} onPress={() => void toggleRepriserFollow(r)}>
                      <Text style={[styles.repriseFollowButtonText, r.isFollowing && styles.repriseFollowButtonTextOn]}>{repriseFollowBusyId === r.profileId ? '…' : r.isFollowing ? 'ABONNÉ' : 'SUIVRE'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }) : <Text style={styles.muted}>Personne n’a encore repris ses morceaux.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.cancelShare} onPress={() => setRepriseListOpen(false)}><Text style={styles.cancelShareText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      <Modal visible={!!keepPromptTrack} transparent animationType="fade" onRequestClose={() => setKeepPromptTrack(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.shareSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.shareTitle}>Garder ce morceau ?</Text>
            {keepPromptTrack ? <Text style={styles.keepPromptTrack} numberOfLines={2}>{keepPromptTrack.title} · {keepPromptTrack.artist}</Text> : null}
            <TouchableOpacity style={[styles.keepChoice, styles.keepChoicePublic]} disabled={keepPromptTrack ? addingTrackIds.has(keepPromptTrack.trackId) : false} onPress={() => keepPromptTrack && void addToMyKeep(keepPromptTrack, 'PUBLIC')} accessibilityLabel="Visible sur mon profil">
              <Text style={styles.keepChoicePublicTitle}>VISIBLE SUR MON PROFIL</Text>
              <Text style={styles.keepChoiceText}>Le morceau sera rangé et visible dans ton univers Loki.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.keepChoice, styles.keepChoicePrivate]} disabled={keepPromptTrack ? addingTrackIds.has(keepPromptTrack.trackId) : false} onPress={() => keepPromptTrack && void addToMyKeep(keepPromptTrack, 'PRIVATE')} accessibilityLabel="Garder en privé">
              <Text style={styles.keepChoicePrivateTitle}>GARDER EN PRIVÉ</Text>
              <Text style={styles.keepChoiceText}>Le morceau reste dans ta bibliothèque sans apparaître sur ton profil.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelShare} onPress={() => setKeepPromptTrack(null)}>
              <Text style={styles.cancelShareText}>ANNULER — NE RIEN GARDER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},scroll:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl},topBar:{minHeight:48,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{color:colors.textPrimary,fontSize:38,lineHeight:42},topSpacer:{flex:1},shareTopButton:{width:36,height:36,borderRadius:18,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},shareTopText:{color:'#FFFFFF',fontSize:18,fontWeight:'900'},moderationOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},moderationCard:{width:'100%',maxWidth:360,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',paddingVertical:6},moderationTitle:{color:'#F8F6FC',fontSize:13,fontWeight:'900',padding:14,paddingBottom:6},moderationRow:{minHeight:50,justifyContent:'center',paddingHorizontal:16,borderTopWidth:1,borderTopColor:'#2B2038'},moderationRowText:{color:'#F8F6FC',fontSize:14,fontWeight:'700'},moderationRowDanger:{color:'#FF5F83'},kindBadge:{minHeight:21,paddingHorizontal:7,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#7CF2B9',fontSize:11,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:12},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:68,height:68,borderRadius:34,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:25,fontWeight:'800'},identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:6},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:1},identityMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5},location:{color:'#FFFFFF',fontSize:13,fontWeight:'800'},bio:{color:'#FFFFFF',fontSize:15,lineHeight:21,marginTop:12},
  followButton:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#3A1822',borderWidth:1.5,borderColor:'#FF5F83',alignItems:'center',justifyContent:'center'},followButtonActive:{backgroundColor:'#173529',borderColor:'#38D990'},followButtonText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},followButtonTextActive:{color:'#FFFFFF'},swipePreview:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#4E8DFF',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},

  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:12,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'800',marginTop:2},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{backgroundColor:colors.smartBadgeBg,borderRadius:radius.pill,paddingHorizontal:10,paddingVertical:5},chipText:{color:colors.smartBadgeText,fontSize:12,fontWeight:'700'},mutedSmall:{color:'#FFFFFF',fontSize:12,lineHeight:17,marginTop:8},albumSummaryText:{color:colors.textSecondary,fontSize:10,lineHeight:15,marginTop:8},
  websiteButton:{marginHorizontal:18,marginTop:10,minHeight:44,borderRadius:radius.pill,backgroundColor:'#21182F',borderWidth:1,borderColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},websiteButtonText:{color:'#FFF',fontSize:13,fontWeight:'900'},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'900'},socialRow:{width:'100%',flexDirection:'row',justifyContent:'space-between',gap:7,marginTop:12},socialButton:{flex:1,maxWidth:46,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',opacity:.82},socialButtonConfigured:{backgroundColor:'#5B3F8C',borderColor:'#A884FA',opacity:1},
  visitorKeepCounters:{marginHorizontal:18},sectionTitle:{...typography.h3,color:colors.textPrimary},swipeLaunch:{marginHorizontal:18,marginTop:10,minHeight:58,borderRadius:16,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',paddingHorizontal:14,paddingVertical:10},swipeLaunchTitle:{color:'#FFF',fontSize:11,fontWeight:'900'},swipeLaunchText:{color:'#E5DBF2',fontSize:9,lineHeight:13,textAlign:'center',marginTop:3},publicMusicSection:{paddingHorizontal:18,marginTop:16},musicSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:spacing.md},publicCount:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},emptyMusic:{alignItems:'center',paddingVertical:spacing.xxl,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},emptyMusicIcon:{color:colors.primaryLight,fontSize:28,marginBottom:spacing.sm},musicList:{gap:8},musicRow:{flexDirection:'row',alignItems:'center',padding:9,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},musicCover:{width:52,height:52,borderRadius:10,backgroundColor:colors.backgroundCard},musicCoverFallback:{alignItems:'center',justifyContent:'center'},musicFallback:{color:colors.primaryLight,fontSize:19,fontWeight:'900'},trackInfo:{flex:1,minWidth:0,marginLeft:10},trackTitleRow:{flexDirection:'row',alignItems:'flex-start',gap:6},trackTitleBlock:{flex:1,minWidth:0,paddingTop:4},trackTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800'},trackArtist:{color:colors.textMuted,fontSize:12,marginTop:2},trackRightColumn:{alignItems:'flex-end',gap:4},discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap',justifyContent:'flex-end'},discoveryOriginLabel:{color:'#FFFFFF',fontSize:12,fontWeight:'800'},trackInlineActions:{flexDirection:'row',alignItems:'center',gap:6},keepButtonInline:{minHeight:25,paddingHorizontal:8,borderRadius:13,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},discoveryOriginPill:{minHeight:22,paddingHorizontal:8,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},discoveryOriginUser:{color:'#7CF2B9',fontSize:12,fontWeight:'900'},discoveryOriginProtected:{color:'#7CF2B9',fontSize:12,fontWeight:'800'},trackActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:7},trackActionsLeft:{flexDirection:'row',alignItems:'center',gap:7},keepButtonText:{color:'#0E0A14',fontSize:9,fontWeight:'900'},alreadyKeepButton:{backgroundColor:'#201A28',borderWidth:1,borderColor:'#4B4257'},alreadyKeepButtonText:{color:'#FFFFFF'},shareButton:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center'},shareButtonText:{color:colors.primaryLight,fontSize:12,fontWeight:'800'},likeButton:{minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'#1A1225',borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},likeButtonActive:{borderColor:'#FF5F83',backgroundColor:'rgba(255,95,131,.10)'},likeButtonEmpty:{borderColor:'#38D990',borderWidth:2},likeHeart:{color:colors.textSecondary,fontSize:14},likeHeartActive:{color:'#FF5F83'},likeCount:{color:colors.textSecondary,fontSize:9,fontWeight:'800'},muted:{color:colors.textMuted,fontSize:14,textAlign:'center'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,0.78)',justifyContent:'flex-end',alignItems:'center',padding:14},
  shareSheet:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},
  sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:'#51445F',alignSelf:'center',marginBottom:16},
  shareTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',textAlign:'center'},
  shareSubtitle:{color:colors.textMuted,fontSize:14,lineHeight:20,textAlign:'center',marginTop:6},
  cancelShare:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},
  cancelShareText:{color:colors.textMuted,fontSize:13,fontWeight:'700'},
  keepPromptTrack:{color:colors.textMuted,fontSize:13,textAlign:'center',marginTop:6},
  keepChoice:{minHeight:70,borderRadius:17,paddingHorizontal:15,paddingVertical:12,justifyContent:'center',marginTop:12,borderWidth:1},
  keepChoicePublic:{backgroundColor:'rgba(104,242,177,.12)',borderColor:'#68F2B1'},
  keepChoicePrivate:{backgroundColor:'#21182F',borderColor:'#5B3F8C'},
  keepChoicePublicTitle:{color:'#68F2B1',fontSize:11,fontWeight:'900'},
  keepChoicePrivateTitle:{color:'#D6C2FA',fontSize:11,fontWeight:'900'},
  keepChoiceText:{color:'#FFFFFF',fontSize:10,lineHeight:14,marginTop:3},
  repriseSheet:{maxHeight:'82%'},
  repriseScroll:{width:'100%',marginTop:12,maxHeight:420},
  repriseRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#2B2238'},
  repriseAvatar:{width:42,height:42,borderRadius:21,backgroundColor:colors.backgroundCard},
  repriseInfo:{flex:1,minWidth:0},
  repriseNameRow:{flexDirection:'row',alignItems:'center',gap:6},
  repriseUsername:{color:'#FFF',fontSize:14,fontWeight:'900',flexShrink:1},
  repriseGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:4},
  repriseGenreChip:{paddingHorizontal:7,paddingVertical:2,borderRadius:9,borderWidth:1},
  repriseGenreText:{fontSize:9,fontWeight:'800'},
  repriseFollowButton:{minHeight:32,paddingHorizontal:12,borderRadius:16,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center'},
  repriseFollowButtonOn:{backgroundColor:'#1C3028',borderWidth:1,borderColor:'#3B8061'},
  repriseFollowButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  repriseFollowButtonTextOn:{color:'#76E3AE'},
});
