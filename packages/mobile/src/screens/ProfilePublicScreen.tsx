import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CanonicalTrack, computeMusicDNA, DnaSourceDecision, ProviderPlaylist } from '@keep/music';
import { useUserStore } from '../store/useUserStore';
import { useSessionHistoryStore } from '../store/useSessionHistoryStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';
import { ProfileKind, SocialLink } from '../types';
import { buildPublicProfileLink, sharePlaylist, shareProfile, shareProfileByEmail, shareProfileTrack } from '../services/sharingService';
import { loadCurrentPlanCode } from '../services/planService';
import { getDownloadCreditStatus } from '../services/creditService';
import { loadNotifications } from '../services/notificationService';
import { musicEngine } from '../services/musicEngine';
import { KeepPlaylistPreference, loadPlaylistPreferences, preferenceFor } from '../services/keepLibraryService';
import { isSmartAlbumUiId, loadOwnSmartAlbums, loadSmartAlbumTracks, refreshOwnSmartAlbums, smartAlbumAsProviderPlaylist, SmartAlbumRecord } from '../services/smartAlbumService';
import { loadOwnProfileKeeps, loadOwnProfileSnapshot, loadPublicProfileSnapshot, OwnProfileSnapshot, ProfileCertificationTier, PublicProfileKeep, PublicProfileSnapshot } from '../services/publicProfileStateService';
import UsernameAccountForm from '../components/UsernameAccountForm';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';
import SourceProfileQuickView from '../components/SourceProfileQuickView';
import ProfileCertificationBadge from '../components/ProfileCertificationBadge';
import CommunityConnectionsPanel from '../components/CommunityConnectionsPanel';
import ProfileCounterRow from '../components/ProfileCounterRow';

type ProfileTab = 'KEEP' | 'PLAYLISTS' | 'ARTISTS' | 'ALBUMS';
type SocialPlatform = SocialLink['platform'];
type AccountMode = 'create' | 'login';

const LOCAL_PROFILE_PLAYLIST_ID = 'keep-local-history';
const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Vibes' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },
];
const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'instagram', label: 'Instagram' }, { platform: 'tiktok', label: 'TikTok' }, { platform: 'snapchat', label: 'Snapchat' }, { platform: 'youtube', label: 'YouTube' }, { platform: 'x', label: 'X' }, { platform: 'facebook', label: 'Facebook' },
];
const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Établissement',
};

export default function ProfilePublicScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const enterDemoMode = useUserStore((s) => s.enterDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const sessions = useSessionHistoryStore((s) => s.sessions);
  const syncUnsyncedKeeps = useSessionHistoryStore((s) => s.syncUnsyncedKeeps);
  const providerPlaylists = usePlaylistStore((s) => s.playlists);
  const refreshPlaylists = usePlaylistStore((s) => s.refresh);
  const [activeTab, setActiveTab] = useState<ProfileTab>('KEEP');
  const [planCode, setPlanCode] = useState('FREE');
  const [publicSnapshot, setPublicSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [ownSnapshot, setOwnSnapshot] = useState<OwnProfileSnapshot | null>(null);
  const [serverOwnKeeps, setServerOwnKeeps] = useState<PublicProfileKeep[]>([]);
  const [creditRemaining, setCreditRemaining] = useState<number | null>(null);
  const [creditUnlimited, setCreditUnlimited] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);
  const [selectionSwipe, setSelectionSwipe] = useState<{ title: string; subtitle: string; tracks: CanonicalTrack[] } | null>(null);
  const [smartAlbums, setSmartAlbums] = useState<SmartAlbumRecord[]>([]);
  const [accountMode, setAccountMode] = useState<AccountMode>('create');
  const [pendingFollowUsername, setPendingFollowUsername] = useState('');
  const [sourceQuickUsername, setSourceQuickUsername] = useState('');
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Record<string, CanonicalTrack[]>>({});
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [playlistPreferences, setPlaylistPreferences] = useState<Record<string, KeepPlaylistPreference>>({});

  const accountRequired = isLocalGuest || isDemoMode;
  const providerId = musicEngine.musicProvider.providerId || 'KEEP';

  useEffect(() => {
    let live = true;
    if (user && !accountRequired) loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE'));
    else setPlanCode('FREE');
    return () => { live = false; };
  }, [accountRequired, user?.id]);

  useEffect(() => {
    let live = true;
    const refreshCanonicalProfileState = async () => {
      if (!user || accountRequired) {
        if (live) {
          setPublicSnapshot(null);
          setOwnSnapshot(null);
          setServerOwnKeeps([]);
        }
        return;
      }
      try {
        const [publicState, ownState, ownKeeps] = await Promise.all([
          loadPublicProfileSnapshot(user.id),
          loadOwnProfileSnapshot(),
          loadOwnProfileKeeps(),
        ]);
        if (live) {
          setPublicSnapshot(publicState);
          setOwnSnapshot(ownState);
          setServerOwnKeeps(ownKeeps);
        }
      } catch {
        if (live) {
          setPublicSnapshot(null);
          setOwnSnapshot(null);
          setServerOwnKeeps([]);
        }
      }
    };
    void refreshCanonicalProfileState();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCanonicalProfileState(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, user?.id]);

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    const refreshCredits = async () => {
      try {
        const status = await getDownloadCreditStatus();
        if (!live) return;
        setCreditRemaining(status.remaining);
        setCreditUnlimited(status.unlimited);
      } catch {
        if (!live) return;
        setCreditRemaining(null);
        setCreditUnlimited(false);
      }
    };
    void refreshCredits();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshCredits(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, sessions.length, user?.id]);

  useEffect(() => {
    const refresh = () => { void refreshPlaylists().catch(() => {}); };
    refresh();
    const unsubscribe = navigation?.addListener?.('focus', refresh);
    return () => unsubscribe?.();
  }, [navigation, refreshPlaylists]);

  useEffect(() => {
    if (accountRequired) return undefined;
    const refreshKeeps = () => { void syncUnsyncedKeeps().catch(() => {}); };
    refreshKeeps();
    const unsubscribe = navigation?.addListener?.('focus', refreshKeeps);
    return () => unsubscribe?.();
  }, [accountRequired, navigation, syncUnsyncedKeeps, user?.id]);

  useEffect(() => {
    let live = true;
    const refreshPreferences = async () => {
      const next = await loadPlaylistPreferences(providerId).catch(() => ({}));
      if (live) setPlaylistPreferences(next);
    };
    void refreshPreferences();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshPreferences(); });
    return () => { live = false; unsubscribe?.(); };
  }, [navigation, providerId, providerPlaylists.length, smartAlbums.length]);

  useEffect(() => {
    let live = true;
    const refreshSmart = async () => {
      if (accountRequired) { if (live) setSmartAlbums([]); return; }
      try {
        const rows = planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO'
          ? await refreshOwnSmartAlbums()
          : await loadOwnSmartAlbums();
        if (live) setSmartAlbums(rows);
      } catch { if (live) setSmartAlbums([]); }
    };
    void refreshSmart();
    const unsubscribe = navigation?.addListener?.('focus', () => { void refreshSmart(); });
    return () => { live = false; unsubscribe?.(); };
  }, [accountRequired, navigation, planCode, user?.id]);

  useEffect(() => {
    let live = true;
    if (!user || accountRequired) {
      setUnreadCount(0);
      return () => { live = false; };
    }
    loadNotifications(user.id)
      .then((items) => live && setUnreadCount(items.filter((item) => !item.readAt).length))
      .catch(() => live && setUnreadCount(0));
    return () => { live = false; };
  }, [accountRequired, user?.id]);

  const keptTracks = useMemo(() => {
    const unique = new Map<string, (typeof sessions)[number]['tracks'][number]>();
    const all = sessions.flatMap((session) => session.tracks.filter((entry) => entry.status === 'kept'));
    for (const entry of all) {
      const title = entry.track.title.trim().toLowerCase().replace(/\s+/g, ' ');
      const artist = entry.track.artist.trim().toLowerCase().replace(/\s+/g, ' ');
      const identity = entry.track.isrc?.trim().toUpperCase() || `${title}|${artist}`;
      const current = unique.get(identity);
      if (!current || new Date(entry.detectedAt).getTime() >= new Date(current.detectedAt).getTime()) unique.set(identity, entry);
    }
    return Array.from(unique.values()).sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [sessions]);
  const canonicalOwnKeeps = useMemo(() => serverOwnKeeps.map((entry) => ({
    id: entry.decisionId,
    track: entry.track,
    status: 'kept' as const,
    visibility: entry.visibility,
    detectedAt: entry.keptAt,
    creditSource: entry.creditSource,
    sourceProfileId: entry.sourceProfileId,
    sourceUsername: entry.sourceUsername,
  })), [serverOwnKeeps]);
  const profileKeptTracks = accountRequired ? keptTracks : canonicalOwnKeeps;
  const publicKeptTracks = useMemo(() => profileKeptTracks.filter((entry) => entry.visibility === 'PUBLIC'), [profileKeptTracks]);
  const localPublicOwnKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource !== 'SOCIAL' && !entry.sourceProfileId && !entry.sourceUsername).length, [publicKeptTracks]);
  const localPublicUserKeepCount = useMemo(() => publicKeptTracks.filter((entry) => entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId || !!entry.sourceUsername).length, [publicKeptTracks]);
  const publicSwipeTracks = useMemo<CanonicalTrack[]>(() => publicKeptTracks.map((entry) => entry.track), [publicKeptTracks]);
  const publicTrackIds = useMemo(() => new Set(publicKeptTracks.map((entry) => entry.track.id)), [publicKeptTracks]);
  const dna = useMemo(() => {
    const decisions: DnaSourceDecision[] = publicKeptTracks.map((entry) => ({ artist: entry.track.artist, genres: entry.track.genres ?? [], decision: 'KEPT', createdAt: entry.detectedAt }));
    return computeMusicDNA(decisions);
  }, [publicKeptTracks]);
  const artists = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.artist))), [publicKeptTracks]);
  const albums = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.album).filter(Boolean) as string[])), [publicKeptTracks]);
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {
    const result: ProviderPlaylist[] = smartAlbums.map(smartAlbumAsProviderPlaylist);
    if (providerPlaylists.length) result.push(...providerPlaylists);
    if (!result.length && publicKeptTracks.length) {
      const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);
      result.push({ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference?.name || 'Mes KEEP', description: localPreference?.description || 'Morceaux publics gardés avec KEEP', trackCount: publicKeptTracks.length, isKeepManaged: true });
    }
    return result;
  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length, smartAlbums]);

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.demoTitle}>Profil KEEP</Text><Text style={s.muted}>Aucun compte actif.</Text><TouchableOpacity style={s.primary} onPress={enterDemoMode}><Text style={s.primaryText}>ENTRER EN MODE DÉMO</Text></TouchableOpacity></View></SafeAreaView>;

  const publicLinks = user.socialLinks.filter((link) => link.visibility === 'PUBLIC');
  const publicProfileLink = buildPublicProfileLink(user.username);
  const identityGenres = user.favoriteGenres.length ? user.favoriteGenres.slice(0, 4) : dna.topGenres.slice(0, 4).map((g) => g.genre);
  const creditsExhausted = !creditUnlimited && creditRemaining === 0;
  const planLabel = planCode === 'FREE' && creditRemaining != null ? `FREE · ${creditRemaining}` : planCode;
  const planStyle = planCode === 'FREE' ? (creditsExhausted ? s.planExhausted : s.planFree) : s.planPaid;
  const profileOwnKeepCount = ownSnapshot?.directKeeps ?? localPublicOwnKeepCount;
  const profileUserKeepCount = ownSnapshot?.socialKeeps ?? localPublicUserKeepCount;
  const profileTotalKeepCount = ownSnapshot?.totalKeeps ?? profileKeptTracks.length;
  const profileFollowerCount = publicSnapshot?.followers ?? user.followerCount;
  const profileFollowingCount = publicSnapshot?.following ?? user.followingCount;
  const fallbackCertification: ProfileCertificationTier = accountRequired
    ? 'UNVERIFIED'
    : planCode === 'PREMIUM' || planCode === 'CREATOR_PRO' || planCode === 'VENUE_PRO' ? planCode : 'FREE';
  const certificationTier = publicSnapshot?.certificationTier ?? fallbackCertification;

  const openAccount = (mode: AccountMode = 'create', followUsername = '') => {
    setShareOpen(false);
    setPendingFollowUsername(followUsername.replace(/^@+/, ''));
    setAccountMode(mode);
    setAccountOpen(true);
  };

  const openShare = () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(true);
  };

  const openProfileSwipe = () => {
    if (!publicSwipeTracks.length) {
      Alert.alert('KEEP Swipe', 'Aucun morceau public pour le moment. Rends au moins un morceau visible sur ton profil pour prévisualiser ton Swipe.');
      return;
    }
    setProfileSwipeOpen(true);
  };

  const switchProfileTab = (tab: ProfileTab) => {
    if (tab === activeTab) return;
    setExpandedPlaylistId(null);
    setLoadingPlaylistId(null);
    setSelectionSwipe(null);
    setActiveTab(tab);
  };

  const openSourceProfile = (sourceUsername: string) => {
    setSourceQuickUsername(sourceUsername.replace(/^@+/, ''));
  };

  const openSocial = async (platform: SocialPlatform) => {
    const link = publicLinks.find((item) => item.platform === platform && item.url.trim());
    if (!link) {
      Alert.alert('Réseau non renseigné', 'Ajoute ce réseau depuis les réglages avancés.', [
        { text: 'Plus tard', style: 'cancel' }, { text: 'Ajouter le lien', onPress: () => navigation.navigate('AdvancedProfileSettings') },
      ]);
      return;
    }
    let url = link.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await Linking.openURL(url); } catch { Alert.alert('Lien indisponible', 'Impossible d’ouvrir ce réseau pour le moment.'); }
  };

  const shareNative = async () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(false);
    try { await shareProfile(user.username); }
    catch { Alert.alert('Partage', 'Impossible d’ouvrir le partage pour le moment.'); }
  };

  const shareEmail = async () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(false);
    try { await shareProfileByEmail(user.username); }
    catch { Alert.alert('E-mail', 'Aucune application e-mail n’est disponible sur cet appareil.'); }
  };

  const showQr = () => {
    if (accountRequired) return openAccount('create');
    setShareOpen(false);
    setQrOpen(true);
  };

  const loadPlaylistTracks = async (playlist: ProviderPlaylist): Promise<CanonicalTrack[]> => {
    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {
      const localTracks = publicKeptTracks.map((entry) => entry.track);
      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));
      return localTracks;
    }
    if (playlistTracks[playlist.id]) return playlistTracks[playlist.id];
    setLoadingPlaylistId(playlist.id);
    try {
      if (isSmartAlbumUiId(playlist.id)) {
        const tracks = await loadSmartAlbumTracks(playlist.id);
        setPlaylistTracks((current) => ({ ...current, [playlist.id]: tracks }));
        return tracks;
      }
      const session = await musicEngine.getSession();
      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
      const visibleTracks = musicEngine.usesDemoMusicProvider ? tracks.filter((track) => publicTrackIds.has(track.id)) : tracks;
      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));
      return visibleTracks;
    } catch {
      Alert.alert('Vibe KEEP', 'Impossible de charger les morceaux de cette collection pour le moment.');
      return [];
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  const togglePlaylist = async (playlist: ProviderPlaylist) => {
    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }
    setExpandedPlaylistId(playlist.id);
    await loadPlaylistTracks(playlist);
  };

  const openPlaylistSwipe = async (playlist: ProviderPlaylist) => {
    const tracks = await loadPlaylistTracks(playlist);
    if (!tracks.length) return Alert.alert('Vibe KEEP', 'Cette collection ne contient pas encore de morceau à swiper.');
    setSelectionSwipe({ title: playlist.name, subtitle: 'Ta sélection KEEP, morceau après morceau.', tracks });
  };

  const renderCompactTrack = (track: CanonicalTrack, key: string, sourceUsername?: string | null) => (
    <View key={key} style={s.keepRow}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.keepCover} /> : <View style={[s.keepCover, s.coverFallback]}><Text style={s.keepCoverK}>K</Text></View>}
      <View style={s.keepInfo}>
        <View style={s.keepTitleRow}>
          <View style={s.keepTitleBlock}><Text style={s.keepTitle} numberOfLines={1}>{track.title}</Text><Text style={s.keepArtist} numberOfLines={1}>{track.artist}</Text></View>
          <TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} compact />
        </View>
        <View style={s.trackMetaRow}>
          <TouchableOpacity style={s.trackShare} onPress={() => void shareProfileTrack(user.username, track.title, track.artist)}><Text style={s.trackShareText}>↗ Partager</Text></TouchableOpacity>
          {sourceUsername ? (
            <View style={s.originInline}>
              <Text style={s.originLabel}>Utilisateur</Text>
              <TouchableOpacity style={s.originUserLink} onPress={() => openSourceProfile(sourceUsername)} accessibilityLabel={`Ouvrir rapidement le profil de ${sourceUsername}`}>
                <Text style={s.originUserText}>@{sourceUsername.slice(0, 4)}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  const tabContent = () => {
    if (activeTab === 'KEEP') {
      if (!profileKeptTracks.length) return <Empty text="Tes morceaux KEEP apparaîtront ici." />;
      return <View style={s.keepList}>
        <Text style={s.ownerKeepHint}>KEEP construit ton univers : Vibes, artistes et albums. Tu gardes le contrôle du Public/Privé et des noms.</Text>
        {profileKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null))}
      </View>;
    }

    if (activeTab === 'PLAYLISTS') {
      if (!displayPlaylists.length) return <Empty text="Tes Vibes KEEP apparaîtront ici automatiquement." />;
      return <View style={s.list}>{displayPlaylists.map((playlist) => {
        const expanded = expandedPlaylistId === playlist.id;
        const tracks = playlistTracks[playlist.id] ?? [];
        const preference = preferenceFor(playlistPreferences, providerId, playlist.id);
        const smart = smartAlbums.find((album) => `keep-smart:${album.id}` === playlist.id);
        const isPublic = preference?.isPublic ?? smart?.isPublic ?? false;
        return <View key={playlist.id} style={s.playlistBlock}>
          <TouchableOpacity style={s.listRow} onPress={() => void togglePlaylist(playlist)} accessibilityLabel={`Ouvrir ${playlist.name}`}>
            {playlist.coverUrl ? <Image source={{ uri: playlist.coverUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'} · {isPublic ? 'Public' : 'Privé'}</Text></View>
            <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          <View style={s.playlistButtons}>
            <TouchableOpacity style={s.playlistShareButton} onPress={() => void openPlaylistSwipe(playlist)}><Text style={s.playlistShareText}>▶ SWIPE</Text></TouchableOpacity>
            {isPublic ? <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity> : null}
          </View>
          {expanded ? <View style={s.playlistTracks}>{loadingPlaylistId === playlist.id ? <Text style={s.muted}>Chargement…</Text> : tracks.length ? tracks.map((track) => renderCompactTrack(track, `${playlist.id}-${track.id}`)) : <Text style={s.muted}>Aucun morceau dans cette playlist.</Text>}</View> : null}
        </View>;
      })}</View>;
    }

    const items = activeTab === 'ARTISTS' ? artists : albums;
    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;
    return <View style={s.list}>{items.map((item) => {
      const selected = publicSwipeTracks.filter((track) => activeTab === 'ARTISTS' ? track.artist === item : track.album === item);
      return <TouchableOpacity key={item} style={s.listRow} onPress={() => setSelectionSwipe({ title: item, subtitle: activeTab === 'ARTISTS' ? 'Tous les morceaux de cet artiste dans ton KEEP.' : 'Cet album dans ton KEEP, prêt à swiper.', tracks: selected })}>
        <View style={s.note}><Text style={s.noteText}>♪</Text></View>
        <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{item}</Text><Text style={s.playlistCount}>{selected.length} {selected.length > 1 ? 'morceaux' : 'morceau'} · ▶ SWIPE</Text></View>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>;
    })}</View>;
  };

  return <SafeAreaView style={s.container}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topBar}>
        <TouchableOpacity style={[s.plan, planStyle]} onPress={() => navigation.navigate('Offers')} accessibilityLabel="Offre et crédits"><Text style={s.planText}>{planLabel}</Text></TouchableOpacity>
        <View style={s.actions}>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Notifications')} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}>
            <Text style={s.bell}>🔔</Text>
            {unreadCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.menuButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Menu du profil"><Text style={s.menuText}>☰</Text></TouchableOpacity>
        </View>
      </View>

      <View style={s.hero}>
        <View style={s.identity}>
          {user.avatar ? <Image source={{uri:user.avatar}} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>K</Text></View>}
          <View style={s.identityText}>
            <View style={s.usernameLine}><Text style={s.username}>@{user.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
            <View style={s.profileMetaLeft}>
              <View style={s.kindBadge}><Text style={s.kindBadgeText}>{PROFILE_KIND_LABELS[user.kind]}</Text></View>
              {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
            </View>
          </View>
        </View>
        {accountRequired ? <TouchableOpacity style={s.accountBanner} onPress={() => openAccount('create')}><Text style={s.accountBannerTitle}>Créer mon compte KEEP</Text><Text style={s.accountBannerText}>Conserve ton profil avec ton identifiant KEEP et ton mot de passe. Aucun e-mail n’est obligatoire.</Text></TouchableOpacity> : null}
        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        <ProfileCounterRow kind="connections" items={[
          { value: profileFollowerCount, label: 'Abonnés' },
          { value: profileFollowingCount, label: 'Abonnements' },
        ]} />
        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}
      </View>

      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

      <View style={[s.ownerActions, { marginHorizontal: 18 }]}>
        <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>
        <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
      </View>

      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>

      <ProfileCounterRow kind="keeps" items={[
        { value: profileTotalKeepCount, label: 'KEEP total' },
        { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
      ]} />

      <View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} style={s.tab} onPress={()=>switchProfileTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>
      <View key={`profile-tab-${activeTab}`}>{tabContent()}</View>
    </ScrollView>

    <MusicSwipeDeckModal
      visible={profileSwipeOpen}
      tracks={publicSwipeTracks}
      title="Mon KEEP public"
      subtitle="Aperçu exact du Swipe proposé à tes abonnés."
      emptyTitle="Aucun morceau public à prévisualiser."
      backLabel="REVENIR AU PROFIL"
      previewOnly
      onClose={() => setProfileSwipeOpen(false)}
    />

    <MusicSwipeDeckModal
      visible={Boolean(selectionSwipe)}
      tracks={selectionSwipe?.tracks ?? []}
      title={selectionSwipe?.title ?? 'Vibe KEEP'}
      subtitle={selectionSwipe?.subtitle ?? 'Ta sélection KEEP.'}
      emptyTitle="Aucun morceau dans cette sélection."
      backLabel="REVENIR AU PROFIL"
      previewOnly
      onClose={() => setSelectionSwipe(null)}
    />

    <SourceProfileQuickView
      visible={Boolean(sourceQuickUsername)}
      username={sourceQuickUsername}
      currentUserId={user.id}
      accountRequired={accountRequired}
      onClose={() => setSourceQuickUsername('')}
      onOpenFull={(username) => navigation.navigate('PublicProfile', { username })}
      onRequireAccount={(username) => openAccount('create', username)}
    />

    <Modal visible={accountOpen} transparent animationType="fade" onRequestClose={() => { setAccountOpen(false); setPendingFollowUsername(''); }}>
      <View style={s.modalBackdrop}>
        <View style={[s.shareSheet, s.accountSheet]}>
          <View style={s.sheetHandle} />
          <UsernameAccountForm initialMode={accountMode} followUsername={pendingFollowUsername} onSuccess={() => { setAccountOpen(false); setPendingFollowUsername(''); }} />
          <TouchableOpacity style={s.cancelShare} onPress={() => { setAccountOpen(false); setPendingFollowUsername(''); }}><Text style={s.cancelShareText}>CONTINUER EN MODE DÉMO</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Partager mon profil KEEP</Text>
          <Text style={s.shareSubtitle}>Ton univers musical tient dans un lien. Fais découvrir ton KEEP DNA, tes Vibes, tes réseaux et ce qui te ressemble.</Text>
          <View style={s.linkPreview}><Text style={s.linkPreviewText} numberOfLines={2}>{publicProfileLink}</Text></View>
          <TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>FAIRE DÉCOUVRIR MON KEEP</Text></TouchableOpacity>
          <TouchableOpacity style={s.shareAction} onPress={shareEmail}><Text style={s.shareActionText}>✉  Partager par e-mail</Text><Text style={s.shareActionHint}>Ton application Mail s’ouvre, tu choisis les destinataires</Text></TouchableOpacity>
          <TouchableOpacity style={s.shareAction} onPress={showQr}><Text style={s.shareActionText}>▦  Mon QR KEEP</Text><Text style={s.shareActionHint}>Carte d’identité musicale prête pour une story</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setShareOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.qrShell}>
          <TouchableOpacity style={s.qrCloseTop} onPress={() => setQrOpen(false)} accessibilityLabel="Fermer le QR KEEP"><Text style={s.qrCloseTopText}>✕</Text></TouchableOpacity>
          <ScrollView style={s.qrScroll} contentContainerStyle={s.qrScrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.qrCard}>
            <View style={s.qrBrandRow}><Text style={s.qrLogo}>KEEP</Text><Text style={s.qrDnaLabel}>DIGITAL DNA</Text></View>
            <View style={s.qrIdentityRow}>
              {user.avatar ? <Image source={{uri:user.avatar}} style={s.qrAvatar}/> : <View style={[s.qrAvatar,s.qrAvatarFallback]}><Text style={s.qrAvatarText}>K</Text></View>}
              <View style={s.qrIdentityText}><Text style={s.qrUsername}>@{user.username}</Text><Text style={s.qrKind}>{PROFILE_KIND_LABELS[user.kind]}</Text>{(user.city || user.countryCode) ? <Text style={s.qrLocation}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}</View>
            </View>
            {user.bio ? <Text style={s.qrBio} numberOfLines={3}>{user.bio}</Text> : <Text style={s.qrBio}>Mon univers musical, en un scan.</Text>}
            {identityGenres.length ? <View style={s.qrGenres}>{identityGenres.map((genre) => <View key={genre} style={s.qrGenre}><Text style={s.qrGenreText}>{genre}</Text></View>)}</View> : null}
            <View style={s.qrBox}><QRCode value={publicProfileLink} size={164} color="#FFFFFF" backgroundColor="#0E0A14" /></View>
            <Text style={s.qrScan}>SCAN POUR DÉCOUVRIR MON PROFIL</Text>
            <Text style={s.qrTagline}>Tes goûts te ressemblent.</Text>
            <Text style={s.qrWebsite}>KEEP · adelkhatra-bit.github.io/KEEP</Text>
          </View>
          <Text style={s.screenshotHint}>Ta carte d’identité musicale : photo, bio, ville, styles et QR. Fais une capture ou partage-la pour donner envie de découvrir ton univers.</Text>
          <TouchableOpacity style={s.shareActionPrimary} onPress={() => { setQrOpen(false); void shareNative(); }}><Text style={s.shareActionPrimaryText}>PARTAGER MON UNIVERS</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setQrOpen(false)}><Text style={s.cancelShareText}>FERMER</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function Empty({text}:{text:string}){return <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.muted}>{text}</Text></View>}

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},content:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24},demoTitle:{...typography.h2,color:colors.textPrimary,marginBottom:8},primary:{marginTop:20,minHeight:50,width:'100%',borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.white,fontWeight:'900'},
  topBar:{minHeight:46,paddingHorizontal:18,paddingTop:5,paddingBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kindBadge:{minHeight:21,paddingHorizontal:8,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#7CF2B9',fontSize:8,fontWeight:'900'},actions:{flexDirection:'row',gap:7,alignItems:'center'},iconButton:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#6E4BA5',position:'relative'},iconText:{color:colors.textPrimary,fontSize:18,fontWeight:'700'},bell:{fontSize:16},menuButton:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},menuText:{color:'#FFFFFF',fontSize:28,lineHeight:30,fontWeight:'900'},notificationBadge:{position:'absolute',right:-4,top:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:'#EF4444',borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},notificationBadgeText:{color:'#FFF',fontSize:8,fontWeight:'900'},plan:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},planFree:{backgroundColor:'#123D2C',borderColor:'#31C981'},planExhausted:{backgroundColor:'#4A171B',borderColor:'#F0525D'},planPaid:{backgroundColor:'#3D2860',borderColor:colors.primaryLight},planText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:10},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:62,height:62,borderRadius:31,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:25,fontWeight:'800'},identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:6},location:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},bio:{color:'#FFFFFF',fontSize:14,lineHeight:20,marginTop:9},ownerActions:{flexDirection:'row',alignItems:'center',gap:7,marginTop:10},ownerEditButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:'#21182F',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},ownerShareButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:'#123D2C',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},ownerSwipeButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},ownerActionText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},accountBanner:{marginTop:12,padding:12,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#6E4BA5'},accountBannerTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},accountBannerText:{color:'#FFFFFF',fontSize:11,lineHeight:16,marginTop:3},
  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800',marginTop:2},dnaScore:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{paddingHorizontal:10,paddingVertical:5,borderRadius:radius.pill,backgroundColor:colors.smartBadgeBg},chipText:{color:colors.smartBadgeText,fontSize:11,fontWeight:'700'},muted:{color:'#FFFFFF',fontSize:13,lineHeight:18},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},socialTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},musicLink:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},socialRow:{flexDirection:'row',justifyContent:'space-between',marginTop:12},socialButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#24163A',borderWidth:1,borderColor:'#8B5CF6'},socialButtonOn:{backgroundColor:'#5B3F8C',borderColor:'#C5ACFF'},
  tabs:{marginTop:16,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},indicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},
  keepList:{marginHorizontal:18,marginTop:10,gap:7},ownerKeepHint:{color:colors.textMuted,fontSize:9,lineHeight:13,marginBottom:2},keepRow:{flexDirection:'row',alignItems:'center',padding:8,borderRadius:13,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},keepCover:{width:48,height:48,borderRadius:9,backgroundColor:colors.backgroundCard},coverFallback:{alignItems:'center',justifyContent:'center'},keepCoverK:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},keepInfo:{flex:1,minWidth:0,marginLeft:10},keepTitleRow:{flexDirection:'row',alignItems:'center',gap:6},keepTitleBlock:{flex:1,minWidth:0},keepTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},keepArtist:{color:colors.textMuted,fontSize:10,marginTop:2},trackMetaRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:6,flexWrap:'wrap'},trackShare:{minHeight:25,paddingHorizontal:8,borderRadius:13,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},trackShareText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},originInline:{flexDirection:'row',alignItems:'center',gap:4},originLabel:{color:'#FFFFFF',fontSize:8,fontWeight:'800',letterSpacing:.2},originUserLink:{minHeight:23,paddingHorizontal:8,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},originUserText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},
  list:{marginHorizontal:18,marginTop:10},playlistBlock:{borderBottomWidth:1,borderBottomColor:colors.border,paddingBottom:6},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:10},note:{width:38,height:38,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},noteText:{color:colors.primaryLight,fontSize:18,fontWeight:'800'},playlistText:{flex:1,minWidth:0,marginLeft:12},listText:{color:colors.textPrimary,fontSize:14,fontWeight:'600'},playlistCount:{color:colors.textMuted,fontSize:10,marginTop:2},chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900',paddingHorizontal:7},playlistButtons:{flexDirection:'row',justifyContent:'flex-end',paddingBottom:6},playlistShareButton:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},playlistShareText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},playlistTracks:{paddingBottom:8,paddingLeft:6},empty:{alignItems:'center',paddingVertical:50,paddingHorizontal:20},emptyIcon:{color:colors.primaryLight,fontSize:28,marginBottom:10},
  modalBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,0.78)',justifyContent:'flex-end',alignItems:'center',padding:14},shareSheet:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},accountSheet:{maxHeight:'92%'},sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:'#51445F',alignSelf:'center',marginBottom:16},shareTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',textAlign:'center'},shareSubtitle:{color:colors.textMuted,fontSize:12,lineHeight:18,textAlign:'center',marginTop:6},linkPreview:{marginTop:14,padding:11,borderRadius:12,backgroundColor:'#0E0A14',borderWidth:1,borderColor:'#2B2038'},linkPreviewText:{color:'#BFA9FF',fontSize:11,textAlign:'center'},shareActionPrimary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},shareActionPrimaryText:{color:'#FFF',fontSize:12,fontWeight:'900'},shareAction:{minHeight:48,borderRadius:16,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',paddingHorizontal:14,justifyContent:'center',marginTop:9},shareActionText:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},shareActionHint:{color:colors.textMuted,fontSize:9,marginTop:2},cancelShare:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},cancelShareText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},
  qrShell:{width:'100%',maxWidth:520,maxHeight:'96%',alignItems:'center',backgroundColor:'#0E0A14',borderRadius:24,paddingTop:42,paddingHorizontal:4,paddingBottom:6,position:'relative'},qrCloseTop:{position:'absolute',right:10,top:8,width:34,height:34,borderRadius:17,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',zIndex:20},qrCloseTopText:{color:'#FFFFFF',fontSize:16,fontWeight:'900'},qrScroll:{width:'100%'},qrScrollContent:{alignItems:'center',paddingHorizontal:4,paddingBottom:8},qrCard:{width:'100%',backgroundColor:'#0E0A14',borderRadius:26,padding:20,borderWidth:1,borderColor:'#8B5CF6'},qrBrandRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},qrLogo:{color:'#FFFFFF',fontSize:27,fontWeight:'900',letterSpacing:6},qrDnaLabel:{color:'#B79CFF',fontSize:9,fontWeight:'900',letterSpacing:1.2},qrIdentityRow:{flexDirection:'row',alignItems:'center',marginTop:20},qrAvatar:{width:64,height:64,borderRadius:32,backgroundColor:'#241936',borderWidth:1,borderColor:'#8B5CF6'},qrAvatarFallback:{alignItems:'center',justifyContent:'center'},qrAvatarText:{color:'#B79CFF',fontSize:24,fontWeight:'900'},qrIdentityText:{flex:1,marginLeft:12},qrUsername:{color:'#FFFFFF',fontSize:22,fontWeight:'900'},qrKind:{color:'#B79CFF',fontSize:10,fontWeight:'900',marginTop:2},qrLocation:{color:'#E1D8EA',fontSize:10,marginTop:3},qrBio:{color:'#F4EFF8',fontSize:11,lineHeight:16,marginTop:14},qrGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:11},qrGenre:{backgroundColor:'#211831',borderRadius:999,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:'#6E4BA5'},qrGenreText:{color:'#D9C7FF',fontSize:9,fontWeight:'800'},qrBox:{alignSelf:'center',marginTop:18,padding:12,backgroundColor:'#0E0A14',borderRadius:16,borderWidth:2,borderColor:'#8B5CF6'},qrScan:{color:'#FFFFFF',fontSize:9,fontWeight:'900',letterSpacing:1,textAlign:'center',marginTop:11},qrTagline:{color:'#B79CFF',fontSize:12,fontWeight:'900',textAlign:'center',marginTop:5},qrWebsite:{color:'#FFFFFF',fontSize:8,fontWeight:'900',textAlign:'center',marginTop:8,letterSpacing:.25},screenshotHint:{color:'#FFFFFF',fontSize:10,lineHeight:15,textAlign:'center',marginTop:10,paddingHorizontal:10},
});
