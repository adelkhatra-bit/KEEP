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
import UsernameAccountForm from '../components/UsernameAccountForm';
import CreatorToolsPanel from '../components/CreatorToolsPanel';
import SocialPlatformIcon, { SOCIAL_BRAND_COLORS } from '../components/SocialPlatformIcon';
import TrackPreviewButton from '../components/TrackPreviewButton';
import MusicSwipeDeckModal from '../components/MusicSwipeDeckModal';

type ProfileTab = 'KEEP' | 'PLAYLISTS' | 'ARTISTS' | 'ALBUMS';
type SocialPlatform = SocialLink['platform'];
type AccountMode = 'create' | 'login';

const LOCAL_PROFILE_PLAYLIST_ID = 'keep-local-history';
const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'KEEP', label: 'KEEP' }, { key: 'PLAYLISTS', label: 'Playlists' }, { key: 'ARTISTS', label: 'Artistes' }, { key: 'ALBUMS', label: 'Albums' },
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
  const [creditRemaining, setCreditRemaining] = useState<number | null>(null);
  const [creditUnlimited, setCreditUnlimited] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileSwipeOpen, setProfileSwipeOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<AccountMode>('create');
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
  }, [navigation, providerId, providerPlaylists.length]);

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
  const publicKeptTracks = useMemo(() => keptTracks.filter((entry) => entry.visibility === 'PUBLIC'), [keptTracks]);
  const publicSwipeTracks = useMemo<CanonicalTrack[]>(() => publicKeptTracks.map((entry) => entry.track), [publicKeptTracks]);
  const publicTrackIds = useMemo(() => new Set(publicKeptTracks.map((entry) => entry.track.id)), [publicKeptTracks]);
  const dna = useMemo(() => {
    const decisions: DnaSourceDecision[] = publicKeptTracks.map((entry) => ({ artist: entry.track.artist, genres: entry.track.genres ?? [], decision: 'KEPT', createdAt: entry.detectedAt }));
    return computeMusicDNA(decisions);
  }, [publicKeptTracks]);
  const artists = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.artist))).slice(0, 18), [publicKeptTracks]);
  const albums = useMemo(() => Array.from(new Set(publicKeptTracks.map((entry) => entry.track.album).filter(Boolean) as string[])).slice(0, 18), [publicKeptTracks]);
  const displayPlaylists = useMemo<ProviderPlaylist[]>(() => {
    if (providerPlaylists.length) {
      return providerPlaylists.filter((playlist) => preferenceFor(playlistPreferences, providerId, playlist.id)?.isPublic === true).slice(0, 18);
    }
    const localPreference = preferenceFor(playlistPreferences, providerId, LOCAL_PROFILE_PLAYLIST_ID);
    if (!publicKeptTracks.length || localPreference?.isPublic !== true) return [];
    return [{ id: LOCAL_PROFILE_PLAYLIST_ID, name: localPreference.name || 'Mes KEEP', description: localPreference.description || 'Morceaux publics gardés sur cet appareil', trackCount: publicKeptTracks.length, isKeepManaged: true }];
  }, [playlistPreferences, providerId, providerPlaylists, publicKeptTracks.length]);

  if (!user) return <SafeAreaView style={s.container}><View style={s.center}><Text style={s.demoTitle}>Profil KEEP</Text><Text style={s.muted}>Aucun compte actif.</Text><TouchableOpacity style={s.primary} onPress={enterDemoMode}><Text style={s.primaryText}>ENTRER EN MODE DÉMO</Text></TouchableOpacity></View></SafeAreaView>;

  const publicLinks = user.socialLinks.filter((link) => link.visibility === 'PUBLIC');
  const publicProfileLink = buildPublicProfileLink(user.username);
  const identityGenres = user.favoriteGenres.length ? user.favoriteGenres.slice(0, 4) : dna.topGenres.slice(0, 4).map((g) => g.genre);
  const creditsExhausted = !creditUnlimited && creditRemaining === 0;
  const planLabel = planCode === 'FREE' && creditRemaining != null ? `FREE · ${creditRemaining}` : planCode;
  const planStyle = planCode === 'FREE' ? (creditsExhausted ? s.planExhausted : s.planFree) : s.planPaid;

  const openAccount = (mode: AccountMode = 'create') => {
    setShareOpen(false);
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

  const loadPlaylistTracks = async (playlist: ProviderPlaylist) => {
    if (playlist.id === LOCAL_PROFILE_PLAYLIST_ID) {
      const localTracks = publicKeptTracks.map((entry) => entry.track);
      setPlaylistTracks((current) => ({ ...current, [playlist.id]: localTracks }));
      return;
    }
    if (playlistTracks[playlist.id]) return;
    setLoadingPlaylistId(playlist.id);
    try {
      const session = await musicEngine.getSession();
      const tracks = await musicEngine.musicProvider.getPlaylistTracks(session, playlist.id);
      const visibleTracks = musicEngine.usesDemoMusicProvider ? tracks.filter((track) => publicTrackIds.has(track.id)) : tracks;
      setPlaylistTracks((current) => ({ ...current, [playlist.id]: visibleTracks }));
    } catch {
      Alert.alert('Playlist', 'Impossible de charger les morceaux de cette playlist pour le moment.');
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  const togglePlaylist = async (playlist: ProviderPlaylist) => {
    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }
    setExpandedPlaylistId(playlist.id);
    await loadPlaylistTracks(playlist);
  };

  const renderCompactTrack = (track: CanonicalTrack, key: string, sourceUsername?: string | null) => (
    <View key={key} style={s.keepRow}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.keepCover} /> : <View style={[s.keepCover, s.coverFallback]}><Text style={s.keepCoverK}>K</Text></View>}
      <View style={s.keepInfo}>
        <View style={s.keepTitleRow}>
          <View style={s.keepTitleBlock}><Text style={s.keepTitle} numberOfLines={1}>{track.title}</Text><Text style={s.keepArtist} numberOfLines={1}>{track.artist}</Text></View>
          <TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} compact />
        </View>
        <TouchableOpacity style={s.trackShare} onPress={() => void shareProfileTrack(user.username, track.title, track.artist)}><Text style={s.trackShareText}>↗ Partager</Text></TouchableOpacity>
        {sourceUsername !== undefined ? <Text style={[s.keepOrigin, sourceUsername ? s.keepOriginSocial : s.keepOriginFree]}>{sourceUsername ? `UTILISATEUR · @${sourceUsername}` : 'FREE'}</Text> : null}
      </View>
    </View>
  );

  const tabContent = () => {
    if (activeTab === 'KEEP') {
      if (!publicKeptTracks.length) return <Empty text="Tes morceaux publics apparaîtront ici. Les morceaux privés restent dans Mes musiques." />;
      return <View style={s.keepList}>{publicKeptTracks.slice(0,18).map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null))}</View>;
    }

    if (activeTab === 'PLAYLISTS') {
      if (!displayPlaylists.length) return <Empty text="Tes playlists apparaîtront ici." />;
      return <View style={s.list}>{displayPlaylists.map((playlist) => {
        const expanded = expandedPlaylistId === playlist.id;
        const tracks = playlistTracks[playlist.id] ?? [];
        return <View key={playlist.id} style={s.playlistBlock}>
          <TouchableOpacity style={s.listRow} onPress={() => void togglePlaylist(playlist)} accessibilityLabel={`Ouvrir ${playlist.name}`}>
            {playlist.coverUrl ? <Image source={{ uri: playlist.coverUrl }} style={s.note} /> : <View style={s.note}><Text style={s.noteText}>♪</Text></View>}
            <View style={s.playlistText}><Text style={s.listText} numberOfLines={1}>{playlist.name}</Text><Text style={s.playlistCount}>{playlist.trackCount} {playlist.trackCount > 1 ? 'morceaux' : 'morceau'}</Text></View>
            <Text style={s.chevron}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          <View style={s.playlistButtons}>
            <TouchableOpacity style={s.playlistShareButton} onPress={() => void sharePlaylist(playlist.id, playlist.name)}><Text style={s.playlistShareText}>↗ Partager</Text></TouchableOpacity>
          </View>
          {expanded ? <View style={s.playlistTracks}>{loadingPlaylistId === playlist.id ? <Text style={s.muted}>Chargement…</Text> : tracks.length ? tracks.map((track) => renderCompactTrack(track, `${playlist.id}-${track.id}`)) : <Text style={s.muted}>Aucun morceau dans cette playlist.</Text>}</View> : null}
        </View>;
      })}</View>;
    }

    const items = activeTab === 'ARTISTS' ? artists : albums;
    if (!items.length) return <Empty text={activeTab === 'ARTISTS' ? 'Tes artistes apparaîtront ici.' : 'Tes albums apparaîtront ici.'} />;
    return <View style={s.list}>{items.map((item) => <View key={item} style={s.listRow}><View style={s.note}><Text style={s.noteText}>♪</Text></View><Text style={s.listText} numberOfLines={1}>{item}</Text></View>)}</View>;
  };

  return <SafeAreaView style={s.container}>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.topBar}>
        <View style={s.topTitleRow}><Text style={s.topTitle}>Profil</Text><View style={s.kindBadge}><Text style={s.kindBadgeText}>{PROFILE_KIND_LABELS[user.kind]}</Text></View></View>
        <View style={s.actions}>
          <TouchableOpacity style={[s.plan, planStyle]} onPress={() => navigation.navigate('Offers')} accessibilityLabel="Offre et crédits"><Text style={s.planText}>{planLabel}</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Notifications')} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}>
            <Text style={s.bell}>🔔</Text>
            {unreadCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={openShare} accessibilityLabel="Partager le profil"><Text style={s.iconText}>↗</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Modifier le profil"><Text style={s.iconText}>⚙</Text></TouchableOpacity>
        </View>
      </View>

      <View style={s.hero}>
        <View style={s.identity}>
          {user.avatar ? <Image source={{uri:user.avatar}} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>K</Text></View>}
          <View style={s.identityText}>
            <Text style={s.username}>@{user.username}</Text>
            <View style={s.identityMeta}>
              <TouchableOpacity style={s.followPreview} onPress={() => Alert.alert('Aperçu du profil', 'C’est ici que les autres utilisateurs verront le bouton + Suivre.')} accessibilityLabel="Aperçu bouton suivre"><Text style={s.followPreviewText}>+ Suivre</Text></TouchableOpacity>
              <TouchableOpacity style={s.swipePreview} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity>
            </View>
            {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
          </View>
        </View>
        {accountRequired ? <TouchableOpacity style={s.accountBanner} onPress={() => openAccount('create')}><Text style={s.accountBannerTitle}>Créer mon compte KEEP</Text><Text style={s.accountBannerText}>Conserve ton profil avec ton identifiant KEEP et ton mot de passe. Aucun e-mail n’est obligatoire.</Text></TouchableOpacity> : null}
        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        <View style={s.stats}><Stat value={publicKeptTracks.length} label="KEEP"/><Stat value={user.followerCount} label="Abonnés"/><Stat value={user.followingCount} label="Abonnements"/></View>
      </View>

      <View style={s.dna}>
        <View style={s.dnaHeader}><View><Text style={s.dnaEyebrow}>KEEP DNA</Text><Text style={s.dnaTitle}>Ton empreinte musicale</Text></View><Text style={s.dnaScore}>{Math.round(dna.diversityScore*100)}%</Text></View>
        {dna.topGenres.length ? <View style={s.chips}>{dna.topGenres.slice(0,4).map((g)=><View key={g.genre} style={s.chip}><Text style={s.chipText}>{g.genre}</Text></View>)}</View> : <Text style={s.muted}>Commence une session KEEP pour construire ton ADN musical.</Text>}
      </View>

      <View style={s.socialHub}>
        <View style={s.socialHeader}><Text style={s.socialTitle}>Mes réseaux</Text><TouchableOpacity onPress={() => navigation.navigate('MusicConnections')}><Text style={s.musicLink}>♫ Services musicaux</Text></TouchableOpacity></View>
        <View style={s.socialRow}>{SOCIALS.map((item) => {
          const configured = !!publicLinks.find((link) => link.platform === item.platform && link.url.trim());
          return <TouchableOpacity key={item.platform} style={[s.socialButton, configured && s.socialButtonOn]} onPress={() => openSocial(item.platform)} accessibilityLabel={item.label}><SocialPlatformIcon platform={item.platform} size={22} color={configured ? SOCIAL_BRAND_COLORS[item.platform] ?? '#FFFFFF' : '#AFA6BD'}/></TouchableOpacity>;
        })}</View>
      </View>

      <CreatorToolsPanel navigation={navigation} />

      <View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} style={s.tab} onPress={()=>setActiveTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>
      {tabContent()}
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

    <Modal visible={accountOpen} transparent animationType="fade" onRequestClose={() => setAccountOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <UsernameAccountForm initialMode={accountMode} onSuccess={() => setAccountOpen(false)} />
          <TouchableOpacity style={s.cancelShare} onPress={() => setAccountOpen(false)}><Text style={s.cancelShareText}>Plus tard</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.shareSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.shareTitle}>Partager mon profil KEEP</Text>
          <Text style={s.shareSubtitle}>Le lien ouvre directement ton profil public. KEEP n’envoie aucun e-mail à ta place.</Text>
          <View style={s.linkPreview}><Text style={s.linkPreviewText} numberOfLines={2}>{publicProfileLink}</Text></View>
          <TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>PARTAGER LE LIEN</Text></TouchableOpacity>
          <TouchableOpacity style={s.shareAction} onPress={shareEmail}><Text style={s.shareActionText}>✉  Partager par e-mail</Text><Text style={s.shareActionHint}>Ton application Mail s’ouvre, tu choisis les destinataires</Text></TouchableOpacity>
          <TouchableOpacity style={s.shareAction} onPress={showQr}><Text style={s.shareActionText}>▦  Mon QR KEEP</Text><Text style={s.shareActionHint}>Carte d’identité musicale prête pour une story</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setShareOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.qrShell}>
          <View style={s.qrCard}>
            <View style={s.qrBrandRow}><Text style={s.qrLogo}>KEEP</Text><Text style={s.qrDnaLabel}>DIGITAL DNA</Text></View>
            <View style={s.qrIdentityRow}>
              {user.avatar ? <Image source={{uri:user.avatar}} style={s.qrAvatar}/> : <View style={[s.qrAvatar,s.qrAvatarFallback]}><Text style={s.qrAvatarText}>K</Text></View>}
              <View style={s.qrIdentityText}><Text style={s.qrUsername}>@{user.username}</Text><Text style={s.qrKind}>{PROFILE_KIND_LABELS[user.kind]}</Text>{(user.city || user.countryCode) ? <Text style={s.qrLocation}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}</View>
            </View>
            {user.bio ? <Text style={s.qrBio} numberOfLines={3}>{user.bio}</Text> : <Text style={s.qrBio}>Mon univers musical, en un scan.</Text>}
            {identityGenres.length ? <View style={s.qrGenres}>{identityGenres.map((genre) => <View key={genre} style={s.qrGenre}><Text style={s.qrGenreText}>{genre}</Text></View>)}</View> : null}
            <View style={s.qrBox}><QRCode value={publicProfileLink} size={164} color="#0E0A14" backgroundColor="#FFFFFF" /></View>
            <Text style={s.qrScan}>SCAN POUR DÉCOUVRIR MON PROFIL</Text>
            <Text style={s.qrTagline}>Tes goûts te ressemblent.</Text>
          </View>
          <Text style={s.screenshotHint}>Fais une capture d’écran : la carte est pensée pour être partagée en story, message ou affichage.</Text>
          <TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>PARTAGER MON PROFIL</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setQrOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function Stat({value,label}:{value:number;label:string}){return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>}
function Empty({text}:{text:string}){return <View style={s.empty}><Text style={s.emptyIcon}>♪</Text><Text style={s.muted}>{text}</Text></View>}

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:colors.background},content:{paddingBottom:spacing.xxl},center:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:24},demoTitle:{...typography.h2,color:colors.textPrimary,marginBottom:8},primary:{marginTop:20,minHeight:50,width:'100%',borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.white,fontWeight:'900'},
  topBar:{paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},topTitleRow:{flexDirection:'row',alignItems:'center',gap:7},topTitle:{...typography.h2,color:colors.textPrimary},kindBadge:{minHeight:21,paddingHorizontal:7,borderRadius:11,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#BFA9FF',fontSize:8,fontWeight:'900'},actions:{flexDirection:'row',gap:6,alignItems:'center'},iconButton:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border,position:'relative'},iconText:{color:colors.textPrimary,fontSize:18,fontWeight:'700'},bell:{fontSize:17},notificationBadge:{position:'absolute',right:-4,top:-5,minWidth:18,height:18,borderRadius:9,paddingHorizontal:4,backgroundColor:'#EF4444',borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},notificationBadgeText:{color:'#FFF',fontSize:8,fontWeight:'900'},plan:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},planFree:{backgroundColor:'#123D2C',borderColor:'#31C981'},planExhausted:{backgroundColor:'#4A171B',borderColor:'#F0525D'},planPaid:{backgroundColor:'#3D2860',borderColor:colors.primaryLight},planText:{color:'#FFF',fontSize:9,fontWeight:'900'},
  hero:{paddingHorizontal:18,paddingBottom:12},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:68,height:68,borderRadius:34,backgroundColor:colors.backgroundCard},avatarFallback:{alignItems:'center',justifyContent:'center'},avatarText:{color:colors.primaryLight,fontSize:25,fontWeight:'800'},identityText:{flex:1,marginLeft:12},username:{...typography.h2,color:colors.textPrimary},identityMeta:{flexDirection:'row',alignItems:'center',gap:6,marginTop:5,flexWrap:'wrap'},followPreview:{minHeight:28,paddingHorizontal:11,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},followPreviewText:{color:'#FFF',fontSize:10,fontWeight:'900'},swipePreview:{minHeight:28,paddingHorizontal:11,borderRadius:14,backgroundColor:'#21182F',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#D9C7FF',fontSize:10,fontWeight:'900'},location:{color:colors.textMuted,fontSize:13,marginTop:5},bio:{color:colors.textSecondary,fontSize:14,lineHeight:20,marginTop:12},accountBanner:{marginTop:12,padding:12,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#6E4BA5'},accountBannerTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},accountBannerText:{color:'#B9AEC6',fontSize:11,lineHeight:16,marginTop:3},stats:{marginTop:16,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:12},statValue:{color:colors.textPrimary,fontSize:19,fontWeight:'800'},statLabel:{color:colors.textMuted,fontSize:11,marginTop:3},
  dna:{marginHorizontal:18,marginTop:8,padding:12,borderRadius:radius.lg,backgroundColor:colors.backgroundElevated,borderWidth:1,borderColor:colors.border},dnaHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dnaEyebrow:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:1},dnaTitle:{color:colors.textPrimary,fontSize:14,fontWeight:'800',marginTop:2},dnaScore:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{paddingHorizontal:10,paddingVertical:5,borderRadius:radius.pill,backgroundColor:colors.smartBadgeBg},chipText:{color:colors.smartBadgeText,fontSize:11,fontWeight:'700'},muted:{color:colors.textMuted,fontSize:12,lineHeight:17},
  socialHub:{marginHorizontal:18,marginTop:10,padding:12,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#3F3154'},socialHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},socialTitle:{color:colors.textPrimary,fontSize:13,fontWeight:'900'},musicLink:{color:colors.primaryLight,fontSize:11,fontWeight:'800'},socialRow:{flexDirection:'row',justifyContent:'space-between',marginTop:12},socialButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E'},socialButtonOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},
  tabs:{marginTop:16,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},tab:{flex:1,alignItems:'center',paddingTop:8,paddingBottom:12,position:'relative'},tabText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},tabTextOn:{color:colors.textPrimary},indicator:{position:'absolute',bottom:-1,height:2,width:'70%',backgroundColor:colors.primaryLight,borderRadius:2},
  keepList:{marginHorizontal:18,marginTop:10,gap:7},keepRow:{flexDirection:'row',alignItems:'center',padding:8,borderRadius:13,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},keepCover:{width:48,height:48,borderRadius:9,backgroundColor:colors.backgroundCard},coverFallback:{alignItems:'center',justifyContent:'center'},keepCoverK:{color:colors.primaryLight,fontSize:18,fontWeight:'900'},keepInfo:{flex:1,minWidth:0,marginLeft:10},keepTitleRow:{flexDirection:'row',alignItems:'center',gap:6},keepTitleBlock:{flex:1,minWidth:0},keepTitle:{color:colors.textPrimary,fontSize:12,fontWeight:'800'},keepArtist:{color:colors.textMuted,fontSize:10,marginTop:2},trackShare:{alignSelf:'flex-start',marginTop:6,minHeight:25,paddingHorizontal:8,borderRadius:13,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center'},trackShareText:{color:colors.primaryLight,fontSize:9,fontWeight:'800'},keepOrigin:{alignSelf:'flex-start',marginTop:5,fontSize:8,fontWeight:'900',letterSpacing:.35},keepOriginFree:{color:'#8E8798'},keepOriginSocial:{color:'#CBB6FF'},
  list:{marginHorizontal:18,marginTop:10},playlistBlock:{borderBottomWidth:1,borderBottomColor:colors.border,paddingBottom:6},listRow:{flexDirection:'row',alignItems:'center',paddingVertical:10},note:{width:38,height:38,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundCard},noteText:{color:colors.primaryLight,fontSize:18,fontWeight:'800'},playlistText:{flex:1,minWidth:0,marginLeft:12},listText:{color:colors.textPrimary,fontSize:14,fontWeight:'600'},playlistCount:{color:colors.textMuted,fontSize:10,marginTop:2},chevron:{color:colors.primaryLight,fontSize:16,fontWeight:'900',paddingHorizontal:7},playlistButtons:{flexDirection:'row',justifyContent:'flex-end',paddingBottom:6},playlistShareButton:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center'},playlistShareText:{color:colors.primaryLight,fontSize:9,fontWeight:'800'},playlistTracks:{paddingBottom:8,paddingLeft:6},empty:{alignItems:'center',paddingVertical:50,paddingHorizontal:20},emptyIcon:{color:colors.primaryLight,fontSize:28,marginBottom:10},
  modalBackdrop:{flex:1,backgroundColor:'rgba(3,2,7,0.78)',justifyContent:'flex-end',alignItems:'center',padding:14},shareSheet:{width:'100%',maxWidth:520,backgroundColor:'#151020',borderRadius:26,borderWidth:1,borderColor:'#3F3154',padding:18,paddingBottom:24},sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:'#51445F',alignSelf:'center',marginBottom:16},shareTitle:{color:colors.textPrimary,fontSize:20,fontWeight:'900',textAlign:'center'},shareSubtitle:{color:colors.textMuted,fontSize:12,lineHeight:18,textAlign:'center',marginTop:6},linkPreview:{marginTop:14,padding:11,borderRadius:12,backgroundColor:'#0E0A14',borderWidth:1,borderColor:'#2B2038'},linkPreviewText:{color:'#BFA9FF',fontSize:11,textAlign:'center'},shareActionPrimary:{minHeight:50,borderRadius:25,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:14},shareActionPrimaryText:{color:'#FFF',fontSize:12,fontWeight:'900'},shareAction:{minHeight:48,borderRadius:16,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',paddingHorizontal:14,justifyContent:'center',marginTop:9},shareActionText:{color:colors.textPrimary,fontSize:13,fontWeight:'800'},shareActionHint:{color:colors.textMuted,fontSize:9,marginTop:2},cancelShare:{minHeight:42,alignItems:'center',justifyContent:'center',marginTop:8},cancelShareText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},
  qrShell:{width:'100%',maxWidth:520,alignItems:'center'},qrCard:{width:'100%',backgroundColor:'#F7F4FF',borderRadius:26,padding:20},qrBrandRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},qrLogo:{color:'#171020',fontSize:27,fontWeight:'900',letterSpacing:6},qrDnaLabel:{color:'#6A4BA5',fontSize:9,fontWeight:'900',letterSpacing:1.2},qrIdentityRow:{flexDirection:'row',alignItems:'center',marginTop:20},qrAvatar:{width:64,height:64,borderRadius:32,backgroundColor:'#E7DFFF'},qrAvatarFallback:{alignItems:'center',justifyContent:'center'},qrAvatarText:{color:'#6A4BA5',fontSize:24,fontWeight:'900'},qrIdentityText:{flex:1,marginLeft:12},qrUsername:{color:'#171020',fontSize:22,fontWeight:'900'},qrKind:{color:'#6A4BA5',fontSize:10,fontWeight:'900',marginTop:2},qrLocation:{color:'#6B6377',fontSize:10,marginTop:3},qrBio:{color:'#4D4655',fontSize:11,lineHeight:16,marginTop:14},qrGenres:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:11},qrGenre:{backgroundColor:'#E9E0FF',borderRadius:999,paddingHorizontal:8,paddingVertical:4},qrGenreText:{color:'#5B3E94',fontSize:9,fontWeight:'800'},qrBox:{alignSelf:'center',marginTop:18,padding:12,backgroundColor:'#FFF',borderRadius:16},qrScan:{color:'#171020',fontSize:9,fontWeight:'900',letterSpacing:1,textAlign:'center',marginTop:11},qrTagline:{color:'#6A4BA5',fontSize:12,fontWeight:'900',textAlign:'center',marginTop:5},screenshotHint:{color:'#A99EBA',fontSize:10,lineHeight:15,textAlign:'center',marginTop:10,paddingHorizontal:10},
});